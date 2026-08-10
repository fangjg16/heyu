-- documents.byte_size：原始文件字节数（列表/详情展示用）
-- 若列已存在会报 Duplicate column，可忽略
ALTER TABLE documents
  ADD COLUMN byte_size BIGINT NOT NULL DEFAULT 0 COMMENT '原始文件字节数' AFTER mime;
