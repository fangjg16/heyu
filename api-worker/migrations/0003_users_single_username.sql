-- 一人一登录名：username 列 + 去掉别名表（兼容已执行旧 0002 的库）
ALTER TABLE workspace_users
  ADD COLUMN username VARCHAR(128) NULL COMMENT '唯一登录名（归一化小写）' AFTER id;

UPDATE workspace_users
SET username = LOWER(REPLACE(id, '-', ''))
WHERE username IS NULL OR username = '';

ALTER TABLE workspace_users
  MODIFY COLUMN username VARCHAR(128) NOT NULL COMMENT '唯一登录名（归一化小写）';

ALTER TABLE workspace_users
  ADD UNIQUE KEY uk_workspace_users_username (username);

DROP TABLE IF EXISTS user_login_aliases;
