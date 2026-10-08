/**
 * AI 懒人拆关 · 后台任务（内存态，单进程；前端轮询进度）
 */
const crypto = require('crypto')
const courseContentSeed = require('./courseContentSeed')
const courseCatalog = require('./courseCatalog')
const courseQuizAi = require('./courseQuizAi')

const jobs = new Map()
const pathActive = new Map()
const TTL_MS = 2 * 60 * 60 * 1000

function prune() {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (job.updatedAt && now - job.updatedAt > TTL_MS) {
      jobs.delete(id)
      if (pathActive.get(job.pathId) === id) pathActive.delete(job.pathId)
    }
  }
}

function buildDoneMessage(seed) {
  const parts = []
  if (seed?.curriculumAi) parts.push('已按目标/资源拆关')
  if (seed?.totalQuestions > 0) {
    parts.push(`题库 ${seed.totalQuestions} 题${seed.quizChapters ? `（${seed.quizChapters} 关）` : ''}`)
  } else if (seed?.aiChapters > 0) {
    parts.push(`AI 题库 ${seed.aiChapters} 单元`)
  }
  if (seed?.guideAiChapters > 0) parts.push(`攻略讲义 ${seed.guideAiChapters} 单元`)
  if (seed?.workAiChapters > 0) parts.push(`实践说明 ${seed.workAiChapters} 单元`)
  if (!parts.length) {
    parts.push(
      courseQuizAi.isConfigured() ? 'AI 未完整成功，已写入可玩模板' : '未配置 DeepSeek，已用模板内容'
    )
  }
  return `AI 生成副本完成 · ${parts.join(' · ')}`
}

function publicJob(job) {
  if (!job) return null
  const out = {
    jobId: job.id,
    pathId: job.pathId,
    status: job.status,
    progress: job.progress,
    phase: job.phase,
    message: job.message,
    error: job.error || null,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt
  }
  if (job.status === 'done' && job.result) {
    out.seed = job.result.seed
    out.course = job.result.course
  }
  return out
}

function patchJob(job, fields) {
  Object.assign(job, fields, { updatedAt: Date.now() })
}

async function runJob(job) {
  patchJob(job, { status: 'running', progress: 1, phase: 'start', message: '开始 AI 生成副本…' })
  try {
    const seed = await courseContentSeed.generateCourseAiContent(job.pathId, job.userId, {
      onProgress: (p) => {
        patchJob(job, {
          progress: Math.min(99, Math.max(job.progress, Number(p.percent) || 0)),
          phase: p.phase || job.phase,
          message: p.message || job.message
        })
      }
    })
    courseCatalog.invalidateCourseCache()
    const fresh = await courseCatalog.findCourseRow(job.pathId, { includeDraft: true })
    const item = courseCatalog.mapCourseListItem(fresh)
    const message = buildDoneMessage(seed)
    patchJob(job, {
      status: 'done',
      progress: 100,
      phase: 'done',
      message,
      result: { seed, course: { ...item, seed } },
      finishedAt: Date.now()
    })
  } catch (err) {
    patchJob(job, {
      status: 'failed',
      phase: 'failed',
      message: err.message || 'AI 生成副本失败',
      error: err.message || 'AI 生成副本失败',
      finishedAt: Date.now()
    })
  }
}

function startJob(pathId, userId) {
  prune()
  const existingId = pathActive.get(pathId)
  if (existingId) {
    const existing = jobs.get(existingId)
    if (existing && (existing.status === 'running' || existing.status === 'queued')) {
      return existing
    }
  }
  const id = `aigen_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
  const job = {
    id,
    pathId,
    userId,
    status: 'queued',
    progress: 0,
    phase: 'queued',
    message: '排队中…',
    error: null,
    result: null,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    finishedAt: null
  }
  jobs.set(id, job)
  pathActive.set(pathId, id)
  setImmediate(() => {
    runJob(job).catch((err) => {
      console.error('[courseAiGenerateJob]', err)
      patchJob(job, {
        status: 'failed',
        phase: 'failed',
        message: err.message || 'AI 生成副本失败',
        error: err.message || 'AI 生成副本失败',
        finishedAt: Date.now()
      })
    })
  })
  return job
}

function getJob(jobId) {
  return jobs.get(String(jobId || '').trim()) || null
}

function getJobForPath(pathId) {
  const id = pathActive.get(String(pathId || '').trim())
  return id ? jobs.get(id) : null
}

/** 教师手动改课纲后丢弃内存 job，避免轮询再次灌回 AI 快照 */
function dismissForPath(pathId) {
  pathId = String(pathId || '').trim()
  if (!pathId) return false
  const id = pathActive.get(pathId)
  if (id) {
    jobs.delete(id)
    pathActive.delete(pathId)
    return true
  }
  return false
}

module.exports = {
  startJob,
  getJob,
  getJobForPath,
  dismissForPath,
  publicJob
}
