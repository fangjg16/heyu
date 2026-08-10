import type { AppDatabase } from "./app-database";
import {
  createAuthSession,
  extractBearerToken,
  publicUserFromRow,
  revokeAuthSession,
  resolveAuthSession,
} from "./auth-sessions";
import { verifyPassword } from "./password-crypto";
import {
  getWorkspaceUserById,
  listActiveWorkspaceUsers,
  resolveUserIdByUsername,
  rowToPublic,
  type WorkspaceUserPublic,
} from "./workspace-users-db";

type Env = { DB: AppDatabase };

function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

function authProfile(row: Parameters<typeof rowToPublic>[0]) {
  return rowToPublic(row);
}

export async function handleAuthLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return json({ error: "请填写账号和密码" }, 400);
  }

  const userId = await resolveUserIdByUsername(env, username);
  if (!userId) {
    return json({ error: "账号或密码不正确" }, 401);
  }

  const user = await getWorkspaceUserById(env, userId);
  if (!user || user.status !== "active") {
    return json({ error: "账号或密码不正确" }, 401);
  }

  const ok = await verifyPassword(
    password,
    user.password_hash,
    user.password_salt,
    user.password_iters || 120_000,
  );
  if (!ok) {
    return json({ error: "账号或密码不正确" }, 401);
  }

  const token = await createAuthSession(env, user.id);
  const profile = authProfile(user);
  return json({ ok: true, token, user: profile });
}

export async function handleAuthLogout(
  request: Request,
  env: Env,
): Promise<Response> {
  const token = extractBearerToken(request);
  if (token) {
    await revokeAuthSession(env, token);
  }
  return json({ ok: true });
}

export async function handleAuthMe(
  request: Request,
  env: Env,
): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) return json({ error: "未登录" }, 401);
  const session = await resolveAuthSession(env, token);
  if (!session) return json({ error: "登录已失效，请重新登录" }, 401);
  const profile = authProfile(session.user);
  return json({ user: profile });
}

export async function handleListWorkspaceUsers(
  request: Request,
  env: Env,
): Promise<Response> {
  const token = extractBearerToken(request);
  if (!token) return json({ error: "未登录" }, 401);
  const session = await resolveAuthSession(env, token);
  if (!session) return json({ error: "登录已失效，请重新登录" }, 401);
  const users = await listActiveWorkspaceUsers(env);
  return json({ users });
}

export type AuthContext = {
  userId: string;
  user: WorkspaceUserPublic;
};

export async function requireAuthContext(
  request: Request,
  env: Env,
): Promise<AuthContext | Response> {
  const token = extractBearerToken(request);
  if (!token) {
    return json({ error: "未登录", code: "AUTH_REQUIRED" }, 401);
  }
  const session = await resolveAuthSession(env, token);
  if (!session) {
    return json({ error: "登录已失效，请重新登录", code: "AUTH_EXPIRED" }, 401);
  }
  return {
    userId: session.userId,
    user: publicUserFromRow(session.user),
  };
}

/** 请求中显式传的 userId 必须与会话一致 */
export function assertUserIdMatchesAuth(
  authUserId: string,
  claimed: string | null | undefined,
): Response | null {
  const claim = (claimed ?? "").trim();
  if (!claim) return null;
  if (claim === authUserId) return null;
  return json(
    { error: "userId 与登录会话不一致", code: "USER_MISMATCH" },
    403,
  );
}
