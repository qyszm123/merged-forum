/**
 * 增量迁移：论坛评论字段 + 板块对齐原型 + 教师/管理员账号
 */
require('dotenv').config()
const bcrypt = require('bcryptjs')
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function tryAlter(conn, sql) {
  try {
    await conn.query(sql)
    console.log('[ok]', sql.slice(0, 80) + '…')
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME') {
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
    database: config.db.database,
    multipleStatements: true
  })

  await tryAlter(
    conn,
    'ALTER TABLE forum_comments ADD COLUMN like_count INT NOT NULL DEFAULT 0 AFTER content'
  )
  await tryAlter(
    conn,
    'ALTER TABLE forum_posts ADD COLUMN project_id BIGINT UNSIGNED NULL AFTER author_id'
  )
  await tryAlter(
    conn,
    'ALTER TABLE forum_posts ADD COLUMN idea_id BIGINT UNSIGNED NULL AFTER project_id'
  )
  await tryAlter(
    conn,
    'ALTER TABLE forum_posts ADD INDEX idx_forum_posts_idea (idea_id)'
  )
  await tryAlter(
    conn,
    "ALTER TABLE forum_comments ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'published' AFTER like_count"
  )
  await tryAlter(
    conn,
    "ALTER TABLE users MODIFY COLUMN role ENUM('student','idea_king','project_owner','teacher','admin') NOT NULL DEFAULT 'student'"
  )

  const hash = await bcrypt.hash('123456', 10)
  const staff = [
    {
      no: 'teacher',
      name: '王老师',
      role: 'teacher',
      points: 5000,
      rank: '信息老师',
      grade: '教师',
      className: '信息组'
    },
    {
      no: 'admin',
      name: '系统管理员',
      role: 'admin',
      points: 9999,
      rank: '长老',
      grade: '管理',
      className: '后台'
    }
  ]
  for (const u of staff) {
    await conn.execute(
      `INSERT INTO users (student_no, password_hash, display_name, avatar_char, role, rank_label, points, grade, class_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         display_name = VALUES(display_name),
         role = VALUES(role),
         rank_label = VALUES(rank_label),
         points = VALUES(points),
         grade = VALUES(grade),
         class_name = VALUES(class_name)`,
      [u.no, hash, u.name, u.name.slice(0, 1), u.role, u.rank, u.points, u.grade, u.className]
    )
  }
  console.log('[ok] teacher / admin users upserted')

  const boards = [
    ['qa', '技术问答', '技术问题互助', 1],
    ['project', '项目讨论', '围绕项目协作讨论', 2],
    ['help', '求助答疑', '学习与作业求助', 3],
    ['share', '分享秀', '晒作品、求反馈', 4],
    ['rant', '槽点吐槽', '吐槽可变成点子', 5],
    ['campus', '校园闲聊', '校园科创日常', 6]
  ]
  for (const [slug, title, description, sortOrder] of boards) {
    await conn.execute(
      `INSERT INTO forum_boards (slug, title, description, sort_order)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), sort_order = VALUES(sort_order)`,
      [slug, title, description, sortOrder]
    )
  }
  console.log('[ok] boards synced')
  await conn.end()
  console.log('[migrate] done')
}

run().catch((err) => {
  console.error('[migrate] failed:', err.message)
  process.exit(1)
})
