/**
 * 将现有项目平均分配给全部演示角色账号，确保每人都有「我的项目」
 * 用法：node scripts/redistribute-projects.js
 *       node scripts/redistribute-projects.js --dry-run
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

const DEMO_ACCOUNTS = ['2026001', '2026002', '2026003', 'teacher', 'admin']
const DRY_RUN = process.argv.includes('--dry-run')

function parseMeta(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function main() {
  const pool = await mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    namedPlaceholders: true,
    charset: 'utf8mb4'
  })

  const [users] = await pool.query(
    `SELECT id, student_no, display_name, role
     FROM users
     WHERE student_no IN (${DEMO_ACCOUNTS.map(() => '?').join(',')})
     ORDER BY FIELD(student_no, ${DEMO_ACCOUNTS.map(() => '?').join(',')})`,
    [...DEMO_ACCOUNTS, ...DEMO_ACCOUNTS]
  )

  if (!users.length) {
    throw new Error('未找到演示账号，请先运行 npm run db:init')
  }

  const found = new Set(users.map((u) => u.student_no))
  const missing = DEMO_ACCOUNTS.filter((no) => !found.has(no))
  if (missing.length) {
    console.warn('[redistribute] 缺少账号:', missing.join(', '))
  }

  const [projects] = await pool.query(
    `SELECT id, owner_id, title, content
     FROM projects
     WHERE status != 'archived'
     ORDER BY id ASC`
  )

  if (!projects.length) {
    console.log('[redistribute] 无可用项目，跳过')
    await pool.end()
    return
  }

  const n = users.length
  const plan = projects.map((p, i) => ({
    projectId: p.id,
    title: p.title,
    fromOwnerId: p.owner_id,
    toUser: users[i % n]
  }))

  console.log(`[redistribute] 项目 ${projects.length} 个 · 账号 ${users.length} 个`)
  if (DRY_RUN) {
    const preview = {}
    for (const u of users) preview[u.student_no] = 0
    for (const row of plan) preview[row.toUser.student_no] += 1
    console.log('[redistribute] dry-run 分配预览:', preview)
    await pool.end()
    return
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    for (const row of plan) {
      const user = row.toUser
      const [projRows] = await conn.execute(
        `SELECT content FROM projects WHERE id = :id LIMIT 1`,
        { id: row.projectId }
      )
      const meta = parseMeta(projRows[0]?.content)
      if (Array.isArray(meta.team) && meta.team.length) {
        const first = meta.team[0]
        if (first && !first.empty) {
          meta.team[0] = {
            ...first,
            name: user.display_name,
            meta: first.meta && /创建者/.test(first.meta) ? '创建者 · 项目方' : first.meta || '创建者 · 项目方'
          }
        }
      }

      await conn.execute(
        `UPDATE projects SET owner_id = :ownerId, content = :content WHERE id = :id`,
        {
          id: row.projectId,
          ownerId: user.id,
          content: JSON.stringify(meta)
        }
      )

      await conn.execute(
        `DELETE FROM project_members WHERE project_id = :pid AND role = 'owner'`,
        { pid: row.projectId }
      )
      await conn.execute(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES (:pid, :uid, 'owner')
         ON DUPLICATE KEY UPDATE role = 'owner'`,
        { pid: row.projectId, uid: user.id }
      )
    }

    await conn.commit()

    const [counts] = await pool.query(
      `SELECT u.student_no, u.display_name, COUNT(p.id) AS project_count
       FROM users u
       LEFT JOIN projects p ON p.owner_id = u.id AND p.status != 'archived'
       WHERE u.student_no IN (${DEMO_ACCOUNTS.map(() => '?').join(',')})
       GROUP BY u.id, u.student_no, u.display_name
       ORDER BY FIELD(u.student_no, ${DEMO_ACCOUNTS.map(() => '?').join(',')})`,
      [...DEMO_ACCOUNTS, ...DEMO_ACCOUNTS]
    )

    console.log('[redistribute] 完成，各账号项目数：')
    for (const row of counts) {
      console.log(`  ${row.student_no} ${row.display_name}: ${row.project_count}`)
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[redistribute] failed:', err.message)
  process.exit(1)
})
