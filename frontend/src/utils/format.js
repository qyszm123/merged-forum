/** 相对时间：刚刚 / n 分钟前 / n 小时前 / n 天前 / 日期 */
export function timeAgo(input) {
  if (!input) return ''
  const s = String(input)
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : '+08:00'))
  if (Number.isNaN(d.getTime())) return s.slice(0, 10)
  const diff = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前'
  if (d.getFullYear() === new Date().getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 在线状态：无真实 presence 数据时，按 id 稳定伪随机，保证同一用户前后一致 */
export function isOnline(seed) {
  const n = Number(seed) || 0
  return (n * 2654435761) % 3 !== 0
}

/** 勋章获取条件的人类可读描述 */
export function describeBadgeCondition(type, value) {
  const v = Number(value || 0)
  switch (type) {
    case 'post_count':
      return `发帖 ${v} 篇`
    case 'comment_count':
      return `评论 ${v} 条`
    case 'like_received_count':
      return `获得 ${v} 个赞`
    case 'sign_in_days':
      return `连续签到 ${v} 天`
    case 'register_days':
      return v >= 365 ? '注册满 1 年' : `注册满 ${v} 天`
    case 'bounty_completed':
      return `完成悬赏 ${v} 次`
    default:
      return `达到 ${v}`
  }
}

/** 清洗摘要：去除 markdown 语法、HTML 标签，折叠空白，截断到 maxLen */
export function stripMarkdown(md, maxLen = 140) {
  if (!md) return ''
  let text = String(md)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length > maxLen) text = text.slice(0, maxLen).trimEnd() + '…'
  return text
}
