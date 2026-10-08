/**
 * 招募表增加 roles JSON 列（多职业多人数）
 * node scripts/migrate-recruit-roles.js
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

  try {
    await conn.query(`ALTER TABLE recruitments ADD COLUMN roles JSON NULL COMMENT '职业需求 [{role,count}]'`)
    console.log('[migrate-recruit-roles] + roles OK')
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log('[migrate-recruit-roles] roles already exists')
    else throw e
  }

  // 旧数据迁移：role_wanted 非空时转为单元素 roles 数组
  await conn.query(`
    UPDATE recruitments
    SET roles = CASE
      WHEN role_wanted IS NULL OR role_wanted = '' THEN NULL
      ELSE JSON_ARRAY(JSON_OBJECT('role', role_wanted, 'count', member_count))
    END
    WHERE roles IS NULL
  `)
  console.log('[migrate-recruit-roles] legacy data migrated')

  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-recruit-roles] failed:', err.message)
  process.exit(1)
})
