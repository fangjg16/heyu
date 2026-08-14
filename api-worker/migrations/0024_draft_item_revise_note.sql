-- 草案改写说明：AI 对用户意见的短回复（非聊天）
ALTER TABLE project_knowledge_chapter_draft_items
  ADD COLUMN revise_note TEXT NULL
    COMMENT '最近一次改写说明（AI 短回复）'
    AFTER error;
