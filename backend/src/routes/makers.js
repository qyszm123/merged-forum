const { query } = require('../db/pool')
const { optionalAuth } = require('../middleware/auth')
const { ok, HttpError, asyncHandler } = require('../utils/http')

const router = require('express').Router()

/** 人才广场无自定义头像时按用户 id 轮换真人照片 */
const MAKER_AVATAR_POOL = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=200&h=200&q=80'
]

function defaultMakerAvatarUrl(id) {
  const n = Math.abs(Number(id) || 0)
  return MAKER_AVATAR_POOL[n % MAKER_AVATAR_POOL.length]
}

function resolveMakerAvatarUrl(row) {
  if (row.avatar_url) return row.avatar_url
  return defaultMakerAvatarUrl(row.id)
}

function parseMeta(content) {
  if (!content) return {}
  if (typeof content === 'object') return content
  try {
    return JSON.parse(content)
  } catch {
    return {}
  }
}

function projectAcceptsApplications(row) {
  const meta = parseMeta(row.content)
  if (row.status === 'archived' || row.status === 'done') return false
  if (typeof meta.acceptApplications === 'boolean') return meta.acceptApplications
  return row.status === 'recruiting'
}

function mapOpenProject(row) {
  const meta = parseMeta(row.content)
  return {
    id: row.id,
    title: row.title,
    summary: row.summary || '',
    status: row.status,
    roles: Array.isArray(meta.roles) ? meta.roles : [],
    acceptApplications: true
  }
}

/** 人才广场：有身份标签的用户（创造者等） */
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 24)))
    const offset = (page - 1) * pageSize

    const list = await query(
      `SELECT u.id, u.student_no, u.display_name, u.avatar_char, u.avatar_url, u.role, u.rank_label,
              u.points, u.grade, u.class_name,
              GROUP_CONCAT(ui.identity ORDER BY ui.id SEPARATOR ',') AS identities_csv,
              (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id AND p.status != 'archived') AS project_count,
              (SELECT p.title FROM projects p WHERE p.owner_id = u.id AND p.status != 'archived'
                ORDER BY p.updated_at DESC, p.id DESC LIMIT 1) AS latest_project,
              (SELECT COALESCE(p.like_count, 0) FROM projects p WHERE p.owner_id = u.id AND p.status != 'archived'
                ORDER BY p.updated_at DESC, p.id DESC LIMIT 1) AS latest_project_likes
       FROM users u
       INNER JOIN user_identities ui ON ui.user_id = u.id
       WHERE u.role != 'admin'
       GROUP BY u.id
       ORDER BY u.points DESC, u.id ASC
       LIMIT ${pageSize} OFFSET ${offset}`
    )

    const countRows = await query(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       INNER JOIN user_identities ui ON ui.user_id = u.id
       WHERE u.role != 'admin'`
    )

    const ownerIds = list.map((u) => u.id)
    let openByOwner = new Map()
    if (ownerIds.length) {
      const placeholders = ownerIds.map((_, i) => `:id${i}`).join(',')
      const params = {}
      ownerIds.forEach((id, i) => {
        params[`id${i}`] = id
      })
      const openRows = await query(
        `SELECT id, owner_id, title, summary, status, content
         FROM projects
         WHERE owner_id IN (${placeholders})
           AND status NOT IN ('archived', 'done')
         ORDER BY updated_at DESC, id DESC`,
        params
      )
      for (const row of openRows) {
        if (!projectAcceptsApplications(row)) continue
        const oid = Number(row.owner_id)
        if (!openByOwner.has(oid)) openByOwner.set(oid, [])
        const bucket = openByOwner.get(oid)
        if (bucket.length < 5) bucket.push(mapOpenProject(row))
      }
    }

    ok(res, {
      list: list.map((u) => {
        const openProjects = openByOwner.get(Number(u.id)) || []
        return {
          id: u.id,
          studentNo: u.student_no,
          displayName: u.display_name,
          avatarChar: u.avatar_char || u.display_name.slice(0, 1),
          avatarUrl: resolveMakerAvatarUrl(u),
          role: u.role,
          rankLabel: u.rank_label,
          points: u.points,
          grade: u.grade,
          className: u.class_name,
          identities: u.identities_csv ? u.identities_csv.split(',') : [],
          projectCount: Number(u.project_count || 0),
          latestProject: u.latest_project || '',
          latestProjectLikes: Number(u.latest_project_likes || 0),
          openProjects,
          openRecruit: openProjects.length > 0
        }
      }),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

/** 人才公开主页 */
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const uid = Number(req.params.id)
    if (!Number.isFinite(uid) || uid <= 0) {
      return ok(res, null)
    }
    const rows = await query(
      `SELECT u.id, u.student_no, u.display_name, u.avatar_char, u.avatar_url, u.role, u.rank_label,
              u.points, u.grade, u.class_name,
              GROUP_CONCAT(ui.identity ORDER BY ui.id SEPARATOR ',') AS identities_csv
       FROM users u
       LEFT JOIN user_identities ui ON ui.user_id = u.id
       WHERE u.id = :uid AND u.role != 'admin'
       GROUP BY u.id
       LIMIT 1`,
      { uid }
    )
    if (!rows.length) throw new HttpError(404, '用户不存在')
    const u = rows[0]
    const projects = await query(
      `SELECT id, title, summary, status, like_count, cover_url, created_at, content
       FROM projects
       WHERE owner_id = :uid AND status != 'archived'
       ORDER BY updated_at DESC, id DESC
       LIMIT 40`,
      { uid }
    )
    const openProjects = projects.filter(projectAcceptsApplications).map(mapOpenProject)
    ok(res, {
      id: u.id,
      studentNo: u.student_no,
      displayName: u.display_name,
      avatarChar: u.avatar_char || String(u.display_name || '?').slice(0, 1),
      avatarUrl: resolveMakerAvatarUrl(u),
      role: u.role,
      rankLabel: u.rank_label,
      points: u.points,
      grade: u.grade,
      className: u.class_name,
      identities: u.identities_csv ? u.identities_csv.split(',').filter(Boolean) : [],
      projectCount: projects.length,
      openRecruit: openProjects.length > 0,
      openProjects,
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        summary: p.summary || '',
        status: p.status,
        likeCount: Number(p.like_count || 0),
        coverUrl: p.cover_url || '',
        createdAt: p.created_at,
        acceptApplications: projectAcceptsApplications(p)
      }))
    })
  })
)

/** 某人才正在招募的项目（供申请入队选队） */
router.get(
  '/:id/open-projects',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const uid = Number(req.params.id)
    const rows = await query(
      `SELECT id, owner_id, title, summary, status, content
       FROM projects
       WHERE owner_id = :uid AND status NOT IN ('archived', 'done')
       ORDER BY updated_at DESC, id DESC
       LIMIT 20`,
      { uid }
    )
    const list = rows.filter(projectAcceptsApplications).map(mapOpenProject)
    ok(res, { list, userId: uid })
  })
)

module.exports = router
