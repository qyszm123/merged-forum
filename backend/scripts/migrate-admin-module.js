/**
 * 管理员模块迁移：邀请码表 + admin 账号升级为 super_admin
 * node scripts/migrate-admin-module.js
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

  // 1) 邀请码表
  await conn.query(`
    CREATE TABLE IF NOT EXISTS invite_codes (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      code         VARCHAR(32) NOT NULL UNIQUE,
      created_by   BIGINT UNSIGNED NOT NULL,
      used_by      BIGINT UNSIGNED NULL,
      status       ENUM('active','used','disabled') NOT NULL DEFAULT 'active',
      note         VARCHAR(200) NULL,
      expires_at   DATETIME NULL,
      used_at      DATETIME NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_inv_status (status, created_at),
      KEY idx_inv_creator (created_by),
      CONSTRAINT fk_inv_creator FOREIGN KEY (created_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  console.log('[migrate-admin] invite_codes ready')

  // 2) 放宽 role 列：若为 ENUM 则改为 VARCHAR(32)，以支持 super_admin 等任意角色值
  const [colRows] = await conn.query(`SHOW COLUMNS FROM users WHERE Field = 'role'`)
  if (colRows.length && /enum/i.test(colRows[0].Type)) {
    await conn.query(`ALTER TABLE users MODIFY COLUMN role VARCHAR(32) NOT NULL DEFAULT 'student'`)
    console.log('[migrate-admin] role ENUM -> VARCHAR(32) OK')
  } else {
    console.log('[migrate-admin] role already VARCHAR')
  }

  // 3) admin 账号升级为 super_admin（兼容：若已是 super_admin 则跳过）
  const [rows] = await conn.query(`SELECT id, role FROM users WHERE student_no = 'admin' LIMIT 1`)
  if (rows.length) {
    if (rows[0].role !== 'super_admin') {
      await conn.query(`UPDATE users SET role = 'super_admin', rank_label = '超级管理员' WHERE id = ?`, [rows[0].id])
      console.log('[migrate-admin] admin -> super_admin OK')
    } else {
      console.log('[migrate-admin] admin already super_admin')
    }
  } else {
    console.log('[migrate-admin] WARN: admin account not found')
  }

  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-admin] failed:', err.message)
  process.exit(1)
})
