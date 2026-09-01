-- JFO api-worker MySQL 8 全量 schema（新库初始化；增量变更见 migrations/）
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(64) PRIMARY KEY COMMENT '文档 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '所属项目 ID',
  conversation_id VARCHAR(128) NULL COMMENT '会话 ID（scope=session 时关联对话附件）',
  filename VARCHAR(512) NOT NULL COMMENT '原始文件名',
  relative_path VARCHAR(1024) NOT NULL DEFAULT '' COMMENT '资料包内父目录相对路径',
  r2_key VARCHAR(1024) NOT NULL COMMENT '对象存储 key（MinIO；历史列名 r2_key）',
  mime VARCHAR(255) NULL COMMENT 'MIME 类型',
  scope VARCHAR(32) NOT NULL DEFAULT 'package' COMMENT '资料范围：package | session',
  uploaded_by VARCHAR(128) NULL COMMENT '上传用户 ID',
  source_kind VARCHAR(32) NULL COMMENT 'issuer_upload | investor_share | public_source；空=投资人内部',
  shared_with_issuer TINYINT NOT NULL DEFAULT 0 COMMENT '是否授权项目方可见',
  collab_item_id VARCHAR(64) NULL COMMENT '关联协作事项',
  file_category VARCHAR(128) NULL COMMENT '文件类别',
  period_label VARCHAR(128) NULL COMMENT '资料期间',
  is_final TINYINT NULL COMMENT '是否最终版本',
  upload_note TEXT NULL COMMENT '补充说明',
  replaces_document_id VARCHAR(64) NULL COMMENT '所替代的上一版文档',
  version_group VARCHAR(64) NULL COMMENT '同名版本组',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601 字符串）',
  deleted_at VARCHAR(32) NULL COMMENT '软删除时间（ISO 8601；非空=已删）',
  INDEX idx_documents_project (project_id),
  INDEX idx_documents_conversation (conversation_id),
  INDEX idx_documents_uploaded_by (uploaded_by),
  INDEX idx_documents_project_deleted (project_id, deleted_at),
  INDEX idx_documents_collab_item (collab_item_id),
  INDEX idx_documents_shared_issuer (project_id, shared_with_issuer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目资料元数据（文件内容存 MinIO）';

CREATE TABLE IF NOT EXISTS chunks (
  id VARCHAR(64) PRIMARY KEY COMMENT '分块 ID',
  document_id VARCHAR(64) NOT NULL COMMENT '所属文档 ID',
  chunk_index INT NOT NULL COMMENT '分块序号（从 0 起）',
  text LONGTEXT NOT NULL COMMENT '分块正文',
  embedding_json LONGTEXT NULL COMMENT '向量嵌入 JSON（DashScope embedding）',
  INDEX idx_chunks_document (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文档分块（检索与 embedding）';

CREATE TABLE IF NOT EXISTS user_conversations (
  id VARCHAR(128) NOT NULL COMMENT '对话 ID',
  user_id VARCHAR(128) NOT NULL COMMENT '用户 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '关联项目 ID',
  title VARCHAR(512) NOT NULL COMMENT '对话标题',
  preview TEXT NOT NULL COMMENT '列表预览摘要',
  updated_at VARCHAR(32) NOT NULL COMMENT '最后更新时间（ISO 8601）',
  variant VARCHAR(64) NULL COMMENT '对话变体/模式标识',
  files_json LONGTEXT NOT NULL COMMENT '对话级附件列表 JSON',
  memory_summary LONGTEXT NULL COMMENT '对话记忆摘要（长上下文压缩）',
  deleted_at VARCHAR(32) NULL COMMENT '软删除时间（ISO 8601；非空=已删）',
  PRIMARY KEY (user_id, id),
  INDEX idx_user_conv_user (user_id),
  INDEX idx_user_conv_project (user_id, project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户对话列表（多设备同步）';

CREATE TABLE IF NOT EXISTS user_chat_messages (
  id VARCHAR(128) NOT NULL COMMENT '消息 ID',
  user_id VARCHAR(128) NOT NULL COMMENT '用户 ID',
  conversation_id VARCHAR(128) NOT NULL COMMENT '所属对话 ID',
  role VARCHAR(32) NOT NULL COMMENT '角色：user | assistant | system',
  content LONGTEXT NOT NULL COMMENT '消息正文',
  files_json LONGTEXT NULL COMMENT '本条消息附件 JSON',
  time_label VARCHAR(64) NOT NULL COMMENT '展示用时间标签',
  sort_index INT NOT NULL COMMENT '对话内排序序号',
  knowledge_network_html LONGTEXT NULL COMMENT '助手回复附带的知识网络 HTML',
  pending_job_id VARCHAR(64) NULL COMMENT '关联中的深度任务 ID（agent_jobs.id）',
  updated_at VARCHAR(32) NOT NULL COMMENT '最后更新时间（ISO 8601）',
  deleted_at VARCHAR(32) NULL COMMENT '软删除时间（ISO 8601；非空=已删）',
  PRIMARY KEY (user_id, id),
  INDEX idx_user_msg_conv (user_id, conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户聊天消息（多设备同步）';

CREATE TABLE IF NOT EXISTS user_hidden_chat_messages (
  user_id VARCHAR(128) NOT NULL COMMENT '用户 ID',
  conversation_id VARCHAR(128) NOT NULL COMMENT '对话 ID',
  message_id VARCHAR(128) NOT NULL COMMENT '被隐藏的消息 ID',
  hidden_at VARCHAR(32) NOT NULL COMMENT '隐藏时间（ISO 8601）',
  PRIMARY KEY (user_id, conversation_id, message_id),
  INDEX idx_user_hidden_chat_messages_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户侧隐藏的消息（软删除）';

CREATE TABLE IF NOT EXISTS chat_message_audit_log (
  id VARCHAR(64) PRIMARY KEY COMMENT '审计记录 ID',
  user_id VARCHAR(128) NOT NULL COMMENT '用户 ID',
  conversation_id VARCHAR(128) NOT NULL COMMENT '对话 ID',
  message_id VARCHAR(128) NOT NULL COMMENT '消息 ID',
  event VARCHAR(64) NOT NULL COMMENT '事件类型：create | update | delete 等',
  role VARCHAR(32) NOT NULL COMMENT '消息角色',
  content LONGTEXT NOT NULL COMMENT '消息正文快照',
  files_json LONGTEXT NULL COMMENT '附件 JSON 快照',
  knowledge_network_html LONGTEXT NULL COMMENT '知识网络 HTML 快照',
  time_label VARCHAR(64) NULL COMMENT '展示时间标签快照',
  sort_index INT NULL COMMENT '排序序号快照',
  source VARCHAR(64) NOT NULL COMMENT '写入来源：api | sync 等',
  created_at VARCHAR(32) NOT NULL COMMENT '审计时间（ISO 8601）',
  INDEX idx_chat_audit_user_time (user_id, created_at),
  INDEX idx_chat_audit_conv (user_id, conversation_id, created_at),
  INDEX idx_chat_audit_message (user_id, message_id),
  UNIQUE INDEX idx_chat_audit_user_msg_event (user_id, message_id, event)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天消息审计日志';

CREATE TABLE IF NOT EXISTS agent_jobs (
  id VARCHAR(64) PRIMARY KEY COMMENT '深度任务 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目 ID',
  user_id VARCHAR(128) NOT NULL COMMENT '发起用户 ID',
  conversation_id VARCHAR(128) NULL COMMENT '关联对话 ID',
  skill_intent VARCHAR(64) NOT NULL COMMENT '技能意图标识',
  status VARCHAR(32) NOT NULL COMMENT '状态：pending | running | completed | failed | cancelled',
  hermes_run_id VARCHAR(128) NULL COMMENT 'Hermes Agent run ID',
  answer LONGTEXT NULL COMMENT 'Hermes 返回的文本答案',
  knowledge_network_html LONGTEXT NULL COMMENT '生成的知识网络 HTML',
  error LONGTEXT NULL COMMENT '失败错误信息',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  INDEX idx_agent_jobs_user (user_id, created_at),
  INDEX idx_agent_jobs_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Hermes 深度异步任务';

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) PRIMARY KEY COMMENT '项目 ID',
  name VARCHAR(512) NOT NULL COMMENT '项目名称',
  category VARCHAR(128) NOT NULL DEFAULT '未分类' COMMENT '项目分类',
  analysis_kind VARCHAR(16) NULL COMMENT 'early|mature|acquire；创建/编辑时选定',
  phase VARCHAR(128) NOT NULL DEFAULT 'Active（资源筹备中）' COMMENT '项目阶段',
  summary LONGTEXT NOT NULL COMMENT '内部成员可见摘要',
  guest_summary LONGTEXT NOT NULL COMMENT '访客可见摘要',
  openness VARCHAR(16) NOT NULL DEFAULT 'partial' COMMENT '目录可见性：partial=全开放；invite=内部邀请；public为历史值视同全开放',
  created_by VARCHAR(128) NULL COMMENT '创建人用户 ID',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  deleted_at VARCHAR(32) NULL COMMENT '软删除时间（ISO 8601；非空=已删）',
  INDEX idx_projects_updated (updated_at DESC),
  INDEX idx_projects_openness (openness),
  INDEX idx_projects_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='投资项目主表';

CREATE TABLE IF NOT EXISTS project_member_roles (
  project_id VARCHAR(64) NOT NULL COMMENT '项目 ID',
  user_id VARCHAR(128) NOT NULL COMMENT '用户 ID',
  role VARCHAR(32) NOT NULL COMMENT '角色：owner | member | guest 等',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  updated_by VARCHAR(128) NULL COMMENT '最后操作人用户 ID',
  deleted_at VARCHAR(32) NULL COMMENT '软删除时间（ISO 8601；非空=已移除）',
  PRIMARY KEY (project_id, user_id),
  INDEX idx_project_member_roles_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目成员角色';

CREATE TABLE IF NOT EXISTS project_join_requests (
  id VARCHAR(64) PRIMARY KEY COMMENT '申请 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目 ID',
  applicant_user_id VARCHAR(128) NOT NULL COMMENT '申请人用户 ID',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending|approved|rejected',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  reviewed_by VARCHAR(128) NULL COMMENT '审批人用户 ID',
  reviewed_at VARCHAR(32) NULL COMMENT '审批时间（ISO 8601）',
  UNIQUE KEY uq_project_join_applicant (project_id, applicant_user_id),
  INDEX idx_project_join_project_status (project_id, status),
  INDEX idx_project_join_applicant (applicant_user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目加入申请';

CREATE TABLE IF NOT EXISTS project_knowledge_networks (
  project_id VARCHAR(64) PRIMARY KEY COMMENT '项目 ID',
  r2_key VARCHAR(1024) NOT NULL COMMENT '当前版知识网络 HTML 的 MinIO key',
  version INT NOT NULL DEFAULT 1 COMMENT '当前版本号（递增）',
  version_label VARCHAR(64) NULL COMMENT '版本展示标签',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  updated_by VARCHAR(128) NOT NULL COMMENT '最后更新人用户 ID',
  last_job_id VARCHAR(64) NULL COMMENT '最后一次生成/发布的 agent_jobs.id',
  changelog TEXT NULL COMMENT '版本变更说明',
  INDEX idx_project_kn_updated (updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目知识网络当前版元数据';

CREATE TABLE IF NOT EXISTS project_knowledge_network_versions (
  project_id VARCHAR(64) NOT NULL COMMENT '项目 ID',
  version INT NOT NULL COMMENT '历史版本号',
  version_label VARCHAR(64) NULL COMMENT '版本展示标签',
  r2_key VARCHAR(1024) NOT NULL COMMENT '该版知识网络 HTML 的 MinIO key',
  updated_at VARCHAR(32) NOT NULL COMMENT '发布时间（ISO 8601）',
  updated_by VARCHAR(128) NOT NULL COMMENT '发布人用户 ID',
  changelog TEXT NULL COMMENT '版本变更说明',
  PRIMARY KEY (project_id, version),
  INDEX idx_project_kn_versions_project (project_id, version DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目知识网络历史版本';

CREATE TABLE IF NOT EXISTS workspace_users (
  id VARCHAR(128) PRIMARY KEY COMMENT '用户 ID',
  clerk_user_id VARCHAR(128) NULL COMMENT 'Clerk user id',
  username VARCHAR(128) NOT NULL COMMENT '唯一登录名（归一化小写）',
  display_name VARCHAR(256) NOT NULL COMMENT '展示名',
  org_title VARCHAR(512) NOT NULL DEFAULT '' COMMENT '隶属组织',
  avatar_char VARCHAR(8) NOT NULL DEFAULT '?' COMMENT '头像字母（无图时回退）',
  avatar_class VARCHAR(512) NOT NULL DEFAULT '' COMMENT '头像 CSS class',
  avatar_url MEDIUMTEXT NULL COMMENT '头像 data URL，空则用展示名首字母',
  default_role VARCHAR(32) NOT NULL DEFAULT 'guest' COMMENT '遗留列，不表示账号身份；项目权限只在项目成员里',
  is_platform_admin TINYINT NOT NULL DEFAULT 0 COMMENT '是否平台管理员',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  password_hash VARCHAR(128) NOT NULL COMMENT 'PBKDF2 密码哈希（hex）',
  password_salt VARCHAR(64) NOT NULL COMMENT '密码盐（hex）',
  password_iters INT NOT NULL DEFAULT 120000 COMMENT 'PBKDF2 迭代次数',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  UNIQUE KEY uk_workspace_users_username (username),
  UNIQUE KEY uk_workspace_users_clerk (clerk_user_id),
  INDEX idx_workspace_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作区用户账号';

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash VARCHAR(64) PRIMARY KEY COMMENT '原始 token 的 SHA-256 hex',
  user_id VARCHAR(128) NOT NULL COMMENT '用户 ID',
  expires_at VARCHAR(32) NOT NULL COMMENT '过期时间（ISO 8601）',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）',
  last_seen_at VARCHAR(32) NOT NULL COMMENT '最近访问时间（ISO 8601）',
  INDEX idx_auth_sessions_user (user_id),
  INDEX idx_auth_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录会话';

CREATE TABLE IF NOT EXISTS hermes_skills (
  name VARCHAR(128) NOT NULL COMMENT 'skill 目录名',
  title VARCHAR(256) NOT NULL DEFAULT '' COMMENT '展示标题（来自 SKILL.md）',
  description VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'skill 作用简述（管理展示）',
  intent VARCHAR(64) NULL COMMENT '绑定的对话意图（每个 skill 至多一个；全局唯一）',
  created_at VARCHAR(32) NOT NULL COMMENT '创建时间（ISO 8601）',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  synced_at VARCHAR(32) NULL COMMENT '最近成功同步到卷的时间',
  sync_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending|ok|error',
  sync_error TEXT NULL COMMENT '最近同步失败原因',
  PRIMARY KEY (name),
  UNIQUE KEY uk_hermes_skills_intent (intent),
  INDEX idx_hermes_skills_sync (sync_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Hermes skill 元数据（权威）';

CREATE TABLE IF NOT EXISTS hermes_skill_files (
  skill_name VARCHAR(128) NOT NULL COMMENT '所属 skill 名',
  rel_path VARCHAR(512) NOT NULL COMMENT '相对路径（/ 分隔）',
  content_b64 LONGTEXT NOT NULL COMMENT '文件内容 base64（兼容 JSON Bridge）',
  is_text TINYINT NOT NULL DEFAULT 1 COMMENT '1=文本 utf8；0=二进制',
  byte_size INT NOT NULL DEFAULT 0 COMMENT '原始字节数',
  updated_at VARCHAR(32) NOT NULL COMMENT '更新时间（ISO 8601）',
  PRIMARY KEY (skill_name, rel_path),
  INDEX idx_hermes_skill_files_skill (skill_name),
  CONSTRAINT fk_hermes_skill_files_skill
    FOREIGN KEY (skill_name) REFERENCES hermes_skills (name)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Hermes skill 文件树';

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
  status VARCHAR(32) NOT NULL DEFAULT 'pending_reply' COMMENT 'draft|pending_reply|saved|submitted|needs_more|confirmed',
  published_at VARCHAR(32) NOT NULL,
  published_by VARCHAR(128) NOT NULL,
  assigned_to VARCHAR(128) NULL COMMENT '接收方协作账号 user id；空=项目内全部协作方',
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
  INDEX idx_collab_items_due (project_id, due_at),
  INDEX idx_collab_items_assigned (project_id, assigned_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='发布给项目方的协作事项';

CREATE TABLE IF NOT EXISTS platform_operation_logs (
  id VARCHAR(64) NOT NULL COMMENT '日志 id',
  actor_user_id VARCHAR(64) NOT NULL COMMENT '操作人用户 id',
  category VARCHAR(32) NOT NULL COMMENT 'user|permission|join|llm|skill|file',
  action VARCHAR(64) NOT NULL COMMENT 'create|update|disable|enable|delete|reset_password 等',
  target_kind VARCHAR(32) NULL COMMENT 'user|project|skill|document|settings',
  target_id VARCHAR(128) NULL COMMENT '对象 id',
  target_label VARCHAR(512) NULL COMMENT '对象展示名（非密钥）',
  summary VARCHAR(1024) NOT NULL COMMENT '一句话说明',
  created_at VARCHAR(32) NOT NULL COMMENT '操作时间 ISO 8601',
  PRIMARY KEY (id),
  KEY idx_oplog_created (created_at),
  KEY idx_oplog_category (category, created_at),
  KEY idx_oplog_actor (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='平台敏感操作审计（只读，不含密钥明文）';

CREATE TABLE IF NOT EXISTS project_startup_interviews (
  id VARCHAR(64) NOT NULL COMMENT '访谈 ID',
  project_id VARCHAR(64) NOT NULL COMMENT '项目 ID',
  conversation_id VARCHAR(128) NOT NULL COMMENT '独立会话 ID',
  status VARCHAR(32) NOT NULL COMMENT 'in_progress | paused | ended',
  round_index INT NOT NULL DEFAULT 1 COMMENT '第几次访谈',
  answerer_user_id VARCHAR(128) NOT NULL COMMENT '指定回答人',
  started_by VARCHAR(128) NOT NULL COMMENT '开始人（管理员）',
  started_at VARCHAR(32) NOT NULL COMMENT '开始时间',
  paused_at VARCHAR(32) NULL COMMENT '暂停时间',
  ended_at VARCHAR(32) NULL COMMENT '结束时间',
  pending_prompt LONGTEXT NULL COMMENT '当前未答完的提问',
  transcript LONGTEXT NULL COMMENT '访谈纪要 Markdown',
  PRIMARY KEY (id),
  UNIQUE KEY uniq_interview_conv (conversation_id),
  INDEX idx_interview_project_status (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='创业项目用户访谈';
