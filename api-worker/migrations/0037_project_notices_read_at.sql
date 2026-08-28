-- 项目通知已读时间：动态用未读/已读，不走「已处理」
ALTER TABLE project_notices
  ADD COLUMN read_at VARCHAR(32) NULL COMMENT '已读时间 ISO 8601；空为未读';
