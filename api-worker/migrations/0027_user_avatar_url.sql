-- 用户头像：存储压缩后的 data URL（JPEG）
-- 组织字段语义改为「隶属组织」（合域 / 外部公司名）
ALTER TABLE workspace_users
  ADD COLUMN avatar_url MEDIUMTEXT NULL COMMENT '头像 data URL，空则用展示名首字母' AFTER avatar_class;

ALTER TABLE workspace_users
  MODIFY COLUMN org_title VARCHAR(512) NOT NULL DEFAULT '' COMMENT '隶属组织';
