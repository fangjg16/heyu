-- 与 documents 对齐排序规则，避免 JOIN/子查询 Illegal mix of collations
ALTER TABLE document_parse_results
  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
