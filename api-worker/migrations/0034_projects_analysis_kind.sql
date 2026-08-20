-- 知识网络生成用的项目形态（由模型根据资料判断，不出现在入库表单）
ALTER TABLE projects
  ADD COLUMN analysis_kind VARCHAR(16) NULL COMMENT 'early|mature|acquire；生成时写入' AFTER category;
