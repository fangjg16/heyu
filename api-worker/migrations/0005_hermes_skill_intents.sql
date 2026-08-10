-- 对话意图 → Hermes skill 目录名（权威配置；代码 INTENT_TO_SKILL 作缺省回退）
CREATE TABLE IF NOT EXISTS hermes_skill_intents (
  intent VARCHAR(64) NOT NULL COMMENT 'SkillIntent（不含 standard）',
  skill_name VARCHAR(128) NOT NULL COMMENT 'skill 目录名',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  PRIMARY KEY (intent),
  INDEX idx_hermes_skill_intents_skill (skill_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='意图与 skill 绑定';

INSERT IGNORE INTO hermes_skill_intents (intent, skill_name, updated_at) VALUES
  ('project_intake', 'project-intake', '2026-07-14T00:00:00.000Z'),
  ('knowledge_network', 'opportunistic-investments-hermes', '2026-07-14T00:00:00.000Z'),
  ('ic_memo', 'ic-memo', '2026-07-14T00:00:00.000Z'),
  ('dd_checklist', 'dd-checklist', '2026-07-14T00:00:00.000Z'),
  ('dd_claim_audit', 'dd-claim-audit', '2026-07-14T00:00:00.000Z'),
  ('document_reorganize', 'document-reorganize', '2026-07-14T00:00:00.000Z'),
  ('public_info_search', 'public-info-search', '2026-07-14T00:00:00.000Z'),
  ('term_annotator', 'term-annotator', '2026-07-14T00:00:00.000Z'),
  ('comp_analysis', 'comp-analysis', '2026-07-14T00:00:00.000Z'),
  ('background_check', 'background-check', '2026-07-14T00:00:00.000Z'),
  ('risk_matrix', 'risk-matrix', '2026-07-14T00:00:00.000Z'),
  ('returns_analysis', 'returns-analysis', '2026-07-14T00:00:00.000Z'),
  ('sensitivity_analysis', 'sensitivity-analysis', '2026-07-14T00:00:00.000Z'),
  ('value_creation_plan', 'value-creation-plan', '2026-07-14T00:00:00.000Z'),
  ('gap_tracking', 'gap-tracking', '2026-07-14T00:00:00.000Z'),
  ('node_monitoring', 'node-monitoring', '2026-07-14T00:00:00.000Z');
