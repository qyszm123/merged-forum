/**
 * 教师副本 · 官方授身份：是否计入创造者
 * node scripts/migrate-course-identity.js
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
    database: config.db.database
  })

  await addColumn(
    conn,
    'train_courses',
    'grants_creator',
    `grants_creator TINYINT(1) NOT NULL DEFAULT 0 COMMENT '通关是否计入创造者晋升'`
  )

  console.log('[migrate-course-identity] done')
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-course-identity] failed:', err.message)
  process.exit(1)
})
