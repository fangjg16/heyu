-- 项目内通知：资料操作、知识网络待审（收件人为项目 Admin / Core）
CREATE TABLE IF NOT EXISTS project_notices (
  id VARCHAR(64) NOT NULL COMMENT '通知 id',
  project_id VARCHAR(64) NOT NULL COMMENT '项目 id',
  recipient_user_id VARCHAR(64) NOT NULL COMMENT '收件人',
  actor_user_id VARCHAR(64) NOT NULL COMMENT '操作人',
  kind VARCHAR(32) NOT NULL COMMENT 'file_upload|file_move|file_delete|kn_draft',
  title VARCHAR(512) NOT NULL COMMENT '短标题',
  summary VARCHAR(1024) NOT NULL COMMENT '谁操作了什么',
  href VARCHAR(512) NULL COMMENT '跳转路径',
  created_at VARCHAR(32) NOT NULL COMMENT '时间 ISO 8601',
  PRIMARY KEY (id),
  KEY idx_notice_recipient (recipient_user_id, created_at),
  KEY idx_notice_project (project_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='项目 Admin/Core 通知（资料操作、知识网络待审）';
