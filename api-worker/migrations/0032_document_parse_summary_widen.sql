-- 摘要列从 200 字扩到 800，避免残缺 JSON 或约 280 字摘要被拦腰截断
ALTER TABLE document_parse_results
  MODIFY COLUMN summary VARCHAR(800) NOT NULL DEFAULT '' COMMENT '投研摘要（业务上限约 280 字）';
