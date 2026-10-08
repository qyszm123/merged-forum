/**
 * 实践作品教师评分字段
 * node scripts/migrate-work-teacher-grade.js
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function alter(conn, sql) {
  try {
    await conn.query(sql)
    console.log('[ok]', sql.slice(0, 90))
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME') {
      console.log('[skip]', e.code)
    } else throw e
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

  await alter(
    conn,
    `ALTER TABLE train_work_submissions
       ADD COLUMN teacher_score INT NULL AFTER defense_score`
  )
  await alter(
    conn,
    `ALTER TABLE train_work_submissions
       ADD COLUMN teacher_note VARCHAR(1000) NULL AFTER teacher_score`
  )
  await alter(
    conn,
    `ALTER TABLE train_work_submissions
       ADD COLUMN graded_by BIGINT UNSIGNED NULL AFTER teacher_note`
  )
  await alter(
    conn,
    `ALTER TABLE train_work_submissions
       ADD COLUMN graded_at TIMESTAMP NULL AFTER graded_by`
  )
  await alter(
    conn,
    `ALTER TABLE train_work_submissions ADD KEY idx_work_path_status (path_id, status)`
  )

  await conn.end()
  console.log('[migrate-work-teacher-grade] done')
}

run().catch((err) => {
  console.error('[migrate-work-teacher-grade] failed:', err.message)
  process.exit(1)
})
