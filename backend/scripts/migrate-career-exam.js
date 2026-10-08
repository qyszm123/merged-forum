/**
 * 职业结业考试迁移
 * node scripts/migrate-career-exam.js
 */
require('dotenv').config()
const mysql = require('mysql2/promise')
const config = require('../src/config')

async function run() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true
  })

  await conn.query(`
    CREATE TABLE IF NOT EXISTS career_questions (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      career_id   BIGINT UNSIGNED NOT NULL,
      question    VARCHAR(500) NOT NULL,
      options     JSON NOT NULL,
      answer      ENUM('A','B','C','D') NOT NULL,
      explanation VARCHAR(500) NOT NULL DEFAULT '',
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_cq_career (career_id),
      CONSTRAINT fk_cq_career FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS career_exam_attempts (
      id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id    BIGINT UNSIGNED NOT NULL,
      career_id  BIGINT UNSIGNED NOT NULL,
      score      INT NOT NULL DEFAULT 0,
      passed     TINYINT(1) NOT NULL DEFAULT 0,
      answers    JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_cea_user (user_id, career_id),
      CONSTRAINT fk_cea_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_cea_career FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)
  console.log('[migrate-career-exam] career_questions / career_exam_attempts ready')

  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-career-exam] failed:', err.message)
  process.exit(1)
})
