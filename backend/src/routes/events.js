const { z } = require('zod')
const { query } = require('../db/pool')
const { authRequired } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')

const router = require('express').Router()

const applySchema = z.object({
  note: z.string().max(2000).optional().default(''),
  teamName: z.string().max(64).optional(),
  members: z.array(z.string().max(64)).max(10).optional(),
  track: z.string().max(64).optional()
})

router.post(
  '/hackathon',
  authRequired,
  asyncHandler(async (req, res) => {
    const body = applySchema.parse(req.body || {})
    const existing = await query(
      `SELECT id FROM event_applications
       WHERE user_id = :uid AND event_type = 'hackathon' AND status = 'pending' LIMIT 1`,
      { uid: req.user.id }
    )
    if (existing.length) throw new HttpError(400, '已提交过报名，请勿重复提交')
    const result = await query(
      `INSERT INTO event_applications (user_id, event_type, note, payload_json, status)
       VALUES (:uid, 'hackathon', :note, :payload, 'pending')`,
      {
        uid: req.user.id,
        note: body.note || null,
        payload: JSON.stringify({ teamName: body.teamName || null, members: body.members || [] })
      }
    )
    ok(res, { id: result.insertId, eventType: 'hackathon', status: 'pending' }, '黑客松报名成功')
  })
)

router.post(
  '/special',
  authRequired,
  asyncHandler(async (req, res) => {
    const body = applySchema.parse(req.body || {})
    const existing = await query(
      `SELECT id FROM event_applications
       WHERE user_id = :uid AND event_type = 'special' LIMIT 1`,
      { uid: req.user.id }
    )
    if (existing.length) {
      // 已报名则仍确保身份
      await query(
        `INSERT INTO user_identities (user_id, identity, source)
         VALUES (:uid, '试炼认证', 'exam')
         ON DUPLICATE KEY UPDATE source = 'exam'`,
        { uid: req.user.id }
      )
      throw new HttpError(400, '已提交过报名')
    }
    const result = await query(
      `INSERT INTO event_applications (user_id, event_type, note, payload_json, status)
       VALUES (:uid, 'special', :note, :payload, 'accepted')`,
      {
        uid: req.user.id,
        note: body.note || null,
        payload: JSON.stringify({ track: body.track || null })
      }
    )
    await query(
      `INSERT INTO user_identities (user_id, identity, source)
       VALUES (:uid, '试炼认证', 'exam')
       ON DUPLICATE KEY UPDATE source = 'exam'`,
      { uid: req.user.id }
    )
    ok(
      res,
      { id: result.insertId, eventType: 'special', status: 'accepted', identity: '试炼认证' },
      '考核报名成功'
    )
  })
)

router.get(
  '/my',
  authRequired,
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT id, event_type, note, payload_json, status, created_at
       FROM event_applications WHERE user_id = :uid ORDER BY created_at DESC LIMIT 50`,
      { uid: req.user.id }
    )
    ok(res, {
      list: rows.map((r) => ({
        id: r.id,
        eventType: r.event_type,
        note: r.note,
        payload: r.payload_json,
        status: r.status,
        createdAt: r.created_at
      }))
    })
  })
)

module.exports = router
