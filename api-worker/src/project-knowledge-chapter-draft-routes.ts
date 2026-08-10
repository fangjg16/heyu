import type { AppDatabase } from "./app-database";
import { getKnChapterTemplate } from "./kn-chapter-templates-db";
import type { LlmClientEnv } from "./llm-client";
import {
  handleGenerateProjectKnowledgeChapter,
  reviseChapterHtmlContent,
} from "./project-knowledge-chapters-routes";
import {
  createDraftRun,
  ensureChapterBundle,
  findActiveDraftRun,
  getDraftItem,
  getDraftRun,
  listActiveDraftRunsForProjects,
  listChapterVersionHtml,
  listChapterVersionMetas,
  listDraftItems,
  listResearchSectionIdsForRun,
  publishDraftRunToLive,
  setDraftRunStatus,
  upsertDraftItem,
} from "./project-knowledge-chapter-revisions-db";
import { filterProjectsForDirectory } from "./projects-auth";
import { getProjectById, listProjects } from "./projects-db";
import {
  canListProjectFiles,
  canPublishProjectKnowledgeNetwork,
} from "./workspace-roles";

type Env = { DB: AppDatabase } & LlmClientEnv;

/** 全部章节更新：13 研究章（不含 overview / sources / glossary） */
export const FULL_UPDATE_SECTION_IDS = [
  "snapshot",
  "objectives",
  "industry",
  "legal",
  "benchmarks",
  "business",
  "returns",
  "capabilities",
  "ownership",
  "diligence",
  "risks",
  "questions",
  "framework",
] as const;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeUserId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim();
  return id.length > 0 && id.length <= 128 ? id : null;
}

async function assertCanRead(
  env: Env,
  userId: string,
  projectId: string,
  createdBy: string | null | undefined,
): Promise<Response | null> {
  if (!(await canListProjectFiles(env, userId, projectId, createdBy))) {
    return json(
      { error: "无权查看项目知识网络", code: "VIEW_FORBIDDEN" },
      403,
    );
  }
  return null;
}

async function assertCanWrite(
  env: Env,
  userId: string,
  projectId: string,
  createdBy: string | null | undefined,
): Promise<Response | null> {
  if (
    !(await canPublishProjectKnowledgeNetwork(
      env,
      userId,
      projectId,
      createdBy,
    ))
  ) {
    return json(
      { error: "当前角色无权更新知识网络章节", code: "PUBLISH_FORBIDDEN" },
      403,
    );
  }
  return null;
}

const RESEARCH_SET = new Set<string>(FULL_UPDATE_SECTION_IDS);
/** 可发起单章/概览草案的主 section */
const SECTION_DRAFT_SET = new Set<string>([
  ...FULL_UPDATE_SECTION_IDS,
  "project-overview",
]);
const META_DRAFT_SECTION_IDS = new Set([
  "sources",
  "glossary",
  "project-graph",
]);

function mapRunItems(
  items: Awaited<ReturnType<typeof listDraftItems>>,
) {
  return items.map((i) => ({
    sectionId: i.sectionId,
    status: i.status,
    error: i.error,
    hasHtml: Boolean(i.html?.trim()),
    updatedAt: i.updatedAt,
  }));
}

/** GET /api/me/chapter-draft-runs — 可见项目下 generating/ready 草案 */
export async function handleListMyChapterDraftRuns(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const userId = normalizeUserId(authUserId);
  if (!userId) return json({ error: "未登录" }, 401);

  const projects = await listProjects(env);
  const visible = await filterProjectsForDirectory(env, userId, projects);
  if (visible.length === 0) {
    return json({ ok: true, items: [], total: 0 });
  }

  const nameById = new Map(visible.map((p) => [p.id, p.name] as const));
  const runs = await listActiveDraftRunsForProjects(
    env.DB,
    visible.map((p) => p.id),
  );

  const items = [];
  for (const run of runs) {
    const researchSectionIds = await listResearchSectionIdsForRun(
      env.DB,
      run.id,
    );
    items.push({
      runId: run.id,
      projectId: run.projectId,
      projectName: nameById.get(run.projectId) ?? run.projectId,
      scope: run.scope,
      status: run.status,
      progressDone: run.progressDone,
      progressTotal: run.progressTotal,
      failedCount: run.failedCount,
      createdAt: run.createdAt,
      createdBy: run.createdBy,
      researchSectionIds,
    });
  }

  return json({ ok: true, items, total: items.length });
}

/** POST /api/projects/:id/chapter-draft-runs
 *  body 可选：{ scope?: 'full'|'section', sectionId?: string }
 */
export async function handleCreateChapterDraftRun(
  request: Request,
  env: Env,
  projectId: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const denied = await assertCanWrite(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  if (denied) return denied;

  let scope: "full" | "section" = "full";
  let sectionId: string | null = null;
  try {
    const body = (await request.json().catch(() => null)) as {
      scope?: unknown;
      sectionId?: unknown;
    } | null;
    if (body?.scope === "section" || body?.scope === "full") {
      scope = body.scope;
    }
    if (typeof body?.sectionId === "string") {
      sectionId = body.sectionId.trim() || null;
    }
  } catch {
    /* 无 body 时默认 full */
  }

  if (scope === "section") {
    if (!sectionId || !SECTION_DRAFT_SET.has(sectionId)) {
      return json(
        {
          error: "单章/概览更新需提供有效的章节 id",
          code: "INVALID_SECTION",
        },
        400,
      );
    }
  }

  await ensureChapterBundle(env.DB, projectId, userId);

  const wantedIds =
    scope === "section" && sectionId
      ? [sectionId]
      : [...FULL_UPDATE_SECTION_IDS];

  const active = await findActiveDraftRun(env.DB, projectId);
  if (active) {
    const items = await listDraftItems(env.DB, active.id);
    const primaryIds = items
      .map((i) => i.sectionId)
      .filter((id) => !META_DRAFT_SECTION_IDS.has(id));
    const sameScope =
      active.scope === scope &&
      (scope === "full"
        ? true
        : primaryIds.length === 1 && primaryIds[0] === sectionId);

    if (sameScope) {
      return json({
        ok: true,
        reused: true,
        run: active,
        items: mapRunItems(items),
        sectionIds: primaryIds.length > 0 ? primaryIds : wantedIds,
      });
    }

    const activeLabel =
      active.scope === "full"
        ? "全部章节更新草案"
        : primaryIds[0] === "project-overview"
          ? "项目概览更新草案"
          : `单章更新草案（${primaryIds[0] ?? "未知"}）`;
    return json(
      {
        error: `已有进行中的${activeLabel}，请先完成审核发布或放弃后再发起新的更新`,
        code: "ACTIVE_DRAFT_EXISTS",
        activeRunId: active.id,
        activeScope: active.scope,
      },
      409,
    );
  }

  const run = await createDraftRun(env.DB, {
    projectId,
    createdBy: userId,
    scope,
    sectionIds: wantedIds,
  });
  const items = await listDraftItems(env.DB, run.id);
  return json({
    ok: true,
    reused: false,
    run,
    items: mapRunItems(items),
    sectionIds: wantedIds,
  });
}

/** GET /api/projects/:id/chapter-draft-runs/:runId */
export async function handleGetChapterDraftRun(
  env: Env,
  projectId: string,
  runId: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const denied = await assertCanRead(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  if (denied) return denied;

  const run = await getDraftRun(env.DB, runId);
  if (!run || run.projectId !== projectId) {
    return json({ error: "草案 run 不存在" }, 404);
  }

  const bundle = await ensureChapterBundle(env.DB, projectId, userId);
  let items = await listDraftItems(env.DB, runId);
  // 改写超时/中断：超过 10 分钟仍 revising 则回落为 ok，保留原 HTML
  const STALE_REVISE_MS = 10 * 60 * 1000;
  const now = Date.now();
  for (const item of items) {
    if (item.status !== "revising") continue;
    const updatedMs = Date.parse(item.updatedAt);
    if (!Number.isFinite(updatedMs) || now - updatedMs < STALE_REVISE_MS) {
      continue;
    }
    await upsertDraftItem(env.DB, {
      runId,
      sectionId: item.sectionId,
      status: "ok",
      html: item.html,
      error: "改写超时或中断，请重试",
      llmBackend: item.llmBackend,
    });
  }
  items = await listDraftItems(env.DB, runId);

  return json({
    ok: true,
    projectId,
    currentVersion: bundle.version,
    run,
    items: items.map((i) => ({
      sectionId: i.sectionId,
      status: i.status,
      html: i.html,
      error: i.error,
      llmBackend: i.llmBackend,
      updatedAt: i.updatedAt,
    })),
  });
}

/** POST .../chapter-draft-runs/:runId/sections/:sectionId/generate */
export async function handleGenerateChapterDraftSection(
  env: Env,
  projectId: string,
  runId: string,
  sectionId: string,
  userIdRaw: string | null,
): Promise<Response> {
  return handleGenerateProjectKnowledgeChapter(
    env,
    projectId,
    sectionId,
    userIdRaw,
    { target: "draft", runId },
  );
}

async function assertDraftRunEditable(
  env: Env,
  projectId: string,
  runId: string,
  userId: string,
): Promise<
  | { ok: true; run: NonNullable<Awaited<ReturnType<typeof getDraftRun>>> }
  | { ok: false; response: Response }
> {
  const project = await getProjectById(env, projectId);
  if (!project) return { ok: false, response: json({ error: "项目不存在" }, 404) };
  const denied = await assertCanWrite(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  if (denied) return { ok: false, response: denied };

  const run = await getDraftRun(env.DB, runId);
  if (!run || run.projectId !== projectId) {
    return { ok: false, response: json({ error: "草案 run 不存在" }, 404) };
  }
  if (run.status === "published" || run.status === "discarded") {
    return {
      ok: false,
      response: json(
        { error: "该草案已结束，无法编辑", code: "RUN_CLOSED" },
        409,
      ),
    };
  }
  return { ok: true, run };
}

/** PUT .../chapter-draft-runs/:runId/sections/:sectionId — 手改保存草案 HTML */
export async function handlePutChapterDraftSection(
  request: Request,
  env: Env,
  projectId: string,
  runId: string,
  sectionIdRaw: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const sectionId = decodeURIComponent(sectionIdRaw || "").trim();
  if (!sectionId || META_DRAFT_SECTION_IDS.has(sectionId)) {
    return json(
      {
        error: "仅支持编辑研究章节或项目概览草案",
        code: "INVALID_SECTION",
      },
      400,
    );
  }
  if (!SECTION_DRAFT_SET.has(sectionId)) {
    return json({ error: "无效的章节 id", code: "INVALID_SECTION" }, 400);
  }

  const gate = await assertDraftRunEditable(env, projectId, runId, userId);
  if (!gate.ok) return gate.response;

  let body: { html?: string };
  try {
    body = (await request.json()) as { html?: string };
  } catch {
    return json({ error: "请求体须为 JSON：{ html }" }, 400);
  }
  const html = (body.html ?? "").trim();
  if (!html) {
    return json({ error: "html 不能为空" }, 400);
  }

  const existing = await getDraftItem(env.DB, runId, sectionId);
  if (!existing) {
    return json({ error: "该章节草案不存在", code: "NO_DRAFT_ITEM" }, 404);
  }
  if (existing.status === "revising") {
    return json(
      { error: "本章正在改写中，请稍后再保存", code: "REVISING" },
      409,
    );
  }

  await upsertDraftItem(env.DB, {
    runId,
    sectionId,
    status: "ok",
    html,
    error: null,
    llmBackend: existing.llmBackend,
  });

  return json({
    ok: true,
    projectId,
    runId,
    sectionId,
    html,
    status: "ok",
  });
}

/** POST .../chapter-draft-runs/:runId/sections/:sectionId/revise
 *  先落库 status=revising，再后台改写；刷新后可轮询看到状态
 */
export async function handleReviseChapterDraftSection(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  projectId: string,
  runId: string,
  sectionIdRaw: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const sectionId = decodeURIComponent(sectionIdRaw || "").trim();
  if (!sectionId || META_DRAFT_SECTION_IDS.has(sectionId)) {
    return json(
      {
        error: "仅支持改写研究章节或项目概览草案",
        code: "INVALID_SECTION",
      },
      400,
    );
  }
  if (!SECTION_DRAFT_SET.has(sectionId)) {
    return json({ error: "无效的章节 id", code: "INVALID_SECTION" }, 400);
  }

  const gate = await assertDraftRunEditable(env, projectId, runId, userId);
  if (!gate.ok) return gate.response;

  let body: { instruction?: string };
  try {
    body = (await request.json()) as { instruction?: string };
  } catch {
    return json({ error: "请求体须为 JSON：{ instruction }" }, 400);
  }
  const instruction = (body.instruction ?? "").trim();
  if (!instruction) {
    return json({ error: "instruction 不能为空" }, 400);
  }
  if (instruction.length > 4000) {
    return json({ error: "instruction 过长" }, 400);
  }

  const existing = await getDraftItem(env.DB, runId, sectionId);
  if (!existing?.html?.trim()) {
    return json(
      { error: "本章草案尚无内容，无法改写", code: "NO_HTML" },
      400,
    );
  }
  if (existing.status === "revising") {
    return json(
      { error: "本章正在改写中", code: "REVISING", status: "revising" },
      409,
    );
  }

  const template = await getKnChapterTemplate(env.DB, sectionId);
  const title =
    template?.title ??
    (sectionId === "project-overview" ? "项目概览" : sectionId);
  const previousHtml = existing.html;
  const previousBackend = existing.llmBackend;

  // 立即落库，刷新后可见「改写中」；error 暂存指令文案
  await upsertDraftItem(env.DB, {
    runId,
    sectionId,
    status: "revising",
    html: previousHtml,
    error: instruction,
    llmBackend: previousBackend,
  });

  const runRevise = async () => {
    try {
      const revised = await reviseChapterHtmlContent(env, {
        title,
        kicker: template?.kicker,
        html: previousHtml,
        instruction,
      });
      await upsertDraftItem(env.DB, {
        runId,
        sectionId,
        status: "ok",
        html: revised.html,
        error: null,
        llmBackend: revised.llmBackend,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await upsertDraftItem(env.DB, {
        runId,
        sectionId,
        status: "ok",
        html: previousHtml,
        error: `改写失败：${msg}`,
        llmBackend: previousBackend,
      });
    }
  };

  ctx.waitUntil(runRevise());

  return json(
    {
      ok: true,
      accepted: true,
      projectId,
      runId,
      sectionId,
      title,
      status: "revising",
      instruction,
    },
    202,
  );
}

/** POST .../chapter-draft-runs/:runId/publish
 *  body 可选：{ sectionIds?: string[] } — 仅发布指定章节；省略则发布全部成功章
 */
export async function handlePublishChapterDraftRun(
  request: Request,
  env: Env,
  projectId: string,
  runId: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const denied = await assertCanWrite(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  if (denied) return denied;

  const run = await getDraftRun(env.DB, runId);
  if (!run || run.projectId !== projectId) {
    return json({ error: "草案 run 不存在" }, 404);
  }
  if (run.status === "published") {
    return json({ error: "该草案已发布", code: "ALREADY_PUBLISHED" }, 409);
  }
  if (run.status === "discarded") {
    return json({ error: "该草案已放弃", code: "ALREADY_DISCARDED" }, 409);
  }
  if (run.status === "generating") {
    return json(
      { error: "草案仍在生成中，请待全部章节完成后再发布", code: "STILL_GENERATING" },
      409,
    );
  }
  if (run.status === "failed") {
    return json(
      { error: "全部章节生成失败，无法发布", code: "ALL_FAILED" },
      409,
    );
  }

  let sectionIds: string[] | null = null;
  try {
    const body = (await request.json().catch(() => null)) as {
      sectionIds?: unknown;
    } | null;
    if (Array.isArray(body?.sectionIds)) {
      sectionIds = body.sectionIds
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean);
      if (sectionIds.length === 0) sectionIds = null;
    }
  } catch {
    sectionIds = null;
  }

  const items = await listDraftItems(env.DB, runId);
  const revising = items.filter((i) => i.status === "revising");
  if (revising.length > 0) {
    const hit =
      sectionIds == null
        ? revising
        : revising.filter((i) => sectionIds.includes(i.sectionId));
    if (hit.length > 0) {
      return json(
        {
          error: "有章节正在改写中，请待改写完成后再发布",
          code: "REVISING",
          sectionIds: hit.map((i) => i.sectionId),
        },
        409,
      );
    }
  }
  const okItems = items.filter(
    (i) =>
      i.status === "ok" &&
      i.html?.trim() &&
      i.sectionId !== "sources" &&
      i.sectionId !== "glossary" &&
      i.sectionId !== "project-graph",
  );
  if (okItems.length === 0) {
    return json({ error: "没有可发布的成功章节", code: "NOTHING_TO_PUBLISH" }, 400);
  }

  if (sectionIds) {
    const okSet = new Set(okItems.map((i) => i.sectionId));
    const invalid = sectionIds.filter((id) => !okSet.has(id));
    if (invalid.length > 0) {
      return json(
        {
          error: `以下章节不可发布（未成功生成）：${invalid.join("、")}`,
          code: "SECTION_NOT_PUBLISHABLE",
        },
        400,
      );
    }
  }

  try {
    const result = await publishDraftRunToLive(env.DB, {
      run,
      publishedBy: userId,
      sectionIds,
    });
    const bundle = await ensureChapterBundle(env.DB, projectId, userId);
    return json({
      ok: true,
      projectId,
      runId,
      newVersion: result.newVersion,
      currentVersion: bundle.version,
      appliedSections: result.appliedSections,
      runClosed: result.runClosed,
      partial: Boolean(sectionIds) && !result.runClosed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 400);
  }
}

/** POST .../chapter-draft-runs/:runId/discard */
export async function handleDiscardChapterDraftRun(
  env: Env,
  projectId: string,
  runId: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const denied = await assertCanWrite(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  if (denied) return denied;

  const run = await getDraftRun(env.DB, runId);
  if (!run || run.projectId !== projectId) {
    return json({ error: "草案 run 不存在" }, 404);
  }
  if (run.status === "published") {
    return json({ error: "已发布的草案不能放弃", code: "ALREADY_PUBLISHED" }, 409);
  }
  if (run.status === "discarded") {
    return json({ ok: true, runId, status: "discarded", reused: true });
  }

  await setDraftRunStatus(env.DB, runId, "discarded");
  return json({ ok: true, runId, status: "discarded" });
}

/** GET /api/projects/:id/knowledge-chapter-versions */
export async function handleListKnowledgeChapterVersions(
  env: Env,
  projectId: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const denied = await assertCanRead(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  if (denied) return denied;

  const bundle = await ensureChapterBundle(env.DB, projectId, userId);
  const versions = await listChapterVersionMetas(env.DB, projectId);
  return json({
    ok: true,
    projectId,
    currentVersion: bundle.version,
    versions: versions.map((v) => ({
      version: v.version,
      archivedAt: v.archivedAt,
      archivedBy: v.archivedBy,
      sectionCount: v.sectionCount,
      isCurrent: v.version === bundle.version,
    })),
  });
}

/** GET /api/projects/:id/knowledge-chapter-versions/:version */
export async function handleGetKnowledgeChapterVersion(
  env: Env,
  projectId: string,
  versionRaw: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const version = Number(versionRaw);
  if (!Number.isFinite(version) || version < 1) {
    return json({ error: "无效的版本号" }, 400);
  }

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const denied = await assertCanRead(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  if (denied) return denied;

  const bundle = await ensureChapterBundle(env.DB, projectId, userId);
  const chapters = await listChapterVersionHtml(env.DB, projectId, version);
  if (chapters.length === 0) {
    return json({ error: "该版本不存在或尚无归档内容" }, 404);
  }

  return json({
    ok: true,
    projectId,
    version,
    isCurrent: version === bundle.version,
    currentVersion: bundle.version,
    chapters: chapters.map((c) => ({
      sectionId: c.sectionId,
      html: c.html,
      source: c.source,
      llmBackend: c.llmBackend,
      archivedAt: c.updatedAt,
      archivedBy: c.updatedBy,
    })),
  });
}
