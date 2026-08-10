import type { AppDatabase } from "./app-database";

export type SkillSyncStatus = "pending" | "ok" | "error";

export type HermesSkillRow = {
  name: string;
  title: string;
  description: string;
  intent: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
  sync_status: SkillSyncStatus;
  sync_error: string | null;
  file_count?: number;
};

const MAX_DESCRIPTION_LEN = 512;

export function normalizeDescription(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, MAX_DESCRIPTION_LEN);
}

export type HermesSkillFileRow = {
  skill_name: string;
  rel_path: string;
  content_b64: string;
  is_text: number;
  byte_size: number;
  updated_at: string;
};

const SKILL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 500;
const TEXT_EXT_RE =
  /\.(md|markdown|txt|json|ya?ml|html?|css|js|mjs|cjs|ts|tsx|jsx|sh|py|xml|svg|csv|toml|ini|cfg|conf)$/iu;

export function assertSkillName(name: string): string {
  const n = String(name ?? "").trim();
  if (!n || !SKILL_NAME_RE.test(n) || n.includes("..")) {
    throw Object.assign(new Error("无效的 skill 名称"), { status: 400 });
  }
  return n;
}

export function assertRelPath(relPath: string): string {
  const raw = String(relPath ?? "")
    .trim()
    .replace(/\\/gu, "/");
  if (!raw || raw.startsWith("/") || raw.includes("..")) {
    throw Object.assign(new Error(`无效的相对路径：${relPath}`), {
      status: 400,
    });
  }
  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === "." || p === "..")) {
    throw Object.assign(new Error(`无效的相对路径：${relPath}`), {
      status: 400,
    });
  }
  return parts.join("/");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function titleFromSkillMd(content: string, fallback: string): string {
  const lines = content.split(/\r?\n/u);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#")) {
      return t.replace(/^#+\s*/u, "").trim().slice(0, 200) || fallback;
    }
    break;
  }
  return fallback;
}

export function defaultSkillMarkdown(name: string, title?: string): string {
  const t = (title || name).trim() || name;
  return `# ${t}

## 用途

（在此说明该 skill 的适用场景与产出。）

## 步骤

1. …
2. …

## 约束

- 用简体中文回复用户
- 不要暴露内部实现细节
`;
}

export function isTextPath(relPath: string): boolean {
  return TEXT_EXT_RE.test(relPath);
}

export function utf8ToB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function b64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function byteLengthB64(b64: string): number {
  const binary = atob(b64);
  return binary.length;
}

export type IncomingSkillFile = {
  path: string;
  contentBase64: string;
  isText?: boolean;
};

export function normalizeIncomingFiles(
  files: IncomingSkillFile[],
): Array<{ rel_path: string; content_b64: string; is_text: number; byte_size: number }> {
  if (!Array.isArray(files) || files.length === 0) {
    throw Object.assign(new Error("files 不能为空"), { status: 400 });
  }
  if (files.length > MAX_FILES) {
    throw Object.assign(new Error(`文件过多（上限 ${MAX_FILES}）`), {
      status: 400,
    });
  }
  const out = [];
  for (const f of files) {
    const rel_path = assertRelPath(f.path);
    const content_b64 = String(f.contentBase64 ?? "");
    if (!content_b64) {
      throw Object.assign(new Error(`缺少内容：${rel_path}`), { status: 400 });
    }
    let byte_size: number;
    try {
      byte_size = byteLengthB64(content_b64);
    } catch {
      throw Object.assign(new Error(`无效 base64：${rel_path}`), {
        status: 400,
      });
    }
    if (byte_size > MAX_FILE_BYTES) {
      throw Object.assign(new Error(`文件过大：${rel_path}`), { status: 400 });
    }
    const is_text =
      typeof f.isText === "boolean"
        ? f.isText
          ? 1
          : 0
        : isTextPath(rel_path)
          ? 1
          : 0;
    out.push({ rel_path, content_b64, is_text, byte_size });
  }
  if (!out.some((x) => x.rel_path === "SKILL.md")) {
    throw Object.assign(new Error("必须包含 SKILL.md"), { status: 400 });
  }
  return out;
}

export async function listSkillsFromDb(
  db: AppDatabase,
): Promise<HermesSkillRow[]> {
  const { results } = await db
    .prepare(
      `SELECT s.name, s.title, s.description, s.intent, s.created_at, s.updated_at, s.synced_at,
              s.sync_status, s.sync_error,
              (SELECT COUNT(*) FROM hermes_skill_files f WHERE f.skill_name = s.name) AS file_count
       FROM hermes_skills s
       ORDER BY s.name ASC`,
    )
    .all<HermesSkillRow & { file_count: number }>();
  return (results ?? []).map((r) => ({
    ...r,
    description: String(r.description ?? ""),
    intent: r.intent ?? null,
    sync_status: (r.sync_status as SkillSyncStatus) || "pending",
    file_count: Number(r.file_count ?? 0),
  }));
}

export async function getSkillMeta(
  db: AppDatabase,
  name: string,
): Promise<HermesSkillRow | null> {
  const row = await db
    .prepare(
      `SELECT name, title, description, intent, created_at, updated_at, synced_at, sync_status, sync_error
       FROM hermes_skills WHERE name = ?`,
    )
    .bind(name)
    .first<HermesSkillRow>();
  if (!row) return null;
  return { ...row, description: String(row.description ?? "") };
}

export async function listSkillFiles(
  db: AppDatabase,
  name: string,
): Promise<HermesSkillFileRow[]> {
  const { results } = await db
    .prepare(
      `SELECT skill_name, rel_path, content_b64, is_text, byte_size, updated_at
       FROM hermes_skill_files WHERE skill_name = ? ORDER BY rel_path ASC`,
    )
    .bind(name)
    .all<HermesSkillFileRow>();
  return results ?? [];
}

export async function listSkillFileMeta(
  db: AppDatabase,
  name: string,
): Promise<Array<{ path: string; byteSize: number; isText: boolean }>> {
  const { results } = await db
    .prepare(
      `SELECT rel_path, byte_size, is_text FROM hermes_skill_files
       WHERE skill_name = ? ORDER BY rel_path ASC`,
    )
    .bind(name)
    .all<{ rel_path: string; byte_size: number; is_text: number }>();
  return (results ?? []).map((r) => ({
    path: r.rel_path,
    byteSize: Number(r.byte_size ?? 0),
    isText: Boolean(r.is_text),
  }));
}

export async function getSkillMdContent(
  db: AppDatabase,
  name: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT content_b64 FROM hermes_skill_files
       WHERE skill_name = ? AND rel_path = 'SKILL.md'`,
    )
    .bind(name)
    .first<{ content_b64: string }>();
  if (!row?.content_b64) return null;
  return b64ToUtf8(row.content_b64);
}

async function replaceSkillFiles(
  db: AppDatabase,
  name: string,
  files: Array<{
    rel_path: string;
    content_b64: string;
    is_text: number;
    byte_size: number;
  }>,
  updatedAt: string,
): Promise<void> {
  await db
    .prepare(`DELETE FROM hermes_skill_files WHERE skill_name = ?`)
    .bind(name)
    .run();
  for (const f of files) {
    await db
      .prepare(
        `INSERT INTO hermes_skill_files
          (skill_name, rel_path, content_b64, is_text, byte_size, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        name,
        f.rel_path,
        f.content_b64,
        f.is_text,
        f.byte_size,
        updatedAt,
      )
      .run();
  }
}

export async function upsertSkillWithFiles(
  db: AppDatabase,
  name: string,
  title: string,
  files: Array<{
    rel_path: string;
    content_b64: string;
    is_text: number;
    byte_size: number;
  }>,
  opts?: { createOnly?: boolean; description?: string },
): Promise<{ created: boolean }> {
  const ts = nowIso();
  const existing = await getSkillMeta(db, name);
  if (existing && opts?.createOnly) {
    throw Object.assign(new Error(`skill 已存在：${name}`), { status: 409 });
  }
  const description =
    opts?.description !== undefined
      ? normalizeDescription(opts.description)
      : (existing?.description ?? "");
  if (!existing) {
    await db
      .prepare(
        `INSERT INTO hermes_skills
          (name, title, description, created_at, updated_at, synced_at, sync_status, sync_error)
         VALUES (?, ?, ?, ?, ?, NULL, 'pending', NULL)`,
      )
      .bind(name, title, description, ts, ts)
      .run();
  } else if (opts?.description !== undefined) {
    await db
      .prepare(
        `UPDATE hermes_skills
         SET title = ?, description = ?, updated_at = ?, sync_status = 'pending', sync_error = NULL
         WHERE name = ?`,
      )
      .bind(title, description, ts, name)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE hermes_skills
         SET title = ?, updated_at = ?, sync_status = 'pending', sync_error = NULL
         WHERE name = ?`,
      )
      .bind(title, ts, name)
      .run();
  }
  await replaceSkillFiles(db, name, files, ts);
  return { created: !existing };
}

export async function updateSkillMdOnly(
  db: AppDatabase,
  name: string,
  content: string,
  opts?: { description?: string },
): Promise<void> {
  const meta = await getSkillMeta(db, name);
  if (!meta) {
    throw Object.assign(new Error(`找不到 skill：${name}`), { status: 404 });
  }
  const content_b64 = utf8ToB64(content);
  const byte_size = byteLengthB64(content_b64);
  if (byte_size > MAX_FILE_BYTES) {
    throw Object.assign(new Error("SKILL.md 过大"), { status: 400 });
  }
  const ts = nowIso();
  const title = titleFromSkillMd(content, name);
  const existing = await db
    .prepare(
      `SELECT rel_path FROM hermes_skill_files
       WHERE skill_name = ? AND rel_path = 'SKILL.md'`,
    )
    .bind(name)
    .first();
  if (existing) {
    await db
      .prepare(
        `UPDATE hermes_skill_files
         SET content_b64 = ?, is_text = 1, byte_size = ?, updated_at = ?
         WHERE skill_name = ? AND rel_path = 'SKILL.md'`,
      )
      .bind(content_b64, byte_size, ts, name)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO hermes_skill_files
          (skill_name, rel_path, content_b64, is_text, byte_size, updated_at)
         VALUES (?, 'SKILL.md', ?, 1, ?, ?)`,
      )
      .bind(name, content_b64, byte_size, ts)
      .run();
  }
  if (opts?.description !== undefined) {
    const description = normalizeDescription(opts.description);
    await db
      .prepare(
        `UPDATE hermes_skills
         SET title = ?, description = ?, updated_at = ?, sync_status = 'pending', sync_error = NULL
         WHERE name = ?`,
      )
      .bind(title, description, ts, name)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE hermes_skills
         SET title = ?, updated_at = ?, sync_status = 'pending', sync_error = NULL
         WHERE name = ?`,
      )
      .bind(title, ts, name)
      .run();
  }
}

export async function deleteSkillFromDb(
  db: AppDatabase,
  name: string,
): Promise<boolean> {
  const meta = await getSkillMeta(db, name);
  if (!meta) return false;
  await db.prepare(`DELETE FROM hermes_skills WHERE name = ?`).bind(name).run();
  return true;
}

export async function setSkillSyncResult(
  db: AppDatabase,
  name: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  const ts = nowIso();
  if (ok) {
    await db
      .prepare(
        `UPDATE hermes_skills
         SET sync_status = 'ok', sync_error = NULL, synced_at = ?
         WHERE name = ?`,
      )
      .bind(ts, name)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE hermes_skills
         SET sync_status = 'error', sync_error = ?
         WHERE name = ?`,
      )
      .bind((error ?? "同步失败").slice(0, 2000), name)
      .run();
  }
}
