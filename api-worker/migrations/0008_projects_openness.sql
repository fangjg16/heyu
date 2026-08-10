-- 项目目录可见性：public=全开放；invite=内部邀请（仅成员/创建人/平台管理员可见）

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'projects'
    AND COLUMN_NAME = 'openness'
);
SET @sql_add := IF(
  @col_exists = 0,
  'ALTER TABLE projects ADD COLUMN openness VARCHAR(16) NOT NULL DEFAULT ''public'' COMMENT ''目录可见性：public|invite'' AFTER guest_summary',
  'SELECT 1'
);
PREPARE stmt_add FROM @sql_add;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'projects'
    AND INDEX_NAME = 'idx_projects_openness'
);
SET @sql_idx := IF(
  @idx_exists = 0,
  'ALTER TABLE projects ADD INDEX idx_projects_openness (openness)',
  'SELECT 1'
);
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;
