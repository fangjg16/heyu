-- 章节改写指令日志（管理员复盘用）
CREATE TABLE IF NOT EXISTS chapter_revise_instruction_logs (
  id VARCHAR(64) NOT NULL COMMENT '日志 id',
  project_id VARCHAR(64) NOT NULL COMMENT '项目 id',
  run_id VARCHAR(64) NULL COMMENT '草案 run id；正式章改写可为空',
  section_id VARCHAR(64) NOT NULL COMMENT '章节 id',
  user_id VARCHAR(64) NOT NULL COMMENT '提出指令的用户',
  instruction TEXT NOT NULL COMMENT '用户原始改写指令',
  revise_note TEXT NULL COMMENT 'AI 改写说明（成功后回填）',
  status VARCHAR(32) NOT NULL COMMENT 'pending|ok|failed',
  error TEXT NULL COMMENT '失败原因',
  llm_backend VARCHAR(64) NULL COMMENT 'LLM 后端',
  created_at VARCHAR(32) NOT NULL COMMENT '发起时间',
  completed_at VARCHAR(32) NULL COMMENT '完成时间',
  PRIMARY KEY (id),
  KEY idx_revise_log_created (created_at),
  KEY idx_revise_log_project (project_id, created_at),
  KEY idx_revise_log_user (user_id, created_at),
  KEY idx_revise_log_run (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='章节改写指令历史（管理员只读分析）';
