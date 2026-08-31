CREATE TABLE IF NOT EXISTS project_startup_interviews (
  id VARCHAR(64) NOT NULL COMMENT '访谈 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目 ID',
  conversation_id VARCHAR(128) NOT NULL COMMENT '独立会话 ID',
  status VARCHAR(32) NOT NULL COMMENT 'in_progress | paused | ended',
  round_index INT NOT NULL DEFAULT 1 COMMENT '第几次访谈',
  answerer_user_id VARCHAR(128) NOT NULL COMMENT '指定回答人',
  started_by VARCHAR(128) NOT NULL COMMENT '开始人（管理员）',
  started_at VARCHAR(32) NOT NULL COMMENT '开始时间',
  paused_at VARCHAR(32) NULL COMMENT '暂停时间',
  ended_at VARCHAR(32) NULL COMMENT '结束时间',
  pending_prompt LONGTEXT NULL COMMENT '当前未答完的提问',
  transcript LONGTEXT NULL COMMENT '访谈纪要 Markdown',
  PRIMARY KEY (id),
  UNIQUE KEY uniq_interview_conv (conversation_id),
  INDEX idx_interview_project_status (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='创业项目用户访谈';
