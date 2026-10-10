/**
 * 全链路冒烟：验证各页面依赖的接口是否可用。
 * 传入的基地址就是「API 基地址」，可复用在不同环境：
 *   node smoke-app.mjs                                    → 本地 5173 代理
 *   node smoke-app.mjs https://xxx.trycloudflare.com      → 隧道 / 公网后端
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/$/, '')

async function login(studentNo) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentNo, password: '123456' })
  })
  const j = await r.json()
  if (j.code !== 0) throw new Error(`${studentNo} 登录失败: ${j.message}`)
  return j.data.token
}

async function hit(label, path, token) {
  const t0 = Date.now()
  try {
    const r = await fetch(`${BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    const ms = Date.now() - t0
    const body = await r.json().catch(() => null)
    const ok = r.ok && body && body.code === 0
    let shape = ''
    if (body?.data !== undefined) {
      const d = body.data
      if (Array.isArray(d)) shape = `数组 ${d.length} 项`
      else if (d && typeof d === 'object') shape = `对象 {${Object.keys(d).slice(0, 6).join(', ')}}`
      else shape = String(d)
    }
    console.log(`${ok ? '✅' : '❌'} ${label.padEnd(22)} ${String(r.status).padEnd(4)} ${String(ms).padStart(4)}ms  ${shape}`)
    if (!ok) console.log(`     └─ ${body?.message || '响应异常'}`)
    return ok
  } catch (e) {
    console.log(`❌ ${label.padEnd(22)} 请求失败: ${e.message}`)
    return false
  }
}

const student = await login('2026001')
const admin = await login('admin')
console.log('登录成功：2026001 / admin\n')

const checks = [
  ['首页 · 板块', '/api/forum/boards', student],
  ['首页 · 帖子流', '/api/forum/posts?sort=new&pageSize=5', student],
  ['侧栏 · 创造者', '/api/makers?pageSize=8', student],
  ['公告弹窗 · 概览', '/api/forum/overview', student],
  ['发帖页 · 板块', '/api/forum/boards', student],
  ['悬赏大厅', '/api/bounty?status=open&pageSize=5', student],
  ['悬赏 · 我的积分', '/api/points/me', student],
  ['招募大厅', '/api/recruit?status=open&pageSize=5', student],
  ['职业广场', '/api/careers', student],
  ['勋章墙', '/api/badges/all', student],
  ['我的 · 资料', '/api/auth/me', student],
  ['我的 · 勋章', '/api/badges/my', student],
  ['我的 · 收藏', '/api/forum/bookmarks?pageSize=5', student],
  ['我的 · 文件', '/api/uploads/mine', student],
  ['后台 · 邀请码', '/api/admin/invites?status=all&pageSize=5', admin],
  ['后台 · 帖子管理', '/api/admin/posts?pageSize=5', admin],
  ['后台 · 账号管理', '/api/admin/users?pageSize=5', admin],
  ['后台 · 举报审核', '/api/admin/reports?status=pending&pageSize=5', admin],
  ['后台 · 勋章管理', '/api/admin/badges', admin]
]

let pass = 0
for (const [label, path, token] of checks) {
  if (await hit(label, path, token)) pass++
}
console.log(`\n${pass === checks.length ? '✅' : '❌'} ${pass}/${checks.length} 个接口正常`)

// 取真实帖子 id 深链测一下详情页
const pr = await fetch(`${BASE}/api/forum/posts?sort=new&pageSize=1`, {
  headers: { Authorization: `Bearer ${student}` }
})
const pj = await pr.json()
const pid = pj.data?.list?.[0]?.id
if (pid) await hit('帖子详情', `/api/forum/posts/${pid}`, student)
process.exit(pass === checks.length ? 0 : 1)
