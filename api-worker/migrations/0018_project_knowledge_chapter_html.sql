-- 项目知识网络：按章节落库的 HTML 片段（生成 / 改写）
CREATE TABLE IF NOT EXISTS project_knowledge_chapter_html (
  project_id VARCHAR(128) NOT NULL COMMENT '项目 id',
  section_id VARCHAR(64) NOT NULL COMMENT '章节 id（与模板 id 一致）',
  html LONGTEXT NOT NULL COMMENT '章节 HTML 片段（非完整页面）',
  source VARCHAR(32) NOT NULL COMMENT '来源：generate | revise',
  llm_backend VARCHAR(64) NULL COMMENT '最近一次 LLM 后端标识',
  updated_at VARCHAR(32) NOT NULL COMMENT '最近更新时间 ISO 8601',
  updated_by VARCHAR(128) NULL COMMENT '最近更新人 userId',
  PRIMARY KEY (project_id, section_id),
  KEY idx_kn_ch_html_project (project_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='项目知识网络章节 HTML（按 project+section 落库）';
