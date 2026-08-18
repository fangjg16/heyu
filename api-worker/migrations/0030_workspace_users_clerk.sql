-- Clerk 用户与工作区账号绑定
ALTER TABLE workspace_users
  ADD COLUMN clerk_user_id VARCHAR(128) NULL COMMENT 'Clerk user id' AFTER id;

CREATE UNIQUE INDEX uk_workspace_users_clerk ON workspace_users (clerk_user_id);
