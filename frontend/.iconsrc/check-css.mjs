/**
 * 用 postcss 真正解析 styles.css，确保没有语法错误 / 悬空声明。
 * 用法：node frontend/.iconsrc/check-css.mjs
 */
import { readFileSync } from 'node:fs'
import postcss from 'postcss'

const url = new URL('../src/styles.css', import.meta.url)
const css = readFileSync(url, 'utf8')

try {
  const root = postcss.parse(css, { from: url.pathname })
  let rules = 0
  let decls = 0
  root.walkRules(() => rules++)
  root.walkDecls(() => decls++)

  // 悬空声明：出现在根节点下（没有选择器包裹）的声明
  const dangling = root.nodes.filter((n) => n.type === 'decl')
  if (dangling.length) {
    console.log('❌ 发现 ' + dangling.length + ' 条悬空声明（缺少选择器）：')
    dangling.forEach((d) => console.log(`   L${d.source.start.line}: ${d.prop}: ${d.value}`))
    process.exit(1)
  }

  console.log(`✅ styles.css 解析通过：${rules} 条规则 / ${decls} 条声明 / ${css.length} 字节`)
} catch (e) {
  console.log('❌ styles.css 解析失败：' + e.message)
  process.exit(1)
}
