import type { AppDatabase } from "./app-database";
import {
  CHAPTER_GENERATE_CONCURRENCY,
  DRAFT_RUN_IDLE_STALE_MS,
  FILE_GENERATE_CONCURRENCY,
  draftGenerateJobKey,
  isDraftGenerateInFlight,
  releaseDraftGenerateJob,
  shouldFailStalePendingItems,
  startDraftRunProcessor,
  tryClaimDraftGenerateJob,
  withChapterGenerateGate,
} from "./chapter-draft-generate-queue";
import {
  completeReviseInstructionLog,
  insertReviseInstructionLog,
} from "./chapter-revise-logs-db";
import {
  DEFAULT_ANALYSIS_KIND,
  ensureAnalysisKind,
  getStoredAnalysisKind,
} from "./analysis-kind";
import { fullDraftSectionIds, isDeliverableDraftId, isGeneratableSectionId } from "./kn-catalog";
import {
  draftGenerateItemIds,
  orderDeliverableDraftIds,
  unpublishedGenerateItemIds,
} from "./deliverable-catalog";
import { handleGenerateDeliverableDraft } from "./deliverable-generate";
import type { AppObjectStorage } from "./app-storage";
import { presentMatureDraftItems } from "./kn-legacy-map";
import type { LlmClientEnv } from "./llm-client";
import {
  handleGenerateProjectKnowledgeChapter,
  reviseChapterHtmlContent,
} from "./project-knowledge-chapters-routes";
import { repairStoredChapterHtml } from "./chapter-revise-parse";
import { draftReuseShouldRetryFailed, unpublishedDraftSectionIds } from "./draft-reuse";
import { listProjectKnowledgeChapterHtml } from "./project-knowledge-chapters-db";
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
  listOverviewVersionMetas,
  listResearchSectionIdsForRun,
  getOverviewVersion,
  publishDraftRunToLive,
  refreshDraftRunProgress,
  setDraftRunStatus,
  upsertDraftItem,
  deleteDraftItem,
  rollbackLiveChaptersToVersion,
} from "./project-knowledge-chapter-revisions-db";
import { filterProjectsForDirectory } from "./projects-auth";
import { findActiveInterview } from "./startup-interview-db";
import { getProjectById, listProjects } from "./projects-db";
import { notifyProjectAdminsAndCores } from "./project-role-notify";
import {
  canListProjectFiles,
  canPublishProjectKnowledgeNetwork,
  canUpdateProjectKnowledgeNetwork,
} from "./workspace-roles";

type Env = { DB: AppDatabase; FILES: AppObjectStorage } & LlmClientEnv;

/** 全部更新：先资料包 Markdown，再研究章，最后项目概览 */
export function fullUpdateSectionIds(
  kind: "early" | "mature" | "acquire" = DEFAULT_ANALYSIS_KIND,
): string[] {
  return draftGenerateItemIds(kind, "full");
}

function knPrimaryIds(ids: string[]): string[] {
  return ids.filter(
    (id) => !META_DRAFT_SECTION_IDS.has(id) && !isDeliverableDraftId(id),
  );
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function resolveDraftItemForEdit(
  env: Env,
  projectId: string,
  runId: string,
  sectionId: string,
) {
  const own = await getDraftItem(env.DB, runId, sectionId);
  if (own?.html?.trim()) return own;
  const kind =
    (await getStoredAnalysisKind(env.DB, projectId)) ?? DEFAULT_ANALYSIS_KIND;
  if (kind !== "mature") return own;
  const presented = presentMatureDraftItems(await listDraftItems(env.DB, runId));
  return presented.find((i) => i.sectionId === sectionId) ?? own;
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

async function assertCanUpdate(
  env: Env,
  userId: string,
  projectId: string,
  createdBy: string | null | undefined,
): Promise<Response | null> {
  if (
    !(await canUpdateProjectKnowledgeNetwork(
      env,
      userId,
      projectId,
      createdBy,
    ))
  ) {
    return json(
      { error: "当前角色无权更新知识网络章节", code: "UPDATE_FORBIDDEN" },
      403,
    );
  }
  return null;
}

async function assertCanPublish(
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
      { error: "仅项目管理员可审核、发布或回滚知识网络", code: "PUBLISH_FORBIDDEN" },
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
  return assertCanUpdate(env, userId, projectId, createdBy);
}

async function notifyProjectAdminsOfDraftReview(
  env: Env,
  input: {
    project: { id: string; name: string; createdBy: string | null };
    actorUserId: string;
    runId: string;
    scope: string;
    sectionIds?: string[];
  },
): Promise<void> {
  const ids = input.sectionIds ?? [];
  const scopeLabel =
    input.scope === "full"
      ? "全部章节"
      : ids.length === 1 && ids[0] === "project-overview"
        ? "项目概览"
        : "章节";
  await notifyProjectAdminsAndCores(env, {
    projectId: input.project.id,
    projectName: input.project.name,
    createdBy: input.project.createdBy,
    actorUserId: input.actorUserId,
    kind: "kn_draft",
    recipients: "admin",
    title: "知识网络待审核",
    summary: `{actor} 提交了「${input.project.name}」的${scopeLabel}更新，请审核发布`,
    href: `/app/projects/${encodeURIComponent(input.project.id)}/knowledge/review/${encodeURIComponent(input.runId)}`,
  });
}

const META_DRAFT_SECTION_IDS = new Set([
  "sources",
  "glossary",
  "project-graph",
]);

function isDraftGenerateableSection(sectionId: string): boolean {
  return (
    isDeliverableDraftId(sectionId) ||
    (isGeneratableSectionId(sectionId) && !META_DRAFT_SECTION_IDS.has(sectionId))
  );
}

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

function kickDraftRunGeneration(
  env: Env,
  ctx: ExecutionContext,
  projectId: string,
  runId: string,
  userId: string,
): void {
  ctx.waitUntil(
    startDraftRunProcessor(runId, () =>
      processPendingDraftRun(env, projectId, runId, userId),
    ).catch((e) => {
      console.error(
        `[draft-generate] run ${runId} processor`,
        e instanceof Error ? e.message : e,
      );
    }),
  );
}

async function requeueDraftSections(
  env: Env,
  runId: string,
  sectionIds: string[],
  items: Awaited<ReturnType<typeof listDraftItems>>,
): Promise<void> {
  const byId = new Map(items.map((i) => [i.sectionId, i]));
  for (const sectionId of sectionIds) {
    if (!isDraftGenerateableSection(sectionId)) continue;
    const existing = byId.get(sectionId);
    await upsertDraftItem(env.DB, {
      runId,
      sectionId,
      status: "pending",
      html: existing?.html ?? null,
      error: null,
      llmBackend: existing?.llmBackend ?? null,
    });
  }
  await refreshDraftRunProgress(env.DB, runId);
}

async function requeueFailedDraftSections(
  env: Env,
  runId: string,
  items: Awaited<ReturnType<typeof listDraftItems>>,
): Promise<void> {
  await requeueDraftSections(
    env,
    runId,
    items.filter((i) => i.status === "failed").map((i) => i.sectionId),
    items,
  );
}

/** 同一草案内排队生成，最多 CHAPTER_GENERATE_CONCURRENCY 路过模型。 */
async function processPendingDraftRun(
  env: Env,
  projectId: string,
  runId: string,
  userId: string,
): Promise<void> {
  const kind =
    (await getStoredAnalysisKind(env.DB, projectId)) ?? DEFAULT_ANALYSIS_KIND;
  const working = new Set<Promise<void>>();
  for (;;) {
    const run = await getDraftRun(env.DB, runId);
    if (!run || run.status === "published" || run.status === "discarded") {
      if (working.size > 0) await Promise.all([...working]);
      return;
    }
    const items = await listDraftItems(env.DB, runId);
    const pending = items.filter(
      (i) =>
        i.status === "pending" &&
        isDraftGenerateableSection(i.sectionId) &&
        !isDraftGenerateInFlight(draftGenerateJobKey(runId, i.sectionId)),
    );
    const fileStillOpen = items.some(
      (i) =>
        isDeliverableDraftId(i.sectionId) &&
        (i.status === "pending" ||
          isDraftGenerateInFlight(draftGenerateJobKey(runId, i.sectionId))),
    );
    const researchStillOpen = items.some(
      (i) =>
        i.sectionId !== "project-overview" &&
        !isDeliverableDraftId(i.sectionId) &&
        isDraftGenerateableSection(i.sectionId) &&
        (i.status === "pending" ||
          isDraftGenerateInFlight(draftGenerateJobKey(runId, i.sectionId))),
    );
    let queue = pending;
    let maxConcurrent = CHAPTER_GENERATE_CONCURRENCY;
    if (fileStillOpen) {
      const fileIds = orderDeliverableDraftIds(
        kind,
        pending.filter((i) => isDeliverableDraftId(i.sectionId)).map((i) => i.sectionId),
      );
      const byId = new Map(pending.map((i) => [i.sectionId, i]));
      queue = fileIds.map((id) => byId.get(id)).filter((i): i is NonNullable<typeof i> => Boolean(i));
      maxConcurrent = FILE_GENERATE_CONCURRENCY;
    } else if (researchStillOpen) {
      queue = pending.filter((i) => i.sectionId !== "project-overview");
    }
    while (working.size < maxConcurrent && queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      let job!: Promise<void>;
      job = runOneDraftSectionGenerate(
        env,
        projectId,
        runId,
        item.sectionId,
        userId,
      ).finally(() => {
        working.delete(job);
      });
      working.add(job);
    }
    if (working.size === 0) {
      const waitingOnClaim = items.some(
        (i) =>
          i.status === "pending" &&
          isDraftGenerateInFlight(draftGenerateJobKey(runId, i.sectionId)),
      );
      if (waitingOnClaim) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return;
    }
    await Promise.race([...working]);
  }
}

async function runOneDraftSectionGenerate(
  env: Env,
  projectId: string,
  runId: string,
  sectionId: string,
  userId: string,
): Promise<void> {
  const key = draftGenerateJobKey(runId, sectionId);
  if (!tryClaimDraftGenerateJob(key)) return;
  try {
    const existing = await getDraftItem(env.DB, runId, sectionId);
    await upsertDraftItem(env.DB, {
      runId,
      sectionId,
      status: "pending",
      html: existing?.html ?? null,
      error: null,
      llmBackend: existing?.llmBackend ?? null,
    });
    await refreshDraftRunProgress(env.DB, runId);
    console.log(`[draft-generate] start ${runId} ${sectionId}`);
    const res = await withChapterGenerateGate(() =>
      isDeliverableDraftId(sectionId)
        ? handleGenerateDeliverableDraft(
            env,
            projectId,
            sectionId,
            userId,
            runId,
          )
        : handleGenerateProjectKnowledgeChapter(
            env,
            projectId,
            sectionId,
            userId,
            { target: "draft", runId },
          ),
    );
    if (res.ok) {
      console.log(`[draft-generate] ok ${runId} ${sectionId}`);
      return;
    }
    let msg = `生成失败（${res.status}）`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = String(body.error);
    } catch {
      /* ignore */
    }
    console.warn(`[draft-generate] fail ${runId} ${sectionId}: ${msg}`);
    const latest = await getDraftItem(env.DB, runId, sectionId);
    if (latest?.status === "pending") {
      await upsertDraftItem(env.DB, {
        runId,
        sectionId,
        status: "failed",
        html: latest.html,
        error: msg,
        llmBackend: latest.llmBackend,
      });
      await refreshDraftRunProgress(env.DB, runId);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[draft-generate] throw ${runId} ${sectionId}: ${msg}`);
    try {
      const existing = await getDraftItem(env.DB, runId, sectionId);
      await upsertDraftItem(env.DB, {
        runId,
        sectionId,
        status: "failed",
        html: existing?.html ?? null,
        error: msg,
        llmBackend: existing?.llmBackend ?? null,
      });
      await refreshDraftRunProgress(env.DB, runId);
    } catch {
      /* ignore */
    }
  } finally {
    releaseDraftGenerateJob(key);
  }
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
 *  创建后由服务端排队生成，前端只轮询 run，不要并行 POST generate。
 */
export async function handleCreateChapterDraftRun(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
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

  const liveInterview = await findActiveInterview(env.DB, projectId).catch(
    () => null,
  );
  if (liveInterview?.status === "in_progress") {
    return json(
      {
        error: "用户访谈进行中，结束后才会自动更新知识网络",
        code: "INTERVIEW_LOCK",
      },
      409,
    );
  }

  let scope: "full" | "section" = "full";
  let sectionId: string | null = null;
  let mode: "generate" | "manual" = "generate";
  let manualHtml = "";
  let regen: "unpublished" | "all-drafts" | null = null;
  try {
    const body = (await request.json().catch(() => null)) as {
      scope?: unknown;
      sectionId?: unknown;
      mode?: unknown;
      html?: unknown;
      regen?: unknown;
    } | null;
    if (body?.scope === "section" || body?.scope === "full") {
      scope = body.scope;
    }
    if (typeof body?.sectionId === "string") {
      sectionId = body.sectionId.trim() || null;
    }
    if (body?.mode === "manual") {
      mode = "manual";
    }
    if (typeof body?.html === "string") {
      manualHtml = body.html;
    }
    if (body?.regen === "unpublished" || body?.regen === "all-drafts") {
      regen = body.regen;
    }
  } catch {
    /* 无 body 时默认 full */
  }

  if (mode === "manual") {
    if (scope !== "section" || !sectionId) {
      return json(
        {
          error: "人工编辑需指定单个章节",
          code: "INVALID_SECTION",
        },
        400,
      );
    }
    if (!manualHtml.trim()) {
      return json({ error: "html 不能为空", code: "EMPTY_HTML" }, 400);
    }
    manualHtml = repairStoredChapterHtml(manualHtml);
  }

  if (scope === "section") {
    if (!sectionId || !isGeneratableSectionId(sectionId)) {
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

  const analysisKind =
    (await getStoredAnalysisKind(env.DB, projectId)) ??
    (await ensureAnalysisKind(
      env,
      projectId,
      `${project.name}\n${project.summary ?? ""}`,
    ));
  const wantedIds =
    scope === "section" && sectionId
      ? draftGenerateItemIds(analysisKind, "section", sectionId)
      : fullUpdateSectionIds(analysisKind);

  const active = await findActiveDraftRun(env.DB, projectId);
  if (active) {
    const items = await listDraftItems(env.DB, active.id);
    const primaryIds = items
      .map((i) => i.sectionId)
      .filter((id) => !META_DRAFT_SECTION_IDS.has(id));
    const knIds = knPrimaryIds(primaryIds);
    const sameScope =
      active.scope === scope &&
      (scope === "full"
        ? true
        : knIds.length === 1 && knIds[0] === sectionId);

    if (sameScope) {
      if (mode === "manual") {
        if (active.status === "generating") {
          return json(
            {
              error: "该章正在生成 AI 草案，请完成或放弃后再人工编辑",
              code: "STILL_GENERATING",
              activeRunId: active.id,
              activeScope: active.scope,
            },
            409,
          );
        }
        await upsertDraftItem(env.DB, {
          runId: active.id,
          sectionId: sectionId!,
          status: "ok",
          html: manualHtml,
          error: null,
          llmBackend: null,
        });
        const latestRun = await refreshDraftRunProgress(env.DB, active.id);
        const latest = await listDraftItems(env.DB, active.id);
        return json({
          ok: true,
          reused: true,
          run: latestRun,
          items: mapRunItems(latest),
          sectionIds: [sectionId!],
        });
      }
      const willGenerate =
        Boolean(regen) ||
        draftReuseShouldRetryFailed(active.status, items) ||
        active.status === "generating";
      let unpublishedKn: string[] = [];
      if (draftReuseShouldRetryFailed(active.status, items) && !regen) {
        await requeueFailedDraftSections(env, active.id, items);
        kickDraftRunGeneration(env, ctx, projectId, active.id, userId);
      } else if (scope === "full" && regen === "all-drafts") {
        await requeueDraftSections(
          env,
          active.id,
          [...fullUpdateSectionIds(analysisKind)],
          items,
        );
        kickDraftRunGeneration(env, ctx, projectId, active.id, userId);
      } else if (scope === "full" && regen === "unpublished") {
        const liveRows = await listProjectKnowledgeChapterHtml(
          env.DB,
          projectId,
        );
        const liveHtmlBySection = new Map(
          liveRows.map((row) => [row.sectionId, row.html]),
        );
        unpublishedKn = unpublishedDraftSectionIds(
          [...fullDraftSectionIds(analysisKind)],
          items,
          liveHtmlBySection,
        );
        const unpublishedIds = unpublishedGenerateItemIds(
          analysisKind,
          unpublishedKn,
        );
        if (unpublishedIds.length > 0) {
          await requeueDraftSections(
            env,
            active.id,
            unpublishedIds,
            items,
          );
          kickDraftRunGeneration(env, ctx, projectId, active.id, userId);
        }
      }
      if (willGenerate) {
        const have = new Set(items.map((i) => i.sectionId));
        const fillIds =
          scope === "full" && regen === "unpublished"
            ? unpublishedGenerateItemIds(analysisKind, unpublishedKn)
            : wantedIds;
        const missing = fillIds.filter((id) => !have.has(id));
        if (missing.length > 0) {
          await requeueDraftSections(env, active.id, missing, items);
          kickDraftRunGeneration(env, ctx, projectId, active.id, userId);
        }
      }
      const latest = await listDraftItems(env.DB, active.id);
      const latestRun = (await getDraftRun(env.DB, active.id)) ?? active;
      const latestIds = latest
        .map((i) => i.sectionId)
        .filter((id) => !META_DRAFT_SECTION_IDS.has(id));
      return json({
        ok: true,
        reused: true,
        run: latestRun,
        items: mapRunItems(latest),
        sectionIds: latestIds.length > 0 ? latestIds : wantedIds,
      });
    }

    const activeLabel =
      active.scope === "full"
        ? "全部章节更新草案"
        : knIds[0] === "project-overview"
          ? "项目概览更新草案"
          : `单章更新草案（${knIds[0] ?? "未知"}）`;
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
  if (mode === "manual" && sectionId) {
    await upsertDraftItem(env.DB, {
      runId: run.id,
      sectionId,
      status: "ok",
      html: manualHtml,
      error: null,
      llmBackend: null,
    });
    const ready = await refreshDraftRunProgress(env.DB, run.id);
    const items = await listDraftItems(env.DB, run.id);
    return json({
      ok: true,
      reused: false,
      run: ready,
      items: mapRunItems(items),
      sectionIds: wantedIds,
    });
  }
  kickDraftRunGeneration(env, ctx, projectId, run.id, userId);
  const items = await listDraftItems(env.DB, run.id);
  return json({
    ok: true,
    reused: false,
    run,
    items: mapRunItems(items),
    sectionIds: wantedIds,
  });
}

/** GET /api/projects/:id/chapter-draft-runs/active — 进行中的草案（若有） */
export async function handleGetActiveChapterDraftRun(
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

  const active = await findActiveDraftRun(env.DB, projectId);
  if (!active) {
    return json({ ok: true, active: null });
  }

  const items = await listDraftItems(env.DB, active.id);
  const primaryIds = items
    .map((i) => i.sectionId)
    .filter((id) => !META_DRAFT_SECTION_IDS.has(id));

  return json({
    ok: true,
    active: {
      runId: active.id,
      scope: active.scope,
      status: active.status,
      baseVersion: active.baseVersion,
      progressDone: active.progressDone,
      progressTotal: active.progressTotal,
      failedCount: active.failedCount,
      createdAt: active.createdAt,
      updatedAt: active.updatedAt,
      sectionIds: primaryIds,
    },
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
    const updatedMs = Date.parse(item.updatedAt);
    if (!Number.isFinite(updatedMs)) continue;
    if (item.status === "revising" && now - updatedMs >= STALE_REVISE_MS) {
      await upsertDraftItem(env.DB, {
        runId,
        sectionId: item.sectionId,
        status: "ok",
        html: item.html,
        error: "改写超时或中断，请重试",
        llmBackend: item.llmBackend,
      });
    }
  }
  items = await listDraftItems(env.DB, runId);
  // 排队中的 pending 不能按单章 updatedAt 判超时；整次草案都闲置才失败
  if (shouldFailStalePendingItems(items, now, DRAFT_RUN_IDLE_STALE_MS)) {
    let marked = false;
    for (const item of items) {
      if (item.status !== "pending") continue;
      if (isDraftGenerateInFlight(draftGenerateJobKey(runId, item.sectionId))) {
        continue;
      }
      marked = true;
      await upsertDraftItem(env.DB, {
        runId,
        sectionId: item.sectionId,
        status: "failed",
        html: item.html,
        error: "生成超时或中断，请重试",
        llmBackend: item.llmBackend,
      });
    }
    if (marked) await refreshDraftRunProgress(env.DB, runId);
  }
  items = await listDraftItems(env.DB, runId);
  const analysisKind =
    (await getStoredAnalysisKind(env.DB, projectId)) ?? DEFAULT_ANALYSIS_KIND;
  if (analysisKind === "mature") {
    items = presentMatureDraftItems(items);
  }
  const latestRun = (await getDraftRun(env.DB, runId)) ?? run;

  return json({
    ok: true,
    projectId,
    currentVersion: bundle.version,
    overviewVersion: bundle.overviewVersion,
    overviewKnVersion: bundle.overviewKnVersion,
    run: latestRun,
    items: items.map((i) => ({
      sectionId: i.sectionId,
      status: i.status,
      html: repairStoredChapterHtml(i.html ?? ""),
      error: i.error,
      reviseNote: i.reviseNote,
      llmBackend: i.llmBackend,
      updatedAt: i.updatedAt,
    })),
  });
}

/** POST .../chapter-draft-runs/:runId/sections/:sectionId/generate
 *  立刻 202 后台生成，避免 Cloudflare 隧道 ~100s 掐断长 LLM 请求。
 */
export async function handleGenerateChapterDraftSection(
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
  if (!sectionId) return json({ error: "无效的章节 id" }, 400);

  const gate = await assertDraftRunEditable(env, projectId, runId, userId);
  if (!gate.ok) return gate.response;

  const existing = await getDraftItem(env.DB, runId, sectionId);
  await upsertDraftItem(env.DB, {
    runId,
    sectionId,
    status: "pending",
    html: existing?.html ?? null,
    error: null,
    llmBackend: existing?.llmBackend ?? null,
  });
  await refreshDraftRunProgress(env.DB, runId);

  ctx.waitUntil(
    runOneDraftSectionGenerate(env, projectId, runId, sectionId, userId).catch(
      (e) => {
        console.error(
          `[draft-generate] ${runId} ${sectionId}`,
          e instanceof Error ? e.message : e,
        );
      },
    ),
  );

  return json(
    {
      ok: true,
      accepted: true,
      projectId,
      runId,
      sectionId,
      status: "pending",
    },
    202,
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

/** DELETE .../chapter-draft-runs/:runId/sections/:sectionId — 从本次草案移除章节 */
export async function handleDeleteChapterDraftSection(
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
      { error: "仅支持移除研究章节或项目概览", code: "INVALID_SECTION" },
      400,
    );
  }
  if (!isGeneratableSectionId(sectionId)) {
    return json({ error: "无效的章节 id", code: "INVALID_SECTION" }, 400);
  }

  const gate = await assertDraftRunEditable(env, projectId, runId, userId);
  if (!gate.ok) return gate.response;

  const removed = await deleteDraftItem(env.DB, runId, sectionId);
  if (!removed) {
    return json({ error: "该章节不在本次草案中", code: "NOT_IN_RUN" }, 404);
  }

  const run = await getDraftRun(env.DB, runId);
  const items = await listDraftItems(env.DB, runId);
  return json({
    ok: true,
    runId,
    sectionId,
    run,
    items: items.map((i) => ({
      sectionId: i.sectionId,
      status: i.status,
      updatedAt: i.updatedAt,
    })),
  });
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
  if (!isGeneratableSectionId(sectionId)) {
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

  const existing = await resolveDraftItemForEdit(
    env,
    projectId,
    runId,
    sectionId,
  );
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
  if (!isGeneratableSectionId(sectionId)) {
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

  const existing = await resolveDraftItemForEdit(
    env,
    projectId,
    runId,
    sectionId,
  );
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

  const logId = await insertReviseInstructionLog(env.DB, {
    projectId,
    runId,
    sectionId,
    userId,
    instruction,
  });

  const runRevise = async () => {
    try {
      const revised = await reviseChapterHtmlContent(env, {
        title,
        kicker: template?.kicker,
        html: repairStoredChapterHtml(previousHtml),
        instruction,
        projectId,
        userId,
        sectionId,
      });
      await upsertDraftItem(env.DB, {
        runId,
        sectionId,
        status: "ok",
        html: revised.html,
        error: null,
        reviseNote: revised.note,
        llmBackend: revised.llmBackend,
      });
      await completeReviseInstructionLog(env.DB, logId, {
        status: "ok",
        reviseNote: revised.note,
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
      await completeReviseInstructionLog(env.DB, logId, {
        status: "failed",
        error: msg,
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

  const denied = await assertCanPublish(
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
  let bump: "major" | "minor" | "patch" = "minor";
  try {
    const body = (await request.json().catch(() => null)) as {
      sectionIds?: unknown;
      bump?: unknown;
    } | null;
    if (Array.isArray(body?.sectionIds)) {
      sectionIds = body.sectionIds
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean);
      if (sectionIds.length === 0) sectionIds = null;
    }
    if (
      body?.bump === "major" ||
      body?.bump === "minor" ||
      body?.bump === "patch"
    ) {
      bump = body.bump;
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
      bump,
    });
    const bundle = await ensureChapterBundle(env.DB, projectId, userId);
    return json({
      ok: true,
      projectId,
      runId,
      newVersion: result.newVersion,
      currentVersion: bundle.version,
      overviewVersion: result.overviewVersion,
      overviewKnVersion: result.overviewKnVersion,
      publishedKnowledge: result.publishedKnowledge,
      publishedOverview: result.publishedOverview,
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

/** POST .../chapter-draft-runs/:runId/submit — Core 提交给项目管理员审批 */
export async function handleSubmitChapterDraftRun(
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

  if (
    await canPublishProjectKnowledgeNetwork(
      env,
      userId,
      projectId,
      project.createdBy,
    )
  ) {
    return json(
      {
        error: "项目管理员可直接发布，无需提交审批",
        code: "PUBLISH_DIRECTLY",
      },
      400,
    );
  }

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
      { error: "草案仍在生成中，请完成后再提交审批", code: "STILL_GENERATING" },
      409,
    );
  }

  const items = await listDraftItems(env.DB, runId);
  const sectionIds = items
    .map((i) => i.sectionId)
    .filter(
      (id) =>
        id !== "sources" &&
        id !== "glossary" &&
        id !== "project-graph" &&
        !isDeliverableDraftId(id),
    );
  await notifyProjectAdminsOfDraftReview(env, {
    project,
    actorUserId: userId,
    runId,
    scope: run.scope,
    sectionIds,
  });
  return json({ ok: true, runId, submitted: true });
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
  const overviewVersions = await listOverviewVersionMetas(env.DB, projectId);
  return json({
    ok: true,
    projectId,
    currentVersion: bundle.version,
    overviewVersion: bundle.overviewVersion,
    overviewKnVersion: bundle.overviewKnVersion,
    versions: versions.map((v) => ({
      version: v.version,
      archivedAt: v.archivedAt,
      archivedBy: v.archivedBy,
      sectionCount: v.sectionCount,
      isCurrent: v.version === bundle.version,
    })),
    overviewVersions: overviewVersions.map((v) => ({
      version: v.version,
      knVersion: v.knVersion,
      archivedAt: v.archivedAt,
      archivedBy: v.archivedBy,
      isCurrent: v.version === bundle.overviewVersion,
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

/** GET /api/projects/:id/overview-versions/:version */
export async function handleGetOverviewVersion(
  env: Env,
  projectId: string,
  versionRaw: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const version = Number(versionRaw);
  if (!Number.isFinite(version) || version < 1) {
    return json({ error: "无效的概览版本号" }, 400);
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
  const row = await getOverviewVersion(env.DB, projectId, version);
  if (!row) {
    return json({ error: "该概览版本不存在" }, 404);
  }
  return json({
    ok: true,
    projectId,
    version: row.version,
    knVersion: row.knVersion,
    isCurrent: row.version === bundle.overviewVersion,
    html: row.html,
    graphHtml: row.graphHtml,
    archivedAt: row.archivedAt,
    archivedBy: row.archivedBy,
  });
}

/** POST .../knowledge-chapter-versions/:version/rollback */
export async function handleRollbackKnowledgeChapterVersion(
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

  const denied = await assertCanPublish(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  if (denied) return denied;

  try {
    const result = await rollbackLiveChaptersToVersion(env.DB, {
      projectId,
      version,
      rolledBackBy: userId,
    });
    return json({
      ok: true,
      projectId,
      restoredFrom: version,
      newVersion: result.newVersion,
      restoredSections: result.restoredSections,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 400);
  }
}
