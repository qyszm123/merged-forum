/**
 * 广场展示数据与「我的发布」隔离：is_showcase
 * node scripts/migrate-showcase-flag.js
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function tryAlter(conn, sql) {
  try {
    await conn.query(sql)
    console.log('[ok]', sql.slice(0, 90))
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('[skip]', err.code)
      return
    }
    throw err
  }
}

async function run() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  })
  await tryAlter(
    conn,
    `ALTER TABLE projects ADD COLUMN is_showcase TINYINT NOT NULL DEFAULT 0 AFTER status`
  )
  await tryAlter(
    conn,
    `ALTER TABLE ideas ADD COLUMN is_showcase TINYINT NOT NULL DEFAULT 0 AFTER status`
  )
  console.log('[migrate-showcase-flag] done')
  await conn.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
