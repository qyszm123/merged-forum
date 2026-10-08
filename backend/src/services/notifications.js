const { query } = require('../db/pool')

/** 写入一条站内通知 */
async function createNotification(userId, type, content, refType = null, refId = null) {
  await query(
    `INSERT INTO notifications (user_id, type, content, ref_type, ref_id)
     VALUES (:uid, :type, :content, :refType, :refId)`,
    { uid: userId, type, content, refType, refId }
  )
}

module.exports = { createNotification }
