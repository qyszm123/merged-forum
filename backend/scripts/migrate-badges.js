/**
 * 勋章系统表 + 种子勋章
 * node scripts/migrate-badges.js
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

const SEED_BADGES = [
  // post_count
  ['初来乍到', '发布第 1 篇帖子', '💬', 'post_count', 1],
  ['文思泉涌', '累计发布 10 篇帖子', '✍️', 'post_count', 10],
  ['论坛常客', '累计发布 50 篇帖子', '📝', 'post_count', 50],
  ['传奇作者', '累计发布 100 篇帖子', '🏆', 'post_count', 100],
  // comment_count
  ['初次互动', '发表第 1 条评论', '💭', 'comment_count', 1],
  ['热心交流', '累计评论 10 条', '🗣️', 'comment_count', 10],
  ['评论达人', '累计评论 50 条', '📣', 'comment_count', 50],
  // like_received_count
  ['初获认可', '累计获得 10 个赞', '👍', 'like_received_count', 10],
  ['人气之星', '累计获得 50 个赞', '⭐', 'like_received_count', 50],
  ['万众瞩目', '累计获得 100 个赞', '🌟', 'like_received_count', 100],
  // sign_in_days
  ['七日之约', '连续签到 7 天', '🔥', 'sign_in_days', 7],
  ['签到达人', '连续签到 30 天', '📅', 'sign_in_days', 30],
  // register_days
  ['一周年', '注册满 1 年', '🎂', 'register_days', 365],
  // bounty_completed
  ['悬赏完成者', '发布并完成 1 次悬赏', '💰', 'bounty_completed', 1]
]

async function run() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true
  })

  await conn.query(`
    CREATE TABLE IF NOT EXISTS badges (
      id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name            VARCHAR(50) NOT NULL COMMENT '勋章名称',
      description     VARCHAR(200) NULL COMMENT '勋章描述',
      icon            VARCHAR(255) NULL COMMENT '勋章图标 URL 或 emoji',
      condition_type  VARCHAR(50) NOT NULL COMMENT '条件类型：post_count/comment_count/like_received_count/sign_in_days/register_days/bounty_completed',
      condition_value INT NOT NULL DEFAULT 1 COMMENT '条件阈值',
      is_active       TINYINT(1) NOT NULL DEFAULT 1,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_badge_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_badges (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id      BIGINT UNSIGNED NOT NULL,
      badge_id     BIGINT UNSIGNED NOT NULL,
      awarded_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_displayed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否佩戴展示',
      UNIQUE KEY uk_user_badge (user_id, badge_id),
      KEY idx_user_badge_display (user_id, is_displayed),
      CONSTRAINT fk_ub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_ub_badge FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await conn.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id    BIGINT UNSIGNED NOT NULL,
      type       VARCHAR(32) NOT NULL DEFAULT 'system',
      content    VARCHAR(255) NOT NULL,
      ref_type   VARCHAR(32) NULL,
      ref_id     BIGINT UNSIGNED NULL,
      is_read    TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_notif_user (user_id, is_read, created_at),
      CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  for (const b of SEED_BADGES) {
    await conn.query(
      `INSERT IGNORE INTO badges (name, description, icon, condition_type, condition_value)
       VALUES (?, ?, ?, ?, ?)`,
      b
    )
  }

  console.log('[migrate-badges] badges / user_badges / notifications ready, seeded', SEED_BADGES.length, 'badges')
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-badges] failed:', err.message)
  process.exit(1)
})
