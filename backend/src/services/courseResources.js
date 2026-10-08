/**
 * 教师课程资源：上传素材 / 第三方链接 / 平台资源库
 */
const path = require('path')
const { query } = require('../db/pool')
const resourceTextExtract = require('./resourceTextExtract')

const UPLOAD_ROOT = path.join(__dirname, '../../uploads')
const KINDS = new Set(['video', 'doc', 'audio', 'link'])

function inferKind({ kind, url, mimeType, fileName }) {
  const k = String(kind || '').toLowerCase()
  if (KINDS.has(k)) return k
  const blob = `${url || ''} ${mimeType || ''} ${fileName || ''}`.toLowerCase()
  if (/bilibili\.com|youtube\.com|youtu\.be|\.mp4|\.webm|\.mov|video\//.test(blob)) return 'video'
  if (/\.mp3|\.wav|\.m4a|\.aac|\.ogg|\.flac|audio\//.test(blob)) return 'audio'
  if (/^https?:\/\//i.test(String(url || ''))) return 'link'
  return 'doc'
}

function normalizeResource(raw, { ownerUserId } = {}) {
  if (!raw || typeof raw !== 'object') return null
  const title = String(raw.title || raw.name || raw.originalName || '').trim().slice(0, 200)
  const url = String(raw.url || raw.href || '').trim().slice(0, 1000)
  const uploadId = raw.uploadId != null ? Number(raw.uploadId) : null
  const note = String(raw.note || '').trim().slice(0, 2000)
  const kind = inferKind({
    kind: raw.kind,
    url,
    mimeType: raw.mimeType,
    fileName: title
  })
  if (!title && !url && !uploadId) return null
  return {
    kind,
    title: title || (kind === 'link' ? '外链资源' : '课程素材'),
    url: url || null,
    uploadId: Number.isFinite(uploadId) && uploadId > 0 ? uploadId : null,
    note: note || null,
    contributeLibrary: raw.contributeLibrary === false ? 0 : 1,
    ownerUserId: ownerUserId || null
  }
}

function normalizeResourceList(list, opts = {}) {
  const arr = Array.isArray(list) ? list : []
  return arr.map((r) => normalizeResource(r, opts)).filter(Boolean).slice(0, 40)
}

function mapRow(row) {
  return {
    id: Number(row.id),
    pathId: row.path_id || '',
    ownerUserId: Number(row.owner_user_id),
    ownerName: row.owner_name || '',
    kind: row.kind,
    title: row.title,
    url: row.url || '',
    uploadId: row.upload_id ? Number(row.upload_id) : null,
    note: row.note || '',
    contributeLibrary: !!Number(row.contribute_library),
    fileUrl: row.upload_id ? `/api/uploads/${row.upload_id}/file` : '',
    createdAt: row.created_at
  }
}

async function insertResources(pathId, ownerUserId, resources) {
  const list = normalizeResourceList(resources, { ownerUserId })
  const inserted = []
  for (const r of list) {
    const result = await query(
      `INSERT INTO train_course_resources
        (path_id, owner_user_id, kind, title, url, upload_id, note, contribute_library)
       VALUES (:pathId, :uid, :kind, :title, :url, :uploadId, :note, :lib)`,
      {
        pathId: pathId || null,
        uid: ownerUserId,
        kind: r.kind,
        title: r.title,
        url: r.url,
        uploadId: r.uploadId,
        note: r.note,
        lib: r.contributeLibrary
      }
    )
    inserted.push({ ...r, id: result.insertId, pathId: pathId || '' })
  }
  return inserted
}

async function listByPath(pathId) {
  const rows = await query(
    `SELECT r.*, u.display_name AS owner_name
     FROM train_course_resources r
     LEFT JOIN users u ON u.id = r.owner_user_id
     WHERE r.path_id = :pathId
     ORDER BY r.id ASC`,
    { pathId }
  )
  return rows.map(mapRow)
}

async function listLibrary({ limit = 40, ownerUserId = null } = {}) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 40))
  const rows = ownerUserId
    ? await query(
        `SELECT r.*, u.display_name AS owner_name
         FROM train_course_resources r
         LEFT JOIN users u ON u.id = r.owner_user_id
         WHERE r.contribute_library = 1
            OR r.owner_user_id = :uid
         ORDER BY r.id DESC
         LIMIT ${lim}`,
        { uid: ownerUserId }
      )
    : await query(
        `SELECT r.*, u.display_name AS owner_name
         FROM train_course_resources r
         LEFT JOIN users u ON u.id = r.owner_user_id
         WHERE r.contribute_library = 1
         ORDER BY r.id DESC
         LIMIT ${lim}`
      )
  return rows.map(mapRow)
}

async function deleteResource(id, user) {
  const rows = await query(`SELECT * FROM train_course_resources WHERE id = :id LIMIT 1`, { id })
  if (!rows.length) return null
  const row = rows[0]
  if (user.role !== 'admin' && Number(row.owner_user_id) !== Number(user.id)) {
    const err = new Error('无权删除该资源')
    err.status = 403
    throw err
  }
  await query(`DELETE FROM train_course_resources WHERE id = :id`, { id })
  return mapRow(row)
}

/**
 * 为 AI 准备可读的资源摘要（txt/md、PDF/Word/PPT、视频与网页链接页面文字）
 */
async function buildAiResourceBrief(resources) {
  const list = normalizeResourceList(resources)
  const lines = []
  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    let snippet = ''
    let extractNote = ''
    if (r.uploadId) {
      try {
        const ups = await query(`SELECT * FROM uploads WHERE id = :id LIMIT 1`, { id: r.uploadId })
        const up = ups[0]
        if (up) {
          const cacheKey = `upload:${up.id}:${up.created_at || ''}:${up.rel_path || ''}`
          const extracted = await resourceTextExtract.extractUploadTextCached(
            path.resolve(UPLOAD_ROOT, up.rel_path),
            up.original_name || up.stored_name,
            cacheKey
          )
          snippet = extracted?.text || ''
          extractNote = extracted?.note || ''
          if (!r.title || r.title === '课程素材') {
            r.title = up.original_name || r.title
          }
        }
      } catch (err) {
        extractNote = `文件读取失败：${err.message || err}`
      }
    } else if (r.url) {
      try {
        const extracted = await resourceTextExtract.fetchLinkPageBrief(r.url)
        snippet = extracted?.text || ''
        extractNote = extracted?.note || ''
      } catch (err) {
        extractNote = `链接抓取失败：${err.message || err}`
      }
    }
    lines.push(
      [
        `${i + 1}. [${r.kind}] ${r.title}`,
        r.url ? `链接：${r.url}` : '',
        r.uploadId ? `上传文件ID：${r.uploadId}` : '',
        r.note ? `教师备注：${r.note}` : '',
        extractNote ? `提取说明：${extractNote}` : '',
        snippet ? `正文/页面摘要：${snippet}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    )
  }
  return lines.join('\n\n')
}

module.exports = {
  KINDS,
  inferKind,
  normalizeResource,
  normalizeResourceList,
  insertResources,
  listByPath,
  listLibrary,
  deleteResource,
  buildAiResourceBrief,
  mapRow
}
