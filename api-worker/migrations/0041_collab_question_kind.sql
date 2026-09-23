-- 协作事项问题类型（业务 / 技术 / 财务 / 法务 / 其他）；空则前端按主题推断

ALTER TABLE project_collab_items
  ADD COLUMN question_kind VARCHAR(16) NULL COMMENT 'business | tech | finance | legal | other' AFTER priority;
