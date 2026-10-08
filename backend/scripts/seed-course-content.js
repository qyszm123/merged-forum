/**
 * 为已有教师课补全：完整章节结构 + pbl_task_defs（与官方主线同闭环）
 * 用法（在 backend 目录）：
 *   node scripts/seed-course-content.js
 *   node scripts/seed-course-content.js --force   # 即使已有 PBL 也重写；骨架课强制升为 6 单元
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')
const { fullDefaultChapters, buildCoursePblDef } = require('../src/services/courseContentSeed')

const force = process.argv.includes('--force')
const OFFICIAL = new Set(['network', 'hardware', 'business', 'print'])

function isSkeletonChapters(chapters, pathId) {
  if (!Array.isArray(chapters) || chapters.length === 0) return true
  if (chapters.length === 1) {
    const nodes = chapters[0].nodes || []
    const ids = nodes.map((n) => n.id)
    // 旧版单单元：quiz1 / work1 / boss
    if (ids.includes(`${pathId}-quiz1`) || ids.includes(`${pathId}-work1`)) return true
    if (nodes.length <= 3) return true
  }
  return false
}

async function run() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database
  })

  const [courses] = await conn.query(
    `SELECT path_id, title, chapters_json, owner_user_id, visibility
     FROM train_courses
     WHERE visibility <> 'official'
     ORDER BY id ASC`
  )

  let upgraded = 0
  let seeded = 0
  let skipped = 0

  for (const row of courses) {
    const pathId = row.path_id
    if (OFFICIAL.has(pathId)) {
      skipped += 1
      continue
    }
    let chapters = []
    try {
      chapters = JSON.parse(row.chapters_json || '[]')
    } catch {
      chapters = []
    }

    const skeleton = isSkeletonChapters(chapters, pathId)
    if (skeleton || force) {
      chapters = fullDefaultChapters(pathId, row.title)
      await conn.query(`UPDATE train_courses SET chapters_json = ? WHERE path_id = ?`, [
        JSON.stringify(chapters),
        pathId
      ])
      upgraded += 1
      console.log(`[seed-course-content] upgraded chapters ${pathId}`)
    }

    for (const ch of chapters) {
      const def = buildCoursePblDef(pathId, ch, row.title)
      if (!def) continue
      if (def.drillEnabled && !def.bank.length) continue

      const [existing] = await conn.query(
        `SELECT id, def_json FROM pbl_task_defs WHERE path_id = ? AND task_id = ? LIMIT 1`,
        [pathId, ch.id]
      )
      if (existing.length && !force) {
        let prev = {}
        try {
          prev = JSON.parse(existing[0].def_json || '{}')
        } catch {
          prev = {}
        }
        const bank = prev.bank
        if (
          prev.source === 'course-default-v1' &&
          Array.isArray(bank) &&
          bank.length >= 6
        ) {
          continue
        }
        if (Array.isArray(bank) && bank.length >= 10 && prev.source !== 'course-default-v1') {
          // 教师已手配的完整题库，不覆盖
          continue
        }
      }

      await conn.query(
        `INSERT INTO pbl_task_defs (path_id, task_id, title, def_json, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           def_json = VALUES(def_json),
           updated_by = VALUES(updated_by)`,
        [pathId, ch.id, def.title, JSON.stringify(def), row.owner_user_id || null]
      )
      seeded += 1
      console.log(
        `[seed-course-content] pbl ${pathId}/${ch.id} → bank=${def.bank.length} work=${def.practiceEnabled}`
      )
    }
  }

  await conn.end()
  console.log(
    `[seed-course-content] done courses=${courses.length} upgraded=${upgraded} seeded=${seeded} skippedOfficial=${skipped} force=${force}`
  )
}

run().catch((err) => {
  console.error('[seed-course-content] failed:', err.message)
  process.exit(1)
})
