-- CapitalLens / mature 投资流水线（与顶层 phase 并存）
ALTER TABLE projects
  ADD COLUMN pipeline_stage VARCHAR(32) NULL
    COMMENT 'mature: inbound|deal-screening|due-diligence|ic-review|invested|passed'
    AFTER analysis_kind;

-- 已有知识网络或尽调类资料的投资项目 → 尽调
UPDATE projects p
SET pipeline_stage = 'due-diligence'
WHERE p.analysis_kind = 'mature'
  AND (p.deleted_at IS NULL OR p.deleted_at = '')
  AND (p.pipeline_stage IS NULL OR p.pipeline_stage = '')
  AND (
    EXISTS (
      SELECT 1 FROM project_knowledge_chapter_html c
      WHERE c.project_id = p.id
      LIMIT 1
    )
    OR EXISTS (
      SELECT 1 FROM documents d
      WHERE d.project_id = p.id
        AND (
          d.relative_path LIKE '%diligence%'
          OR d.filename LIKE '%diligence%'
          OR d.relative_path LIKE '%尽调%'
          OR d.filename LIKE '%尽调%'
        )
    )
  );

UPDATE projects
SET pipeline_stage = 'inbound'
WHERE analysis_kind = 'mature'
  AND (deleted_at IS NULL OR deleted_at = '')
  AND (pipeline_stage IS NULL OR pipeline_stage = '');
