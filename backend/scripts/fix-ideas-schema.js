/**
 * 对齐旧 ideas 表到 routes/ideas.js 所需字段
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function tryQuery(conn, sql, label) {
  try {
    await conn.query(sql)
    console.log('[ok]', label)
  } catch (err) {
    console.log('[skip]', label, err.code || err.message)
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

  const [[cnt]] = await conn.query('SELECT COUNT(*) AS n FROM ideas')
  console.log('ideas rows', cnt.n)

  await tryQuery(
    conn,
    'ALTER TABLE ideas CHANGE COLUMN author_id owner_id BIGINT UNSIGNED NOT NULL',
    'author_id -> owner_id'
  )
  await tryQuery(conn, "ALTER TABLE ideas ADD COLUMN summary VARCHAR(255) NULL AFTER title", 'add summary')
  await tryQuery(
    conn,
    "ALTER TABLE ideas ADD COLUMN path_type VARCHAR(32) NOT NULL DEFAULT 'team' AFTER content",
    'add path_type'
  )
  await tryQuery(
    conn,
    'ALTER TABLE ideas ADD COLUMN commission_price INT NOT NULL DEFAULT 800 AFTER path_type',
    'add commission_price'
  )
  await tryQuery(
    conn,
    'ALTER TABLE ideas ADD COLUMN delivered_project_id BIGINT UNSIGNED NULL AFTER status',
    'add delivered_project_id'
  )
  await tryQuery(
    conn,
    'ALTER TABLE ideas ADD COLUMN like_count INT NOT NULL DEFAULT 0 AFTER delivered_project_id',
    'add like_count'
  )
  await tryQuery(
    conn,
    'ALTER TABLE ideas ADD COLUMN view_count INT NOT NULL DEFAULT 0 AFTER like_count',
    'add view_count'
  )
  await tryQuery(conn, 'ALTER TABLE ideas MODIFY COLUMN content MEDIUMTEXT NULL', 'modify content')
  await tryQuery(
    conn,
    "ALTER TABLE ideas MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'open'",
    'modify status'
  )
  await tryQuery(
    conn,
    'UPDATE ideas SET commission_price = COALESCE(NULLIF(reward_points, 0), commission_price)',
    'copy reward_points'
  )
  await tryQuery(
    conn,
    'UPDATE ideas SET delivered_project_id = project_id WHERE project_id IS NOT NULL AND delivered_project_id IS NULL',
    'copy project_id'
  )
  await tryQuery(
    conn,
    "UPDATE ideas SET summary = LEFT(COALESCE(content, title), 120) WHERE summary IS NULL OR summary = ''",
    'backfill summary'
  )

  const [rows] = await conn.query('DESCRIBE ideas')
  console.log(rows.map((r) => r.Field).join(', '))
  console.log('[fix-ideas-schema] done')
  await conn.end()
}

run().catch((err) => {
  console.error('[fix-ideas-schema] failed:', err.message)
  process.exit(1)
})
