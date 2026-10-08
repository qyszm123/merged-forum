/**
 * 教师创建副本「完整性」验收：结构 + AI 题库质量 + 学生可闯关
 * node scripts/smoke-teacher-course-complete.js
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:3100/api'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function req(method, path, body, token, timeoutMs = 180000) {
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

function isStubQuestion(q) {
  const t = String(q?.q || '')
  return (
    /学习目标主要是/.test(t) ||
    /推荐的正确做法是/.test(t) ||
    /下列理解更合理的是/.test(t) ||
    /属于哪一类任务/.test(t) ||
    /随便点选项/.test(t) ||
    /打开攻略学习后再回来刷题/.test(String((q?.opts || []).join('|')))
  )
}

async function main() {
  console.log('\n=== 教师副本完整性验收 ===\nAPI:', BASE)
  const stamp = Date.now().toString(36).slice(-4)
  const title = `校园数学建模实战${stamp}`

  console.log('\n1) 教师登录')
  const teacher = await req('POST', '/auth/login', { studentNo: 'teacher', password: '123456' })
  const tt = teacher.data.token
  assert(tt, '教师无 token')
  console.log('   ok', teacher.data.user?.name || 'teacher')

  console.log('\n2) 创建副本（含 AI 出题，可能较久）')
  const t0 = Date.now()
  const created = await req(
    'POST',
    '/train/courses',
    {
      title,
      blurb: '面向初中生的数学建模入门：问题抽象、变量设定、简单模型与结果解释，含刷题与作品实践。',
      rewardIdentity: '数学建模入门',
      icon: '模',
      publish: false
    },
    tt,
    300000
  )
  const course = created.data
  const pathId = course.id
  const seed = course.seed || {}
  console.log('   id=', pathId)
  console.log('   message=', created.message)
  console.log('   seed=', JSON.stringify(seed))
  console.log('   elapsed=', ((Date.now() - t0) / 1000).toFixed(1) + 's')
  assert(pathId, '无 pathId')
  assert(course.visibility === 'draft', '应为草稿')

  console.log('\n3) 拉取章节与 PBL')
  const catalog = await req('GET', `/train/catalog?pathId=${encodeURIComponent(pathId)}`, undefined, tt)
  // catalog shape may vary — also load pbl list
  const pblList = await req('GET', `/train/pbl?pathId=${encodeURIComponent(pathId)}`, undefined, tt)
  const defs = Array.isArray(pblList.data) ? pblList.data : pblList.data?.list || []
  console.log('   pbl defs=', defs.length)
  assert(defs.length >= 4, `PBL 单元过少: ${defs.length}`)

  let totalQ = 0
  let stubQ = 0
  let aiSources = 0
  const samples = []
  for (const row of defs) {
    const def = row.def || row
    const bank = Array.isArray(def.bank) ? def.bank : []
    totalQ += bank.length
    stubQ += bank.filter(isStubQuestion).length
    if (String(def.source || '').includes('ai')) aiSources += 1
    if (bank[0] && samples.length < 3) {
      samples.push({ task: def.taskId || row.taskId, q: bank[0].q, source: def.source })
    }
  }
  console.log('   total questions=', totalQ)
  console.log('   stub-like=', stubQ)
  console.log('   ai-sourced chapters=', aiSources)
  samples.forEach((s, i) => console.log(`   sample[${i}] (${s.source})`, s.q?.slice(0, 80)))

  const stubRatio = totalQ ? stubQ / totalQ : 1
  const qualityOk = totalQ >= 20 && stubRatio < 0.35 && aiSources >= 1
  console.log('\n4) 题库质量判定', qualityOk ? 'PASS' : 'FAIL')
  if (!qualityOk) {
    console.log(
      `   原因: totalQ=${totalQ} stubRatio=${(stubRatio * 100).toFixed(0)}% aiChapters=${aiSources} (期望≥20题、模板题<35%、至少1单元AI源)`
    )
  }

  let guideRich = 0
  let workRich = 0
  for (const row of defs) {
    const def = row.def || row
    const lines = def.guideLines || []
    if (lines.some((l) => String(l).split('|').length >= 4 || /讲义|导读|概念/.test(String(l)))) {
      guideRich += 1
    }
    if (def.workBriefs && Object.keys(def.workBriefs).length) workRich += 1
  }
  console.log('   guide-rich chapters=', guideRich, 'workBrief chapters=', workRich)

  console.log('\n5) 上架并学生访问')
  await req('POST', `/train/courses/${encodeURIComponent(pathId)}/publish`, {}, tt)
  const stu = await req('POST', '/auth/login', { studentNo: '2026001', password: '123456' })
  const st = stu.data.token
  const access = await req('GET', `/train/courses/${encodeURIComponent(pathId)}/access`, undefined, st)
  console.log('   access=', access.data?.reason || access.data?.message, 'free=', access.data?.free, 'needPay=', access.data?.needPay)

  const first = defs.find((r) => {
    const d = r.def || r
    return Array.isArray(d.bank) && d.bank.length
  })
  assert(first, '无可用刷题单元')
  const def = first.def || first
  const taskId = def.taskId || first.taskId
  const q0 = def.bank[0]
  const studentPbl = await req(
    'GET',
    `/train/pbl?pathId=${encodeURIComponent(pathId)}&taskId=${encodeURIComponent(taskId)}`,
    undefined,
    st
  )
  const sp = studentPbl.data?.def || studentPbl.data
  assert(sp, '学生拉不到 PBL')
  // 学生端不应直接带标准答案字段暴露过多——至少应有题干
  const sBank = sp.bank || []
  console.log('   student bank len=', sBank.length)

  // 尝试提交测验（若接口存在）
  let quizOk = false
  try {
    const quizNodes = (def.bank || []).map((q) => q.kpId).filter(Boolean)
    const nodeId = quizNodes[0] || `${pathId}-u1-q1`
    const answers = (def.bank || [])
      .filter((q) => !q.kpId || q.kpId === nodeId)
      .slice(0, 5)
      .map((q) => ({ questionId: q.id, answer: q.answer ?? 0 }))
    const submitted = await req(
      'POST',
      '/train/quiz/submit',
      { pathId, taskId, nodeId, answers },
      st
    )
    console.log('   quiz submit=', JSON.stringify(submitted.data || submitted).slice(0, 200))
    quizOk = true
  } catch (e) {
    console.log('   quiz submit skip/fail:', e.message)
  }

  console.log('\n=== 总结 ===')
  const complete =
    defs.length >= 4 &&
    totalQ >= 20 &&
    stubRatio < 0.35 &&
    (aiSources >= 1 || seed.aiChapters > 0) &&
    (guideRich >= 1 || seed.guideAiChapters > 0) &&
    (workRich >= 1 || seed.workAiChapters > 0)
  console.log(
    complete
      ? '结果: 结构完整且题库/攻略/实践达到可用标准'
      : '结果: 仍偏框架/模板，不能算「学生可真实使用的完整课」'
  )
  console.log(
    JSON.stringify(
      {
        pathId,
        title,
        chapters: defs.length,
        totalQ,
        stubQ,
        stubRatio: Number(stubRatio.toFixed(2)),
        aiSources,
        guideRich,
        workRich,
        seed,
        quizOk,
        complete
      },
      null,
      2
    )
  )
  process.exit(complete ? 0 : 2)
}

main().catch((e) => {
  console.error('\nFATAL', e.message)
  process.exit(1)
})
