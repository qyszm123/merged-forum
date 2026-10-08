/**
 * 点子组队：成员表 + 申请表（申请后需发布者同意）
 * 用法：node scripts/migrate-idea-join.js
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
    CREATE TABLE IF NOT EXISTS idea_members (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      idea_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'member',
      joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_idea_user (idea_id, user_id),
      KEY idx_idea (idea_id),
      KEY idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  console.log('[ok] idea_members')

  await conn.query(`
    CREATE TABLE IF NOT EXISTS idea_join_requests (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      idea_id INT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NOT NULL,
      message VARCHAR(500) NOT NULL DEFAULT '',
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP NULL DEFAULT NULL,
      UNIQUE KEY uk_idea_user (idea_id, user_id),
      KEY idx_idea_status (idea_id, status),
      KEY idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  console.log('[ok] idea_join_requests')

  await conn.end()
  console.log('[migrate-idea-join] done')
}

run().catch((err) => {
  console.error('[migrate-idea-join] failed:', err.message)
  process.exit(1)
})
