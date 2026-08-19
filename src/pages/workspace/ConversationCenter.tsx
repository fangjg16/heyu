import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  FileUp,
  FileText,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Plane,
  Plus,
  Quote,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { ChatMarkdown } from "@/components/workspace/ChatMarkdown";
import { TypingLoader } from "@/components/ui/loader";
import {
  KnowledgeNetworkPreview,
  prepareKnowledgeNetworkMessageDisplay,
} from "@/components/workspace/KnowledgeNetworkPreview";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { cn } from "@/lib/utils";
import {
  AI_CHAT_ENDPOINT,
  deleteProjectFile,
  ENABLE_LIVE_CHAT,
  fetchProjectByIdFromApi,
  fetchProjectFiles,
  filterConversationSessionFiles,
  SESSION_UPLOAD_FOLDER,
  type ProjectFileRecord,
} from "@/lib/project-api";
import { apiFetch } from "@/lib/api-auth";
import { loadSessionToken } from "@/workspace/session";
import type { KnowledgeNetworkChatEntryState } from "@/lib/knowledge-network-prompts";
import type { WorkspaceProject } from "@/workspace/projects";
import { CHAT_QUICK_PROMPTS } from "@/lib/chat-quick-prompts";
import { consumeChatSse } from "@/lib/chat-stream-client";
import { cancelAgentJobRemote, mergeAsyncAgentJobIntoConversation } from "@/lib/chat-sync-api";
import {
  buildProductizedJobProgressLabel,
  formatAgentJobFailureDisplay,
  productizeAssistantBubbleContent,
  productizeJobProgressLabelForDisplay,
  productizeKnJobSubmitContent,
  productizeStreamStatusLabel,
  type SlotBatchProgressLike,
} from "@/lib/agent-job-display";
import {
  deriveConversationTopicHeuristic,
  isSidebarTopicPreview,
  topicFromFirstUserMessage,
} from "@/lib/conversation-topic";
import { isDeepSkillMessage, streamingAssistantDisplayText } from "@/lib/chat-intent";
import type { LiveChatMessage } from "@/workspace/chat-types";
import {
  loadChatStateForUser,
  persistChatStateForUser,
  type ChatPersistOptions,
} from "@/workspace/chat-persistence";
import {
  getMergedProjects,
  getProjectById,
  subscribeApiProjects,
  upsertApiProject,
} from "@/workspace/project-registry";
import {
  conversationBelongsToProject,
  conversationRoutePath,
  hasConversationIdInUrl,
  inferProjectIdFromConversationId as inferProjectIdFromConvId,
  isBlankConversationId,
  pickConversationIdForProject,
  resolveConversationIdFromUrl,
} from "@/workspace/chat-conversation-id";
import {
  appendMessageWithSortIndex,
  sortMessagesByConversation,
  sortMessagesChronologically,
} from "@/workspace/chat-message-order";
import {
  formatBubbleTimeLabel,
  formatSidebarDateLabel,
  latestMessageTimeLabel,
} from "@/workspace/chat-time";
import {
  loadSessionUserId,
  saveLastChatProjectId,
} from "@/workspace/session";
import { useMyProjectRoles } from "@/hooks/use-my-project-roles";
import type { WorkspaceRole } from "@/workspace/types";
import {
  getProjectRole,
  getUserById,
  roleLabelForProject,
} from "@/workspace/workspace-users";
import type { WorkspaceUser } from "@/workspace/types";

type SessionConversation = {
  id: string;
  projectId: string;
  title: string;
  preview: string;
  updatedAt: string;
  files: string[];
  /** blank 为空白新对话 */
  variant?: "blank";
};

type SessionConversationState = {
  conversations: SessionConversation[];
  messagesByConversation: Record<string, LiveChatMessage[]>;
};

function conversationHasMessages(
  c: SessionConversation,
  messagesByConversation: Record<string, LiveChatMessage[]>,
): boolean {
  const msgs = messagesByConversation[c.id];
  return Array.isArray(msgs) && msgs.length > 0;
}

/** 每个有子线程或消息的项目都保留一条 `-main` 全局分析入口（Live 侧栏） */
function ensureProjectMainThreads(
  convs: SessionConversation[],
  messagesByConversation: Record<string, LiveChatMessage[]>,
  focusProjectId?: string,
): SessionConversation[] {
  const byId = new Map(convs.map((c) => [c.id, c]));
  const projectIds = new Set<string>();
  for (const c of convs) projectIds.add(c.projectId);
  for (const [convId, msgs] of Object.entries(messagesByConversation)) {
    if (!Array.isArray(msgs) || msgs.length === 0) continue;
    const pid =
      inferProjectIdFromConversationId(convId, Array.from(byId.values())) ??
      inferProjectIdFromConvId(convId);
    if (pid) projectIds.add(pid);
  }
  if (focusProjectId) projectIds.add(focusProjectId);

  for (const pid of projectIds) {
    if (!getProjectById(pid)) continue;
    const mainId = `${pid}-main`;
    if (byId.has(mainId)) continue;
    const built = buildConversationFromProject(pid);
    if (built) byId.set(mainId, built);
  }
  return Array.from(byId.values());
}

/** 侧栏：合并元数据 + 所有有消息的 conversationId 键（避免 D1 有消息但本地列表遗漏） */
function buildSidebarConversationList(
  convs: SessionConversation[],
  messagesByConversation: Record<string, LiveChatMessage[]>,
  focusProjectId?: string,
): SessionConversation[] {
  const withMain = ensureProjectMainThreads(convs, messagesByConversation, focusProjectId);
  const reconciled = reconcileConversationsWithMessages(withMain, messagesByConversation);
  return reconciled.filter((c) => Boolean(getProjectById(c.projectId)));
}

function pruneEmptyLiveConversations(
  convs: SessionConversation[],
  messagesByConversation: Record<string, LiveChatMessage[]>,
): SessionConversation[] {
  return convs.filter(
    (c) =>
      c.id === `${c.projectId}-main` ||
      c.variant === "blank" ||
      conversationHasMessages(c, messagesByConversation),
  );
}

/** 输入框：单行起，随内容增高，超过上限后框内滚动 */
const CHAT_INPUT_MIN_PX = 48;
/** 约 3 行正文 + 内边距，再高则框内滚动 */
const CHAT_INPUT_MAX_PX = 88;

function resizeChatComposer(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const next = Math.min(Math.max(el.scrollHeight, CHAT_INPUT_MIN_PX), CHAT_INPUT_MAX_PX);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > CHAT_INPUT_MAX_PX ? "auto" : "hidden";
}

function buildBlankSessionConversation(
  projectId: string,
  conversationId: string,
  projectName: string,
): SessionConversation {
  return {
    id: conversationId,
    projectId,
    title: `${projectName} · 全局分析`,
    preview: "尚未发送消息",
    updatedAt: getCurrentDateTimeLabel(),
    files: [],
    variant: "blank",
  };
}

function inferProjectIdFromConversationId(
  conversationId: string,
  known: SessionConversation[],
): string | null {
  const hit = known.find((c) => c.id === conversationId);
  if (hit) return hit.projectId;
  const inferred = inferProjectIdFromConvId(conversationId);
  if (inferred) return inferred;
  for (const project of getMergedProjects()) {
    if (conversationId === project.id || conversationId.startsWith(`${project.id}-`)) {
      return project.id;
    }
  }
  return null;
}

/** 用该会话最后一条消息的时间修正侧栏；预览仅首条用户提问主题，不跟随后续消息 */
function applyConversationMetadataFromMessages(
  convs: SessionConversation[],
  messagesByConversation: Record<string, LiveChatMessage[]>,
): SessionConversation[] {
  return convs.map((c) => {
    const msgs = messagesByConversation[c.id];
    if (!msgs?.length) return c;
    const lastTime = latestMessageTimeLabel(msgs);
    const topicPreview = topicFromFirstUserMessage(msgs);
    const looksLikeTopic =
      isSidebarTopicPreview(c.preview) && c.preview.trim().length <= 20;
    return {
      ...c,
      preview: looksLikeTopic ? c.preview : topicPreview,
      updatedAt: lastTime || c.updatedAt,
    };
  });
}

/** 云端有消息但会话元数据缺失时，从 message 键恢复侧栏项（避免同步时被误删） */
function reconcileConversationsWithMessages(
  convs: SessionConversation[],
  messagesByConversation: Record<string, LiveChatMessage[]>,
): SessionConversation[] {
  const byId = new Map(convs.map((c) => [c.id, c]));
  for (const [conversationId, msgs] of Object.entries(messagesByConversation)) {
    if (!Array.isArray(msgs) || msgs.length === 0) continue;
    if (byId.has(conversationId)) continue;
    const projectId = inferProjectIdFromConversationId(conversationId, convs);
    if (!projectId) continue;
    const project = getProjectById(projectId);
    if (!project) continue;
    const built = buildConversationFromProject(projectId, project);
    if (!built) continue;
    byId.set(conversationId, {
      ...built,
      id: conversationId,
      preview: topicFromFirstUserMessage(msgs),
      updatedAt: latestMessageTimeLabel(msgs) || getCurrentDateTimeLabel(),
      variant: "blank",
    });
  }
  return applyConversationMetadataFromMessages(
    Array.from(byId.values()),
    messagesByConversation,
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mergeConversationsForBootstrap(
  base: SessionConversation[],
  messagesByConversation: Record<string, LiveChatMessage[]>,
  isLiveAiMode: boolean,
  focusProjectId?: string,
): SessionConversation[] {
  const reconciled = reconcileConversationsWithMessages(base, messagesByConversation);
  const withTimes = applyConversationMetadataFromMessages(reconciled, messagesByConversation);
  const withMain = isLiveAiMode
    ? ensureProjectMainThreads(withTimes, messagesByConversation, focusProjectId)
    : withTimes;
  if (isLiveAiMode) {
    return withMain;
  }
  if (!focusProjectId) return withMain;
  const currentConversation = buildConversationFromProject(focusProjectId);
  if (!currentConversation) return withMain;
  const hasCurrent = withMain.some((item) => item.projectId === focusProjectId);
  if (hasCurrent) return withMain;
  return [withCurrentPreviewTime(currentConversation), ...withMain];
}

function projectDisplayName(projectId: string): string {
  return getProjectById(projectId)?.name ?? (projectId.startsWith("proj-") ? "云端项目" : projectId);
}

function isProjectMainConversation(conversationId: string, projectId: string): boolean {
  return conversationId === `${projectId}-main`;
}

function mainConversationTitle(projectName: string): string {
  return `${projectName} · 全局分析`;
}

/** 主会话标题随项目名实时更新；子线程仍用持久化 title */
function resolveConversationHeaderTitle(
  conversation: SessionConversation | null | undefined,
  project: WorkspaceProject | undefined,
  projectId: string,
): string {
  if (!project) return "项目对话";
  if (conversation && isProjectMainConversation(conversation.id, projectId)) {
    return mainConversationTitle(project.name);
  }
  return conversation?.title ?? mainConversationTitle(project.name);
}

function conversationSidebarRows(
  convs: SessionConversation[],
  messagesByConversation: Record<string, LiveChatMessage[]>,
  isLiveAiMode: boolean,
): SessionConversation[] {
  const list = isLiveAiMode
    ? pruneEmptyLiveConversations(convs, messagesByConversation)
    : convs;
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

type SidebarProjectGroup = {
  projectId: string;
  projectName: string;
  latestAt: string;
  conversations: SessionConversation[];
};

function groupSidebarByProject(
  convs: SessionConversation[],
  messagesByConversation: Record<string, LiveChatMessage[]>,
  isLiveAiMode: boolean,
): SidebarProjectGroup[] {
  const rows = conversationSidebarRows(convs, messagesByConversation, isLiveAiMode);
  const byProject = new Map<string, SessionConversation[]>();
  for (const c of rows) {
    const list = byProject.get(c.projectId) ?? [];
    list.push(c);
    byProject.set(c.projectId, list);
  }
  const groups: SidebarProjectGroup[] = [];
  for (const [pid, list] of byProject) {
    if (!getProjectById(pid)) continue;
    const sorted = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    groups.push({
      projectId: pid,
      projectName: projectDisplayName(pid),
      latestAt: sorted[0]?.updatedAt ?? "",
      conversations: sorted,
    });
  }
  groups.sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  return groups;
}

const EMPTY_LIVE_CHAT_MESSAGES: LiveChatMessage[] = [];

const CHAT_ENTRY_TRANSITION_KEY = "workspace-chat-entry-transition";
const RAGFLOW_API_KEY =
  (import.meta.env.VITE_RAGFLOW_API_KEY as string | undefined)?.trim() ?? "";
const RAGFLOW_MODE =
  ((import.meta.env.VITE_RAGFLOW_MODE as string | undefined)?.trim().toLowerCase() ??
    "proxy") as "native" | "openai" | "proxy";

function buildApiHealthProbeUrl(chatEndpoint: string): string | null {
  const trimmed = chatEndpoint.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const path = u.pathname.replace(/\/+$/u, "");
    if (path.endsWith("/api/chat")) {
      u.pathname = path.replace(/\/api\/chat$/u, "/api/health");
      return u.toString();
    }
    if (path.endsWith("/api/ragflow/chat")) {
      u.pathname = path.replace(/\/api\/ragflow\/chat$/u, "/api/ragflow/health");
      return u.toString();
    }
  } catch {
    return null;
  }
  return null;
}

const AGENT_JOB_POLL_MS = 3000;
/** 知识网络任务最长轮询约 26 分钟（与 Worker waitForHermesRun 25 分钟 + 缓冲对齐） */
const AGENT_JOB_MAX_POLLS = 520;
/** 合并连续编辑后再 PUT；发消息/任务完成会立即 flush */
const CHAT_PERSIST_DEBOUNCE_MS = 300;

type AgentJobPollPayload = {
  status?: string;
  answer?: string | null;
  knowledgeNetworkHtml?: string | null;
  projectKnowledgeNetworkVersion?: number;
  error?: string | null;
  progressLabel?: string;
  jobStage?: string;
  hermesStatus?: string | null;
  elapsedSec?: number;
  deepPath?: string | null;
  skillIntent?: string;
  slotBatchProgress?: SlotBatchProgressLike | null;
};

async function pollAgentJobUntilDone(params: {
  userId: string;
  jobId: string;
  conversationKey: string;
  assistantMsgId: string;
  citationMap: Record<string, string>;
  shouldAbort?: () => boolean;
  onUpdate: (
    conversationKey: string,
    messageId: string,
    patch: Partial<LiveChatMessage>,
  ) => void;
  onError: (msg: string) => void;
  onPersist?: () => void;
}): Promise<void> {
  const {
    userId,
    jobId,
    conversationKey,
    assistantMsgId,
    citationMap,
    shouldAbort,
    onUpdate,
    onError,
    onPersist,
  } = params;
  for (let i = 0; i < AGENT_JOB_MAX_POLLS; i++) {
    if (shouldAbort?.()) return;
    await new Promise((r) => setTimeout(r, AGENT_JOB_POLL_MS));
    if (shouldAbort?.()) return;
    try {
      const url = `/api/agent-jobs/${encodeURIComponent(jobId)}?userId=${encodeURIComponent(userId)}`;
      const res = await apiFetch(url);
      const data = (await res.json().catch(() => ({}))) as AgentJobPollPayload;
      if (!res.ok) continue;
      if (data.status === "running" || data.status === "pending") {
        const label = buildProductizedJobProgressLabel({
          status: data.status,
          progressLabel: data.progressLabel,
          jobStage: data.jobStage,
          skillIntent: data.skillIntent,
          slotBatchProgress: data.slotBatchProgress,
          elapsedSec: data.elapsedSec,
        });
        onUpdate(conversationKey, assistantMsgId, { jobProgressLabel: label });
      }
      if (data.status === "cancelled") {
        onUpdate(conversationKey, assistantMsgId, {
          content: "深度分析已取消：用户取消",
          pendingJobId: undefined,
          jobProgressLabel: undefined,
        });
        onPersist?.();
        return;
      }
      if (data.status === "completed") {
        const raw = String(data.answer ?? "").trim() || "（任务已完成，但未返回正文。）";
        const answer = formatCitationMarkers(raw, citationMap);
        const knFromApi =
          typeof data.knowledgeNetworkHtml === "string"
            ? data.knowledgeNetworkHtml.trim()
            : "";
        const prepared = prepareKnowledgeNetworkMessageDisplay(answer, knFromApi || null);
        const knVersion =
          typeof data.projectKnowledgeNetworkVersion === "number"
            ? data.projectKnowledgeNetworkVersion
            : undefined;
        onUpdate(conversationKey, assistantMsgId, {
          content: prepared.displayContent,
          knowledgeNetworkHtml: prepared.html || undefined,
          projectKnowledgeNetworkVersion: knVersion,
          pendingJobId: undefined,
          jobProgressLabel: undefined,
        });
        onPersist?.();
        return;
      }
      if (data.status === "failed") {
        const errText = String(data.error ?? "未知错误");
        onUpdate(conversationKey, assistantMsgId, {
          content: formatAgentJobFailureDisplay(
            errText,
            data.answer,
            data.skillIntent,
          ),
          pendingJobId: undefined,
          jobProgressLabel: undefined,
        });
        onError(errText);
        onPersist?.();
        return;
      }
    } catch {
      /* 单轮轮询失败则继续 */
    }
  }
  onUpdate(conversationKey, assistantMsgId, {
    content:
      "本轮页面轮询已结束，任务可能仍在后台运行。刷新本页会自动继续等待结果；若久无结果可重试一次。",
    jobProgressLabel: "等待刷新后继续轮询…",
  });
}

function ragflowChatLooksLikeDirectService(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (u.port === "9380") return true;
    return /ragflow/i.test(u.hostname);
  } catch {
    return false;
  }
}

const STREAM_TRUNCATED_FOOTER =
  "\n\n---\n\n*（生成过程中连接中断，以上为已返回内容。可缩短问题后重试，或刷新页面再发。）*";

function isStreamDisconnectError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("network connection lost") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("aborted")
  );
}

function formatRagflowRequestError(message: string, endpoint: string): string {
  const base = `请求失败：${message}`;
  if (!message.toLowerCase().includes("failed to fetch")) return base;
  const ep = endpoint.trim();
  const extra: string[] = [];
  if (ep) {
    extra.push(`当前接口：${ep}`);
  }
  if (typeof window !== "undefined" && window.location.protocol === "https:" && ep.startsWith("http:")) {
    extra.push("页面为 HTTPS，而接口为 HTTP，浏览器会拦截混合内容。请改用 https 代理，或本地用 http 访问前端。");
  }
  if (ep && ragflowChatLooksLikeDirectService(ep)) {
    extra.push(
      "浏览器通常无法直接访问 RAGFlow（跨域/CORS）。请在 `family-office-platform/proxy/` 启动本地代理，并在 `.env.local` 中将 `VITE_RAGFLOW_CHAT_ENDPOINT` 指向 `http://localhost:8787/api/ragflow/chat`，然后重启 `npm run dev`。",
    );
  } else if (ep.includes("8787") || ep.includes("/api/ragflow/chat")) {
    extra.push(
      "请确认已在本机运行代理：`cd family-office-platform/proxy` → `npm install` → `npm run dev`，并在浏览器打开 `http://localhost:8787/api/ragflow/health` 应返回 JSON。随后重启前端开发服务器以加载 `.env.local`。",
    );
  } else {
    extra.push("请确认该地址在本机可访问、未被防火墙拦截，且与前端同源策略不冲突。");
  }
  return [base, ...extra].join(" ");
}

/**
 * 仅保留在当前网页会话内（内存）：
 * - 不刷新页面时，项目间切换可保留左侧操作
 * - 刷新页面后自动清空
 */
const SESSION_CONVERSATION_CACHE: Record<string, SessionConversationState> = {};
function getCurrentDateTimeLabel() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `${date} ${time}`;
}

function extractRagflowAnswer(payload: unknown): string {
  if (typeof payload === "string") return payload.trim();
  if (!payload || typeof payload !== "object") return "";

  const obj = payload as Record<string, unknown>;
  const picks: unknown[] = [
    obj.answer,
    obj.response,
    obj.output,
    obj.message,
    (obj.data as Record<string, unknown> | undefined)?.answer,
    (obj.data as Record<string, unknown> | undefined)?.response,
    (obj.data as Record<string, unknown> | undefined)?.output,
    (obj.result as Record<string, unknown> | undefined)?.answer,
  ];

  for (const item of picks) {
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  return "";
}

function citationMarkerPrefix(id: string): string {
  if (id === "1") return "🟣";
  if (id === "2") return "🟢";
  if (id === "3") return "🔵";
  if (id === "4") return "🟡";
  return "⚪";
}

function formatCitationMarkers(
  text: string,
  map: Record<string, string> = {},
): string {
  let out = text.replace(/\[WEB\s*:\s*(\d+)\]/gu, "🌐[$1]");
  if (!out.includes("[ID:")) return out;
  return out
    .replace(/\[ID\s*:\s*(\d+)\]/gu, (_raw, id: string) => {
      const marker = `${citationMarkerPrefix(id)}`;
      const title = map[id];
      if (!title) return marker;
      return `[${marker}](cite:${id} "${title}")`;
    })
    .replace(/([)\]）】])(?=[🟣🟢🔵🟡⚪])/gu, "$1 ");
}

type UploadFileResult = {
  filename: string;
  parsed: boolean;
  chunks: number;
  pdfWarning?: string | null;
};

async function uploadSessionFilesToApi(
  _chatEndpoint: string,
  projectId: string,
  userId: string,
  conversationId: string,
  files: File[],
): Promise<UploadFileResult[]> {
  const results: UploadFileResult[] = [];
  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    form.append("userId", userId);
    form.append("scope", "session");
    form.append("conversationId", conversationId);
    form.append("relativePath", SESSION_UPLOAD_FOLDER);
    const res = await apiFetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      body: form,
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      filename?: string;
      parsed?: boolean;
      chunks?: number;
      pdfWarning?: string | null;
    };
    if (!res.ok) {
      throw new Error(payload.error || `上传失败（${res.status}）`);
    }
    results.push({
      filename: payload.filename ?? file.name,
      parsed: Boolean(payload.parsed),
      chunks: payload.chunks ?? 0,
      pdfWarning: payload.pdfWarning ?? null,
    });
  }
  return results;
}

function isGenericFileOnlyUserText(text: string): boolean {
  return /^已发送\s*\d+\s*个文件/u.test(text.trim());
}

function buildFileUploadApiMessage(fileNames: string[]): string {
  return `请阅读刚上传的项目资料并回答用户后续问题。附件：${fileNames.join("、")}`;
}

function withCurrentPreviewTime(conversation: SessionConversation): SessionConversation {
  return {
    ...conversation,
    updatedAt: getCurrentDateTimeLabel(),
  };
}

function buildConversationFromProject(
  projectId: string,
  projectOverride?: WorkspaceProject,
): SessionConversation | null {
  const project = projectOverride ?? getProjectById(projectId);
  if (!project) return null;
  return {
    id: `${projectId}-main`,
    projectId,
    title: `${project.name} · 全局分析`,
    preview: "尚未发送消息",
    updatedAt: getCurrentDateTimeLabel(),
    files: [],
    variant: "blank",
  };
}

function conversationPath(c: SessionConversation): string {
  return conversationRoutePath(c.projectId, c.id);
}

async function copyPlainTextToClipboard(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    await navigator.clipboard.writeText(trimmed);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = trimmed;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function MessageBubbleToolbar({
  copyText,
  onDeleteMessage,
  onQuoteMessage,
}: {
  copyText?: string;
  onDeleteMessage?: () => void;
  onQuoteMessage?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const canCopy = Boolean(copyText?.trim());
  if (!canCopy && !onDeleteMessage && !onQuoteMessage) return null;

  const handleCopy = () => {
    void copyPlainTextToClipboard(copyText ?? "").then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const actionBtnClass =
    "rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100";

  return (
    <div className="mt-2 flex shrink-0 flex-col gap-0.5">
      {onQuoteMessage ? (
        <button
          type="button"
          onClick={onQuoteMessage}
          className={cn(actionBtnClass, "hover:bg-muted/80 hover:text-foreground")}
          title="引用并回复"
          aria-label="引用并回复"
        >
          <Quote className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
      {canCopy ? (
        <button
          type="button"
          onClick={handleCopy}
          className={cn(actionBtnClass, "hover:bg-muted/80 hover:text-foreground")}
          title={copied ? "已复制" : "复制本条内容"}
          aria-label={copied ? "已复制" : "复制本条内容"}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
          )}
        </button>
      ) : null}
      {onDeleteMessage ? (
        <button
          type="button"
          onClick={onDeleteMessage}
          className={cn(actionBtnClass, "hover:bg-destructive/10 hover:text-destructive")}
          title="删除本条消息"
          aria-label="删除本条消息"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

/** 用户发出内容（文字 / 附件）共用 brand kit 酒红气泡 */
const USER_MESSAGE_SHELL = cn(
  "border border-[hsl(var(--wine-deep)/0.32)]",
  "bg-gradient-to-br from-[hsl(var(--wine-deep))] to-[hsl(353_42%_28%)]",
  "shadow-[0_8px_22px_-12px_hsl(var(--wine-deep)/0.42)]",
);

function UserBubble({
  children,
  time,
  copyText,
  onDeleteMessage,
  onQuoteMessage,
}: {
  children: ReactNode;
  time?: string;
  copyText?: string;
  onDeleteMessage?: () => void;
  onQuoteMessage?: () => void;
}) {
  const displayTime = formatBubbleTimeLabel(time);
  return (
    <div className="flex justify-end">
      <div className="group inline-flex flex-col items-end">
        <div className="flex items-start gap-1.5">
          <MessageBubbleToolbar
            copyText={copyText}
            onDeleteMessage={onDeleteMessage}
            onQuoteMessage={onQuoteMessage}
          />
          <div
            className={cn(
              "inline-block max-w-[32ch] sm:max-w-[42ch] rounded-3xl rounded-br-lg px-5 py-3 text-sm font-medium leading-relaxed text-wine-deep-foreground break-words whitespace-pre-line",
              USER_MESSAGE_SHELL,
              "transition-transform duration-300 hover:scale-[1.005]",
              "selection:bg-[hsl(var(--wine-muted))] selection:text-[hsl(var(--warm-charcoal))]",
            )}
          >
            {children}
          </div>
        </div>
        {displayTime ? (
          <span className="mt-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            {displayTime}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ChatThinkingBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/25 px-3 py-1.5",
        className,
      )}
    >
      <TypingLoader size="sm" className="[&>div]:bg-[hsl(var(--wine-deep)/0.7)]" />
      <span className="text-sm font-medium text-muted-foreground">{children}</span>
    </div>
  );
}

function ChatAgentStatusLine({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 whitespace-nowrap text-[11px] text-muted-foreground">{children}</p>
  );
}

function AiShell({
  children,
  time,
  copyText,
  onDeleteMessage,
  onQuoteMessage,
}: {
  children: ReactNode;
  time?: string;
  copyText?: string;
  onDeleteMessage?: () => void;
  onQuoteMessage?: () => void;
}) {
  const displayTime = formatBubbleTimeLabel(time);
  return (
    <div className="flex justify-start">
      <div className="group inline-flex flex-col items-start">
        <div className="flex items-start gap-1.5">
          <div
            className={cn(
              "max-w-[92%] rounded-3xl rounded-bl-lg border border-border/80 bg-white px-5 py-4 text-sm leading-relaxed text-foreground",
              "shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]",
              "selection:bg-[hsl(var(--wine-deep)/0.14)] selection:text-foreground",
            )}
          >
            {children}
          </div>
          <MessageBubbleToolbar
            copyText={copyText}
            onDeleteMessage={onDeleteMessage}
            onQuoteMessage={onQuoteMessage}
          />
        </div>
        {displayTime ? (
          <span className="mt-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            {displayTime}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function UploadSelectedFileIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} aria-hidden />;
  }
  if (lower.endsWith(".pdf")) {
    return <FileText className="h-4 w-4 shrink-0 text-rose-600" strokeWidth={2} aria-hidden />;
  }
  return <FileUp className="h-4 w-4 shrink-0 text-[hsl(var(--wine-deep))]" strokeWidth={2} aria-hidden />;
}

/** 对话内「已发送附件」：与用户气泡同色系（brand kit 酒红），仅展示文件名 */
function ChatSentFilesPanel({ files }: { files: readonly { name: string }[] }) {
  if (files.length === 0) return null;
  return (
    <div
      className={cn(
        "w-full max-w-[min(100%,28rem)] rounded-2xl rounded-br-lg px-4 py-3",
        USER_MESSAGE_SHELL,
      )}
    >
      <div className="mb-2.5 flex items-center gap-2 border-b border-wine-deep-foreground/15 pb-2">
        <Paperclip
          className="h-3.5 w-3.5 text-wine-deep-foreground/75"
          strokeWidth={2}
          aria-hidden
        />
        <span className="text-[11px] font-semibold tracking-wide text-wine-deep-foreground/80">
          已发送 {files.length} 个文件
        </span>
      </div>
      <div className="space-y-2">
        {files.map((f) => (
          <div
            key={f.name}
            className="flex items-center justify-between gap-2 rounded-xl border border-wine-deep-foreground/12 bg-black/[0.12] px-3 py-2.5"
          >
            <span className="truncate text-xs font-medium text-wine-deep-foreground">
              {f.name}
            </span>
            <span className="shrink-0 text-[10px] font-semibold text-wine-muted">已送达</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function permissionLineSidebar(role: WorkspaceRole): string {
  return roleLabelForProject(role);
}

export default function ConversationCenter() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId, conversationId } = useParams<{
    projectId: string;
    conversationId?: string;
  }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<WorkspaceUser | null>(null);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [conversations, setConversations] = useState<SessionConversation[]>([]);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [conversationFileRecords, setConversationFileRecords] = useState<
    ProjectFileRecord[]
  >([]);
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0);
  const [conversationFilesLoading, setConversationFilesLoading] = useState(false);
  const [deletingSessionFileId, setDeletingSessionFileId] = useState<string | null>(null);
  const conversationFilesMenuRef = useRef<HTMLDivElement>(null);
  const [chatSyncReady, setChatSyncReady] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  /** 引用某条消息后针对性回复 */
  const [quoteDraft, setQuoteDraft] = useState<{
    messageId: string;
    excerpt: string;
    from: "user" | "assistant";
  } | null>(null);
  /** 仅标记「当前会话」正在等同步 /api/chat 响应；深度任务用 pendingJobId，不占此项 */
  const [sendingConversationId, setSendingConversationId] = useState<string | null>(
    null,
  );
  const [liveMessagesByConversation, setLiveMessagesByConversation] = useState<
    Record<string, LiveChatMessage[]>
  >({});
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveCitationMap, setLiveCitationMap] = useState<Record<string, string>>({});
  const [newlyAddedConversationId, setNewlyAddedConversationId] = useState<string | null>(null);
  const [entryReady, setEntryReady] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const newConversationTimerRef = useRef<number | null>(null);
  const resumedAgentJobIdsRef = useRef<Set<string>>(new Set());
  const cancelledAgentJobPollsRef = useRef<Set<string>>(new Set());
  const chatSendAbortRef = useRef<AbortController | null>(null);
  const chatPersistTimerRef = useRef<number | null>(null);
  /** 云端 hydrate 后跳过首次自动 PUT，避免用未稳定 state 覆盖 D1 */
  const skipNextAutoPersistRef = useRef(false);
  /** 中文输入法组词中：Enter 仅确认上屏，不触发发送 */
  const chatImeComposingRef = useRef(false);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const persistSnapshotRef = useRef({
    conversations: [] as SessionConversation[],
    liveMessagesByConversation: {} as Record<string, LiveChatMessage[]>,
    isLiveAiMode: false,
  });
  const [chatSyncError, setChatSyncError] = useState<string | null>(null);

  useLayoutEffect(() => {
    resizeChatComposer(chatInputRef.current);
  }, [draftMessage]);

  useEffect(() => {
    const state = location.state as KnowledgeNetworkChatEntryState | null;
    const draft = state?.draftMessage?.trim();
    if (!draft) return;
    setDraftMessage(draft);
    navigate(location.pathname + location.search, { replace: true, state: null });
    requestAnimationFrame(() => chatInputRef.current?.focus());
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    const id = loadSessionUserId();
    if (!id) {
      Object.keys(SESSION_CONVERSATION_CACHE).forEach((k) => {
        delete SESSION_CONVERSATION_CACHE[k];
      });
      navigate("/app/login", { replace: true });
      return;
    }
    const u = getUserById(id);
    if (!u) {
      navigate("/app/login", { replace: true });
      return;
    }
    setUserId(id);
    setUser(u);
  }, [navigate]);

  useMyProjectRoles(userId); // 订阅角色缓存，管理端改权限后回前台会刷新

  useEffect(() => {
    return () => {
      if (newConversationTimerRef.current !== null) {
        window.clearTimeout(newConversationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldPlay = window.sessionStorage.getItem(CHAT_ENTRY_TRANSITION_KEY) === "1";
    if (!shouldPlay) return;
    window.sessionStorage.removeItem(CHAT_ENTRY_TRANSITION_KEY);
    const shouldReduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (shouldReduceMotion) {
      setEntryReady(true);
      return;
    }
    setEntryReady(false);
    window.requestAnimationFrame(() => setEntryReady(true));
  }, []);

  const [projectLookupDone, setProjectLookupDone] = useState(false);
  const [chatSessionProject, setChatSessionProject] = useState<WorkspaceProject | undefined>();
  const [apiProjectsTick, setApiProjectsTick] = useState(0);

  useEffect(() => subscribeApiProjects(() => setApiProjectsTick((n) => n + 1)), []);

  useEffect(() => {
    setChatSessionProject(undefined);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setProjectLookupDone(true);
      return;
    }
    if (getProjectById(projectId)) {
      setProjectLookupDone(true);
      return;
    }
    if (!ENABLE_LIVE_CHAT) {
      setProjectLookupDone(true);
      return;
    }
    let cancelled = false;
    setProjectLookupDone(false);
    void fetchProjectByIdFromApi(projectId)
      .then((row) => {
        if (cancelled) return;
        if (row) {
          upsertApiProject(row);
          setChatSessionProject(row);
        } else {
          setChatSessionProject(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) setProjectLookupDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, apiProjectsTick]);

  const project = projectId
    ? (getProjectById(projectId) ?? chatSessionProject)
    : undefined;

  const projectRole = useMemo(() => {
    if (!userId || !projectId) return null;
    return getProjectRole(userId, projectId, project?.createdBy);
  }, [userId, projectId, project?.createdBy, apiProjectsTick]);

  useEffect(() => {
    if (!userId || !projectId || !projectLookupDone) return;
    const p = getProjectById(projectId) ?? chatSessionProject;
    if (!p) {
      navigate("/app/projects", { replace: true });
      return;
    }
    if (getProjectRole(userId, projectId, p.createdBy) === "guest") {
      navigate("/app/projects", { replace: true });
      return;
    }
    if (getProjectRole(userId, projectId, p.createdBy) === "issuer") {
      navigate(`/app/collab/${projectId}`, { replace: true });
    }
  }, [
    userId,
    projectId,
    projectLookupDone,
    navigate,
    apiProjectsTick,
    chatSessionProject,
  ]);

  const permissionSidebarHint = projectRole ? permissionLineSidebar(projectRole) : "";

  const effectiveConversationId = useMemo(() => {
    if (!projectId) return "";
    return resolveConversationIdFromUrl(
      projectId,
      conversationId,
      liveMessagesByConversation,
    );
  }, [projectId, conversationId, liveMessagesByConversation]);

  const isLiveAiMode =
    ENABLE_LIVE_CHAT && Boolean(AI_CHAT_ENDPOINT) && projectRole !== "guest";

  useEffect(() => {
    if (!projectId || !project?.name || !isLiveAiMode) return;
    const expectedTitle = mainConversationTitle(project.name);
    setConversations((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (!isProjectMainConversation(c.id, projectId)) return c;
        if (c.title === expectedTitle) return c;
        changed = true;
        return { ...c, title: expectedTitle };
      });
      return changed ? next : prev;
    });
  }, [projectId, project?.name, isLiveAiMode]);

  const isCurrentConversationSending = Boolean(
    effectiveConversationId && sendingConversationId === effectiveConversationId,
  );

  const hasPendingAgentJobInThread = useMemo(() => {
    if (!effectiveConversationId) return false;
    const msgs = liveMessagesByConversation[effectiveConversationId] ?? [];
    return msgs.some((m) => m.role === "assistant" && Boolean(m.pendingJobId));
  }, [effectiveConversationId, liveMessagesByConversation]);

  const canStopCurrentTask =
    isLiveAiMode && (isCurrentConversationSending || hasPendingAgentJobInThread);

  useLayoutEffect(() => {
    persistSnapshotRef.current = {
      conversations,
      liveMessagesByConversation,
      isLiveAiMode,
    };
  }, [conversations, liveMessagesByConversation, isLiveAiMode]);

  const runChatPersist = useCallback(
    (options?: ChatPersistOptions) => {
      if (!userId || !chatSyncReady) return;
      const snap = persistSnapshotRef.current;
      const messageCount = Object.values(snap.liveMessagesByConversation).reduce(
        (n, arr) => n + (arr?.length ?? 0),
        0,
      );
      if (snap.conversations.length === 0 && messageCount === 0) return;
      const baseConvs = snap.isLiveAiMode
        ? reconcileConversationsWithMessages(
            snap.conversations,
            snap.liveMessagesByConversation,
          )
        : snap.conversations;
      const convsToSave = applyConversationMetadataFromMessages(
        baseConvs,
        snap.liveMessagesByConversation,
      );
      void persistChatStateForUser(
        userId,
        {
          conversations: convsToSave,
          messagesByConversation: snap.liveMessagesByConversation,
        },
        options,
      );
    },
    [userId, chatSyncReady],
  );

  const flushChatPersist = useCallback(
    (options?: ChatPersistOptions) => {
      if (chatPersistTimerRef.current) {
        window.clearTimeout(chatPersistTimerRef.current);
        chatPersistTimerRef.current = null;
      }
      // 等 React 提交 setState 后再读 snapshot（useLayoutEffect 已更新 ref）
      window.setTimeout(() => runChatPersist(options), 0);
    },
    [runChatPersist],
  );

  const scheduleChatPersist = useCallback(() => {
    if (!userId || !chatSyncReady) return;
    if (skipNextAutoPersistRef.current) {
      skipNextAutoPersistRef.current = false;
      return;
    }
    if (chatPersistTimerRef.current) {
      window.clearTimeout(chatPersistTimerRef.current);
    }
    chatPersistTimerRef.current = window.setTimeout(() => {
      chatPersistTimerRef.current = null;
      runChatPersist();
    }, CHAT_PERSIST_DEBOUNCE_MS);
  }, [userId, chatSyncReady, runChatPersist]);

  const activeConversation = useMemo(() => {
    if (!effectiveConversationId || !projectId) return null;
    const found = conversations.find((item) => item.id === effectiveConversationId);
    if (found) return found;
    if (!isLiveAiMode) return null;
    const built = buildConversationFromProject(projectId, project ?? undefined);
    if (!built) return null;
    return {
      ...built,
      id: effectiveConversationId,
      preview: "尚未发送消息",
      variant: "blank" as const,
    };
  }, [conversations, effectiveConversationId, projectId, isLiveAiMode]);

  const sidebarGroups = useMemo(
    () =>
      groupSidebarByProject(
        buildSidebarConversationList(
          conversations,
          liveMessagesByConversation,
          projectId,
        ),
        liveMessagesByConversation,
        isLiveAiMode,
      ),
    [conversations, liveMessagesByConversation, isLiveAiMode, projectId, apiProjectsTick],
  );

  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleProjectCollapsed = (pid: string) => {
    setCollapsedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setChatSyncReady(false);

    const bootstrap = async () => {
      const cacheKey = userId;

      skipNextAutoPersistRef.current = true;
      setChatSyncError(null);

      const remote = await loadChatStateForUser(userId);
      if (cancelled) return;

      const cached = SESSION_CONVERSATION_CACHE[cacheKey];

      if (remote) {
        const messagesByConversation = sortMessagesByConversation(
          remote.messagesByConversation,
        );
        setLiveMessagesByConversation(messagesByConversation);
        const next = mergeConversationsForBootstrap(
          remote.conversations,
          messagesByConversation,
          isLiveAiMode,
        );
        setConversations(next);
        SESSION_CONVERSATION_CACHE[cacheKey] = {
          conversations: next,
          messagesByConversation,
        };
        setChatSyncReady(true);
        return;
      }

      const cachedMsgs = sortMessagesByConversation(
        cached?.messagesByConversation ?? {},
      );
      const cachedMsgCount = Object.values(cachedMsgs).reduce(
        (n, arr) => n + (arr?.length ?? 0),
        0,
      );

      if (cached && (cached.conversations.length > 0 || cachedMsgCount > 0)) {
        setLiveMessagesByConversation(cachedMsgs);
        const next = mergeConversationsForBootstrap(
          cached.conversations,
          cachedMsgs,
          isLiveAiMode,
        );
        setConversations(next);
        setChatSyncError(
          "云端对话暂未能加载，已用本页会话缓存展示。请检查网络后刷新；勿在多标签同时编辑以免覆盖。",
        );
        setChatSyncReady(true);
        return;
      }

      setLiveMessagesByConversation({});
      const next = mergeConversationsForBootstrap([], {}, isLiveAiMode);
      setConversations(next);
      SESSION_CONVERSATION_CACHE[cacheKey] = {
        conversations: next,
        messagesByConversation: {},
      };
      if (isLiveAiMode) {
        setChatSyncError("云端对话加载失败，请稍后刷新页面。");
      }
      setChatSyncReady(true);
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [userId, isLiveAiMode]);

  /** 项目列表就绪后，从 messages 键补全会话元数据（首屏 API 未返回时 infer 可能失败） */
  useEffect(() => {
    if (!chatSyncReady) return;
    setConversations((prev) => {
      const next = mergeConversationsForBootstrap(
        prev,
        liveMessagesByConversation,
        isLiveAiMode,
        projectId,
      );
      const prevIds = new Set(prev.map((c) => c.id));
      if (next.length === prev.length && next.every((c) => prevIds.has(c.id))) return prev;
      return next;
    });
  }, [apiProjectsTick, chatSyncReady, isLiveAiMode, projectId]);

  /** 裸 `/chat/:projectId` 时，自动跳到带 conversationId 的 canonical URL */
  useEffect(() => {
    if (!projectId || !chatSyncReady) return;
    if (hasConversationIdInUrl(conversationId)) return;

    const picked = pickConversationIdForProject(
      projectId,
      liveMessagesByConversation,
    );
    navigate(conversationRoutePath(projectId, picked), { replace: true });
  }, [
    projectId,
    conversationId,
    chatSyncReady,
    liveMessagesByConversation,
    navigate,
  ]);

  useEffect(() => {
    if (!userId || !chatSyncReady) return;
    SESSION_CONVERSATION_CACHE[userId] = {
      conversations,
      messagesByConversation: liveMessagesByConversation,
    };
    scheduleChatPersist();
    return () => {
      if (chatPersistTimerRef.current) {
        window.clearTimeout(chatPersistTimerRef.current);
      }
    };
  }, [
    userId,
    chatSyncReady,
    conversations,
    liveMessagesByConversation,
    isLiveAiMode,
    scheduleChatPersist,
  ]);

  /** 切换侧边对话或路由会话时清空本地「待发送」附件，避免上方气泡已发出、底下仍挂着同一批待发送 */
  useEffect(() => {
    setSelectedFiles([]);
    setShowUploadPanel(false);
    setQuoteDraft(null);
  }, [effectiveConversationId]);

  const deleteLiveMessage = useCallback(
    (messageId: string) => {
      if (!userId || !effectiveConversationId) return;
      if (
        !window.confirm(
          "确定删除本条消息？所有设备将不再显示；运维审计日志仍会保留全文（含 AI 回复）。",
        )
      ) {
        return;
      }
      const convId = effectiveConversationId;
      const nextList = (liveMessagesByConversation[convId] ?? []).filter(
        (m) => m.id !== messageId,
      );
      const nextMessages = {
        ...liveMessagesByConversation,
        [convId]: nextList,
      };
      skipNextAutoPersistRef.current = true;
      setLiveMessagesByConversation(nextMessages);
      SESSION_CONVERSATION_CACHE[userId] = {
        conversations,
        messagesByConversation: nextMessages,
      };
      flushChatPersist({
        deletedMessageIds: [{ conversationId: convId, messageId }],
      });
    },
    [
      userId,
      effectiveConversationId,
      liveMessagesByConversation,
      conversations,
      flushChatPersist,
    ],
  );

  const quoteLiveMessage = useCallback(
    (messageId: string, raw: string, from: "user" | "assistant") => {
      const excerpt = raw.replace(/\s+/gu, " ").trim().slice(0, 280);
      if (!excerpt) return;
      setQuoteDraft({ messageId, excerpt, from });
      requestAnimationFrame(() => chatInputRef.current?.focus());
    },
    [],
  );

  const liveMessages = useMemo(() => {
    if (!effectiveConversationId) return EMPTY_LIVE_CHAT_MESSAGES;
    const raw = liveMessagesByConversation[effectiveConversationId] ?? EMPTY_LIVE_CHAT_MESSAGES;
    return sortMessagesChronologically(raw);
  }, [effectiveConversationId, liveMessagesByConversation]);

  const hasStreamingAssistantInThread = liveMessages.some((m) => m.isStreaming);

  useLayoutEffect(() => {
    const root = chatScrollRef.current;
    if (!root) return;
    const run = () => {
      root.scrollTop = root.scrollHeight;
    };
    run();
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
  }, [
    effectiveConversationId,
    liveMessages,
    isCurrentConversationSending,
    hasStreamingAssistantInThread,
    showUploadPanel,
  ]);

  useEffect(() => {
    if (!isLiveAiMode || !AI_CHAT_ENDPOINT || !projectId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await apiFetch(`/api/projects/${projectId}/citations`);
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { map?: Record<string, string> };
        if (data.map && Object.keys(data.map).length > 0) {
          setLiveCitationMap(data.map);
        }
      } catch {
        /* 无 citations 接口时沿用本轮已拉取的映射 */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isLiveAiMode, projectId, AI_CHAT_ENDPOINT]);

  const sessionMessageFilenames = useMemo(() => {
    const msgs = liveMessagesByConversation[effectiveConversationId] ?? [];
    const names = new Set<string>();
    for (const m of msgs) {
      for (const f of m.files ?? []) {
        if (f.name?.trim()) names.add(f.name.trim());
      }
    }
    return names;
  }, [liveMessagesByConversation, effectiveConversationId]);

  useEffect(() => {
    if (!isLiveAiMode || !AI_CHAT_ENDPOINT || !projectId || !effectiveConversationId || !userId) {
      setConversationFileRecords([]);
      setConversationFilesLoading(false);
      return;
    }
    let cancelled = false;
    setConversationFilesLoading(true);
    const run = async () => {
      try {
        const all = await fetchProjectFiles(projectId, userId);
        if (cancelled) return;
        const session = filterConversationSessionFiles(
          all,
          effectiveConversationId,
          sessionMessageFilenames,
        );
        // 同名也全部列出（本对话附件各自独立，不做按名去重）
        setConversationFileRecords(
          [...session].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      } catch {
        if (!cancelled) setConversationFileRecords([]);
      } finally {
        if (!cancelled) setConversationFilesLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    isLiveAiMode,
    projectId,
    userId,
    effectiveConversationId,
    fileTreeRefreshKey,
    AI_CHAT_ENDPOINT,
    sessionMessageFilenames,
  ]);

  const conversationFileTreeItems = useMemo(() => {
    if (isLiveAiMode) {
      return conversationFileRecords.map((f) => ({
        key: f.id,
        documentId: f.id,
        fileConversationId: f.conversationId ?? effectiveConversationId,
        name: f.filename,
        meta: `${f.chunkCount} 段 · ${new Date(f.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
        canDelete: true,
      }));
    }
    return (activeConversation?.files ?? []).map((name) => ({
      key: name,
      documentId: undefined as string | undefined,
      fileConversationId: undefined as string | undefined,
      name,
      meta: undefined as string | undefined,
      canDelete: false,
    }));
  }, [
    isLiveAiMode,
    conversationFileRecords,
    activeConversation,
    effectiveConversationId,
  ]);

  const handleDeleteSessionFile = useCallback(
    async (
      documentId: string,
      filename: string,
      fileConversationId?: string | null,
    ) => {
      if (!projectId || !userId || !effectiveConversationId || !isLiveAiMode) return;
      const ok = window.confirm(
        `确定从本对话中删除「${filename}」？\n删除后检索将不再包含该附件，且无法恢复。`,
      );
      if (!ok) return;
      setDeletingSessionFileId(documentId);
      setLiveError(null);
      try {
        await deleteProjectFile(
          projectId,
          documentId,
          userId,
          AI_CHAT_ENDPOINT,
          fileConversationId?.trim() || effectiveConversationId,
        );
        setConversationFileRecords((prev) => prev.filter((f) => f.id !== documentId));
        setConversations((prev) =>
          prev.map((c) =>
            c.id === effectiveConversationId
              ? { ...c, files: c.files.filter((n) => n !== filename) }
              : c,
          ),
        );
        setFileTreeRefreshKey((k) => k + 1);
      } catch (e) {
        setLiveError(e instanceof Error ? e.message : String(e));
      } finally {
        setDeletingSessionFileId(null);
      }
    },
    [projectId, userId, effectiveConversationId, isLiveAiMode],
  );

  useEffect(() => {
    if (!showHistoryMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = conversationFilesMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setShowHistoryMenu(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showHistoryMenu]);

  useEffect(() => {
    if (!isLiveAiMode || !AI_CHAT_ENDPOINT) return;
    const healthUrl = buildApiHealthProbeUrl(AI_CHAT_ENDPOINT);
    if (!healthUrl) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(healthUrl, { method: "GET" });
        if (cancelled) return;
        if (!res.ok) {
          setLiveError(
            `无法连接 AI 接口（健康检查 ${res.status}）。请确认 API 已部署，且已配置 VITE_AI_CHAT_ENDPOINT。`,
          );
          return;
        }
        setLiveError((prev) =>
          prev &&
          (prev.includes("无法连接 AI 接口") ||
            prev.includes("Failed to fetch（健康检查）"))
            ? null
            : prev,
        );
      } catch {
        if (cancelled) return;
        setLiveError(
          formatRagflowRequestError("Failed to fetch（健康检查）", healthUrl),
        );
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isLiveAiMode, AI_CHAT_ENDPOINT]);

  useEffect(() => {
    if (!projectId || !userId || !chatSyncReady) return;
    if (!conversationId) return;

    const id = conversationId.trim();
    if (!conversationBelongsToProject(id, projectId)) {
      const picked = pickConversationIdForProject(
        projectId,
        liveMessagesByConversation,
      );
      navigate(conversationRoutePath(projectId, picked), { replace: true });
      return;
    }

    const inList = conversations.some((c) => c.id === id);
    if (!inList && project) {
      const msgs = liveMessagesByConversation[id];
      const hasMsgs = Array.isArray(msgs) && msgs.length > 0;
      setConversations((prev) => {
        if (prev.some((c) => c.id === id)) return prev;
        const isBlank = isBlankConversationId(projectId, id);
        const builtMain = buildConversationFromProject(projectId, project);
        if (!isBlank && !builtMain) return prev;
        return [
          {
            ...(isBlank
              ? buildBlankSessionConversation(projectId, id, project.name)
              : { ...builtMain!, id }),
            preview: hasMsgs ? topicFromFirstUserMessage(msgs) : "尚未发送消息",
            updatedAt: hasMsgs
              ? latestMessageTimeLabel(msgs) || getCurrentDateTimeLabel()
              : getCurrentDateTimeLabel(),
            variant: hasMsgs && !isBlank ? undefined : ("blank" as const),
          },
          ...prev,
        ];
      });
      return;
    }

    if (conversations.length === 0) return;
    if (!inList) {
      // URL 已指向合法会话时勿抢跳到其它线程（例如项目元数据尚未载入）
      if (conversationBelongsToProject(id, projectId)) return;
      const picked = pickConversationIdForProject(
        projectId,
        liveMessagesByConversation,
      );
      navigate(conversationRoutePath(projectId, picked), { replace: true });
    }
  }, [
    projectId,
    conversationId,
    conversations,
    userId,
    chatSyncReady,
    liveMessagesByConversation,
    project,
    navigate,
  ]);

  useEffect(() => {
    setShowHistoryMenu(false);
    setLiveError(null);
  }, [projectId]);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSelectedFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
      const merged = [...prev];
      Array.from(files).forEach((f) => {
        const key = `${f.name}-${f.size}-${f.lastModified}`;
        if (!seen.has(key)) merged.push(f);
      });
      return merged;
    });
    setShowUploadPanel(true);
  };

  const removeFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const appendLiveMessage = (conversationKey: string, message: LiveChatMessage) => {
    setLiveMessagesByConversation((prev) => ({
      ...prev,
      [conversationKey]: appendMessageWithSortIndex(prev[conversationKey] ?? [], message),
    }));
  };

  const updateLiveMessage = (
    conversationKey: string,
    messageId: string,
    patch: Partial<LiveChatMessage>,
  ) => {
    setLiveMessagesByConversation((prev) => ({
      ...prev,
      [conversationKey]: (prev[conversationKey] ?? []).map((m) =>
        m.id === messageId ? { ...m, ...patch } : m,
      ),
    }));
  };

  /** 刷新页面后恢复未完成的 Hermes 异步任务轮询 */
  useEffect(() => {
    if (!userId || !chatSyncReady || !isLiveAiMode || !AI_CHAT_ENDPOINT) return;
    const citationMap = { ...liveCitationMap };
    for (const [conversationKey, messages] of Object.entries(liveMessagesByConversation)) {
      for (const m of messages) {
        if (m.role !== "assistant" || !m.pendingJobId) continue;
        if (resumedAgentJobIdsRef.current.has(m.pendingJobId)) continue;
        resumedAgentJobIdsRef.current.add(m.pendingJobId);
        void pollAgentJobUntilDone({
          userId,
          jobId: m.pendingJobId,
          conversationKey,
          assistantMsgId: m.id,
          citationMap,
          shouldAbort: () => cancelledAgentJobPollsRef.current.has(m.pendingJobId!),
          onUpdate: updateLiveMessage,
          onError: setLiveError,
          onPersist: () => flushChatPersist(),
        });
      }
    }
  }, [
    userId,
    chatSyncReady,
    isLiveAiMode,
    AI_CHAT_ENDPOINT,
    liveMessagesByConversation,
    liveCitationMap,
    flushChatPersist,
  ]);

  const registerLiveChatActivity = () => {
    if (!projectId || !effectiveConversationId || !isLiveAiMode) return;
    saveLastChatProjectId(projectId);
    setConversations((prev) => {
      if (prev.some((c) => c.id === effectiveConversationId)) return prev;
      const built = buildConversationFromProject(projectId, project ?? undefined);
      if (!built) return prev;
      return [
        withCurrentPreviewTime({
          ...built,
          id: effectiveConversationId,
          preview: "对话进行中",
          variant: "blank",
        }),
        ...prev,
      ];
    });
  };

  const updateConversationPreview = (preview?: string, fileNames: string[] = []) => {
    setConversations((prev) =>
      prev.map((t) =>
        t.id === effectiveConversationId
          ? {
              ...t,
              files:
                fileNames.length > 0
                  ? Array.from(new Set([...t.files, ...fileNames]))
                  : t.files,
              ...(preview !== undefined ? { preview } : {}),
              updatedAt:
                latestMessageTimeLabel(
                  liveMessagesByConversation[effectiveConversationId],
                ) || getCurrentDateTimeLabel(),
            }
          : t
      )
    );
  };

  const deleteConversation = (target: SessionConversation) => {
    if (!userId) return;
    const label = projectDisplayName(target.projectId);
    if (
      !window.confirm(
        `确定删除「${label}」下的这条对话记录？删除后无法恢复。`,
      )
    ) {
      return;
    }

    const nextMessages = { ...liveMessagesByConversation };
    delete nextMessages[target.id];
    const nextConversations = conversations.filter((c) => c.id !== target.id);

    skipNextAutoPersistRef.current = true;
    SESSION_CONVERSATION_CACHE[userId] = {
      conversations: nextConversations,
      messagesByConversation: nextMessages,
    };
    setConversations(nextConversations);
    setLiveMessagesByConversation(nextMessages);

    void persistChatStateForUser(
      userId,
      {
        conversations: nextConversations,
        messagesByConversation: nextMessages,
      },
      { deletedConversationIds: [target.id], skipMerge: true },
    );

    if (
      target.id === effectiveConversationId &&
      target.projectId === projectId
    ) {
      const sameProject = nextConversations.filter(
        (c) =>
          c.projectId === projectId &&
          Array.isArray(nextMessages[c.id]) &&
          nextMessages[c.id].length > 0,
      );
      if (sameProject[0]) {
        navigate(conversationPath(sameProject[0]), { replace: true });
        return;
      }
      const anyOther = nextConversations.find(
        (c) =>
          Array.isArray(nextMessages[c.id]) && nextMessages[c.id].length > 0,
      );
      if (anyOther) {
        navigate(conversationPath(anyOther), { replace: true });
        return;
      }
      if (projectId) {
        navigate(conversationRoutePath(projectId, `${projectId}-main`), {
          replace: true,
        });
      }
    }
  };

  const handleStopCurrentTask = async () => {
    if (!effectiveConversationId || !userId || !AI_CHAT_ENDPOINT) return;

    if (isCurrentConversationSending && chatSendAbortRef.current) {
      chatSendAbortRef.current.abort();
      chatSendAbortRef.current = null;
      setSendingConversationId((cur) =>
        cur === effectiveConversationId ? null : cur,
      );
      return;
    }

    const msgs = liveMessagesByConversation[effectiveConversationId] ?? [];
    const pending = [...msgs]
      .reverse()
      .find((m) => m.role === "assistant" && m.pendingJobId);
    if (!pending?.pendingJobId) return;

    const jobId = pending.pendingJobId;
    const assistantMsgId = pending.id;
    cancelledAgentJobPollsRef.current.add(jobId);

    const result = await cancelAgentJobRemote(userId, jobId, AI_CHAT_ENDPOINT);
    if (!result.ok) {
      cancelledAgentJobPollsRef.current.delete(jobId);
      setLiveError(result.error ?? "取消任务失败，请稍后重试");
      return;
    }

    setLiveError(null);
    updateLiveMessage(effectiveConversationId, assistantMsgId, {
      content: "深度分析已取消：用户取消",
      pendingJobId: undefined,
      jobProgressLabel: undefined,
      isStreaming: false,
      streamStatusLabel: undefined,
    });
    flushChatPersist();
  };

  const handleSend = async () => {
    if (!projectId) return;
    const trimmed = draftMessage.trim();
    const fileNames = selectedFiles.map((f) => f.name);

    if (!isLiveAiMode) {
      if (trimmed && fileNames.length === 0) {
        const hint = AI_CHAT_ENDPOINT
          ? "真 AI 未开启：请在 GitHub Actions Secrets 设置 VITE_ENABLE_LIVE_CHAT=1，并重新部署 Pages 后强刷页面（Ctrl+F5）。"
          : "真 AI 未配置：请在 GitHub Actions Secrets 添加 VITE_ENABLE_LIVE_CHAT=1 与 VITE_AI_CHAT_ENDPOINT（Worker 的 /api/chat 地址），并重新部署 Pages。";
        setLiveError(hint);
        return;
      }
      if (fileNames.length === 0) return;
      return;
    }

    if (
      !effectiveConversationId ||
      (!trimmed && fileNames.length === 0) ||
      isCurrentConversationSending
    ) {
      return;
    }

    registerLiveChatActivity();

    setLiveError(null);
    const filesToUpload = [...selectedFiles];
    const quotePrefix = quoteDraft
      ? `【引用${quoteDraft.from === "assistant" ? "助手" : "我"}的消息】\n> ${quoteDraft.excerpt}\n\n`
      : "";
    const displayText =
      quotePrefix +
      (trimmed ||
        (fileNames.length > 0 ? `已发送 ${fileNames.length} 个文件` : ""));
    const apiMessage =
      quotePrefix +
      (trimmed ||
        (fileNames.length > 0 ? buildFileUploadApiMessage(fileNames) : ""));

    const userMsgId = `user-${Date.now()}`;

    const priorUserCount = (
      liveMessagesByConversation[effectiveConversationId] ?? []
    ).filter((m) => m.role === "user").length;
    const isFirstUserTurn = priorUserCount === 0;

    if (isLiveAiMode && project && !conversations.some((c) => c.id === effectiveConversationId)) {
      const blankConv = buildBlankSessionConversation(
        projectId,
        effectiveConversationId,
        project.name,
      );
      setConversations((prev) => [blankConv, ...prev.filter((c) => c.id !== effectiveConversationId)]);
    }

    appendLiveMessage(effectiveConversationId, {
      id: userMsgId,
      role: "user",
      content: displayText,
      files: fileNames.length > 0 ? fileNames.map((name) => ({ name })) : undefined,
      time: getCurrentDateTimeLabel(),
    });
    setQuoteDraft(null);
    if (isFirstUserTurn) {
      updateConversationPreview(
        deriveConversationTopicHeuristic(apiMessage || displayText),
        fileNames,
      );
    } else {
      updateConversationPreview(undefined, fileNames);
    }
    setDraftMessage("");
    setSelectedFiles([]);
    setShowUploadPanel(false);

    if (!AI_CHAT_ENDPOINT) {
      const msg =
        "尚未配置 AI 接口。请在 `.env.local` 中设置 VITE_AI_CHAT_ENDPOINT（JFO API /api/chat）。";
      setLiveError(msg);
      appendLiveMessage(effectiveConversationId, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: msg,
        time: getCurrentDateTimeLabel(),
      });
      return;
    }

    if (!userId) return;

    const sendConversationId = effectiveConversationId;
    let streamAssistantId: string | null = null;
    let streamAccumulated = "";
    let mergedCitationMap: Record<string, string> = {
      ...liveCitationMap,
    };
    setSendingConversationId(sendConversationId);
    const sendAbort = new AbortController();
    chatSendAbortRef.current = sendAbort;
    try {
      let uploadNotes = "";
      if (filesToUpload.length > 0) {
        const uploaded = await uploadSessionFilesToApi(
          AI_CHAT_ENDPOINT,
          projectId,
          userId!,
          effectiveConversationId,
          filesToUpload,
        );
        const warnings = uploaded
          .filter((u) => u.pdfWarning || !u.parsed || u.chunks === 0)
          .map((u) => {
            if (u.pdfWarning) return `${u.filename}：${u.pdfWarning}`;
            if (!u.parsed || u.chunks === 0) {
              return `${u.filename}：未解析出可检索正文，建议改传 .txt/.md 或可选中文字的 PDF`;
            }
            return "";
          })
          .filter(Boolean);
        if (warnings.length > 0) {
          uploadNotes = `\n\n【上传提示】\n${warnings.join("\n")}`;
          setLiveError(warnings[0]);
        }
        setFileTreeRefreshKey((k) => k + 1);
      }

      const history = liveMessages.map((m) => ({ role: m.role, content: m.content }));
      const requestBody =
        RAGFLOW_MODE === "native"
          ? {
              question: apiMessage,
              stream: false,
              user_id: userId,
            }
          : RAGFLOW_MODE === "openai"
            ? {
                stream: false,
                model: "qwen-plus",
                messages: [...history, { role: "user", content: apiMessage }],
              }
            : {
                projectId,
                conversationId: effectiveConversationId,
                userId,
                role: projectRole,
                message: apiMessage,
                files: fileNames,
                history,
                stream: true,
              };

      const deepSkill = isDeepSkillMessage(apiMessage);
      const useWorkerJson =
        RAGFLOW_MODE !== "native" &&
        RAGFLOW_MODE !== "openai" &&
        Boolean(requestBody && typeof requestBody === "object" && "projectId" in requestBody);
      const useWorkerStream = useWorkerJson && !deepSkill;

      if (useWorkerStream) {
        streamAssistantId = `assistant-${Date.now()}`;
        setLiveError(null);
        appendLiveMessage(effectiveConversationId, {
          id: streamAssistantId,
          role: "assistant",
          content: "",
          time: getCurrentDateTimeLabel(),
          isStreaming: true,
        });
      } else if (deepSkill && useWorkerJson) {
        streamAssistantId = `assistant-${Date.now()}`;
        setLiveError(null);
        appendLiveMessage(effectiveConversationId, {
          id: streamAssistantId,
          role: "assistant",
          content: "",
          time: getCurrentDateTimeLabel(),
          isStreaming: true,
          streamStatusLabel: "正在提交任务…",
        });
      }

      const token = loadSessionToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      else if (RAGFLOW_API_KEY) headers.Authorization = `Bearer ${RAGFLOW_API_KEY}`;
      const res = await fetch(AI_CHAT_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: sendAbort.signal,
      });

      mergedCitationMap = {
        ...liveCitationMap,
      };

      if (
        useWorkerStream &&
        streamAssistantId &&
        (res.headers.get("Content-Type") ?? "").includes("text/event-stream")
      ) {
        const assistantId = streamAssistantId;

        let streamPayload: {
          async?: boolean;
          jobId?: string;
          assistantMessageId?: string;
          answer?: string;
          truncated?: boolean;
        } | null = null;
        streamAccumulated = "";

        await consumeChatSse(res, {
          onMeta: (meta) => {
            if (meta.citationMap && Object.keys(meta.citationMap).length > 0) {
              mergedCitationMap = { ...mergedCitationMap, ...meta.citationMap };
              setLiveCitationMap((prev) => ({ ...prev, ...meta.citationMap! }));
            }
            const topic = meta.conversationTopic?.trim();
            if (topic) updateConversationPreview(topic);
          },
          onStatus: (label) => {
            updateLiveMessage(effectiveConversationId, assistantId, {
              streamStatusLabel: productizeStreamStatusLabel(label),
            });
          },
          onDelta: (text) => {
            streamAccumulated += text;
            setLiveMessagesByConversation((prev) => ({
              ...prev,
              [effectiveConversationId]: (prev[effectiveConversationId] ?? []).map((m) =>
                m.id === assistantId ? { ...m, content: `${m.content}${text}` } : m,
              ),
            }));
          },
          onDone: (done) => {
            streamPayload = {
              answer: done.answer,
              truncated: done.truncated,
              ...(done.knowledgeNetworkHtml ? { knowledgeNetworkHtml: done.knowledgeNetworkHtml } : {}),
            };
          },
          onError: (msg) => {
            throw new Error(msg);
          },
        });

        const payload = streamPayload as Record<string, unknown> | null;
        if (
          payload &&
          payload.async === true &&
          typeof payload.jobId === "string"
        ) {
          const jobId = payload.jobId as string;
          const assistantIdJob =
            typeof payload.assistantMessageId === "string"
              ? payload.assistantMessageId
              : `assistant-job-${jobId}`;
          const placeholderAnswer = formatCitationMarkers(
            productizeKnJobSubmitContent(
              String(payload.answer ?? "正在生成，请稍候…"),
            ),
            mergedCitationMap,
          );
          setLiveMessagesByConversation((prev) => ({
            ...prev,
            [effectiveConversationId]: mergeAsyncAgentJobIntoConversation(
              prev[effectiveConversationId] ?? [],
              {
                jobId,
                ephemeralUserMessageId: userMsgId,
                ephemeralAssistantMessageId: assistantId,
                assistantContent: placeholderAnswer,
                timeLabel: getCurrentDateTimeLabel(),
              },
            ),
          }));
          resumedAgentJobIdsRef.current.add(jobId);
          void pollAgentJobUntilDone({
            userId,
            jobId,
            conversationKey: effectiveConversationId,
            assistantMsgId: assistantIdJob,
            citationMap: mergedCitationMap,
            shouldAbort: () => cancelledAgentJobPollsRef.current.has(jobId),
            onUpdate: updateLiveMessage,
            onError: setLiveError,
            onPersist: () => flushChatPersist(),
          });
          flushChatPersist();
          return;
        }

        let rawAnswer =
          (payload && typeof payload.answer === "string" ? payload.answer : "") ||
          "已收到消息，但未返回可展示答案。";
        if (payload?.truncated === true) {
          rawAnswer += STREAM_TRUNCATED_FOOTER;
          setLiveError("模型输出因上游超时提前结束，已保留上文内容。");
        }
        const answer = formatCitationMarkers(rawAnswer + uploadNotes, mergedCitationMap);
        const knFromApi =
          payload && typeof payload.knowledgeNetworkHtml === "string"
            ? payload.knowledgeNetworkHtml
            : null;
        const prepared = prepareKnowledgeNetworkMessageDisplay(answer, knFromApi);
        const knVerStream =
          payload &&
          typeof payload === "object" &&
          typeof (payload as { projectKnowledgeNetworkVersion?: unknown })
            .projectKnowledgeNetworkVersion === "number"
            ? (payload as { projectKnowledgeNetworkVersion: number })
                .projectKnowledgeNetworkVersion
            : undefined;
        updateLiveMessage(effectiveConversationId, assistantId, {
          content: prepared.displayContent,
          knowledgeNetworkHtml: prepared.html || undefined,
          projectKnowledgeNetworkVersion: knVerStream,
          isStreaming: false,
          streamStatusLabel: undefined,
        });
        flushChatPersist();
        return;
      }

      const payload: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const bodyAnswer =
          payload && typeof payload === "object" && "answer" in payload
            ? String((payload as { answer?: string }).answer ?? "")
            : "";
        const bodyError =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: string }).error ?? "")
            : "";
        throw new Error(
          bodyAnswer.trim() || bodyError.trim() || `AI 接口返回 ${res.status}`,
        );
      }
      const citationFromApi =
        payload && typeof payload === "object" && "citationMap" in payload
          ? (payload as { citationMap?: Record<string, string> }).citationMap
          : undefined;
      mergedCitationMap = {
        ...mergedCitationMap,
        ...citationFromApi,
      };
      if (citationFromApi && Object.keys(citationFromApi).length > 0) {
        setLiveCitationMap((prev) => ({ ...prev, ...citationFromApi }));
      }

      const topicFromApi =
        payload && typeof payload === "object" && "conversationTopic" in payload
          ? String((payload as { conversationTopic?: string }).conversationTopic ?? "").trim()
          : "";
      if (topicFromApi) updateConversationPreview(topicFromApi);

      const isAsyncJob =
        payload &&
        typeof payload === "object" &&
        (payload as { async?: boolean }).async === true &&
        typeof (payload as { jobId?: unknown }).jobId === "string";

      if (isAsyncJob) {
        const jobId = (payload as { jobId: string }).jobId;
        const assistantId =
          typeof (payload as { assistantMessageId?: unknown }).assistantMessageId ===
          "string"
            ? (payload as { assistantMessageId: string }).assistantMessageId
            : `assistant-job-${jobId}`;
        const placeholderAnswer = formatCitationMarkers(
          productizeKnJobSubmitContent(
            String((payload as { answer?: string }).answer ?? "正在生成，请稍候…"),
          ),
          mergedCitationMap,
        );
        setLiveError(null);
        setLiveMessagesByConversation((prev) => ({
          ...prev,
          [effectiveConversationId]: mergeAsyncAgentJobIntoConversation(
            prev[effectiveConversationId] ?? [],
            {
              jobId,
              ephemeralUserMessageId: userMsgId,
              ephemeralAssistantMessageId: streamAssistantId ?? undefined,
              assistantContent: placeholderAnswer,
              timeLabel: getCurrentDateTimeLabel(),
            },
          ),
        }));
        resumedAgentJobIdsRef.current.add(jobId);
        void pollAgentJobUntilDone({
          userId,
          jobId,
          conversationKey: effectiveConversationId,
          assistantMsgId: assistantId,
          citationMap: mergedCitationMap,
          shouldAbort: () => cancelledAgentJobPollsRef.current.has(jobId),
          onUpdate: updateLiveMessage,
          onError: setLiveError,
          onPersist: () => flushChatPersist(),
        });
        flushChatPersist();
        return;
      }

      const rawAnswer = extractRagflowAnswer(payload) || "已收到消息，但未返回可展示答案。";
      const answer = formatCitationMarkers(rawAnswer + uploadNotes, mergedCitationMap);
      const knFromApi =
        payload &&
        typeof payload === "object" &&
        typeof (payload as { knowledgeNetworkHtml?: unknown }).knowledgeNetworkHtml ===
          "string"
          ? (payload as { knowledgeNetworkHtml: string }).knowledgeNetworkHtml
          : null;
      const prepared = prepareKnowledgeNetworkMessageDisplay(answer, knFromApi);
      const knVerJson =
        payload &&
        typeof payload === "object" &&
        typeof (payload as { projectKnowledgeNetworkVersion?: unknown })
          .projectKnowledgeNetworkVersion === "number"
          ? (payload as { projectKnowledgeNetworkVersion: number })
              .projectKnowledgeNetworkVersion
          : undefined;
      setLiveError(null);
      if (streamAssistantId) {
        updateLiveMessage(effectiveConversationId, streamAssistantId, {
          content: prepared.displayContent,
          knowledgeNetworkHtml: prepared.html || undefined,
          projectKnowledgeNetworkVersion: knVerJson,
          isStreaming: false,
          streamStatusLabel: undefined,
        });
      } else {
        appendLiveMessage(effectiveConversationId, {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: prepared.displayContent,
          time: getCurrentDateTimeLabel(),
          knowledgeNetworkHtml: prepared.html || undefined,
          projectKnowledgeNetworkVersion: knVerJson,
        });
      }
      flushChatPersist();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      const raw =
        error instanceof Error ? error.message : "未知错误";
      const errMsg = formatRagflowRequestError(raw, AI_CHAT_ENDPOINT);
      const partialStream =
        streamAssistantId &&
        streamAccumulated.trim().length > 80 &&
        isStreamDisconnectError(raw);
      if (partialStream) {
        setLiveError("生成过程中网络中断，已保留上文内容。");
        updateLiveMessage(effectiveConversationId, streamAssistantId!, {
          content: formatCitationMarkers(
            streamAccumulated + STREAM_TRUNCATED_FOOTER,
            mergedCitationMap,
          ),
          isStreaming: false,
          streamStatusLabel: undefined,
        });
        flushChatPersist();
      } else {
        setLiveError(errMsg);
        if (streamAssistantId) {
          updateLiveMessage(effectiveConversationId, streamAssistantId, {
            content: errMsg,
            isStreaming: false,
            streamStatusLabel: undefined,
          });
        } else {
          appendLiveMessage(effectiveConversationId, {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: errMsg,
            time: getCurrentDateTimeLabel(),
          });
        }
      }
    } finally {
      chatSendAbortRef.current = null;
      setSendingConversationId((cur) =>
        cur === sendConversationId ? null : cur,
      );
    }
  };

  if (!user || !userId || !projectRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        加载中…
      </div>
    );
  }

  if (!projectId || projectRole === "guest") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        正在跳转项目总览…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        {projectLookupDone ? "正在跳转项目总览…" : "正在加载项目…"}
      </div>
    );
  }

  const chatTitle = resolveConversationHeaderTitle(
    activeConversation,
    project,
    projectId,
  );
  const chatDayLabel = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <WorkspaceShell
      fillHeight
      contentClassName="!overflow-hidden !p-0"
    >
      <div
        className={cn(
          "flex h-full min-h-0 flex-1 flex-col overflow-hidden border-t border-[rgba(78,66,57,0.08)] bg-[rgba(255,252,248,0.55)]",
          "transition-[opacity,transform,filter] duration-220",
          entryReady
            ? "opacity-100 translate-y-0 scale-100 blur-0"
            : "opacity-0 translate-y-2 scale-[0.995] blur-[1px]",
        )}
        style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="flex w-full shrink-0 flex-col overflow-hidden border-b border-[rgba(78,66,57,0.1)] bg-[rgba(248,243,238,0.92)] backdrop-blur-md md:w-[17rem] md:border-b-0 md:border-r">
        <div className="border-b border-[rgba(78,66,57,0.1)] px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(var(--wine-muted))] text-[hsl(var(--wine))]">
              <Sparkles size={24} strokeWidth={2} />
            </div>
            <div>
              <p className="font-display text-sm font-bold leading-tight text-foreground">
                对话中心
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                合域 · Joint Office
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1.5 overflow-y-auto p-3">
          <button
            type="button"
            onClick={() => {
              if (!projectId || !project || !userId) return;
              const newId = `${projectId}-blank-${userId}-${Date.now()}`;
              const newConv = buildBlankSessionConversation(
                projectId,
                newId,
                project.name,
              );
              skipNextAutoPersistRef.current = true;
              setConversations((prev) => [
                newConv,
                ...prev.filter((c) => c.id !== newId),
              ]);
              setLiveMessagesByConversation((prev) => ({
                ...prev,
                [newId]: prev[newId] ?? [],
              }));
              setNewlyAddedConversationId(newId);
              if (newConversationTimerRef.current !== null) {
                window.clearTimeout(newConversationTimerRef.current);
              }
              newConversationTimerRef.current = window.setTimeout(() => {
                setNewlyAddedConversationId((prev) => (prev === newId ? null : prev));
              }, 260);
              navigate(`/app/chat/${projectId}/${newId}`);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--wine-deep)/0.32)] bg-[hsl(var(--wine-deep)/0.08)] px-3 py-2.5 text-xs font-semibold text-[hsl(var(--wine-deep))] transition-colors hover:bg-[hsl(var(--wine-deep)/0.14)]"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            新增对话
          </button>
          {sidebarGroups.length === 0 ? (
            <p className="px-2 py-3 text-[11px] leading-relaxed text-muted-foreground">
              暂无对话记录。选择项目后发送消息即可开始。
            </p>
          ) : null}
          {sidebarGroups.map((group) => {
            const collapsed = collapsedProjectIds.has(group.projectId);
            return (
              <div key={group.projectId} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleProjectCollapsed(group.projectId)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted/50"
                >
                  {collapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-foreground">
                    {group.projectName}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {group.conversations.length}
                  </span>
                </button>
                {!collapsed
                  ? group.conversations.map((conversation) => {
                      const active =
                        conversation.id === effectiveConversationId &&
                        conversation.projectId === projectId;
                      return (
                        <div
                          key={conversation.id}
                          className={cn(
                            "group/item relative ml-2 w-[calc(100%-0.5rem)] rounded-xl border px-3 py-2.5 text-left transition-colors",
                            conversation.id === newlyAddedConversationId &&
                              "animate-in fade-in slide-in-from-top-1 duration-200",
                            active
                              ? "border-[hsl(var(--wine-deep)/0.32)] bg-[hsl(var(--wine-deep)/0.08)]"
                              : "border-transparent bg-white/70 hover:border-border/80 hover:bg-white",
                          )}
                        >
                          {active ? (
                            <span
                              aria-hidden
                              className="absolute bottom-1.5 right-0 top-1.5 w-[3px] rounded-full bg-[hsl(var(--wine-deep)/0.9)]"
                            />
                          ) : null}
                          <div className="flex items-start gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                saveLastChatProjectId(conversation.projectId);
                                navigate(conversationPath(conversation));
                              }}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p
                                  className={cn(
                                    "line-clamp-1 break-words pr-1 text-[12px] leading-snug",
                                    active
                                      ? "font-semibold text-[hsl(var(--wine-deep))]"
                                      : "text-foreground",
                                  )}
                                >
                                  {conversation.preview}
                                </p>
                                <p className="shrink-0 text-[10px] text-muted-foreground">
                                  {formatSidebarDateLabel(conversation.updatedAt)}
                                </p>
                              </div>
                            </button>
                            <button
                              type="button"
                              title="删除此对话"
                              onClick={() => deleteConversation(conversation)}
                              className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/item:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  : null}
              </div>
            );
          })}
        </nav>
        <div className="shrink-0 border-t border-border/60 px-4 py-3 md:rounded-bl-[1.65rem]">
          {permissionSidebarHint ? (
            <p className="mb-2 text-[10px] font-medium leading-snug text-muted-foreground">
              当前权限：{permissionSidebarHint}
            </p>
          ) : null}
          <Link
            to="/"
            className="flex items-center gap-1 rounded-full px-1 py-1 text-[11px] font-semibold text-muted-foreground hover:text-[hsl(var(--wine-deep))]"
          >
            <ArrowLeft className="h-3 w-3" />
            返回官网
          </Link>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-background/30 to-background/5 md:rounded-tr-[1.75rem]">
        <header className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 border-b border-border/50 bg-white/65 px-4 py-4 backdrop-blur-md md:px-6">
          <div>
            <Link
              to="/"
              className="mb-1 inline-block text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-[hsl(var(--wine-deep))]"
            >
              合域
            </Link>
            <h1 className="text-lg font-bold text-foreground md:text-xl">
              {chatTitle}
            </h1>
            <p className="text-xs font-medium text-muted-foreground">
              Master Agent 在线
            </p>
          </div>
          <div
            ref={conversationFilesMenuRef}
            className="relative flex flex-wrap items-center gap-2"
          >
            {projectId ? (
              <Link
                to={`/app/projects/${projectId}/materials`}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-white/85 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-[hsl(var(--wine-deep)/0.25)] hover:text-foreground"
              >
                打开源文件页
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setShowHistoryMenu((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-white/85 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-[hsl(var(--wine-deep)/0.25)] hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
              本对话文件
              {isLiveAiMode && conversationFileTreeItems.length > 0 ? (
                <span className="ml-0.5 rounded-full bg-[hsl(var(--wine-deep)/0.12)] px-1.5 py-0.5 text-[10px] font-bold text-[hsl(var(--wine-deep))]">
                  {conversationFileTreeItems.length}
                </span>
              ) : null}
            </button>
            {showHistoryMenu ? (
              <div className="absolute right-0 top-10 z-20 w-[18rem] rounded-2xl border border-border/70 bg-white/95 p-2 shadow-[0_12px_32px_-16px_rgba(15,23,42,0.35)] backdrop-blur-md">
                <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                  本对话文件（{conversationFileTreeItems.length}）
                </p>
                <p className="px-2 pb-1 text-[10px] leading-snug text-muted-foreground">
                  仅含当前对话内上传、已入库的附件（非项目资料包）。
                  {isLiveAiMode ? " 点右侧垃圾桶可删除。" : ""}
                </p>
                <div className="max-h-52 overflow-y-auto rounded-xl border border-border/60 bg-background/50 p-2">
                  {conversationFilesLoading && isLiveAiMode ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      加载附件列表…
                    </p>
                  ) : conversationFileTreeItems.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      暂无文件。请用输入栏回形针上传。
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {conversationFileTreeItems.map((item) => {
                        const isDeleting = deletingSessionFileId === item.documentId;
                        return (
                          <li
                            key={item.key}
                            className="rounded-lg border border-border/50 bg-white/80 px-2 py-1.5"
                          >
                            <div className="flex items-start gap-1.5 text-[11px] text-foreground">
                              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--wine-deep)/0.8)]" />
                              <span className="min-w-0 flex-1 leading-snug">{item.name}</span>
                              {item.canDelete && item.documentId ? (
                                <button
                                  type="button"
                                  disabled={Boolean(deletingSessionFileId)}
                                  onClick={() =>
                                    void handleDeleteSessionFile(
                                      item.documentId!,
                                      item.name,
                                      item.fileConversationId,
                                    )
                                  }
                                  className={cn(
                                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600",
                                    isDeleting && "pointer-events-none opacity-50",
                                  )}
                                  aria-label={`删除 ${item.name}`}
                                  title="从本对话删除"
                                >
                                  {isDeleting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                                  )}
                                </button>
                              ) : null}
                            </div>
                            {item.meta ? (
                              <p className="mt-0.5 pl-5 text-[10px] text-muted-foreground">
                                {item.meta}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </header>

        <div
          ref={chatScrollRef}
          className={cn(
            "flex-1 space-y-6 overflow-y-auto px-4 py-6 md:px-8",
            showUploadPanel && "pb-[min(42vh,22rem)]",
          )}
        >
          <div className="flex justify-center">
            <span className="rounded-full border border-border/70 bg-white/80 px-3 py-1 text-[11px] font-medium text-muted-foreground">
              {chatDayLabel}
            </span>
          </div>
          {isLiveAiMode ? (
            <>
              <AiShell>
                <p className="text-sm font-semibold text-[hsl(var(--wine-deep))]">
                  AI 助手已接入
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  经 JFO API 调用 LLM。可上传 .txt / .md / 电子版 PDF；仅发附件后请再提一个具体问题。
                </p>
              </AiShell>
              {liveMessages.length === 0 ? (
                <AiShell>
                  <p className="text-sm text-muted-foreground">
                    还没有消息。先发送一条问题试试。
                  </p>
                </AiShell>
              ) : (
                liveMessages.map((m) => {
                  const streaming = Boolean(m.isStreaming);
                  const rawAssistantText =
                    m.role === "assistant"
                      ? streamingAssistantDisplayText(m.content, streaming)
                      : m.content;
                  const knPrepared =
                    m.role === "assistant"
                      ? prepareKnowledgeNetworkMessageDisplay(
                          rawAssistantText,
                          streaming ? null : m.knowledgeNetworkHtml,
                        )
                      : null;
                  const baseAssistantDisplay = knPrepared?.displayContent ?? rawAssistantText;
                  const displayAssistantText = productizeAssistantBubbleContent(
                    baseAssistantDisplay,
                    { pendingJobId: m.pendingJobId },
                  );
                  const displayJobProgressLabel = m.pendingJobId
                    ? productizeJobProgressLabelForDisplay(m.jobProgressLabel)
                    : m.jobProgressLabel;
                  const canDeleteMessage = !streaming;
                  const deleteThisMessage = canDeleteMessage
                    ? () => deleteLiveMessage(m.id)
                    : undefined;
                  const userCopyText =
                    m.content.trim() && !isGenericFileOnlyUserText(m.content)
                      ? m.content
                      : (m.files?.length ?? 0) > 0
                        ? m.files!.map((f) => f.name).join("\n")
                        : "";
                  const assistantCopyText = displayAssistantText.trim();
                  return m.role === "user" ? (
                    <div key={m.id} className="flex flex-col items-end gap-3">
                      {m.files && m.files.length > 0 ? (
                        <ChatSentFilesPanel files={m.files} />
                      ) : null}
                      {m.content.trim() && !isGenericFileOnlyUserText(m.content) ? (
                        <UserBubble
                          time={m.time}
                          copyText={userCopyText}
                          onDeleteMessage={deleteThisMessage}
                          onQuoteMessage={
                            userCopyText.trim()
                              ? () =>
                                  quoteLiveMessage(m.id, userCopyText, "user")
                              : undefined
                          }
                        >
                          <ChatMarkdown text={m.content} variant="user" />
                        </UserBubble>
                      ) : (m.files?.length ?? 0) > 0 &&
                        (!m.content.trim() || isGenericFileOnlyUserText(m.content)) ? (
                        <div className="group flex justify-end">
                          <MessageBubbleToolbar
                            copyText={userCopyText}
                            onDeleteMessage={deleteThisMessage}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <AiShell
                      key={m.id}
                      time={m.time}
                      copyText={assistantCopyText}
                      onDeleteMessage={deleteThisMessage}
                      onQuoteMessage={
                        assistantCopyText.trim() && !streaming
                          ? () =>
                              quoteLiveMessage(
                                m.id,
                                assistantCopyText,
                                "assistant",
                              )
                          : undefined
                      }
                    >
                      {m.isStreaming ? (
                        <ChatThinkingBadge className="mb-3">思考中…</ChatThinkingBadge>
                      ) : null}
                      {m.content.trim() ? (
                        <div
                          className={cn(
                            "text-sm",
                            m.isStreaming && "max-h-80 overflow-y-auto pr-1",
                          )}
                        >
                          <ChatMarkdown
                            text={displayAssistantText}
                            variant="assistant"
                          />
                        </div>
                      ) : m.isStreaming ? (
                        <p className="text-xs text-muted-foreground/80">
                          {productizeStreamStatusLabel(m.streamStatusLabel)}
                        </p>
                      ) : null}
                      {m.pendingJobId ? (
                        <div className="mt-3 flex flex-col gap-1.5">
                          <ChatThinkingBadge>
                            {displayJobProgressLabel?.trim() || "正在生成，请稍候…"}
                          </ChatThinkingBadge>
                          <p className="text-[11px] text-muted-foreground/90">
                            可保持本页打开；刷新后会自动继续等待结果。
                          </p>
                        </div>
                      ) : null}
                      {knPrepared?.html ? (
                        <>
                          <KnowledgeNetworkPreview html={knPrepared.html} />
                          {typeof m.projectKnowledgeNetworkVersion === "number" ? (
                            <p className="mt-2 text-[11px] font-medium text-primary">
                              已同步至项目知识网络 v{m.projectKnowledgeNetworkVersion}
                            </p>
                          ) : null}
                        </>
                      ) : /知识网络交付失败|未检测到 curl PUT|知识网络未通过 API/i.test(
                          m.content,
                        ) ? (
                        <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm leading-relaxed text-amber-950">
                          知识网络请在项目页生成：打开「知识网络」，用「更新全部章节」或「更新本章」。对话不再产出整页 HTML。
                        </p>
                      ) : null}
                      <ChatAgentStatusLine>
                        ● Master Agent · AI {m.isStreaming ? "处理中" : "返回"}
                        {m.pendingJobId ? " · 生成中" : ""}
                        {knPrepared?.html ? " · 含知识网络 HTML" : ""}
                      </ChatAgentStatusLine>
                    </AiShell>
                  );
                })
              )}
              {isCurrentConversationSending && !hasStreamingAssistantInThread ? (
                <AiShell>
                  <ChatThinkingBadge>思考中…</ChatThinkingBadge>
                  <ChatAgentStatusLine>● Master Agent · AI 处理中</ChatAgentStatusLine>
                </AiShell>
              ) : null}
            </>
          ) : (
            <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-white/40 px-6 py-16 text-center">
              <p className="text-sm font-semibold text-foreground">空白对话</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                真 AI 未接入。配置线上对话接口后，可在此发送消息与上传资料。
              </p>
            </div>
          )}
        </div>

        <footer className="relative shrink-0 border-t border-border/50 bg-white/70 px-4 py-4 backdrop-blur-md md:rounded-br-[1.65rem] md:px-6">
          <input
            id="jfo-chat-file-input"
            ref={fileInputRef}
            type="file"
            multiple
            tabIndex={-1}
            className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
            accept=".pdf,.txt,.md,.html,.htm,.doc,.docx,.xlsx,.xls,.png,.jpg,.jpeg,text/html"
            onChange={(e) => {
              addFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
          {showUploadPanel || selectedFiles.length > 0 ? (
            <div className="absolute bottom-full left-4 right-4 z-30 mb-3 rounded-2xl border border-dashed border-[hsl(var(--wine-deep)/0.45)] bg-white/95 p-3 shadow-[0_-8px_30px_-12px_rgba(15,23,42,0.12)] backdrop-blur-md md:left-6 md:right-6">
              <div
                className="rounded-2xl border border-dashed border-border/70 bg-background/40 px-4 py-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
              >
                {showUploadPanel ? (
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <FileUp
                          className="h-4 w-4 shrink-0 text-[hsl(var(--wine-deep))]"
                          strokeWidth={2}
                          aria-hidden
                        />
                        拖拽文件到此处上传
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        AI 检索优先支持 .txt / .md；亦可上传 .htm / .html、PDF、Word、Excel、图片（PDF 等暂仅入库摘要）
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[hsl(var(--wine-deep))] px-4 text-sm font-semibold text-[hsl(var(--wine-deep))] transition-colors hover:bg-[hsl(var(--wine-deep)/0.08)]"
                    >
                      选择文件
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      已选 {selectedFiles.length} 个文件（点击回形针展开拖拽区）
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowUploadPanel(true)}
                      className="text-[11px] font-semibold text-[hsl(var(--wine-deep))] underline-offset-2 hover:underline"
                    >
                      添加更多
                    </button>
                  </div>
                )}

                {selectedFiles.length > 0 ? (
                  <div className={cn(showUploadPanel ? "mt-4 border-t border-border/60 pt-4" : "mt-3")}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      已添加 {selectedFiles.length} 个文件
                    </p>
                    <ul className="max-h-48 space-y-2 overflow-y-auto pr-0.5">
                      {selectedFiles.map((f, idx) => (
                        <li key={`${f.name}-${f.size}-${f.lastModified}`}>
                          <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--wine-deep)/0.15)] bg-white px-3 py-2.5 text-xs shadow-sm">
                            <UploadSelectedFileIcon name={f.name} />
                            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{f.name}</span>
                            <span className="shrink-0 text-[10px] font-semibold text-[hsl(var(--wine-deep))]">待发送</span>
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="移除文件"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {chatSyncError ? (
            <div className="mb-2 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-900">
              {chatSyncError}
            </div>
          ) : null}
          {liveError ? (
            <div className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700">
              {liveError}
            </div>
          ) : null}

          {quoteDraft ? (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-[hsl(var(--wine-deep)/0.2)] bg-[hsl(var(--wine-deep)/0.05)] px-3 py-2.5">
              <Quote
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--wine-deep))]"
                strokeWidth={2}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-[hsl(var(--wine-deep))]">
                  引用
                  {quoteDraft.from === "assistant" ? "助手" : "我"}
                  的消息 · 针对性回复
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {quoteDraft.excerpt}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuoteDraft(null)}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="取消引用"
                title="取消引用"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {isLiveAiMode ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {CHAT_QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={isCurrentConversationSending}
                  onClick={() => setDraftMessage(item.message)}
                  className="rounded-full border border-border/80 bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-[hsl(var(--wine-deep)/0.3)] hover:bg-[hsl(var(--wine-deep)/0.05)] hover:text-foreground disabled:opacity-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <textarea
              ref={chatInputRef}
              rows={1}
              value={draftMessage}
              onChange={(e) => {
                setDraftMessage(e.target.value);
                resizeChatComposer(e.target);
              }}
              onCompositionStart={() => {
                chatImeComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                chatImeComposingRef.current = false;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  if (
                    e.nativeEvent.isComposing ||
                    chatImeComposingRef.current ||
                    e.keyCode === 229
                  ) {
                    return;
                  }
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={isCurrentConversationSending}
              autoComplete="off"
              spellCheck={false}
              aria-label="对话输入"
              placeholder="输入消息并发送"
              className={cn(
                "min-h-12 max-h-[88px] min-w-0 flex-1 resize-none overflow-x-hidden overflow-y-auto rounded-2xl border border-input bg-white px-5 py-2.5 text-sm font-medium leading-relaxed break-words whitespace-pre-wrap shadow-inner [overflow-wrap:anywhere] placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--wine-deep)/0.28)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                draftMessage ? "text-foreground" : "text-muted-foreground",
                isCurrentConversationSending && "opacity-70",
              )}
            />
            <button
              type="button"
              onClick={() => setShowUploadPanel((open) => !open)}
              className={cn(
                "inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border text-muted-foreground transition-colors",
                showUploadPanel || selectedFiles.length > 0
                  ? "border-[hsl(var(--wine-deep)/0.35)] bg-[hsl(var(--wine-deep)/0.1)] text-[hsl(var(--wine-deep))]"
                  : "border-input bg-white hover:bg-muted hover:text-foreground",
              )}
              aria-label="展开或收起文件上传区"
              aria-expanded={showUploadPanel}
            >
              <Paperclip className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                if (canStopCurrentTask) {
                  void handleStopCurrentTask();
                  return;
                }
                void handleSend();
              }}
              disabled={
                canStopCurrentTask
                  ? false
                  : isCurrentConversationSending ||
                    (draftMessage.trim().length === 0 && selectedFiles.length === 0)
              }
              className={cn(
                "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border px-8 text-sm font-semibold shadow-[0_8px_22px_-10px_hsl(var(--wine-deep)/0.55)] transition-all active:scale-[0.98]",
                canStopCurrentTask
                  ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
                  : "border-[hsl(var(--wine-deep))] bg-[hsl(var(--wine-deep))] text-[hsl(var(--wine-deep-foreground))] hover:bg-[hsl(353_42%_28%)]",
              )}
            >
              {canStopCurrentTask ? (
                <Square className="h-4 w-4 fill-current" strokeWidth={2} />
              ) : (
                <Plane className="h-4 w-4" strokeWidth={2} />
              )}
              {canStopCurrentTask ? "停止" : isCurrentConversationSending ? "发送中…" : "发送"}
            </button>
          </div>
        </footer>
      </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
