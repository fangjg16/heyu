-- 章节生成提示词：每章 format_hint + 全局 generate_system 设置
-- 若 format_hint 列已存在会报 Duplicate column，可忽略后继续

ALTER TABLE knowledge_network_chapter_templates
  ADD COLUMN format_hint LONGTEXT NULL COMMENT '章节专用版式提示（SECTION_FORMAT_HINT）' AFTER markdown;

CREATE TABLE IF NOT EXISTS knowledge_network_prompt_settings (
  setting_key VARCHAR(64) NOT NULL COMMENT '设置键，如 generate_system',
  value LONGTEXT NOT NULL COMMENT '提示词全文',
  updated_at VARCHAR(32) NOT NULL COMMENT '最近更新时间 ISO 8601',
  updated_by VARCHAR(128) NULL COMMENT '最近更新人 userId',
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='知识网络生成提示词全局设置';
