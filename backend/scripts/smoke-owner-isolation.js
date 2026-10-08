/**
 * 验证：各账号只能管理自己的项目/点子
 * API_BASE=http://127.0.0.1:3056/api node scripts/smoke-owner-isolation.js
 */
require('dotenv').config()

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
  return { status: res.status, ...json }
}

async function login(studentNo) {
  const r = await req('POST', '/auth/login', { studentNo, password: '123456' })
  if (r.code !== 0) throw new Error(`login ${studentNo}: ${r.message}`)
  return { token: r.data.token, user: r.data.user }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function main() {
  const a = await login('2026001')
  const b = await login('2026002')
  const mineA = await req('GET', '/projects/mine?pageSize=40', undefined, a.token)
  const mineB = await req('GET', '/projects/mine?pageSize=40', undefined, b.token)
  assert(mineA.code === 0 && mineB.code === 0, 'mine projects failed')
  const listA = mineA.data.list || []
  const listB = mineB.data.list || []
  assert(listA.length > 0 && listB.length > 0, 'need owned projects on both accounts')
  assert(
    listA.every((p) => Number(p.owner?.id) === Number(a.user.id)),
    'A mine leaked foreign project'
  )
  assert(
    listB.every((p) => Number(p.owner?.id) === Number(b.user.id)),
    'B mine leaked foreign project'
  )
  const foreign = listB[0]
  const patch = await req(
    'PATCH',
    `/projects/${foreign.id}`,
    { acceptApplications: false },
    a.token
  )
  assert(patch.code === 403 || patch.status === 403, `A should not patch B project, got ${patch.code}`)

  const timeline = await req(
    'POST',
    `/projects/${foreign.id}/timeline`,
    { content: '非法动态' },
    a.token
  )
  assert(timeline.code === 403 || timeline.status === 403, `A should not timeline B project`)

  const ideasB = await req('GET', '/ideas/mine?pageSize=40', undefined, b.token)
  const idea = (ideasB.data.list || []).find((i) => i.status === 'open') || (ideasB.data.list || [])[0]
  assert(idea, 'B needs an idea')
  const commission = await req(
    'POST',
    `/ideas/${idea.id}/commission`,
    { commissionPrice: 3000, note: 'steal' },
    a.token
  )
  assert(commission.code === 403 || commission.status === 403, `A should not commission B idea`)

  const ideasA = await req('GET', '/ideas/mine?pageSize=40', undefined, a.token)
  assert(
    (ideasA.data.list || []).every((i) => Number(i.owner?.id) === Number(a.user.id)),
    'A ideas mine leaked'
  )

  console.log('[ok] owner isolation', {
    aProjects: listA.length,
    bProjects: listB.length,
    aIdeas: (ideasA.data.list || []).length,
    bIdeas: (ideasB.data.list || []).length
  })
}

main().catch((e) => {
  console.error('[fail]', e.message)
  process.exit(1)
})
