-- Hermes skills：MySQL 权威源（整目录文件树），同步到文件卷供 Gateway 读取
-- 注意：intent 字段由 0006 追加（或见 schema.mysql.sql）
CREATE TABLE IF NOT EXISTS hermes_skills (
  name VARCHAR(128) NOT NULL COMMENT 'skill 目录名',
  title VARCHAR(256) NOT NULL DEFAULT '' COMMENT '展示标题（来自 SKILL.md）',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  synced_at VARCHAR(32) NULL COMMENT '最近成功同步到卷的时间',
  sync_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending|ok|error',
  sync_error TEXT NULL COMMENT '最近同步失败原因',
  PRIMARY KEY (name),
  INDEX idx_hermes_skills_sync (sync_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Hermes skill 元数据（权威）';

CREATE TABLE IF NOT EXISTS hermes_skill_files (
  skill_name VARCHAR(128) NOT NULL COMMENT '所属 skill 名',
  rel_path VARCHAR(512) NOT NULL COMMENT '相对路径（/ 分隔）',
  content_b64 LONGTEXT NOT NULL COMMENT '文件内容 base64（兼容 JSON Bridge）',
  is_text TINYINT NOT NULL DEFAULT 1 COMMENT '1=文本 utf8；0=二进制',
  byte_size INT NOT NULL DEFAULT 0 COMMENT '原始字节数',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  PRIMARY KEY (skill_name, rel_path),
  INDEX idx_hermes_skill_files_skill (skill_name),
  CONSTRAINT fk_hermes_skill_files_skill
    FOREIGN KEY (skill_name) REFERENCES hermes_skills (name)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Hermes skill 文件树';
