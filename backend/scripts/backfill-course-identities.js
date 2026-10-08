/**
 * 补发：已通关教师副本但未写入身份的学生
 * node scripts/backfill-course-identities.js
 */
const mysql = require('mysql2/promise')

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'kcsquare',
    password: 'KcSq3181_Deploy!',
    database: 'kcsquare'
  })
  const [courses] = await conn.query(
    `SELECT path_id, title, reward_identity, chapters_json, create_mode
     FROM train_courses
     WHERE reward_identity IS NOT NULL AND reward_identity <> ''`
  )
  let granted = 0
  for (const c of courses) {
    let chapters = []
    try {
      chapters = JSON.parse(c.chapters_json || '[]')
    } catch {
      chapters = []
    }
    const nodes = []
    for (const ch of chapters || []) {
      for (const n of ch.nodes || []) {
        if ((n.type || 'quiz') !== 'reward') nodes.push(n.id)
      }
    }
    if (!nodes.length) continue
    const [users] = await conn.query(
      `SELECT user_id, COUNT(DISTINCT node_id) AS done
       FROM train_progress
       WHERE path_id = ? AND status = 'done' AND node_id IN (${nodes.map(() => '?').join(',')})
       GROUP BY user_id
       HAVING done >= ?`,
      [c.path_id, ...nodes, nodes.length]
    )
    for (const u of users) {
      const [r] = await conn.query(
        `INSERT IGNORE INTO user_identities (user_id, identity, source)
         VALUES (?, ?, 'dungeon')`,
        [u.user_id, c.reward_identity]
      )
      if (r.affectedRows) {
        granted += 1
        console.log(`+ ${c.path_id} → user ${u.user_id} 「${c.reward_identity}」`)
      }
    }
  }
  console.log(`done, newly granted=${granted}`)
  await conn.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
