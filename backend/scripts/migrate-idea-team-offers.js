/**
 * 点子 · 团队委托单
 * node scripts/migrate-idea-team-offers.js
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
    CREATE TABLE IF NOT EXISTS idea_team_offers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      idea_id BIGINT UNSIGNED NOT NULL,
      owner_id BIGINT UNSIGNED NOT NULL,
      points INT NOT NULL,
      target_hint VARCHAR(120) NOT NULL DEFAULT '',
      note TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      acceptor_id BIGINT UNSIGNED NULL,
      project_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_ito_status (status, created_at),
      KEY idx_ito_idea (idea_id),
      KEY idx_ito_owner (owner_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  console.log('[migrate-idea-team-offers] done')
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-idea-team-offers] failed:', err.message)
  process.exit(1)
})
