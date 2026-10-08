/**
 * 演示上线验收：前端演示开关 + 关键 API
 * 策略：保留切角色 / 积分模拟购买；登录安全暂不收紧。
 * node scripts/smoke-pilot-check.js
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:3100/api'
const FE = process.env.FE_BASE || 'http://127.0.0.1:5173'
const results = []

function ok(n, d = '') {
  results.push({ ok: true, n, d })
  console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`)
}
function fail(n, e) {
  results.push({ ok: false, n, d: String(e) })
  console.log(`  ✗ ${n} — ${e}`)
}

async function req(method, path, body, token) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function main() {
  console.log('[前端演示上线资源]')
  const html = await (await fetch(`${FE}/`)).text()
  if (/prototype\.js\?v=/.test(html)) ok('原型脚本已带缓存版本')
  else fail('原型脚本缓存版本', 'index.html 未引用 prototype.js?v=')

  if (/btn-pricing-save-all-listed|收费设置/.test(html)) ok('收费总设置入口存在')
  else fail('收费总设置', '未见应用到全部已发布或收费设置文案')

  const jsMatch = html.match(/prototype\.js\?v=([^"']+)/)
  const jsVer = jsMatch ? jsMatch[1] : 'practice-ai-btn1'
  const js = await (await fetch(`${FE}/prototype.js?v=${jsVer}`)).text()
  if (/OPEN_DEMO\s*=\s*true/.test(js) && /isDemoRolesEnabled/.test(js)) {
    ok('演示切角色已开启（按上线策略保留）')
  } else fail('演示切角色', 'OPEN_DEMO/isDemoRolesEnabled 异常')

  if (/saveCoursePricingToAllListed|btn-pricing-save-all-listed/.test(js)) {
    ok('全部已发布副本收费同步逻辑已打入')
  } else fail('收费同步逻辑', '缺失 saveCoursePricingToAllListed')

  console.log('[补充 API]')
  const login = await req('POST', '/auth/login', { studentNo: '2026001', password: '123456' })
  if (login.json.code === 0) ok('登录', login.json.data.user.displayName)
  else fail('登录', login.json.message)
  const token = login.json.data?.token

  const me = await req('GET', '/auth/me', undefined, token)
  if (me.json.code === 0) ok('/auth/me', (me.json.data.identities || []).slice(0, 3).join('、'))
  else fail('/auth/me', me.json.message)

  const paths = [
    '/projects?pageSize=1',
    '/ideas?pageSize=1',
    '/makers?pageSize=1',
    '/forum/boards',
    '/forum/posts?pageSize=1',
    '/points/ledger?pageSize=5',
    '/train/catalog',
    '/train/map/network/beginner'
  ]
  for (const p of paths) {
    const r = await req('GET', p, undefined, token)
    if (r.json.code === 0) ok(p)
    else fail(p, r.json.message || r.status)
  }

  const bad = await req('POST', '/auth/login', { studentNo: '2026001', password: 'wrong' })
  if (bad.json.code !== 0) ok('错误密码拒绝')
  else fail('错误密码拒绝', '竟然成功')

  const noauth = await req('GET', '/auth/me')
  if (noauth.status === 401 || noauth.json.code !== 0) ok('无 token 拒绝 /me')
  else fail('无 token 拒绝', '竟然成功')

  const teacher = await req('POST', '/auth/login', { studentNo: 'teacher', password: '123456' })
  if (teacher.json.code === 0) {
    const tt = teacher.json.data.token
    const title = `试点灌库课 ${Date.now().toString(36).slice(-4)}`
    const created = await req(
      'POST',
      '/train/courses',
      {
        title,
        blurb: '试点验收自动灌可玩模板',
        rewardIdentity: `${title}通关`,
        publish: true
      },
      tt
    )
    if (created.json.code === 0) {
      const course = created.json.data
      const chN = (course.chapters || []).length
      const playable = course.playable || {}
      if (chN >= 2 && (playable.withBank >= 1 || playable.ok !== false)) {
        ok('教师上架自动可玩', `${course.id} · ${chN} 单元 · 题库单元 ${playable.withBank ?? '?'}`)
      } else fail('教师上架自动可玩', `章节=${chN} playable=${JSON.stringify(playable)}`)
    } else fail('教师上架自动可玩', created.json.message)
  } else fail('教师登录', teacher.json.message)

  const pass = results.filter((x) => x.ok).length
  const failn = results.filter((x) => !x.ok).length
  console.log(`\n演示上线验收: 通过 ${pass} · 失败 ${failn}`)
  process.exit(failn ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
