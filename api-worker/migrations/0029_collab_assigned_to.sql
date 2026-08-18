-- 协作事项指定发送给哪个项目协作方账号

ALTER TABLE project_collab_items
  ADD COLUMN assigned_to VARCHAR(128) NULL COMMENT '接收方协作账号 user id；空=项目内全部协作方' AFTER published_by;

ALTER TABLE project_collab_items
  ADD INDEX idx_collab_items_assigned (project_id, assigned_to);
