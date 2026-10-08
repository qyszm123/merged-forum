/**
 * 将计算机 / 物联网教材题库写入 pbl_task_defs，形成服务端副本闭环。
 * 用法（在 backend 目录）：
 *   node scripts/migrate-train.js
 *   node scripts/seed-pbl-banks.js
 *   node scripts/seed-pbl-banks.js --force   # 覆盖已有 def
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')
const { TRAIN_QUESTION_BANKS, bankForTask } = require('../src/data/trainQuestionBanks')
const { CHAPTERS } = require('../src/data/trainCatalog')
const { officialGuideLines } = require('../src/data/kpGuides')

const force = process.argv.includes('--force')

function buildDef(pathId, chapter) {
  const quizNodes = (chapter.nodes || []).filter((n) => n.type === 'quiz')
  const workNodes = (chapter.nodes || []).filter((n) => n.type === 'work')
  let bank = bankForTask(pathId, chapter.id)
  if (!bank.length && quizNodes.length) {
    bank = quizNodes.flatMap((n) => (TRAIN_QUESTION_BANKS.byKp[n.id] || []).map((q) => ({ ...q })))
  }
  return {
    pathId,
    taskId: chapter.id,
    title: chapter.name,
    kind: 'comprehensive',
    drillEnabled: quizNodes.length > 0,
    practiceEnabled: workNodes.length > 0 || quizNodes.length === 0,
    passScore: 80,
    guideEnabled: true,
    guideLines: officialGuideLines(chapter.name || pathId),
    bank,
    acceptTypes: ['design', 'flowchart', 'ppt', 'video'],
    defenseEnabled: workNodes.length > 0,
    defensePassScore: 80,
    countClear: true,
    source: 'textbook-bank-v1',
    updatedAt: Date.now()
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

  let upserted = 0
  let skipped = 0
  for (const pathId of ['network', 'hardware', 'business', 'print']) {
    const chapters = CHAPTERS[pathId] || []
    for (const ch of chapters) {
      const hasQuiz = (ch.nodes || []).some((n) => n.type === 'quiz')
      const hasWork = (ch.nodes || []).some((n) => n.type === 'work')
      const def = buildDef(pathId, ch)
      // 纯作品单元也入库（空题库 + 答辩开关），避免管理端缺任务
      if (!hasQuiz && !hasWork) {
        skipped += 1
        continue
      }
      if (hasQuiz && !def.bank.length) {
        console.warn('[seed-pbl-banks] empty bank', pathId, ch.id)
        skipped += 1
        continue
      }
      const [rows] = await conn.query(
        `SELECT id, def_json FROM pbl_task_defs WHERE path_id = ? AND task_id = ? LIMIT 1`,
        [pathId, ch.id]
      )
      if (rows.length && !force) {
        let existing = {}
        try {
          existing = JSON.parse(rows[0].def_json || '{}')
        } catch {
          existing = {}
        }
        const bank = existing.bank
        const stubby =
          !Array.isArray(bank) ||
          bank.length < 6 ||
          bank.filter((q) => String(q.id || '').startsWith('ai-')).length >= Math.ceil((bank.length || 1) * 0.6)
        if (!stubby && existing.source === 'textbook-bank-v1') {
          skipped += 1
          continue
        }
        if (!stubby && existing.source !== 'textbook-bank-v1' && Array.isArray(bank) && bank.length >= 10) {
          skipped += 1
          continue
        }
      }
      await conn.query(
        `INSERT INTO pbl_task_defs (path_id, task_id, title, def_json, updated_by)
         VALUES (?, ?, ?, ?, NULL)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           def_json = VALUES(def_json)`,
        [pathId, ch.id, def.title, JSON.stringify(def)]
      )
      upserted += 1
      console.log(`[seed-pbl-banks] ${pathId}/${ch.id} → ${def.bank.length} 题`)
    }
  }

  await conn.end()
  console.log(`[seed-pbl-banks] done upserted=${upserted} skipped=${skipped} force=${force}`)
}

run().catch((err) => {
  console.error('[seed-pbl-banks] failed:', err.message)
  process.exit(1)
})
