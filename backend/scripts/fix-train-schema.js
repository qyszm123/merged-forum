/**
 * 修炼进度双表：
 * - train_path_progress: 新 API cleared_json（smoke / 前端同步）
 * - train_progress: 旧 per-node（catalog/map/complete）
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function tryQuery(conn, sql, label) {
  try {
    await conn.query(sql)
    console.log('[ok]', label)
  } catch (err) {
    console.log('[skip]', label, err.code || err.message)
  }
}

async function run() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true
  })

  await tryQuery(
    conn,
    `CREATE TABLE IF NOT EXISTS train_path_progress (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      path_id VARCHAR(32) NOT NULL,
      cleared_json MEDIUMTEXT NOT NULL,
      train_task_id VARCHAR(64) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_train_path_progress_user_path (user_id, path_id),
      KEY idx_train_path_progress_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    'create train_path_progress'
  )

  await tryQuery(
    conn,
    `CREATE TABLE IF NOT EXISTS train_progress (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      path_id VARCHAR(32) NOT NULL,
      tier_id VARCHAR(32) NOT NULL,
      node_id VARCHAR(64) NOT NULL,
      status ENUM('locked','available','done') NOT NULL DEFAULT 'done',
      score INT NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_train_node (user_id, path_id, node_id),
      KEY idx_train_user_path (user_id, path_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    'ensure train_progress'
  )

  console.log('[fix-train-schema] done')
  await conn.end()
}

run().catch((err) => {
  console.error('[fix-train-schema] failed:', err.message)
  process.exit(1)
})
