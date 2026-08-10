-- DashScope 模型列表缓存（OpenAI 兼容 GET /models 拉取结果）

CREATE TABLE IF NOT EXISTS platform_llm_model_catalog (
  id TINYINT NOT NULL COMMENT '固定单行，恒为 1',
  models_json LONGTEXT NOT NULL COMMENT '模型 id 字符串数组 JSON',
  fetched_at VARCHAR(32) NOT NULL COMMENT '最近拉取时间 ISO 8601',
  source VARCHAR(32) NOT NULL COMMENT 'dashscope | seed',
  error VARCHAR(512) NULL COMMENT '最近一次拉取失败摘要',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='平台云端 LLM 模型目录缓存';
