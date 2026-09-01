-- 项目形态改为创建/编辑时选定；纠正已知尽调项目被模型写成 early
ALTER TABLE projects
  MODIFY COLUMN analysis_kind VARCHAR(16) NULL COMMENT 'early|mature|acquire；创建/编辑时选定';

UPDATE projects
SET analysis_kind = 'mature'
WHERE (deleted_at IS NULL OR deleted_at = '')
  AND (
    name LIKE '%Bakehouse%'
    OR name LIKE '%Narrative Forge%'
    OR name LIKE '%巨东%'
  )
  AND (analysis_kind IS NULL OR analysis_kind <> 'mature');

UPDATE projects
SET analysis_kind = 'early'
WHERE (deleted_at IS NULL OR deleted_at = '')
  AND name LIKE '%多肽%'
  AND (analysis_kind IS NULL OR analysis_kind <> 'early');
