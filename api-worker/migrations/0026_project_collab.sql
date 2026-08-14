-- 项目方协作：外部事项 + 源文件授权/版本元数据

CREATE TABLE IF NOT EXISTS project_collab_items (
  id VARCHAR(64) PRIMARY KEY COMMENT '协作事项 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '所属项目',
  source_question_text TEXT NOT NULL COMMENT '内部原题（仅投资团队）',
  title VARCHAR(512) NOT NULL COMMENT '对外中性标题',
  body TEXT NOT NULL COMMENT '需确认的具体内容（对外冻结稿）',
  reply_mode VARCHAR(32) NOT NULL DEFAULT 'both' COMMENT 'text | file | both',
  priority VARCHAR(8) NOT NULL DEFAULT 'P2' COMMENT 'P1 | P2 | P3',
  due_at VARCHAR(32) NULL COMMENT '截止日期 ISO',
  investor_note TEXT NULL COMMENT '投资人对外补充说明',
  file_reqs_json LONGTEXT NOT NULL COMMENT '待补充文件清单 JSON',
  status VARCHAR(32) NOT NULL DEFAULT 'pending_reply' COMMENT 'pending_reply|saved|submitted|needs_more|confirmed',
  published_at VARCHAR(32) NOT NULL,
  published_by VARCHAR(128) NOT NULL,
  reply_text LONGTEXT NULL COMMENT '项目方文字答复',
  reply_saved_at VARCHAR(32) NULL,
  reply_submitted_at VARCHAR(32) NULL,
  reply_by VARCHAR(128) NULL,
  review_note TEXT NULL COMMENT '退回时给项目方的说明',
  confirmed_at VARCHAR(32) NULL,
  confirmed_by VARCHAR(128) NULL,
  created_at VARCHAR(32) NOT NULL,
  updated_at VARCHAR(32) NOT NULL,
  INDEX idx_collab_items_project (project_id),
  INDEX idx_collab_items_status (project_id, status),
  INDEX idx_collab_items_due (project_id, due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发布给项目方的协作事项';

ALTER TABLE documents
  ADD COLUMN source_kind VARCHAR(32) NULL COMMENT 'issuer_upload | investor_share | public_source；空=投资人内部' AFTER uploaded_by,
  ADD COLUMN shared_with_issuer TINYINT NOT NULL DEFAULT 0 COMMENT '是否授权项目方可见' AFTER source_kind,
  ADD COLUMN collab_item_id VARCHAR(64) NULL COMMENT '关联协作事项' AFTER shared_with_issuer,
  ADD COLUMN file_category VARCHAR(128) NULL COMMENT '文件类别' AFTER collab_item_id,
  ADD COLUMN period_label VARCHAR(128) NULL COMMENT '资料期间' AFTER file_category,
  ADD COLUMN is_final TINYINT NULL COMMENT '是否最终版本' AFTER period_label,
  ADD COLUMN upload_note TEXT NULL COMMENT '补充说明' AFTER is_final,
  ADD COLUMN replaces_document_id VARCHAR(64) NULL COMMENT '所替代的上一版文档' AFTER upload_note,
  ADD COLUMN version_group VARCHAR(64) NULL COMMENT '同名版本组' AFTER replaces_document_id;

ALTER TABLE documents ADD INDEX idx_documents_collab_item (collab_item_id);
ALTER TABLE documents ADD INDEX idx_documents_shared_issuer (project_id, shared_with_issuer);
