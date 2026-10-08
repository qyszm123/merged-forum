/**
 * 清空全部教师副本（train_courses）及关联编排数据
 * node scripts/clear-all-teacher-courses.js
 * node scripts/clear-all-teacher-courses.js --yes  跳过确认
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const readline = require('readline')
const config = require('../src/config')

async function confirm(msg) {
  if (process.argv.includes('--yes')) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${msg} (y/N) `, (ans) => {
      rl.close()
      resolve(/^y(es)?$/i.test(String(ans || '').trim()))
    })
  })
}

async function run() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  })

  const [rows] = await conn.query(
    `SELECT path_id, title, visibility, create_mode FROM train_courses ORDER BY updated_at DESC`
  )

  if (!rows.length) {
    console.log('[clear-all] 数据库中无教师副本')
    await conn.end()
    return
  }

  console.log(`[clear-all] 将删除 ${rows.length} 个副本：`)
  for (const row of rows) {
    console.log(`  - ${row.path_id} · ${row.title} · ${row.visibility} · ${row.create_mode}`)
  }

  const ok = await confirm('\n确认删除以上全部副本及题库编排？')
  if (!ok) {
    console.log('[clear-all] 已取消')
    await conn.end()
    return
  }

  const pathIds = rows.map((r) => r.path_id)
  const placeholders = pathIds.map(() => '?').join(',')

  const [pbl] = await conn.query(
    `SELECT COUNT(*) AS n FROM pbl_task_defs WHERE path_id IN (${placeholders})`,
    pathIds
  )
  const [res] = await conn.query(
    `SELECT COUNT(*) AS n FROM train_course_resources WHERE path_id IN (${placeholders})`,
    pathIds
  )

  await conn.query(`DELETE FROM pbl_task_defs WHERE path_id IN (${placeholders})`, pathIds)
  await conn.query(`DELETE FROM train_course_resources WHERE path_id IN (${placeholders})`, pathIds)
  await conn.query(`DELETE FROM train_courses WHERE path_id IN (${placeholders})`, pathIds)

  console.log(
    `[clear-all] 完成 · 副本 ${rows.length} · 题库编排 ${pbl[0].n} · 资源 ${res[0].n}`
  )
  console.log('[clear-all] 请 Ctrl+Shift+R 刷新前端；如有 backend 进程建议重启以丢弃 AI job 内存缓存')
  await conn.end()
}

run().catch((err) => {
  console.error('[clear-all] failed:', err.message)
  process.exit(1)
})
