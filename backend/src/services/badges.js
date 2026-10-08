const { query } = require('../db/pool')
const { createNotification } = require('./notifications')

/** 将 'YYYY-MM-DD' 平移 delta 天，返回 'YYYY-MM-DD'（UTC 计算，避免时区漂移） */
function shiftDay(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return dt.toISOString().slice(0, 10)
}

/** 连续签到天数：从最近一次签到日往前连续计数 */
async function consecutiveSignInDays(userId) {
  const rows = await query(
    `SELECT DISTINCT DATE_FORMAT(checkin_day, '%Y-%m-%d') AS d
     FROM user_checkins WHERE user_id = :uid ORDER BY d DESC LIMIT 366`,
    { uid: userId }
  )
  if (!rows.length) return 0
  const set = new Set(rows.map((r) => r.d))
  let streak = 0
  let cur = rows[0].d
  while (set.has(cur)) {
    streak += 1
    cur = shiftDay(cur, -1)
  }
  return streak
}

/** 汇总用户统计（用于勋章条件判断，实时计算不落库，避免冗余表漂移） */
async function getUserStats(userId) {
  const [posts, comments, likes, user, bounties] = await Promise.all([
    query(`SELECT COUNT(*) AS c FROM forum_posts WHERE author_id = :uid AND status = 'published'`, { uid: userId }),
    query(`SELECT COUNT(*) AS c FROM forum_comments WHERE author_id = :uid`, { uid: userId }),
    query(
      `SELECT
         (SELECT COALESCE(SUM(like_count), 0) FROM forum_posts WHERE author_id = :uid AND status = 'published') +
         (SELECT COALESCE(SUM(like_count), 0) FROM forum_comments WHERE author_id = :uid) AS total`,
      { uid: userId }
    ),
    query(`SELECT DATEDIFF(NOW(), created_at) AS days FROM users WHERE id = :uid`, { uid: userId }),
    query(`SELECT COUNT(*) AS c FROM bounties WHERE asker_id = :uid AND status = 'adopted'`, { uid: userId })
  ])

  return {
    post_count: Number(posts[0]?.c || 0),
    comment_count: Number(comments[0]?.c || 0),
    like_received_count: Number(likes[0]?.total || 0),
    sign_in_days: await consecutiveSignInDays(userId),
    register_days: Number(user[0]?.days || 0),
    bounty_completed: Number(bounties[0]?.c || 0)
  }
}

/**
 * 检查并授予勋章（幂等）：
 * 满足阈值且尚未拥有则写入 user_badges 并发站内通知。
 * @returns {Promise<Array>} 本次新授予的勋章列表
 */
async function checkAndAwardBadges(userId) {
  const stats = await getUserStats(userId)
  const badges = await query(
    `SELECT id, name, description, icon, condition_type, condition_value
     FROM badges WHERE is_active = 1 ORDER BY id`
  )
  const existingRows = await query(`SELECT badge_id FROM user_badges WHERE user_id = :uid`, { uid: userId })
  const existing = new Set(existingRows.map((r) => r.badge_id))

  const awarded = []
  for (const b of badges) {
    if (existing.has(b.id)) continue
    const current = stats[b.condition_type] ?? 0
    if (current >= b.condition_value) {
      await query(`INSERT IGNORE INTO user_badges (user_id, badge_id) VALUES (:uid, :bid)`, {
        uid: userId,
        bid: b.id
      })
      await createNotification(userId, 'badge', `恭喜你获得【${b.name}】！`, 'badge', b.id)
      awarded.push(b)
    }
  }
  return awarded
}

module.exports = { getUserStats, checkAndAwardBadges }
