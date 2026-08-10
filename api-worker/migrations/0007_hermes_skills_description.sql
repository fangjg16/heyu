-- skill 作用描述（管理台可编辑；与 SKILL.md 正文分离）

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hermes_skills'
    AND COLUMN_NAME = 'description'
);
SET @sql_add := IF(
  @col_exists = 0,
  'ALTER TABLE hermes_skills ADD COLUMN description VARCHAR(512) NOT NULL DEFAULT '''' COMMENT ''skill 作用简述（管理展示）'' AFTER title',
  'SELECT 1'
);
PREPARE stmt_add FROM @sql_add;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;
