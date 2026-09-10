-- CapitalLens / mature 投资流水线（与顶层 phase 并存）
ALTER TABLE projects
  ADD COLUMN pipeline_stage VARCHAR(32) NULL
    COMMENT 'mature: inbound|deal-screening|due-diligence|ic-review|invested|passed'
    AFTER analysis_kind;

-- 已开始生成（有正式知识网络或章节 HTML）→ 筛选。尽调只能人工点「推进到尽调」。
-- 草案 run 不算已发布，也不跳到尽调；首次生成仍由接口把 inbound 推到 screening。
UPDATE projects p
SET pipeline_stage = 'deal-screening'
WHERE p.analysis_kind = 'mature'
  AND (p.deleted_at IS NULL OR p.deleted_at = '')
  AND (p.pipeline_stage IS NULL OR p.pipeline_stage = '')
  AND (
    EXISTS (
      SELECT 1 FROM project_knowledge_chapter_bundle b
      WHERE b.project_id = p.id
        AND b.version >= 1
      LIMIT 1
    )
    OR EXISTS (
      SELECT 1 FROM project_knowledge_chapter_versions v
      WHERE v.project_id = p.id
      LIMIT 1
    )
    OR EXISTS (
      SELECT 1 FROM project_knowledge_chapter_html c
      WHERE c.project_id = p.id
      LIMIT 1
    )
  );

UPDATE projects
SET pipeline_stage = 'inbound'
WHERE analysis_kind = 'mature'
  AND (deleted_at IS NULL OR deleted_at = '')
  AND (pipeline_stage IS NULL OR pipeline_stage = '');
