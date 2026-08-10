-- 每个 skill 至多一个意图：hermes_skills.intent；废弃 hermes_skill_intents
-- 若 schema 已含 intent（新装），ADD COLUMN 会跳过

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hermes_skills'
    AND COLUMN_NAME = 'intent'
);
SET @sql_add := IF(
  @col_exists = 0,
  'ALTER TABLE hermes_skills ADD COLUMN intent VARCHAR(64) NULL COMMENT ''绑定的对话意图（每个 skill 至多一个；全局唯一）'' AFTER title',
  'SELECT 1'
);
PREPARE stmt_add FROM @sql_add;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;

-- 从旧关联表迁入（表不存在则跳过）
SET @tbl_exists := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hermes_skill_intents'
);
SET @sql_mig := IF(
  @tbl_exists > 0,
  'UPDATE hermes_skills s INNER JOIN (SELECT skill_name, MIN(intent) AS intent FROM hermes_skill_intents GROUP BY skill_name) t ON t.skill_name = s.name SET s.intent = t.intent WHERE s.intent IS NULL',
  'SELECT 1'
);
PREPARE stmt_mig FROM @sql_mig;
EXECUTE stmt_mig;
DEALLOCATE PREPARE stmt_mig;

SET @uk_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'hermes_skills'
    AND INDEX_NAME = 'uk_hermes_skills_intent'
);
SET @sql_uk := IF(
  @uk_exists = 0,
  'ALTER TABLE hermes_skills ADD UNIQUE KEY uk_hermes_skills_intent (intent)',
  'SELECT 1'
);
PREPARE stmt_uk FROM @sql_uk;
EXECUTE stmt_uk;
DEALLOCATE PREPARE stmt_uk;

DROP TABLE IF EXISTS hermes_skill_intents;
