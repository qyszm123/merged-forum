/**
 * 点子表 + 积分流水表
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
    CREATE TABLE IF NOT EXISTS ideas (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(120) NOT NULL,
      summary VARCHAR(255) NULL,
      content MEDIUMTEXT NULL,
      path_type VARCHAR(32) NOT NULL DEFAULT 'team',
      commission_price INT NOT NULL DEFAULT 800,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      delivered_project_id BIGINT UNSIGNED NULL,
      like_count INT NOT NULL DEFAULT 0,
      view_count INT NOT NULL DEFAULT 0,
      cover_url VARCHAR(512) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_ideas_owner (owner_id),
      KEY idx_ideas_status_created (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // 兼容旧 init 表结构（author_id / reward_points 等）
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ideas'`
  )
  const names = new Set(cols.map((r) => r.c))
  const alter = async (sql) => {
    try {
      await conn.query(sql)
      console.log('[ok]', sql.slice(0, 72))
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_BAD_FIELD_ERROR') {
        console.log('[skip]', e.code, sql.slice(0, 48))
      } else throw e
    }
  }
  if (names.has('author_id') && !names.has('owner_id')) {
    await alter(`ALTER TABLE ideas CHANGE COLUMN author_id owner_id BIGINT UNSIGNED NOT NULL`)
  }
  if (!names.has('owner_id') && !names.has('author_id')) {
    await alter(`ALTER TABLE ideas ADD COLUMN owner_id BIGINT UNSIGNED NOT NULL DEFAULT 0`)
  }
  if (!names.has('summary')) await alter(`ALTER TABLE ideas ADD COLUMN summary VARCHAR(255) NULL`)
  if (!names.has('path_type')) {
    await alter(`ALTER TABLE ideas ADD COLUMN path_type VARCHAR(32) NOT NULL DEFAULT 'team'`)
  }
  if (!names.has('commission_price')) {
    if (names.has('reward_points')) {
      await alter(`ALTER TABLE ideas CHANGE COLUMN reward_points commission_price INT NOT NULL DEFAULT 800`)
    } else {
      await alter(`ALTER TABLE ideas ADD COLUMN commission_price INT NOT NULL DEFAULT 800`)
    }
  }
  if (!names.has('delivered_project_id')) {
    if (names.has('project_id')) {
      await alter(
        `ALTER TABLE ideas CHANGE COLUMN project_id delivered_project_id BIGINT UNSIGNED NULL`
      )
    } else {
      await alter(`ALTER TABLE ideas ADD COLUMN delivered_project_id BIGINT UNSIGNED NULL`)
    }
  }
  if (!names.has('like_count')) await alter(`ALTER TABLE ideas ADD COLUMN like_count INT NOT NULL DEFAULT 0`)
  if (!names.has('view_count')) await alter(`ALTER TABLE ideas ADD COLUMN view_count INT NOT NULL DEFAULT 0`)
  if (!names.has('cover_url')) await alter(`ALTER TABLE ideas ADD COLUMN cover_url VARCHAR(512) NULL`)
  // status 可能是旧 ENUM，放宽为 VARCHAR
  await alter(`ALTER TABLE ideas MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'open'`)
  await alter(`ALTER TABLE ideas MODIFY COLUMN content MEDIUMTEXT NULL`)

  await conn.query(`
    CREATE TABLE IF NOT EXISTS points_ledger (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      amount INT NOT NULL,
      balance_after INT NOT NULL,
      reason VARCHAR(255) NOT NULL,
      ref_type VARCHAR(32) NULL,
      ref_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_points_ledger_user (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  console.log('[migrate-ideas] done')
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-ideas] failed:', err.message)
  process.exit(1)
})
