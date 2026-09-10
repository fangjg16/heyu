-- 0039 曾把「有章节 HTML / 尽调文件名」的投资项目直接标成尽调。
-- 尽调须人工点「推进到尽调」；草案更不能算已过筛选。
-- 上线后尚未人工推进的尽调，一律退回筛选。
UPDATE projects
SET pipeline_stage = 'deal-screening'
WHERE analysis_kind = 'mature'
  AND pipeline_stage = 'due-diligence'
  AND phase IN ('进行中', '已暂停', '已归档')
  AND (deleted_at IS NULL OR deleted_at = '');
