const { z } = require('zod')
const { query, withTransaction } = require('../db/pool')
const { authRequired, optionalAuth } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')

const router = require('express').Router()

const createRecruitSchema = z.object({
  title: z.string().min(2).max(120),
  content: z.string().min(1).max(20000),
  roleWanted: z.string().max(120).optional().default(''),
  memberCount: z.number().int().min(1).max(50).optional(),
  roles: z
    .array(z.object({ role: z.string().min(1).max(40), count: z.number().int().min(1).max(50) }))
    .max(20)
    .optional()
})

const applySchema = z.object({
  intro: z.string().min(1).max(1000)
})

function parseRoles(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function mapRecruit(r) {
  const roles = parseRoles(r.roles)
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    roleWanted: r.role_wanted,
    roles,
    memberCount: r.member_count,
    status: r.status,
    appCount: r.app_count,
    acceptedCount: r.accepted_count,
    viewCount: r.view_count,
    createdAt: r.created_at,
    publisher: {
      id: r.publisher_id,
      name: r.publisher_name,
      avatarChar: r.publisher_avatar,
      role: r.publisher_role
    }
  }
}

/** GET /api/recruit 列表 */
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
      where.push('r.status = :st')
      params.st = status
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''

    const sql = `
      SELECT r.*, u.id AS publisher_id, u.display_name AS publisher_name,
             u.avatar_char AS publisher_avatar, u.role AS publisher_role
      FROM recruitments r JOIN users u ON u.id = r.publisher_id
      ${whereSql}
      ORDER BY r.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}`

    const countSql = `SELECT COUNT(*) AS total FROM recruitments r ${whereSql}`

    const [list, countRows] = await Promise.all([query(sql, params), query(countSql, params)])
    ok(res, {
      list: list.map(mapRecruit),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

/** GET /api/recruit/:id 详情（报名列表仅发布者可见） */
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(
      `SELECT r.*, u.id AS publisher_id, u.display_name AS publisher_name,
              u.avatar_char AS publisher_avatar, u.role AS publisher_role
       FROM recruitments r JOIN users u ON u.id = r.publisher_id WHERE r.id = :id LIMIT 1`,
      { id }
    )
    if (!rows.length) throw new HttpError(404, '招募不存在')
    await query('UPDATE recruitments SET view_count = view_count + 1 WHERE id = :id', { id })

    const recruit = mapRecruit(rows[0])
    const isPublisher = req.user && req.user.id === recruit.publisher.id

    let applications = null
    let myApplication = null
    if (isPublisher) {
      const apps = await query(
        `SELECT a.id, a.intro, a.status, a.created_at,
                u.id AS applicant_id, u.display_name AS applicant_name, u.avatar_char AS applicant_avatar, u.role AS applicant_role
         FROM recruitment_applications a JOIN users u ON u.id = a.applicant_id
         WHERE a.recruitment_id = :id ORDER BY a.created_at ASC LIMIT 200`,
        { id }
      )
      applications = apps.map((a) => ({
        id: a.id,
        intro: a.intro,
        status: a.status,
        createdAt: a.created_at,
        applicant: { id: a.applicant_id, name: a.applicant_name, avatarChar: a.applicant_avatar, role: a.applicant_role }
      }))
    } else if (req.user) {
      const mine = await query(
        `SELECT id, status FROM recruitment_applications WHERE recruitment_id = :id AND applicant_id = :uid LIMIT 1`,
        { id, uid: req.user.id }
      )
      if (mine.length) myApplication = { id: mine[0].id, status: mine[0].status }
    }

    ok(res, { ...recruit, isPublisher, applications, myApplication })
  })
)

/** POST /api/recruit 发布招募 */
router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const body = createRecruitSchema.parse(req.body)
    const roles = (body.roles || []).filter((x) => x.role && x.count > 0)
    let memberCount = body.memberCount
    if (!memberCount || memberCount < 1) {
      memberCount = roles.reduce((s, x) => s + x.count, 0)
    }
    if (memberCount < 1) memberCount = 1
    if (memberCount > 50) memberCount = 50
    const roleWanted = roles.map((x) => x.role).join(' / ')

    const result = await query(
      `INSERT INTO recruitments (publisher_id, title, content, role_wanted, member_count, roles)
       VALUES (:uid, :title, :content, :role, :cnt, :roles)`,
      {
        uid: req.user.id,
        title: body.title,
        content: body.content,
        role: roleWanted,
        cnt: memberCount,
        roles: roles.length ? JSON.stringify(roles) : null
      }
    )
    ok(res, { id: result.insertId, memberCount, roles }, '招募发布成功')
  })
)

/** POST /api/recruit/:id/apply 报名 */
router.post(
  '/:id/apply',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const body = applySchema.parse(req.body)
    const rows = await query(`SELECT id, publisher_id, status, member_count, accepted_count FROM recruitments WHERE id = :id LIMIT 1`, { id })
    if (!rows.length) throw new HttpError(404, '招募不存在')
    const rec = rows[0]
    if (rec.status !== 'open') throw new HttpError(400, '该招募已结束')
    if (rec.publisher_id === req.user.id) throw new HttpError(400, '不能报名自己的招募')
    if (rec.accepted_count >= rec.member_count) throw new HttpError(400, '名额已满')

    try {
      const result = await withTransaction(async (conn) => {
        const [r] = await conn.execute(
          `INSERT INTO recruitment_applications (recruitment_id, applicant_id, intro) VALUES (:rid, :uid, :intro)`,
          { rid: id, uid: req.user.id, intro: body.intro }
        )
        await conn.execute('UPDATE recruitments SET app_count = app_count + 1 WHERE id = :id', { id })
        return r
      })
      ok(res, { id: result.insertId }, '报名成功，等待发布者审核')
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(400, '你已报名过该招募')
      throw err
    }
  })
)

/** POST /api/recruit/:id/accept 录取报名者 */
router.post(
  '/:id/accept',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const appId = Number(req.body.applicationId)
    if (!appId) throw new HttpError(400, '请指定要录取的报名')

    const data = await withTransaction(async (conn) => {
      const [rs] = await conn.execute(
        `SELECT id, publisher_id, status, member_count, accepted_count FROM recruitments WHERE id = :id LIMIT 1 FOR UPDATE`,
        { id }
      )
      const rec = rs[0]
      if (!rec) throw new HttpError(404, '招募不存在')
      if (rec.publisher_id !== req.user.id) throw new HttpError(403, '只有发布者可以录取')
      if (rec.status !== 'open') throw new HttpError(400, '该招募已结束')
      if (rec.accepted_count >= rec.member_count) throw new HttpError(400, '名额已满')

      const [as] = await conn.execute(
        `SELECT id, applicant_id, status FROM recruitment_applications WHERE id = :aid AND recruitment_id = :rid LIMIT 1 FOR UPDATE`,
        { aid: appId, rid: id }
      )
      const app = as[0]
      if (!app) throw new HttpError(404, '报名不存在')
      if (app.status !== 'pending') throw new HttpError(400, '该报名已处理过')

      await conn.execute(`UPDATE recruitment_applications SET status = 'accepted' WHERE id = :aid`, { aid: appId })

      const accepted = rec.accepted_count + 1
      let closed = false
      if (accepted >= rec.member_count) {
        await conn.execute(`UPDATE recruitments SET accepted_count = :cnt, status = 'closed' WHERE id = :id`, { cnt: accepted, id })
        closed = true
      } else {
        await conn.execute(`UPDATE recruitments SET accepted_count = :cnt WHERE id = :id`, { cnt: accepted, id })
      }
      return { acceptedCount: accepted, closed }
    })

    ok(res, data, '已录取')
  })
)

/** POST /api/recruit/:id/reject 拒绝报名者 */
router.post(
  '/:id/reject',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const appId = Number(req.body.applicationId)
    if (!appId) throw new HttpError(400, '请指定要拒绝的报名')

    const rows = await query(
      `SELECT a.id FROM recruitment_applications a JOIN recruitments r ON r.id = a.recruitment_id
       WHERE a.id = :aid AND a.recruitment_id = :rid AND r.publisher_id = :uid LIMIT 1`,
      { aid: appId, rid: id, uid: req.user.id }
    )
    if (!rows.length) throw new HttpError(403, '无权操作或报名不存在')
    await query(`UPDATE recruitment_applications SET status = 'rejected' WHERE id = :aid`, { aid: appId })
    ok(res, { id: appId }, '已拒绝')
  })
)

/** POST /api/recruit/:id/close 关闭招募 */
router.post(
  '/:id/close',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(`SELECT id, publisher_id, status FROM recruitments WHERE id = :id LIMIT 1`, { id })
    if (!rows.length) throw new HttpError(404, '招募不存在')
    if (rows[0].publisher_id !== req.user.id && req.user.role !== 'admin') {
      throw new HttpError(403, '只有发布者可以关闭')
    }
    if (rows[0].status !== 'open') throw new HttpError(400, '该招募已结束')
    await query(`UPDATE recruitments SET status = 'closed' WHERE id = :id`, { id })
    ok(res, { id }, '招募已关闭')
  })
)

module.exports = router
