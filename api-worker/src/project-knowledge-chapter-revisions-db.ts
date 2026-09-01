import type { AppDatabase } from "./app-database";
import {
  isResearchChapterId,
  nextChapterVersion,
  normalizeStoredChapterVersion,
  researchChaptersComplete,
  type ChapterVersionBump,
} from "./chapter-version";
import { getStoredAnalysisKind } from "./analysis-kind";
import { DEFAULT_ANALYSIS_KIND } from "./analysis-kind";
import { mergeMatureDraftItemsForPublish } from "./kn-legacy-map";
import { repairStoredChapterHtml } from "./chapter-revise-parse";
import {
  getProjectKnowledgeChapterHtml,
  listProjectKnowledgeChapterHtml,
  type ProjectKnowledgeChapterHtmlPublic,
  upsertProjectKnowledgeChapterHtml,
} from "./project-knowledge-chapters-db";
import { syncProjectSourcesFromPublishedChapters } from "./project-knowledge-sources-sync";

export type DraftRunStatus =
  | "generating"
  | "ready"
  | "failed"
  | "published"
  | "discarded";

export type DraftItemStatus = "pending" | "ok" | "failed" | "revising";

export type ChapterBundle = {
  projectId: string;
  version: number;
  overviewVersion: number;
  overviewKnVersion: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type DraftRun = {
  id: string;
  projectId: string;
  scope: string;
  status: DraftRunStatus;
  baseVersion: number;
  progressDone: number;
  progressTotal: number;
  failedCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type DraftItem = {
  runId: string;
  sectionId: string;
  status: DraftItemStatus;
  html: string | null;
  error: string | null;
  /** 最近一次改写说明（AI 短回复）；改写中可为空 */
  reviseNote: string | null;
  llmBackend: string | null;
  updatedAt: string;
};

export type ChapterVersionMeta = {
  projectId: string;
  version: number;
  archivedAt: string;
  archivedBy: string | null;
  sectionCount: number;
};

export type OverviewVersionMeta = {
  projectId: string;
  version: number;
  knVersion: number;
  archivedAt: string;
  archivedBy: string | null;
};

export type OverviewVersionDetail = OverviewVersionMeta & {
  html: string;
  graphHtml: string | null;
};

function missingOverviewCols(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /overview_version|overview_kn_version|project_overview_versions/i.test(
    msg,
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function newRunId(): string {
  return `cdr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function ensureChapterBundle(
  db: AppDatabase,
  projectId: string,
  userId?: string | null,
): Promise<ChapterBundle> {
  const mapRow = (row: {
    project_id: string;
    version: number;
    overview_version?: number | null;
    overview_kn_version?: number | null;
    updated_at: string;
    updated_by: string | null;
  }): ChapterBundle => ({
    projectId: row.project_id,
    version: normalizeStoredChapterVersion(row.version),
    overviewVersion: Math.max(0, Math.trunc(Number(row.overview_version) || 0)),
    overviewKnVersion: normalizeStoredChapterVersion(
      row.overview_kn_version ?? 0,
    ),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  });

  try {
    const existing = await db
      .prepare(
        `SELECT project_id, version, overview_version, overview_kn_version,
                updated_at, updated_by
         FROM project_knowledge_chapter_bundle WHERE project_id = ?`,
      )
      .bind(projectId)
      .first<{
        project_id: string;
        version: number;
        overview_version: number | null;
        overview_kn_version: number | null;
        updated_at: string;
        updated_by: string | null;
      }>();
    if (existing) return mapRow(existing);
  } catch (e) {
    if (!missingOverviewCols(e)) throw e;
    const existing = await db
      .prepare(
        `SELECT project_id, version, updated_at, updated_by
         FROM project_knowledge_chapter_bundle WHERE project_id = ?`,
      )
      .bind(projectId)
      .first<{
        project_id: string;
        version: number;
        updated_at: string;
        updated_by: string | null;
      }>();
    if (existing) return mapRow(existing);
  }
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO project_knowledge_chapter_bundle
         (project_id, version, updated_at, updated_by)
       VALUES (?, 0, ?, ?)
       ON DUPLICATE KEY UPDATE project_id = project_id`,
    )
    .bind(projectId, now, userId ?? null)
    .run();
  return {
    projectId,
    version: 0,
    overviewVersion: 0,
    overviewKnVersion: 0,
    updatedAt: now,
    updatedBy: userId ?? null,
  };
}

function rowToDraftRun(r: {
  id: string;
  project_id: string;
  scope: string;
  status: string;
  base_version: number;
  progress_done: number;
  progress_total: number;
  failed_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}): DraftRun {
  return {
    id: r.id,
    projectId: r.project_id,
    scope: r.scope,
    status: r.status as DraftRunStatus,
    baseVersion: normalizeStoredChapterVersion(r.base_version),
    progressDone: Number(r.progress_done) || 0,
    progressTotal: Number(r.progress_total) || 13,
    failedCount: Number(r.failed_count) || 0,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  };
}

export async function getDraftRun(
  db: AppDatabase,
  runId: string,
): Promise<DraftRun | null> {
  const row = await db
    .prepare(
      `SELECT id, project_id, scope, status, base_version, progress_done,
              progress_total, failed_count, created_by, created_at, updated_at, published_at
       FROM project_knowledge_chapter_draft_runs WHERE id = ?`,
    )
    .bind(runId)
    .first<{
      id: string;
      project_id: string;
      scope: string;
      status: string;
      base_version: number;
      progress_done: number;
      progress_total: number;
      failed_count: number;
      created_by: string | null;
      created_at: string;
      updated_at: string;
      published_at: string | null;
    }>();
  return row ? rowToDraftRun(row) : null;
}

export async function listDraftRunsByIds(
  db: AppDatabase,
  runIds: string[],
): Promise<DraftRun[]> {
  const unique = [...new Set(runIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => "?").join(", ");
  const q = await db
    .prepare(
      `SELECT id, project_id, scope, status, base_version, progress_done,
              progress_total, failed_count, created_by, created_at, updated_at, published_at
       FROM project_knowledge_chapter_draft_runs
       WHERE id IN (${placeholders})`,
    )
    .bind(...unique)
    .all<{
      id: string;
      project_id: string;
      scope: string;
      status: string;
      base_version: number;
      progress_done: number;
      progress_total: number;
      failed_count: number;
      created_by: string | null;
      created_at: string;
      updated_at: string;
      published_at: string | null;
    }>();
  return (q.results ?? []).map(rowToDraftRun);
}

/** 跨项目：列出指定项目下 generating/ready 的草案 run */
export async function listActiveDraftRunsForProjects(
  db: AppDatabase,
  projectIds: string[],
): Promise<DraftRun[]> {
  if (projectIds.length === 0) return [];
  const placeholders = projectIds.map(() => "?").join(", ");
  const q = await db
    .prepare(
      `SELECT id, project_id, scope, status, base_version, progress_done,
              progress_total, failed_count, created_by, created_at, updated_at, published_at
       FROM project_knowledge_chapter_draft_runs
       WHERE project_id IN (${placeholders})
         AND status IN ('generating', 'ready')
       ORDER BY created_at DESC`,
    )
    .bind(...projectIds)
    .all<{
      id: string;
      project_id: string;
      scope: string;
      status: string;
      base_version: number;
      progress_done: number;
      progress_total: number;
      failed_count: number;
      created_by: string | null;
      created_at: string;
      updated_at: string;
      published_at: string | null;
    }>();
  return (q.results ?? []).map(rowToDraftRun);
}

/** 取 run 内研究章节 id（排除 sources/glossary） */
export async function listResearchSectionIdsForRun(
  db: AppDatabase,
  runId: string,
): Promise<string[]> {
  const q = await db
    .prepare(
      `SELECT section_id FROM project_knowledge_chapter_draft_items
       WHERE run_id = ?
         AND section_id NOT IN ('sources', 'glossary', 'project-graph')
       ORDER BY section_id ASC`,
    )
    .bind(runId)
    .all<{ section_id: string }>();
  return (q.results ?? []).map((r) => r.section_id);
}

export async function findActiveDraftRun(
  db: AppDatabase,
  projectId: string,
): Promise<DraftRun | null> {
  const row = await db
    .prepare(
      `SELECT id, project_id, scope, status, base_version, progress_done,
              progress_total, failed_count, created_by, created_at, updated_at, published_at
       FROM project_knowledge_chapter_draft_runs
       WHERE project_id = ? AND status IN ('generating', 'ready')
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(projectId)
    .first<{
      id: string;
      project_id: string;
      scope: string;
      status: string;
      base_version: number;
      progress_done: number;
      progress_total: number;
      failed_count: number;
      created_by: string | null;
      created_at: string;
      updated_at: string;
      published_at: string | null;
    }>();
  return row ? rowToDraftRun(row) : null;
}

export async function createDraftRun(
  db: AppDatabase,
  input: {
    projectId: string;
    createdBy: string;
    scope: "full" | "section";
    sectionIds: string[];
  },
): Promise<DraftRun> {
  const bundle = await ensureChapterBundle(db, input.projectId, input.createdBy);
  const id = newRunId();
  const now = nowIso();
  const total = input.sectionIds.length;
  await db
    .prepare(
      `INSERT INTO project_knowledge_chapter_draft_runs
         (id, project_id, scope, status, base_version, progress_done, progress_total,
          failed_count, created_by, created_at, updated_at, published_at)
       VALUES (?, ?, ?, 'generating', ?, 0, ?, 0, ?, ?, ?, NULL)`,
    )
    .bind(
      id,
      input.projectId,
      input.scope,
      bundle.version,
      total,
      input.createdBy,
      now,
      now,
    )
    .run();

  for (const sectionId of input.sectionIds) {
    await db
      .prepare(
        `INSERT INTO project_knowledge_chapter_draft_items
           (run_id, section_id, status, html, error, llm_backend, updated_at)
         VALUES (?, ?, 'pending', NULL, NULL, NULL, ?)`,
      )
      .bind(id, sectionId, now)
      .run();
  }

  const run = await getDraftRun(db, id);
  if (!run) throw new Error("创建草案 run 后读取失败");
  return run;
}

/** @deprecated 使用 createDraftRun */
export async function createFullDraftRun(
  db: AppDatabase,
  input: {
    projectId: string;
    createdBy: string;
    sectionIds: string[];
  },
): Promise<DraftRun> {
  return createDraftRun(db, {
    ...input,
    scope: "full",
  });
}

function rowToDraftItem(r: {
  run_id: string;
  section_id: string;
  status: string;
  html: string | null;
  error: string | null;
  revise_note?: string | null;
  llm_backend: string | null;
  updated_at: string;
}): DraftItem {
  return {
    runId: r.run_id,
    sectionId: r.section_id,
    status: r.status as DraftItemStatus,
    html: r.html,
    error: r.error,
    reviseNote: r.revise_note ?? null,
    llmBackend: r.llm_backend,
    updatedAt: r.updated_at,
  };
}

export async function listDraftItems(
  db: AppDatabase,
  runId: string,
): Promise<DraftItem[]> {
  try {
    const q = await db
      .prepare(
        `SELECT run_id, section_id, status, html, error, revise_note, llm_backend, updated_at
         FROM project_knowledge_chapter_draft_items
         WHERE run_id = ?
         ORDER BY section_id ASC`,
      )
      .bind(runId)
      .all<{
        run_id: string;
        section_id: string;
        status: string;
        html: string | null;
        error: string | null;
        revise_note: string | null;
        llm_backend: string | null;
        updated_at: string;
      }>();
    return (q.results ?? []).map(rowToDraftItem);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      !/Unknown column ['`]?revise_note['`]?/i.test(msg) &&
      !/no such column:\s*revise_note/i.test(msg)
    ) {
      throw e;
    }
    const q = await db
      .prepare(
        `SELECT run_id, section_id, status, html, error, llm_backend, updated_at
         FROM project_knowledge_chapter_draft_items
         WHERE run_id = ?
         ORDER BY section_id ASC`,
      )
      .bind(runId)
      .all<{
        run_id: string;
        section_id: string;
        status: string;
        html: string | null;
        error: string | null;
        llm_backend: string | null;
        updated_at: string;
      }>();
    return (q.results ?? []).map(rowToDraftItem);
  }
}

export async function getDraftItem(
  db: AppDatabase,
  runId: string,
  sectionId: string,
): Promise<DraftItem | null> {
  try {
    const r = await db
      .prepare(
        `SELECT run_id, section_id, status, html, error, revise_note, llm_backend, updated_at
         FROM project_knowledge_chapter_draft_items
         WHERE run_id = ? AND section_id = ?`,
      )
      .bind(runId, sectionId)
      .first<{
        run_id: string;
        section_id: string;
        status: string;
        html: string | null;
        error: string | null;
        revise_note: string | null;
        llm_backend: string | null;
        updated_at: string;
      }>();
    return r ? rowToDraftItem(r) : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      !/Unknown column ['`]?revise_note['`]?/i.test(msg) &&
      !/no such column:\s*revise_note/i.test(msg)
    ) {
      throw e;
    }
    const r = await db
      .prepare(
        `SELECT run_id, section_id, status, html, error, llm_backend, updated_at
         FROM project_knowledge_chapter_draft_items
         WHERE run_id = ? AND section_id = ?`,
      )
      .bind(runId, sectionId)
      .first<{
        run_id: string;
        section_id: string;
        status: string;
        html: string | null;
        error: string | null;
        llm_backend: string | null;
        updated_at: string;
      }>();
    return r ? rowToDraftItem(r) : null;
  }
}

export async function upsertDraftItem(
  db: AppDatabase,
  input: {
    runId: string;
    sectionId: string;
    status: DraftItemStatus;
    html?: string | null;
    error?: string | null;
    /** 传入则写入；省略则保留原值 */
    reviseNote?: string | null;
    llmBackend?: string | null;
  },
): Promise<void> {
  const now = nowIso();
  const existing =
    input.reviseNote === undefined
      ? await getDraftItem(db, input.runId, input.sectionId)
      : null;
  const reviseNote =
    input.reviseNote !== undefined
      ? input.reviseNote
      : (existing?.reviseNote ?? null);

  try {
    await db
      .prepare(
        `INSERT INTO project_knowledge_chapter_draft_items
           (run_id, section_id, status, html, error, revise_note, llm_backend, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           status = VALUES(status),
           html = VALUES(html),
           error = VALUES(error),
           revise_note = VALUES(revise_note),
           llm_backend = VALUES(llm_backend),
           updated_at = VALUES(updated_at)`,
      )
      .bind(
        input.runId,
        input.sectionId,
        input.status,
        input.html ?? null,
        input.error ?? null,
        reviseNote,
        input.llmBackend ?? null,
        now,
      )
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      !/Unknown column ['`]?revise_note['`]?/i.test(msg) &&
      !/no such column:\s*revise_note/i.test(msg)
    ) {
      throw e;
    }
    await db
      .prepare(
        `INSERT INTO project_knowledge_chapter_draft_items
           (run_id, section_id, status, html, error, llm_backend, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           status = VALUES(status),
           html = VALUES(html),
           error = VALUES(error),
           llm_backend = VALUES(llm_backend),
           updated_at = VALUES(updated_at)`,
      )
      .bind(
        input.runId,
        input.sectionId,
        input.status,
        input.html ?? null,
        input.error ?? null,
        input.llmBackend ?? null,
        now,
      )
      .run();
  }
}

export async function deleteDraftItem(
  db: AppDatabase,
  runId: string,
  sectionId: string,
): Promise<boolean> {
  const existing = await getDraftItem(db, runId, sectionId);
  if (!existing) return false;

  await db
    .prepare(
      `DELETE FROM project_knowledge_chapter_draft_items
       WHERE run_id = ? AND section_id = ?`,
    )
    .bind(runId, sectionId)
    .run();

  const items = await listDraftItems(db, runId);
  const research = items.filter(
    (i) =>
      i.sectionId !== "sources" &&
      i.sectionId !== "glossary" &&
      i.sectionId !== "project-graph",
  );
  const done = research.filter(
    (i) => i.status === "ok" || i.status === "failed",
  ).length;
  const failed = research.filter((i) => i.status === "failed").length;
  const now = nowIso();
  await db
    .prepare(
      `UPDATE project_knowledge_chapter_draft_runs
       SET progress_done = ?, progress_total = ?, failed_count = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(done, research.length, failed, now, runId)
    .run();
  return true;
}

export async function refreshDraftRunProgress(
  db: AppDatabase,
  runId: string,
): Promise<DraftRun> {
  const items = await listDraftItems(db, runId);
  // 进度只计主章（研究章 / 概览），不含 meta
  const research = items.filter(
    (i) =>
      i.sectionId !== "sources" &&
      i.sectionId !== "glossary" &&
      i.sectionId !== "project-graph",
  );
  const done = research.filter(
    (i) => i.status === "ok" || i.status === "failed",
  ).length;
  const failed = research.filter((i) => i.status === "failed").length;
  const allSettled = research.length > 0 && done >= research.length;
  const anyOk = research.some((i) => i.status === "ok");
  let status: DraftRunStatus = "generating";
  if (allSettled) {
    status = anyOk ? "ready" : "failed";
  }
  const now = nowIso();
  await db
    .prepare(
      `UPDATE project_knowledge_chapter_draft_runs
       SET progress_done = ?, failed_count = ?, status = ?, updated_at = ?
       WHERE id = ? AND status IN ('generating', 'ready', 'failed')`,
    )
    .bind(done, failed, status, now, runId)
    .run();
  const run = await getDraftRun(db, runId);
  if (!run) throw new Error("更新草案进度后读取失败");
  return run;
}

export async function setDraftRunStatus(
  db: AppDatabase,
  runId: string,
  status: DraftRunStatus,
  extra?: { publishedAt?: string | null },
): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `UPDATE project_knowledge_chapter_draft_runs
       SET status = ?, updated_at = ?, published_at = COALESCE(?, published_at)
       WHERE id = ?`,
    )
    .bind(status, now, extra?.publishedAt ?? null, runId)
    .run();
}

export async function archiveLiveChaptersAsVersion(
  db: AppDatabase,
  input: {
    projectId: string;
    version: number;
    archivedBy: string;
  },
): Promise<number> {
  const live = await listProjectKnowledgeChapterHtml(db, input.projectId);
  const now = nowIso();
  let n = 0;
  for (const ch of live) {
    if (!ch.html?.trim()) continue;
    // 概览与关系图走独立版号，不写入知识网络归档
    if (ch.sectionId === "project-overview" || ch.sectionId === "project-graph") {
      continue;
    }
    await db
      .prepare(
        `INSERT INTO project_knowledge_chapter_versions
           (project_id, version, section_id, html, source, llm_backend, archived_at, archived_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           html = VALUES(html),
           source = VALUES(source),
           llm_backend = VALUES(llm_backend),
           archived_at = VALUES(archived_at),
           archived_by = VALUES(archived_by)`,
      )
      .bind(
        input.projectId,
        input.version,
        ch.sectionId,
        ch.html,
        ch.source,
        ch.llmBackend,
        now,
        input.archivedBy,
      )
      .run();
    n += 1;
  }
  return n;
}

export async function publishDraftRunToLive(
  db: AppDatabase,
  input: {
    run: DraftRun;
    publishedBy: string;
    /** 仅发布这些章节；省略则发布全部 status=ok 的条目 */
    sectionIds?: string[] | null;
    /** patch=补丁；minor=次版本（默认）；major=主版本。未齐章时忽略，走 0.x / 1.0 */
    bump?: ChapterVersionBump;
  },
  ): Promise<{
  newVersion: number;
  overviewVersion: number;
  overviewKnVersion: number;
  publishedKnowledge: boolean;
  publishedOverview: boolean;
  appliedSections: string[];
  runClosed: boolean;
}> {
  const bundle = await ensureChapterBundle(
    db,
    input.run.projectId,
    input.publishedBy,
  );
  const currentVersion = normalizeStoredChapterVersion(bundle.version);

  const items = await listDraftItems(db, input.run.id);
  const filterSet =
    input.sectionIds && input.sectionIds.length > 0
      ? new Set(input.sectionIds)
      : null;
  // 发布研究章时同步 meta：sources/glossary；发布概览时再带上关系图
  if (filterSet) {
    const hasResearch = [...filterSet].some((id) => isResearchChapterId(id));
    if (hasResearch) {
      filterSet.add("sources");
      filterSet.add("glossary");
    }
    if (filterSet.has("project-overview")) {
      filterSet.add("project-graph");
    }
  }

  const readyItems = items.filter(
    (item) => item.status === "ok" && Boolean(item.html?.trim()),
  );
  const analysisKind =
    (await getStoredAnalysisKind(db, input.run.projectId)) ??
    DEFAULT_ANALYSIS_KIND;
  const remapped =
    analysisKind === "mature"
      ? mergeMatureDraftItemsForPublish(readyItems)
      : readyItems;
  const willApply = remapped.filter(
    (item) => !filterSet || filterSet.has(item.sectionId),
  );
  if (willApply.length === 0) {
    throw new Error("没有可发布的章节");
  }
  const publishedKnowledge = willApply.some((item) =>
    isResearchChapterId(item.sectionId),
  );
  const publishedOverview = willApply.some(
    (item) => item.sectionId === "project-overview",
  );

  // 仅知识网络升版时才归档当前正式章；只发概览不碰知识网络版号
  if (publishedKnowledge && currentVersion > 0) {
    const archivedCount = await db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM project_knowledge_chapter_versions
         WHERE project_id = ? AND version = ?`,
      )
      .bind(input.run.projectId, currentVersion)
      .first<{ cnt: number | string }>();
    if (!(Number(archivedCount?.cnt ?? 0) > 0)) {
      await archiveLiveChaptersAsVersion(db, {
        projectId: input.run.projectId,
        version: currentVersion,
        archivedBy: input.publishedBy,
      });
    }
  }

  const applied: string[] = [];
  for (const item of willApply) {
    await upsertProjectKnowledgeChapterHtml(db, {
      projectId: input.run.projectId,
      sectionId: item.sectionId,
      html: repairStoredChapterHtml(item.html ?? ""),
      source: "generate",
      llmBackend: item.llmBackend,
      updatedBy: input.publishedBy,
    });
    applied.push(item.sectionId);
  }
  const now = nowIso();
  let newVersion = currentVersion;
  let overviewVersion = bundle.overviewVersion;
  let overviewKnVersion = bundle.overviewKnVersion;

  if (publishedKnowledge) {
    const liveAfter = await listProjectKnowledgeChapterHtml(
      db,
      input.run.projectId,
    );
    const allResearchComplete = researchChaptersComplete(
      new Map(liveAfter.map((c) => [c.sectionId, c.html])),
      analysisKind,
    );
    newVersion = nextChapterVersion(currentVersion, {
      bump: input.bump ?? "minor",
      allResearchComplete,
    });
    await db
      .prepare(
        `UPDATE project_knowledge_chapter_bundle
         SET version = ?, updated_at = ?, updated_by = ?
         WHERE project_id = ?`,
      )
      .bind(newVersion, now, input.publishedBy, input.run.projectId)
      .run();
    try {
      await syncProjectSourcesFromPublishedChapters(
        db,
        input.run.projectId,
        input.publishedBy,
      );
    } catch {
      /* 正式章节已发布；来源表回填失败不阻断归档 */
    }
    await archiveLiveChaptersAsVersion(db, {
      projectId: input.run.projectId,
      version: newVersion,
      archivedBy: input.publishedBy,
    });
  } else if (publishedOverview) {
    try {
      await syncProjectSourcesFromPublishedChapters(
        db,
        input.run.projectId,
        input.publishedBy,
      );
    } catch {
      /* 概览发布时来源回填失败不阻断 */
    }
  }

  if (publishedOverview) {
    overviewVersion = (bundle.overviewVersion || 0) + 1;
    overviewKnVersion = newVersion;
    await saveOverviewBundleAndArchive(db, {
      projectId: input.run.projectId,
      overviewVersion,
      knVersion: overviewKnVersion,
      archivedBy: input.publishedBy,
      at: now,
    });
  }

  const researchOk = items.filter(
    (i) =>
      i.status === "ok" &&
      i.html?.trim() &&
      i.sectionId !== "sources" &&
      i.sectionId !== "glossary" &&
      i.sectionId !== "project-graph",
  );
  const appliedSet = new Set(applied);
  // 未应用且草案仍与正式版不同的研究章，才算「还有待发布」
  const remainingResearch: string[] = [];
  for (const item of researchOk) {
    if (appliedSet.has(item.sectionId)) continue;
    const live = await getProjectKnowledgeChapterHtml(
      db,
      input.run.projectId,
      item.sectionId,
    );
    const draftNorm = (item.html ?? "").replace(/\s+/gu, " ").trim();
    const liveNorm = (live?.html ?? "").replace(/\s+/gu, " ").trim();
    if (draftNorm !== liveNorm) remainingResearch.push(item.sectionId);
  }
  // 所选已覆盖全部剩余差异 → 关闭草案
  const runClosed = remainingResearch.length === 0;
  if (runClosed) {
    await setDraftRunStatus(db, input.run.id, "published", {
      publishedAt: now,
    });
  } else {
    // 部分发布：保持 ready，便于继续审其余章节
    await setDraftRunStatus(db, input.run.id, "ready");
  }

  return {
    newVersion,
    overviewVersion,
    overviewKnVersion,
    publishedKnowledge,
    publishedOverview,
    appliedSections: applied,
    runClosed,
  };
}

async function saveOverviewBundleAndArchive(
  db: AppDatabase,
  input: {
    projectId: string;
    overviewVersion: number;
    knVersion: number;
    archivedBy: string;
    at: string;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE project_knowledge_chapter_bundle
         SET overview_version = ?, overview_kn_version = ?,
             updated_at = ?, updated_by = ?
         WHERE project_id = ?`,
      )
      .bind(
        input.overviewVersion,
        input.knVersion,
        input.at,
        input.archivedBy,
        input.projectId,
      )
      .run();
  } catch (e) {
    if (!missingOverviewCols(e)) throw e;
  }

  const overview = await getProjectKnowledgeChapterHtml(
    db,
    input.projectId,
    "project-overview",
  );
  const graph = await getProjectKnowledgeChapterHtml(
    db,
    input.projectId,
    "project-graph",
  );
  if (!overview?.html?.trim()) return;
  try {
    await db
      .prepare(
        `INSERT INTO project_overview_versions
           (project_id, version, kn_version, html, graph_html, archived_at, archived_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           kn_version = VALUES(kn_version),
           html = VALUES(html),
           graph_html = VALUES(graph_html),
           archived_at = VALUES(archived_at),
           archived_by = VALUES(archived_by)`,
      )
      .bind(
        input.projectId,
        input.overviewVersion,
        input.knVersion,
        overview.html,
        graph?.html ?? null,
        input.at,
        input.archivedBy,
      )
      .run();
  } catch (e) {
    if (!missingOverviewCols(e)) throw e;
  }
}

export async function listChapterVersionMetas(
  db: AppDatabase,
  projectId: string,
): Promise<ChapterVersionMeta[]> {
  const q = await db
    .prepare(
      `SELECT project_id, version, MAX(archived_at) AS archived_at,
              MAX(archived_by) AS archived_by, COUNT(*) AS section_count
       FROM project_knowledge_chapter_versions
       WHERE project_id = ?
       GROUP BY project_id, version
       ORDER BY version DESC`,
    )
    .bind(projectId)
    .all<{
      project_id: string;
      version: number;
      archived_at: string;
      archived_by: string | null;
      section_count: number | string;
    }>();
  return (q.results ?? []).map((r) => ({
    projectId: r.project_id,
    version: normalizeStoredChapterVersion(r.version),
    archivedAt: r.archived_at,
    archivedBy: r.archived_by,
    sectionCount: Number(r.section_count) || 0,
  }));
}

export async function listOverviewVersionMetas(
  db: AppDatabase,
  projectId: string,
): Promise<OverviewVersionMeta[]> {
  try {
    const q = await db
      .prepare(
        `SELECT project_id, version, kn_version, archived_at, archived_by
         FROM project_overview_versions
         WHERE project_id = ?
         ORDER BY version DESC`,
      )
      .bind(projectId)
      .all<{
        project_id: string;
        version: number;
        kn_version: number;
        archived_at: string;
        archived_by: string | null;
      }>();
    return (q.results ?? []).map((r) => ({
      projectId: r.project_id,
      version: Math.trunc(Number(r.version) || 0),
      knVersion: normalizeStoredChapterVersion(r.kn_version),
      archivedAt: r.archived_at,
      archivedBy: r.archived_by,
    }));
  } catch (e) {
    if (missingOverviewCols(e)) return [];
    throw e;
  }
}

export async function getOverviewVersion(
  db: AppDatabase,
  projectId: string,
  version: number,
): Promise<OverviewVersionDetail | null> {
  try {
    const row = await db
      .prepare(
        `SELECT project_id, version, kn_version, html, graph_html,
                archived_at, archived_by
         FROM project_overview_versions
         WHERE project_id = ? AND version = ?`,
      )
      .bind(projectId, version)
      .first<{
        project_id: string;
        version: number;
        kn_version: number;
        html: string;
        graph_html: string | null;
        archived_at: string;
        archived_by: string | null;
      }>();
    if (!row) return null;
    return {
      projectId: row.project_id,
      version: Math.trunc(Number(row.version) || 0),
      knVersion: normalizeStoredChapterVersion(row.kn_version),
      html: row.html,
      graphHtml: row.graph_html,
      archivedAt: row.archived_at,
      archivedBy: row.archived_by,
    };
  } catch (e) {
    if (missingOverviewCols(e)) return null;
    throw e;
  }
}

export async function listChapterVersionHtml(
  db: AppDatabase,
  projectId: string,
  version: number,
): Promise<ProjectKnowledgeChapterHtmlPublic[]> {
  const q = await db
    .prepare(
      `SELECT project_id, section_id, html, source, llm_backend, archived_at, archived_by
       FROM project_knowledge_chapter_versions
       WHERE project_id = ? AND version = ?
       ORDER BY section_id ASC`,
    )
    .bind(projectId, version)
    .all<{
      project_id: string;
      section_id: string;
      html: string;
      source: string;
      llm_backend: string | null;
      archived_at: string;
      archived_by: string | null;
    }>();
  return (q.results ?? []).map((r) => ({
    projectId: r.project_id,
    sectionId: r.section_id,
    html: r.html,
    source: r.source,
    llmBackend: r.llm_backend,
    updatedAt: r.archived_at,
    updatedBy: r.archived_by,
  }));
}

export async function rollbackLiveChaptersToVersion(
  db: AppDatabase,
  input: {
    projectId: string;
    version: number;
    rolledBackBy: string;
  },
): Promise<{ newVersion: number; restoredSections: string[] }> {
  const chapters = await listChapterVersionHtml(
    db,
    input.projectId,
    input.version,
  );
  if (chapters.length === 0) {
    throw new Error("该版本不存在或尚无归档内容");
  }
  const bundle = await ensureChapterBundle(
    db,
    input.projectId,
    input.rolledBackBy,
  );
  const currentVersion = normalizeStoredChapterVersion(bundle.version);
  if (input.version === currentVersion) {
    throw new Error("已经是当前正式版");
  }
  if (currentVersion > 0) {
    const archivedCount = await db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM project_knowledge_chapter_versions
         WHERE project_id = ? AND version = ?`,
      )
      .bind(input.projectId, currentVersion)
      .first<{ cnt: number | string }>();
    if (!(Number(archivedCount?.cnt ?? 0) > 0)) {
      await archiveLiveChaptersAsVersion(db, {
        projectId: input.projectId,
        version: currentVersion,
        archivedBy: input.rolledBackBy,
      });
    }
  }
  const restored: string[] = [];
  for (const ch of chapters) {
    if (!ch.html?.trim()) continue;
    if (ch.sectionId === "project-overview" || ch.sectionId === "project-graph") {
      continue;
    }
    await upsertProjectKnowledgeChapterHtml(db, {
      projectId: input.projectId,
      sectionId: ch.sectionId,
      html: repairStoredChapterHtml(ch.html),
      source: ch.source,
      llmBackend: ch.llmBackend,
      updatedBy: input.rolledBackBy,
    });
    restored.push(ch.sectionId);
  }
  if (restored.length === 0) {
    throw new Error("该版本没有可回滚的章节内容");
  }
  const liveAfter = await listProjectKnowledgeChapterHtml(db, input.projectId);
  const analysisKind =
    (await getStoredAnalysisKind(db, input.projectId)) ??
    DEFAULT_ANALYSIS_KIND;
  const allResearchComplete = researchChaptersComplete(
    new Map(liveAfter.map((c) => [c.sectionId, c.html])),
    analysisKind,
  );
  const newVersion = nextChapterVersion(currentVersion, {
    bump: "minor",
    allResearchComplete,
  });
  const now = nowIso();
  await db
    .prepare(
      `UPDATE project_knowledge_chapter_bundle
       SET version = ?, updated_at = ?, updated_by = ?
       WHERE project_id = ?`,
    )
    .bind(newVersion, now, input.rolledBackBy, input.projectId)
    .run();
  await archiveLiveChaptersAsVersion(db, {
    projectId: input.projectId,
    version: newVersion,
    archivedBy: input.rolledBackBy,
  });
  return { newVersion, restoredSections: restored };
}
