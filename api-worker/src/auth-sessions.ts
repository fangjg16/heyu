import type { AppDatabase } from "./app-database";
import { coerceAccountStatus } from "./account-status";
import { randomToken, sha256Hex } from "./password-crypto";
import {
  getWorkspaceUserById,
  rowToPublic,
  type WorkspaceUserPublic,
  type WorkspaceUserRow,
} from "./workspace-users-db";

type Env = { DB: AppDatabase };

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function expiresIso(fromMs = Date.now()): string {
  return new Date(fromMs + SESSION_TTL_MS).toISOString();
}

export async function createAuthSession(
  env: Env,
  userId: string,
): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const t = nowIso();
  await env.DB.prepare(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(tokenHash, userId.trim(), expiresIso(), t, t)
    .run();
  return token;
}

export async function revokeAuthSession(
  env: Env,
  token: string,
): Promise<void> {
  const tokenHash = await sha256Hex(token.trim());
  await env.DB.prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`)
    .bind(tokenHash)
    .run();
}

export async function resolveAuthSession(
  env: Env,
  token: string,
): Promise<{ userId: string; user: WorkspaceUserRow } | null> {
  const raw = token.trim();
  if (!raw) return null;
  const tokenHash = await sha256Hex(raw);
  const session = await env.DB.prepare(
    `SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: string }>();
  if (!session) return null;
  if (Date.parse(session.expires_at) <= Date.now()) {
    await env.DB.prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`)
      .bind(tokenHash)
      .run();
    return null;
  }
  const user = await getWorkspaceUserById(env, session.user_id);
  if (!user || coerceAccountStatus(user.status) !== "active") {
    await env.DB.prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`)
      .bind(tokenHash)
      .run();
    return null;
  }
  const seen = nowIso();
  await env.DB.prepare(
    `UPDATE auth_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?`,
  )
    .bind(seen, expiresIso(), tokenHash)
    .run();
  return { userId: user.id, user };
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/iu.exec(header.trim());
  return m?.[1]?.trim() || null;
}

export function publicUserFromRow(row: WorkspaceUserRow): WorkspaceUserPublic {
  return rowToPublic(row);
}
