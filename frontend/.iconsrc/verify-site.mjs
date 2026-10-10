/**
 * 部署后检查：验证 GitHub Pages 上的静态站点是否真的可用。
 * 用法：node frontend/.iconsrc/verify-site.mjs [site-url]
 */
const SITE = (process.argv[2] || 'https://qyszm123.github.io/merged-forum').replace(/\/$/, '')

async function get(url, expectHtml = false) {
  const t0 = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(45000), redirect: 'follow' })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text, ms: Date.now() - t0, url: res.url }
  } catch (e) {
    return { ok: false, status: 0, text: '', ms: Date.now() - t0, error: e.message }
  }
}

let pass = 0
let fail = 0
const check = (label, cond, detail) => {
  console.log(`${cond ? '✅' : '❌'} ${label}${detail ? '  — ' + detail : ''}`)
  cond ? pass++ : fail++
}

/* 1. 首页 */
console.log(`站点：${SITE}\n`)
const home = await get(SITE + '/')
check('首页可访问', home.ok, home.ok ? `HTTP ${home.status}  ${home.ms}ms` : `HTTP ${home.status} ${home.error || ''}`)

const jsMatch = home.text.match(/src="([^"]+\.js)"/)
const cssMatch = home.text.match(/href="([^"]+\.css)"/)
check('资源路径带子路径前缀', /\/merged-forum\/assets\//.test(home.text), jsMatch ? jsMatch[1] : '(未找到)')
check('页面标题正确', home.text.includes('<title>奇遇广场</title>'))

/* 2. JS / CSS 资源 */
if (jsMatch) {
  const js = await get(jsMatch[1].startsWith('http') ? jsMatch[1] : 'https://qyszm123.github.io' + jsMatch[1])
  check('JS 资源可加载', js.ok, js.ok ? `${(js.text.length / 1024).toFixed(0)} KB  ${js.ms}ms` : `HTTP ${js.status}`)
  const apiBase = js.text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
  check('已注入独立后端地址', !!apiBase, apiBase ? apiBase[0] : '未找到（会回落到同源 /api）')
  check('已注入子路径 base', js.text.includes('/merged-forum/'), '')
}
if (cssMatch) {
  const css = await get(cssMatch[1].startsWith('http') ? cssMatch[1] : 'https://qyszm123.github.io' + cssMatch[1])
  check('CSS 资源可加载', css.ok, css.ok ? `${(css.text.length / 1024).toFixed(0)} KB` : `HTTP ${css.status}`)
  check('CSS 含新设计 token', css.text.includes('--theme-surface-elevated') && css.text.includes('.ico'))
}

/* 3. SPA 深链回退（404.html） */
const deep = await get(SITE + '/post/1')
const isSpaFallback = deep.text.includes('奇遇广场') && deep.text.includes('/merged-forum/assets/')
check('深链回退到 SPA（404.html）', isSpaFallback, `HTTP ${deep.status}（Pages 固定返回 404，但内容是 SPA）`)

/* 4. 后端接口 */
const apiBase = jsMatch
  ? (await get(jsMatch[1].startsWith('http') ? jsMatch[1] : 'https://qyszm123.github.io' + jsMatch[1])).text.match(
      /https:\/\/[a-z0-9-]+\.trycloudflare\.com/
    )?.[0]
  : null
if (apiBase) {
  const h = await get(apiBase + '/api/health')
  check('后端接口存活', h.ok && h.text.includes('"code":0'), h.ok ? `${apiBase}  ${h.ms}ms` : `HTTP ${h.status} ${h.error || ''}`)
  const login = await fetch(apiBase + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentNo: '2026001', password: '123456' }),
    signal: AbortSignal.timeout(45000)
  }).catch((e) => ({ ok: false, status: 0, _err: e.message }))
  check('后端登录可用', login.ok, login.status ? `HTTP ${login.status}` : login._err)
}

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败项'}：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
