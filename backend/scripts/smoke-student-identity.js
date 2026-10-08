/**
 * 学生通关教师/管理员副本 → 获得身份 冒烟
 * node scripts/smoke-student-identity.js
 */
const mysql = require('mysql2/promise')
const config = require('../src/config')

const BASE = process.env.API_BASE || 'http://127.0.0.1:3100/api'

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
    return json.data
  } finally {
    clearTimeout(timer)
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function completeQuiz(token, { pathId, tierId, taskId, nodeId }) {
  const start = await req(
    'POST',
    '/train/quiz/start',
    { pathId, tierId, taskId, nodeId, passScore: 50 },
    token
  )
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  })
  try {
    const [rows] = await conn.query(`SELECT questions_json FROM train_quiz_attempts WHERE id=?`, [
      start.attemptId
    ])
    const pack = JSON.parse(rows[0]?.questions_json || '[]')
    assert(pack.length > 0, '组卷无题')
    const graded = await req(
      'POST',
      '/train/quiz/submit',
      { attemptId: start.attemptId, answers: pack.map((q) => q.answer) },
      token
    )
    assert(graded.pass, `刷题未通过 score=${graded.score}`)
    return { quizAttemptId: start.attemptId, score: graded.score }
  } finally {
    await conn.end()
  }
}

async function main() {
  console.log('\n=== 学生通关获身份冒烟 ===\nAPI:', BASE)
  const stamp = Date.now().toString(36).slice(-4)
  const identity = `身份测-${stamp}`
  const title = `身份通关测${stamp}`

  console.log('\n1) 教师登录并创建极简副本（1 刷题 + 1 通关）')
  const teacher = await req('POST', '/auth/login', { studentNo: 'teacher', password: '123456' })
  const tt = teacher.token
  const chapters = [
    {
      id: `idtest-${stamp}-u1`,
      name: '身份测试单元',
      tier: 'beginner',
      nodes: [
        {
          id: `idtest-${stamp}-q1`,
          name: '概念自测',
          type: 'quiz',
          requires: []
        },
        {
          id: `idtest-${stamp}-boss`,
          name: '领取通关身份',
          type: 'reward',
          requires: [`idtest-${stamp}-q1`]
        }
      ]
    }
  ]
  const created = await req(
    'POST',
    '/train/courses',
    {
      title,
      blurb: '用于验证学生通关后是否获得身份',
      rewardIdentity: identity,
      icon: '测',
      publish: false,
      chapters
    },
    tt,
    300000
  )
  const pathId = created.id
  console.log('   pathId=', pathId)
  console.log('   rewardIdentity=', identity)
  console.log('   seed=', JSON.stringify(created.seed || {}))

  console.log('\n2) 上架副本')
  await req('POST', `/train/courses/${encodeURIComponent(pathId)}/publish`, {}, tt)

  console.log('\n3) 注册新学生并开通')
  const studentNo = `s${stamp}${Date.now().toString(36).slice(-3)}`
  let stu
  try {
    stu = await req('POST', '/auth/register', {
      studentNo,
      password: '123456',
      displayName: `身份学员${stamp}`
    })
  } catch {
    stu = await req('POST', '/auth/login', { studentNo, password: '123456' })
  }
  const st = stu.token
  console.log('   student=', studentNo, 'before identities=', stu.user?.identities || stu.identities || [])

  const access = await req('GET', `/train/courses/${encodeURIComponent(pathId)}/access`, undefined, st)
  console.log('   access=', access.reason || access.message, 'free=', access.free, 'needPay=', access.needPay)
  if (access.needPay || access.canEnter === false) {
    try {
      await req('POST', `/train/courses/${encodeURIComponent(pathId)}/enroll`, {}, st)
      console.log('   enroll ok')
    } catch (e) {
      console.log('   enroll:', e.message)
    }
  }

  const beforeMe = await req('GET', '/auth/me', undefined, st)
  const beforeIds = beforeMe.identities || []
  console.log('   me identities before=', beforeIds)
  assert(!beforeIds.includes(identity), '测试前不应已有目标身份')

  console.log('\n4) 刷题通关')
  const quizNode = chapters[0].nodes[0]
  const rewardNode = chapters[0].nodes[1]
  const quiz = await completeQuiz(st, {
    pathId,
    tierId: 'beginner',
    taskId: chapters[0].id,
    nodeId: quizNode.id
  })
  console.log('   quiz pass score=', quiz.score)
  const c1 = await req(
    'POST',
    '/train/complete',
    {
      pathId,
      tierId: 'beginner',
      nodeId: quizNode.id,
      score: quiz.score,
      quizAttemptId: quiz.quizAttemptId
    },
    st
  )
  console.log('   complete quiz pathDone=', c1.pathDone, 'earned=', c1.earned)

  console.log('\n5) 领取终关 → 应发放身份')
  const c2 = await req(
    'POST',
    '/train/complete',
    { pathId, tierId: 'beginner', nodeId: rewardNode.id, score: 100 },
    st
  )
  console.log('   complete reward pathDone=', c2.pathDone, 'earned=', c2.earned)
  assert(c2.pathDone === true, 'pathDone 应为 true')
  assert(Array.isArray(c2.earned) && c2.earned.includes(identity), `earned 应含 ${identity}，实际 ${JSON.stringify(c2.earned)}`)

  console.log('\n6) /auth/me 核对身份落库')
  const afterMe = await req('GET', '/auth/me', undefined, st)
  const afterIds = afterMe.identities || []
  console.log('   me identities after=', afterIds)
  assert(afterIds.includes(identity), `/auth/me 未包含身份 ${identity}`)

  console.log('\n=== 结果: PASS — 学生通关后可正常获得身份 ===')
  console.log(
    JSON.stringify(
      { pathId, title, identity, studentNo, earned: c2.earned, identities: afterIds },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error('\nFATAL', e.message)
  if (e.body) console.error(JSON.stringify(e.body, null, 2))
  process.exit(1)
})
