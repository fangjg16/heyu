-- 项目资料包支持文件夹：父目录相对路径（无首尾 /；根目录为空串）
ALTER TABLE documents
  ADD COLUMN relative_path VARCHAR(1024) NOT NULL DEFAULT '' COMMENT '资料包内父目录相对路径' AFTER filename;
