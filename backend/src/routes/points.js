const { z } = require('zod')
const { query, withTransaction } = require('../db/pool')
const { authRequired } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')

const router = require('express').Router()

const purchaseSchema = z.object({
  amount: z.number().int().min(10).max(50000)
})

router.get(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    const rows = await query(`SELECT points FROM users WHERE id = :id LIMIT 1`, { id: req.user.id })
    ok(res, { points: rows[0]?.points ?? 0 })
  })
)

router.get(
  '/ledger',
  authRequired,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 30)))
    const offset = (page - 1) * pageSize
    const list = await query(
      `SELECT id, delta, balance, reason, ref_type, ref_id, created_at
       FROM points_ledger
       WHERE user_id = :uid
       ORDER BY created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      { uid: req.user.id }
    )
    ok(res, {
      list: list.map((r) => ({
        id: r.id,
        delta: r.delta,
        balance: r.balance,
        reason: r.reason,
        refType: r.ref_type,
        refId: r.ref_id,
        createdAt: r.created_at
      })),
      page,
      pageSize
    })
  })
)

/** 模拟购买积分（无真实支付） */
router.post(
  '/purchase',
  authRequired,
  asyncHandler(async (req, res) => {
    const parsed = purchaseSchema.safeParse(req.body)
    if (!parsed.success) throw new HttpError(400, '参数错误', parsed.error.flatten())
    const { amount } = parsed.data

    const data = await withTransaction(async (conn) => {
      const [users] = await conn.execute(
        `SELECT id, points FROM users WHERE id = :uid LIMIT 1 FOR UPDATE`,
        { uid: req.user.id }
      )
      const user = users[0]
      if (!user) throw new HttpError(404, '用户不存在')
      const balance = user.points + amount
      await conn.execute(`UPDATE users SET points = :balance WHERE id = :uid`, {
        balance,
        uid: req.user.id
      })
      await conn.execute(
        `INSERT INTO points_ledger (user_id, delta, balance, reason, ref_type, ref_id)
         VALUES (:uid, :delta, :balance, '购买积分', 'purchase', NULL)`,
        { uid: req.user.id, delta: amount, balance }
      )
      return { points: balance, added: amount }
    })

    ok(res, data, '购买成功')
  })
)

module.exports = router
