-- 补充问询记下所接的上一条事项，展开时能串回原来的提问和答复

ALTER TABLE project_collab_items
  ADD COLUMN parent_item_id VARCHAR(64) NULL COMMENT '补充问询所接的上一条事项' AFTER source_question_text;
