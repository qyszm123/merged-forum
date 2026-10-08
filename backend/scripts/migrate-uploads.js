/**
 * 上传文件表
 * node scripts/migrate-uploads.js
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function run() {
  const uploadRoot = path.join(__dirname, '../uploads')
  fs.mkdirSync(path.join(uploadRoot, 'quest'), { recursive: true })
  fs.mkdirSync(path.join(uploadRoot, 'project'), { recursive: true })
  fs.mkdirSync(path.join(uploadRoot, 'other'), { recursive: true })
  fs.mkdirSync(path.join(uploadRoot, 'files'), { recursive: true })

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true
  })

  await conn.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      purpose ENUM('quest_work','project_pack','other') NOT NULL DEFAULT 'other',
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(128) NOT NULL,
      size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
      rel_path VARCHAR(512) NOT NULL,
      path_id VARCHAR(32) NULL,
      node_id VARCHAR(64) NULL,
      task_id VARCHAR(64) NULL,
      note VARCHAR(2000) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_uploads_user (user_id, created_at),
      KEY idx_uploads_purpose (purpose, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  console.log('[migrate-uploads] table ready, dirs ready:', uploadRoot)
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-uploads] failed:', err.message)
  process.exit(1)
})
