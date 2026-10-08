-- 签到功能 · 增量表
USE kcsquare;

-- 签到记录（每日一行，uk 保证同一天只能签一次）
CREATE TABLE IF NOT EXISTS user_checkins (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  checkin_day DATE NOT NULL COMMENT '签到日期（本地时区）',
  reward      INT NOT NULL DEFAULT 0 COMMENT '本次奖励积分',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_day (user_id, checkin_day),
  KEY idx_user (user_id),
  CONSTRAINT fk_checkin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
