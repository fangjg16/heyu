-- 平台敏感操作日志（管理页「操作日志」只读展示；不含密钥/密码原文）
CREATE TABLE IF NOT EXISTS platform_operation_logs (
  id VARCHAR(64) NOT NULL COMMENT '日志 id',
  actor_user_id VARCHAR(64) NOT NULL COMMENT '操作人用户 id',
  category VARCHAR(32) NOT NULL COMMENT 'user|permission|join|llm|skill|file',
  action VARCHAR(64) NOT NULL COMMENT 'create|update|disable|enable|delete|reset_password 等',
  target_kind VARCHAR(32) NULL COMMENT 'user|project|skill|document|settings',
  target_id VARCHAR(128) NULL COMMENT '对象 id',
  target_label VARCHAR(512) NULL COMMENT '对象展示名（非密钥）',
  summary VARCHAR(1024) NOT NULL COMMENT '一句话说明',
  created_at VARCHAR(32) NOT NULL COMMENT '操作时间 ISO 8601',
  PRIMARY KEY (id),
  KEY idx_oplog_created (created_at),
  KEY idx_oplog_category (category, created_at),
  KEY idx_oplog_actor (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='平台敏感操作审计（只读，不含密钥明文）';
