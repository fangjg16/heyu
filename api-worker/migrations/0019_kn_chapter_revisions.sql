-- 章节正式版本束 + 草案 run + 版本归档（更新全部章节：审核后发布）

CREATE TABLE IF NOT EXISTS project_knowledge_chapter_bundle (
  project_id VARCHAR(128) NOT NULL COMMENT '项目 id',
  version INT NOT NULL DEFAULT 1 COMMENT '当前已发布正式版号（从 1 起）',
  updated_at VARCHAR(32) NOT NULL COMMENT '最近发布时间 ISO 8601',
  updated_by VARCHAR(128) NULL COMMENT '最近发布人 userId',
  PRIMARY KEY (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='项目知识网络章节正式版本束';

CREATE TABLE IF NOT EXISTS project_knowledge_chapter_versions (
  project_id VARCHAR(128) NOT NULL COMMENT '项目 id',
  version INT NOT NULL COMMENT '归档版本号',
  section_id VARCHAR(64) NOT NULL COMMENT '章节 id',
  html LONGTEXT NOT NULL COMMENT '该版本章节 HTML',
  source VARCHAR(32) NOT NULL DEFAULT 'generate' COMMENT '来源',
  llm_backend VARCHAR(64) NULL COMMENT 'LLM 后端',
  archived_at VARCHAR(32) NOT NULL COMMENT '归档时间 ISO 8601',
  archived_by VARCHAR(128) NULL COMMENT '归档人 userId',
  PRIMARY KEY (project_id, version, section_id),
  KEY idx_kn_ch_ver_project (project_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='项目知识网络章节正式版归档';

CREATE TABLE IF NOT EXISTS project_knowledge_chapter_draft_runs (
  id VARCHAR(64) NOT NULL COMMENT 'run id',
  project_id VARCHAR(128) NOT NULL COMMENT '项目 id',
  scope VARCHAR(32) NOT NULL DEFAULT 'full' COMMENT '范围：full | section',
  status VARCHAR(32) NOT NULL COMMENT 'generating|ready|failed|published|discarded',
  base_version INT NOT NULL DEFAULT 1 COMMENT '生成时所基于的正式版号',
  progress_done INT NOT NULL DEFAULT 0 COMMENT '已完成章节数',
  progress_total INT NOT NULL DEFAULT 13 COMMENT '总章节数',
  failed_count INT NOT NULL DEFAULT 0 COMMENT '失败章节数',
  created_by VARCHAR(128) NULL COMMENT '发起人',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间',
  published_at VARCHAR(32) NULL COMMENT '发布时间',
  PRIMARY KEY (id),
  KEY idx_kn_draft_run_project (project_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='章节更新草案 run';

CREATE TABLE IF NOT EXISTS project_knowledge_chapter_draft_items (
  run_id VARCHAR(64) NOT NULL COMMENT '草案 run id',
  section_id VARCHAR(64) NOT NULL COMMENT '章节 id（含 sources/glossary）',
  status VARCHAR(32) NOT NULL COMMENT 'pending|ok|failed|revising',
  html LONGTEXT NULL COMMENT '草案 HTML',
  error TEXT NULL COMMENT '失败原因；revising 时为改写指令',
  llm_backend VARCHAR(64) NULL COMMENT 'LLM 后端',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间',
  PRIMARY KEY (run_id, section_id),
  KEY idx_kn_draft_item_run (run_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='章节更新草案条目';
