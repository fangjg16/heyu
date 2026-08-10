-- 平台级云端 LLM 配置（OpenAI 兼容：base_url / model / api_key）
-- 运行时覆盖 DASHSCOPE_* / HERMES_MODEL；密钥加密存储，GET 永不回传明文

CREATE TABLE IF NOT EXISTS platform_llm_settings (
  id TINYINT NOT NULL COMMENT '固定单行，恒为 1',
  base_url VARCHAR(512) NOT NULL COMMENT 'OpenAI 兼容 API Base URL',
  model VARCHAR(128) NOT NULL COMMENT '模型名',
  api_key_enc TEXT NULL COMMENT 'AES-GCM 加密后的 API Key（含版本前缀）',
  api_key_hint VARCHAR(16) NULL COMMENT '末四位掩码提示，如 e1be',
  updated_at VARCHAR(32) NOT NULL COMMENT '最近更新时间 ISO 8601',
  updated_by VARCHAR(128) NULL COMMENT '最近更新人 userId',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='平台云端大模型与 API Key 配置';
