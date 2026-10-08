/**
 * 服务端刷题权威判分冒烟
 * node scripts/smoke-quiz-db.js
 */
require('dotenv').config()
const API = process.env.API_URL || 'http://127.0.0.1:3100/api'

async function api(method, p, token, body) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body != null ? JSON.stringify(body) : undefined
  })
  const json = await res.json()
  if (json.code !== 0) throw new Error(json.message || `HTTP ${res.status}`)
  return json.data
}

async function main() {
  const no = `8${Date.now().toString().slice(-9)}`
  const reg = await api('POST', '/auth/register', null, {
    studentNo: no,
    password: '123456',
    displayName: `刷题测-${no.slice(-4)}`
  })
  const token = reg.token

  // 无 attempt 直接 complete 应失败
  try {
    await api('POST', '/train/complete', token, {
      pathId: 'hardware',
      tierId: 'beginner',
      nodeId: 'hw-survey',
      score: 100
    })
    throw new Error('应拒绝无测验通关')
  } catch (e) {
    if (String(e.message).includes('应拒绝')) throw e
    console.log('gate ok:', e.message)
  }

  const start = await api('POST', '/train/quiz/start', token, {
    pathId: 'hardware',
    tierId: 'beginner',
    taskId: 'hw-u1',
    nodeId: 'hw-survey',
    passScore: 80
  })
  if (!start.attemptId || !start.questions?.length) throw new Error('组卷失败')
  if (start.questions.some((q) => q.answer != null)) throw new Error('题目泄露答案')

  // 故意全错
  const fail = await api('POST', '/train/quiz/submit', token, {
    attemptId: start.attemptId,
    answers: start.questions.map(() => 3)
  })
  if (fail.pass) throw new Error('全错不应通过')

  const start2 = await api('POST', '/train/quiz/start', token, {
    pathId: 'hardware',
    tierId: 'beginner',
    taskId: 'hw-u1',
    nodeId: 'hw-survey',
    passScore: 50
  })
  // 用服务端内部再查 attempt 答案不方便；换低分线 + 读库
  const mysql = require('mysql2/promise')
  const config = require('../src/config')
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  })
  const [rows] = await conn.query(`SELECT questions_json FROM train_quiz_attempts WHERE id=?`, [
    start2.attemptId
  ])
  const pack = JSON.parse(rows[0].questions_json)
  await conn.end()
  const answers = pack.map((q) => q.answer)
  const pass = await api('POST', '/train/quiz/submit', token, {
    attemptId: start2.attemptId,
    answers
  })
  if (!pass.pass) throw new Error('全对应通过')

  const done = await api('POST', '/train/complete', token, {
    pathId: 'hardware',
    tierId: 'beginner',
    nodeId: 'hw-survey',
    score: pass.score,
    quizAttemptId: start2.attemptId
  })
  console.log('[smoke-quiz-db] ok', { score: pass.score, node: done.node?.id, points: done.pointsGain })

  // 商业题库组卷
  const biz = await api('POST', '/quiz/start'.replace('/quiz', '/train/quiz'), token, {
    pathId: 'business',
    tierId: 'beginner',
    taskId: 'biz-u1',
    nodeId: 'biz-user',
    passScore: 80
  }).catch(async (e) => {
    // 可能被门禁拦在 map；组卷本身不检查 requiresAny
    if (/需先通关/.test(e.message)) return null
    // quiz/start 无门禁
    return api('POST', '/train/quiz/start', token, {
      pathId: 'business',
      tierId: 'beginner',
      taskId: 'biz-u1',
      nodeId: 'biz-user',
      passScore: 80
    })
  })
  const bizStart =
    biz ||
    (await api('POST', '/train/quiz/start', token, {
      pathId: 'business',
      tierId: 'beginner',
      taskId: 'biz-u1',
      nodeId: 'biz-user',
      passScore: 80
    }))
  if (!bizStart.questions?.length) throw new Error('商业题库未组卷')
  console.log('[smoke-quiz-db] business bank ok', bizStart.questions.length)
}

main().catch((e) => {
  console.error('[smoke-quiz-db] failed:', e.message)
  process.exit(1)
})
