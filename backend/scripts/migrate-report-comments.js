/**
 * 举报表扩展：支持举报评论
 * 运行：node scripts/migrate-report-comments.js
 *
 * 变更：
 *   post_reports.post_id    -> 可空（举报评论时为空）
 *   post_reports.comment_id -> 新增，可空
 *   uk_report_comment(reporter_id, comment_id) 唯一键，防止重复举报同一评论
 *   fk_rep_comment -> forum_comments(id) ON DELETE CASCADE
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function hasColumn(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  )
  return rows.length > 0
}

async function hasIndex(conn, table, index) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index]
  )
  return rows.length > 0
}

async function hasForeignKey(conn, table, constraint) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
    [table, constraint]
  )
  return rows.length > 0
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

  if (!(await hasColumn(conn, 'post_reports', 'comment_id'))) {
    await conn.query(`ALTER TABLE post_reports ADD COLUMN comment_id BIGINT UNSIGNED NULL AFTER post_id`)
    console.log('[migrate] + comment_id')
  }

  // post_id 改为可空
  const [cols] = await conn.query(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'post_reports' AND COLUMN_NAME = 'post_id' LIMIT 1`
  )
  if (cols[0] && String(cols[0].IS_NULLABLE).toUpperCase() === 'NO') {
    await conn.query(`ALTER TABLE post_reports MODIFY post_id BIGINT UNSIGNED NULL`)
    console.log('[migrate] ~ post_id 改为可空')
  }

  if (!(await hasIndex(conn, 'post_reports', 'uk_report_comment'))) {
    await conn.query(`ALTER TABLE post_reports ADD UNIQUE KEY uk_report_comment (reporter_id, comment_id)`)
    console.log('[migrate] + uk_report_comment')
  }

  if (!(await hasIndex(conn, 'post_reports', 'idx_rep_comment'))) {
    await conn.query(`ALTER TABLE post_reports ADD KEY idx_rep_comment (comment_id)`)
    console.log('[migrate] + idx_rep_comment')
  }

  if (!(await hasForeignKey(conn, 'post_reports', 'fk_rep_comment'))) {
    await conn.query(
      `ALTER TABLE post_reports
       ADD CONSTRAINT fk_rep_comment FOREIGN KEY (comment_id) REFERENCES forum_comments(id) ON DELETE CASCADE`
    )
    console.log('[migrate] + fk_rep_comment')
  }

  console.log('[migrate-report-comments] 完成，post_reports 已支持评论举报')
  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-report-comments] 失败:', err.message)
  process.exit(1)
})
