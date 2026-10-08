const bcrypt = require('bcryptjs')
const { z } = require('zod')
const { query } = require('../db/pool')
const { signToken } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')
const { checkAndAwardBadges } = require('../services/badges')

const loginSchema = z.object({
  studentNo: z.string().min(2).max(32),
  password: z.string().min(1).max(64)
})

const registerSchema = z.object({
  studentNo: z.string().min(2).max(32),
  password: z.string().min(6).max(64),
  displayName: z.string().min(1).max(64),
  className: z.string().max(64).optional(),
  grade: z.string().max(32).optional(),
  inviteCode: z.string().min(4).max(32)
})

const router = require('express').Router()

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body)
    const rows = await query(
      `SELECT id, student_no, password_hash, display_name, avatar_char, role, rank_label, points
       FROM users WHERE student_no = :studentNo LIMIT 1`,
      { studentNo: body.studentNo }
    )
    if (!rows.length) throw new HttpError(401, '账号或密码错误')
    const user = rows[0]
    const match = await bcrypt.compare(body.password, user.password_hash)
    if (!match) throw new HttpError(401, '账号或密码错误')
    const token = signToken(user)
    checkAndAwardBadges(user.id).catch(() => {})
    ok(res, {
      token,
      user: {
        id: user.id,
        studentNo: user.student_no,
        displayName: user.display_name,
        avatarChar: user.avatar_char || user.display_name.slice(0, 1),
        role: user.role,
        rankLabel: user.rank_label,
        points: user.points
      }
    })
  })
)

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body)
    const exists = await query('SELECT id FROM users WHERE student_no = :studentNo LIMIT 1', {
      studentNo: body.studentNo
    })
    if (exists.length) throw new HttpError(409, '账号已存在')

    // 可选邀请码校验
    let inviteRow = null
    if (body.inviteCode) {
      const code = body.inviteCode.trim().toUpperCase()
      const rows = await query(
        `SELECT id, status, expires_at FROM invite_codes WHERE code = :c LIMIT 1`,
        { c: code }
      )
      if (!rows.length) throw new HttpError(400, '邀请码不存在')
      const inv = rows[0]
      if (inv.status === 'used') throw new HttpError(400, '邀请码已被使用')
      if (inv.status === 'disabled') throw new HttpError(400, '邀请码已作废')
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
        throw new HttpError(400, '邀请码已过期')
      }
      inviteRow = inv
    }

    const hash = await bcrypt.hash(body.password, 10)
    const avatar = body.displayName.slice(0, 1)
    const result = await query(
      `INSERT INTO users (student_no, password_hash, display_name, avatar_char, class_name, grade, points)
       VALUES (:studentNo, :hash, :displayName, :avatar, :className, :grade, 1280)`,
      {
        studentNo: body.studentNo,
        hash,
        displayName: body.displayName,
        avatar,
        className: body.className || null,
        grade: body.grade || null
      }
    )
    // 标记邀请码已使用
    if (inviteRow) {
      await query(
        `UPDATE invite_codes SET status = 'used', used_by = :uid, used_at = CURRENT_TIMESTAMP WHERE id = :iid`,
        { uid: result.insertId, iid: inviteRow.id }
      )
    }
    const user = {
      id: result.insertId,
      student_no: body.studentNo,
      display_name: body.displayName,
      avatar_char: avatar,
      role: 'student',
      rank_label: '外门弟子',
      points: 1280
    }
    ok(res, {
      token: signToken(user),
      user: {
        id: user.id,
        studentNo: user.student_no,
        displayName: user.display_name,
        avatarChar: user.avatar_char,
        role: user.role,
        rankLabel: user.rank_label,
        points: user.points
      }
    }, '注册成功')
  })
)

router.get(
  '/me',
  require('../middleware/auth').authRequired,
  asyncHandler(async (req, res) => {
    const identities = await query(
      'SELECT identity, source, created_at FROM user_identities WHERE user_id = :id ORDER BY id',
      { id: req.user.id }
    )
    const { getRuntimeFlags } = require('../utils/settings')
    const flags = await getRuntimeFlags()
    const events = await query(
      `SELECT event_type, status FROM event_applications WHERE user_id = :id`,
      { id: req.user.id }
    )
    ok(res, {
      id: req.user.id,
      studentNo: req.user.student_no,
      displayName: req.user.display_name,
      avatarChar: req.user.avatar_char,
      role: req.user.role,
      rankLabel: req.user.rank_label,
      points: req.user.points,
      grade: req.user.grade || null,
      className: req.user.class_name || null,
      schoolName: req.user.school_name || null,
      identities: identities.map((i) => i.identity),
      identityDetails: identities.map((i) => ({
        name: i.identity,
        source: i.source,
        createdAt: i.created_at
      })),
      schoolForce: flags.schoolForce,
      printUnlocked: flags.printUnlocked,
      events: events.map((e) => ({ type: e.event_type, status: e.status }))
    })
  })
)

/** 更新所属学校（演示校外收费用） */
router.put(
  '/me/school',
  require('../middleware/auth').authRequired,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      schoolName: z.string().max(120)
    })
    const body = schema.parse(req.body || {})
    const schoolName = body.schoolName.trim()
    await query(`UPDATE users SET school_name = :school WHERE id = :id`, {
      school: schoolName || null,
      id: req.user.id
    })
    ok(res, { schoolName: schoolName || null }, '学校已更新')
  })
)

module.exports = router
