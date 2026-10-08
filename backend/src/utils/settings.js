const { query } = require('../db/pool')

async function getSetting(key, fallback) {
  try {
    const rows = await query(
      `SELECT setting_value FROM school_settings WHERE setting_key = :key LIMIT 1`,
      { key }
    )
    if (!rows.length) return fallback
    const v = rows[0].setting_value
    return typeof v === 'string' ? JSON.parse(v) : v
  } catch {
    return fallback
  }
}

async function setSetting(key, value) {
  await query(
    `INSERT INTO school_settings (setting_key, setting_value)
     VALUES (:key, CAST(:value AS JSON))
     ON DUPLICATE KEY UPDATE setting_value = CAST(:value AS JSON)`,
    { key, value: JSON.stringify(value) }
  )
}

/** 统一读取：打印解锁 / 开课强制 */
async function getRuntimeFlags() {
  const print = await getSetting('print_unlocked', { unlocked: false })
  const force = await getSetting('force_train', { enabled: false, grade: '初一' })
  return {
    printUnlocked: !!(print && (print.unlocked || print.enabled)),
    schoolForce: {
      enabled: !!(force && force.enabled),
      grade: (force && force.grade) || '初一',
      schoolName: (force && force.schoolName) || null
    }
  }
}

module.exports = { getSetting, setSetting, getRuntimeFlags }
