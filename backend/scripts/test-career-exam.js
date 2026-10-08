/**
 * 结业考试 API 全链路测试
 * node scripts/test-career-exam.js
 */
const BASE = 'http://127.0.0.1:3101/api'

async function req(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function main() {
  const out = []
  const log = (m) => { out.push(m); console.log(m) }

  // 登录 2026003
  const login = await req('POST', '/auth/login', { studentNo: '2026003', password: '123456' })
  const tok = login.json.data.token
  log(`login: ${login.json.data.user.displayName}`)

  // 加入职业 3（产品经理）
  await req('POST', '/careers/3/join', null, tok)
  log('1 joined career 3 (产品经理)')

  // 2 技能未完成 → 考试应被拦截
  const blocked = await req('POST', '/careers/3/exam/start', null, tok)
  log(`2 exam-start before skills: status=${blocked.status} msg=${blocked.json.message}`)

  // 3 完成全部技能
  const detail = await req('GET', '/careers/3', null, tok)
  for (const s of detail.json.data.skills) {
    const r = await req('POST', `/careers/3/skills/${s.id}/complete`, null, tok)
    log(`3 complete skill "${s.name}": allDone=${r.json.data.allDone} done=${r.json.data.doneSkills}/${r.json.data.totalSkills}`)
  }

  // 4 开始考试
  const ex = await req('POST', '/careers/3/exam/start', null, tok)
  const qs = ex.json.data.questions
  log(`4 exam started: ${qs.length} 题, passScore=${ex.json.data.passScore}, qids=${qs.map(q => q.id).join(',')}`)

  // 5 全答错提交（正确答案 A,B,A,A,A → 错选 B,A,B,B,B）
  const wrong = ['B', 'A', 'B', 'B', 'B']
  const rw = await req('POST', '/careers/3/exam/submit', { answers: qs.map((q, i) => ({ questionId: q.id, answer: wrong[i] })) }, tok)
  log(`5 wrong submit: status=${rw.status} passed=${rw.json.data?.passed} score=${rw.json.data?.score} msg=${rw.json.message}`)

  // 6 失败后不应有身份
  const me1 = await req('GET', '/auth/me', null, tok)
  const ids1 = me1.json.data.identityDetails.map(i => i.name)
  log(`6 after fail identities: [${ids1.join(',')}] has产品经理=${ids1.includes('产品经理')}`)

  // 7 正确重考
  const right = ['A', 'B', 'A', 'A', 'A']
  const rr = await req('POST', '/careers/3/exam/submit', { answers: qs.map((q, i) => ({ questionId: q.id, answer: right[i] })) }, tok)
  log(`7 retry correct: passed=${rr.json.data?.passed} score=${rr.json.data?.score} msg=${rr.json.message}`)

  // 8 通过后有身份 + 已完成
  const me2 = await req('GET', '/auth/me', null, tok)
  const ids2 = me2.json.data.identityDetails.map(i => i.name)
  log(`8 after pass identities: [${ids2.join(',')}] has产品经理=${ids2.includes('产品经理')}`)

  // 9 已完成后再考试应被拦截
  const again = await req('POST', '/careers/3/exam/start', null, tok)
  log(`9 exam after completed: status=${again.status} msg=${again.json.message}`)

  require('fs').writeFileSync(__dirname + '/exam-test-result.txt', out.join('\n'))
}

main().catch((e) => {
  console.error('TEST ERROR:', e.message)
  process.exit(1)
})
