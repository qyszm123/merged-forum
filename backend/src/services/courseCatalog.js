/**
 * 教师/管理员自建副本：与官方 trainCatalog 合并解析
 */
const { query } = require('../db/pool')
const {
  PATHS,
  CHAPTERS,
  TIERS,
  getPath,
  listNodes,
  listChapters,
  allNodeKeys,
  tierNodeIds
} = require('../data/trainCatalog')

let cache = { at: 0, rows: [] }
const TTL_MS = 3000

function parseJson(raw, fallback) {
  if (raw == null) return fallback
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function invalidateCourseCache() {
  cache = { at: 0, rows: [] }
}

async function loadCourses(force = false) {
  if (!force && Date.now() - cache.at < TTL_MS && cache.rows.length) return cache.rows
  try {
    const rows = await query(
      `SELECT c.*, u.display_name AS owner_name, u.role AS owner_role
       FROM train_courses c
       JOIN users u ON u.id = c.owner_user_id
       ORDER BY c.updated_at DESC`
    )
    cache = { at: Date.now(), rows }
    return rows
  } catch (err) {
    // 表未迁移时降级为空，避免整站挂掉
    if (err.code === 'ER_NO_SUCH_TABLE') return []
    throw err
  }
}

function defaultChapters(pathId, title) {
  return require('./courseContentSeed').fullDefaultChapters(pathId, title)
}

function rowToPath(row) {
  return {
    id: row.path_id,
    title: row.title,
    badge: row.reward_identity || row.title,
    blurb: row.blurb || '',
    rewardIdentity: row.reward_identity || row.title,
    icon: row.icon || '课',
    source: 'course',
    ownerUserId: Number(row.owner_user_id),
    ownerName: row.owner_name || '',
    visibility: row.visibility,
    villagePath: false,
    pricingEnabled: !!Number(row.pricing_enabled || 0),
    freeForSchool: row.free_for_school == null ? true : !!Number(row.free_for_school),
    externalFeeYuan: Math.max(0, Number(row.external_fee_yuan || 0)),
    ownerSchool: String(row.owner_school || '').trim(),
    grantsCreator: !!Number(row.grants_creator || 0),
    identityCertified: row.visibility === 'official',
    createMode: row.create_mode === 'manual' ? 'manual' : 'ai_lazy',
    goals: String(row.goals_text || '').trim()
  }
}

function chaptersOf(row) {
  const list = parseJson(row.chapters_json, [])
  if (Array.isArray(list) && list.length) return list
  // 教师草稿（手动 / AI 懒人）未拆关前不要回退成 6 单元官方骨架
  if (row.create_mode === 'manual' || row.create_mode === 'ai_lazy') {
    return Array.isArray(list) ? list : []
  }
  return defaultChapters(row.path_id, row.title)
}

function nodesFromChapters(chapters, tierId) {
  const out = []
  for (const ch of chapters || []) {
    const tier = ch.tier || 'beginner'
    if (tierId && tier !== tierId) continue
    for (const n of ch.nodes || []) {
      out.push({ ...n, chapterId: ch.id, chapterName: ch.name })
    }
  }
  return out
}

async function findCourseRow(pathId, { includeDraft = true } = {}) {
  const rows = await loadCourses()
  const row = rows.find((r) => r.path_id === pathId)
  if (!row) return null
  if (!includeDraft && row.visibility === 'draft') return null
  return row
}

async function resolvePath(pathId, opts = {}) {
  const official = getPath(pathId)
  if (official) return { ...official, source: 'official' }
  const row = await findCourseRow(pathId, opts)
  if (!row) return null
  return rowToPath(row)
}

async function resolveChapters(pathId, tierId, opts = {}) {
  if (CHAPTERS[pathId]) return listChapters(pathId, tierId)
  const row = await findCourseRow(pathId, opts)
  if (!row) return []
  const list = chaptersOf(row)
  if (!tierId) return list
  return list.filter((ch) => (ch.tier || 'beginner') === tierId)
}

async function resolveNodes(pathId, tierId, opts = {}) {
  if (CHAPTERS[pathId]) return listNodes(pathId, tierId)
  const row = await findCourseRow(pathId, opts)
  if (!row) return []
  return nodesFromChapters(chaptersOf(row), tierId)
}

async function resolveAllNodeKeys(pathId, opts = {}) {
  if (CHAPTERS[pathId]) return allNodeKeys(pathId)
  const out = []
  for (const tier of TIERS) {
    for (const node of await resolveNodes(pathId, tier.id, opts)) {
      out.push({ pathId, tierId: tier.id, nodeId: node.id, ...node })
    }
  }
  return out
}

async function resolveTierNodeIds(pathId, tierId, opts = {}) {
  if (CHAPTERS[pathId]) return tierNodeIds(pathId, tierId)
  return (await resolveNodes(pathId, tierId, opts)).map((n) => n.id)
}

async function findNodeAnywhere(pathId, nodeId, opts = {}) {
  for (const tier of TIERS) {
    const node = (await resolveNodes(pathId, tier.id, opts)).find((n) => n.id === nodeId)
    if (node) return { node, tierId: tier.id }
  }
  return null
}

function mapCourseListItem(row) {
  const chapters = chaptersOf(row)
  const nodeCount = chapters.reduce((n, ch) => n + (ch.nodes?.length || 0), 0)
  return {
    ...rowToPath(row),
    chapterCount: chapters.length,
    nodeCount,
    chapters: chapters.map((ch) => ({
      id: ch.id,
      name: ch.name,
      tier: ch.tier || 'beginner',
      nodeCount: ch.nodes?.length || 0,
      nodes: (ch.nodes || []).map((n) => ({ id: n.id, name: n.name, type: n.type }))
    })),
    updatedAt: row.updated_at,
    createdAt: row.created_at
  }
}

async function listOfficialAndCourses({ identities = [], printUnlocked = false, viewerId = null } = {}) {
  const official = PATHS.map((p) => {
    let locked = false
    if (p.requiresUnlock === 'print' && !printUnlocked) locked = true
    if (Array.isArray(p.requiresAny) && !p.requiresAny.some((x) => identities.includes(x))) {
      locked = true
    }
    const chapters = (CHAPTERS[p.id] || []).map((ch) => ({
      id: ch.id,
      name: ch.name,
      tier: ch.tier,
      nodeCount: ch.nodes.length,
      nodes: ch.nodes.map((n) => ({ id: n.id, name: n.name, type: n.type }))
    }))
    return { ...p, source: 'official', locked, chapters }
  })

  const rows = await loadCourses(true)
  const courses = rows
    .filter((r) => {
      if (r.visibility === 'listed' || r.visibility === 'official') return true
      if (r.visibility === 'draft' && viewerId && Number(r.owner_user_id) === Number(viewerId)) {
        return true
      }
      return false
    })
    .map((r) => ({ ...mapCourseListItem(r), locked: false }))

  return { official, courses, paths: [...official, ...courses] }
}

function slugifyTitle(title) {
  const base = String(title || 'course')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '')
    .slice(0, 12)
  const rnd = Date.now().toString(36).slice(-6)
  return `c_${base || 'course'}_${rnd}`.slice(0, 48)
}

module.exports = {
  PATHS,
  TIERS,
  invalidateCourseCache,
  loadCourses,
  defaultChapters,
  rowToPath,
  chaptersOf,
  mapCourseListItem,
  listOfficialAndCourses,
  resolvePath,
  resolveChapters,
  resolveNodes,
  resolveAllNodeKeys,
  resolveTierNodeIds,
  findNodeAnywhere,
  findCourseRow,
  slugifyTitle,
  parseJson
}
