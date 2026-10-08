/**
 * 给用户写入轮换真人头像（人才广场）
 */
require('dotenv').config()
const { query } = require('../src/db/pool')

const POOL = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&h=200&q=80',
  'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=200&h=200&q=80'
]

;(async () => {
  const rows = await query(`SELECT id, avatar_url FROM users WHERE role != 'admin'`)
  let updated = 0
  for (const row of rows) {
    if (row.avatar_url) continue
    const avatarUrl = POOL[Math.abs(Number(row.id)) % POOL.length]
    await query(`UPDATE users SET avatar_url = :avatarUrl WHERE id = :id`, {
      id: row.id,
      avatarUrl
    })
    updated += 1
  }
  console.log(`seeded maker avatars: ${updated}/${rows.length}`)
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
