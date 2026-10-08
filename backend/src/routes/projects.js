const { z } = require('zod')
const { query, withTransaction } = require('../db/pool')
const { cacheDel } = require('../db/redis')
const { authRequired, optionalAuth } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')

const router = require('express').Router()

/** 无自定义封面时按项目 id 轮换，保证广场卡片图各不相同 */
const PROJECT_COVER_POOL = [
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1587620962725-abab7fe55159?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=800&h=450&q=80'
]

function defaultProjectCoverUrl(id) {
  const n = Math.abs(Number(id) || 0)
  return PROJECT_COVER_POOL[n % PROJECT_COVER_POOL.length]
}

function resolveProjectCoverUrl(row, meta = {}) {
  const raw = row.cover_url || meta.coverUrl || ''
  if (raw) return raw
  return defaultProjectCoverUrl(row.id)
}

const createSchema = z.object({
  title: z.string().min(2).max(120),
  summary: z.string().min(1).max(500),
  content: z.string().max(20000).optional().default(''),
  tech: z.string().max(32).optional().default('other'),
  platform: z.string().max(32).optional().default('web'),
  scene: z.string().max(32).optional().default('campus'),
  roles: z.array(z.string().max(32)).max(8).optional().default([]),
  experienceUrl: z.string().max(500).optional().nullable(),
  coverUrl: z.string().max(512).optional().nullable(),
  gate: z.enum(['creator', 'network', 'hardware', 'code', 'none']).optional().default('creator'),
  backlinkCommitted: z.boolean().optional().default(true),
  uploaded: z.boolean().optional().default(false),
  uploadId: z.number().int().positive().optional().nullable(),
  /** 是否开放他人申请加入（发布时显式开关） */
  acceptApplications: z.boolean().optional().default(true),
  status: z.enum(['recruiting', 'ongoing', 'done', 'archived']).optional()
})

function parseMeta(content) {
  if (!content) return {}
  if (typeof content === 'object') return content
  try {
    return JSON.parse(content)
  } catch {
    return { note: String(content) }
  }
}

/** 开放申请：显式开关优先；未写时招人中默认开放 */
function projectAcceptsApplications(row, meta = null) {
  const m = meta || parseMeta(row.content)
  if (row.status === 'archived' || row.status === 'done') return false
  if (typeof m.acceptApplications === 'boolean') return m.acceptApplications
  return row.status === 'recruiting'
}

function mapProject(row, { members = [], extras = {}, includeContent = false } = {}) {
  const meta = parseMeta(row.content)
  const base = {
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    likeCount: row.like_count,
    viewCount: row.view_count,
    createdAt: row.created_at,
    owner: {
      id: row.owner_id,
      name: row.owner_name,
      avatarChar: row.avatar_char
    },
    members,
    tech: meta.tech || 'other',
    platform: meta.platform || 'web',
    scene: meta.scene || 'campus',
    roles: Array.isArray(meta.roles) ? meta.roles : [],
    experienceUrl: meta.experienceUrl || '',
    coverUrl: resolveProjectCoverUrl(row, meta),
    gate: meta.gate || 'creator',
    backlinkCommitted: meta.backlinkCommitted !== false,
    uploaded: !!meta.uploaded,
    acceptApplications: projectAcceptsApplications(row, meta),
    timeline: extras.timeline || (Array.isArray(meta.timeline) ? meta.timeline : []),
    team: Array.isArray(meta.team) ? meta.team : [],
    feedbackCount: extras.feedbackCount || 0,
    backlinkCount: extras.backlinkCount || Number(row.backlink_count || 0)
  }
  if (includeContent) base.content = meta
  return base
}

async function loadMembers(projectId) {
  return query(
    `SELECT u.id, u.display_name AS name, u.avatar_char AS avatarChar, pm.role, pm.joined_at AS joinedAt
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = :id
     ORDER BY pm.joined_at`,
    { id: projectId }
  )
}

async function loadPendingJoinRequests(projectId) {
  return query(
    `SELECT r.id, r.message, r.status, r.created_at AS createdAt,
            u.id AS userId, u.display_name AS name, u.avatar_char AS avatarChar
     FROM project_join_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.project_id = :id AND r.status = 'pending'
     ORDER BY r.created_at ASC`,
    { id: projectId }
  )
}

async function getMyJoinStatus(projectId, userId) {
  if (!userId) return null
  const members = await query(
    `SELECT 1 AS ok FROM project_members WHERE project_id = :id AND user_id = :uid LIMIT 1`,
    { id: projectId, uid: userId }
  )
  if (members.length) return 'member'
  const reqs = await query(
    `SELECT status FROM project_join_requests WHERE project_id = :id AND user_id = :uid LIMIT 1`,
    { id: projectId, uid: userId }
  )
  if (!reqs.length) return null
  return reqs[0].status
}

async function addMemberAndFillSeat(projectId, user, role = 'member') {
  await query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES (:id, :uid, :role)`,
    { id: projectId, uid: user.id, role }
  )
  const projects = await query(`SELECT content FROM projects WHERE id = :id LIMIT 1`, { id: projectId })
  if (!projects.length) return
  const meta = parseMeta(projects[0].content)
  if (Array.isArray(meta.team)) {
    const emptyIdx = meta.team.findIndex((t) => t && t.empty)
    const seat = {
      name: user.display_name || user.displayName || '队友',
      meta: '队友 · 创造者',
      avatar: ''
    }
    if (emptyIdx >= 0) meta.team[emptyIdx] = seat
    else meta.team.push(seat)
    await query(`UPDATE projects SET content = :content WHERE id = :id`, {
      id: projectId,
      content: JSON.stringify(meta)
    })
  }
}

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 24)))
    const offset = (page - 1) * pageSize
    const list = await query(
      `SELECT p.id, p.title, p.summary, p.content, p.status, p.like_count, p.view_count,
              p.backlink_count, p.cover_url, p.created_at,
              u.id AS owner_id, u.display_name AS owner_name, u.avatar_char
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       WHERE p.status != 'archived'
       ORDER BY p.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    )
    const countRows = await query(
      `SELECT COUNT(*) AS total FROM projects WHERE status != 'archived'`
    )
    ok(res, {
      list: list.map((p) => mapProject(p)),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

router.post(
  '/',
  authRequired,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body)
    if (body.experienceUrl && !/^https?:\/\//i.test(body.experienceUrl)) {
      throw new HttpError(400, '体验入口需以 http:// 或 https:// 开头')
    }
    if (body.coverUrl && !/^https?:\/\//i.test(body.coverUrl) && !String(body.coverUrl).startsWith('/api/uploads/')) {
      throw new HttpError(400, '封面图请使用 http(s) 链接或平台上传地址')
    }

    const team = [
      {
        name: req.user.display_name,
        meta: '创建者 · 项目方',
        avatar: ''
      },
      ...(body.roles.length
        ? body.roles.map((r) => ({ empty: `+ 待加入 · ${r}` }))
        : [{ empty: '+ 待加入 · 队友' }, { empty: '+ 待加入 · 队友' }])
    ]

    const acceptApplications = body.acceptApplications !== false
    const status =
      body.status ||
      (acceptApplications ? 'recruiting' : 'ongoing')

    const meta = {
      tech: body.tech,
      platform: body.platform,
      scene: body.scene,
      roles: body.roles,
      experienceUrl: body.experienceUrl || '',
      coverUrl: body.coverUrl || '',
      gate: body.gate,
      backlinkCommitted: body.backlinkCommitted,
      uploaded: body.uploaded || !!body.uploadId,
      uploadId: body.uploadId || null,
      acceptApplications,
      note: body.content || '',
      timeline: [
        [
          '刚刚',
          acceptApplications
            ? `由 ${req.user.display_name} 发布到项目广场 · 开放招募`
            : `由 ${req.user.display_name} 发布到项目广场 · 暂不招人`
        ]
      ],
      team
    }

    const data = await withTransaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO projects (owner_id, title, summary, content, status, cover_url)
         VALUES (:ownerId, :title, :summary, :content, :status, :coverUrl)`,
        {
          ownerId: req.user.id,
          title: body.title,
          summary: body.summary,
          content: JSON.stringify(meta),
          status,
          coverUrl: body.coverUrl || null
        }
      )
      const id = result.insertId
      if (!body.coverUrl) {
        const coverUrl = defaultProjectCoverUrl(id)
        meta.coverUrl = coverUrl
        await conn.execute(`UPDATE projects SET cover_url = :coverUrl, content = :content WHERE id = :id`, {
          id,
          coverUrl,
          content: JSON.stringify(meta)
        })
      }
      await conn.execute(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES (:id, :uid, 'owner')`,
        { id, uid: req.user.id }
      )
      return { id }
    })

    const rows = await query(
      `SELECT p.id, p.title, p.summary, p.content, p.status, p.like_count, p.view_count,
              p.backlink_count, p.cover_url, p.created_at,
              u.id AS owner_id, u.display_name AS owner_name, u.avatar_char
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       WHERE p.id = :id LIMIT 1`,
      { id: data.id }
    )
    const members = await loadMembers(data.id)
    ok(res, mapProject(rows[0], { members, includeContent: true }), '发布成功')
  })
)

function mapRecruitPost(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectTitle: row.project_title || '',
    roleWanted: row.role_wanted || '',
    body: row.body || '',
    syncPlaza: !!row.sync_plaza,
    createdAt: row.created_at,
    author: {
      id: row.author_id,
      name: row.author_name,
      avatarChar: row.author_avatar
    }
  }
}

function mapInvite(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectTitle: row.project_title || '',
    note: row.note || '',
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at || null,
    inviter: {
      id: row.inviter_id,
      name: row.inviter_name,
      avatarChar: row.inviter_avatar
    },
    invitee: row.invitee_id
      ? {
          id: row.invitee_id,
          name: row.invitee_name,
          avatarChar: row.invitee_avatar
        }
      : null
  }
}

/** 广场招人动态流 */
router.get(
  '/recruit-feed',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 24)))
    const offset = (page - 1) * pageSize
    const list = await query(
      `SELECT r.*, p.title AS project_title,
              u.display_name AS author_name, u.avatar_char AS author_avatar
       FROM project_recruit_posts r
       JOIN projects p ON p.id = r.project_id
       JOIN users u ON u.id = r.author_id
       WHERE r.sync_plaza = 1 AND p.status != 'archived'
       ORDER BY r.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    )
    const countRows = await query(
      `SELECT COUNT(*) AS total
       FROM project_recruit_posts r
       JOIN projects p ON p.id = r.project_id
       WHERE r.sync_plaza = 1 AND p.status != 'archived'`
    )
    ok(res, {
      list: list.map(mapRecruitPost),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

/** 我收到的邀请 */
router.get(
  '/invites/mine',
  authRequired,
  asyncHandler(async (req, res) => {
    const status = String(req.query.status || 'pending')
    const list = await query(
      `SELECT i.*, p.title AS project_title,
              u.display_name AS inviter_name, u.avatar_char AS inviter_avatar,
              me.display_name AS invitee_name, me.avatar_char AS invitee_avatar
       FROM project_invites i
       JOIN projects p ON p.id = i.project_id
       JOIN users u ON u.id = i.inviter_id
       JOIN users me ON me.id = i.invitee_id
       WHERE i.invitee_id = :uid AND (:status = 'all' OR i.status = :status)
       ORDER BY i.created_at DESC
       LIMIT 50`,
      { uid: req.user.id, status }
    )
    ok(res, { list: list.map(mapInvite) })
  })
)

/** 我发布的项目 */
router.get(
  '/mine',
  authRequired,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 40)))
    const offset = (page - 1) * pageSize
    const list = await query(
      `SELECT p.id, p.title, p.summary, p.content, p.status, p.like_count, p.view_count,
              p.backlink_count, p.cover_url, p.created_at,
              u.id AS owner_id, u.display_name AS owner_name, u.avatar_char
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       WHERE p.owner_id = :uid AND p.status != 'archived' AND IFNULL(p.is_showcase, 0) = 0
       ORDER BY p.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      { uid: req.user.id }
    )
    const countRows = await query(
      `SELECT COUNT(*) AS total FROM projects
       WHERE owner_id = :uid AND status != 'archived' AND IFNULL(is_showcase, 0) = 0`,
      { uid: req.user.id }
    )
    ok(res, {
      list: list.map((p) => mapProject(p)),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

/** 接受邀请 */
router.post(
  '/invites/:inviteId/accept',
  authRequired,
  asyncHandler(async (req, res) => {
    const inviteId = Number(req.params.inviteId)
    const rows = await query(`SELECT * FROM project_invites WHERE id = :id LIMIT 1`, { id: inviteId })
    if (!rows.length) throw new HttpError(404, '邀请不存在')
    const invite = rows[0]
    if (Number(invite.invitee_id) !== Number(req.user.id)) {
      throw new HttpError(403, '只能处理发给自己的邀请')
    }
    if (invite.status !== 'pending') throw new HttpError(409, '邀请已处理')

    const projects = await query(`SELECT id, owner_id, status, title FROM projects WHERE id = :id LIMIT 1`, {
      id: invite.project_id
    })
    if (!projects.length) throw new HttpError(404, '项目不存在')
    if (projects[0].status === 'archived') throw new HttpError(400, '项目已归档')

    const user = {
      id: req.user.id,
      display_name: req.user.display_name || req.user.displayName || '队友'
    }
    try {
      await addMemberAndFillSeat(invite.project_id, user, 'member')
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err
    }

    await query(
      `UPDATE project_invites SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE id = :id`,
      { id: inviteId }
    )
    await query(
      `INSERT INTO project_timeline (project_id, author_id, content)
       VALUES (:pid, :uid, :content)`,
      {
        pid: invite.project_id,
        uid: req.user.id,
        content: `${user.display_name} 接受邀请加入团队`
      }
    )

    const proj = await query(`SELECT content FROM projects WHERE id = :id LIMIT 1`, {
      id: invite.project_id
    })
    if (proj.length) {
      const meta = parseMeta(proj[0].content)
      if (!Array.isArray(meta.timeline)) meta.timeline = []
      meta.timeline.unshift(['刚刚', `${user.display_name} 接受邀请加入团队`])
      await query(`UPDATE projects SET content = :content WHERE id = :id`, {
        id: invite.project_id,
        content: JSON.stringify(meta)
      })
    }

    ok(
      res,
      { inviteId, projectId: invite.project_id, status: 'accepted' },
      '已接受邀请，加入成功'
    )
  })
)

/** 拒绝邀请 */
router.post(
  '/invites/:inviteId/decline',
  authRequired,
  asyncHandler(async (req, res) => {
    const inviteId = Number(req.params.inviteId)
    const rows = await query(`SELECT * FROM project_invites WHERE id = :id LIMIT 1`, { id: inviteId })
    if (!rows.length) throw new HttpError(404, '邀请不存在')
    const invite = rows[0]
    if (Number(invite.invitee_id) !== Number(req.user.id)) {
      throw new HttpError(403, '只能处理发给自己的邀请')
    }
    if (invite.status !== 'pending') throw new HttpError(409, '邀请已处理')
    await query(
      `UPDATE project_invites SET status = 'declined', responded_at = CURRENT_TIMESTAMP WHERE id = :id`,
      { id: inviteId }
    )
    ok(res, { inviteId, status: 'declined' }, '已拒绝邀请')
  })
)

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(
      `SELECT p.*, u.id AS owner_id, u.display_name AS owner_name, u.avatar_char
       FROM projects p JOIN users u ON u.id = p.owner_id
       WHERE p.id = :id LIMIT 1`,
      { id }
    )
    if (!rows.length) throw new HttpError(404, '项目不存在')
    await query('UPDATE projects SET view_count = view_count + 1 WHERE id = :id', { id })
    const members = await loadMembers(id)
    const timeline = await query(
      `SELECT t.id, t.content, t.created_at AS createdAt, u.display_name AS authorName
       FROM project_timeline t JOIN users u ON u.id = t.author_id
       WHERE t.project_id = :id ORDER BY t.created_at DESC LIMIT 20`,
      { id }
    )
    const fb = await query(`SELECT COUNT(*) AS c FROM project_feedback WHERE project_id = :id`, {
      id
    })
    const bl = await query(`SELECT COUNT(*) AS c FROM backlink_events WHERE project_id = :id`, {
      id
    })
    const p = rows[0]
    p.view_count = Number(p.view_count || 0) + 1
    const mapped = mapProject(p, {
      members,
      includeContent: true,
      extras: {
        timeline,
        feedbackCount: Number(fb[0]?.c || 0),
        backlinkCount: Number(bl[0]?.c || 0)
      }
    })
    const uid = req.user?.id
    mapped.myJoinStatus = await getMyJoinStatus(id, uid)
    const isOwner =
      uid && (Number(p.owner_id) === Number(uid) || req.user?.role === 'admin')
    mapped.joinRequests = isOwner ? await loadPendingJoinRequests(id) : []
    ok(res, mapped)
  })
)

router.patch(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(
      `SELECT p.*, u.id AS owner_id, u.display_name AS owner_name, u.avatar_char
       FROM projects p JOIN users u ON u.id = p.owner_id
       WHERE p.id = :id LIMIT 1`,
      { id }
    )
    if (!rows.length) throw new HttpError(404, '项目不存在')
    const row = rows[0]
    if (Number(row.owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '仅项目方或管理员可更新')
    }

    const meta = parseMeta(row.content)
    const body = req.body || {}
    if (Array.isArray(body.timeline)) meta.timeline = body.timeline
    if (Array.isArray(body.team)) meta.team = body.team
    if (typeof body.experienceUrl === 'string') meta.experienceUrl = body.experienceUrl
    if (typeof body.coverUrl === 'string') {
      const cover = body.coverUrl.trim()
      if (cover && !/^https?:\/\//i.test(cover) && !cover.startsWith('/api/uploads/')) {
        throw new HttpError(400, '封面图请使用 http(s) 链接或平台上传地址')
      }
      meta.coverUrl = cover
    }
    let nextStatus = row.status
    if (typeof body.acceptApplications === 'boolean') {
      meta.acceptApplications = body.acceptApplications
      if (body.acceptApplications) {
        if (row.status === 'ongoing') nextStatus = 'recruiting'
      } else if (row.status === 'recruiting') {
        nextStatus = 'ongoing'
      }
    }
    if (body.status && ['recruiting', 'ongoing', 'done', 'archived'].includes(body.status)) {
      nextStatus = body.status
      if (body.status === 'recruiting' && body.acceptApplications == null) {
        meta.acceptApplications = true
      }
      if ((body.status === 'ongoing' || body.status === 'done') && body.acceptApplications == null) {
        meta.acceptApplications = false
      }
    }

    await query(
      `UPDATE projects SET content = :content, status = :status, cover_url = :coverUrl WHERE id = :id`,
      {
        id,
        content: JSON.stringify(meta),
        status: nextStatus,
        coverUrl: typeof body.coverUrl === 'string' ? body.coverUrl.trim() || null : row.cover_url
      }
    )

    const next = await query(
      `SELECT p.id, p.title, p.summary, p.content, p.status, p.like_count, p.view_count,
              p.backlink_count, p.cover_url, p.created_at,
              u.id AS owner_id, u.display_name AS owner_name, u.avatar_char
       FROM projects p JOIN users u ON u.id = p.owner_id
       WHERE p.id = :id LIMIT 1`,
      { id }
    )
    const members = await loadMembers(id)
    ok(res, mapProject(next[0], { members, includeContent: true }), '已更新')
  })
)

/** 申请组队：需创造者身份；写入待审申请，等项目方同意 */
router.post(
  '/:id/join',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const canJoin =
      req.user.role === 'admin' ||
      req.user.role === 'project_owner' ||
      (
        await query(
          `SELECT 1 FROM user_identities WHERE user_id = :uid AND identity = '创造者' LIMIT 1`,
          { uid: req.user.id }
        )
      ).length > 0

    if (!canJoin) {
      throw new HttpError(403, '需通关入门获得「创造者」身份后方可申请组队')
    }

    const projects = await query(
      `SELECT id, owner_id, status, content FROM projects WHERE id = :id LIMIT 1`,
      { id }
    )
    if (!projects.length) throw new HttpError(404, '项目不存在')
    if (projects[0].status === 'archived') throw new HttpError(400, '项目已归档')
    if (Number(projects[0].owner_id) === Number(req.user.id)) throw new HttpError(400, '你已是项目方')
    if (!projectAcceptsApplications(projects[0])) {
      throw new HttpError(400, '该项目暂未开放招募，无法申请加入')
    }

    const existingMember = await query(
      `SELECT 1 AS ok FROM project_members WHERE project_id = :id AND user_id = :uid LIMIT 1`,
      { id, uid: req.user.id }
    )
    if (existingMember.length) throw new HttpError(400, '你已在项目中')

    const message = String(req.body?.message || '').trim().slice(0, 500)

    const prev = await query(
      `SELECT id, status FROM project_join_requests WHERE project_id = :id AND user_id = :uid LIMIT 1`,
      { id, uid: req.user.id }
    )
    if (prev.length) {
      if (prev[0].status === 'pending') throw new HttpError(400, '申请已提交，请等待项目方处理')
      if (prev[0].status === 'approved') throw new HttpError(400, '你已在项目中')
      await query(
        `UPDATE project_join_requests
         SET status = 'pending', message = :message, created_at = CURRENT_TIMESTAMP, reviewed_at = NULL
         WHERE id = :rid`,
        { rid: prev[0].id, message }
      )
      return ok(res, { projectId: id, requestId: prev[0].id, status: 'pending' }, '已重新提交申请，等待项目方同意')
    }

    const result = await query(
      `INSERT INTO project_join_requests (project_id, user_id, message, status)
       VALUES (:id, :uid, :message, 'pending')`,
      { id, uid: req.user.id, message }
    )
    ok(res, { projectId: id, requestId: result.insertId, status: 'pending' }, '申请已提交，等待项目方同意')
  })
)

/** 项目方查看待审申请 */
router.get(
  '/:id/join-requests',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const projects = await query(`SELECT owner_id FROM projects WHERE id = :id LIMIT 1`, { id })
    if (!projects.length) throw new HttpError(404, '项目不存在')
    if (Number(projects[0].owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '仅项目方可查看申请')
    }
    ok(res, { list: await loadPendingJoinRequests(id) })
  })
)

/** 项目方同意申请 */
router.post(
  '/:id/join-requests/:reqId/approve',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const reqId = Number(req.params.reqId)
    const projects = await query(`SELECT owner_id, status FROM projects WHERE id = :id LIMIT 1`, { id })
    if (!projects.length) throw new HttpError(404, '项目不存在')
    if (Number(projects[0].owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '仅项目方可同意申请')
    }
    if (projects[0].status === 'archived') throw new HttpError(400, '项目已归档')

    const rows = await query(
      `SELECT r.*, u.display_name, u.id AS uid
       FROM project_join_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = :rid AND r.project_id = :id LIMIT 1`,
      { rid: reqId, id }
    )
    if (!rows.length) throw new HttpError(404, '申请不存在')
    if (rows[0].status !== 'pending') throw new HttpError(400, '申请已处理')

    const applicant = { id: rows[0].uid, display_name: rows[0].display_name }
    try {
      await addMemberAndFillSeat(id, applicant, 'member')
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err
    }
    await query(
      `UPDATE project_join_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = :rid`,
      { rid: reqId }
    )
    ok(res, { projectId: id, requestId: reqId, status: 'approved' }, '已同意加入')
  })
)

/** 项目方拒绝申请 */
router.post(
  '/:id/join-requests/:reqId/reject',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const reqId = Number(req.params.reqId)
    const projects = await query(`SELECT owner_id FROM projects WHERE id = :id LIMIT 1`, { id })
    if (!projects.length) throw new HttpError(404, '项目不存在')
    if (Number(projects[0].owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '仅项目方可拒绝申请')
    }
    const rows = await query(
      `SELECT id, status FROM project_join_requests WHERE id = :rid AND project_id = :id LIMIT 1`,
      { rid: reqId, id }
    )
    if (!rows.length) throw new HttpError(404, '申请不存在')
    if (rows[0].status !== 'pending') throw new HttpError(400, '申请已处理')
    await query(
      `UPDATE project_join_requests SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP WHERE id = :rid`,
      { rid: reqId }
    )
    ok(res, { projectId: id, requestId: reqId, status: 'rejected' }, '已拒绝申请')
  })
)

router.post(
  '/:id/timeline',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const schema = z.object({ content: z.string().min(1).max(1000) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) throw new HttpError(400, '参数错误', parsed.error.flatten())
    const projects = await query(`SELECT id, owner_id, content FROM projects WHERE id = :id LIMIT 1`, { id })
    if (!projects.length) throw new HttpError(404, '项目不存在')
    if (Number(projects[0].owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '仅项目方可发布动态')
    }
    const result = await query(
      `INSERT INTO project_timeline (project_id, author_id, content)
       VALUES (:id, :uid, :content)`,
      { id, uid: req.user.id, content: parsed.data.content }
    )
    const meta = parseMeta(projects[0].content)
    if (!Array.isArray(meta.timeline)) meta.timeline = []
    meta.timeline.unshift(['刚刚', parsed.data.content])
    await query(`UPDATE projects SET content = :content WHERE id = :id`, {
      id,
      content: JSON.stringify(meta)
    })
    ok(res, { id: result.insertId }, '已发布')
  })
)

/** 负责人发招人动态 */
router.post(
  '/:id/recruit',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const schema = z.object({
      role: z.string().min(1).max(64),
      body: z.string().min(2).max(1000),
      syncPlaza: z.boolean().optional().default(true),
      syncCommunity: z.boolean().optional().default(false)
    })
    const body = schema.parse(req.body || {})
    const projects = await query(
      `SELECT id, owner_id, title, status, content FROM projects WHERE id = :id LIMIT 1`,
      { id }
    )
    if (!projects.length) throw new HttpError(404, '项目不存在')
    const project = projects[0]
    if (Number(project.owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '仅项目负责人可发招人动态')
    }
    if (project.status === 'archived') throw new HttpError(400, '项目已归档')

    const role = body.role.trim()
    const text = body.body.trim()
    const line = `【招人·${role}】${text}`
    const meta = parseMeta(project.content)
    if (!Array.isArray(meta.roles)) meta.roles = []
    if (!meta.roles.includes(role)) meta.roles.push(role)
    if (!Array.isArray(meta.timeline)) meta.timeline = []
    meta.timeline.unshift(['刚刚', line])
    meta.latestRecruit = { role, body: text, at: new Date().toISOString() }
    if (body.syncPlaza) meta.acceptApplications = true
    if (Array.isArray(meta.team)) {
      const hasSlot = meta.team.some((t) => t && t.empty && String(t.empty).includes(role))
      if (!hasSlot) meta.team.push({ empty: `+ 待加入 · ${role}` })
    }

    const result = await withTransaction(async (conn) => {
      const [post] = await conn.execute(
        `INSERT INTO project_recruit_posts (project_id, author_id, role_wanted, body, sync_plaza)
         VALUES (:pid, :uid, :role, :body, :sync)`,
        {
          pid: id,
          uid: req.user.id,
          role,
          body: text,
          sync: body.syncPlaza ? 1 : 0
        }
      )
      await conn.execute(
        `INSERT INTO project_timeline (project_id, author_id, content)
         VALUES (:pid, :uid, :content)`,
        { pid: id, uid: req.user.id, content: line }
      )
      const statusSql = body.syncPlaza
        ? `, status = IF(status = 'done' OR status = 'archived', status, 'recruiting')`
        : ''
      await conn.execute(
        `UPDATE projects SET content = :content${statusSql} WHERE id = :id`,
        { id, content: JSON.stringify(meta) }
      )

      let forumPostId = null
      if (body.syncCommunity) {
        const [boards] = await conn.execute(
          `SELECT id FROM forum_boards WHERE slug IN ('recruit', 'general') ORDER BY FIELD(slug, 'recruit', 'general') LIMIT 1`
        )
        if (boards.length) {
          const title = `【招人·${role}】${String(project.title || '项目').slice(0, 40)}`
          const content = [
            text,
            '',
            `角色：${role}`,
            `来自项目：「${project.title}」`,
            `项目主页可申请加入（项目 ID：${id}）。`
          ].join('\n')
          const [fp] = await conn.execute(
            `INSERT INTO forum_posts (board_id, author_id, title, content, tags_json)
             VALUES (:boardId, :authorId, :title, :content, :tags)`,
            {
              boardId: boards[0].id,
              authorId: req.user.id,
              title: title.slice(0, 120),
              content: content.slice(0, 20000),
              tags: JSON.stringify(['招人', role].filter(Boolean).slice(0, 8))
            }
          )
          forumPostId = fp.insertId
        }
      }

      return { postId: post.insertId, forumPostId }
    })

    if (result.forumPostId) {
      try {
        await cacheDel('forum:boards')
      } catch {
        /* ignore cache */
      }
    }

    ok(
      res,
      {
        postId: result.postId,
        forumPostId: result.forumPostId || null,
        projectId: id,
        role,
        body: text,
        syncPlaza: !!body.syncPlaza,
        syncCommunity: !!body.syncCommunity,
        line
      },
      result.forumPostId ? '招人动态已发布，并已发到社区' : '招人动态已发布'
    )
  })
)

/** 负责人主动邀请同学 */
router.post(
  '/:id/invites',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const schema = z.object({
      who: z.string().min(1).max(64).optional(),
      inviteeId: z.number().int().positive().optional(),
      note: z.string().max(500).optional().default('')
    })
    const body = schema.parse(req.body || {})
    if (!body.inviteeId && !body.who) throw new HttpError(400, '请填写邀请对象')

    const projects = await query(
      `SELECT id, owner_id, title, status FROM projects WHERE id = :id LIMIT 1`,
      { id }
    )
    if (!projects.length) throw new HttpError(404, '项目不存在')
    const project = projects[0]
    if (Number(project.owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '仅项目负责人可邀请')
    }
    if (project.status === 'archived') throw new HttpError(400, '项目已归档')

    let invitee
    if (body.inviteeId) {
      const rows = await query(
        `SELECT id, display_name, student_no, avatar_char FROM users WHERE id = :id LIMIT 1`,
        { id: body.inviteeId }
      )
      if (!rows.length) throw new HttpError(404, '找不到该同学')
      invitee = rows[0]
    } else {
      const who = body.who.trim()
      const rows = await query(
        `SELECT id, display_name, student_no, avatar_char FROM users
         WHERE display_name = :who OR student_no = :who
         ORDER BY id ASC LIMIT 5`,
        { who }
      )
      if (!rows.length) {
        const fuzzy = await query(
          `SELECT id, display_name, student_no, avatar_char FROM users
           WHERE display_name LIKE :q OR student_no LIKE :q
           ORDER BY id ASC LIMIT 5`,
          { q: `%${who}%` }
        )
        if (!fuzzy.length) throw new HttpError(404, `找不到「${who}」，请核对姓名或学号`)
        if (fuzzy.length > 1) {
          throw new HttpError(400, `匹配到多人（${fuzzy.map((u) => u.display_name).join('、')}），请用精确姓名或学号`)
        }
        invitee = fuzzy[0]
      } else if (rows.length > 1) {
        throw new HttpError(400, `匹配到多人，请用精确学号邀请`)
      } else {
        invitee = rows[0]
      }
    }

    if (Number(invitee.id) === Number(req.user.id)) throw new HttpError(400, '不能邀请自己')
    if (Number(invitee.id) === Number(project.owner_id)) throw new HttpError(400, '对方已是项目方')

    const existingMember = await query(
      `SELECT 1 AS ok FROM project_members WHERE project_id = :id AND user_id = :uid LIMIT 1`,
      { id, uid: invitee.id }
    )
    if (existingMember.length) throw new HttpError(400, '对方已在项目中')

    const note = String(body.note || '').trim()
    const prev = await query(
      `SELECT id, status FROM project_invites WHERE project_id = :id AND invitee_id = :uid LIMIT 1`,
      { id, uid: invitee.id }
    )
    let inviteId
    if (prev.length) {
      if (prev[0].status === 'pending') throw new HttpError(409, '已有待处理邀请')
      if (prev[0].status === 'accepted') throw new HttpError(400, '对方已接受过邀请')
      await query(
        `UPDATE project_invites
         SET status = 'pending', note = :note, inviter_id = :iid,
             created_at = CURRENT_TIMESTAMP, responded_at = NULL
         WHERE id = :id`,
        { id: prev[0].id, note, iid: req.user.id }
      )
      inviteId = prev[0].id
    } else {
      const result = await query(
        `INSERT INTO project_invites (project_id, inviter_id, invitee_id, note, status)
         VALUES (:pid, :iid, :uid, :note, 'pending')`,
        { pid: id, iid: req.user.id, uid: invitee.id, note }
      )
      inviteId = result.insertId
    }

    await query(
      `INSERT INTO project_timeline (project_id, author_id, content)
       VALUES (:pid, :uid, :content)`,
      {
        pid: id,
        uid: req.user.id,
        content: `邀请 ${invitee.display_name} 加入团队`
      }
    )

    ok(
      res,
      {
        inviteId,
        projectId: id,
        invitee: {
          id: invitee.id,
          name: invitee.display_name,
          studentNo: invitee.student_no,
          avatarChar: invitee.avatar_char
        },
        note,
        status: 'pending'
      },
      '邀请已发送'
    )
  })
)

router.post(
  '/:id/feedback',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const schema = z.object({ content: z.string().min(2).max(5000) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) throw new HttpError(400, '参数错误', parsed.error.flatten())
    const projects = await query(`SELECT id FROM projects WHERE id = :id LIMIT 1`, { id })
    if (!projects.length) throw new HttpError(404, '项目不存在')
    await query(
      `INSERT INTO project_feedback (project_id, author_id, content) VALUES (:id, :uid, :content)`,
      { id, uid: req.user.id, content: parsed.data.content }
    )
    ok(res, { projectId: id }, '反馈已提交')
  })
)

/** 回链：给项目成员均分积分 */
router.post(
  '/:id/backlink',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const schema = z.object({
      entry: z.enum(['plaza', 'feedback', 'discuss']).default('plaza')
    })
    const parsed = schema.safeParse(req.body || {})
    if (!parsed.success) throw new HttpError(400, '参数错误', parsed.error.flatten())
    const { entry } = parsed.data
    const totalGain = 8

    const data = await withTransaction(async (conn) => {
      const [projects] = await conn.execute(
        `SELECT id, title FROM projects WHERE id = :id LIMIT 1`,
        { id }
      )
      if (!projects.length) throw new HttpError(404, '项目不存在')

      const [members] = await conn.execute(
        `SELECT user_id FROM project_members WHERE project_id = :id`,
        { id }
      )
      const targets = members.length ? members : [{ user_id: req.user.id }]
      const each = Math.max(1, Math.floor(totalGain / targets.length))

      await conn.execute(
        `INSERT INTO backlink_events (project_id, entry, visitor_id, points_each, member_count)
         VALUES (:id, :entry, :uid, :each, :mc)`,
        { id, entry, uid: req.user.id, each, mc: targets.length }
      )

      for (const m of targets) {
        const [users] = await conn.execute(
          `SELECT id, points FROM users WHERE id = :uid LIMIT 1 FOR UPDATE`,
          { uid: m.user_id }
        )
        if (!users.length) continue
        const balance = users[0].points + each
        await conn.execute(`UPDATE users SET points = :balance WHERE id = :uid`, {
          balance,
          uid: m.user_id
        })
        await conn.execute(
          `INSERT INTO points_ledger (user_id, delta, balance, reason, ref_type, ref_id)
           VALUES (:uid, :delta, :balance, :reason, 'backlink', :ref)`,
          {
            uid: m.user_id,
            delta: each,
            balance,
            reason: `回链流量·${projects[0].title}`,
            ref: id
          }
        )
      }

      await conn.execute(
        `UPDATE projects SET backlink_count = backlink_count + 1, points_earned = points_earned + :gain
         WHERE id = :id`,
        { id, gain: totalGain }
      )

      const [countRows] = await conn.execute(
        `SELECT COUNT(*) AS c FROM backlink_events WHERE project_id = :id`,
        { id }
      )
      return {
        projectId: id,
        title: projects[0].title,
        entry,
        gain: totalGain,
        backlinkCount: Number(countRows[0]?.c || 0)
      }
    })

    ok(res, data, '回链已记录')
  })
)

module.exports = router
