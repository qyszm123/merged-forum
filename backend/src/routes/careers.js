const { z } = require('zod')
const { query, withTransaction } = require('../db/pool')
const { authRequired, optionalAuth } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')

const router = require('express').Router()

/** GET /api/careers 职业列表（含当前用户加入状态） */
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const uid = req.user?.id || 0
    const rows = await query(
      `SELECT c.*,
        (SELECT 1 FROM user_careers uc WHERE uc.career_id = c.id AND uc.user_id = :uid) AS joined,
        (SELECT completed_at FROM user_careers uc WHERE uc.career_id = c.id AND uc.user_id = :uid) AS completed,
        (SELECT COUNT(*) FROM career_skills cs WHERE cs.career_id = c.id) AS skill_count
      FROM careers c WHERE c.is_active = 1 ORDER BY c.id`,
      { uid }
    )
    ok(res, {
      list: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        icon: r.icon,
        color: r.color,
        requiredPoints: r.required_points,
        skillCount: Number(r.skill_count || 0),
        joined: !!r.joined,
        completed: !!r.completed
      }))
    })
  })
)

/** GET /api/careers/me 我加入的职业 */
router.get(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT uc.joined_at, uc.completed_at, c.id, c.name, c.description, c.icon, c.color,
        (SELECT COUNT(*) FROM career_skills cs WHERE cs.career_id = c.id) AS total,
        (SELECT COUNT(*) FROM user_career_skills ucs
           INNER JOIN career_skills cs ON cs.id = ucs.skill_id
           WHERE cs.career_id = c.id AND ucs.user_id = uc.user_id) AS done
      FROM user_careers uc
      INNER JOIN careers c ON c.id = uc.career_id
      WHERE uc.user_id = :uid ORDER BY uc.joined_at DESC`,
      { uid: req.user.id }
    )
    ok(res, {
      list: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        icon: r.icon,
        color: r.color,
        joinedAt: r.joined_at,
        completedAt: r.completed_at,
        totalSkills: Number(r.total || 0),
        doneSkills: Number(r.done || 0)
      }))
    })
  })
)

/** GET /api/careers/:id 详情 + 技能（含完成状态） */
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const uid = req.user?.id || 0
    const cs = await query(`SELECT * FROM careers WHERE id = :id LIMIT 1`, { id })
    if (!cs.length) throw new HttpError(404, '职业不存在')
    const c = cs[0]
    const skills = await query(
      `SELECT s.*,
        (SELECT 1 FROM user_career_skills ucs WHERE ucs.skill_id = s.id AND ucs.user_id = :uid) AS done
      FROM career_skills s WHERE s.career_id = :id ORDER BY s.order_num, s.id`,
      { id, uid }
    )
    const uc = await query(
      `SELECT joined_at, completed_at FROM user_careers WHERE user_id = :uid AND career_id = :id LIMIT 1`,
      { uid, id }
    )
    ok(res, {
      career: {
        id: c.id,
        name: c.name,
        description: c.description,
        icon: c.icon,
        color: c.color,
        requiredPoints: c.required_points
      },
      skills: skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        icon: s.icon,
        knowledge: s.knowledge_content,
        order: s.order_num,
        done: !!s.done
      })),
      progress: uc[0]
        ? {
            joinedAt: uc[0].joined_at,
            completedAt: uc[0].completed_at,
            doneSkills: skills.filter((s) => s.done).length,
            totalSkills: skills.length
          }
        : null
    })
  })
)

/** POST /api/careers/:id/join 加入职业 */
router.post(
  '/:id/join',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const cs = await query(`SELECT id FROM careers WHERE id = :id AND is_active = 1 LIMIT 1`, { id })
    if (!cs.length) throw new HttpError(404, '职业不存在')
    await query(
      `INSERT IGNORE INTO user_careers (user_id, career_id) VALUES (:uid, :id)`,
      { uid: req.user.id, id }
    )
    ok(res, { id }, '已加入职业，开始学习吧')
  })
)

/** POST /api/careers/:id/skills/:sid/complete 完成技能（全部完成则职业完成+获得身份） */
router.post(
  '/:id/skills/:sid/complete',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const sid = Number(req.params.sid)
    const rows = await query(
      `SELECT s.id FROM career_skills s WHERE s.id = :sid AND s.career_id = :id LIMIT 1`,
      { sid, id }
    )
    if (!rows.length) throw new HttpError(404, '技能不存在')
    const uc = await query(
      `SELECT completed_at FROM user_careers WHERE user_id = :uid AND career_id = :id LIMIT 1`,
      { uid: req.user.id, id }
    )
    if (!uc.length) throw new HttpError(400, '请先加入该职业')
    if (uc[0].completed_at) throw new HttpError(400, '该职业已完成')

    let allDone = false
    let doneCount = 0
    let totalCount = 0
    await withTransaction(async (conn) => {
      await conn.execute(
        `INSERT IGNORE INTO user_career_skills (user_id, skill_id) VALUES (?, ?)`,
        [req.user.id, sid]
      )
      const [[tRow]] = await conn.execute(
        `SELECT COUNT(*) AS t FROM career_skills WHERE career_id = ?`,
        [id]
      )
      const [[dRow]] = await conn.execute(
        `SELECT COUNT(*) AS d FROM user_career_skills ucs
         INNER JOIN career_skills cs ON cs.id = ucs.skill_id
         WHERE cs.career_id = ? AND ucs.user_id = ?`,
        [id, req.user.id]
      )
      totalCount = Number(tRow.t)
      doneCount = Number(dRow.d)
      allDone = totalCount > 0 && doneCount >= totalCount
    })
    ok(
      res,
      { skillId: sid, allDone, doneSkills: doneCount, totalSkills: totalCount },
      allDone ? '技能已全部完成，请参加结业考试获得身份认证' : `技能已完成（${doneCount}/${totalCount}）`
    )
  })
)

/* ============ 结业考试（基于职业技能基础知识出题） ============ */

function parseJsonOptions(raw) {
  if (raw == null) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

const PASS_SCORE = 60

/** POST /api/careers/:id/exam/start 开始考试（需完成全部技能） */
router.post(
  '/:id/exam/start',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const cs = await query(`SELECT id, name FROM careers WHERE id = :id LIMIT 1`, { id })
    if (!cs.length) throw new HttpError(404, '职业不存在')
    const uc = await query(
      `SELECT completed_at FROM user_careers WHERE user_id = :uid AND career_id = :id LIMIT 1`,
      { uid: req.user.id, id }
    )
    if (!uc.length) throw new HttpError(400, '请先加入该职业')
    if (uc[0].completed_at) throw new HttpError(400, '该职业已完成，无需再考试')

    const counts = await query(
      `SELECT
        (SELECT COUNT(*) FROM career_skills WHERE career_id = :id) AS total,
        (SELECT COUNT(*) FROM user_career_skills ucs
           INNER JOIN career_skills cs ON cs.id = ucs.skill_id
           WHERE cs.career_id = :id AND ucs.user_id = :uid) AS done`,
      { id, uid: req.user.id }
    )
    const total = Number(counts[0].total)
    const done = Number(counts[0].done)
    if (total === 0) throw new HttpError(400, '该职业暂无技能')
    if (done < total) throw new HttpError(400, `还有 ${total - done} 项技能未完成，请先学完全部技能`)

    const questions = await query(
      `SELECT id, question, options FROM career_questions WHERE career_id = :id ORDER BY id`,
      { id }
    )
    if (!questions.length) throw new HttpError(400, '该职业暂无考试题，请联系管理员')

    ok(res, {
      careerName: cs[0].name,
      passScore: PASS_SCORE,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: parseJsonOptions(q.options)
      }))
    })
  })
)

const examSubmitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.number().int().positive(),
        answer: z.enum(['A', 'B', 'C', 'D'])
      })
    )
    .min(1)
    .max(50)
})

/** POST /api/careers/:id/exam/submit 交卷（≥60分通过并授予身份） */
router.post(
  '/:id/exam/submit',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const body = examSubmitSchema.parse(req.body)
    const cs = await query(`SELECT id, name FROM careers WHERE id = :id LIMIT 1`, { id })
    if (!cs.length) throw new HttpError(404, '职业不存在')
    const uc = await query(
      `SELECT completed_at FROM user_careers WHERE user_id = :uid AND career_id = :id LIMIT 1`,
      { uid: req.user.id, id }
    )
    if (!uc.length) throw new HttpError(400, '请先加入该职业')
    if (uc[0].completed_at) throw new HttpError(400, '该职业已完成，无需再考试')

    const answerMap = new Map(body.answers.map((a) => [a.questionId, a.answer]))
    const questions = await query(
      `SELECT id, question, answer, explanation FROM career_questions WHERE career_id = :id ORDER BY id`,
      { id }
    )
    if (!questions.length) throw new HttpError(400, '该职业暂无考试题')

    const results = questions.map((q, idx) => {
      const mine = answerMap.get(q.id) || null
      return {
        index: idx + 1,
        questionId: q.id,
        question: q.question,
        yourAnswer: mine,
        correctAnswer: q.answer,
        correct: mine === q.answer,
        explanation: q.explanation
      }
    })
    const correctCount = results.filter((r) => r.correct).length
    const score = Math.round((correctCount / questions.length) * 100)
    const passed = score >= PASS_SCORE

    await withTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO career_exam_attempts (user_id, career_id, score, passed, answers) VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, id, score, passed ? 1 : 0, JSON.stringify(body.answers)]
      )
      if (passed) {
        await conn.execute(
          `UPDATE user_careers SET completed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND career_id = ?`,
          [req.user.id, id]
        )
        await conn.execute(
          `INSERT IGNORE INTO user_identities (user_id, identity, source) VALUES (?, ?, 'career')`,
          [req.user.id, cs[0].name]
        )
      }
    })
    ok(
      res,
      {
        score,
        passed,
        correctCount,
        total: questions.length,
        results,
        identityGranted: passed,
        identity: passed ? { name: cs[0].name, source: 'career' } : null
      },
      passed ? `考试通过！获得身份「${cs[0].name}」` : `考试未通过（${score} 分，${PASS_SCORE} 分合格），可重新考试`
    )
  })
)

module.exports = router
