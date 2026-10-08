/**
 * 点子组队演示：创造者身份 + 一条申请并可选批准
 * API_BASE=http://127.0.0.1:3056/api node scripts/seed-idea-join-demo.js
 */
require('dotenv').config()
const mysql = require('mysql2/promise')

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 3056}/api`

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  })
  const json = await res.json()
  if (json.code !== 0) throw new Error(`${method} ${path} => ${json.message}`)
  return json.data
}

async function login(studentNo) {
  return req('POST', '/auth/login', { studentNo, password: '123456' })
}

async function ensureCreatorIdentities() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kcsquare'
  })
  const [users] = await conn.query(
    `SELECT id, student_no FROM users WHERE student_no IN ('2026001','2026002','2026003')`
  )
  for (const u of users) {
    await conn.query(
      `INSERT IGNORE INTO user_identities (user_id, identity, source)
       VALUES (?, '创造者', 'seed')`,
      [u.id]
    )
    console.log('[ok] identity 创造者 →', u.student_no)
  }
  await conn.end()
}

async function main() {
  console.log('[seed-idea-join] base=', BASE)
  await ensureCreatorIdentities()

  const owner = await login('2026001')
  const applicant = await login('2026002')

  let idea = (await req('GET', '/ideas/mine?pageSize=40', undefined, owner.token)).list?.find(
    (i) => i.status === 'open' && i.openRecruit !== false
  )
  if (!idea) {
    idea = await req(
      'POST',
      '/ideas',
      {
        title: '演示·课间饮水点位优化',
        summary: '统计高峰饮水拥堵，欢迎一起做。',
        pathType: 'team',
        openRecruit: true
      },
      owner.token
    )
    console.log('[ok] created idea#', idea.id)
  } else {
    console.log('[ok] use idea#', idea.id, idea.title)
  }

  const before = await req('GET', `/ideas/${idea.id}`, undefined, applicant.token)
  if (before.myJoinStatus === 'member' || before.myJoinStatus === 'approved') {
    console.log('[skip] already member')
  } else if (before.myJoinStatus === 'pending') {
    console.log('[info] pending exists')
  } else {
    const join = await req(
      'POST',
      `/ideas/${idea.id}/join`,
      { message: '演示：可做前端原型，一起落地' },
      applicant.token
    )
    console.log('[ok] applied', join)
  }

  const pending = await req('GET', `/ideas/${idea.id}/join-requests`, undefined, owner.token)
  const row = (pending.list || []).find((r) => r.status === 'pending')
  if (row) {
    await req('POST', `/ideas/${idea.id}/join-requests/${row.id}/approve`, {}, owner.token)
    console.log('[ok] approved#', row.id)
  }

  const after = await req('GET', `/ideas/${idea.id}`, undefined, applicant.token)
  console.log(
    '[done] members=',
    (after.members || []).map((m) => `${m.name}/${m.role}`).join(', ') || '(none)',
    'myJoinStatus=',
    after.myJoinStatus
  )
}

main().catch((e) => {
  console.error('[seed-idea-join] failed:', e.message)
  process.exit(1)
})
