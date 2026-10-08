/**
 * 教师创建副本双模式：AI 懒人 / 手动精细 + 课程资源库
 * node scripts/migrate-course-create-modes.js
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
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
  const uploadRoot = path.join(__dirname, '../uploads')
  fs.mkdirSync(path.join(uploadRoot, 'course'), { recursive: true })

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
    'create_mode',
    `create_mode VARCHAR(16) NOT NULL DEFAULT 'ai_lazy' COMMENT 'ai_lazy|manual'`
  )
  await addColumn(
    conn,
    'train_courses',
    'goals_text',
    `goals_text TEXT NULL COMMENT '课程目标（AI 懒人模式）'`
  )
  await addColumn(
    conn,
    'train_courses',
    'resources_json',
    `resources_json JSON NULL COMMENT '创建时附带的资源快照'`
  )

  await conn.query(`
    CREATE TABLE IF NOT EXISTS train_course_resources (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      path_id VARCHAR(48) NULL,
      owner_user_id BIGINT UNSIGNED NOT NULL,
      kind VARCHAR(16) NOT NULL COMMENT 'video|doc|audio|link',
      title VARCHAR(200) NOT NULL,
      url VARCHAR(1000) NULL,
      upload_id BIGINT UNSIGNED NULL,
      note VARCHAR(2000) NULL,
      contribute_library TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_tcr_path (path_id),
      KEY idx_tcr_owner (owner_user_id),
      KEY idx_tcr_library (contribute_library, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  console.log('[ok] train_course_resources')

  // uploads.purpose 增加 course_material；path_id 放宽到 48
  try {
    await conn.query(
      `ALTER TABLE uploads
       MODIFY purpose ENUM('quest_work','project_pack','other','course_material')
       NOT NULL DEFAULT 'other'`
    )
    console.log('[ok] uploads.purpose +course_material')
  } catch (err) {
    console.log('[skip] uploads.purpose', err.message)
  }
  try {
    await conn.query(`ALTER TABLE uploads MODIFY path_id VARCHAR(48) NULL`)
    console.log('[ok] uploads.path_id VARCHAR(48)')
  } catch (err) {
    console.log('[skip] uploads.path_id', err.message)
  }

  console.log('[migrate-course-create-modes] done')
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-course-create-modes] failed:', err.message)
  process.exit(1)
})
