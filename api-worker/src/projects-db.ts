import type { AppDatabase } from "./app-database";
import { parseAnalysisKind, saveAnalysisKind } from "./analysis-kind";

export type ProjectPhase = "进行中" | "已完成" | "已归档" | "已暂停";

/** 目录可见性：全开放 | 内部邀请（partial/public 为全开放；invite 为内部邀请） */
export type ProjectOpenness = "partial" | "invite";

export type ProjectRow = {
  id: string;
  name: string;
  category: string;
  phase: ProjectPhase;
  summary: string;
  guest_summary: string;
  openness?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  analysis_kind?: string | null;
};

export type ProjectJson = {
  id: string;
  name: string;
  category: string;
  phase: ProjectPhase;
  summary: string;
  guestSummary: string;
  openness: ProjectOpenness;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  analysisKind: "early" | "mature" | "acquire" | null;
};

export function normalizeProjectOpenness(raw: unknown): ProjectOpenness {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "invite") return "invite";
  // partial / public / 缺省：全开放（目录对内部账号可见）
  return "partial";
}

function nowIso(): string {
  return new Date().toISOString();
}

export function rowToJson(row: ProjectRow): ProjectJson {
  const kindRaw = String(row.analysis_kind ?? "")
    .trim()
    .toLowerCase();
  const analysisKind =
    kindRaw === "early" || kindRaw === "mature" || kindRaw === "acquire"
      ? kindRaw
      : null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    phase: normalizeProjectPhase(row.phase),
    summary: row.summary,
    guestSummary: row.guest_summary,
    openness: normalizeProjectOpenness(row.openness),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    analysisKind,
  };
}

const PROJECT_SELECT_WITH_KIND = `SELECT id, name, category, phase, summary, guest_summary, openness,
            created_by, created_at, updated_at, deleted_at, analysis_kind
     FROM projects`;
const PROJECT_SELECT_WITH_OPENNESS = `SELECT id, name, category, phase, summary, guest_summary, openness,
            created_by, created_at, updated_at, deleted_at
     FROM projects`;
const PROJECT_SELECT_LEGACY = `SELECT id, name, category, phase, summary, guest_summary,
            created_by, created_at, updated_at
     FROM projects`;

function isMissingColumn(err: unknown, column: string): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const re = new RegExp(
    `Unknown column ['\`]?${column}['\`]?|no such column:\\s*${column}`,
    "i",
  );
  return re.test(msg);
}

function isMissingOpennessColumn(err: unknown): boolean {
  return isMissingColumn(err, "openness");
}

function isMissingDeletedAtColumn(err: unknown): boolean {
  return isMissingColumn(err, "deleted_at");
}

function notDeletedClause(hasDeletedAt: boolean): string {
  return hasDeletedAt ? " WHERE (deleted_at IS NULL OR deleted_at = '')" : "";
}

function isMissingAnalysisKindColumn(err: unknown): boolean {
  return isMissingColumn(err, "analysis_kind");
}

export async function listProjects(env: { DB: AppDatabase }): Promise<ProjectJson[]> {
  try {
    const { results } = await env.DB.prepare(
      `${PROJECT_SELECT_WITH_KIND}${notDeletedClause(true)} ORDER BY updated_at DESC`,
    ).all<ProjectRow>();
    return (results ?? []).map(rowToJson);
  } catch (e) {
    if (isMissingAnalysisKindColumn(e)) {
      try {
        const { results } = await env.DB.prepare(
          `${PROJECT_SELECT_WITH_OPENNESS}${notDeletedClause(true)} ORDER BY updated_at DESC`,
        ).all<ProjectRow>();
        return (results ?? []).map(rowToJson);
      } catch (eKind) {
        return listProjectsWithoutKind(env, eKind);
      }
    }
    return listProjectsWithoutKind(env, e);
  }
}

async function listProjectsWithoutKind(
  env: { DB: AppDatabase },
  e: unknown,
): Promise<ProjectJson[]> {
  if (isMissingDeletedAtColumn(e)) {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, name, category, phase, summary, guest_summary, openness,
                created_by, created_at, updated_at
         FROM projects ORDER BY updated_at DESC`,
      ).all<ProjectRow>();
      return (results ?? []).map(rowToJson);
    } catch (e2) {
      if (!isMissingOpennessColumn(e2)) throw e2;
      const { results } = await env.DB.prepare(
        `${PROJECT_SELECT_LEGACY} ORDER BY updated_at DESC`,
      ).all<ProjectRow>();
      return (results ?? []).map(rowToJson);
    }
  }
  if (!isMissingOpennessColumn(e)) throw e;
  const { results } = await env.DB.prepare(
    `${PROJECT_SELECT_LEGACY} ORDER BY updated_at DESC`,
  ).all<ProjectRow>();
  return (results ?? []).map(rowToJson);
}

export async function getProjectById(
  env: { DB: AppDatabase },
  id: string,
): Promise<ProjectJson | null> {
  try {
    const row = await env.DB.prepare(
      `${PROJECT_SELECT_WITH_KIND} WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(id)
      .first<ProjectRow>();
    return row ? rowToJson(row) : null;
  } catch (e) {
    if (isMissingAnalysisKindColumn(e)) {
      try {
        const row = await env.DB.prepare(
          `${PROJECT_SELECT_WITH_OPENNESS} WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
        )
          .bind(id)
          .first<ProjectRow>();
        return row ? rowToJson(row) : null;
      } catch (eKind) {
        return getProjectByIdWithoutKind(env, id, eKind);
      }
    }
    return getProjectByIdWithoutKind(env, id, e);
  }
}

async function getProjectByIdWithoutKind(
  env: { DB: AppDatabase },
  id: string,
  e: unknown,
): Promise<ProjectJson | null> {
  if (isMissingDeletedAtColumn(e)) {
    try {
      const row = await env.DB.prepare(
        `SELECT id, name, category, phase, summary, guest_summary, openness,
                created_by, created_at, updated_at
         FROM projects WHERE id = ?`,
      )
        .bind(id)
        .first<ProjectRow>();
      return row ? rowToJson(row) : null;
    } catch (e2) {
      if (!isMissingOpennessColumn(e2)) throw e2;
      const row = await env.DB.prepare(`${PROJECT_SELECT_LEGACY} WHERE id = ?`)
        .bind(id)
        .first<ProjectRow>();
      return row ? rowToJson(row) : null;
    }
  }
  if (!isMissingOpennessColumn(e)) throw e;
  const row = await env.DB.prepare(`${PROJECT_SELECT_LEGACY} WHERE id = ?`)
    .bind(id)
    .first<ProjectRow>();
  return row ? rowToJson(row) : null;
}

/** 仅用 ASCII，避免 PATCH 路径含中文导致边缘 404 */
export function buildProjectId(_name: string): string {
  const suffix = crypto.randomUUID().replace(/-/gu, "").slice(0, 12);
  return `proj-${suffix}`;
}

export async function createProject(
  env: { DB: AppDatabase },
  input: {
    name: string;
    summary: string;
    guestSummary?: string;
    category?: string;
    phase?: ProjectPhase;
    openness?: ProjectOpenness | string;
    analysisKind?: string | null;
    createdBy?: string | null;
  },
): Promise<ProjectJson> {
  const t = nowIso();
  const id = buildProjectId(input.name);
  const guestSummary =
    (input.guestSummary ?? "").trim() || input.summary.trim() ||
    "项目在管推进中，详情按权限展示。";
  const openness =
    input.openness !== undefined && String(input.openness).trim() !== ""
      ? normalizeProjectOpenness(input.openness)
      : "partial";
  await env.DB.prepare(
    `INSERT INTO projects (
      id, name, category, phase, summary, guest_summary, openness,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.name.trim(),
      (input.category ?? "未分类").trim() || "未分类",
      input.phase ?? "进行中",
      input.summary.trim(),
      guestSummary,
      openness,
      input.createdBy ?? null,
      t,
      t,
    )
    .run();
  const kind = parseAnalysisKind(input.analysisKind);
  if (kind) {
    await saveAnalysisKind(env.DB, id, kind);
  }
  const created = await getProjectById(env, id);
  if (!created) throw new Error("项目创建后读取失败");
  return created;
}

const VALID_PHASES: ProjectPhase[] = ["进行中", "已完成", "已归档", "已暂停"];

const LEGACY_PHASE: Record<string, ProjectPhase> = {
  "Active（资源筹备中）": "进行中",
  Active: "进行中",
  资源筹备中: "进行中",
  进行中: "进行中",
  "Completed（已签约）": "已完成",
  Completed: "已完成",
  已签约: "已完成",
  已完成: "已完成",
  "Paused（暂停）": "已暂停",
  Paused: "已暂停",
  暂停: "已暂停",
  已暂停: "已暂停",
  "Cancelled（已取消）": "已归档",
  Cancelled: "已归档",
  已取消: "已归档",
  已归档: "已归档",
};

export function normalizeProjectPhase(raw: string | undefined): ProjectPhase {
  const p = (raw ?? "").trim();
  if (VALID_PHASES.includes(p as ProjectPhase)) return p as ProjectPhase;
  if (LEGACY_PHASE[p]) return LEGACY_PHASE[p];
  if (p.startsWith("Paused")) return "已暂停";
  if (p.startsWith("Completed")) return "已完成";
  if (p.startsWith("Cancelled")) return "已归档";
  if (p.startsWith("Active")) return "进行中";
  return "进行中";
}

export async function updateProject(
  env: { DB: AppDatabase },
  id: string,
  input: {
    name?: string;
    summary?: string;
    guestSummary?: string;
    category?: string;
    phase?: ProjectPhase;
    openness?: ProjectOpenness | string;
    analysisKind?: string | null;
  },
): Promise<ProjectJson | null> {
  const existing = await getProjectById(env, id);
  if (!existing) return null;

  const name = (input.name ?? existing.name).trim();
  if (!name) throw new Error("项目名称不能为空");

  const summary = (input.summary ?? existing.summary).trim();
  const guestSummary = summary;
  const category = ((input.category ?? existing.category).trim() || "未分类");
  const phase = normalizeProjectPhase(input.phase ?? existing.phase);
  const openness =
    input.openness !== undefined
      ? normalizeProjectOpenness(input.openness)
      : existing.openness;

  await env.DB.prepare(
    `UPDATE projects
     SET name = ?, category = ?, phase = ?, summary = ?, guest_summary = ?,
         openness = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      name,
      category,
      phase,
      summary,
      guestSummary,
      openness,
      nowIso(),
      id,
    )
    .run();

  if (input.analysisKind !== undefined) {
    const kind = parseAnalysisKind(input.analysisKind);
    if (!kind) throw new Error("项目形态无效");
    await saveAnalysisKind(env.DB, id, kind);
  }

  return getProjectById(env, id);
}

/**
 * 软删除项目：仅标记 deleted_at，保留资料、对话、知识网络与对象存储。
 * 兼容旧名 deleteProjectCascade。
 */
export async function softDeleteProject(
  env: { DB: AppDatabase },
  projectId: string,
): Promise<boolean> {
  const existing = await getProjectById(env, projectId);
  if (!existing) return false;

  const t = nowIso();
  try {
    await env.DB.prepare(
      `UPDATE projects
       SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(t, t, projectId)
      .run();
  } catch (e) {
    if (!isMissingDeletedAtColumn(e)) throw e;
    // 未迁移时拒绝硬删，避免误清资料
    throw new Error("软删除列未迁移（缺少 projects.deleted_at），请先执行 migration 0013");
  }
  return true;
}

/** @deprecated 使用 softDeleteProject；保留别名避免调用方遗漏 */
export async function deleteProjectCascade(
  env: { DB: AppDatabase },
  projectId: string,
): Promise<boolean> {
  return softDeleteProject(env, projectId);
}
