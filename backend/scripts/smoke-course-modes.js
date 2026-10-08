/**
 * 教师创建副本双模式 · 完整闭环验收
 * - 手动精细化：创草稿 → 增关 → 写入题库 → 上架 → 学生刷题通关
 * - AI 懒人：目标+资源 → AI 拆关灌课 → 上架 → 学生刷题
 *
 * node scripts/smoke-course-modes.js
 */
const fs = require('fs')
const path = require('path')

const BASE = process.env.API_BASE || 'http://127.0.0.1:3100/api'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function req(method, path, body, token, timeoutMs = 60000) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json.code !== 0) {
      const err = new Error(json.message || `HTTP ${res.status}`)
      err.status = res.status
      err.body = json
      throw err
    }
    return { data: json.data, message: json.message }
  } finally {
    clearTimeout(timer)
  }
}

function mkBank(kpId, n = 6) {
  const bank = []
  for (let i = 0; i < n; i++) {
    bank.push({
      id: `${kpId}-smoke-${i + 1}`,
      kpId,
      q: `【冒烟题${i + 1}】关于本关核心概念，正确理解是？`,
      opts: ['理解原理并能应用', '完全不用练习', '与本课无关', '跳过即可通关'],
      answer: 0,
      kind: 'smoke'
    })
  }
  return bank
}

function resolveAnswers(questions, answerBank) {
  const bankById = new Map((answerBank || []).map((q) => [q.id, q]))
  return questions.map((q) => {
    const src = bankById.get(q.id)
    if (src && Array.isArray(src.opts)) {
      const correctText = src.opts[Number(src.answer) || 0]
      const idx = (q.opts || []).indexOf(correctText)
      if (idx >= 0) return idx
    }
    const fallback = (q.opts || []).indexOf('理解原理并能应用')
    return fallback >= 0 ? fallback : 0
  })
}

async function uploadWorkFile(token, { pathId, nodeId, taskId }) {
  const tmp = path.join(__dirname, `_smoke_work_${Date.now()}.png`)
  fs.writeFileSync(tmp, Buffer.alloc(8192, 7))
  const apiRoot = BASE.replace(/\/api\/?$/, '') || 'http://127.0.0.1:3100'
  try {
    const buf = fs.readFileSync(tmp)
    const form = new FormData()
    form.append('file', new Blob([buf], { type: 'image/png' }), 'work.png')
    form.append('purpose', 'quest_work')
    form.append('pathId', pathId)
    form.append('nodeId', nodeId)
    if (taskId) form.append('taskId', taskId)
    const res = await fetch(`${apiRoot}/api/uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    })
    const json = await res.json().catch(() => ({}))
    if (res.status >= 400 || json.code !== 0) {
      throw new Error(json.message || `upload ${res.status}`)
    }
    return json.data
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignore */
    }
  }
}

async function completeWorkNode(token, { pathId, tierId, taskId, node }) {
  const uploaded = await uploadWorkFile(token, { pathId, nodeId: node.id, taskId })
  const topic = node.name || node.id
  const note =
    `【${topic}】作品说明：` +
    `本关围绕「${topic}」完成可展示交付物，写明学习目标、实现步骤、关键参数与改进方向，` +
    `并附设计图或流程说明，便于教师与同学理解创作意图与验收要点。`
  const submitted = await req(
    'POST',
    '/train/work/submit',
    {
      pathId,
      tierId,
      taskId,
      nodeId: node.id,
      uploadId: uploaded.id,
      note,
      requiresDefense: false,
      machinePassScore: 55
    },
    token
  )
  const review = submitted.data.review || {}
  assert(review.pass !== false, `机评未通过 ${node.id}: ${review.summary || submitted.data.status}`)
  await req(
    'POST',
    '/train/complete',
    {
      pathId,
      tierId,
      nodeId: node.id,
      submissionId: submitted.data.submissionId,
      uploadId: uploaded.id,
      score: review.score || 80
    },
    token
  )
}

async function unlockNodesBeforeQuiz({ pathId, taskId, nodeId, tierId, token, course }) {
  const ch = (course.chapters || []).find((c) => c.id === taskId)
  const nodes = ch?.nodes || []
  const idx = nodes.findIndex((n) => n.id === nodeId)
  if (idx <= 0) return
  for (let i = 0; i < idx; i++) {
    const n = nodes[i]
    if (n.type === 'work') {
      await completeWorkNode(token, { pathId, tierId, taskId, node: n })
    }
  }
}

async function studentQuizLoop({ pathId, taskId, nodeId, tierId, token, answerBank, course }) {
  if (course) {
    await unlockNodesBeforeQuiz({ pathId, taskId, nodeId, tierId, token, course })
  }
  return completeQuizNode(token, { pathId, taskId, nodeId, tierId, answerBank })
}

async function fetchPblBank(teacherToken, pathId, taskId) {
  const r = await req(
    'GET',
    `/train/pbl?pathId=${encodeURIComponent(pathId)}&taskId=${encodeURIComponent(taskId)}`,
    undefined,
    teacherToken
  )
  return r.data?.def?.bank || []
}

async function loginStudent(studentNo) {
  try {
    const r = await req('POST', '/auth/register', {
      studentNo,
      password: '123456',
      displayName: `学员${studentNo}`
    })
    return r.data.token
  } catch {
    const r = await req('POST', '/auth/login', { studentNo, password: '123456' })
    return r.data.token
  }
}

async function ensureStudentAccess(pathId, studentToken) {
  const access = await req(
    'GET',
    `/train/courses/${encodeURIComponent(pathId)}/access`,
    undefined,
    studentToken
  )
  if (access.data?.needPay || access.data?.canEnter === false) {
    try {
      await req('POST', `/train/courses/${encodeURIComponent(pathId)}/enroll`, {}, studentToken)
    } catch {
      /* 可能已开通 */
    }
  }
}

async function completeQuizNode(token, { pathId, taskId, nodeId, tierId, answerBank }) {
  const start = await req(
    'POST',
    '/train/quiz/start',
    { pathId, taskId, nodeId, tierId, passScore: 80 },
    token
  )
  const attemptId = start.data.attemptId
  const questions = start.data.questions || []
  assert(attemptId && questions.length >= 3, `组卷失败 ${nodeId}`)

  const answers = resolveAnswers(questions, answerBank)
  const submit = await req('POST', '/train/quiz/submit', { attemptId, answers }, token)
  assert(submit.data.pass, `刷题未通过 ${nodeId} score=${submit.data.score}（需≥80）`)

  const done = await req(
    'POST',
    '/train/complete',
    {
      pathId,
      tierId: tierId || 'beginner',
      nodeId,
      score: submit.data.score,
      quizAttemptId: submit.data.attemptId
    },
    token
  )
  return { score: submit.data.score, questions: questions.length, complete: done.data }
}

function assertCourseCompleteness(course, defs, rewardIdentity) {
  const chapters = course.chapters || []
  assert(chapters.length >= 1, '至少应有一关')
  const allNodes = chapters.flatMap((ch) => ch.nodes || [])
  assert(allNodes.some((n) => n.type === 'quiz'), '副本应有 quiz 节点')
  assert(allNodes.some((n) => n.type === 'reward'), '副本应有 reward 通关节点（否则无法发放身份）')
  assert(rewardIdentity, '应配置 rewardIdentity')

  for (const ch of chapters) {
    const quizNodes = (ch.nodes || []).filter((n) => n.type === 'quiz')
    if (!quizNodes.length) continue
    const row = defs.find((d) => (d.taskId || d.def?.taskId) === ch.id)
    const def = row?.def || row || {}
    assert((def.bank || []).length >= 3, `单元「${ch.name}」题库不足（${(def.bank || []).length} 题）`)
    assert((def.guideLines || []).length >= 1, `单元「${ch.name}」缺少攻略`)
    if ((ch.nodes || []).some((n) => n.type === 'work')) {
      assert(def.practiceEnabled !== false, `单元「${ch.name}」应启用实践`)
    }
  }
}

async function studentCompleteFullCourse({ pathId, course, token, teacherToken, rewardIdentity }) {
  const bankCache = new Map()
  async function bankFor(taskId) {
    if (!bankCache.has(taskId)) {
      bankCache.set(taskId, await fetchPblBank(teacherToken, pathId, taskId))
    }
    return bankCache.get(taskId)
  }

  let lastComplete = null
  for (const ch of course.chapters || []) {
    const tierId = ch.tier || 'beginner'
    const taskId = ch.id
    const answerBank = await bankFor(taskId)
    for (const node of ch.nodes || []) {
      console.log(`       · ${ch.name} / ${node.name} [${node.type}]`)
      if (node.type === 'quiz') {
        const r = await completeQuizNode(token, {
          pathId,
          taskId,
          nodeId: node.id,
          tierId,
          answerBank
        })
        lastComplete = r.complete
      } else if (node.type === 'work') {
        await completeWorkNode(token, { pathId, tierId, taskId, node })
      } else if (node.type === 'reward') {
        const done = await req(
          'POST',
          '/train/complete',
          { pathId, tierId, nodeId: node.id, score: 100 },
          token
        )
        lastComplete = done.data
      }
    }
  }

  assert(lastComplete?.pathDone === true, `pathDone 应为 true，末关=${JSON.stringify(lastComplete)}`)
  assert(
    Array.isArray(lastComplete?.earned) && lastComplete.earned.includes(rewardIdentity),
    `应获得身份「${rewardIdentity}」，实际 ${JSON.stringify(lastComplete?.earned)}`
  )
  const me = await req('GET', '/auth/me', undefined, token)
  assert(
    (me.data.identities || []).includes(rewardIdentity),
    `/auth/me 未包含身份 ${rewardIdentity}`
  )
  return lastComplete
}

async function loopManual(stamp, tt) {
  console.log('\n========== A) 手动精细化闭环 ==========')
  const t0 = Date.now()
  const created = await req(
    'POST',
    '/train/courses',
    {
      title: `手动精细${stamp}`,
      blurb: '资深教师逐关编排',
      goals: '学生能独立完成一个小作品',
      rewardIdentity: `精细${stamp}`,
      createMode: 'manual',
      resources: [
        {
          kind: 'link',
          title: 'B站计算机基础',
          url: 'https://www.bilibili.com/video/BV1aA411x7Us/',
          contributeLibrary: true
        }
      ]
    },
    tt
  )
  const course = created.data
  const pathId = course.id
  const elapsed = Date.now() - t0
  console.log('  1 创建草稿', pathId, `${elapsed}ms`, created.message)
  assert(course.createMode === 'manual', 'createMode 应为 manual')
  assert(elapsed < 15000, `手动创建过慢 ${elapsed}ms`)
  assert((course.chapters || []).length === 0, '手动模式应零起步任务')

  console.log('  2 新增第一关')
  const first = await req(
    'POST',
    `/train/courses/${encodeURIComponent(pathId)}/chapters`,
    {
      name: '第一关 · 入门',
      tier: 'beginner',
      nodes: [
        { name: '刷题测验', type: 'quiz' },
        { name: '实践作业', type: 'work' }
      ]
    },
    tt
  )
  const ch1 = first.data.chapter
  assert(ch1?.id, '第一关未创建')
  const quizNode = (ch1.nodes || []).find((n) => n.type === 'quiz') || ch1.nodes[0]
  assert(quizNode?.id, '第一关应有节点')

  console.log('  3 新增第二关 + quiz 节点')
  const added = await req(
    'POST',
    `/train/courses/${encodeURIComponent(pathId)}/chapters`,
    {
      name: '第二关 · 实践',
      tier: 'beginner',
      nodes: [
        { name: '概念自测', type: 'quiz' },
        { name: '动手小练', type: 'work' }
      ]
    },
    tt
  )
  const ch2 = added.data.chapter
  assert(ch2?.id, '第二关未创建')
  const ch2Quiz = (ch2.nodes || []).find((n) => n.type === 'quiz')
  const ch2Work = (ch2.nodes || []).find((n) => n.type === 'work')
  assert(ch2Quiz?.id, '第二关应有 quiz 节点')

  console.log('  4 新增通关节点（reward）')
  const rewardAdded = await req(
    'POST',
    `/train/courses/${encodeURIComponent(pathId)}/nodes`,
    { chapterId: ch2.id, name: '领取通关身份', type: 'reward' },
    tt
  )
  let courseFull = rewardAdded.data.course || course
  assert(
    (courseFull.chapters || []).some((ch) => (ch.nodes || []).some((n) => n.type === 'reward')),
    '应有 reward 节点'
  )

  console.log('  5 AI 关卡设计建议')
  try {
    const sug = await req(
      'POST',
      '/train/pbl/ai-suggest',
      { pathId, taskId: ch1.id, focus: '入门概念' },
      tt,
      90000
    )
    assert(sug.data.advice, '应有 advice')
    console.log('     advice=', String(sug.data.advice).slice(0, 60) + '…')
  } catch (e) {
    console.log('     skip ai-suggest:', e.message)
  }

  console.log('  6 写入题库与实践说明（手动模式不预灌题）')
  const bank1 = mkBank(quizNode.id, 8)
  const bank2 = mkBank(ch2Quiz.id, 8)
  const putPbl = async (taskId, title, bank, hasWork) => {
    await req(
      'PUT',
      '/train/pbl',
      {
        pathId,
        taskId,
        title,
        def: {
          pathId,
          taskId,
          title,
          kind: 'comprehensive',
          drillEnabled: true,
          practiceEnabled: hasWork,
          passScore: 80,
          guideEnabled: true,
          guideLines: ['入门讲义 | doc | | 先看讲义再刷题'],
          bank,
          workBriefs: hasWork && ch2Work ? { [ch2Work.id]: '完成本关小作品：写清目标、步骤与交付物。' } : {},
          acceptTypes: ['design', 'ppt', 'video'],
          defenseEnabled: false,
          countClear: true,
          source: 'smoke-manual-v1'
        }
      },
      tt
    )
  }
  await putPbl(ch1.id, ch1.name, bank1, false)
  await putPbl(ch2.id, ch2.name, bank2, true)

  const pblList = await req('GET', `/train/pbl?pathId=${encodeURIComponent(pathId)}`, undefined, tt)
  const defs = Array.isArray(pblList.data) ? pblList.data : []
  assertCourseCompleteness(courseFull, defs, `精细${stamp}`)

  console.log('  7 上架')
  await req('POST', `/train/courses/${encodeURIComponent(pathId)}/publish`, {}, tt)
  const pub = await req('GET', `/train/courses/${encodeURIComponent(pathId)}/access`, undefined, tt)
  console.log('     教师 access=', pub.data?.reason || 'ok')

  console.log('  8 学生全关闯关 → 获得身份')
  const studentNo = `m${stamp}`
  const st = await loginStudent(studentNo)
  await ensureStudentAccess(pathId, st)
  const earned = await studentCompleteFullCourse({
    pathId,
    course: courseFull,
    token: st,
    teacherToken: tt,
    rewardIdentity: `精细${stamp}`
  })
  console.log('     pathDone=', earned.pathDone, 'earned=', earned.earned)

  const resList = await req('GET', `/train/courses/${encodeURIComponent(pathId)}/resources`, undefined, tt)
  assert((resList.data.list || []).length >= 1, '本课资源应存在')

  console.log('  PASS 手动精细化闭环（含身份）')
  return pathId
}

async function loopAiLazy(stamp, tt) {
  console.log('\n========== B) AI 懒人闭环 ==========')
  const t0 = Date.now()
  const created = await req(
    'POST',
    '/train/courses',
    {
      title: `AI懒人${stamp}`,
      blurb: '面向初中生的数学建模入门',
      goals:
        '1. 能把实际问题抽象成变量与关系\n2. 会用简单模型估算结果\n3. 完成一次小组建模小作品并答辩',
      rewardIdentity: `建模${stamp}`,
      createMode: 'ai_lazy',
      icon: '模',
      resources: [
        {
          kind: 'video',
          title: '计算机基础网课',
          url: 'https://www.bilibili.com/video/BV1aA411x7Us/',
          contributeLibrary: true
        },
        {
          kind: 'video',
          title: '物联网入门',
          url: 'https://www.bilibili.com/video/BV1L7411c7jw/',
          contributeLibrary: true
        }
      ]
    },
    tt,
    15000
  )
  const elapsed = Date.now() - t0
  let course = created.data
  const pathId = course.id
  console.log('  1 保存基本设置（草稿）', pathId, `${elapsed}ms`)
  console.log('     message=', created.message)
  assert(pathId, '无 pathId')
  assert(course.createMode !== 'manual', 'createMode 应为 ai_lazy')
  assert(elapsed < 15000, `懒人创建应快速 ${elapsed}ms`)
  assert((course.chapters || []).length >= 1, '应有起步关')

  console.log('  2 步骤二 AI 拆关（后台任务 + 轮询）')
  const t1 = Date.now()
  const started = await req(
    'POST',
    `/train/courses/${encodeURIComponent(pathId)}/ai-generate`,
    {},
    tt,
    15000
  )
  assert(started.data?.jobId, '应有 jobId')
  assert(['queued', 'running'].includes(started.data.status), `job 状态异常: ${started.data.status}`)
  console.log('     jobId=', started.data.jobId)

  course = null
  for (let i = 0; i < 360; i++) {
    await sleep(1000)
    const st = await req(
      'GET',
      `/train/courses/${encodeURIComponent(pathId)}/ai-generate/status`,
      undefined,
      tt,
      15000
    )
    const job = st.data
    if (job.status === 'failed') throw new Error(job.error || job.message || 'AI job failed')
    if (job.status === 'done') {
      course = job.course
      console.log('     progress 100%', job.message)
      break
    }
    if (i % 8 === 0) console.log('     progress', `${job.progress || 0}%`, job.message || '')
  }
  const genElapsed = Date.now() - t1
  assert(course, 'AI job 超时未完成')
  const seed = course.seed || {}
  console.log('     ai-generate', `${(genElapsed / 1000).toFixed(1)}s`)
  console.log('     seed=', JSON.stringify(seed))
  assert((course.chapters || []).length >= 2, `拆关过少: ${(course.chapters || []).length}`)

  const pblList = await req('GET', `/train/pbl?pathId=${encodeURIComponent(pathId)}`, undefined, tt)
  const defs = Array.isArray(pblList.data) ? pblList.data : []
  console.log('  3 PBL 单元数=', defs.length)
  assert(defs.length >= 2, `PBL 过少: ${defs.length}`)

  let totalQ = 0
  let withGuide = 0
  for (const row of defs) {
    const def = row.def || row
    totalQ += (def.bank || []).length
    if ((def.guideLines || []).length) withGuide += 1
  }
  console.log('     总题量=', totalQ, '有攻略单元=', withGuide)
  assert(totalQ >= 6, `题库过少 ${totalQ}（AI 未配置时会偏少，至少应有模板题）`)

  assertCourseCompleteness(course, defs, `建模${stamp}`)

  console.log('  4 上架')
  await req('POST', `/train/courses/${encodeURIComponent(pathId)}/publish`, {}, tt)

  console.log('  5 学生全关闯关 → 获得身份')
  const studentNo = `a${stamp}`
  const st = await loginStudent(studentNo)
  await ensureStudentAccess(pathId, st)
  const earned = await studentCompleteFullCourse({
    pathId,
    course,
    token: st,
    teacherToken: tt,
    rewardIdentity: `建模${stamp}`
  })
  console.log('     pathDone=', earned.pathDone, 'earned=', earned.earned)

  const lib = await req('GET', '/train/resource-library?limit=5', undefined, tt)
  assert((lib.data.list || []).length >= 1, '资源库应有条目')

  console.log('  PASS AI 懒人闭环（含身份）')
  return pathId
}

async function main() {
  console.log('\n=== 教师创建副本 · 双模式完整闭环 ===')
  console.log('API:', BASE)
  const stamp = Date.now().toString(36).slice(-4)

  const teacher = await req('POST', '/auth/login', { studentNo: 'teacher', password: '123456' })
  const tt = teacher.data.token
  assert(tt, '教师无 token')

  await loopManual(stamp, tt)
  await loopAiLazy(stamp, tt)

  console.log('\n=== 全部 PASS：手动精细化 + AI 懒人 · 副本完整 · 学生通关获身份 ===\n')
}

main().catch((err) => {
  console.error('\nFAIL', err.message)
  if (err.body) console.error(JSON.stringify(err.body, null, 2))
  process.exit(1)
})
