/**
 * 给尚未设置封面的项目写入轮换真实封面图
 */
require('dotenv').config()
const { query } = require('../src/db/pool')

const POOL = [
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1587620962725-abab7fe55159?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&h=450&q=80',
  'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=800&h=450&q=80'
]

;(async () => {
  const rows = await query(`SELECT id, cover_url FROM projects WHERE status != 'archived'`)
  let updated = 0
  for (const row of rows) {
    if (row.cover_url) continue
    const coverUrl = POOL[Math.abs(Number(row.id)) % POOL.length]
    await query(`UPDATE projects SET cover_url = :coverUrl WHERE id = :id`, {
      id: row.id,
      coverUrl
    })
    updated += 1
  }
  console.log(`seeded covers: ${updated}/${rows.length}`)
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
