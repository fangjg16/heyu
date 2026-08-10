-- 工作区用户鉴权：账号（一人一登录名）/ 会话 / 限定项目范围
CREATE TABLE IF NOT EXISTS workspace_users (
  id VARCHAR(128) PRIMARY KEY COMMENT '用户 ID',
  username VARCHAR(128) NOT NULL COMMENT '唯一登录名（归一化小写）',
  display_name VARCHAR(256) NOT NULL COMMENT '展示名',
  org_title VARCHAR(512) NOT NULL DEFAULT '' COMMENT '组织头衔',
  avatar_char VARCHAR(8) NOT NULL DEFAULT '?' COMMENT '头像字母',
  avatar_class VARCHAR(512) NOT NULL DEFAULT '' COMMENT '头像 CSS class',
  default_role VARCHAR(32) NOT NULL DEFAULT 'guest' COMMENT '默认项目角色：admin|core|mid|low|guest',
  is_platform_admin TINYINT NOT NULL DEFAULT 0 COMMENT '是否平台管理员',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  password_hash VARCHAR(128) NOT NULL COMMENT 'PBKDF2 密码哈希（hex）',
  password_salt VARCHAR(64) NOT NULL COMMENT '密码盐（hex）',
  password_iters INT NOT NULL DEFAULT 120000 COMMENT 'PBKDF2 迭代次数',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  UNIQUE KEY uk_workspace_users_username (username),
  INDEX idx_workspace_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作区用户账号';

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash VARCHAR(64) PRIMARY KEY COMMENT '原始 token 的 SHA-256 hex',
  user_id VARCHAR(128) NOT NULL COMMENT '用户 ID',
  expires_at VARCHAR(32) NOT NULL COMMENT '过期时间（ISO 8601）',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）',
  last_seen_at VARCHAR(32) NOT NULL COMMENT '最近访问时间（ISO 8601）',
  INDEX idx_auth_sessions_user (user_id),
  INDEX idx_auth_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录会话';

CREATE TABLE IF NOT EXISTS user_project_scopes (
  user_id VARCHAR(128) NOT NULL COMMENT '用户 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '可见项目 ID',
  can_list TINYINT NOT NULL DEFAULT 1 COMMENT '是否可在列表中看到该项目',
  can_preview_kn TINYINT NOT NULL DEFAULT 1 COMMENT '是否可预览知识网络',
  PRIMARY KEY (user_id, project_id),
  INDEX idx_user_project_scopes_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='限定访客项目可见范围';
