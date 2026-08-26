/** 系统管理「API 测试」用的接口目录（人工维护，覆盖常用已鉴权/公开面） */

export type ApiRisk = "safe" | "write" | "destructive" | "llm" | "internal";

export type ApiCatalogEntry = {
  id: string;
  group: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** 可含 :projectId / :runId 等占位 */
  pathTemplate: string;
  summary: string;
  risk: ApiRisk;
  /** 一键安全探测默认包含 */
  autoProbe?: boolean;
  /** 探测时需要已解析出的 projectId */
  needsProject?: boolean;
  sampleBody?: string;
};

export const API_RISK_LABEL: Record<ApiRisk, string> = {
  safe: "安全",
  write: "写入",
  destructive: "破坏性",
  llm: "LLM/计费",
  internal: "内部密钥",
};

export const API_CATALOG: ApiCatalogEntry[] = [
  // Auth / health
  {
    id: "health",
    group: "基础",
    method: "GET",
    pathTemplate: "/api/health",
    summary: "健康检查",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "auth-me",
    group: "基础",
    method: "GET",
    pathTemplate: "/api/auth/me",
    summary: "当前会话用户",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "workspace-users-public",
    group: "基础",
    method: "GET",
    pathTemplate: "/api/workspace-users",
    summary: "工作台用户列表（需登录）",
    risk: "safe",
    autoProbe: true,
  },

  // Me
  {
    id: "me-profile",
    group: "我的",
    method: "PATCH",
    pathTemplate: "/api/me/profile",
    summary: "修改本人昵称与头像（登录名只读）",
    risk: "write",
    sampleBody: '{"displayName":"示例昵称"}',
  },
  {
    id: "me-join",
    group: "我的",
    method: "GET",
    pathTemplate: "/api/me/join-requests",
    summary: "我的加入申请",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "me-join-reviews",
    group: "我的",
    method: "GET",
    pathTemplate: "/api/me/join-reviews",
    summary: "待审批加入申请、已处理历史与协作提交",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "me-questions",
    group: "我的",
    method: "GET",
    pathTemplate: "/api/me/open-questions",
    summary: "开放问题",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "me-drafts",
    group: "我的",
    method: "GET",
    pathTemplate: "/api/me/chapter-draft-runs",
    summary: "可见项目章节更新草案",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "admin-revise-logs",
    group: "管理",
    method: "GET",
    pathTemplate: "/api/admin/chapter-revise-logs",
    summary: "改写指令日志（平台管理员）",
    risk: "safe",
    autoProbe: false,
  },
  {
    id: "admin-operation-logs",
    group: "管理",
    method: "GET",
    pathTemplate: "/api/admin/operation-logs",
    summary: "操作日志（平台管理员）",
    risk: "safe",
    autoProbe: false,
  },

  // Projects
  {
    id: "projects-list",
    group: "项目",
    method: "GET",
    pathTemplate: "/api/projects",
    summary: "项目列表",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "project-get",
    group: "项目",
    method: "GET",
    pathTemplate: "/api/projects/:projectId",
    summary: "项目详情",
    risk: "safe",
    autoProbe: true,
    needsProject: true,
  },
  {
    id: "project-permissions",
    group: "项目",
    method: "GET",
    pathTemplate: "/api/projects/:projectId/permissions",
    summary: "项目成员权限",
    risk: "safe",
    autoProbe: true,
    needsProject: true,
  },
  {
    id: "project-join-list",
    group: "项目",
    method: "GET",
    pathTemplate: "/api/projects/:projectId/join-requests",
    summary: "项目加入申请列表",
    risk: "safe",
    autoProbe: true,
    needsProject: true,
  },
  {
    id: "project-join-withdraw",
    group: "项目",
    method: "DELETE",
    pathTemplate: "/api/projects/:projectId/join-requests",
    summary: "撤回自己的待审批加入申请",
    risk: "write",
    autoProbe: false,
    needsProject: true,
  },
  {
    id: "project-files",
    group: "资料",
    method: "GET",
    pathTemplate: "/api/projects/:projectId/files",
    summary: "资料文件列表",
    risk: "safe",
    autoProbe: true,
    needsProject: true,
  },
  {
    id: "project-citations",
    group: "资料",
    method: "GET",
    pathTemplate: "/api/projects/:projectId/citations",
    summary: "引用列表",
    risk: "safe",
    autoProbe: true,
    needsProject: true,
  },
  {
    id: "file-delete",
    group: "资料",
    method: "DELETE",
    pathTemplate: "/api/projects/:projectId/files/:docId",
    summary: "删除文件（软删）",
    risk: "destructive",
  },

  // Knowledge
  {
    id: "kn-get",
    group: "知识网络",
    method: "GET",
    pathTemplate: "/api/projects/:projectId/knowledge-network",
    summary: "知识网络 HTML",
    risk: "safe",
    autoProbe: true,
    needsProject: true,
  },
  {
    id: "kn-chapters",
    group: "知识网络",
    method: "GET",
    pathTemplate: "/api/projects/:projectId/knowledge-chapters",
    summary: "章节 HTML 列表",
    risk: "safe",
    autoProbe: true,
    needsProject: true,
  },
  {
    id: "kn-chapter-get",
    group: "知识网络",
    method: "GET",
    pathTemplate: "/api/projects/:projectId/knowledge-chapters/:sectionId",
    summary: "单章 HTML",
    risk: "safe",
    sampleBody: undefined,
  },
  {
    id: "kn-chapter-generate",
    group: "知识网络",
    method: "POST",
    pathTemplate: "/api/projects/:projectId/knowledge-chapters/:sectionId/generate",
    summary: "更新本章（LLM）",
    risk: "llm",
  },
  {
    id: "kn-chapter-revise",
    group: "知识网络",
    method: "POST",
    pathTemplate: "/api/projects/:projectId/knowledge-chapters/:sectionId/revise",
    summary: "按指令改写本章（LLM）",
    risk: "llm",
    sampleBody: '{\n  "instruction": "写得更简洁"\n}',
  },
  {
    id: "kn-versions",
    group: "知识网络",
    method: "GET",
    pathTemplate: "/api/projects/:projectId/knowledge-chapter-versions",
    summary: "章节版本列表",
    risk: "safe",
    autoProbe: true,
    needsProject: true,
  },
  {
    id: "draft-create",
    group: "章节草案",
    method: "POST",
    pathTemplate: "/api/projects/:projectId/chapter-draft-runs",
    summary: "创建更新草案",
    risk: "write",
    sampleBody: '{\n  "scope": "section",\n  "sectionId": "snapshot"\n}',
  },
  {
    id: "draft-publish",
    group: "章节草案",
    method: "POST",
    pathTemplate: "/api/projects/:projectId/chapter-draft-runs/:runId/publish",
    summary: "发布草案",
    risk: "destructive",
  },
  {
    id: "draft-discard",
    group: "章节草案",
    method: "POST",
    pathTemplate: "/api/projects/:projectId/chapter-draft-runs/:runId/discard",
    summary: "放弃草案",
    risk: "destructive",
  },
  {
    id: "chat",
    group: "对话",
    method: "POST",
    pathTemplate: "/api/chat",
    summary: "发起对话 / 知识网络任务",
    risk: "llm",
  },

  // Admin
  {
    id: "admin-users",
    group: "Admin",
    method: "GET",
    pathTemplate: "/api/admin/workspace-users",
    summary: "管理端用户列表",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "taxonomy",
    group: "项目",
    method: "GET",
    pathTemplate: "/api/taxonomy",
    summary: "行业一二级分类白名单（taxonomy.md）",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "admin-skills",
    group: "Admin",
    method: "GET",
    pathTemplate: "/api/admin/skills",
    summary: "Hermes Skills 列表",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "admin-kn-templates",
    group: "Admin",
    method: "GET",
    pathTemplate: "/api/admin/knowledge-network-chapter-templates",
    summary: "章节 MD 模板列表",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "admin-llm-settings",
    group: "Admin",
    method: "GET",
    pathTemplate: "/api/admin/llm-settings",
    summary: "大模型与 API Key 配置（脱敏）",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "admin-llm-settings-refresh-models",
    group: "Admin",
    method: "POST",
    pathTemplate: "/api/admin/llm-settings/refresh-models",
    summary: "从 DashScope 刷新模型列表",
    risk: "llm",
  },
  {
    id: "admin-llm-settings-test",
    group: "Admin",
    method: "POST",
    pathTemplate: "/api/admin/llm-settings/test",
    summary: "测试云端 LLM 连通性",
    risk: "llm",
  },
  {
    id: "admin-generate-system",
    group: "Admin",
    method: "GET",
    pathTemplate: "/api/admin/knowledge-network-prompt-settings/generate_system",
    summary: "全局生成 System 提示词",
    risk: "safe",
    autoProbe: true,
  },
  {
    id: "admin-put-generate-system",
    group: "Admin",
    method: "PUT",
    pathTemplate: "/api/admin/knowledge-network-prompt-settings/generate_system",
    summary: "保存全局 System 提示词",
    risk: "write",
    sampleBody: '{\n  "value": "（勿在探测中随意覆盖）"\n}',
  },
  {
    id: "admin-skills-sync",
    group: "Admin",
    method: "POST",
    pathTemplate: "/api/admin/skills/sync",
    summary: "同步 Skills 到卷",
    risk: "write",
  },
  {
    id: "admin-reembed",
    group: "Admin",
    method: "POST",
    pathTemplate: "/api/admin/documents/reembed",
    summary: "文档重嵌入（内部密钥）",
    risk: "internal",
  },
  {
    id: "admin-chat-audit",
    group: "Admin",
    method: "GET",
    pathTemplate: "/api/admin/chat-audit",
    summary: "对话审计（内部密钥）",
    risk: "internal",
  },
];

export function resolvePathTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/:([A-Za-z][A-Za-z0-9_]*)/gu, (_, key: string) => {
    const v = (vars[key] ?? "").trim();
    return v ? encodeURIComponent(v) : `:${key}`;
  });
}

export function pathHasUnresolved(path: string): boolean {
  return /:[A-Za-z]/u.test(path);
}
