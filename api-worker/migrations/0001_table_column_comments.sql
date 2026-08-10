-- 0001_table_column_comments.sql
-- 目的：为已有 JFO 表补充表/字段 COMMENT（团队协作、information_schema 可读）
-- 依赖：schema.mysql.sql 对应的 11 张表已存在
-- 执行：在目标库手动执行本文件；新库可直接用带 COMMENT 的 schema.mysql.sql 建表

SET NAMES utf8mb4;

-- documents
ALTER TABLE documents COMMENT='项目资料元数据（文件内容存 MinIO）';
ALTER TABLE documents MODIFY COLUMN id VARCHAR(64) NOT NULL COMMENT '文档 ID';
ALTER TABLE documents MODIFY COLUMN project_id VARCHAR(64) NOT NULL COMMENT '所属项目 ID';
ALTER TABLE documents MODIFY COLUMN conversation_id VARCHAR(128) NULL COMMENT '会话 ID（scope=session 时关联对话附件）';
ALTER TABLE documents MODIFY COLUMN filename VARCHAR(512) NOT NULL COMMENT '原始文件名';
ALTER TABLE documents MODIFY COLUMN r2_key VARCHAR(1024) NOT NULL COMMENT '对象存储 key（MinIO；历史列名 r2_key）';
ALTER TABLE documents MODIFY COLUMN mime VARCHAR(255) NULL COMMENT 'MIME 类型';
ALTER TABLE documents MODIFY COLUMN scope VARCHAR(32) NOT NULL DEFAULT 'package' COMMENT '资料范围：package | session';
ALTER TABLE documents MODIFY COLUMN uploaded_by VARCHAR(128) NULL COMMENT '上传用户 ID';
ALTER TABLE documents MODIFY COLUMN created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601 字符串）';

-- chunks
ALTER TABLE chunks COMMENT='文档分块（检索与 embedding）';
ALTER TABLE chunks MODIFY COLUMN id VARCHAR(64) NOT NULL COMMENT '分块 ID';
ALTER TABLE chunks MODIFY COLUMN document_id VARCHAR(64) NOT NULL COMMENT '所属文档 ID';
ALTER TABLE chunks MODIFY COLUMN chunk_index INT NOT NULL COMMENT '分块序号（从 0 起）';
ALTER TABLE chunks MODIFY COLUMN text LONGTEXT NOT NULL COMMENT '分块正文';
ALTER TABLE chunks MODIFY COLUMN embedding_json LONGTEXT NULL COMMENT '向量嵌入 JSON（DashScope embedding）';

-- user_conversations
ALTER TABLE user_conversations COMMENT='用户对话列表（多设备同步）';
ALTER TABLE user_conversations MODIFY COLUMN id VARCHAR(128) NOT NULL COMMENT '对话 ID';
ALTER TABLE user_conversations MODIFY COLUMN user_id VARCHAR(128) NOT NULL COMMENT '用户 ID';
ALTER TABLE user_conversations MODIFY COLUMN project_id VARCHAR(64) NOT NULL COMMENT '关联项目 ID';
ALTER TABLE user_conversations MODIFY COLUMN title VARCHAR(512) NOT NULL COMMENT '对话标题';
ALTER TABLE user_conversations MODIFY COLUMN preview TEXT NOT NULL COMMENT '列表预览摘要';
ALTER TABLE user_conversations MODIFY COLUMN updated_at VARCHAR(32) NOT NULL COMMENT '最后更新时间（ISO 8601）';
ALTER TABLE user_conversations MODIFY COLUMN variant VARCHAR(64) NULL COMMENT '对话变体/模式标识';
ALTER TABLE user_conversations MODIFY COLUMN files_json LONGTEXT NOT NULL COMMENT '对话级附件列表 JSON';
ALTER TABLE user_conversations MODIFY COLUMN memory_summary LONGTEXT NULL COMMENT '对话记忆摘要（长上下文压缩）';

-- user_chat_messages
ALTER TABLE user_chat_messages COMMENT='用户聊天消息（多设备同步）';
ALTER TABLE user_chat_messages MODIFY COLUMN id VARCHAR(128) NOT NULL COMMENT '消息 ID';
ALTER TABLE user_chat_messages MODIFY COLUMN user_id VARCHAR(128) NOT NULL COMMENT '用户 ID';
ALTER TABLE user_chat_messages MODIFY COLUMN conversation_id VARCHAR(128) NOT NULL COMMENT '所属对话 ID';
ALTER TABLE user_chat_messages MODIFY COLUMN role VARCHAR(32) NOT NULL COMMENT '角色：user | assistant | system';
ALTER TABLE user_chat_messages MODIFY COLUMN content LONGTEXT NOT NULL COMMENT '消息正文';
ALTER TABLE user_chat_messages MODIFY COLUMN files_json LONGTEXT NULL COMMENT '本条消息附件 JSON';
ALTER TABLE user_chat_messages MODIFY COLUMN time_label VARCHAR(64) NOT NULL COMMENT '展示用时间标签';
ALTER TABLE user_chat_messages MODIFY COLUMN sort_index INT NOT NULL COMMENT '对话内排序序号';
ALTER TABLE user_chat_messages MODIFY COLUMN knowledge_network_html LONGTEXT NULL COMMENT '助手回复附带的知识网络 HTML';
ALTER TABLE user_chat_messages MODIFY COLUMN pending_job_id VARCHAR(64) NULL COMMENT '关联中的深度任务 ID（agent_jobs.id）';
ALTER TABLE user_chat_messages MODIFY COLUMN updated_at VARCHAR(32) NOT NULL COMMENT '最后更新时间（ISO 8601）';

-- user_hidden_chat_messages
ALTER TABLE user_hidden_chat_messages COMMENT='用户侧隐藏的消息（软删除）';
ALTER TABLE user_hidden_chat_messages MODIFY COLUMN user_id VARCHAR(128) NOT NULL COMMENT '用户 ID';
ALTER TABLE user_hidden_chat_messages MODIFY COLUMN conversation_id VARCHAR(128) NOT NULL COMMENT '对话 ID';
ALTER TABLE user_hidden_chat_messages MODIFY COLUMN message_id VARCHAR(128) NOT NULL COMMENT '被隐藏的消息 ID';
ALTER TABLE user_hidden_chat_messages MODIFY COLUMN hidden_at VARCHAR(32) NOT NULL COMMENT '隐藏时间（ISO 8601）';

-- chat_message_audit_log
ALTER TABLE chat_message_audit_log COMMENT='聊天消息审计日志';
ALTER TABLE chat_message_audit_log MODIFY COLUMN id VARCHAR(64) NOT NULL COMMENT '审计记录 ID';
ALTER TABLE chat_message_audit_log MODIFY COLUMN user_id VARCHAR(128) NOT NULL COMMENT '用户 ID';
ALTER TABLE chat_message_audit_log MODIFY COLUMN conversation_id VARCHAR(128) NOT NULL COMMENT '对话 ID';
ALTER TABLE chat_message_audit_log MODIFY COLUMN message_id VARCHAR(128) NOT NULL COMMENT '消息 ID';
ALTER TABLE chat_message_audit_log MODIFY COLUMN event VARCHAR(64) NOT NULL COMMENT '事件类型：create | update | delete 等';
ALTER TABLE chat_message_audit_log MODIFY COLUMN role VARCHAR(32) NOT NULL COMMENT '消息角色';
ALTER TABLE chat_message_audit_log MODIFY COLUMN content LONGTEXT NOT NULL COMMENT '消息正文快照';
ALTER TABLE chat_message_audit_log MODIFY COLUMN files_json LONGTEXT NULL COMMENT '附件 JSON 快照';
ALTER TABLE chat_message_audit_log MODIFY COLUMN knowledge_network_html LONGTEXT NULL COMMENT '知识网络 HTML 快照';
ALTER TABLE chat_message_audit_log MODIFY COLUMN time_label VARCHAR(64) NULL COMMENT '展示时间标签快照';
ALTER TABLE chat_message_audit_log MODIFY COLUMN sort_index INT NULL COMMENT '排序序号快照';
ALTER TABLE chat_message_audit_log MODIFY COLUMN source VARCHAR(64) NOT NULL COMMENT '写入来源：api | sync 等';
ALTER TABLE chat_message_audit_log MODIFY COLUMN created_at VARCHAR(32) NOT NULL COMMENT '审计时间（ISO 8601）';

-- agent_jobs
ALTER TABLE agent_jobs COMMENT='Hermes 深度异步任务';
ALTER TABLE agent_jobs MODIFY COLUMN id VARCHAR(64) NOT NULL COMMENT '深度任务 ID';
ALTER TABLE agent_jobs MODIFY COLUMN project_id VARCHAR(64) NOT NULL COMMENT '项目 ID';
ALTER TABLE agent_jobs MODIFY COLUMN user_id VARCHAR(128) NOT NULL COMMENT '发起用户 ID';
ALTER TABLE agent_jobs MODIFY COLUMN conversation_id VARCHAR(128) NULL COMMENT '关联对话 ID';
ALTER TABLE agent_jobs MODIFY COLUMN skill_intent VARCHAR(64) NOT NULL COMMENT '技能意图标识';
ALTER TABLE agent_jobs MODIFY COLUMN status VARCHAR(32) NOT NULL COMMENT '状态：pending | running | completed | failed | cancelled';
ALTER TABLE agent_jobs MODIFY COLUMN hermes_run_id VARCHAR(128) NULL COMMENT 'Hermes Agent run ID';
ALTER TABLE agent_jobs MODIFY COLUMN answer LONGTEXT NULL COMMENT 'Hermes 返回的文本答案';
ALTER TABLE agent_jobs MODIFY COLUMN knowledge_network_html LONGTEXT NULL COMMENT '生成的知识网络 HTML';
ALTER TABLE agent_jobs MODIFY COLUMN error LONGTEXT NULL COMMENT '失败错误信息';
ALTER TABLE agent_jobs MODIFY COLUMN created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）';
ALTER TABLE agent_jobs MODIFY COLUMN updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）';

-- projects
ALTER TABLE projects COMMENT='投资项目主表';
ALTER TABLE projects MODIFY COLUMN id VARCHAR(64) NOT NULL COMMENT '项目 ID';
ALTER TABLE projects MODIFY COLUMN name VARCHAR(512) NOT NULL COMMENT '项目名称';
ALTER TABLE projects MODIFY COLUMN category VARCHAR(128) NOT NULL DEFAULT '未分类' COMMENT '项目分类';
ALTER TABLE projects MODIFY COLUMN phase VARCHAR(128) NOT NULL DEFAULT 'Active（资源筹备中）' COMMENT '项目阶段';
ALTER TABLE projects MODIFY COLUMN summary LONGTEXT NOT NULL COMMENT '内部成员可见摘要';
ALTER TABLE projects MODIFY COLUMN guest_summary LONGTEXT NOT NULL COMMENT '访客可见摘要';
ALTER TABLE projects MODIFY COLUMN created_by VARCHAR(128) NULL COMMENT '创建人用户 ID';
ALTER TABLE projects MODIFY COLUMN created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）';
ALTER TABLE projects MODIFY COLUMN updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）';

-- project_member_roles
ALTER TABLE project_member_roles COMMENT='项目成员角色';
ALTER TABLE project_member_roles MODIFY COLUMN project_id VARCHAR(64) NOT NULL COMMENT '项目 ID';
ALTER TABLE project_member_roles MODIFY COLUMN user_id VARCHAR(128) NOT NULL COMMENT '用户 ID';
ALTER TABLE project_member_roles MODIFY COLUMN role VARCHAR(32) NOT NULL COMMENT '角色：owner | member | guest 等';
ALTER TABLE project_member_roles MODIFY COLUMN updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）';
ALTER TABLE project_member_roles MODIFY COLUMN updated_by VARCHAR(128) NULL COMMENT '最后操作人用户 ID';

-- project_knowledge_networks
ALTER TABLE project_knowledge_networks COMMENT='项目知识网络当前版元数据';
ALTER TABLE project_knowledge_networks MODIFY COLUMN project_id VARCHAR(64) NOT NULL COMMENT '项目 ID';
ALTER TABLE project_knowledge_networks MODIFY COLUMN r2_key VARCHAR(1024) NOT NULL COMMENT '当前版知识网络 HTML 的 MinIO key';
ALTER TABLE project_knowledge_networks MODIFY COLUMN version INT NOT NULL DEFAULT 1 COMMENT '当前版本号（递增）';
ALTER TABLE project_knowledge_networks MODIFY COLUMN version_label VARCHAR(64) NULL COMMENT '版本展示标签';
ALTER TABLE project_knowledge_networks MODIFY COLUMN updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）';
ALTER TABLE project_knowledge_networks MODIFY COLUMN updated_by VARCHAR(128) NOT NULL COMMENT '最后更新人用户 ID';
ALTER TABLE project_knowledge_networks MODIFY COLUMN last_job_id VARCHAR(64) NULL COMMENT '最后一次生成/发布的 agent_jobs.id';
ALTER TABLE project_knowledge_networks MODIFY COLUMN changelog TEXT NULL COMMENT '版本变更说明';

-- project_knowledge_network_versions
ALTER TABLE project_knowledge_network_versions COMMENT='项目知识网络历史版本';
ALTER TABLE project_knowledge_network_versions MODIFY COLUMN project_id VARCHAR(64) NOT NULL COMMENT '项目 ID';
ALTER TABLE project_knowledge_network_versions MODIFY COLUMN version INT NOT NULL COMMENT '历史版本号';
ALTER TABLE project_knowledge_network_versions MODIFY COLUMN version_label VARCHAR(64) NULL COMMENT '版本展示标签';
ALTER TABLE project_knowledge_network_versions MODIFY COLUMN r2_key VARCHAR(1024) NOT NULL COMMENT '该版知识网络 HTML 的 MinIO key';
ALTER TABLE project_knowledge_network_versions MODIFY COLUMN updated_at VARCHAR(32) NOT NULL COMMENT '发布时间（ISO 8601）';
ALTER TABLE project_knowledge_network_versions MODIFY COLUMN updated_by VARCHAR(128) NOT NULL COMMENT '发布人用户 ID';
ALTER TABLE project_knowledge_network_versions MODIFY COLUMN changelog TEXT NULL COMMENT '版本变更说明';
