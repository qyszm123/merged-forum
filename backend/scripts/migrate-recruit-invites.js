/**
 * 招人动态 + 项目邀请
 * node scripts/migrate-recruit-invites.js
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
    CREATE TABLE IF NOT EXISTS project_recruit_posts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT UNSIGNED NOT NULL,
      author_id BIGINT UNSIGNED NOT NULL,
      role_wanted VARCHAR(64) NOT NULL DEFAULT '',
      body VARCHAR(1000) NOT NULL,
      sync_plaza TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_prp_created (created_at),
      KEY idx_prp_project (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await conn.query(`
    CREATE TABLE IF NOT EXISTS project_invites (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT UNSIGNED NOT NULL,
      inviter_id BIGINT UNSIGNED NOT NULL,
      invitee_id BIGINT UNSIGNED NOT NULL,
      note VARCHAR(500) NOT NULL DEFAULT '',
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      responded_at TIMESTAMP NULL DEFAULT NULL,
      UNIQUE KEY uk_pi_project_invitee (project_id, invitee_id),
      KEY idx_pi_invitee_status (invitee_id, status),
      KEY idx_pi_project (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  console.log('[migrate-recruit-invites] done')
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-recruit-invites] failed:', err.message)
  process.exit(1)
})
