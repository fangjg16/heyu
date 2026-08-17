import type { AppDatabase } from "./app-database";
import type { WorkspaceRole } from "./workspace-roles";

export type WorkspaceUserRow = {
  id: string;
  username: string;
  display_name: string;
  org_title: string;
  avatar_char: string;
  avatar_class: string;
  avatar_url: string | null;
  default_role: string;
  is_platform_admin: number;
  status: string;
  password_hash: string;
  password_salt: string;
  password_iters: number;
  created_at: string;
  updated_at: string;
};

export type WorkspaceUserPublic = {
  id: string;
  displayName: string;
  orgTitle: string;
  avatarChar: string;
  avatarClass: string;
  avatarUrl: string;
  defaultRole: WorkspaceRole;
  isPlatformAdmin: boolean;
  status: string;
};

const AVATAR_URL_MAX = 180_000;
const AVATAR_DATA_RE =
  /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/i;

export function normalizeAvatarUrl(
  raw: string | undefined | null,
  existing = "",
): string {
  if (raw === undefined) return existing;
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (value.length > AVATAR_URL_MAX) {
    throw new Error("头像过大，请换一张较小的图片");
  }
  if (!AVATAR_DATA_RE.test(value)) {
    throw new Error("头像须为 JPEG / PNG / WebP 图片");
  }
  return value.replace(/\s+/gu, "");
}

/** 管理端列表（含 username） */
export type WorkspaceUserAdminPublic = WorkspaceUserPublic & {
  username: string;
};

export const DEFAULT_AVATAR_CLASS =
  "bg-slate-300 text-slate-800 shadow-sm";

type Env = { DB: AppDatabase };

const VALID_ROLES: WorkspaceRole[] = [
  "admin",
  "core",
  "mid",
  "low",
  "issuer",
  "guest",
];

export function parseWorkspaceRole(raw: string | null | undefined): WorkspaceRole {
  const role = (raw ?? "").trim() as WorkspaceRole;
  return VALID_ROLES.includes(role) ? role : "guest";
}

/** 登录名归一化：trim + 小写 + 去空白 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/gu, "");
}

/** @deprecated 使用 normalizeUsername */
export function normalizeLoginAlias(raw: string): string {
  return normalizeUsername(raw);
}

export function rowToPublic(row: WorkspaceUserRow): WorkspaceUserPublic {
  return {
    id: row.id,
    displayName: row.display_name,
    orgTitle: row.org_title,
    avatarChar: row.avatar_char,
    avatarClass: row.avatar_class,
    avatarUrl: (row.avatar_url ?? "").trim(),
    defaultRole: parseWorkspaceRole(row.default_role),
    isPlatformAdmin: Number(row.is_platform_admin) === 1,
    status: row.status,
  };
}

const USER_SELECT = `SELECT id, username, display_name, org_title, avatar_char, avatar_class,
              avatar_url, default_role, is_platform_admin, status,
              password_hash, password_salt, password_iters,
              created_at, updated_at
       FROM workspace_users`;

export async function getWorkspaceUserById(
  env: Env,
  userId: string,
): Promise<WorkspaceUserRow | null> {
  const id = userId.trim();
  if (!id) return null;
  return (
    (await env.DB.prepare(`${USER_SELECT} WHERE id = ?`)
      .bind(id)
      .first<WorkspaceUserRow>()) ?? null
  );
}

/** 按唯一登录名解析 user id */
export async function resolveUserIdByUsername(
  env: Env,
  username: string,
): Promise<string | null> {
  const key = normalizeUsername(username);
  if (!key) return null;
  const row = await env.DB.prepare(
    `SELECT id FROM workspace_users WHERE username = ? LIMIT 1`,
  )
    .bind(key)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/** @deprecated 使用 resolveUserIdByUsername */
export async function resolveUserIdByLoginAlias(
  env: Env,
  username: string,
): Promise<string | null> {
  return resolveUserIdByUsername(env, username);
}

export async function listActiveWorkspaceUsers(
  env: Env,
): Promise<WorkspaceUserPublic[]> {
  const { results } = await env.DB.prepare(
    `${USER_SELECT}
     WHERE status = 'active'
     ORDER BY display_name ASC`,
  ).all<WorkspaceUserRow>();
  return (results ?? []).map(rowToPublic);
}

export async function listKnownWorkspaceUserIds(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT id FROM workspace_users WHERE status = 'active'`,
  ).all<{ id: string }>();
  return (results ?? []).map((r) => r.id);
}

export async function isKnownWorkspaceUser(
  env: Env,
  userId: string,
): Promise<boolean> {
  const row = await getWorkspaceUserById(env, userId);
  return Boolean(row && row.status === "active");
}

export async function getDefaultRoleForUser(
  env: Env,
  userId: string,
): Promise<WorkspaceRole> {
  const row = await getWorkspaceUserById(env, userId);
  if (!row || row.status !== "active") return "guest";
  if (Number(row.is_platform_admin) === 1) return "admin";
  return parseWorkspaceRole(row.default_role);
}

export async function isPlatformAdminUser(
  env: Env,
  userId: string | null | undefined,
): Promise<boolean> {
  const id = (userId ?? "").trim();
  if (!id) return false;
  const row = await getWorkspaceUserById(env, id);
  return Boolean(row && row.status === "active" && Number(row.is_platform_admin) === 1);
}

export async function workspaceUserDisplayName(
  env: Env,
  userId: string,
): Promise<string> {
  const row = await getWorkspaceUserById(env, userId);
  return row?.display_name?.trim() || userId.trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function rowToAdminPublic(row: WorkspaceUserRow): WorkspaceUserAdminPublic {
  return {
    ...rowToPublic(row),
    username: row.username,
  };
}

export async function listAllWorkspaceUsers(
  env: Env,
): Promise<WorkspaceUserRow[]> {
  const { results } = await env.DB.prepare(
    `${USER_SELECT} ORDER BY display_name ASC`,
  ).all<WorkspaceUserRow>();
  return results ?? [];
}

export async function getWorkspaceUserByUsername(
  env: Env,
  username: string,
): Promise<WorkspaceUserRow | null> {
  const key = normalizeUsername(username);
  if (!key) return null;
  return (
    (await env.DB.prepare(`${USER_SELECT} WHERE username = ? LIMIT 1`)
      .bind(key)
      .first<WorkspaceUserRow>()) ?? null
  );
}

function slugifyUserId(username: string): string {
  const base = normalizeUsername(username)
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return base.slice(0, 96) || `user-${crypto.randomUUID().slice(0, 8)}`;
}

export async function allocateUserId(
  env: Env,
  username: string,
): Promise<string> {
  const base = slugifyUserId(username);
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    const exists = await getWorkspaceUserById(env, candidate);
    if (!exists) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export type CreateWorkspaceUserInput = {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIters: number;
  displayName: string;
  orgTitle?: string;
  avatarChar?: string;
  avatarClass?: string;
  avatarUrl?: string;
  defaultRole?: WorkspaceRole;
  isPlatformAdmin?: boolean;
};

export async function createWorkspaceUser(
  env: Env,
  input: CreateWorkspaceUserInput,
): Promise<WorkspaceUserRow> {
  const username = normalizeUsername(input.username);
  if (!username) throw new Error("username 无效");
  const taken = await getWorkspaceUserByUsername(env, username);
  if (taken) throw new Error("登录名已存在");

  const id = await allocateUserId(env, username);
  const displayName = input.displayName.trim() || username;
  const avatarChar =
    (input.avatarChar ?? "").trim().slice(0, 1) ||
    displayName.slice(0, 1).toUpperCase() ||
    "?";
  const avatarUrl = normalizeAvatarUrl(input.avatarUrl, "");
  const t = nowIso();
  await env.DB.prepare(
    `INSERT INTO workspace_users (
      id, username, display_name, org_title, avatar_char, avatar_class,
      avatar_url, default_role, is_platform_admin, status,
      password_hash, password_salt, password_iters,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      username,
      displayName,
      (input.orgTitle ?? "").trim(),
      avatarChar,
      (input.avatarClass ?? "").trim() || DEFAULT_AVATAR_CLASS,
      avatarUrl,
      parseWorkspaceRole("guest"),
      input.isPlatformAdmin ? 1 : 0,
      input.passwordHash,
      input.passwordSalt,
      input.passwordIters,
      t,
      t,
    )
    .run();

  const row = await getWorkspaceUserById(env, id);
  if (!row) throw new Error("创建用户失败");
  return row;
}

export type UpdateWorkspaceUserInput = {
  username?: string;
  displayName?: string;
  orgTitle?: string;
  avatarChar?: string;
  avatarClass?: string;
  avatarUrl?: string;
  defaultRole?: WorkspaceRole;
  isPlatformAdmin?: boolean;
  status?: "active" | "disabled";
};

export async function updateWorkspaceUser(
  env: Env,
  userId: string,
  input: UpdateWorkspaceUserInput,
): Promise<WorkspaceUserRow> {
  const existing = await getWorkspaceUserById(env, userId);
  if (!existing) throw new Error("用户不存在");

  let username = existing.username;
  if (input.username !== undefined) {
    username = normalizeUsername(input.username);
    if (!username) throw new Error("username 无效");
    const other = await getWorkspaceUserByUsername(env, username);
    if (other && other.id !== existing.id) throw new Error("登录名已存在");
  }

  const displayName =
    input.displayName !== undefined
      ? input.displayName.trim() || existing.display_name
      : existing.display_name;
  const orgTitle =
    input.orgTitle !== undefined
      ? input.orgTitle.trim()
      : existing.org_title;
  const avatarChar =
    input.avatarChar !== undefined
      ? input.avatarChar.trim().slice(0, 1) || existing.avatar_char
      : existing.avatar_char;
  const avatarClass =
    input.avatarClass !== undefined
      ? input.avatarClass.trim() || existing.avatar_class
      : existing.avatar_class;
  const avatarUrl = normalizeAvatarUrl(
    input.avatarUrl,
    (existing.avatar_url ?? "").trim(),
  );
  const defaultRole = "guest" as WorkspaceRole;
  const isAdmin =
    input.isPlatformAdmin !== undefined
      ? input.isPlatformAdmin
        ? 1
        : 0
      : existing.is_platform_admin;
  const status =
    input.status !== undefined ? input.status : existing.status;

  const t = nowIso();
  await env.DB.prepare(
    `UPDATE workspace_users SET
      username = ?, display_name = ?, org_title = ?,
      avatar_char = ?, avatar_class = ?, avatar_url = ?,
      default_role = ?, is_platform_admin = ?, status = ?,
      updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      username,
      displayName,
      orgTitle,
      avatarChar,
      avatarClass,
      avatarUrl,
      defaultRole,
      isAdmin,
      status,
      t,
      existing.id,
    )
    .run();

  const row = await getWorkspaceUserById(env, existing.id);
  if (!row) throw new Error("更新用户失败");
  return row;
}

export async function updateWorkspaceUserPassword(
  env: Env,
  userId: string,
  passwordHash: string,
  passwordSalt: string,
  passwordIters: number,
): Promise<void> {
  const existing = await getWorkspaceUserById(env, userId);
  if (!existing) throw new Error("用户不存在");
  await env.DB.prepare(
    `UPDATE workspace_users SET
      password_hash = ?, password_salt = ?, password_iters = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(passwordHash, passwordSalt, passwordIters, nowIso(), userId.trim())
    .run();
}

/**
 * 「删除用户」= 停用账号 + 软移除成员关系；保留用户行与资料数据。
 * 仍为未软删项目创建人时拒绝（需先软删或转让项目）。
 */
export async function deleteWorkspaceUser(
  env: Env,
  userId: string,
): Promise<void> {
  const id = userId.trim();
  const existing = await getWorkspaceUserById(env, id);
  if (!existing) throw new Error("用户不存在");

  let ownedCount = 0;
  try {
    const owned = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM projects
       WHERE created_by = ? AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(id)
      .first<{ n: number | string }>();
    ownedCount = Number(owned?.n ?? 0);
  } catch {
    const owned = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM projects WHERE created_by = ?`,
    )
      .bind(id)
      .first<{ n: number | string }>();
    ownedCount = Number(owned?.n ?? 0);
  }
  if (ownedCount > 0) {
    throw new Error(
      `该用户仍是 ${ownedCount} 个项目的创建人，请先转让或删除这些项目后再停用用户`,
    );
  }

  const t = nowIso();
  try {
    await env.DB.prepare(
      `UPDATE project_member_roles
       SET deleted_at = ?, updated_at = ?
       WHERE user_id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(t, t, id)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/Unknown column ['`]?deleted_at['`]?|no such column:\s*deleted_at/i.test(msg)) {
      throw e;
    }
    /* 未迁移成员软删列时仍允许停用用户 */
  }

  await updateWorkspaceUser(env, id, { status: "disabled" });
}

