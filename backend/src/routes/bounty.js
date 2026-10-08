const { z } = require('zod')
const { query, withTransaction } = require('../db/pool')
const { authRequired, optionalAuth } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')
const { checkAndAwardBadges } = require('../services/badges')

const router = require('express').Router()

const createBountySchema = z.object({
  title: z.string().min(2).max(120),
  content: z.string().min(1).max(20000),
  rewardPoints: z.number().int().min(1).max(50000)
})

const createAnswerSchema = z.object({
  content: z.string().min(1).max(10000)
})

function mapBounty(b) {
  return {
    id: b.id,
    title: b.title,
    content: b.content,
    rewardPoints: b.reward_points,
    status: b.status,
    adoptedAnswerId: b.adopted_answer_id,
    answerCount: b.answer_count,
    viewCount: b.view_count,
    createdAt: b.created_at,
    asker: {
      id: b.asker_id,
      name: b.asker_name,
      avatarChar: b.asker_avatar,
      role: b.asker_role
    }
  }
}

/** GET /api/bounty 列表 */
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)))
    const status = String(req.query.status || 'open')
    const offset = (page - 1) * pageSize

    const where = []
    const params = {}
    if (status !== 'all') {
      where.push('b.status = :st')
      params.st = status
    }

    const sql = `
      SELECT b.id, b.title, b.content, b.reward_points, b.status, b.adopted_answer_id,
             b.answer_count, b.view_count, b.created_at,
             u.id AS asker_id, u.display_name AS asker_name, u.avatar_char AS asker_avatar, u.role AS asker_role
      FROM bounties b
      JOIN users u ON u.id = b.asker_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY b.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}`

    const countSql = `SELECT COUNT(*) AS total FROM bounties b ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`

    const [list, countRows] = await Promise.all([query(sql, params), query(countSql, params)])
    ok(res, {
      list: list.map(mapBounty),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

/** GET /api/bounty/:id 详情（含回答） */
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(
      `SELECT b.*, u.id AS asker_id, u.display_name AS asker_name, u.avatar_char AS asker_avatar, u.role AS asker_role
       FROM bounties b JOIN users u ON u.id = b.asker_id WHERE b.id = :id LIMIT 1`,
      { id }
    )
    if (!rows.length) throw new HttpError(404, '悬赏不存在')
    await query('UPDATE bounties SET view_count = view_count + 1 WHERE id = :id', { id })

    const answers = await query(
      `SELECT a.id, a.content, a.is_adopted, a.like_count, a.created_at,
              u.id AS answerer_id, u.display_name AS answerer_name, u.avatar_char AS answerer_avatar, u.role AS answerer_role
       FROM bounty_answers a JOIN users u ON u.id = a.answerer_id
       WHERE a.bounty_id = :id ORDER BY a.is_adopted DESC, a.created_at ASC LIMIT 200`,
      { id }
    )
    ok(res, {
      ...mapBounty(rows[0]),
      answers: answers.map((a) => ({
        id: a.id,
        content: a.content,
        isAdopted: !!a.is_adopted,
        likeCount: a.like_count,
        createdAt: a.created_at,
        answerer: { id: a.answerer_id, name: a.answerer_name, avatarChar: a.answerer_avatar, role: a.answerer_role }
      }))
    })
  })
)

/** POST /api/bounty 发布悬赏（扣积分冻结） */
router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const body = createBountySchema.parse(req.body)
    const { rewardPoints } = body

    const data = await withTransaction(async (conn) => {
      const [users] = await conn.execute(
        `SELECT id, points FROM users WHERE id = :uid LIMIT 1 FOR UPDATE`,
        { uid: req.user.id }
      )
      const user = users[0]
      if (!user) throw new HttpError(404, '用户不存在')
      if (user.points < rewardPoints) {
        throw new HttpError(400, `积分不足，当前余额 ${user.points}，需要 ${rewardPoints}`)
      }
      const balance = user.points - rewardPoints
      await conn.execute(`UPDATE users SET points = :balance WHERE id = :uid`, { balance, uid: req.user.id })
      await conn.execute(
        `INSERT INTO points_ledger (user_id, delta, balance, reason, ref_type, ref_id)
         VALUES (:uid, :delta, :balance, '发布悬赏冻结', 'bounty_freeze', NULL)`,
        { uid: req.user.id, delta: -rewardPoints, balance }
      )
      const [r] = await conn.execute(
        `INSERT INTO bounties (asker_id, title, content, reward_points) VALUES (:uid, :title, :content, :reward)`,
        { uid: req.user.id, title: body.title, content: body.content, reward: rewardPoints }
      )
      return { id: r.insertId, points: balance }
    })

    ok(res, data, '悬赏发布成功，赏金已冻结')
  })
)

/** POST /api/bounty/:id/answers 提交回答 */
router.post(
  '/:id/answers',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const body = createAnswerSchema.parse(req.body)
    const rows = await query(`SELECT id, asker_id, status FROM bounties WHERE id = :id LIMIT 1`, { id })
    if (!rows.length) throw new HttpError(404, '悬赏不存在')
    if (rows[0].status !== 'open') throw new HttpError(400, '该悬赏已结束')
    if (rows[0].asker_id === req.user.id) throw new HttpError(400, '不能回答自己的悬赏')

    const result = await withTransaction(async (conn) => {
      const [r] = await conn.execute(
        `INSERT INTO bounty_answers (bounty_id, answerer_id, content) VALUES (:bid, :uid, :content)`,
        { bid: id, uid: req.user.id, content: body.content }
      )
      await conn.execute('UPDATE bounties SET answer_count = answer_count + 1 WHERE id = :id', { id })
      return r
    })
    ok(res, { id: result.insertId }, '回答成功')
  })
)

/** POST /api/bounty/:id/adopt 采纳回答（赏金转给回答者） */
router.post(
  '/:id/adopt',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const ansId = Number(req.body.answerId)
    if (!ansId) throw new HttpError(400, '请指定要采纳的回答')

    const data = await withTransaction(async (conn) => {
      const [bs] = await conn.execute(
        `SELECT id, asker_id, reward_points, status, adopted_answer_id FROM bounties WHERE id = :id LIMIT 1 FOR UPDATE`,
        { id }
      )
      const bounty = bs[0]
      if (!bounty) throw new HttpError(404, '悬赏不存在')
      if (bounty.asker_id !== req.user.id) throw new HttpError(403, '只有提问者可以采纳')
      if (bounty.status !== 'open') throw new HttpError(400, '该悬赏已结束')

      const [ans] = await conn.execute(
        `SELECT id, answerer_id FROM bounty_answers WHERE id = :aid AND bounty_id = :bid LIMIT 1 FOR UPDATE`,
        { aid: ansId, bid: id }
      )
      const answer = ans[0]
      if (!answer) throw new HttpError(404, '回答不存在')

      // 赏金转给回答者
      const [recs] = await conn.execute(
        `SELECT id, points FROM users WHERE id = :uid LIMIT 1 FOR UPDATE`,
        { uid: answer.answerer_id }
      )
      const receiver = recs[0]
      const newBalance = receiver.points + bounty.reward_points
      await conn.execute(`UPDATE users SET points = :balance WHERE id = :uid`, {
        balance: newBalance,
        uid: answer.answerer_id
      })
      await conn.execute(
        `INSERT INTO points_ledger (user_id, delta, balance, reason, ref_type, ref_id)
         VALUES (:uid, :delta, :balance, '悬赏被采纳', 'bounty_reward', :bid)`,
        { uid: answer.answerer_id, delta: bounty.reward_points, balance: newBalance, bid: id }
      )

      // 更新悬赏与回答状态
      await conn.execute(
        `UPDATE bounties SET status = 'adopted', adopted_answer_id = :aid WHERE id = :id`,
        { aid: ansId, id }
      )
      await conn.execute(`UPDATE bounty_answers SET is_adopted = 1 WHERE id = :aid`, { aid: ansId })

      return { adoptedAnswerId: ansId, rewarded: bounty.reward_points, receiverBalance: newBalance, askerId: bounty.asker_id }
    })

    checkAndAwardBadges(data.askerId).catch(() => {})
    ok(res, data, '已采纳，赏金已发放给回答者')
  })
)

/** POST /api/bounty/:id/close 关闭悬赏（未采纳时退回积分） */
router.post(
  '/:id/close',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const data = await withTransaction(async (conn) => {
      const [bs] = await conn.execute(
        `SELECT id, asker_id, reward_points, status, adopted_answer_id FROM bounties WHERE id = :id LIMIT 1 FOR UPDATE`,
        { id }
      )
      const bounty = bs[0]
      if (!bounty) throw new HttpError(404, '悬赏不存在')
      if (bounty.asker_id !== req.user.id && req.user.role !== 'admin') {
        throw new HttpError(403, '只有提问者可以关闭')
      }
      if (bounty.status !== 'open') throw new HttpError(400, '该悬赏已结束')

      // 未被采纳，退回赏金
      let refunded = 0
      if (!bounty.adopted_answer_id) {
        const [us] = await conn.execute(
          `SELECT id, points FROM users WHERE id = :uid LIMIT 1 FOR UPDATE`,
          { uid: bounty.asker_id }
        )
        const u = us[0]
        const newBalance = u.points + bounty.reward_points
        await conn.execute(`UPDATE users SET points = :balance WHERE id = :uid`, {
          balance: newBalance,
          uid: bounty.asker_id
        })
        await conn.execute(
          `INSERT INTO points_ledger (user_id, delta, balance, reason, ref_type, ref_id)
           VALUES (:uid, :delta, :balance, '悬赏关闭退回', 'bounty_refund', :bid)`,
          { uid: bounty.asker_id, delta: bounty.reward_points, balance: newBalance, bid: id }
        )
        refunded = bounty.reward_points
      }
      await conn.execute(`UPDATE bounties SET status = 'closed' WHERE id = :id`, { id })
      return { refunded }
    })

    ok(res, data, '悬赏已关闭')
  })
)

module.exports = router
