ALTER TABLE project_collab_items
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 COMMENT '投资人拖动后的展示顺序，协作方同序';
