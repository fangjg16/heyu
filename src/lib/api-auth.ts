import {
  clearSession,
  loadSessionToken,
  loadSessionUserId,
  saveSessionAuth,
  type SessionUserProfile,
} from "@/workspace/session";
import {
  cacheWorkspaceUsers,
  setCachedUserProfile,
  type WorkspaceUser,
} from "@/workspace/workspace-users";

function apiBaseFromChatEndpoint(chatEndpoint: string): string {
  const trimmed = chatEndpoint.trim().replace(/\/+$/u, "");
  if (trimmed.endsWith("/api/chat")) {
    return trimmed.replace(/\/api\/chat$/u, "");
  }
  if (trimmed.endsWith("/api/ragflow/chat")) {
    return trimmed.replace(/\/api\/ragflow\/chat$/u, "");
  }
  return trimmed;
}

const AI_CHAT_ENDPOINT =
  (import.meta.env.VITE_AI_CHAT_ENDPOINT as string | undefined)?.trim() ||
  (import.meta.env.VITE_RAGFLOW_CHAT_ENDPOINT as string | undefined)?.trim() ||
  "";

export type AuthUserProfile = WorkspaceUser & {
  defaultRole?: string;
  isPlatformAdmin: boolean;
};

function apiBase(): string {
  return apiBaseFromChatEndpoint(AI_CHAT_ENDPOINT);
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = apiBase();
  if (!base) throw new Error("未配置 VITE_AI_CHAT_ENDPOINT");
  const headers = new Headers(init.headers);
  const token = loadSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (
    !headers.has("Content-Type") &&
    init.body &&
    !(init.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });
}

function applyProfile(user: AuthUserProfile): void {
  setCachedUserProfile(user);
}

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<AuthUserProfile> {
  const base = apiBase();
  if (!base) throw new Error("未配置线上 API（VITE_AI_CHAT_ENDPOINT）");
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    token?: string;
    user?: AuthUserProfile;
  };
  if (!res.ok || !data.token || !data.user) {
    if (res.status === 404) {
      throw new Error(
        "登录接口不存在（404）。请在 api-worker 执行 npm run build:production 后重启 npm run dev:local，并确认已 mysql:migrate:local + seed:workspace-users。",
      );
    }
    throw new Error(data.error || `登录失败（${res.status}）`);
  }
  saveSessionAuth(data.token, data.user.id, data.user as SessionUserProfile);
  applyProfile(data.user);
  return data.user;
}

export async function loginWithClerkToken(
  clerkToken: string,
): Promise<AuthUserProfile> {
  const base = apiBase();
  if (!base) throw new Error("未配置线上 API（VITE_AI_CHAT_ENDPOINT）");
  const token = clerkToken.trim();
  if (!token) throw new Error("Clerk 会话无效");
  const res = await fetch(`${base}/api/auth/clerk`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    token?: string;
    user?: AuthUserProfile;
  };
  if (!res.ok || !data.token || !data.user) {
    if (res.status === 503) {
      throw new Error("工作台尚未接通 Clerk，请联系管理员配置密钥。");
    }
    throw new Error(data.error || `登录失败（${res.status}）`);
  }
  saveSessionAuth(data.token, data.user.id, data.user as SessionUserProfile);
  applyProfile(data.user);
  return data.user;
}

export async function fetchAuthMe(): Promise<AuthUserProfile | null> {
  const token = loadSessionToken();
  if (!token) return null;
  const res = await apiFetch("/api/auth/me");
  if (res.status === 401) {
    clearSession();
    return null;
  }
  if (!res.ok) throw new Error(`会话校验失败（${res.status}）`);
  const data = (await res.json()) as { user?: AuthUserProfile };
  if (!data.user) return null;
  applyProfile(data.user);
  saveSessionAuth(token, data.user.id, data.user as SessionUserProfile);
  return data.user;
}

export async function logoutRemote(): Promise<void> {
  // 先清本地会话，避免远端 logout 卡住导致「点了没反应」
  const token = loadSessionToken();
  clearSession();
  if (!token) return;
  try {
    const base = apiBase();
    if (!base) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 4000);
    try {
      await fetch(`${base}/api/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: ctrl.signal,
      });
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    /* ignore network / abort */
  }
}

export async function fetchWorkspaceUsersDirectory(): Promise<WorkspaceUser[]> {
  const res = await apiFetch("/api/workspace-users");
  if (!res.ok) throw new Error(`用户列表加载失败（${res.status}）`);
  const data = (await res.json()) as {
    users?: Array<{
      id: string;
      displayName: string;
      orgTitle: string;
      avatarChar: string;
      avatarClass: string;
      avatarUrl?: string;
      isPlatformAdmin?: boolean;
      defaultRole?: string;
    }>;
  };
  const users = (data.users ?? []).map((u) => ({
    id: u.id,
    displayName: u.displayName,
    orgTitle: u.orgTitle,
    avatarChar: u.avatarChar,
    avatarClass: u.avatarClass,
    avatarUrl: u.avatarUrl ?? "",
    isPlatformAdmin: Boolean(u.isPlatformAdmin),
    defaultRole: u.defaultRole,
  }));
  cacheWorkspaceUsers(users);
  return users;
}

export function requireSessionUserId(): string {
  const id = loadSessionUserId();
  if (!id) throw new Error("未登录");
  return id;
}
