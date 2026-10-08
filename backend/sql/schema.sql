-- 科创广场 · 初始库表
CREATE DATABASE IF NOT EXISTS kcsquare
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE kcsquare;

-- 用户
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_no    VARCHAR(32)  NOT NULL COMMENT '学号/账号',
  password_hash VARCHAR(100) NOT NULL,
  display_name  VARCHAR(64)  NOT NULL,
  avatar_char   CHAR(1)      NOT NULL DEFAULT '',
  avatar_url    VARCHAR(512) NULL,
  role          ENUM('student','idea_king','project_owner','teacher','admin') NOT NULL DEFAULT 'student',
  rank_label    VARCHAR(32)  NOT NULL DEFAULT '外门弟子',
  points        INT NOT NULL DEFAULT 0 COMMENT '积分余额',
  class_name    VARCHAR(64)  NULL,
  grade         VARCHAR(32)  NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_student_no (student_no),
  KEY idx_role (role)
) ENGINE=InnoDB;

-- 用户身份标签（可多标签）
CREATE TABLE IF NOT EXISTS user_identities (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  identity   VARCHAR(64) NOT NULL,
  source     VARCHAR(32) NOT NULL DEFAULT 'dungeon' COMMENT 'dungeon|exam|hackathon|admin',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_identity (user_id, identity),
  CONSTRAINT fk_ui_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 用户标志（如个人解锁）
CREATE TABLE IF NOT EXISTS user_flags (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  flag_key   VARCHAR(64) NOT NULL,
  flag_value VARCHAR(255) NOT NULL DEFAULT '1',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_flag (user_id, flag_key),
  CONSTRAINT fk_uf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 学校/全局设置
CREATE TABLE IF NOT EXISTS school_settings (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  setting_key   VARCHAR(64) NOT NULL,
  setting_value JSON NOT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_setting_key (setting_key)
) ENGINE=InnoDB;

-- 论坛板块
CREATE TABLE IF NOT EXISTS forum_boards (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(32)  NOT NULL,
  title       VARCHAR(64)  NOT NULL,
  description VARCHAR(255) NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_slug (slug)
) ENGINE=InnoDB;

-- 帖子
CREATE TABLE IF NOT EXISTS forum_posts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  board_id      INT UNSIGNED NOT NULL,
  author_id     BIGINT UNSIGNED NOT NULL,
  project_id    BIGINT UNSIGNED NULL COMMENT '可选关联项目',
  title         VARCHAR(120) NOT NULL,
  content       MEDIUMTEXT NOT NULL,
  tags_json     JSON NULL,
  like_count    INT UNSIGNED NOT NULL DEFAULT 0,
  comment_count INT UNSIGNED NOT NULL DEFAULT 0,
  view_count    INT UNSIGNED NOT NULL DEFAULT 0,
  is_pinned     TINYINT(1) NOT NULL DEFAULT 0,
  is_hot        TINYINT(1) NOT NULL DEFAULT 0,
  status        ENUM('published','hidden','deleted') NOT NULL DEFAULT 'published',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_board_time (board_id, created_at),
  KEY idx_author (author_id),
  KEY idx_hot (is_hot, like_count),
  KEY idx_project (project_id),
  FULLTEXT KEY ft_title_content (title, content),
  CONSTRAINT fk_post_board FOREIGN KEY (board_id) REFERENCES forum_boards(id),
  CONSTRAINT fk_post_author FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 评论（支持楼中楼）
CREATE TABLE IF NOT EXISTS forum_comments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  post_id     BIGINT UNSIGNED NOT NULL,
  author_id   BIGINT UNSIGNED NOT NULL,
  parent_id   BIGINT UNSIGNED NULL,
  content     TEXT NOT NULL,
  like_count  INT UNSIGNED NOT NULL DEFAULT 0,
  status      ENUM('published','hidden','deleted') NOT NULL DEFAULT 'published',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_post_time (post_id, created_at),
  KEY idx_parent (parent_id),
  CONSTRAINT fk_cmt_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_cmt_author FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 点赞（帖子/评论共用，防重复）
CREATE TABLE IF NOT EXISTS forum_likes (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  target_type ENUM('post','comment') NOT NULL,
  target_id  BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_like (user_id, target_type, target_id),
  KEY idx_target (target_type, target_id),
  CONSTRAINT fk_like_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 项目（广场）
CREATE TABLE IF NOT EXISTS projects (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_id        BIGINT UNSIGNED NOT NULL,
  idea_id         BIGINT UNSIGNED NULL COMMENT '由点子委托生成时关联',
  title           VARCHAR(120) NOT NULL,
  summary         VARCHAR(500) NOT NULL DEFAULT '',
  content         MEDIUMTEXT NULL,
  cover_url       VARCHAR(512) NULL,
  status          ENUM('recruiting','ongoing','done','archived') NOT NULL DEFAULT 'recruiting',
  need_roles_json JSON NULL,
  backlink_count  INT UNSIGNED NOT NULL DEFAULT 0,
  points_earned   INT NOT NULL DEFAULT 0 COMMENT '回链累计积分（展示用）',
  like_count      INT UNSIGNED NOT NULL DEFAULT 0,
  view_count      INT UNSIGNED NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_status_time (status, created_at),
  KEY idx_idea (idea_id),
  CONSTRAINT fk_proj_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 项目成员
CREATE TABLE IF NOT EXISTS project_members (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  role       VARCHAR(32) NOT NULL DEFAULT 'member',
  joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_project_user (project_id, user_id),
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 项目时间线
CREATE TABLE IF NOT EXISTS project_timeline (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  author_id  BIGINT UNSIGNED NOT NULL,
  content    VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pt_project (project_id, created_at),
  CONSTRAINT fk_pt_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_author FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 项目反馈/意见
CREATE TABLE IF NOT EXISTS project_feedback (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id BIGINT UNSIGNED NOT NULL,
  author_id  BIGINT UNSIGNED NOT NULL,
  content    TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pf_project (project_id, created_at),
  CONSTRAINT fk_pf_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pf_author FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 回链事件（作品内入口点回）
CREATE TABLE IF NOT EXISTS backlink_events (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id     BIGINT UNSIGNED NOT NULL,
  entry          ENUM('plaza','feedback','discuss') NOT NULL DEFAULT 'plaza',
  visitor_id     BIGINT UNSIGNED NULL,
  points_each    INT NOT NULL DEFAULT 0 COMMENT '每位成员获得的积分',
  member_count   INT UNSIGNED NOT NULL DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_be_project (project_id, created_at),
  CONSTRAINT fk_be_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_be_visitor FOREIGN KEY (visitor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 点子
CREATE TABLE IF NOT EXISTS ideas (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  author_id     BIGINT UNSIGNED NOT NULL,
  title         VARCHAR(120) NOT NULL,
  content       TEXT NOT NULL,
  status        ENUM('open','delegated','done','archived') NOT NULL DEFAULT 'open',
  reward_points INT NOT NULL DEFAULT 0,
  project_id    BIGINT UNSIGNED NULL COMMENT '委托后生成的项目',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_status_time (status, created_at),
  CONSTRAINT fk_idea_author FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 积分流水
CREATE TABLE IF NOT EXISTS points_ledger (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  delta       INT NOT NULL,
  balance     INT NOT NULL,
  reason      VARCHAR(64) NOT NULL,
  ref_type    VARCHAR(32) NULL,
  ref_id      BIGINT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_time (user_id, created_at),
  CONSTRAINT fk_pl_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- 修炼进度（副本）
CREATE TABLE IF NOT EXISTS train_progress (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT UNSIGNED NOT NULL,
  path_id      VARCHAR(32) NOT NULL COMMENT 'hardware|network|business|print',
  tier_id      VARCHAR(32) NOT NULL COMMENT 'beginner|intermediate|advanced',
  node_id      VARCHAR(64) NOT NULL,
  status       ENUM('locked','available','done') NOT NULL DEFAULT 'locked',
  score        INT NULL,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_progress (user_id, path_id, tier_id, node_id),
  CONSTRAINT fk_tp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 活动报名（黑客松 / 特殊考核）
CREATE TABLE IF NOT EXISTS event_applications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  event_type  ENUM('hackathon','special') NOT NULL,
  note        TEXT NULL,
  payload_json JSON NULL,
  status      ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ea_user (user_id, event_type),
  KEY idx_ea_type (event_type, created_at),
  CONSTRAINT fk_ea_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 平台/学校设置（开课强制、解锁打印副本等）
CREATE TABLE IF NOT EXISTS school_settings (
  setting_key   VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
