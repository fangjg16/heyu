-- 项目域软删除：deleted_at 非空表示已软删；对象存储与业务行保留

-- projects.deleted_at
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'projects'
    AND COLUMN_NAME = 'deleted_at'
);
SET @sql_add := IF(
  @col_exists = 0,
  'ALTER TABLE projects ADD COLUMN deleted_at VARCHAR(32) NULL COMMENT ''软删除时间（ISO 8601；非空=已删）'' AFTER updated_at',
  'SELECT 1'
);
PREPARE stmt_add FROM @sql_add;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'projects'
    AND INDEX_NAME = 'idx_projects_deleted'
);
SET @sql_idx := IF(
  @idx_exists = 0,
  'ALTER TABLE projects ADD INDEX idx_projects_deleted (deleted_at)',
  'SELECT 1'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

-- documents.deleted_at
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'documents'
    AND COLUMN_NAME = 'deleted_at'
);
SET @sql_add := IF(
  @col_exists = 0,
  'ALTER TABLE documents ADD COLUMN deleted_at VARCHAR(32) NULL COMMENT ''软删除时间（ISO 8601；非空=已删）'' AFTER created_at',
  'SELECT 1'
);
PREPARE stmt_add FROM @sql_add;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'documents'
    AND INDEX_NAME = 'idx_documents_project_deleted'
);
SET @sql_idx := IF(
  @idx_exists = 0,
  'ALTER TABLE documents ADD INDEX idx_documents_project_deleted (project_id, deleted_at)',
  'SELECT 1'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

-- user_conversations.deleted_at
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_conversations'
    AND COLUMN_NAME = 'deleted_at'
);
SET @sql_add := IF(
  @col_exists = 0,
  'ALTER TABLE user_conversations ADD COLUMN deleted_at VARCHAR(32) NULL COMMENT ''软删除时间（ISO 8601；非空=已删）'' AFTER memory_summary',
  'SELECT 1'
);
PREPARE stmt_add FROM @sql_add;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;

-- user_chat_messages.deleted_at
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_chat_messages'
    AND COLUMN_NAME = 'deleted_at'
);
SET @sql_add := IF(
  @col_exists = 0,
  'ALTER TABLE user_chat_messages ADD COLUMN deleted_at VARCHAR(32) NULL COMMENT ''软删除时间（ISO 8601；非空=已删）'' AFTER updated_at',
  'SELECT 1'
);
PREPARE stmt_add FROM @sql_add;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;

-- project_member_roles.deleted_at
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'project_member_roles'
    AND COLUMN_NAME = 'deleted_at'
);
SET @sql_add := IF(
  @col_exists = 0,
  'ALTER TABLE project_member_roles ADD COLUMN deleted_at VARCHAR(32) NULL COMMENT ''软删除时间（ISO 8601；非空=已移除）'' AFTER updated_by',
  'SELECT 1'
);
PREPARE stmt_add FROM @sql_add;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;
