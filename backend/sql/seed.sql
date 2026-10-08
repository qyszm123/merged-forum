USE kcsquare;

INSERT INTO forum_boards (slug, title, description, sort_order) VALUES
  ('general', '综合讨论', '校园科创日常讨论', 1),
  ('help', '求助答疑', '技术问题互助', 2),
  ('showcase', '作品展示', '晒作品、求反馈', 3),
  ('recruit', '组队招人', '找队友、找项目', 4)
ON DUPLICATE KEY UPDATE title = VALUES(title);
