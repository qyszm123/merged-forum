/**
 * 初始化数据库：建表 + 写入测试账号与示例数据
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function run() {
  const root = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
    charset: 'utf8mb4'
  })

  const schema = fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8')
  console.log('[db:init] applying schema…')
  await root.query(schema)
  await root.end()

  const pool = await mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    namedPlaceholders: true,
    charset: 'utf8mb4'
  })

  const hash = await bcrypt.hash('123456', 10)
  const users = [
    { no: '2026001', name: '林同学', role: 'student', points: 1280, rank: '外门弟子', grade: '初一', className: '3班' },
    { no: '2026002', name: '点子王小陈', role: 'idea_king', points: 2560, rank: '点子王', grade: '初一', className: '1班' },
    { no: '2026003', name: '项目方阿宁', role: 'project_owner', points: 3200, rank: '项目方', grade: '初一', className: '2班' },
    { no: 'teacher', name: '王老师', role: 'teacher', points: 5000, rank: '信息老师', grade: '教师', className: '信息组' },
    { no: 'admin', name: '系统管理员', role: 'admin', points: 9999, rank: '长老', grade: '管理', className: '后台' }
  ]

  for (const u of users) {
    await pool.execute(
      `INSERT INTO users (student_no, password_hash, display_name, avatar_char, role, rank_label, points, grade, class_name)
       VALUES (:no, :hash, :name, :avatar, :role, :rank, :points, :grade, :className)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         display_name = VALUES(display_name),
         role = VALUES(role),
         rank_label = VALUES(rank_label),
         points = VALUES(points),
         grade = VALUES(grade),
         class_name = VALUES(class_name)`,
      {
        no: u.no,
        hash,
        name: u.name,
        avatar: u.name.slice(0, 1),
        role: u.role,
        rank: u.rank,
        points: u.points,
        grade: u.grade,
        className: u.className
      }
    )
  }

  const boards = [
    ['qa', '技术问答', '技术问题互助', 1],
    ['project', '项目讨论', '围绕项目协作讨论', 2],
    ['help', '求助答疑', '学习与作业求助', 3],
    ['share', '分享秀', '晒作品、求反馈', 4],
    ['rant', '槽点吐槽', '吐槽可变成点子', 5],
    ['campus', '校园闲聊', '校园科创日常', 6],
    ['general', '综合讨论', '综合讨论（兼容）', 7],
    ['showcase', '作品展示', '作品展示（兼容）', 8],
    ['recruit', '组队招人', '组队招人（兼容）', 9]
  ]
  for (const [slug, title, description, sortOrder] of boards) {
    await pool.execute(
      `INSERT INTO forum_boards (slug, title, description, sort_order)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
      [slug, title, description, sortOrder]
    )
  }

  const [linRows] = await pool.execute(`SELECT id FROM users WHERE student_no = '2026001' LIMIT 1`)
  const [boardRows] = await pool.execute(`SELECT id FROM forum_boards WHERE slug = 'general' LIMIT 1`)
  const [postRows] = await pool.execute(`SELECT id FROM forum_posts LIMIT 1`)
  if (linRows[0] && boardRows[0] && !postRows.length) {
    await pool.execute(
      `INSERT INTO forum_posts (board_id, author_id, title, content, tags_json, like_count, comment_count, is_hot)
       VALUES (?, ?, ?, ?, ?, 12, 3, 1)`,
      [
        boardRows[0].id,
        linRows[0].id,
        '欢迎来到科创广场论坛',
        '这里可以发帖讨论、组队招人、晒作品。数据走 MySQL，热榜可接 Redis。',
        JSON.stringify(['公告', '入门'])
      ]
    )
    await pool.execute(
      `INSERT INTO projects (owner_id, title, summary, content, status, like_count)
       VALUES (?, ?, ?, ?, 'recruiting', 8)`,
      [
        linRows[0].id,
        '校园失物招领小程序',
        '用小程序做班级失物招领，支持拍照与认领审核。',
        '详细需求：扫码进入班级空间，发布失物/招领，管理员审核后公开。'
      ]
    )
  }

  await pool.end()
  console.log('[db:init] done. 测试账号 2026001 / teacher / admin ，密码 123456')
}

run().catch((err) => {
  console.error('[db:init] failed:', err.message)
  process.exit(1)
})
