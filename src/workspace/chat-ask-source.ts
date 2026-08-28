/** 源文件页「在对话中追问」：新开对话窗口并预引用该文件 */

export const CHAT_ASK_NEW_PARAM = "new";
export const CHAT_ASK_FILE_PARAM = "sourceFile";
export const CHAT_ASK_NAME_PARAM = "sourceName";
export const CHAT_ASK_KN_SECTION_PARAM = "knSection";
export const CHAT_ASK_KN_NAME_PARAM = "knSectionName";
export const CHAT_ASK_NONCE_PARAM = "t";

const ASK_CONV_PREFIX = "heyu-chat-ask-conv:";
const ASK_PENDING_PREFIX = "heyu-chat-ask-pending:";
const ASK_PENDING_CHAPTER_PREFIX = "heyu-chat-ask-kn:";

const memoryStore = new Map<string, string>();

export type ChatAskQuery = {
  wantNew: boolean;
  sourceFile: string | null;
  sourceName: string | null;
  knSection: string | null;
  knSectionName: string | null;
  nonce: string | null;
};

export type PendingAskSourceFile = {
  id: string;
  filename: string;
};

export type PendingAskChapter = {
  id: string;
  label: string;
};

function askStorageGet(key: string): string | null {
  try {
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem(key);
    }
  } catch {
    /* private mode / blocked */
  }
  return memoryStore.get(key) ?? null;
}

function askStorageSet(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(key, value);
      return;
    }
  } catch {
    /* private mode / blocked */
  }
  memoryStore.set(key, value);
}

function askStorageRemove(key: string): void {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* private mode / blocked */
  }
  memoryStore.delete(key);
}

export function resetChatAskStorageForTests(): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  } catch {
    /* private mode / blocked */
  }
  memoryStore.clear();
}

export function parseChatAskSearch(search: string): ChatAskQuery {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const sourceFile = params.get(CHAT_ASK_FILE_PARAM)?.trim() || null;
  const sourceName = params.get(CHAT_ASK_NAME_PARAM)?.trim() || null;
  const knSection = params.get(CHAT_ASK_KN_SECTION_PARAM)?.trim() || null;
  const knSectionName = params.get(CHAT_ASK_KN_NAME_PARAM)?.trim() || null;
  const nonce = params.get(CHAT_ASK_NONCE_PARAM)?.trim() || null;
  const wantNew =
    params.get(CHAT_ASK_NEW_PARAM) === "1" ||
    Boolean(sourceFile) ||
    Boolean(knSection);
  return { wantNew, sourceFile, sourceName, knSection, knSectionName, nonce };
}

/** 同一点击（同一 t）在 Strict Mode 双跑 / 刷新前复用同一空白会话 */
export function resolveAskNonce(ask: ChatAskQuery): string {
  if (ask.nonce) return ask.nonce;
  if (ask.sourceFile) return `file:${ask.sourceFile}`;
  if (ask.knSection) return `kn:${ask.knSection}`;
  return "new";
}

export function assignAskConversationId(
  projectId: string,
  userId: string,
  nonce: string,
): string {
  const key = `${ASK_CONV_PREFIX}${projectId}:${nonce}`;
  const existing = askStorageGet(key)?.trim();
  if (existing) return existing;
  const id = `${projectId}-blank-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  askStorageSet(key, id);
  return id;
}

export function pendingAskFileFromLocation(
  search: string,
  hash = "",
): PendingAskSourceFile | null {
  const fromSearch = parseChatAskSearch(search);
  if (fromSearch.sourceFile) {
    return {
      id: fromSearch.sourceFile,
      filename: fromSearch.sourceName || fromSearch.sourceFile,
    };
  }
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!rawHash) return null;
  const fromHash = parseChatAskSearch(rawHash);
  if (!fromHash.sourceFile) return null;
  return {
    id: fromHash.sourceFile,
    filename: fromHash.sourceName || fromHash.sourceFile,
  };
}

export function withAskSourceQuery(
  path: string,
  file: { id: string; filename: string } | null,
  chapter: { id: string; label: string } | null = null,
): string {
  const qs = new URLSearchParams();
  if (file?.id) {
    qs.set(CHAT_ASK_FILE_PARAM, file.id);
    qs.set(CHAT_ASK_NAME_PARAM, file.filename);
  }
  if (chapter?.id) {
    qs.set(CHAT_ASK_KN_SECTION_PARAM, chapter.id);
    qs.set(CHAT_ASK_KN_NAME_PARAM, chapter.label);
  }
  const q = qs.toString();
  return q ? `${path}?${q}` : path;
}

export function storePendingAskSourceFile(
  conversationId: string,
  file: PendingAskSourceFile,
): void {
  askStorageSet(
    `${ASK_PENDING_PREFIX}${conversationId}`,
    JSON.stringify({ id: file.id, filename: file.filename }),
  );
}

export function peekPendingAskSourceFile(
  conversationId: string,
): PendingAskSourceFile | null {
  const raw = askStorageGet(`${ASK_PENDING_PREFIX}${conversationId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; filename?: unknown };
    if (typeof parsed.id !== "string" || !parsed.id.trim()) return null;
    const id = parsed.id.trim();
    const filename =
      typeof parsed.filename === "string" && parsed.filename.trim()
        ? parsed.filename.trim()
        : id;
    return { id, filename };
  } catch {
    return null;
  }
}

export function clearPendingAskSourceFile(conversationId: string): void {
  askStorageRemove(`${ASK_PENDING_PREFIX}${conversationId}`);
}

export function pendingAskChapterFromLocation(
  search: string,
  hash = "",
): PendingAskChapter | null {
  const fromSearch = parseChatAskSearch(search);
  if (fromSearch.knSection) {
    return {
      id: fromSearch.knSection,
      label: fromSearch.knSectionName || fromSearch.knSection,
    };
  }
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!rawHash) return null;
  const fromHash = parseChatAskSearch(rawHash);
  if (!fromHash.knSection) return null;
  return {
    id: fromHash.knSection,
    label: fromHash.knSectionName || fromHash.knSection,
  };
}

export function storePendingAskChapter(
  conversationId: string,
  chapter: PendingAskChapter,
): void {
  askStorageSet(
    `${ASK_PENDING_CHAPTER_PREFIX}${conversationId}`,
    JSON.stringify({ id: chapter.id, label: chapter.label }),
  );
}

export function peekPendingAskChapter(
  conversationId: string,
): PendingAskChapter | null {
  const raw = askStorageGet(`${ASK_PENDING_CHAPTER_PREFIX}${conversationId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; label?: unknown };
    if (typeof parsed.id !== "string" || !parsed.id.trim()) return null;
    const id = parsed.id.trim();
    const label =
      typeof parsed.label === "string" && parsed.label.trim()
        ? parsed.label.trim()
        : id;
    return { id, label };
  } catch {
    return null;
  }
}

export function clearPendingAskChapter(conversationId: string): void {
  askStorageRemove(`${ASK_PENDING_CHAPTER_PREFIX}${conversationId}`);
}

export function newChatAskNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function chatAskAboutFilePath(
  projectId: string,
  file: { id: string; filename: string },
): string {
  const qs = new URLSearchParams({
    [CHAT_ASK_NEW_PARAM]: "1",
    [CHAT_ASK_FILE_PARAM]: file.id,
    [CHAT_ASK_NAME_PARAM]: file.filename,
    [CHAT_ASK_NONCE_PARAM]: newChatAskNonce(),
  });
  return `/app/chat/${encodeURIComponent(projectId)}?${qs.toString()}`;
}

export function chatAskAboutChapterPath(
  projectId: string,
  chapter: { id: string; label: string },
): string {
  const qs = new URLSearchParams({
    [CHAT_ASK_NEW_PARAM]: "1",
    [CHAT_ASK_KN_SECTION_PARAM]: chapter.id,
    [CHAT_ASK_KN_NAME_PARAM]: chapter.label,
    [CHAT_ASK_NONCE_PARAM]: newChatAskNonce(),
  });
  return `/app/chat/${encodeURIComponent(projectId)}?${qs.toString()}`;
}

export function chatAskAboutFileHref(
  projectId: string,
  file: { id: string; filename: string },
): string {
  const base = String(import.meta.env.BASE_URL || "/").replace(/\/$/u, "");
  return `${base}${chatAskAboutFilePath(projectId, file)}`;
}

/** 必须在点击回调里同步调用，避免弹窗拦截 */
export function openChatAskAboutFile(
  projectId: string,
  file: { id: string; filename: string },
): void {
  const href = chatAskAboutFileHref(projectId, file);
  const opened = window.open(href, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(href);
  }
}
