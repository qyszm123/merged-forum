/**
 * 检查点子委托 / 交付项目数据状态
 */
require('dotenv').config()
const { query } = require('../src/db/pool')

async function main() {
  const ideas = await query(
    `SELECT id, title, status, delivered_project_id, owner_id, commission_price
     FROM ideas ORDER BY id DESC LIMIT 20`
  )
  const offers = await query(
    `SELECT id, idea_id, status, points, owner_id, acceptor_id, project_id
     FROM idea_team_offers ORDER BY id DESC LIMIT 20`
  )
  const projects = await query(
    `SELECT id, title, owner_id, status FROM projects ORDER BY id DESC LIMIT 15`
  )
  console.log('=== IDEAS ===')
  console.log(JSON.stringify(ideas, null, 2))
  console.log('=== OFFERS ===')
  console.log(JSON.stringify(offers, null, 2))
  console.log('=== PROJECTS ===')
  console.log(JSON.stringify(projects, null, 2))
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
