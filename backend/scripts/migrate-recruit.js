/**
 * 招募大厅表
 * node scripts/migrate-recruit.js
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
    CREATE TABLE IF NOT EXISTS recruitments (
      id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      publisher_id   BIGINT UNSIGNED NOT NULL,
      title          VARCHAR(120) NOT NULL,
      content        MEDIUMTEXT NOT NULL,
      role_wanted    VARCHAR(120) NOT NULL DEFAULT '' COMMENT '招募角色，如 前端/硬件/答辩',
      member_count   INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '招募人数',
      status         ENUM('open','closed') NOT NULL DEFAULT 'open',
      app_count      INT UNSIGNED NOT NULL DEFAULT 0,
      accepted_count INT UNSIGNED NOT NULL DEFAULT 0,
      view_count     INT UNSIGNED NOT NULL DEFAULT 0,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_rec_status (status, created_at),
      KEY idx_rec_publisher (publisher_id),
      CONSTRAINT fk_rec_publisher FOREIGN KEY (publisher_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await conn.query(`
    CREATE TABLE IF NOT EXISTS recruitment_applications (
      id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      recruitment_id BIGINT UNSIGNED NOT NULL,
      applicant_id   BIGINT UNSIGNED NOT NULL,
      intro          VARCHAR(1000) NOT NULL COMMENT '自我介绍/报名理由',
      status         ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_ra_once (recruitment_id, applicant_id),
      KEY idx_ra_rec (recruitment_id, created_at),
      KEY idx_ra_user (applicant_id),
      CONSTRAINT fk_ra_rec FOREIGN KEY (recruitment_id) REFERENCES recruitments(id) ON DELETE CASCADE,
      CONSTRAINT fk_ra_user FOREIGN KEY (applicant_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  console.log('[migrate-recruit] recruitments / recruitment_applications ready')
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-recruit] failed:', err.message)
  process.exit(1)
})
