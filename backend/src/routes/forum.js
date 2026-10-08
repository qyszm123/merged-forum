const { z } = require('zod')
const { query, withTransaction } = require('../db/pool')
const { cacheGet, cacheSet, cacheDel } = require('../db/redis')
const { authRequired, optionalAuth } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')
const { checkAndAwardBadges } = require('../services/badges')

const router = require('express').Router()

/** 给作者对象批量附加第一个佩戴勋章（避免 N+1 查询） */
async function attachDisplayedBadges(authors) {
  const ids = [...new Set((authors || []).map((a) => a && a.id).filter(Boolean))]
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(',')
  const rows = await query(
    `SELECT ub.user_id, b.id AS badge_id, b.name, b.icon
     FROM user_badges ub
     JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id IN (${placeholders}) AND ub.is_displayed = 1 AND b.is_active = 1
     ORDER BY ub.user_id ASC, ub.id ASC`,
    ids
  )
  const byUser = {}
  for (const r of rows) {
    if (!byUser[r.user_id]) byUser[r.user_id] = { id: r.badge_id, name: r.name, icon: r.icon }
  }
  for (const a of authors || []) {
    if (a && byUser[a.id]) a.badge = byUser[a.id]
  }
}

const createPostSchema = z.object({
  boardSlug: z.string().min(1).max(32),
  title: z.string().min(2).max(120),
  content: z.string().min(1).max(20000),
  tags: z.array(z.string().max(20)).max(8).optional(),
  projectId: z.number().int().positive().optional().nullable(),
  ideaId: z.number().int().positive().optional().nullable(),
  attachments: z.array(z.number().int().positive()).max(10).optional()
})

const createCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  parentId: z.number().int().positive().optional().nullable()
})

const POST_SELECT_BINDS = `
             pr.id AS bind_project_id, pr.title AS bind_project_title,
             ide.id AS bind_idea_id, ide.title AS bind_idea_title`

const POST_JOIN_BINDS = `
      LEFT JOIN projects pr ON pr.id = p.project_id AND pr.status != 'archived'
      LEFT JOIN ideas ide ON ide.id = p.idea_id AND ide.status != 'archived'`

router.get(
  '/boards',
  asyncHandler(async (_req, res) => {
    const cacheKey = 'forum:boards'
    const cached = await cacheGet(cacheKey)
    if (cached) return ok(res, cached)
    const rows = await query(
      'SELECT id, slug, title, description, sort_order FROM forum_boards ORDER BY sort_order, id'
    )
    await cacheSet(cacheKey, rows, 300)
    ok(res, rows)
  })
)

router.get(
  '/posts',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)))
    const boardSlug = req.query.board || null
    const q = (req.query.q || '').trim()
    const sort = String(req.query.sort || 'new')
    const offset = (page - 1) * pageSize

    const where = ['p.status = "published"']
    const params = {}
    if (boardSlug && boardSlug !== 'all') {
      where.push('b.slug = :boardSlug')
      params.boardSlug = boardSlug
    }
    if (q) {
      where.push('(MATCH(p.title, p.content) AGAINST (:q IN BOOLEAN MODE) OR p.title LIKE :qLike)')
      params.q = `${q}*`
      params.qLike = `%${q}%`
    }

    let orderBy = 'p.is_pinned DESC, p.created_at DESC'
    if (sort === 'hot') orderBy = 'p.is_pinned DESC, p.like_count DESC, p.comment_count DESC, p.created_at DESC'
    if (sort === 'unsolved') {
      where.push('p.comment_count = 0')
      orderBy = 'p.is_pinned DESC, p.created_at DESC'
    }

    const sql = `
      SELECT p.id, p.title, p.content, p.like_count, p.comment_count, p.view_count, p.is_pinned, p.is_hot,
             p.tags_json, p.created_at, p.project_id, p.idea_id,
             COALESCE(p.bookmark_count, 0) AS bookmark_count,
             b.slug AS board_slug, b.title AS board_title,
             u.id AS author_id, u.display_name AS author_name, u.avatar_char, u.role AS author_role,
             ${POST_SELECT_BINDS}
      FROM forum_posts p
      JOIN forum_boards b ON b.id = p.board_id
      JOIN users u ON u.id = p.author_id
      ${POST_JOIN_BINDS}
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${pageSize} OFFSET ${offset}`

    const countSql = `
      SELECT COUNT(*) AS total
      FROM forum_posts p
      JOIN forum_boards b ON b.id = p.board_id
      WHERE ${where.join(' AND ')}`

    const [list, countRows] = await Promise.all([query(sql, params), query(countSql, params)])
    const mapped = list.map(mapPostBrief)
    await attachDisplayedBadges(mapped.map((m) => m.author))
    ok(res, {
      list: mapped,
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

router.get(
  '/posts/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(
      `SELECT p.*, b.slug AS board_slug, b.title AS board_title,
              u.id AS author_id, u.display_name AS author_name, u.avatar_char, u.role AS author_role,
              ${POST_SELECT_BINDS}
       FROM forum_posts p
       JOIN forum_boards b ON b.id = p.board_id
       JOIN users u ON u.id = p.author_id
       ${POST_JOIN_BINDS}
       WHERE p.id = :id AND p.status = "published" LIMIT 1`,
      { id }
    )
    if (!rows.length) throw new HttpError(404, '帖子不存在')
    await query('UPDATE forum_posts SET view_count = view_count + 1 WHERE id = :id', { id })
    const comments = await query(
      `SELECT c.id, c.content, c.parent_id, c.created_at,
              COALESCE(c.like_count, 0) AS like_count,
              u.id AS author_id, u.display_name AS author_name, u.avatar_char, u.role AS author_role
       FROM forum_comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.post_id = :id AND COALESCE(c.status, 'published') = 'published'
       ORDER BY c.created_at ASC
       LIMIT 200`,
      { id }
    )
    const post = rows[0]
    // 解析附件并查文件信息
    let attachmentFiles = []
    let attIds = []
    try {
      attIds = typeof post.attachments === 'string' ? JSON.parse(post.attachments) : post.attachments || []
    } catch {}
    if (attIds.length) {
      const placeholders = attIds.map(() => '?').join(',')
      const attRows = await query(
        `SELECT id, original_name, size_bytes, mime_type FROM uploads WHERE id IN (${placeholders})`,
        attIds
      )
      attachmentFiles = attRows.map((r) => ({
        id: r.id,
        name: r.original_name,
        size: Number(r.size_bytes || 0),
        mimeType: r.mime_type,
        url: `/api/uploads/${r.id}/file`
      }))
    }
    const postMapped = mapPostBrief(post)
    const commentsMapped = comments.map((c) => ({
      id: c.id,
      content: c.content,
      likeCount: c.like_count,
      parentId: c.parent_id,
      createdAt: c.created_at,
      author: { id: c.author_id, name: c.author_name, avatarChar: c.avatar_char, role: c.author_role }
    }))
    await attachDisplayedBadges([postMapped.author, ...commentsMapped.map((c) => c.author)])
    ok(res, {
      ...postMapped,
      content: post.content,
      attachments: attachmentFiles,
      comments: commentsMapped
    })
  })
)

router.post(
  '/posts',
  authRequired,
  asyncHandler(async (req, res) => {
    const body = createPostSchema.parse(req.body)
    const boards = await query('SELECT id FROM forum_boards WHERE slug = :slug LIMIT 1', {
      slug: body.boardSlug
    })
    if (!boards.length) throw new HttpError(400, '板块不存在')

    let projectId = body.projectId || null
    let ideaId = body.ideaId || null
    if (projectId && ideaId) throw new HttpError(400, '一次只能绑定一个项目或点子')

    if (projectId) {
      const owned = await query(
        `SELECT id FROM projects WHERE id = :id AND owner_id = :uid AND status != 'archived' LIMIT 1`,
        { id: projectId, uid: req.user.id }
      )
      if (!owned.length) throw new HttpError(403, '只能绑定自己发布的项目')
    }
    if (ideaId) {
      const owned = await query(
        `SELECT id FROM ideas WHERE id = :id AND owner_id = :uid AND status != 'archived' LIMIT 1`,
        { id: ideaId, uid: req.user.id }
      )
      if (!owned.length) throw new HttpError(403, '只能绑定自己发布的点子')
    }

    // 附件：验证归属当前用户
    let attachments = body.attachments || null
    if (attachments && attachments.length) {
      const placeholders = attachments.map(() => '?').join(',')
      const owned = await query(
        `SELECT id FROM uploads WHERE id IN (${placeholders}) AND user_id = ?`,
        [...attachments, req.user.id]
      )
      const ownedIds = new Set(owned.map((r) => r.id))
      attachments = attachments.filter((id) => ownedIds.has(id))
      if (!attachments.length) attachments = null
    }

    const result = await query(
      `INSERT INTO forum_posts (board_id, author_id, project_id, idea_id, title, content, tags_json, attachments)
       VALUES (:boardId, :authorId, :projectId, :ideaId, :title, :content, :tags, :attachments)`,
      {
        boardId: boards[0].id,
        authorId: req.user.id,
        projectId,
        ideaId,
        title: body.title,
        content: body.content,
        tags: JSON.stringify(body.tags || []),
        attachments: attachments ? JSON.stringify(attachments) : null
      }
    )
    await cacheDel('forum:boards')
    checkAndAwardBadges(req.user.id).catch(() => {})
    ok(res, { id: result.insertId }, '发帖成功')
  })
)

router.post(
  '/posts/:id/comments',
  authRequired,
  asyncHandler(async (req, res) => {
    const postId = Number(req.params.id)
    const body = createCommentSchema.parse(req.body)
    const posts = await query('SELECT id FROM forum_posts WHERE id = :id AND status = "published"', {
      id: postId
    })
    if (!posts.length) throw new HttpError(404, '帖子不存在')
    const result = await withTransaction(async (conn) => {
      const [r] = await conn.execute(
        `INSERT INTO forum_comments (post_id, author_id, parent_id, content)
         VALUES (:postId, :authorId, :parentId, :content)`,
        {
          postId,
          authorId: req.user.id,
          parentId: body.parentId || null,
          content: body.content
        }
      )
      await conn.execute('UPDATE forum_posts SET comment_count = comment_count + 1 WHERE id = :id', {
        id: postId
      })
      return r
    })
    checkAndAwardBadges(req.user.id).catch(() => {})
    ok(res, { id: result.insertId }, '评论成功')
  })
)

router.post(
  '/posts/:id/like',
  authRequired,
  asyncHandler(async (req, res) => {
    const postId = Number(req.params.id)
    const liked = await withTransaction(async (conn) => {
      try {
        await conn.execute(
          `INSERT INTO forum_likes (user_id, target_type, target_id) VALUES (:uid, 'post', :tid)`,
          { uid: req.user.id, tid: postId }
        )
        await conn.execute('UPDATE forum_posts SET like_count = like_count + 1 WHERE id = :id', {
          id: postId
        })
        return true
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          await conn.execute(
            `DELETE FROM forum_likes WHERE user_id = :uid AND target_type = 'post' AND target_id = :tid`,
            { uid: req.user.id, tid: postId }
          )
          await conn.execute(
            'UPDATE forum_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = :id',
            { id: postId }
          )
          return false
        }
        throw err
      }
    })
    const rows = await query('SELECT like_count, author_id FROM forum_posts WHERE id = :id', { id: postId })
    if (liked) checkAndAwardBadges(rows[0]?.author_id).catch(() => {})
    ok(res, { liked, likeCount: rows[0]?.like_count ?? 0 })
  })
)

/* ============ 收藏 ============ */

router.post(
  '/posts/:id/bookmark',
  authRequired,
  asyncHandler(async (req, res) => {
    const postId = Number(req.params.id)
    // 帖子必须存在
    const exists = await query('SELECT id FROM forum_posts WHERE id = :id AND status = "published" LIMIT 1', { id: postId })
    if (!exists.length) throw new HttpError(404, '帖子不存在')
    const bookmarked = await withTransaction(async (conn) => {
      try {
        await conn.execute(
          'INSERT INTO forum_bookmarks (user_id, post_id) VALUES (:uid, :pid)',
          { uid: req.user.id, pid: postId }
        )
        await conn.execute(
          'UPDATE forum_posts SET bookmark_count = COALESCE(bookmark_count, 0) + 1 WHERE id = :id',
          { id: postId }
        )
        return true
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          await conn.execute(
            'DELETE FROM forum_bookmarks WHERE user_id = :uid AND post_id = :pid',
            { uid: req.user.id, pid: postId }
          )
          await conn.execute(
            'UPDATE forum_posts SET bookmark_count = GREATEST(COALESCE(bookmark_count, 0) - 1, 0) WHERE id = :id',
            { id: postId }
          )
          return false
        }
        throw err
      }
    })
    const rows = await query('SELECT COALESCE(bookmark_count, 0) AS bm_count FROM forum_posts WHERE id = :id', { id: postId })
    ok(res, { bookmarked, bookmarkCount: rows[0]?.bm_count ?? 0 })
  })
)

router.get(
  '/bookmarks',
  authRequired,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)))
    const offset = (page - 1) * pageSize
    const uid = req.user.id

    const list = await query(
      `SELECT p.id, p.title, p.content, p.like_count, p.comment_count, p.view_count,
              p.is_pinned, p.is_hot, p.tags_json, p.created_at,
              p.bookmark_count,
              b.slug AS board_slug, b.title AS board_title,
              u.id AS author_id, u.display_name AS author_name, u.avatar_char, u.role AS author_role,
              bm.created_at AS bookmarked_at
       FROM forum_bookmarks bm
       JOIN forum_posts p ON p.id = bm.post_id AND p.status = 'published'
       JOIN forum_boards b ON b.id = p.board_id
       JOIN users u ON u.id = p.author_id
       WHERE bm.user_id = :uid
       ORDER BY bm.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      { uid }
    )
    const countRows = await query(
      'SELECT COUNT(*) AS total FROM forum_bookmarks WHERE user_id = :uid',
      { uid }
    )
    ok(res, {
      list: list.map((p) => ({ ...mapPostBrief(p), bookmarkedAt: p.bookmarked_at })),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

function mapPostBrief(p) {
  let tags = []
  try {
    tags = typeof p.tags_json === 'string' ? JSON.parse(p.tags_json) : p.tags_json || []
  } catch {
    tags = []
  }
  const project = p.bind_project_id
    ? { id: p.bind_project_id, title: p.bind_project_title || '', kind: 'project' }
    : p.project_id
      ? { id: p.project_id, title: '', kind: 'project' }
      : null
  const idea = p.bind_idea_id
    ? { id: p.bind_idea_id, title: p.bind_idea_title || '', kind: 'idea' }
    : p.idea_id
      ? { id: p.idea_id, title: '', kind: 'idea' }
      : null
  return {
    id: p.id,
    title: p.title,
    content: p.content || '',
    likeCount: p.like_count,
    commentCount: p.comment_count,
    viewCount: p.view_count,
    bookmarkCount: p.bookmark_count || 0,
    isPinned: !!p.is_pinned,
    isHot: !!p.is_hot,
    tags,
    createdAt: p.created_at,
    board: { slug: p.board_slug, title: p.board_title },
    project,
    idea,
    author: {
      id: p.author_id,
      name: p.author_name,
      avatarChar: p.avatar_char,
      role: p.author_role || 'student'
    }
  }
}

/* ============ 论坛首页公告弹窗 ============ */

/** GET /api/forum/overview 论坛概览：统计 + 版主/管理员 + 置顶公告 + 当前用户签到状态 */
router.get(
  '/overview',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const today = localDate()

    const [postCount, memberCount, todayCount, staff, notices] = await Promise.all([
      query(`SELECT COUNT(*) AS c FROM forum_posts WHERE status = 'published'`),
      query(`SELECT COUNT(*) AS c FROM users`),
      query(`SELECT COUNT(*) AS c FROM forum_posts WHERE status = 'published' AND created_at >= :start`, {
        start: `${today} 00:00:00`
      }),
      query(
        `SELECT id, display_name, avatar_char, role, rank_label
         FROM users
         WHERE role IN ('admin', 'teacher')
         ORDER BY FIELD(role, 'admin', 'teacher'), id
         LIMIT 20`
      ),
      query(
        `SELECT p.id, p.title, p.comment_count, p.created_at, p.updated_at,
                b.slug AS board_slug, b.title AS board_title,
                lc.last_reply_name, lc.last_reply_avatar, lc.last_reply_at
         FROM forum_posts p
         JOIN forum_boards b ON b.id = p.board_id
         LEFT JOIN (
           SELECT c.post_id, u.display_name AS last_reply_name,
                  u.avatar_char AS last_reply_avatar, c.created_at AS last_reply_at
           FROM forum_comments c
           JOIN users u ON u.id = c.author_id
           JOIN (
             SELECT post_id, MAX(id) AS max_id
             FROM forum_comments
             WHERE COALESCE(status, 'published') = 'published'
             GROUP BY post_id
           ) mx ON mx.max_id = c.id
         ) lc ON lc.post_id = p.id
         WHERE p.status = 'published' AND p.is_pinned = 1
         ORDER BY p.created_at DESC
         LIMIT 8`
      )
    ])

    // 当前用户签到状态（未登录则不返回）
    let checkin = null
    if (req.user) {
      const cRows = await query(
        `SELECT COUNT(*) AS days FROM user_checkins WHERE user_id = :uid`,
        { uid: req.user.id }
      )
      const tRows = await query(
        `SELECT id FROM user_checkins WHERE user_id = :uid AND checkin_day = :day LIMIT 1`,
        { uid: req.user.id, day: today }
      )
      checkin = {
        totalDays: Number(cRows[0]?.days || 0),
        checkedToday: tRows.length > 0
      }
    }

    ok(res, {
      stats: {
        postCount: Number(postCount[0]?.c || 0),
        memberCount: Number(memberCount[0]?.c || 0),
        todayCount: Number(todayCount[0]?.c || 0),
        onlineCount: req.user ? 1 : 0 // 在线人数由前端按活跃/伪随机补充，后端不做实时心跳
      },
      staff: staff.map((s) => ({
        id: s.id,
        name: s.display_name,
        avatarChar: s.avatar_char,
        role: s.role,
        rankLabel: s.rank_label
      })),
      notices: notices.map((n) => ({
        id: n.id,
        title: n.title,
        board: { slug: n.board_slug, title: n.board_title },
        commentCount: n.comment_count,
        lastReplyAt: n.last_reply_at || n.updated_at || n.created_at,
        lastReplyBy: n.last_reply_name || null,
        lastReplyAvatar: n.last_reply_avatar || null
      })),
      checkin
    })
  })
)

/** POST /api/forum/checkin 每日签到（奖励 5 积分） */
router.post(
  '/checkin',
  authRequired,
  asyncHandler(async (req, res) => {
    const today = localDate()
    const reward = 5

    const result = await withTransaction(async (conn) => {
      try {
        await conn.execute(
          `INSERT INTO user_checkins (user_id, checkin_day, reward) VALUES (:uid, :day, :reward)`,
          { uid: req.user.id, day: today, reward }
        )
        await conn.execute(
          `UPDATE users SET points = points + :reward WHERE id = :uid`,
          { uid: req.user.id, reward }
        )
        await conn.execute(
          `INSERT INTO points_ledger (user_id, delta, balance, reason, ref_type, ref_id)
           VALUES (:uid, :reward, (SELECT points FROM users WHERE id = :uid), '每日签到', 'checkin', NULL)`,
          { uid: req.user.id, reward }
        )
        return { success: true }
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return { success: false, duplicate: true }
        throw err
      }
    })

    if (result.duplicate) throw new HttpError(400, '今天已经签到过了')

    const cRows = await query(
      `SELECT COUNT(*) AS days FROM user_checkins WHERE user_id = :uid`,
      { uid: req.user.id }
    )
    const pRows = await query(`SELECT points FROM users WHERE id = :uid`, { uid: req.user.id })
    checkAndAwardBadges(req.user.id).catch(() => {})
    ok(
      res,
      {
        checkedToday: true,
        totalDays: Number(cRows[0]?.days || 0),
        reward,
        points: pRows[0]?.points ?? 0
      },
      `签到成功，给予 ${reward} 积分奖励`
    )
  })
)

/** 本地时区日期 YYYY-MM-DD */
function localDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** POST /api/forum/posts/:id/report 举报帖子（普通用户） */
const reportSchema = z.object({ reason: z.string().min(2).max(500) })
router.post(
  '/posts/:id/report',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const body = reportSchema.parse(req.body)
    const posts = await query(`SELECT id, author_id FROM forum_posts WHERE id = :id LIMIT 1`, { id })
    if (!posts.length) throw new HttpError(404, '帖子不存在')
    if (Number(posts[0].author_id) === Number(req.user.id)) throw new HttpError(400, '不能举报自己的帖子')
    try {
      const r = await query(
        `INSERT INTO post_reports (reporter_id, post_id, reason) VALUES (:uid, :pid, :reason)`,
        { uid: req.user.id, pid: id, reason: body.reason }
      )
      ok(res, { id: r.insertId }, '举报已提交，等待管理员审核')
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(400, '你已举报过该帖子')
      throw err
    }
  })
)

/** POST /api/forum/comments/:id/report 举报评论（普通用户） */
router.post(
  '/comments/:id/report',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const body = reportSchema.parse(req.body)
    const rows = await query(
      `SELECT c.id, c.author_id, c.post_id FROM forum_comments c WHERE c.id = :id LIMIT 1`,
      { id }
    )
    if (!rows.length) throw new HttpError(404, '评论不存在')
    const comment = rows[0]
    if (Number(comment.author_id) === Number(req.user.id)) throw new HttpError(400, '不能举报自己的评论')
    try {
      const r = await query(
        `INSERT INTO post_reports (reporter_id, comment_id, reason) VALUES (:uid, :cid, :reason)`,
        { uid: req.user.id, cid: id, reason: body.reason }
      )
      ok(res, { id: r.insertId }, '举报已提交，等待管理员审核')
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(400, '你已举报过该评论')
      throw err
    }
  })
)

module.exports = router
