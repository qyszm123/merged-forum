/**
 * 教师副本收费：定价字段 + 报名表 + 用户学校名
 * node scripts/migrate-course-pricing.js
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function addColumn(conn, table, column, ddl) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  )
  if (Number(rows[0]?.c || 0) > 0) {
    console.log(`[skip] ${table}.${column}`)
    return
  }
  await conn.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  console.log(`[ok] ${table}.${column}`)
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

  await addColumn(
    conn,
    'train_courses',
    'pricing_enabled',
    `pricing_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用校外收费'`
  )
  await addColumn(
    conn,
    'train_courses',
    'free_for_school',
    `free_for_school TINYINT(1) NOT NULL DEFAULT 1 COMMENT '本校学生免费'`
  )
  await addColumn(
    conn,
    'train_courses',
    'external_fee_yuan',
    `external_fee_yuan INT NOT NULL DEFAULT 0 COMMENT '校外价格（元/学期）'`
  )
  await addColumn(
    conn,
    'train_courses',
    'owner_school',
    `owner_school VARCHAR(120) NOT NULL DEFAULT '' COMMENT '本校名称，用于判定本校免费'`
  )

  await addColumn(
    conn,
    'users',
    'school_name',
    `school_name VARCHAR(120) NULL COMMENT '所属学校；空则按平台默认本校处理'`
  )

  await conn.query(`
    CREATE TABLE IF NOT EXISTS course_enrollments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      path_id VARCHAR(48) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'free',
      fee_yuan INT NOT NULL DEFAULT 0,
      paid_points INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_ce_path_user (path_id, user_id),
      KEY idx_ce_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  console.log('[ok] course_enrollments')

  await conn.query(
    `INSERT INTO school_settings (setting_key, setting_value)
     VALUES ('home_school', ?)
     ON DUPLICATE KEY UPDATE setting_value = setting_value`,
    [JSON.stringify({ name: '示范中学' })]
  )

  // 已有本校学生若未填学校，统一记为示范中学，便于「本校免费」演示
  await conn.query(
    `UPDATE users SET school_name = '示范中学'
     WHERE (school_name IS NULL OR school_name = '')
       AND role IN ('student','idea_king','project_owner','teacher')`
  )

  console.log('[migrate-course-pricing] done')
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-course-pricing] failed:', err.message)
  process.exit(1)
})
