/**
 * 悬赏大厅表
 * node scripts/migrate-bounty.js
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

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
    CREATE TABLE IF NOT EXISTS bounties (
      id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      asker_id          BIGINT UNSIGNED NOT NULL,
      title             VARCHAR(120) NOT NULL,
      content           MEDIUMTEXT NOT NULL,
      reward_points     INT UNSIGNED NOT NULL DEFAULT 0,
      status            ENUM('open','adopted','closed') NOT NULL DEFAULT 'open',
      adopted_answer_id BIGINT UNSIGNED NULL,
      answer_count      INT UNSIGNED NOT NULL DEFAULT 0,
      view_count        INT UNSIGNED NOT NULL DEFAULT 0,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_bounty_status (status, created_at),
      KEY idx_bounty_asker (asker_id),
      CONSTRAINT fk_bounty_asker FOREIGN KEY (asker_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await conn.query(`
    CREATE TABLE IF NOT EXISTS bounty_answers (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      bounty_id    BIGINT UNSIGNED NOT NULL,
      answerer_id  BIGINT UNSIGNED NOT NULL,
      content      MEDIUMTEXT NOT NULL,
      is_adopted   TINYINT(1) NOT NULL DEFAULT 0,
      like_count   INT UNSIGNED NOT NULL DEFAULT 0,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_answer_bounty (bounty_id, created_at),
      KEY idx_answer_user (answerer_id),
      CONSTRAINT fk_ans_bounty FOREIGN KEY (bounty_id) REFERENCES bounties(id) ON DELETE CASCADE,
      CONSTRAINT fk_ans_user FOREIGN KEY (answerer_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // forum_posts 增加附件列（存 upload id 数组，如 [1,2,3]）
  try {
    await conn.query(`ALTER TABLE forum_posts ADD COLUMN attachments JSON NULL COMMENT '附件 upload id 数组'`)
    console.log('[migrate-bounty] forum_posts + attachments OK')
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log('[migrate-bounty] forum_posts.attachments already exists')
    else throw e
  }

  console.log('[migrate-bounty] bounties / bounty_answers ready')
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-bounty] failed:', err.message)
  process.exit(1)
})
