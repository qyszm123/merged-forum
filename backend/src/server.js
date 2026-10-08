require('dotenv').config()
const app = require('./app')
const config = require('./config')
const { pool } = require('./db/pool')

async function main() {
  try {
    const conn = await pool.getConnection()
    await conn.ping()
    conn.release()
    console.log(`[db] connected ${config.db.host}/${config.db.database}`)
  } catch (err) {
    console.warn(`[db] not ready: ${err.message}`)
    console.warn('[db] 可先运行 npm run db:init，或检查 .env 中 MySQL 配置')
  }

  app.listen(config.port, () => {
    console.log(`[kcsquare-backend] http://localhost:${config.port}`)
  })
}

main()
