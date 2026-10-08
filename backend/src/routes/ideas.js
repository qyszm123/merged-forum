const { z } = require('zod')
const { query, withTransaction } = require('../db/pool')
const { authRequired, optionalAuth } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')

const router = require('express').Router()

/** 点子无自定义封面时按 id 轮换，与作品封面池错开 */
const IDEA_COVER_POOL = [
  'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=800&h=450&q=80'
]

function defaultIdeaCoverUrl(id) {
  const n = Math.abs(Number(id) || 0)
  return IDEA_COVER_POOL[n % IDEA_COVER_POOL.length]
}

function resolveIdeaCoverUrl(row, meta = {}) {
  const raw = row.cover_url || meta.coverUrl || ''
  if (raw) return raw
  return defaultIdeaCoverUrl(row.id)
}

const PATH_TYPES = ['team', 'help', 'commission']
/** 委托平台：必接，积分门槛更高 */
const PLATFORM_MIN_POINTS = 3000
/** 委托其他团队：可自填积分 */
const TEAM_MIN_POINTS = 100

const createSchema = z
  .object({
    title: z.string().min(2).max(120),
    summary: z.string().max(255).optional().default(''),
    content: z.string().max(20000).optional().default(''),
    pathType: z.enum(PATH_TYPES).optional().default('team'),
    /** 找队友路径：是否在广场标明「继续招募 / 可被申请」 */
    openRecruit: z.boolean().optional().default(true),
    coverUrl: z.string().max(512).optional().nullable(),
    commissionPrice: z.number().int().min(100).max(50000).optional(),
    rewardPoints: z.number().int().min(100).max(50000).optional()
  })
  .transform((v) => {
    const summary =
      (v.summary && v.summary.trim()) ||
      String(v.content || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) ||
      v.title
    return {
      ...v,
      summary,
      commissionPrice: v.commissionPrice || v.rewardPoints
    }
  })

const commissionSchema = z.object({
  note: z.string().max(2000).optional().default(''),
  rewardPoints: z.number().int().min(PLATFORM_MIN_POINTS).max(50000).optional(),
  commissionPrice: z.number().int().min(PLATFORM_MIN_POINTS).max(50000).optional(),
  mode: z.enum(['platform']).optional().default('platform')
})

const teamCommissionSchema = z.object({
  note: z.string().max(2000).optional().default(''),
  points: z.number().int().min(TEAM_MIN_POINTS).max(50000),
  targetHint: z.string().max(120).optional().default('')
})

function defaultPrice(pathType) {
  if (pathType === 'commission') return PLATFORM_MIN_POINTS
  if (pathType === 'help') return PLATFORM_MIN_POINTS
  return PLATFORM_MIN_POINTS
}

function platformPrice(idea, body = {}) {
  const raw = Number(
    body.rewardPoints || body.commissionPrice || idea.commission_price || defaultPrice(idea.path_type)
  )
  return Math.max(PLATFORM_MIN_POINTS, raw)
}

function parseContent(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return { need: String(raw) }
  }
}

function mapIdea(row, extras = {}) {
  const meta = parseContent(row.content)
  const pathType = row.path_type
  const openRecruitMeta =
    typeof meta.openRecruit === 'boolean'
      ? meta.openRecruit
      : pathType === 'team' || pathType === 'help'
  const openRecruit = !!openRecruitMeta && row.status === 'open'
  const base = {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: meta,
    pathType,
    openRecruit,
    commissionPrice: Number(row.commission_price || 0),
    status: row.status,
    deliveredProjectId: row.delivered_project_id,
    likeCount: Number(row.like_count || 0),
    viewCount: Number(row.view_count || 0),
    createdAt: row.created_at,
    coverUrl: resolveIdeaCoverUrl(row, meta),
    owner: {
      id: row.owner_id,
      name: row.owner_name,
      avatarChar: row.avatar_char
    }
  }
  if (extras.members) base.members = extras.members
  if (extras.myJoinStatus !== undefined) base.myJoinStatus = extras.myJoinStatus
  if (extras.joinRequests) base.joinRequests = extras.joinRequests
  return base
}

function ideaAcceptsApplications(ideaRow) {
  if (!ideaRow || ideaRow.status !== 'open') return false
  const meta = parseContent(ideaRow.content)
  if (typeof meta.openRecruit === 'boolean') return meta.openRecruit
  return ideaRow.path_type === 'team' || ideaRow.path_type === 'help'
}

async function loadIdeaMembers(ideaId) {
  return query(
    `SELECT u.id, u.display_name AS name, u.avatar_char AS avatarChar, m.role, m.joined_at AS joinedAt
     FROM idea_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.idea_id = :id
     ORDER BY FIELD(m.role, 'owner', 'member'), m.joined_at`,
    { id: ideaId }
  )
}

async function loadPendingIdeaJoinRequests(ideaId) {
  return query(
    `SELECT r.id, r.message, r.status, r.created_at AS createdAt,
            u.id AS userId, u.display_name AS name, u.avatar_char AS avatarChar
     FROM idea_join_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.idea_id = :id AND r.status = 'pending'
     ORDER BY r.created_at ASC`,
    { id: ideaId }
  )
}

async function getMyIdeaJoinStatus(ideaId, userId) {
  if (!userId) return null
  const members = await query(
    `SELECT 1 AS ok FROM idea_members WHERE idea_id = :id AND user_id = :uid LIMIT 1`,
    { id: ideaId, uid: userId }
  )
  if (members.length) return 'member'
  const reqs = await query(
    `SELECT status FROM idea_join_requests WHERE idea_id = :id AND user_id = :uid LIMIT 1`,
    { id: ideaId, uid: userId }
  )
  if (!reqs.length) return null
  return reqs[0].status
}

async function userCanJoinTeams(user) {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'project_owner') return true
  const rows = await query(
    `SELECT 1 FROM user_identities WHERE user_id = :uid AND identity = '创造者' LIMIT 1`,
    { uid: user.id }
  )
  return rows.length > 0
}

async function addIdeaMember(ideaId, user, role = 'member') {
  await query(
    `INSERT INTO idea_members (idea_id, user_id, role)
     VALUES (:id, :uid, :role)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    { id: ideaId, uid: user.id, role }
  )
}

async function enrichIdeaDetail(row, viewer) {
  const members = await loadIdeaMembers(row.id)
  const isOwner =
    viewer && (Number(viewer.id) === Number(row.owner_id) || viewer.role === 'admin')
  const joinRequests = isOwner ? await loadPendingIdeaJoinRequests(row.id) : []
  const myJoinStatus = viewer
    ? Number(viewer.id) === Number(row.owner_id)
      ? 'owner'
      : await getMyIdeaJoinStatus(row.id, viewer.id)
    : null
  return mapIdea(row, { members, joinRequests, myJoinStatus })
}

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 24)))
    const offset = (page - 1) * pageSize
    const list = await query(
      `SELECT i.*, u.id AS owner_id, u.display_name AS owner_name, u.avatar_char
       FROM ideas i
       JOIN users u ON u.id = i.owner_id
       WHERE i.status != 'archived'
       ORDER BY i.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    )
    const countRows = await query(`SELECT COUNT(*) AS total FROM ideas WHERE status != 'archived'`)
    ok(res, {
      list: list.map(mapIdea),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0)
    })
  })
)

/** 我发布的点子 */
router.get(
  '/mine',
  authRequired,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 40)))
    const offset = (page - 1) * pageSize
    const list = await query(
      `SELECT i.*, u.id AS owner_id, u.display_name AS owner_name, u.avatar_char
       FROM ideas i
       JOIN users u ON u.id = i.owner_id
       WHERE i.owner_id = :uid AND i.status != 'archived' AND IFNULL(i.is_showcase, 0) = 0
       ORDER BY i.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      { uid: req.user.id }
    )
    const countRows = await query(
      `SELECT COUNT(*) AS total FROM ideas
       WHERE owner_id = :uid AND status != 'archived' AND IFNULL(is_showcase, 0) = 0`,
      { uid: req.user.id }
    )
    ok(res, {
      list: list.map(mapIdea),
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
    const pathType = body.pathType
    const price = body.commissionPrice || defaultPrice(pathType)
    // 发布时若标为委托路径，写入不低于平台门槛的标价（真正扣费在确认委托时）
    const storedPrice =
      pathType === 'commission' || pathType === 'help'
        ? Math.max(PLATFORM_MIN_POINTS, Number(price || PLATFORM_MIN_POINTS))
        : Number(price || 800)
    if (body.coverUrl && !/^https?:\/\//i.test(body.coverUrl) && !String(body.coverUrl).startsWith('/api/uploads/')) {
      throw new HttpError(400, '封面图请使用 http(s) 链接或平台上传地址')
    }
    const meta = {
      need: body.content || body.summary,
      note: '',
      pathType,
      coverUrl: body.coverUrl || '',
      openRecruit:
        body.openRecruit !== false && (pathType === 'team' || pathType === 'help')
    }
    const result = await query(
      `INSERT INTO ideas (owner_id, title, summary, content, path_type, commission_price, status, cover_url)
       VALUES (:ownerId, :title, :summary, :content, :pathType, :price, 'open', :coverUrl)`,
      {
        ownerId: req.user.id,
        title: body.title,
        summary: body.summary,
        content: JSON.stringify(meta),
        pathType,
        price: storedPrice,
        coverUrl: body.coverUrl || null
      }
    )
    const ideaId = result.insertId
    if (!body.coverUrl) {
      const coverUrl = defaultIdeaCoverUrl(ideaId)
      meta.coverUrl = coverUrl
      await query(`UPDATE ideas SET cover_url = :coverUrl, content = :content WHERE id = :id`, {
        id: ideaId,
        coverUrl,
        content: JSON.stringify(meta)
      })
    }
    const rows = await query(
      `SELECT i.*, u.id AS owner_id, u.display_name AS owner_name, u.avatar_char
       FROM ideas i JOIN users u ON u.id = i.owner_id
       WHERE i.id = :id LIMIT 1`,
      { id: ideaId }
    )
    try {
      await addIdeaMember(ideaId, { id: req.user.id }, 'owner')
    } catch {
      /* ignore duplicate */
    }
    ok(res, await enrichIdeaDetail(rows[0], req.user), '点子已发布')
  })
)

/** 开放中的团队委托单 */
router.get(
  '/team-offers',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 24)))
    const offset = (page - 1) * pageSize
    const list = await query(
      `SELECT o.*, i.title AS idea_title, i.summary AS idea_summary,
              u.display_name AS owner_name, u.avatar_char AS owner_avatar
       FROM idea_team_offers o
       JOIN ideas i ON i.id = o.idea_id
       JOIN users u ON u.id = o.owner_id
       WHERE o.status = 'open'
       ORDER BY o.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`
    )
    const countRows = await query(
      `SELECT COUNT(*) AS total FROM idea_team_offers WHERE status = 'open'`
    )
    ok(res, {
      list: list.map((row) => ({
        id: row.id,
        ideaId: row.idea_id,
        ideaTitle: row.idea_title,
        ideaSummary: row.idea_summary || '',
        points: Number(row.points || 0),
        targetHint: row.target_hint || '',
        note: row.note || '',
        status: row.status,
        createdAt: row.created_at,
        owner: {
          id: row.owner_id,
          name: row.owner_name,
          avatarChar: row.owner_avatar
        }
      })),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
      rules: {
        platformMin: PLATFORM_MIN_POINTS,
        teamMin: TEAM_MIN_POINTS
      }
    })
  })
)

/** 接团队委托单 */
router.post(
  '/team-offers/:offerId/accept',
  authRequired,
  asyncHandler(async (req, res) => {
    const offerId = Number(req.params.offerId)
    const offers = await query(`SELECT * FROM idea_team_offers WHERE id = :id LIMIT 1`, {
      id: offerId
    })
    if (!offers.length) throw new HttpError(404, '委托单不存在')
    const offer = offers[0]
    if (offer.status !== 'open') throw new HttpError(409, '该委托单已被接走或已关闭')
    if (Number(offer.owner_id) === Number(req.user.id)) {
      throw new HttpError(400, '不能接自己的委托')
    }

    const ideas = await query(`SELECT * FROM ideas WHERE id = :id LIMIT 1`, { id: offer.idea_id })
    if (!ideas.length) throw new HttpError(404, '点子不存在')
    const idea = ideas[0]
    if (idea.status === 'commissioned') throw new HttpError(409, '该点子已委托完成')

    const acceptors = await query(
      `SELECT id, points, display_name FROM users WHERE id = :id LIMIT 1`,
      { id: req.user.id }
    )
    if (!acceptors.length) throw new HttpError(401, '用户不存在')
    const acceptor = acceptors[0]
    const price = Number(offer.points)

    const result = await withTransaction(async (conn) => {
      const [lockRows] = await conn.execute(
        `SELECT id, status FROM idea_team_offers WHERE id = :id FOR UPDATE`,
        { id: offerId }
      )
      if (!lockRows.length || lockRows[0].status !== 'open') {
        throw new HttpError(409, '该委托单已被接走或已关闭')
      }

      const balanceAfter = Number(acceptor.points) + price
      await conn.execute(`UPDATE users SET points = :pts WHERE id = :id`, {
        pts: balanceAfter,
        id: acceptor.id
      })
      await conn.execute(
        `INSERT INTO points_ledger (user_id, delta, balance, reason, ref_type, ref_id)
         VALUES (:uid, :delta, :balance, :reason, 'idea_team_offer', :refId)`,
        {
          uid: acceptor.id,
          delta: price,
          balance: balanceAfter,
          reason: `接团队委托「${idea.title}」`,
          refId: offerId
        }
      )

      const meta = {
        tech: 'other',
        platform: 'web',
        scene: 'campus',
        roles: ['实现'],
        experienceUrl: '',
        gate: 'creator',
        backlinkCommitted: true,
        uploaded: false,
        fromIdeaId: idea.id,
        commissionMode: 'team',
        commissionNote: offer.note || '',
        timeline: [
          ['刚刚', `${acceptor.display_name} 接下团队委托`],
          ['稍早', `委托出价 ${price}✦`]
        ],
        team: [
          { name: idea.owner_name || '需求方', meta: '所有者 · 团队委托', avatar: '' },
          { name: acceptor.display_name, meta: '承接方', avatar: '' }
        ]
      }

      const [ownerRows] = await conn.execute(`SELECT display_name FROM users WHERE id = :id LIMIT 1`, {
        id: offer.owner_id
      })
      const ownerName = ownerRows[0]?.display_name || '需求方'
      meta.team[0].name = ownerName

      const [proj] = await conn.execute(
        `INSERT INTO projects (owner_id, title, summary, content, status)
         VALUES (:ownerId, :title, :summary, :content, 'ongoing')`,
        {
          ownerId: offer.owner_id,
          title: idea.title,
          summary: idea.summary || idea.title,
          content: JSON.stringify(meta)
        }
      )
      const projectId = proj.insertId

      await conn.execute(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES (:pid, :uid, 'member')
         ON DUPLICATE KEY UPDATE role = VALUES(role)`,
        { pid: projectId, uid: acceptor.id }
      )

      await conn.execute(
        `UPDATE idea_team_offers
         SET status = 'accepted', acceptor_id = :aid, project_id = :pid
         WHERE id = :id`,
        { aid: acceptor.id, pid: projectId, id: offerId }
      )

      await conn.execute(
        `UPDATE ideas SET status = 'commissioned', delivered_project_id = :pid, content = :content WHERE id = :id`,
        {
          pid: projectId,
          id: idea.id,
          content: JSON.stringify({
            ...parseContent(idea.content),
            commissionMode: 'team',
            commissionNote: offer.note || '',
            teamOfferId: offerId,
            acceptedBy: acceptor.id
          })
        }
      )

      return { projectId, balanceAfter }
    })

    ok(
      res,
      {
        offerId,
        projectId: result.projectId,
        pointsBalance: result.balanceAfter,
        earned: price,
        ideaId: idea.id
      },
      '已接单，积分已到账'
    )
  })
)

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(
      `SELECT i.*, u.id AS owner_id, u.display_name AS owner_name, u.avatar_char
       FROM ideas i JOIN users u ON u.id = i.owner_id
       WHERE i.id = :id LIMIT 1`,
      { id }
    )
    if (!rows.length) throw new HttpError(404, '点子不存在')
    await query('UPDATE ideas SET view_count = view_count + 1 WHERE id = :id', { id })
    const row = rows[0]
    row.view_count = Number(row.view_count || 0) + 1
    ok(res, await enrichIdeaDetail(row, req.user || null))
  })
)

/** 申请一起做：写入待审，发布者同意后入队 */
router.post(
  '/:id/join',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!(await userCanJoinTeams(req.user))) {
      throw new HttpError(403, '需通关入门获得「创造者」身份后方可申请组队')
    }
    const ideas = await query(`SELECT * FROM ideas WHERE id = :id LIMIT 1`, { id })
    if (!ideas.length) throw new HttpError(404, '点子不存在')
    const idea = ideas[0]
    if (idea.status === 'archived') throw new HttpError(400, '点子已归档')
    if (idea.status === 'commissioned') throw new HttpError(400, '点子已委托完成，无法再申请组队')
    if (idea.status === 'team_open') {
      throw new HttpError(400, '该点子已挂团队委托，请走接单流程，或等委托结束后再申请一起做')
    }
    if (!ideaAcceptsApplications(idea)) {
      throw new HttpError(400, '发布者未开放招募，无法申请一起做')
    }
    if (Number(idea.owner_id) === Number(req.user.id)) {
      throw new HttpError(400, '不能申请加入自己的点子')
    }

    const existingMember = await query(
      `SELECT 1 AS ok FROM idea_members WHERE idea_id = :id AND user_id = :uid LIMIT 1`,
      { id, uid: req.user.id }
    )
    if (existingMember.length) throw new HttpError(400, '你已在点子团队中')

    const message = String(req.body?.message || '').trim().slice(0, 500)
    const prev = await query(
      `SELECT id, status FROM idea_join_requests WHERE idea_id = :id AND user_id = :uid LIMIT 1`,
      { id, uid: req.user.id }
    )
    if (prev.length) {
      if (prev[0].status === 'pending') throw new HttpError(400, '申请已提交，请等待发布者处理')
      if (prev[0].status === 'approved') throw new HttpError(400, '你已在点子团队中')
      await query(
        `UPDATE idea_join_requests
         SET status = 'pending', message = :message, created_at = CURRENT_TIMESTAMP, reviewed_at = NULL
         WHERE id = :rid`,
        { rid: prev[0].id, message }
      )
      return ok(res, { ideaId: id, requestId: prev[0].id, status: 'pending' }, '已重新提交申请，等待发布者同意')
    }

    const result = await query(
      `INSERT INTO idea_join_requests (idea_id, user_id, message, status)
       VALUES (:id, :uid, :message, 'pending')`,
      { id, uid: req.user.id, message }
    )
    ok(res, { ideaId: id, requestId: result.insertId, status: 'pending' }, '申请已提交，等待发布者同意')
  })
)

router.get(
  '/:id/join-requests',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const ideas = await query(`SELECT owner_id FROM ideas WHERE id = :id LIMIT 1`, { id })
    if (!ideas.length) throw new HttpError(404, '点子不存在')
    if (Number(ideas[0].owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '仅点子发布者可查看申请')
    }
    ok(res, { list: await loadPendingIdeaJoinRequests(id) })
  })
)

router.post(
  '/:id/join-requests/:reqId/approve',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const reqId = Number(req.params.reqId)
    const ideas = await query(`SELECT * FROM ideas WHERE id = :id LIMIT 1`, { id })
    if (!ideas.length) throw new HttpError(404, '点子不存在')
    const idea = ideas[0]
    if (Number(idea.owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '仅点子发布者可同意申请')
    }
    if (idea.status === 'archived') throw new HttpError(400, '点子已归档')

    const rows = await query(
      `SELECT r.*, u.display_name, u.id AS uid
       FROM idea_join_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = :rid AND r.idea_id = :id LIMIT 1`,
      { rid: reqId, id }
    )
    if (!rows.length) throw new HttpError(404, '申请不存在')
    if (rows[0].status !== 'pending') throw new HttpError(400, '申请已处理')

    await addIdeaMember(id, { id: rows[0].uid, display_name: rows[0].display_name }, 'member')
    await query(
      `UPDATE idea_join_requests SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = :rid`,
      { rid: reqId }
    )
    ok(res, { ideaId: id, requestId: reqId, status: 'approved' }, '已同意加入')
  })
)

router.post(
  '/:id/join-requests/:reqId/reject',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const reqId = Number(req.params.reqId)
    const ideas = await query(`SELECT owner_id FROM ideas WHERE id = :id LIMIT 1`, { id })
    if (!ideas.length) throw new HttpError(404, '点子不存在')
    if (Number(ideas[0].owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '仅点子发布者可拒绝申请')
    }
    const rows = await query(
      `SELECT id, status FROM idea_join_requests WHERE id = :rid AND idea_id = :id LIMIT 1`,
      { rid: reqId, id }
    )
    if (!rows.length) throw new HttpError(404, '申请不存在')
    if (rows[0].status !== 'pending') throw new HttpError(400, '申请已处理')
    await query(
      `UPDATE idea_join_requests SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP WHERE id = :rid`,
      { rid: reqId }
    )
    ok(res, { ideaId: id, requestId: reqId, status: 'rejected' }, '已拒绝申请')
  })
)

router.post(
  '/:id/commission',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const body = commissionSchema.parse(req.body || {})
    const ideas = await query(`SELECT * FROM ideas WHERE id = :id LIMIT 1`, { id })
    if (!ideas.length) throw new HttpError(404, '点子不存在')
    const idea = ideas[0]
    if (Number(idea.owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '只能委托自己的点子')
    }
    if (idea.status === 'commissioned') throw new HttpError(409, '该点子已委托')
    if (idea.status === 'team_open') throw new HttpError(409, '已有进行中的团队委托单，请等待接单或先关闭')
    if (idea.status === 'archived') throw new HttpError(400, '点子已归档')

    const price = platformPrice(idea, body)
    const users = await query(`SELECT id, points, display_name FROM users WHERE id = :id LIMIT 1`, {
      id: req.user.id
    })
    if (!users.length) throw new HttpError(401, '用户不存在')
    const user = users[0]
    if (Number(user.points) < price) {
      throw new HttpError(400, `积分不足，平台委托至少 ${PLATFORM_MIN_POINTS}✦，当前需要 ${price}✦，余额 ${user.points}✦`)
    }

    const result = await withTransaction(async (conn) => {
      const balanceAfter = Number(user.points) - price
      await conn.execute(`UPDATE users SET points = :pts WHERE id = :id`, {
        pts: balanceAfter,
        id: user.id
      })
      await conn.execute(
        `INSERT INTO points_ledger (user_id, delta, balance, reason, ref_type, ref_id)
         VALUES (:uid, :delta, :balance, :reason, 'idea', :refId)`,
        {
          uid: user.id,
          delta: -price,
          balance: balanceAfter,
          reason: `平台委托「${idea.title}」`,
          refId: idea.id
        }
      )

      const meta = {
        tech: 'other',
        platform: 'web',
        scene: 'campus',
        roles: ['产品', '实现'],
        experienceUrl: '',
        gate: 'creator',
        backlinkCommitted: true,
        uploaded: false,
        fromIdeaId: idea.id,
        commissionMode: 'platform',
        commissionNote: body.note || '',
        timeline: [['刚刚', `由平台根据点子「${idea.title}」交付`]],
        team: [{ name: user.display_name, meta: '所有者 · 平台委托', avatar: '' }]
      }

      const [proj] = await conn.execute(
        `INSERT INTO projects (owner_id, title, summary, content, status)
         VALUES (:ownerId, :title, :summary, :content, 'recruiting')`,
        {
          ownerId: user.id,
          title: idea.title,
          summary: idea.summary || idea.title,
          content: JSON.stringify(meta)
        }
      )

      await conn.execute(
        `UPDATE ideas SET status = 'commissioned', delivered_project_id = :pid, content = :content WHERE id = :id`,
        {
          pid: proj.insertId,
          id: idea.id,
          content: JSON.stringify({
            ...parseContent(idea.content),
            commissionMode: 'platform',
            commissionNote: body.note || '',
            commissionedBy: user.id
          })
        }
      )

      return { projectId: proj.insertId, balanceAfter }
    })

    const ideaRows = await query(
      `SELECT i.*, u.id AS owner_id, u.display_name AS owner_name, u.avatar_char
       FROM ideas i JOIN users u ON u.id = i.owner_id
       WHERE i.id = :id LIMIT 1`,
      { id }
    )
    const projectRows = await query(
      `SELECT p.id, p.title, p.summary, p.status, u.display_name AS owner_name
       FROM projects p JOIN users u ON u.id = p.owner_id
       WHERE p.id = :id LIMIT 1`,
      { id: result.projectId }
    )

    ok(
      res,
      {
        projectId: result.projectId,
        idea: mapIdea(ideaRows[0]),
        project: {
          id: projectRows[0].id,
          title: projectRows[0].title,
          summary: projectRows[0].summary,
          status: projectRows[0].status,
          ownerName: projectRows[0].owner_name
        },
        pointsBalance: result.balanceAfter,
        deducted: price
      },
      '委托成功'
    )
  })
)

/** 发布「委托其他团队」单：先扣积分托管，等待接单 */
router.post(
  '/:id/team-commission',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const body = teamCommissionSchema.parse(req.body || {})
    const ideas = await query(`SELECT * FROM ideas WHERE id = :id LIMIT 1`, { id })
    if (!ideas.length) throw new HttpError(404, '点子不存在')
    const idea = ideas[0]
    if (Number(idea.owner_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw new HttpError(403, '只能委托自己的点子')
    }
    if (idea.status === 'commissioned') throw new HttpError(409, '该点子已委托')
    if (idea.status === 'archived') throw new HttpError(400, '点子已归档')
    if (idea.status === 'team_open') throw new HttpError(409, '已有进行中的团队委托单')

    const existing = await query(
      `SELECT id FROM idea_team_offers WHERE idea_id = :iid AND status = 'open' LIMIT 1`,
      { iid: id }
    )
    if (existing.length) throw new HttpError(409, '已有进行中的团队委托单')

    const price = Number(body.points)
    const users = await query(`SELECT id, points, display_name FROM users WHERE id = :id LIMIT 1`, {
      id: req.user.id
    })
    if (!users.length) throw new HttpError(401, '用户不存在')
    const user = users[0]
    if (Number(user.points) < price) {
      throw new HttpError(400, `积分不足，需要 ${price}✦，当前 ${user.points}✦`)
    }

    const result = await withTransaction(async (conn) => {
      const balanceAfter = Number(user.points) - price
      await conn.execute(`UPDATE users SET points = :pts WHERE id = :id`, {
        pts: balanceAfter,
        id: user.id
      })
      await conn.execute(
        `INSERT INTO points_ledger (user_id, delta, balance, reason, ref_type, ref_id)
         VALUES (:uid, :delta, :balance, :reason, 'idea', :refId)`,
        {
          uid: user.id,
          delta: -price,
          balance: balanceAfter,
          reason: `团队委托托管「${idea.title}」`,
          refId: idea.id
        }
      )

      const [offer] = await conn.execute(
        `INSERT INTO idea_team_offers (idea_id, owner_id, points, target_hint, note, status)
         VALUES (:ideaId, :ownerId, :points, :hint, :note, 'open')`,
        {
          ideaId: idea.id,
          ownerId: user.id,
          points: price,
          hint: body.targetHint || '',
          note: body.note || ''
        }
      )

      await conn.execute(
        `UPDATE ideas SET status = 'team_open', commission_price = :price, content = :content WHERE id = :id`,
        {
          price,
          id: idea.id,
          content: JSON.stringify({
            ...parseContent(idea.content),
            commissionMode: 'team',
            teamOfferId: offer.insertId,
            teamTargetHint: body.targetHint || '',
            commissionNote: body.note || ''
          })
        }
      )

      return { offerId: offer.insertId, balanceAfter }
    })

    ok(
      res,
      {
        offerId: result.offerId,
        ideaId: idea.id,
        points: price,
        pointsBalance: result.balanceAfter,
        deducted: price
      },
      '团队委托已发布，等待接单'
    )
  })
)

module.exports = router
