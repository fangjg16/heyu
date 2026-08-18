import { normalizeProjectPhase } from "@/workspace/projects";
import { apiFetch } from "@/lib/api-auth";
import { formatOpenQuestionForIssuer } from "@/lib/kn-citations";

function withAuthHeaders(init?: RequestInit): RequestInit {
  return init ?? {};
}

/** 已登录时一律走 apiFetch（附带 Bearer） */
async function jfoFetch(path: string, init?: RequestInit): Promise<Response> {
  return apiFetch(path, withAuthHeaders(init));
}

/** JFO API 基址（由 VITE_AI_CHAT_ENDPOINT 推导） */
export function apiBaseFromChatEndpoint(chatEndpoint: string): string {
  const trimmed = chatEndpoint.trim().replace(/\/+$/u, "");
  if (trimmed.endsWith("/api/chat")) {
    return trimmed.replace(/\/api\/chat$/u, "");
  }
  if (trimmed.endsWith("/api/ragflow/chat")) {
    return trimmed.replace(/\/api\/ragflow\/chat$/u, "");
  }
  return trimmed;
}

export const AI_CHAT_ENDPOINT =
  (import.meta.env.VITE_AI_CHAT_ENDPOINT as string | undefined)?.trim() ||
  (import.meta.env.VITE_RAGFLOW_CHAT_ENDPOINT as string | undefined)?.trim() ||
  "";

export const ENABLE_LIVE_CHAT =
  import.meta.env.VITE_ENABLE_LIVE_CHAT === "1" ||
  import.meta.env.VITE_ENABLE_LIVE_CHAT === "true" ||
  Boolean(AI_CHAT_ENDPOINT);

export type ApiProjectJson = {
  id: string;
  name: string;
  category: string;
  phase: string;
  summary: string;
  guestSummary: string;
  openness?: string;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** 0–100；列表接口返回 */
  researchMaturity?: number | null;
};

function normalizeApiOpenness(raw: unknown): "partial" | "invite" {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "invite") return "invite";
  return "partial";
}

function normalizeResearchMaturity(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function mapApiProject(row: ApiProjectJson) {
  return {
    id: row.id,
    name: row.name || "未命名项目",
    category: row.category || "未分类",
    phase: normalizeProjectPhase(row.phase),
    summary: row.summary || "",
    guestSummary: row.guestSummary || "",
    openness: normalizeApiOpenness(row.openness),
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    researchMaturity: normalizeResearchMaturity(row.researchMaturity),
  };
}

export async function fetchProjectsFromApi(
  _chatEndpoint = AI_CHAT_ENDPOINT,
  options?: { userId?: string | null },
): Promise<import("@/workspace/projects").WorkspaceProject[]> {
  if (!apiBaseFromChatEndpoint(AI_CHAT_ENDPOINT)) return [];
  const q = new URLSearchParams();
  const uid = options?.userId?.trim();
  if (uid) q.set("userId", uid);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await jfoFetch(`/api/projects${suffix}`);
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `项目列表加载失败（${res.status}）`);
  }
  const data = (await res.json()) as { projects?: ApiProjectJson[] };
  return (data.projects ?? []).map(mapApiProject);
}

export async function fetchProjectByIdFromApi(
  projectId: string,
  _chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<import("@/workspace/projects").WorkspaceProject | null> {
  if (!apiBaseFromChatEndpoint(AI_CHAT_ENDPOINT)) return null;
  const res = await jfoFetch(`/api/projects/${encodeURIComponent(projectId)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `项目加载失败（${res.status}）`);
  }
  const data = (await res.json()) as { project?: ApiProjectJson };
  return data.project ? mapApiProject(data.project) : null;
}

export async function fetchMyProjectRoles(
  userId: string,
  _chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<Record<string, import("@/workspace/types").WorkspaceRole>> {
  if (!apiBaseFromChatEndpoint(AI_CHAT_ENDPOINT)) return {};
  const res = await jfoFetch(
    `/api/users/${encodeURIComponent(userId)}/project-roles`,
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `角色加载失败（${res.status}）`);
  }
  const data = (await res.json()) as {
    roles?: Record<string, import("@/workspace/types").WorkspaceRole>;
  };
  return data.roles ?? {};
}

export type ProjectPermissionMember = {
  userId: string;
  displayName: string;
  defaultRole: import("@/workspace/types").WorkspaceRole;
  overrideRole: import("@/workspace/types").WorkspaceRole | null;
  effectiveRole: import("@/workspace/types").WorkspaceRole;
  isCreator: boolean;
  isPlatformAdmin: boolean;
};

export async function fetchProjectPermissions(
  projectId: string,
  userId: string,
  chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<{
  projectId: string;
  createdBy: string | null;
  canManage: boolean;
  members: ProjectPermissionMember[];
}> {
  const base = apiBaseFromChatEndpoint(chatEndpoint);
  if (!base) throw new Error("未配置 VITE_AI_CHAT_ENDPOINT");
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/permissions?${q}`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    projectId?: string;
    createdBy?: string | null;
    canManage?: boolean;
    members?: ProjectPermissionMember[];
  };
  if (!res.ok) throw new Error(data.error || `权限加载失败（${res.status}）`);
  return {
    projectId: data.projectId ?? projectId,
    createdBy: data.createdBy ?? null,
    canManage: Boolean(data.canManage),
    members: data.members ?? [],
  };
}

export async function updateProjectPermissions(
  projectId: string,
  userId: string,
  updates: {
    userId: string;
    role?: import("@/workspace/types").WorkspaceRole;
    remove?: boolean;
  }[],
  chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<ProjectPermissionMember[]> {
  const base = apiBaseFromChatEndpoint(chatEndpoint);
  if (!base) throw new Error("未配置 VITE_AI_CHAT_ENDPOINT");
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/permissions?${q}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    members?: ProjectPermissionMember[];
  };
  if (!res.ok) throw new Error(data.error || `权限保存失败（${res.status}）`);
  return data.members ?? [];
}

export function projectFileDownloadUrl(
  projectId: string,
  documentId: string,
  userId: string,
  chatEndpoint = AI_CHAT_ENDPOINT,
): string {
  const base = apiBaseFromChatEndpoint(chatEndpoint);
  const q = new URLSearchParams({ userId });
  return `${base}/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(documentId)}/download?${q}`;
}

export async function createProjectViaApi(
  input: {
    name: string;
    detail?: string;
    category?: string;
    openness?: "partial" | "invite";
    userId?: string;
    participants?: { userId: string; role: "admin" | "core" | "low" | "issuer" }[];
  },
  chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<import("@/workspace/projects").WorkspaceProject> {
  const base = apiBaseFromChatEndpoint(chatEndpoint);
  if (!base) throw new Error("未配置 VITE_AI_CHAT_ENDPOINT，无法创建项目");
  const res = await jfoFetch(`/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      detail: input.detail,
      category: input.category,
      openness: input.openness ?? "partial",
      userId: input.userId,
      createdBy: input.userId,
      participants: input.participants,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    project?: ApiProjectJson;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `创建项目失败（${res.status}）`);
  }
  if (!data.project) throw new Error("创建成功但未返回项目数据");
  return mapApiProject(data.project);
}

export async function updateProjectViaApi(
  projectId: string,
  input: {
    name?: string;
    detail?: string;
    guestSummary?: string;
    category?: string;
    phase?: string;
    openness?: "partial" | "invite";
    userId: string;
  },
  chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<import("@/workspace/projects").WorkspaceProject> {
  const base = apiBaseFromChatEndpoint(chatEndpoint);
  if (!base) throw new Error("未配置 VITE_AI_CHAT_ENDPOINT");
  let res: Response;
  try {
    res = await jfoFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name: input.name,
        detail: input.detail,
        guestSummary: input.guestSummary,
        category: input.category,
        phase: input.phase,
        openness: input.openness,
        userId: input.userId,
      }),
    });
  } catch {
    throw new Error("无法连接 API（多为跨域未放行 PATCH）。请确认 Worker 已部署最新版后强刷页面。");
  }
  const data = (await res.json().catch(() => ({}))) as {
    project?: ApiProjectJson;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `更新项目失败（${res.status}）`);
  if (!data.project) throw new Error("更新成功但未返回项目数据");
  return mapApiProject(data.project);
}

export async function deleteProjectViaApi(
  projectId: string,
  userId: string,
  chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<void> {
  const base = apiBaseFromChatEndpoint(chatEndpoint);
  if (!base) throw new Error("未配置 VITE_AI_CHAT_ENDPOINT");
  const q = new URLSearchParams({ userId, projectId });
  let res: Response;
  try {
    res = await jfoFetch(`/api/projects/${encodeURIComponent(projectId)}?${q}`, {
      method: "DELETE",
    });
  } catch {
    throw new Error("无法连接 API（多为跨域未放行 DELETE）。请确认 Worker 已部署最新版后强刷页面。");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `删除项目失败（${res.status}）`);
}

export type JoinRequestStatus = "pending" | "approved" | "rejected";

export type ProjectJoinRequest = {
  id: string;
  projectId: string;
  applicantUserId: string;
  status: JoinRequestStatus;
  createdAt: string;
  updatedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  projectName?: string;
  applicantDisplayName?: string;
};

function mapJoinRequest(row: {
  id?: string;
  projectId?: string;
  applicantUserId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  projectName?: string;
  applicantDisplayName?: string;
}): ProjectJoinRequest {
  const statusRaw = String(row.status ?? "")
    .trim()
    .toLowerCase();
  const status: JoinRequestStatus =
    statusRaw === "approved" || statusRaw === "rejected" ? statusRaw : "pending";
  return {
    id: row.id ?? "",
    projectId: row.projectId ?? "",
    applicantUserId: row.applicantUserId ?? "",
    status,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt ?? null,
    projectName: row.projectName?.trim() || undefined,
    applicantDisplayName: row.applicantDisplayName?.trim() || undefined,
  };
}

export async function fetchMyJoinRequests(
  _chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<ProjectJoinRequest[]> {
  if (!apiBaseFromChatEndpoint(AI_CHAT_ENDPOINT)) return [];
  const res = await jfoFetch("/api/me/join-requests");
  const data = (await res.json().catch(() => ({}))) as {
    requests?: Parameters<typeof mapJoinRequest>[0][];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `申请列表加载失败（${res.status}）`);
  }
  return (data.requests ?? []).map(mapJoinRequest);
}

export async function fetchMyJoinReviews(): Promise<ProjectJoinRequest[]> {
  if (!apiBaseFromChatEndpoint(AI_CHAT_ENDPOINT)) return [];
  const res = await jfoFetch("/api/me/join-reviews");
  const data = (await res.json().catch(() => ({}))) as {
    requests?: Parameters<typeof mapJoinRequest>[0][];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `待审批申请加载失败（${res.status}）`);
  }
  return (data.requests ?? []).map(mapJoinRequest);
}

export type OpenQuestionPriority = "P1" | "P2" | "P3";

export type MyOpenQuestionItem = {
  id: string;
  projectId: string;
  projectName: string;
  text: string;
  priority: OpenQuestionPriority;
  priorityLabel: string;
  updatedAt: string;
};

export async function fetchMyOpenQuestions(
  _chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<{ items: MyOpenQuestionItem[]; total: number }> {
  if (!apiBaseFromChatEndpoint(AI_CHAT_ENDPOINT)) {
    return { items: [], total: 0 };
  }
  const res = await jfoFetch("/api/me/open-questions");
  const data = (await res.json().catch(() => ({}))) as {
    items?: MyOpenQuestionItem[];
    total?: number;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `待确认问题加载失败（${res.status}）`);
  }
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    items,
    total: typeof data.total === "number" ? data.total : items.length,
  };
}

export async function createJoinRequest(
  projectId: string,
  _chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<ProjectJoinRequest> {
  if (!apiBaseFromChatEndpoint(AI_CHAT_ENDPOINT)) {
    throw new Error("未配置 VITE_AI_CHAT_ENDPOINT");
  }
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/join-requests`,
    { method: "POST" },
  );
  const data = (await res.json().catch(() => ({}))) as {
    request?: Parameters<typeof mapJoinRequest>[0];
    error?: string;
    code?: string;
  };
  if (!res.ok) {
    // 已 pending：仍返回 request 供前端点亮「已申请」，同时抛错展示诚实提示
    if (res.status === 409 && data.request) {
      const pending = mapJoinRequest(data.request);
      const err = new Error(
        data.error || "你已提交过加入申请，请等待审批",
      ) as Error & { request?: ProjectJoinRequest };
      err.request = pending;
      throw err;
    }
    throw new Error(data.error || `申请加入失败（${res.status}）`);
  }
  if (!data.request) throw new Error("申请成功但未返回数据");
  return mapJoinRequest(data.request);
}

export async function withdrawJoinRequest(
  projectId: string,
  _chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<void> {
  if (!apiBaseFromChatEndpoint(AI_CHAT_ENDPOINT)) {
    throw new Error("未配置 VITE_AI_CHAT_ENDPOINT");
  }
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/join-requests`,
    { method: "DELETE" },
  );
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `撤回申请失败（${res.status}）`);
}

export async function fetchProjectJoinRequests(
  projectId: string,
  options?: { status?: JoinRequestStatus },
  _chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<ProjectJoinRequest[]> {
  if (!apiBaseFromChatEndpoint(AI_CHAT_ENDPOINT)) return [];
  const q = new URLSearchParams();
  if (options?.status) q.set("status", options.status);
  const suffix = q.toString() ? `?${q}` : "";
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/join-requests${suffix}`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    requests?: Parameters<typeof mapJoinRequest>[0][];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `加入申请列表加载失败（${res.status}）`);
  }
  return (data.requests ?? []).map(mapJoinRequest);
}

export type JoinApproveRole = "admin" | "core" | "low" | "issuer";

export async function reviewJoinRequest(
  projectId: string,
  requestId: string,
  status: "approved" | "rejected",
  options?: { role?: JoinApproveRole },
): Promise<ProjectJoinRequest> {
  if (!apiBaseFromChatEndpoint(AI_CHAT_ENDPOINT)) {
    throw new Error("未配置 VITE_AI_CHAT_ENDPOINT");
  }
  const body: { status: "approved" | "rejected"; role?: JoinApproveRole } = {
    status,
  };
  if (status === "approved") {
    body.role = options?.role ?? "low";
  }
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/join-requests/${encodeURIComponent(requestId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    request?: Parameters<typeof mapJoinRequest>[0];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `审批失败（${res.status}）`);
  if (!data.request) throw new Error("审批成功但未返回数据");
  return mapJoinRequest(data.request);
}

export type ProjectFileRecord = {
  id: string;
  filename: string;
  /** 资料包内父目录（无首尾 /；根目录为空） */
  relativePath?: string;
  scope: "package" | "session";
  conversationId: string | null;
  mime: string | null;
  /** 原始文件字节数（0 表示未知/历史数据） */
  sizeBytes?: number;
  createdAt: string;
  uploadedBy?: string | null;
  chunkCount: number;
  /** 是否已有落库的大模型解析结果 */
  parsed?: boolean;
  sourceKind?: string | null;
  sharedWithIssuer?: boolean;
  fileCategory?: string | null;
};

export const DIRECTORY_MIME = "application/x-directory";

/** 项目页「上传资料」默认一级目录 */
export const PROJECT_UPLOAD_FOLDER = "项目上传的";
/** 对话附件默认一级目录（relative_path；会话树仍按 scope=session 归入「对话上传」） */
export const SESSION_UPLOAD_FOLDER = "对话上传";

/** 项目资料包按 projectId 共享；userId 仅用于拉取该用户的对话临时文件 */
export async function fetchProjectFiles(
  projectId: string,
  userId: string,
  _chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<ProjectFileRecord[]> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(`/api/projects/${projectId}/files?${q}`);
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `资料列表加载失败（${res.status}）`);
  }
  const data = (await res.json()) as { files?: ProjectFileRecord[] };
  return data.files ?? [];
}

export function filterPackageFiles(files: ProjectFileRecord[]): ProjectFileRecord[] {
  return files.filter((f) => f.scope === "package");
}

export type ProjectFileParseSummary = {
  documentId: string;
  filename: string;
  mime: string | null;
  parsed: boolean;
  summary: string;
  chunkCount: number;
  documentType?: string;
  keyPoints?: string[];
  refs?: string[];
  usedFor?: string[];
  llmBackend?: string;
  fromCache?: boolean;
  warning?: string | null;
};

/** 点击解析：抽取正文后调用三方大模型；结果落库，再次请求读库 */
export async function fetchProjectFileParseSummary(
  projectId: string,
  documentId: string,
  userId: string,
  _chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<ProjectFileParseSummary> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(documentId)}/parse-summary?${q}`,
  );
  const data = (await res.json().catch(() => ({}))) as ProjectFileParseSummary & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `解析失败（${res.status}）`);
  }
  const keyPoints = Array.isArray(data.keyPoints)
    ? data.keyPoints.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
  const refs = Array.isArray(data.refs)
    ? data.refs.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
  const usedFor = Array.isArray(data.usedFor)
    ? data.usedFor.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
  return {
    documentId: data.documentId ?? documentId,
    filename: data.filename ?? "",
    mime: data.mime ?? null,
    parsed: Boolean(data.parsed),
    summary: String(data.summary ?? "").trim() || "—",
    chunkCount: Number(data.chunkCount) || 0,
    documentType: String(data.documentType ?? "").trim() || undefined,
    keyPoints,
    refs,
    usedFor,
    llmBackend: data.llmBackend,
    fromCache: data.fromCache,
    warning: data.warning ?? null,
  };
}

export function filterConversationSessionFiles(
  files: ProjectFileRecord[],
  conversationId: string,
  messageFilenames?: Iterable<string>,
): ProjectFileRecord[] {
  const names = messageFilenames
    ? new Set(Array.from(messageFilenames).filter(Boolean))
    : null;
  return files.filter((f) => {
    if (f.scope !== "session") return false;
    if (f.conversationId === conversationId) return true;
    if (names?.size && names.has(f.filename)) return true;
    return false;
  });
}

/** 同名文件保留最新一条，避免重复上传占满列表 */
export function dedupeFilesByFilename(
  files: ProjectFileRecord[],
): ProjectFileRecord[] {
  const byName = new Map<string, ProjectFileRecord>();
  for (const f of files) {
    const prev = byName.get(f.filename);
    if (!prev || f.createdAt > prev.createdAt) {
      byName.set(f.filename, f);
    }
  }
  return Array.from(byName.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function uploadProjectPackageFile(
  projectId: string,
  userId: string,
  file: File,
  options?: {
    relativePath?: string;
    collabItemId?: string;
    sourceKind?: string;
    fileCategory?: string;
    periodLabel?: string;
    isFinal?: boolean;
    uploadNote?: string;
    replacesDocumentId?: string;
    versionGroup?: string;
  },
  _chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  form.append("userId", userId);
  form.append("scope", "package");
  const rel = (options?.relativePath ?? "").trim();
  if (rel) form.append("relativePath", rel);
  if (options?.collabItemId) form.append("collabItemId", options.collabItemId);
  if (options?.sourceKind) form.append("sourceKind", options.sourceKind);
  if (options?.fileCategory) form.append("fileCategory", options.fileCategory);
  if (options?.periodLabel) form.append("periodLabel", options.periodLabel);
  if (options?.isFinal != null) form.append("isFinal", options.isFinal ? "1" : "0");
  if (options?.uploadNote) form.append("uploadNote", options.uploadNote);
  if (options?.replacesDocumentId) {
    form.append("replacesDocumentId", options.replacesDocumentId);
  }
  if (options?.versionGroup) form.append("versionGroup", options.versionGroup);
  const res = await jfoFetch(`/api/projects/${projectId}/files`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `上传失败（${res.status}）`);
  }
}

/** 创建空文件夹占位（.keep + directory mime） */
export async function createProjectPackageFolder(
  projectId: string,
  userId: string,
  folderRelativePath: string,
): Promise<void> {
  const path = folderRelativePath.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
  if (!path) throw new Error("文件夹路径无效");
  const parts = path.split("/").filter(Boolean);
  const name = parts[parts.length - 1]!;
  const parent = parts.slice(0, -1).join("/");
  const keep = new File([""], ".keep", { type: DIRECTORY_MIME });
  await uploadProjectPackageFile(projectId, userId, keep, {
    relativePath: parent ? `${parent}/${name}` : name,
  });
}

export type ProjectKnowledgeNetworkMeta = {
  version: number;
  versionLabel?: string | null;
  versionDisplay?: string;
  updatedAt: string;
  updatedBy: string;
  updatedByDisplayName?: string;
  lastJobId: string | null;
  changelog: string | null;
  r2Key: string;
};

export type ProjectKnowledgeNetworkVersionSummary = {
  version: number;
  versionLabel?: string | null;
  versionDisplay?: string;
  updatedAt: string;
  updatedBy: string;
  updatedByDisplayName?: string;
  changelog: string | null;
};

export function knVersionDisplay(
  meta: { version: number; versionLabel?: string | null; versionDisplay?: string },
): string {
  const d = meta.versionDisplay?.trim();
  if (d) return d;
  const l = meta.versionLabel?.trim();
  if (l) return l;
  return String(meta.version);
}

export type ProjectKnowledgeNetworkResponse = {
  ok: boolean;
  projectId: string;
  hasKnowledgeNetwork: boolean;
  meta: ProjectKnowledgeNetworkMeta | null;
  html: string | null;
  versions?: ProjectKnowledgeNetworkVersionSummary[];
  warning?: string;
};

export async function fetchProjectKnowledgeNetwork(
  projectId: string,
  userId: string,
  options?: { includeHtml?: boolean },
  chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<ProjectKnowledgeNetworkResponse> {
  const base = apiBaseFromChatEndpoint(chatEndpoint);
  if (!base) throw new Error("未配置 VITE_AI_CHAT_ENDPOINT");
  const q = new URLSearchParams({ userId });
  if (options?.includeHtml === false) q.set("html", "0");
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/knowledge-network?${q}`,
  );
  const data = (await res.json().catch(() => ({}))) as ProjectKnowledgeNetworkResponse & {
    error?: string;
    code?: string;
  };
  if (res.status === 403) {
    throw new Error(data.error || "无权查看项目知识网络");
  }
  if (!res.ok) {
    throw new Error(data.error || `知识网络加载失败（${res.status}）`);
  }
  return data;
}

export type UploadProjectKnowledgeNetworkResult = {
  ok: boolean;
  projectId: string;
  hasKnowledgeNetwork: boolean;
  meta: ProjectKnowledgeNetworkMeta | null;
  message?: string;
  warning?: string | null;
};

/** 本地上传 HTML，覆盖当前版（旧版归档，版本号 +1） */
export async function uploadProjectKnowledgeNetwork(
  projectId: string,
  userId: string,
  html: string,
  options?: { changelog?: string; uploadFileName?: string },
  chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<UploadProjectKnowledgeNetworkResult> {
  const base = apiBaseFromChatEndpoint(chatEndpoint);
  if (!base) throw new Error("未配置 VITE_AI_CHAT_ENDPOINT");
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/knowledge-network?${q}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        ...(options?.changelog?.trim() ? { changelog: options.changelog.trim() } : {}),
        ...(options?.uploadFileName?.trim()
          ? { uploadFileName: options.uploadFileName.trim() }
          : {}),
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as UploadProjectKnowledgeNetworkResult & {
    error?: string;
    code?: string;
  };
  if (res.status === 403) {
    throw new Error(data.error || "无权上传或覆盖项目知识网络");
  }
  if (!res.ok) {
    throw new Error(data.error || `上传失败（${res.status}）`);
  }
  return data;
}

export async function fetchProjectKnowledgeNetworkVersionHtml(
  projectId: string,
  version: number,
  userId: string,
  chatEndpoint = AI_CHAT_ENDPOINT,
): Promise<string> {
  const base = apiBaseFromChatEndpoint(chatEndpoint);
  if (!base) throw new Error("未配置 VITE_AI_CHAT_ENDPOINT");
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/knowledge-network/versions/${version}?${q}`,
  );
  const data = (await res.json().catch(() => ({}))) as { html?: string; error?: string };
  if (!res.ok) throw new Error(data.error || `版本加载失败（${res.status}）`);
  if (!data.html) throw new Error("未返回 HTML");
  return data.html;
}

export async function deleteProjectFile(
  projectId: string,
  documentId: string,
  userId: string,
  _chatEndpoint = AI_CHAT_ENDPOINT,
  conversationId?: string,
): Promise<void> {
  const q = new URLSearchParams({ userId });
  if (conversationId?.trim()) q.set("conversationId", conversationId.trim());
  let res: Response;
  try {
    res = await jfoFetch(
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(documentId)}?${q}`,
      { method: "DELETE" },
    );
  } catch {
    throw new Error("无法连接 API（多为跨域未放行 DELETE）。请确认 Worker 已部署最新版后强刷页面。");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `删除失败（${res.status}）`);
}

/** 将资料包文件移动到目标父目录（relativePath 空串=根目录） */
export async function moveProjectFile(
  projectId: string,
  documentId: string,
  userId: string,
  relativePath: string,
): Promise<void> {
  const q = new URLSearchParams({ userId });
  let res: Response;
  try {
    res = await jfoFetch(
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(documentId)}?${q}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relativePath }),
      },
    );
  } catch {
    throw new Error("无法连接 API（多为跨域未放行 PATCH）。请确认 Worker 已部署最新版后强刷页面。");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `移动失败（${res.status}）`);
}

export type ProjectKnowledgeChapterResponse = {
  ok: boolean;
  projectId: string;
  sectionId: string;
  title?: string;
  kicker?: string | null;
  hasHtml: boolean;
  html: string | null;
  /** 生成章节时一并返回的引用来源表 HTML（增量合并后） */
  sourcesHtml?: string | null;
  /** 生成章节时一并返回的名词解释表 HTML（增量合并后） */
  glossaryHtml?: string | null;
  /** 更新概览时一并返回的关系图 JSON */
  graphJson?: unknown;
  source: string | null;
  llmBackend: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ProjectKnowledgeChaptersListResponse = {
  ok: boolean;
  projectId: string;
  totalSections: number;
  populatedCount: number;
  chapters: {
    sectionId: string;
    hasHtml: boolean;
    source: string;
    llmBackend: string | null;
    updatedAt: string;
    updatedBy: string | null;
  }[];
};

export async function fetchProjectKnowledgeChapter(
  projectId: string,
  sectionId: string,
  userId: string,
): Promise<ProjectKnowledgeChapterResponse> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/knowledge-chapters/${encodeURIComponent(sectionId)}?${q}`,
  );
  const data = (await res.json().catch(() => ({}))) as ProjectKnowledgeChapterResponse & {
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `章节加载失败（${res.status}）`);
  return data;
}

export async function listProjectKnowledgeChapters(
  projectId: string,
  userId: string,
): Promise<ProjectKnowledgeChaptersListResponse> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/knowledge-chapters?${q}`,
  );
  const data = (await res.json().catch(() => ({}))) as ProjectKnowledgeChaptersListResponse & {
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `章节列表加载失败（${res.status}）`);
  return data;
}

export async function generateProjectKnowledgeChapter(
  projectId: string,
  sectionId: string,
  userId: string,
): Promise<ProjectKnowledgeChapterResponse> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/knowledge-chapters/${encodeURIComponent(sectionId)}/generate?${q}`,
    { method: "POST" },
  );
  const data = (await res.json().catch(() => ({}))) as ProjectKnowledgeChapterResponse & {
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `更新本章失败（${res.status}）`);
  return data;
}

export async function reviseProjectKnowledgeChapter(
  projectId: string,
  sectionId: string,
  userId: string,
  instruction: string,
): Promise<ProjectKnowledgeChapterResponse> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/knowledge-chapters/${encodeURIComponent(sectionId)}/revise?${q}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as ProjectKnowledgeChapterResponse & {
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `改写失败（${res.status}）`);
  return data;
}

export type ChapterDraftRun = {
  id: string;
  projectId: string;
  scope: string;
  status: "generating" | "ready" | "failed" | "published" | "discarded";
  baseVersion: number;
  progressDone: number;
  progressTotal: number;
  failedCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ChapterDraftItem = {
  sectionId: string;
  status: "pending" | "ok" | "failed" | "revising";
  html?: string | null;
  error?: string | null;
  /** 最近一次改写说明（AI 短回复） */
  reviseNote?: string | null;
  llmBackend?: string | null;
  hasHtml?: boolean;
  updatedAt: string;
};

export type CreateChapterDraftRunResponse = {
  ok: true;
  reused: boolean;
  run: ChapterDraftRun;
  items: ChapterDraftItem[];
  sectionIds: string[];
};

export class ActiveDraftExistsError extends Error {
  activeRunId: string;
  activeScope?: string;
  constructor(message: string, activeRunId: string, activeScope?: string) {
    super(message);
    this.name = "ActiveDraftExistsError";
    this.activeRunId = activeRunId;
    this.activeScope = activeScope;
  }
}

export async function createChapterDraftRun(
  projectId: string,
  userId: string,
  options?: { scope?: "full" | "section"; sectionId?: string },
): Promise<CreateChapterDraftRunResponse> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-draft-runs?${q}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: options?.scope ?? "full",
        sectionId: options?.sectionId,
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as CreateChapterDraftRunResponse & {
    error?: string;
    activeRunId?: string;
    activeScope?: string;
    code?: string;
  };
  if (res.status === 409 && data.code === "ACTIVE_DRAFT_EXISTS" && data.activeRunId) {
    throw new ActiveDraftExistsError(
      data.error || "已有进行中的更新草案",
      data.activeRunId,
      data.activeScope,
    );
  }
  if (!res.ok) throw new Error(data.error || `创建更新草案失败（${res.status}）`);
  return data;
}

export type ActiveChapterDraftInfo = {
  runId: string;
  scope: string;
  status: string;
  baseVersion: number;
  progressDone: number;
  progressTotal: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  sectionIds: string[];
};

export async function fetchActiveChapterDraftRun(
  projectId: string,
  userId: string,
): Promise<ActiveChapterDraftInfo | null> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-draft-runs/active?${q}`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    active?: ActiveChapterDraftInfo | null;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `查询进行中草案失败（${res.status}）`);
  return data.active ?? null;
}

export type ChapterReviseLogItem = {
  id: string;
  projectId: string;
  projectName: string;
  runId: string | null;
  sectionId: string;
  userId: string;
  userDisplayName: string;
  instruction: string;
  reviseNote: string | null;
  status: "pending" | "ok" | "failed" | string;
  error: string | null;
  llmBackend: string | null;
  createdAt: string;
  completedAt: string | null;
};

export async function listAdminChapterReviseLogs(
  _userId: string,
  options?: { projectId?: string; filterUserId?: string; limit?: number },
): Promise<ChapterReviseLogItem[]> {
  const q = new URLSearchParams();
  if (options?.projectId) q.set("projectId", options.projectId);
  if (options?.filterUserId) q.set("userId", options.filterUserId);
  if (options?.limit) q.set("limit", String(options.limit));
  const qs = q.toString();
  const res = await jfoFetch(
    `/api/admin/chapter-revise-logs${qs ? `?${qs}` : ""}`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    items?: ChapterReviseLogItem[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `改写指令日志加载失败（${res.status}）`);
  return Array.isArray(data.items) ? data.items : [];
}

export type OperationLogItem = {
  id: string;
  actorUserId: string;
  actorDisplayName: string;
  category: string;
  categoryLabel: string;
  action: string;
  targetKind: string | null;
  targetId: string | null;
  targetLabel: string | null;
  summary: string;
  createdAt: string;
};

export async function listAdminOperationLogs(
  _userId: string,
  options?: { category?: string; actorUserId?: string; limit?: number },
): Promise<OperationLogItem[]> {
  const q = new URLSearchParams();
  if (options?.category) q.set("category", options.category);
  if (options?.actorUserId) q.set("actorUserId", options.actorUserId);
  if (options?.limit) q.set("limit", String(options.limit));
  const qs = q.toString();
  const res = await jfoFetch(`/api/admin/operation-logs${qs ? `?${qs}` : ""}`);
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    items?: OperationLogItem[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `操作日志加载失败（${res.status}）`);
  return Array.isArray(data.items) ? data.items : [];
}

export type GetChapterDraftRunResponse = {
  ok: true;
  projectId: string;
  currentVersion: number;
  run: ChapterDraftRun;
  items: ChapterDraftItem[];
};

export async function fetchChapterDraftRun(
  projectId: string,
  runId: string,
  userId: string,
): Promise<GetChapterDraftRunResponse> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-draft-runs/${encodeURIComponent(runId)}?${q}`,
  );
  const data = (await res.json().catch(() => ({}))) as GetChapterDraftRunResponse & {
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `加载草案失败（${res.status}）`);
  return data;
}

export async function generateChapterDraftSection(
  projectId: string,
  runId: string,
  sectionId: string,
  userId: string,
): Promise<{ ok: true; sectionId: string; html?: string; run?: ChapterDraftRun }> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-draft-runs/${encodeURIComponent(runId)}/sections/${encodeURIComponent(sectionId)}/generate?${q}`,
    { method: "POST" },
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    sectionId?: string;
    html?: string;
    run?: ChapterDraftRun;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `草案章节生成失败（${res.status}）`);
  return {
    ok: true,
    sectionId: data.sectionId ?? sectionId,
    html: data.html,
    run: data.run,
  };
}

export async function saveChapterDraftSection(
  projectId: string,
  runId: string,
  sectionId: string,
  userId: string,
  html: string,
): Promise<{ html: string }> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-draft-runs/${encodeURIComponent(runId)}/sections/${encodeURIComponent(sectionId)}?${q}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    html?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `保存草案失败（${res.status}）`);
  return { html: data.html ?? html };
}

export async function deleteChapterDraftSection(
  projectId: string,
  runId: string,
  sectionId: string,
  userId: string,
): Promise<void> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-draft-runs/${encodeURIComponent(runId)}/sections/${encodeURIComponent(sectionId)}?${q}`,
    { method: "DELETE" },
  );
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `移除章节失败（${res.status}）`);
}

export async function reviseChapterDraftSection(
  projectId: string,
  runId: string,
  sectionId: string,
  userId: string,
  instruction: string,
): Promise<{ status: "revising"; instruction: string }> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-draft-runs/${encodeURIComponent(runId)}/sections/${encodeURIComponent(sectionId)}/revise?${q}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    instruction?: string;
    error?: string;
    code?: string;
  };
  if (res.status === 409 && data.code === "REVISING") {
    return {
      status: "revising",
      instruction: data.instruction ?? instruction,
    };
  }
  if (!res.ok) throw new Error(data.error || `改写草案失败（${res.status}）`);
  return {
    status: "revising",
    instruction: data.instruction ?? instruction,
  };
}

export async function publishChapterDraftRun(
  projectId: string,
  runId: string,
  userId: string,
  options?: { sectionIds?: string[]; bump?: "major" | "minor" },
): Promise<{
  ok: true;
  newVersion: number;
  appliedSections: string[];
  runClosed: boolean;
  partial: boolean;
}> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-draft-runs/${encodeURIComponent(runId)}/publish?${q}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sectionIds: options?.sectionIds,
        bump: options?.bump ?? "minor",
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    newVersion?: number;
    appliedSections?: string[];
    runClosed?: boolean;
    partial?: boolean;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `发布失败（${res.status}）`);
  return {
    ok: true,
    newVersion: data.newVersion ?? 0,
    appliedSections: data.appliedSections ?? [],
    runClosed: Boolean(data.runClosed),
    partial: Boolean(data.partial),
  };
}

export async function discardChapterDraftRun(
  projectId: string,
  runId: string,
  userId: string,
): Promise<void> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/chapter-draft-runs/${encodeURIComponent(runId)}/discard?${q}`,
    { method: "POST" },
  );
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `放弃草案失败（${res.status}）`);
}

export type KnowledgeChapterVersionMeta = {
  version: number;
  archivedAt: string;
  archivedBy: string | null;
  sectionCount: number;
  isCurrent: boolean;
};

export async function listKnowledgeChapterVersions(
  projectId: string,
  userId: string,
): Promise<{
  currentVersion: number;
  versions: KnowledgeChapterVersionMeta[];
}> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/knowledge-chapter-versions?${q}`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    currentVersion?: number;
    versions?: KnowledgeChapterVersionMeta[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `版本列表加载失败（${res.status}）`);
  return {
    currentVersion: data.currentVersion ?? 1,
    versions: data.versions ?? [],
  };
}

export type MyChapterDraftRunItem = {
  runId: string;
  projectId: string;
  projectName: string;
  scope: string;
  status: "generating" | "ready" | string;
  progressDone: number;
  progressTotal: number;
  failedCount: number;
  createdAt: string;
  createdBy: string | null;
  researchSectionIds: string[];
};

export async function listMyChapterDraftRuns(
  userId: string,
): Promise<MyChapterDraftRunItem[]> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(`/api/me/chapter-draft-runs?${q}`);
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    items?: MyChapterDraftRunItem[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `草案列表加载失败（${res.status}）`);
  return data.items ?? [];
}

export async function fetchKnowledgeChapterVersion(
  projectId: string,
  version: number,
  userId: string,
): Promise<{
  version: number;
  isCurrent: boolean;
  currentVersion: number;
  chapters: { sectionId: string; html: string }[];
}> {
  const q = new URLSearchParams({ userId });
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/knowledge-chapter-versions/${encodeURIComponent(String(version))}?${q}`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    version?: number;
    isCurrent?: boolean;
    currentVersion?: number;
    chapters?: { sectionId: string; html: string }[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `版本内容加载失败（${res.status}）`);
  return {
    version: data.version ?? version,
    isCurrent: Boolean(data.isCurrent),
    currentVersion: data.currentVersion ?? version,
    chapters: data.chapters ?? [],
  };
}

export type CollabReplyMode = "text" | "file" | "both";
export type CollabPriority = "P1" | "P2" | "P3";
export type CollabItemStatus =
  | "pending_reply"
  | "saved"
  | "submitted"
  | "needs_more"
  | "confirmed";

export type CollabFileReq = { id: string; label: string; required: boolean };

export type CollabItem = {
  id: string;
  projectId: string;
  projectName?: string;
  title: string;
  body: string;
  replyMode: CollabReplyMode;
  priority: CollabPriority;
  dueAt: string | null;
  investorNote: string | null;
  fileReqs: CollabFileReq[];
  status: CollabItemStatus;
  publishedAt: string;
  replyText: string | null;
  replySavedAt: string | null;
  replySubmittedAt: string | null;
  replyBy: string | null;
  reviewNote: string | null;
  confirmedAt: string | null;
  sourceQuestionText?: string;
  assignedTo?: string | null;
  updatedAt: string;
};

export type CollabIssuerAccount = {
  userId: string;
  displayName: string;
};

export type CollabOverview = {
  counts: {
    pendingReply: number;
    pendingFiles: number;
    submitted: number;
    needsMore: number;
  };
  nextSuggestions: string[];
  latestReplyAt: string | null;
  nearestDueAt: string | null;
  itemCount: number;
};

export type CollabFileRecord = {
  id: string;
  filename: string;
  relativePath?: string;
  mime: string | null;
  sizeBytes?: number;
  createdAt: string;
  uploadedBy: string | null;
  sourceKind: string | null;
  sharedWithIssuer?: boolean;
  collabItemId: string | null;
  fileCategory: string | null;
  periodLabel: string | null;
  isFinal: boolean | null;
  uploadNote: string | null;
  replacesDocumentId: string | null;
  versionGroup: string | null;
};

export function collabStatusLabel(
  status: CollabItemStatus,
  view: "investor" | "issuer" = "investor",
): string {
  switch (status) {
    case "pending_reply":
      return view === "issuer" ? "待你回复" : "待项目协作方回复";
    case "saved":
      return "已保存";
    case "submitted":
      return view === "issuer" ? "已提交待审核" : "项目协作方已提交";
    case "needs_more":
      return "需补充";
    case "confirmed":
      return "已确认";
    default:
      return status;
  }
}

export async function fetchCollabOverview(
  projectId: string,
): Promise<CollabOverview> {
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/collab/overview`,
  );
  const data = (await res.json().catch(() => ({}))) as CollabOverview & {
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "协作概览加载失败");
  return data;
}

export async function fetchCollabBoard(projectId: string): Promise<{
  items: CollabItem[];
  issuers: CollabIssuerAccount[];
}> {
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/collab/items`,
  );
  const data = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const err = data as { error?: string };
    throw new Error(err.error || "协作事项加载失败");
  }
  if (Array.isArray(data)) {
    return { items: data as CollabItem[], issuers: [] };
  }
  const payload = data as {
    items?: CollabItem[];
    issuers?: CollabIssuerAccount[];
  };
  return { items: payload.items ?? [], issuers: payload.issuers ?? [] };
}

export async function fetchCollabItems(projectId: string): Promise<CollabItem[]> {
  const { items } = await fetchCollabBoard(projectId);
  return items;
}

export async function fetchCollabItem(
  projectId: string,
  itemId: string,
): Promise<{ item: CollabItem; files: CollabFileRecord[] }> {
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/collab/items/${encodeURIComponent(itemId)}`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    item?: CollabItem;
    files?: CollabFileRecord[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "事项加载失败");
  if (!data.item) throw new Error("事项不存在");
  return { item: data.item, files: data.files ?? [] };
}

export async function publishCollabItem(
  projectId: string,
  body: {
    title: string;
    body: string;
    sourceQuestionText?: string;
    replyMode: CollabReplyMode;
    priority: CollabPriority;
    dueAt?: string | null;
    investorNote?: string | null;
    fileReqs?: CollabFileReq[];
    assignedTo?: string | null;
  },
): Promise<CollabItem> {
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/collab/items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    item?: CollabItem;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "发布失败");
  if (!data.item) throw new Error("发布成功但未返回事项");
  return data.item;
}

/** 按内部问题原文一键发给项目协作方（发布后冻结） */
export async function publishOpenQuestionToIssuer(
  projectId: string,
  question: {
    text: string;
    title?: string;
    priority?: CollabPriority;
  },
): Promise<CollabItem> {
  const text = question.text.trim();
  if (!text) throw new Error("问题内容为空");
  const formatted = formatOpenQuestionForIssuer(text);
  return publishCollabItem(projectId, {
    title: formatted.title || formatted.body.slice(0, 80),
    body: formatted.body,
    sourceQuestionText: text,
    replyMode: "both",
    priority: question.priority ?? "P2",
  });
}

export async function patchCollabItemReply(
  projectId: string,
  itemId: string,
  body: { action: "save" | "submit"; replyText?: string },
): Promise<CollabItem> {
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/collab/items/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    item?: CollabItem;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "提交失败");
  if (!data.item) throw new Error("未返回事项");
  return data.item;
}

export async function reviewCollabItem(
  projectId: string,
  itemId: string,
  body: { action: "confirm" | "reject"; reviewNote?: string },
): Promise<CollabItem> {
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/collab/items/${encodeURIComponent(itemId)}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    item?: CollabItem;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "审核失败");
  if (!data.item) throw new Error("未返回事项");
  return data.item;
}

export type CollabFollowUpSuggest = {
  complete: boolean;
  completeness: string;
  shouldFollowUp: boolean;
  followUpAdvice: string;
  title: string;
  body: string;
};

export async function suggestCollabFollowUp(
  projectId: string,
  itemId: string,
): Promise<CollabFollowUpSuggest> {
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/collab/items/${encodeURIComponent(itemId)}/follow-up-suggest`,
    { method: "POST" },
  );
  const data = (await res.json().catch(() => ({}))) as {
    suggest?: CollabFollowUpSuggest;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "判断失败");
  if (!data.suggest) throw new Error("未返回判断结果");
  return data.suggest;
}

export async function fetchCollabFiles(
  projectId: string,
): Promise<CollabFileRecord[]> {
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/collab/files`,
  );
  const data = (await res.json().catch(() => ({}))) as {
    files?: CollabFileRecord[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "协作文件加载失败");
  return data.files ?? [];
}

export async function shareFileWithIssuer(
  projectId: string,
  documentId: string,
  shared: boolean,
  sourceKind?: "investor_share" | "public_source",
): Promise<void> {
  const res = await jfoFetch(
    `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(documentId)}/share-issuer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sharedWithIssuer: shared,
        sourceKind: shared ? sourceKind ?? "investor_share" : null,
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "授权失败");
}

export async function fetchMyCollabInbox(): Promise<
  (CollabItem & { projectName?: string })[]
> {
  const res = await jfoFetch(`/api/me/collab-inbox`);
  const data = (await res.json().catch(() => ({}))) as {
    items?: (CollabItem & { projectName?: string })[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "协作待办加载失败");
  return data.items ?? [];
}
