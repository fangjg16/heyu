-- 项目加入申请

CREATE TABLE IF NOT EXISTS project_join_requests (
  id VARCHAR(64) PRIMARY KEY COMMENT '申请 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目 ID',
  applicant_user_id VARCHAR(128) NOT NULL COMMENT '申请人用户 ID',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending|approved|rejected',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  reviewed_by VARCHAR(128) NULL COMMENT '审批人用户 ID',
  reviewed_at VARCHAR(32) NULL COMMENT '审批时间（ISO 8601）',
  UNIQUE KEY uq_project_join_applicant (project_id, applicant_user_id),
  INDEX idx_project_join_project_status (project_id, status),
  INDEX idx_project_join_applicant (applicant_user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目加入申请';
