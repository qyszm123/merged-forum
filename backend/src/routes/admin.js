const { z } = require('zod')
const { query, withTransaction } = require('../db/pool')
const { authRequired, requireRole } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')

const router = require('express').Router()

const grantSchema = z.object({
  studentNo: z.string().min(1).max(32),
  identity: z.string().min(1).max(64),
  source: z.string().max(32).optional().default('admin')
})

const importSchema = z.object({
  winners: z
    .array(
      z.object({
        studentNo: z.string().min(1).max(32),
        tag: z.string().min(1).max(64)
      })
    )
    .min(1)
    .max(500)
    .optional(),
  studentNos: z.array(z.string().min(1).max(32)).min(1).max(500).optional(),
  tag: z.string().min(1).max(64).optional()
})

const schoolForceSchema = z.object({
  grade: z.string().min(1).max(32),
  enabled: z.boolean().optional().default(true),
  schoolName: z.string().max(120).optional()
})

const unlockPrintSchema = z.object({
  scope: z.enum(['all', 'school']).optional().default('all')
})

const setRoleSchema = z.object({
  // super_admin 只能通过数据库手动指定，不开放接口分配
  role: z.enum(['admin', 'teacher', 'project_owner', 'idea_king', 'student'])
})

async function upsertSetting(key, value) {
  await query(
    `INSERT INTO school_settings (setting_key, setting_value)
     VALUES (:key, CAST(:value AS JSON))
     ON DUPLICATE KEY UPDATE setting_value = CAST(:value AS JSON)`,
    { key, value: JSON.stringify(value) }
  )
}

async function getSettingsMap() {
  const rows = await query(`SELECT setting_key, setting_value FROM school_settings`)
  const map = {}
  for (const r of rows) {
    let v = r.setting_value
    if (typeof v === 'string') {
      try {
        v = JSON.parse(v)
      } catch {
        /* keep string */
      }
    }
    map[r.setting_key] = v
  }
  return map
}

router.get(
  '/settings',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (_req, res) => {
    ok(res, await getSettingsMap())
  })
)

/** 手动赋予身份 */
router.post(
  '/grant',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const body = grantSchema.parse(req.body)
    const users = await query(`SELECT id FROM users WHERE student_no = :no LIMIT 1`, {
      no: body.studentNo
    })
    if (!users.length) throw new HttpError(404, '用户不存在')
    await query(
      `INSERT INTO user_identities (user_id, identity, source)
       VALUES (:uid, :identity, :source)
       ON DUPLICATE KEY UPDATE source = VALUES(source)`,
      { uid: users[0].id, identity: body.identity, source: body.source || 'admin' }
    )
    ok(res, { studentNo: body.studentNo, identity: body.identity }, '已赋予身份')
  })
)

/** 导入黑客松获奖名单：studentNos + tag，或 winners[{studentNo,tag}] */
router.post(
  '/import-hackathon',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const body = importSchema.parse(req.body)
    let entries = []
    if (body.winners?.length) {
      entries = body.winners
    } else if (body.studentNos?.length && body.tag) {
      entries = body.studentNos.map((studentNo) => ({ studentNo, tag: body.tag }))
    } else {
      throw new HttpError(400, '请提供 winners 或 studentNos+tag')
    }

    const result = await withTransaction(async (conn) => {
      let granted = 0
      const missing = []
      for (const e of entries) {
        const [rows] = await conn.execute(
          `SELECT id FROM users WHERE student_no = :no LIMIT 1`,
          { no: e.studentNo }
        )
        if (!rows.length) {
          missing.push(e.studentNo)
          continue
        }
        await conn.execute(
          `INSERT INTO user_identities (user_id, identity, source)
           VALUES (:uid, :identity, 'hackathon')
           ON DUPLICATE KEY UPDATE source = VALUES(source)`,
          { uid: rows[0].id, identity: e.tag }
        )
        granted += 1
      }
      return { granted, missing, total: entries.length }
    })

    ok(res, result, '导入完成')
  })
)

/** 解锁 3D 打印副本（全校/全局） */
router.post(
  '/unlock-print',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const body = unlockPrintSchema.parse(req.body || {})
    await upsertSetting('print_unlocked', { unlocked: true, scope: body.scope })
    ok(res, { printUnlocked: true, scope: body.scope }, '已解锁打印副本')
  })
)

/** 学校强制修炼：指定年级 */
router.post(
  '/school-force',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const body = schoolForceSchema.parse(req.body)
    await upsertSetting('force_train', {
      enabled: body.enabled,
      grade: body.grade,
      schoolName: body.schoolName || null
    })
    ok(
      res,
      { enabled: body.enabled, grade: body.grade, schoolName: body.schoolName || null },
      '开课策略已更新'
    )
  })
)

/* ============ 邀请码管理 ============ */

const crypto = require('crypto')

function genCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去除易混字符
  let s = ''
  for (let i = 0; i < len; i++) s += chars[crypto.randomInt(0, chars.length)]
  return s
}

const createInviteSchema = z.object({
  count: z.number().int().min(1).max(50).optional().default(1),
  note: z.string().max(200).optional().default(''),
  expiresInDays: z.number().int().min(1).max(365).optional() // 不填=永久
})

/** POST /api/admin/invites 生成邀请码（可批量） */
router.post(
  '/invites',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const body = createInviteSchema.parse(req.body)
    const codes = []
    for (let i = 0; i < body.count; i++) {
      let code
      let tries = 0
      do {
        code = genCode()
        const dup = await query(`SELECT id FROM invite_codes WHERE code = :c LIMIT 1`, { c: code })
        if (!dup.length) break
        tries++
      } while (tries < 5)
      const expiresAt = body.expiresInDays
        ? new Date(Date.now() + body.expiresInDays * 86400000)
        : null
      const r = await query(
        `INSERT INTO invite_codes (code, created_by, note, expires_at) VALUES (:c, :uid, :note, :exp)`,
        { c: code, uid: req.user.id, note: body.note || null, exp: expiresAt }
      )
      codes.push({ id: r.insertId, code, expiresAt })
    }
    ok(res, { codes }, `已生成 ${codes.length} 个邀请码`)
  })
)

/** GET /api/admin/invites 邀请码列表 */
router.get(
  '/invites',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || 'all')
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 50)))
    const offset = (page - 1) * pageSize
    const where = status === 'all' ? '' : 'WHERE i.status = :st'
    const params = status === 'all' ? {} : { st: status }
    const sql = `
      SELECT i.*, cb.display_name AS creator_name, ub.display_name AS used_name
      FROM invite_codes i
      LEFT JOIN users cb ON cb.id = i.created_by
      LEFT JOIN users ub ON ub.id = i.used_by
      ${where}
      ORDER BY FIELD(i.status, 'disabled', 'used', 'active') DESC, i.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}`
    const list = await query(sql, params)
    const countRows = await query(`SELECT COUNT(*) AS total FROM invite_codes i ${where}`, params)
    ok(res, {
      list: list.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        note: r.note,
        expiresAt: r.expires_at,
        usedAt: r.used_at,
        createdAt: r.created_at,
        creator: { id: r.created_by, name: r.creator_name },
        usedBy: r.used_by ? { id: r.used_by, name: r.used_name } : null
      })),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

/** POST /api/admin/invites/:id/disable 作废邀请码 */
router.post(
  '/invites/:id/disable',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(`SELECT id, status FROM invite_codes WHERE id = :id LIMIT 1`, { id })
    if (!rows.length) throw new HttpError(404, '邀请码不存在')
    if (rows[0].status === 'used') throw new HttpError(400, '已使用的邀请码不能作废')
    await query(`UPDATE invite_codes SET status = 'disabled' WHERE id = :id`, { id })
    ok(res, { id }, '邀请码已作废')
  })
)

/* ============ 帖子管理 ============ */

/** GET /api/admin/posts 帖子列表（带作者/板块，支持搜索） */
router.get(
  '/posts',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 30)))
    const offset = (page - 1) * pageSize
    const kw = String(req.query.q || '').trim()
    const where = kw ? 'WHERE p.title LIKE :kw OR u.display_name LIKE :kw' : ''
    const params = kw ? { kw: `%${kw}%` } : {}
    const sql = `
      SELECT p.id, p.title, p.status, p.view_count, p.comment_count, p.like_count,
             p.created_at, p.board_id, b.title AS board_title,
             u.id AS author_id, u.display_name AS author_name, u.avatar_char AS author_avatar
      FROM forum_posts p
      LEFT JOIN forum_boards b ON b.id = p.board_id
      LEFT JOIN users u ON u.id = p.author_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}`
    const list = await query(sql, params)
    const countRows = await query(`SELECT COUNT(*) AS total FROM forum_posts p LEFT JOIN users u ON u.id = p.author_id ${where}`, params)
    ok(res, {
      list: list.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        viewCount: r.view_count,
        commentCount: r.comment_count,
        likeCount: r.like_count,
        createdAt: r.created_at,
        board: r.board_id ? { id: r.board_id, name: r.board_name } : null,
        author: { id: r.author_id, name: r.author_name, avatarChar: r.author_avatar }
      })),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

/** DELETE /api/admin/posts/:id 删帖（级联删评论+点赞） */
router.delete(
  '/posts/:id',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(`SELECT id, title FROM forum_posts WHERE id = :id LIMIT 1`, { id })
    if (!rows.length) throw new HttpError(404, '帖子不存在')
    await withTransaction(async (conn) => {
      await conn.execute(`DELETE FROM forum_comments WHERE post_id = :id`, { id })
      await conn.execute(`DELETE FROM forum_likes WHERE target_type = 'post' AND target_id = :id`, { id })
      await conn.execute(`DELETE FROM forum_posts WHERE id = :id`, { id })
    })
    ok(res, { id, title: rows[0].title }, '帖子已删除')
  })
)

/* ============ 账号管理 ============ */

/** GET /api/admin/users 账号列表（带帖子数，支持搜索） */
router.get(
  '/users',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 50)))
    const offset = (page - 1) * pageSize
    const kw = String(req.query.q || '').trim()
    const where = kw ? 'WHERE u.student_no LIKE :kw OR u.display_name LIKE :kw' : ''
    const params = kw ? { kw: `%${kw}%` } : {}
    const sql = `
      SELECT u.id, u.student_no, u.display_name, u.avatar_char, u.role, u.rank_label,
             u.points, u.grade, u.class_name, u.school_name, u.created_at,
             (SELECT COUNT(*) FROM forum_posts WHERE author_id = u.id) AS post_count
      FROM users u
      ${where}
      ORDER BY u.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}`
    const list = await query(sql, params)
    const countRows = await query(`SELECT COUNT(*) AS total FROM users u ${where}`, params)
    ok(res, {
      list: list.map((r) => ({
        id: r.id,
        studentNo: r.student_no,
        displayName: r.display_name,
        avatarChar: r.avatar_char,
        role: r.role,
        rankLabel: r.rank_label,
        points: r.points,
        grade: r.grade,
        className: r.class_name,
        schoolName: r.school_name,
        postCount: Number(r.post_count || 0),
        createdAt: r.created_at
      })),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

/** POST /api/admin/users/:id/role 修改用户角色（仅超级管理员） */
router.post(
  '/users/:id/role',
  authRequired,
  requireRole('super_admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const body = setRoleSchema.parse(req.body)
    const rows = await query(`SELECT id, role, display_name FROM users WHERE id = :id LIMIT 1`, { id })
    if (!rows.length) throw new HttpError(404, '用户不存在')
    if (rows[0].role === 'super_admin') throw new HttpError(400, '不能修改超级管理员的角色')
    if (Number(req.user.id) === id) throw new HttpError(400, '不能修改自己的角色')
    await query(`UPDATE users SET role = :role WHERE id = :id`, { role: body.role, id })
    ok(res, { id, role: body.role })
  })
)

/* ============ 举报审核 ============ */

const resolveSchema = z.object({
  action: z.enum(['resolved', 'dismissed']),
  note: z.string().max(500).optional().default(''),
  deletePost: z.boolean().optional().default(false)
})

/** GET /api/admin/reports 举报列表 */
router.get(
  '/reports',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || 'pending')
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 50)))
    const offset = (page - 1) * pageSize
    const where = status === 'all' ? '' : 'WHERE r.status = :st'
    const params = status === 'all' ? {} : { st: status }
    const sql = `
      SELECT r.*, p.title AS post_title, p.status AS post_status,
             pa.id AS post_author_id, pa.display_name AS post_author_name, pa.avatar_char AS post_author_avatar,
             c.id AS comment_id, c.content AS comment_content,
             ca.id AS comment_author_id, ca.display_name AS comment_author_name, ca.avatar_char AS comment_author_avatar,
             cp.id AS comment_post_id, cp.title AS comment_post_title,
             rp.id AS reporter_id, rp.display_name AS reporter_name, rp.avatar_char AS reporter_avatar,
             h.display_name AS handler_name
      FROM post_reports r
      LEFT JOIN forum_posts p ON p.id = r.post_id
      LEFT JOIN users pa ON pa.id = p.author_id
      LEFT JOIN forum_comments c ON c.id = r.comment_id
      LEFT JOIN users ca ON ca.id = c.author_id
      LEFT JOIN forum_posts cp ON cp.id = c.post_id
      LEFT JOIN users rp ON rp.id = r.reporter_id
      LEFT JOIN users h ON h.id = r.handler_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}`
    const list = await query(sql, params)
    const countRows = await query(`SELECT COUNT(*) AS total FROM post_reports r ${where}`, params)
    ok(res, {
      list: list.map((r) => ({
        id: r.id,
        reason: r.reason,
        status: r.status,
        handlerNote: r.handler_note,
        createdAt: r.created_at,
        handledAt: r.handled_at,
        type: r.comment_id ? 'comment' : 'post',
        post: r.post_id
          ? { id: r.post_id, title: r.post_title, status: r.post_status }
          : r.comment_post_id
            ? { id: r.comment_post_id, title: r.comment_post_title, status: null }
            : null,
        postAuthor: r.post_author_id ? { id: r.post_author_id, name: r.post_author_name, avatarChar: r.post_author_avatar } : null,
        comment: r.comment_id
          ? {
              id: r.comment_id,
              content: r.comment_content,
              author: r.comment_author_id
                ? { id: r.comment_author_id, name: r.comment_author_name, avatarChar: r.comment_author_avatar }
                : null
            }
          : null,
        reporter: { id: r.reporter_id, name: r.reporter_name, avatarChar: r.reporter_avatar },
        handler: r.handler_id ? { id: r.handler_id, name: r.handler_name } : null
      })),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

/** POST /api/admin/reports/:id/resolve 审核举报 */
router.post(
  '/reports/:id/resolve',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const body = resolveSchema.parse(req.body)
    const rows = await query(`SELECT id, status, post_id, comment_id FROM post_reports WHERE id = :id LIMIT 1`, { id })
    if (!rows.length) throw new HttpError(404, '举报不存在')
    if (rows[0].status !== 'pending') throw new HttpError(400, '该举报已处理')

    const report = rows[0]
    let targetDeleted = false
    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE post_reports SET status = :st, handler_id = :hid, handler_note = :note, handled_at = CURRENT_TIMESTAMP WHERE id = :id`,
        { st: body.action, hid: req.user.id, note: body.note || null, id }
      )
      // 若选择删除被举报内容（仅 resolved 时允许）
      if (body.deletePost && body.action === 'resolved') {
        if (report.comment_id) {
          // 评论举报：删除该评论（report 因 FK CASCADE 自动删），并回退帖子评论数
          const [c] = await conn.execute(
            `SELECT id, post_id FROM forum_comments WHERE id = :cid LIMIT 1`,
            { cid: report.comment_id }
          )
          if (c.length) {
            await conn.execute(`DELETE FROM forum_comments WHERE id = :cid`, { cid: report.comment_id })
            await conn.execute(
              `UPDATE forum_posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = :pid`,
              { pid: c[0].post_id }
            )
            targetDeleted = true
          }
        } else if (report.post_id) {
          // 帖子举报：级联删评论+点赞（report 因 FK CASCADE 自动删）
          await conn.execute(`DELETE FROM forum_comments WHERE post_id = :pid`, { pid: report.post_id })
          await conn.execute(`DELETE FROM forum_likes WHERE target_type = 'post' AND target_id = :pid`, { pid: report.post_id })
          await conn.execute(`DELETE FROM forum_posts WHERE id = :pid`, { pid: report.post_id })
          targetDeleted = true
        }
      }
    })
    ok(
      res,
      { id, status: body.action, postDeleted: targetDeleted, targetDeleted },
      body.action === 'resolved' ? '举报已处理（采纳）' : '举报已驳回'
    )
  })
)

/* ============ 勋章管理 ============ */

const CONDITION_TYPES = [
  'post_count',
  'comment_count',
  'like_received_count',
  'sign_in_days',
  'register_days',
  'bounty_completed'
]

const badgeSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional().default(''),
  icon: z.string().max(255).optional().default('🏅'),
  conditionType: z.enum(CONDITION_TYPES),
  conditionValue: z.number().int().min(1),
  isActive: z.boolean().optional().default(true)
})

function mapAdminBadge(b) {
  return {
    id: b.id,
    name: b.name,
    description: b.description || '',
    icon: b.icon || '🏅',
    conditionType: b.condition_type,
    conditionValue: b.condition_value,
    isActive: !!b.is_active,
    holderCount: Number(b.holder_count || 0),
    createdAt: b.created_at
  }
}

/** GET /api/admin/badges 勋章定义列表（含持有人数） */
router.get(
  '/badges',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT b.*, (SELECT COUNT(*) FROM user_badges ub WHERE ub.badge_id = b.id) AS holder_count
       FROM badges b
       ORDER BY b.id`
    )
    ok(res, { list: rows.map(mapAdminBadge) })
  })
)

/** POST /api/admin/badges 创建勋章 */
router.post(
  '/badges',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const body = badgeSchema.parse(req.body)
    const r = await query(
      `INSERT INTO badges (name, description, icon, condition_type, condition_value, is_active)
       VALUES (:name, :desc, :icon, :ct, :cv, :active)`,
      {
        name: body.name,
        desc: body.description || '',
        icon: body.icon || '🏅',
        ct: body.conditionType,
        cv: body.conditionValue,
        active: body.isActive ? 1 : 0
      }
    )
    ok(res, { id: r.insertId }, '勋章已创建')
  })
)

/** PUT /api/admin/badges/:id 修改勋章 */
router.put(
  '/badges/:id',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const body = badgeSchema.parse(req.body)
    const rows = await query(`SELECT id FROM badges WHERE id = :id`, { id })
    if (!rows.length) throw new HttpError(404, '勋章不存在')
    await query(
      `UPDATE badges SET name = :name, description = :desc, icon = :icon,
              condition_type = :ct, condition_value = :cv, is_active = :active
       WHERE id = :id`,
      {
        name: body.name,
        desc: body.description || '',
        icon: body.icon || '🏅',
        ct: body.conditionType,
        cv: body.conditionValue,
        active: body.isActive ? 1 : 0,
        id
      }
    )
    ok(res, { id }, '勋章已更新')
  })
)

/** DELETE /api/admin/badges/:id 删除勋章（级联删除用户佩戴记录） */
router.delete(
  '/badges/:id',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(`SELECT id, name FROM badges WHERE id = :id`, { id })
    if (!rows.length) throw new HttpError(404, '勋章不存在')
    await query(`DELETE FROM badges WHERE id = :id`, { id })
    ok(res, { id, name: rows[0].name }, '勋章已删除')
  })
)

/** GET /api/admin/users/:userId/badges 查看某用户勋章 */
router.get(
  '/users/:userId/badges',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId)
    const rows = await query(
      `SELECT ub.badge_id, ub.awarded_at, ub.is_displayed, b.name, b.description, b.icon
       FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = :uid ORDER BY ub.awarded_at DESC`,
      { uid: userId }
    )
    ok(res, {
      list: rows.map((r) => ({
        id: r.badge_id,
        name: r.name,
        description: r.description || '',
        icon: r.icon || '🏅',
        isDisplayed: !!r.is_displayed,
        awardedAt: r.awarded_at
      }))
    })
  })
)

/** POST /api/admin/users/:userId/badges/:badgeId 手动授予勋章 */
router.post(
  '/users/:userId/badges/:badgeId',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId)
    const badgeId = Number(req.params.badgeId)
    const [u, b] = await Promise.all([
      query(`SELECT id FROM users WHERE id = :id`, { id: userId }),
      query(`SELECT id FROM badges WHERE id = :id`, { id: badgeId })
    ])
    if (!u.length) throw new HttpError(404, '用户不存在')
    if (!b.length) throw new HttpError(404, '勋章不存在')
    await query(
      `INSERT IGNORE INTO user_badges (user_id, badge_id) VALUES (:uid, :bid)`,
      { uid: userId, bid: badgeId }
    )
    ok(res, { userId, badgeId }, '已授予勋章')
  })
)

/** DELETE /api/admin/users/:userId/badges/:badgeId 撤销勋章 */
router.delete(
  '/users/:userId/badges/:badgeId',
  authRequired,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId)
    const badgeId = Number(req.params.badgeId)
    await query(
      `DELETE FROM user_badges WHERE user_id = :uid AND badge_id = :bid`,
      { uid: userId, bid: badgeId }
    )
    ok(res, { userId, badgeId }, '已撤销勋章')
  })
)

module.exports = router
