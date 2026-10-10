/**
 * 数据库里的职业 / 技能 / 勋章图标是自带的 emoji（如 careers.icon='💻'、badges.icon='🏅'）。
 * 这里把常见 emoji 映射成 Feather 图标名，让全站线性图标风格统一；
 * 未收录的 emoji 返回 null，由调用方回退为直接显示原文。
 */
const EMOJI_ICON_MAP = {
  // 勋章 / 成就
  '🏅': 'award',
  '🏆': 'award',
  '🥇': 'award',
  '🎖': 'award',
  '⭐': 'star',
  '🌟': 'star',
  '✨': 'star',
  '👑': 'star',
  '💎': 'hexagon',
  '🚀': 'trending-up',
  '📈': 'trending-up',
  '💡': 'zap',
  '⚡': 'zap',
  '🔥': 'activity',
  '🎯': 'target',
  '🌱': 'feather',
  '🍀': 'feather',
  '🛡': 'shield',
  '✅': 'check-circle',
  '❤': 'heart',
  '🤝': 'users',
  '👥': 'users',
  '🟢': 'circle',
  '💰': 'dollar-sign',
  '🎁': 'gift',
  '🔑': 'key',
  '🌍': 'globe',
  '🧭': 'compass',

  // 职业 / 技能
  '💻': 'monitor',
  '🖥': 'monitor',
  '⚛': 'aperture',
  '🎨': 'pen-tool',
  '✏': 'edit-3',
  '📝': 'edit-3',
  '✍': 'edit-3',
  '📖': 'book-open',
  '📚': 'book-open',
  '🎓': 'book-open',
  '🧠': 'cpu',
  '⚙': 'settings',
  '🔧': 'settings',
  '🛠': 'settings',
  '🔌': 'power',
  '🗄': 'database',
  '📋': 'clipboard',
  '🔍': 'search',
  '📅': 'calendar',
  '🗓': 'calendar',
  '📊': 'bar-chart-2',
  '📱': 'smartphone'
}

/** 去掉变体选择符（U+FE0F），避免 '✍️' 与 '✍' 匹配不上 */
function normalize(icon) {
  return String(icon).replace(/\uFE0F/g, '').trim()
}

/** emoji → Feather 图标名；未收录返回 null（调用方回退显示原 emoji） */
export function emojiIconName(icon) {
  if (!icon) return null
  return EMOJI_ICON_MAP[normalize(icon)] || null
}
