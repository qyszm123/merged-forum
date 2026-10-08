/**
 * 职业学习模块迁移（仿照 qyszm）
 * careers(职业) + skills(技能,含知识md) + user_careers(用户职业) + user_career_skills(用户技能完成)
 * node scripts/migrate-careers.js
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
    CREATE TABLE IF NOT EXISTS careers (
      id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name            VARCHAR(64) NOT NULL,
      description     VARCHAR(500) NOT NULL DEFAULT '',
      icon            VARCHAR(16) NOT NULL DEFAULT '💼',
      color           VARCHAR(16) NOT NULL DEFAULT '#6366f1',
      required_points INT UNSIGNED NOT NULL DEFAULT 0,
      is_active       TINYINT(1) NOT NULL DEFAULT 1,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_career_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS career_skills (
      id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      career_id          BIGINT UNSIGNED NOT NULL,
      name               VARCHAR(64) NOT NULL,
      description        VARCHAR(500) NOT NULL DEFAULT '',
      icon               VARCHAR(16) NOT NULL DEFAULT '⭐',
      knowledge_content MEDIUMTEXT NULL,
      order_num          INT NOT NULL DEFAULT 0,
      created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_skill_career (career_id, order_num),
      CONSTRAINT fk_skill_career FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS user_careers (
      id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id       BIGINT UNSIGNED NOT NULL,
      career_id     BIGINT UNSIGNED NOT NULL,
      joined_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at  DATETIME NULL,
      UNIQUE KEY uk_user_career (user_id, career_id),
      KEY idx_uc_user (user_id),
      CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_uc_career FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE IF NOT EXISTS user_career_skills (
      id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id       BIGINT UNSIGNED NOT NULL,
      skill_id      BIGINT UNSIGNED NOT NULL,
      completed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_skill (user_id, skill_id),
      KEY idx_ucs_user (user_id),
      CONSTRAINT fk_ucs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_ucs_skill FOREIGN KEY (skill_id) REFERENCES career_skills(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)
  console.log('[migrate-careers] careers / career_skills / user_careers / user_career_skills ready')

  await conn.end()
}

run().catch((err) => {
  console.error('[migrate-careers] failed:', err.message)
  process.exit(1)
})
