-- 章节版本：0=未发布；正式版按 major*100+minor 编码（100=1.0，101=1.1）
-- 将历史整数主版本 1/2/3 迁移为 100/200/300

UPDATE project_knowledge_chapter_bundle
SET version = version * 100
WHERE version > 0 AND version < 100;

UPDATE project_knowledge_chapter_versions
SET version = version * 100
WHERE version > 0 AND version < 100;

UPDATE project_knowledge_chapter_draft_runs
SET base_version = CASE
  WHEN base_version > 0 AND base_version < 100 THEN base_version * 100
  ELSE base_version
END;

ALTER TABLE project_knowledge_chapter_bundle
  MODIFY COLUMN version INT NOT NULL DEFAULT 0
  COMMENT '当前正式版号：0=未发布；major*100+minor（100=1.0）';

ALTER TABLE project_knowledge_chapter_draft_runs
  MODIFY COLUMN base_version INT NOT NULL DEFAULT 0
  COMMENT '生成时所基于的正式版号（0=当时尚未发布）';
