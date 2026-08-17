import { SESSION_KEY } from "./types";

const LAST_PROJECT_KEY = "fo-last-project-id";
/** 仅在有真实发过消息时更新，供顶部「对话中心」入口使用 */
const LAST_CHAT_PROJECT_KEY = "fo-last-chat-project-id";

export type SessionUserProfile = {
  id: string;
  displayName?: string;
  orgTitle?: string;
  avatarChar?: string;
  avatarClass?: string;
  avatarUrl?: string;
  isPlatformAdmin?: boolean;
  defaultRole?: string;
};

type SessionPayload = {
  userId: string;
  token?: string;
  user?: SessionUserProfile;
};

/**
 * 登录态用 localStorage：新标签页 / 重新打开站点仍保持登录。
 * 兼容旧版 sessionStorage：首次读取时迁移并清理。
 */
function readPayload(): SessionPayload | null {
  try {
    const fromLocal = localStorage.getItem(SESSION_KEY);
    if (fromLocal) {
      return JSON.parse(fromLocal) as SessionPayload;
    }
    const fromSession = sessionStorage.getItem(SESSION_KEY);
    if (fromSession) {
      localStorage.setItem(SESSION_KEY, fromSession);
      sessionStorage.removeItem(SESSION_KEY);
      return JSON.parse(fromSession) as SessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function writePayload(payload: SessionPayload): void {
  const raw = JSON.stringify(payload);
  localStorage.setItem(SESSION_KEY, raw);
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function saveLastProjectId(id: string) {
  localStorage.setItem(LAST_PROJECT_KEY, id);
}

export function loadLastProjectId(): string | null {
  return (
    localStorage.getItem(LAST_PROJECT_KEY) ??
    sessionStorage.getItem(LAST_PROJECT_KEY)
  );
}

export function saveLastChatProjectId(id: string) {
  localStorage.setItem(LAST_CHAT_PROJECT_KEY, id);
}

export function loadLastChatProjectId(): string | null {
  return (
    localStorage.getItem(LAST_CHAT_PROJECT_KEY) ??
    sessionStorage.getItem(LAST_CHAT_PROJECT_KEY)
  );
}

export function clearLastChatProjectId() {
  localStorage.removeItem(LAST_CHAT_PROJECT_KEY);
  sessionStorage.removeItem(LAST_CHAT_PROJECT_KEY);
}

/** @deprecated 请用 saveSessionAuth */
export function saveSessionUser(userId: string) {
  const prev = readPayload();
  writePayload({
    userId,
    token: prev?.token,
    user: prev?.user ?? { id: userId },
  });
}

export function saveSessionAuth(
  token: string,
  userId: string,
  user?: SessionUserProfile,
) {
  writePayload({
    token,
    userId,
    user: user ?? { id: userId },
  });
}

export function loadSessionUserId(): string | null {
  return readPayload()?.userId ?? null;
}

export function loadSessionToken(): string | null {
  return readPayload()?.token?.trim() || null;
}

export function loadSessionUserProfile(): SessionUserProfile | null {
  return readPayload()?.user ?? null;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}
