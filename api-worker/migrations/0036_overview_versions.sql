-- 项目概览独立版号，并记录发布时对应的知识网络正式版

ALTER TABLE project_knowledge_chapter_bundle
  ADD COLUMN overview_version INT NOT NULL DEFAULT 0
    COMMENT '项目概览独立版号（1,2,3… 展示为 ov-1）';

ALTER TABLE project_knowledge_chapter_bundle
  ADD COLUMN overview_kn_version INT NOT NULL DEFAULT 0
    COMMENT '当前概览所对应的知识网络正式版号';

CREATE TABLE IF NOT EXISTS project_overview_versions (
  project_id VARCHAR(128) NOT NULL COMMENT '项目 id',
  version INT NOT NULL COMMENT '概览独立版号',
  kn_version INT NOT NULL DEFAULT 0 COMMENT '发布时对应的知识网络正式版号',
  html LONGTEXT NOT NULL COMMENT '概览 HTML',
  graph_html LONGTEXT NULL COMMENT '关系图 JSON/HTML',
  archived_at VARCHAR(32) NOT NULL COMMENT '归档时间 ISO 8601',
  archived_by VARCHAR(128) NULL COMMENT '归档人 userId',
  PRIMARY KEY (project_id, version),
  KEY idx_ov_ver_project (project_id, archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='项目概览独立版本归档（对应知识网络版号）';
