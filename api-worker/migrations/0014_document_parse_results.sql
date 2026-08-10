-- 源文件大模型解析结果落库（摘要 / 被引用 / 已用于）

CREATE TABLE IF NOT EXISTS document_parse_results (
  document_id VARCHAR(64) NOT NULL COMMENT '文档 ID（documents.id）',
  summary VARCHAR(200) NOT NULL DEFAULT '' COMMENT '投研摘要（业务上限 100 字）',
  document_type VARCHAR(128) NULL COMMENT '文件类型简述',
  key_points_json LONGTEXT NULL COMMENT '要点 JSON string[]',
  refs_json LONGTEXT NULL COMMENT '被引用主题 JSON string[]',
  used_for_json LONGTEXT NULL COMMENT '已用于/用途建议 JSON string[]',
  chunk_count INT NOT NULL DEFAULT 0 COMMENT '解析时分块数',
  llm_backend VARCHAR(64) NULL COMMENT '所用 LLM 后端',
  parsed_at VARCHAR(32) NOT NULL COMMENT '首次解析时间 ISO 8601',
  updated_at VARCHAR(32) NOT NULL COMMENT '最近更新时间 ISO 8601',
  PRIMARY KEY (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='源文件大模型解析结果';
