/**
 * 教师/管理员创课 + 藏经阁
 * node scripts/migrate-courses.js
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
    CREATE TABLE IF NOT EXISTS train_courses (
      id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      path_id         VARCHAR(48)  NOT NULL COMMENT '副本 ID，如 c_xxx',
      title           VARCHAR(120) NOT NULL,
      blurb           VARCHAR(500) NULL,
      icon            VARCHAR(8)   NOT NULL DEFAULT '课',
      reward_identity VARCHAR(64)  NOT NULL DEFAULT '',
      owner_user_id   BIGINT UNSIGNED NOT NULL,
      visibility      ENUM('draft','listed','official') NOT NULL DEFAULT 'draft',
      chapters_json   JSON NOT NULL,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_path_id (path_id),
      KEY idx_visibility (visibility),
      KEY idx_owner (owner_user_id),
      CONSTRAINT fk_tc_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  console.log('[ok] train_courses')

  await conn.end()
  console.log('[migrate-courses] done')
}

run().catch((err) => {
  console.error('[migrate-courses] failed:', err.message)
  process.exit(1)
})
