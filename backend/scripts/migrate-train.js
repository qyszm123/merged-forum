/**
 * 修炼进度 + 任务规则表
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
    CREATE TABLE IF NOT EXISTS train_progress (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      path_id VARCHAR(32) NOT NULL,
      cleared_json MEDIUMTEXT NOT NULL,
      train_task_id VARCHAR(64) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_train_progress_user_path (user_id, path_id),
      KEY idx_train_progress_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await conn.query(`
    CREATE TABLE IF NOT EXISTS pbl_task_defs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      path_id VARCHAR(32) NOT NULL,
      task_id VARCHAR(64) NOT NULL,
      title VARCHAR(160) NOT NULL DEFAULT '',
      def_json MEDIUMTEXT NOT NULL,
      updated_by BIGINT UNSIGNED NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pbl_path_task (path_id, task_id),
      KEY idx_pbl_path (path_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await conn.query(`
    CREATE TABLE IF NOT EXISTS train_work_submissions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      path_id VARCHAR(32) NOT NULL,
      tier_id VARCHAR(32) NOT NULL DEFAULT 'beginner',
      task_id VARCHAR(64) NULL,
      node_id VARCHAR(64) NOT NULL,
      upload_id BIGINT UNSIGNED NULL,
      note MEDIUMTEXT NULL,
      machine_score INT NOT NULL DEFAULT 0,
      machine_json MEDIUMTEXT NULL,
      defense_score INT NULL,
      defense_json MEDIUMTEXT NULL,
      requires_defense TINYINT(1) NOT NULL DEFAULT 1,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_work_user_node (user_id, path_id, node_id),
      KEY idx_work_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await conn.query(`
    CREATE TABLE IF NOT EXISTS train_quiz_attempts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      path_id VARCHAR(32) NOT NULL,
      tier_id VARCHAR(32) NOT NULL DEFAULT 'beginner',
      task_id VARCHAR(64) NULL,
      node_id VARCHAR(64) NOT NULL,
      questions_json MEDIUMTEXT NOT NULL,
      answers_json MEDIUMTEXT NULL,
      score INT NOT NULL DEFAULT 0,
      pass_score INT NOT NULL DEFAULT 80,
      passed TINYINT(1) NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'started',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_quiz_user_node (user_id, path_id, node_id),
      KEY idx_quiz_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  console.log('[migrate-train] done')
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-train] failed:', err.message)
  process.exit(1)
})
