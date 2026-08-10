-- 知识网络章节 Markdown 模板（全局模板，可后台修改）
CREATE TABLE IF NOT EXISTS knowledge_network_chapter_templates (
  id VARCHAR(64) NOT NULL COMMENT '章节 id（与 UI section id 一致，如 snapshot）',
  group_id VARCHAR(32) NOT NULL COMMENT '分组：overview|research|structure|risk',
  group_label VARCHAR(64) NOT NULL COMMENT '分组中文名',
  title VARCHAR(128) NOT NULL COMMENT '章节标题',
  kicker VARCHAR(128) NULL COMMENT '副标，如 项目概况 · A.1',
  canonical_hint VARCHAR(64) NULL COMMENT 'Hermes kb-schema 提示键',
  markdown LONGTEXT NOT NULL COMMENT '章节 Markdown 全文（含 frontmatter 可选）',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '展示排序',
  updated_at VARCHAR(32) NOT NULL COMMENT '最近更新时间 ISO 8601',
  updated_by VARCHAR(128) NULL COMMENT '最近更新人 userId',
  PRIMARY KEY (id),
  KEY idx_kn_chapter_tpl_group (group_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='知识网络章节 Markdown 模板（全局）';
