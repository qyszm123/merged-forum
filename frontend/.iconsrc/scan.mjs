/**
 * 扫描 frontend/src 下的：
 *  1) 所有被用到的 className（用于重写 styles.css 时不漏类）
 *  2) 所有 emoji 及其所在行（用于替换为 Feather 图标）
 * 输出到 .iconsrc/report.md（UTF-8），避免控制台编码问题
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../src/', import.meta.url).pathname.replace(/^\//, '')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx|js)$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(SRC)
const classSet = new Set()
const dynClasses = new Set()
const report = []

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const rel = file.replace(/\\/g, '/').split('/src/')[1]

  // 静态 className="a b c"
  for (const m of text.matchAll(/className=(?:"([^"]*)"|'([^']*)')/g)) {
    const v = m[1] ?? m[2] ?? ''
    v.split(/\s+/).filter(Boolean).forEach((c) => classSet.add(c))
  }
  // 模板/三元里的字符串类名（粗粒度抓取）
  for (const m of text.matchAll(/className=\{[^}]*\}/g)) {
    for (const s of m[0].matchAll(/'([a-z][a-z0-9-]*(?:\s+[a-z0-9-]+)*)'/g)) {
      s[1].split(/\s+/).filter(Boolean).forEach((c) => dynClasses.add(c))
    }
  }

  // emoji
  const lines = text.split(/\r?\n/)
  const hits = []
  lines.forEach((line, i) => {
    const found = [...line.matchAll(/\p{Extended_Pictographic}/gu)].map((x) => x[0])
    if (found.length) hits.push(`  L${i + 1}: ${found.join(' ')}   | ${line.trim().slice(0, 110)}`)
  })
  if (hits.length) report.push(`### ${rel}\n${hits.join('\n')}`)
}

const out = [
  `# 扫描报告（自动生成）`,
  ``,
  `## 1. emoji 清单`,
  ``,
  ...report,
  ``,
  `## 2. className 静态清单（${classSet.size} 个）`,
  ``,
  [...classSet].sort().join('  \n'),
  ``,
  `## 3. 动态 className 中出现的类名（${dynClasses.size} 个，可能有误报）`,
  ``,
  [...dynClasses].sort().join('  \n')
].join('\n')

writeFileSync(new URL('./report.md', import.meta.url), out)
console.log('files=' + files.length + ' staticClasses=' + classSet.size + ' dyn=' + dynClasses.size)
