/**
 * 举报表迁移
 * node scripts/migrate-reports.js
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
    CREATE TABLE IF NOT EXISTS post_reports (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      reporter_id  BIGINT UNSIGNED NOT NULL,
      post_id      BIGINT UNSIGNED NOT NULL,
      reason       VARCHAR(500) NOT NULL,
      status       ENUM('pending','resolved','dismissed') NOT NULL DEFAULT 'pending',
      handler_id   BIGINT UNSIGNED NULL,
      handler_note VARCHAR(500) NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      handled_at   DATETIME NULL,
      UNIQUE KEY uk_report (reporter_id, post_id),
      KEY idx_rep_status (status, created_at),
      KEY idx_rep_post (post_id),
      CONSTRAINT fk_rep_reporter FOREIGN KEY (reporter_id) REFERENCES users(id),
      CONSTRAINT fk_rep_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  console.log('[migrate-reports] post_reports ready')

  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-reports] failed:', err.message)
  process.exit(1)
})
