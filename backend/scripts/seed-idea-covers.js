/**
 * 给尚未设置封面的点子写入轮换真实封面图
 */
require('dotenv').config()
const { query } = require('../src/db/pool')

const POOL = [
  'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=800&h=450&q=80'
]

;(async () => {
  const rows = await query(`SELECT id, cover_url FROM ideas WHERE status != 'archived'`)
  let updated = 0
  for (const row of rows) {
    if (row.cover_url) continue
    const coverUrl = POOL[Math.abs(Number(row.id)) % POOL.length]
    await query(`UPDATE ideas SET cover_url = :coverUrl WHERE id = :id`, {
      id: row.id,
      coverUrl
    })
    updated += 1
  }
  console.log(`seeded idea covers: ${updated}/${rows.length}`)
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
