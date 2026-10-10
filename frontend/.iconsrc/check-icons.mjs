/**
 * 校验：JSX 里 <Icon name="..."> 用到的名字、以及 utils/icons.js 里映射的名字，
 * 是否都存在于生成的 components/Icon.jsx 中。
 * 用法：node frontend/.iconsrc/check-icons.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../', import.meta.url).pathname.replace(/^\//, '')
const SRC = join(root, 'src')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx|js)$/.test(name)) out.push(p)
  }
  return out
}

const iconFile = readFileSync(join(SRC, 'components/Icon.jsx'), 'utf8')
const available = new Set([...iconFile.matchAll(/^ {2}'([a-z0-9-]+)':/gm)].map((m) => m[1]))

const problems = []
let usedCount = 0

for (const file of walk(SRC)) {
  if (file.endsWith('Icon.jsx')) continue
  const rel = file.replace(/\\/g, '/').split('/src/')[1]
  const text = readFileSync(file, 'utf8')

  // <Icon name="xxx" />  以及 name={'xxx'} / name={cond ? 'a' : 'b'}
  for (const m of text.matchAll(/<Icon\b[^>]*?\bname=(?:"([^"]+)"|\{([^}]*)\})/gs)) {
    const literal = m[1]
    let names
    if (literal) {
      names = [literal]
    } else {
      // 先剔除三元表达式里的比较条件（如 slug === 'all'），只保留分支字面量
      const expr = m[2]
        .replace(/'[^']*'\s*[=!]==?/g, '')
        .replace(/[=!]==?\s*'[^']*'/g, '')
      names = [...expr.matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1])
    }
    for (const n of names) {
      usedCount++
      if (!available.has(n)) problems.push(`Icon.jsx 缺少图标 '${n}'  ← ${rel}`)
    }
  }

  // 数据驱动的图标名（NAV / MODULES / STAT_CARDS ...）：icon: 'xxx'
  for (const m of text.matchAll(/\bicon:\s*'([a-z0-9-]+)'/g)) {
    usedCount++
    if (!available.has(m[1])) problems.push(`Icon.jsx 缺少图标 '${m[1]}'  ← ${rel}`)
  }
}

// utils/icons.js 里的 emoji → 图标名映射
const util = readFileSync(join(SRC, 'utils/icons.js'), 'utf8')
for (const m of util.matchAll(/:\s*'([a-z0-9-]+)'/g)) {
  if (!available.has(m[1])) problems.push(`Icon.jsx 缺少图标 '${m[1]}'  ← utils/icons.js 映射`)
}

console.log('Icon.jsx 可用图标: ' + available.size)
console.log('JSX 引用图标次数: ' + usedCount)
if (problems.length) {
  console.log('❌ 有 ' + problems.length + ' 处问题：')
  problems.forEach((p) => console.log('   ' + p))
} else {
  console.log('✅ 全部图标引用都能解析')
}
