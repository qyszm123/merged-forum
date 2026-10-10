/**
 * 通过正在运行的 Vite dev server 逐个拉取源码模块，验证：
 *   - 模块能被 Vite 成功转换（HTTP 200）
 *   - 不返回 Vite 的错误载荷
 * 这比离线语法检查更接近真实运行时（含 JSX 转换、import 解析）。
 *
 * 用法：node frontend/.iconsrc/verify-dev.mjs [http://127.0.0.1:5173]
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] || 'http://127.0.0.1:5173'
const SRC = new URL('../src/', import.meta.url).pathname.replace(/^\//, '')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx|js)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(SRC).map((p) => p.replace(/\\/g, '/').split('/src/')[1])
const targets = ['index.html', 'src/main.jsx', ...files.map((f) => 'src/' + f)]

let bad = 0
for (const t of targets) {
  const url = `${BASE}/${t}`
  try {
    const res = await fetch(url)
    const body = await res.text()
    const isError =
      !res.ok ||
      /^\s*\{/.test(body) && /"?(message|error)"?\s*:/.test(body.slice(0, 400)) ||
      body.includes('Transform failed') ||
      body.includes('Pre-transform error')

    if (isError) {
      bad++
      console.log(`❌ ${t}  [HTTP ${res.status}]`)
      console.log('   ' + body.replace(/\s+/g, ' ').slice(0, 260))
    } else if (t === 'src/main.jsx') {
      console.log(`✅ ${t}  [HTTP ${res.status}] ${body.length} bytes`)
    }
  } catch (e) {
    bad++
    console.log(`❌ ${t}  请求失败: ${e.message}`)
  }
}

console.log(
  bad === 0
    ? `\n✅ 全部 ${targets.length} 个模块都能被 Vite 正常转换`
    : `\n❌ ${bad}/${targets.length} 个模块有问题`
)
process.exit(bad === 0 ? 0 : 1)
