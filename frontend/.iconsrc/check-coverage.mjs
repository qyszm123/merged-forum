/**
 * 校验：JSX 里用到的每个 className，在 styles.css 中是否都有样式规则
 * 用法：node frontend/.iconsrc/check-coverage.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../', import.meta.url).pathname.replace(/^\//, '')
const SRC = join(root, 'src')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.jsx$/.test(name)) out.push(p)
  }
  return out
}

const used = new Map() // class -> Set(文件)
const add = (cls, file) => {
  if (!used.has(cls)) used.set(cls, new Set())
  used.get(cls).add(file)
}

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8')
  const rel = file.replace(/\\/g, '/').split('/src/')[1]

  for (const m of text.matchAll(/className=(?:"([^"]*)"|'([^']*)')/g)) {
    ;(m[1] ?? m[2] ?? '').split(/\s+/).filter(Boolean).forEach((c) => add(c, rel))
  }
  for (const m of text.matchAll(/className=\{([^}]*)\}/g)) {
    // 先剔除三元里的比较条件（state === 'loading'），那些字符串不是类名
    const expr = m[1]
      .replace(/'[^']*'\s*[=!]==?/g, '')
      .replace(/[=!]==?\s*'[^']*'/g, '')
    for (const s of expr.matchAll(/'([^']*)'/g)) {
      s[1].split(/\s+/).filter(Boolean).forEach((c) => add(c, rel))
    }
  }
}

const css = readFileSync(join(root, 'src/styles.css'), 'utf8')
const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))

// 这些不是样式钩子，只是布尔/变体标记或子元素名，允许没有独立规则
const IGNORE = new Set([
  'active', 'done', 'open', 'closed', 'accepted', 'rejected', 'disabled', 'danger',
  'picked', 'owned', 'locked', 'displayed', 'adopted', 'ok', 'bad', 'short',
  'liked', 'bookmarked', 'sm', 'md', 'lg', 'login', 'register',
  'invites', 'posts', 'users', 'reports', 'badges', 'ico'
])

const missing = [...used.keys()].filter((c) => !defined.has(c) && !IGNORE.has(c)).sort()

console.log('JSX 中使用类名: ' + used.size)
console.log('styles.css 中定义: ' + defined.size)
if (missing.length === 0) {
  console.log('✅ 覆盖率 100%：没有缺失的类名')
} else {
  console.log('❌ 缺失 ' + missing.length + ' 个类名：')
  for (const c of missing) console.log('   .' + c + '   ← ' + [...used.get(c)].join(', '))
}
console.log('\n可能冗余（定义了但 JSX 未用）的类：' + [...defined].filter((c) => !used.has(c)).length + ' 个')
