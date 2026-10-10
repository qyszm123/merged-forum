/**
 * 从 Feather Icons 官方数据生成 frontend/src/components/Icon.jsx
 * 用法：node frontend/.iconsrc/generate.mjs
 * 数据来源：feather-icons@4.29.2 dist/icons.json（MIT）
 */
import { readFileSync, writeFileSync } from 'node:fs'

const icons = JSON.parse(readFileSync(new URL('./icons.json', import.meta.url), 'utf8'))

/** 本项目实际用到的图标集（按用途分组，便于维护） */
const WANTED = {
  导航与外壳: [
    'home', 'grid', 'layers', 'award', 'book-open', 'user', 'users', 'shield',
    'sliders', 'search', 'edit-3', 'plus', 'x', 'menu', 'sun', 'moon', 'droplet',
    'sunrise', 'sunset', 'log-out', 'log-in', 'bell', 'settings', 'refresh-cw',
    'external-link', 'copy', 'link'
  ],
  箭头与方向: [
    'chevron-down', 'chevron-left', 'chevron-right', 'chevron-up',
    'arrow-left', 'arrow-right', 'arrow-up', 'arrow-down', 'arrow-up-circle'
  ],
  论坛内容: [
    'thumbs-up', 'thumbs-down', 'message-circle', 'message-square', 'bookmark', 'flag',
    'clock', 'eye', 'hash', 'tag', 'image', 'paperclip', 'file-text', 'file', 'package',
    'film', 'music', 'download', 'upload', 'trash-2', 'trash', 'edit', 'edit-2', 'send',
    'filter', 'list', 'bar-chart-2', 'activity', 'trending-up', 'trending-down',
    'zap', 'star', 'heart', 'calendar', 'map-pin', 'gift', 'key', 'lock', 'unlock', 'mail'
  ],
  业务与状态: [
    'briefcase', 'box', 'archive', 'folder', 'database', 'server', 'terminal', 'code',
    'cpu', 'monitor', 'smartphone', 'wifi', 'cloud', 'globe', 'compass', 'target',
    'crosshair', 'layout', 'anchor', 'feather', 'life-buoy', 'percent', 'dollar-sign',
    'credit-card', 'pie-chart', 'shopping-bag', 'video', 'camera', 'mic', 'play',
    'volume-2', 'repeat', 'shuffle', 'share-2', 'check-square', 'more-horizontal',
    'more-vertical', 'hexagon', 'inbox', 'pen-tool', 'aperture', 'circle', 'power',
    'clipboard'
  ],
  反馈与用户: [
    'alert-circle', 'alert-triangle', 'info', 'help-circle', 'check', 'check-circle',
    'x-circle', 'plus-circle', 'eye-off', 'user-plus', 'user-check', 'user-x'
  ]
}

const NAMES = [...new Set(Object.values(WANTED).flat())]
const missing = NAMES.filter((n) => !icons[n])
if (missing.length) {
  console.error('这些图标在 Feather v4.29.2 中不存在：' + missing.join(', '))
  process.exit(1)
}

/** Feather 的每个图形都是无子节点的空元素，直接转成自闭合 JSX 即可 */
function toJsx(body) {
  return body.replace(/<(\w+)([^>]*)><\/\1>/g, '<$1$2 />')
}

const entries = NAMES.map((n) => `  '${n}': <>${toJsx(icons[n])}</>`).join(',\n')

const out = `/**
 * Icon —— Feather Icons 线性图标组件
 *
 * 图标来源：https://feathericons.com （feather-icons v4.29.2，MIT License）
 * 本文件由 frontend/.iconsrc/generate.mjs 自动生成，请勿手工编辑。
 * 需要新增图标时：在 generate.mjs 的 WANTED 里加名字后重新生成。
 *
 * 用法：
 *   <Icon name="search" />
 *   <Icon name="thumbs-up" size={16} className="is-liked" />
 *   <Icon name="flag" size={14} strokeWidth={2.2} />
 */
const PATHS = {
${entries}
}

export const iconNames = Object.keys(PATHS)

export default function Icon({
  name,
  size = 18,
  strokeWidth = 2,
  className = '',
  title,
  ...rest
}) {
  const body = PATHS[name]
  if (!body) return null

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={'ico' + (className ? ' ' + className : '')}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  )
}
`

const target = new URL('../src/components/Icon.jsx', import.meta.url)
writeFileSync(target, out)
console.log(`generated ${NAMES.length} icons -> src/components/Icon.jsx (${out.length} bytes)`)
