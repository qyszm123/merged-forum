const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const multer = require('multer')
const { query } = require('../db/pool')
const { authRequired } = require('../middleware/auth')
const { HttpError, ok, asyncHandler } = require('../utils/http')

const router = require('express').Router()

const UPLOAD_ROOT = path.join(__dirname, '../../uploads')

const PURPOSE_DIRS = {
  quest_work: 'quest',
  project_pack: 'project',
  course_material: 'course',
  other: 'other'
}

const ALLOWED_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.pdf',
  '.ppt',
  '.pptx',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.zip',
  '.rar',
  '.7z',
  '.mp4',
  '.webm',
  '.mov',
  '.mkv',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.flac',
  '.txt',
  '.md',
  '.bat',
  '.cmd',
  '.ps1',
  '.py',
  '.js',
  '.sh'
])

const MAX_BYTES = 80 * 1024 * 1024 // 80MB

/** busboy 默认按 Latin-1 解析 multipart filename，中文会乱码。
 *  现代浏览器 multipart 头中 filename 用 UTF-8 编码，需要用 Buffer 重新按 utf8 解码。
 *  智能检测：仅当出现连续 0x80-0xFF 范围字符（latin1 误码特征）时才转码，
 *  避免对已经是正确 UTF-8 的字符串二次破坏。 */
function decodeFilename(name) {
  if (!name) return name
  if (typeof name !== 'string') name = String(name)
  if (!/[\u0080-\u00FF]{2,}/.test(name)) return name
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8')
    return decoded || name
  } catch {
    return name
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function safePurpose(raw) {
  const p = String(raw || 'other')
  return PURPOSE_DIRS[p] ? p : 'other'
}

/** multipart 中 file 字段常早于 purpose，destination 时 body 可能还没有 purpose。
 * 统一先落到 files/，入库后按 purpose 再挪到对应目录。 */
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const dir = path.join(UPLOAD_ROOT, 'files')
    ensureDir(dir)
    cb(null, dir)
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const id = crypto.randomBytes(16).toString('hex')
    cb(null, `${Date.now()}-${id}${ext}`)
  }
})

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    cb(
      new HttpError(
        400,
        `不支持的文件类型：${ext || '未知'}，请上传图片 / PPT / PDF / 视频 / 音频 / 文档 / 压缩包`
      )
    )
    return
  }
  cb(null, true)
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES, files: 1 },
  defParamCharset: 'utf8'
})

function mapUpload(row) {
  return {
    id: row.id,
    purpose: row.purpose,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: Number(row.size_bytes || 0),
    url: `/api/uploads/${row.id}/file`,
    pathId: row.path_id || '',
    nodeId: row.node_id || '',
    taskId: row.task_id || '',
    note: row.note || '',
    createdAt: row.created_at
  }
}

function absolutePath(row) {
  return path.resolve(UPLOAD_ROOT, row.rel_path)
}

function relocateByPurpose(tempAbs, purpose, storedName) {
  const sub = PURPOSE_DIRS[safePurpose(purpose)]
  const destDir = path.join(UPLOAD_ROOT, sub)
  ensureDir(destDir)
  const destAbs = path.join(destDir, storedName)
  if (path.resolve(tempAbs) !== path.resolve(destAbs)) {
    fs.renameSync(tempAbs, destAbs)
  }
  return path.join(sub, storedName).replace(/\\/g, '/')
}

/** POST /api/uploads  multipart: file + purpose/pathId/nodeId/taskId/note */
router.post(
  '/',
  authRequired,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (!err) return next()
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new HttpError(400, `文件过大，上限 ${Math.round(MAX_BYTES / 1024 / 1024)}MB`))
        }
        return next(new HttpError(400, err.message || '上传失败'))
      }
      next(err)
    })
  },
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, '请选择要上传的文件')
    const purpose = safePurpose(req.body?.purpose)
    let relPath
    try {
      relPath = relocateByPurpose(req.file.path, purpose, req.file.filename)
    } catch (err) {
      // 挪动失败则保留 files/ 下原路径，避免「库有文件无」
      relPath = path
        .relative(UPLOAD_ROOT, req.file.path)
        .split(path.sep)
        .join('/')
      console.warn('[uploads] relocate failed, keep temp path:', err.message)
    }
    const result = await query(
      `INSERT INTO uploads
        (user_id, purpose, original_name, stored_name, mime_type, size_bytes, rel_path, path_id, node_id, task_id, note)
       VALUES
        (:uid, :purpose, :originalName, :storedName, :mime, :size, :relPath, :pathId, :nodeId, :taskId, :note)`,
      {
        uid: req.user.id,
        purpose,
        originalName: decodeFilename(String(req.file.originalname || req.file.filename)).slice(0, 255),
        storedName: req.file.filename,
        mime: req.file.mimetype || 'application/octet-stream',
        size: req.file.size || 0,
        relPath,
        pathId: req.body?.pathId ? String(req.body.pathId).slice(0, 32) : null,
        nodeId: req.body?.nodeId ? String(req.body.nodeId).slice(0, 64) : null,
        taskId: req.body?.taskId ? String(req.body.taskId).slice(0, 64) : null,
        note: req.body?.note ? String(req.body.note).slice(0, 2000) : null
      }
    )
    const rows = await query(`SELECT * FROM uploads WHERE id = :id LIMIT 1`, { id: result.insertId })
    ok(res, mapUpload(rows[0]), '上传成功')
  })
)

/** GET /api/uploads/mine */
router.get(
  '/mine',
  authRequired,
  asyncHandler(async (req, res) => {
    const purpose = req.query.purpose ? safePurpose(req.query.purpose) : null
    const rows = purpose
      ? await query(
          `SELECT * FROM uploads WHERE user_id = :uid AND purpose = :purpose ORDER BY id DESC LIMIT 50`,
          { uid: req.user.id, purpose }
        )
      : await query(`SELECT * FROM uploads WHERE user_id = :uid ORDER BY id DESC LIMIT 50`, {
          uid: req.user.id
        })
    ok(res, { list: rows.map(mapUpload) })
  })
)

/** GET /api/uploads/:id/file — 下载/预览（本人、管理员，或可评该副本的教师） */
router.get(
  '/:id/file',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(`SELECT * FROM uploads WHERE id = :id LIMIT 1`, { id })
    if (!rows.length) throw new HttpError(404, '文件不存在')
    const row = rows[0]
    const isOwner = Number(row.user_id) === Number(req.user.id)
    const isAdmin = req.user.role === 'admin'
    let isGrader = false
    if (!isOwner && !isAdmin && (req.user.role === 'teacher' || req.user.role === 'project_owner')) {
      const pathId = row.path_id
      if (pathId) {
        const courses = await query(
          `SELECT owner_user_id FROM train_courses WHERE path_id = :p LIMIT 1`,
          { p: pathId }
        )
        if (!courses.length || Number(courses[0].owner_user_id) === Number(req.user.id)) {
          isGrader = req.user.role === 'teacher' || req.user.role === 'admin'
        }
      }
    }
    if (!isOwner && !isAdmin && !isGrader) {
      throw new HttpError(403, '无权下载该文件')
    }
    const abs = absolutePath(row)
    if (!fs.existsSync(abs)) throw new HttpError(404, '文件已丢失')
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream')
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(row.original_name || row.stored_name)}`
    )
    fs.createReadStream(abs).pipe(res)
  })
)

/** GET /api/uploads/:id */
router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(`SELECT * FROM uploads WHERE id = :id LIMIT 1`, { id })
    if (!rows.length) throw new HttpError(404, '文件不存在')
    const row = rows[0]
    if (row.user_id !== req.user.id && req.user.role !== 'admin') {
      throw new HttpError(403, '无权查看该文件')
    }
    ok(res, mapUpload(row))
  })
)

/** PATCH /api/uploads/:id — 补充说明（提交作品时） */
router.patch(
  '/:id',
  authRequired,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const rows = await query(`SELECT * FROM uploads WHERE id = :id LIMIT 1`, { id })
    if (!rows.length) throw new HttpError(404, '文件不存在')
    if (rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      throw new HttpError(403, '无权修改')
    }
    const note = req.body?.note != null ? String(req.body.note).slice(0, 2000) : rows[0].note
    await query(`UPDATE uploads SET note = :note WHERE id = :id`, { id, note })
    const next = await query(`SELECT * FROM uploads WHERE id = :id LIMIT 1`, { id })
    ok(res, mapUpload(next[0]), '已更新')
  })
)

module.exports = router
