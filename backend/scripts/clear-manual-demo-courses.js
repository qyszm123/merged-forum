/**
 * 清除手动精细化演示副本（DB）
 * node scripts/clear-manual-demo-courses.js
 * node scripts/clear-manual-demo-courses.js --all-manual  删除全部 manual 草稿
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function run() {
  const allManual = process.argv.includes('--all-manual')
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  })

  const [rows] = await conn.query(
    allManual
      ? `SELECT path_id, title, visibility, create_mode FROM train_courses WHERE create_mode = 'manual'`
      : `SELECT path_id, title, visibility, create_mode FROM train_courses
         WHERE create_mode = 'manual'
           AND (title LIKE '%物理实验%' OR title LIKE '%（手动）%' OR title LIKE '%(手动)%')`
  )

  if (!rows.length) {
    console.log('[clear-manual] 无匹配的手动副本')
    await conn.end()
    return
  }

  console.log(`[clear-manual] 将删除 ${rows.length} 个手动副本：`)
  for (const row of rows) {
    console.log(`  - ${row.path_id} · ${row.title} · ${row.visibility}`)
  }

  for (const row of rows) {
    const pathId = row.path_id
    await conn.query(`DELETE FROM pbl_task_defs WHERE path_id = ?`, [pathId])
    await conn.query(`DELETE FROM train_course_resources WHERE path_id = ?`, [pathId])
    await conn.query(`DELETE FROM train_courses WHERE path_id = ?`, [pathId])
  }

  console.log('[clear-manual] 完成')
  await conn.end()
}

run().catch((err) => {
  console.error('[clear-manual] failed:', err.message)
  process.exit(1)
})
