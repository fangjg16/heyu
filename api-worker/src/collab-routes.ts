import type { AppDatabase } from "./app-database";
import {
  insertCollabItem,
  listCollabItems,
  listCollabItemsForProjects,
  getCollabItem,
  updateCollabItem,
  rowToPublic,
  parseReplyMode,
  parsePriority,
  parseFileReqs,
  summarizeCollabItems,
  type CollabFileReq,
  type CollabItemPublic,
} from "./collab-db";
import { appendConfirmedAnswerToQuestionsHtml, buildConfirmedWritebackBlock } from "./collab-writeback";
import { getProjectById, listProjects } from "./projects-db";
import { filterProjectsForDirectory } from "./projects-auth";
import { decodePathProjectId } from "./projects-resolve";
import {
  getProjectKnowledgeChapterHtml,
  upsertProjectKnowledgeChapterHtml,
} from "./project-knowledge-chapters-db";
import {
  canAccessProjectCollab,
  canManageProjectCollab,
  isInvestorRole,
  isIssuerRole,
  resolveProjectRole,
} from "./workspace-roles";
import { getWorkspaceUserById } from "./workspace-users-db";
import { listProjectMemberRoleOverrides } from "./project-member-roles-db";
import { stripCitationMarkers } from "./kn-citation-markers";
import { callLlm, type LlmClientEnv } from "./llm-client";
import {
  buildCollabFollowUpUserPrompt,
  COLLAB_FOLLOW_UP_SYSTEM,
  parseCollabFollowUpSuggest,
} from "./collab-follow-up";

type Env = { DB: AppDatabase };

async function listIssuerAccounts(
  env: Env,
  projectId: string,
): Promise<{ userId: string; displayName: string }[]> {
  const overrides = await listProjectMemberRoleOverrides(env, projectId);
  const out: { userId: string; displayName: string }[] = [];
  for (const [userId, role] of Object.entries(overrides)) {
    if (role !== "issuer") continue;
    const u = await getWorkspaceUserById(env, userId);
    out.push({
      userId,
      displayName: (u?.display_name || u?.username || userId).trim() || userId,
    });
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName, "zh"));
  return out;
}

function visibleToIssuer(
  row: { assigned_to?: string | null },
  userId: string,
): boolean {
  const assigned = String(row.assigned_to ?? "").trim();
  return !assigned || assigned === userId;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function nextSuggestions(items: CollabItemPublic[]): string[] {
  const open = items.filter(
    (i) =>
      i.status === "pending_reply" ||
      i.status === "saved" ||
      i.status === "needs_more",
  );
  const rank = (p: string) => (p === "P1" ? 0 : p === "P2" ? 1 : 2);
  open.sort((a, b) => {
    const pr = rank(a.priority) - rank(b.priority);
    if (pr !== 0) return pr;
    return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
  });
  return open.slice(0, 3).map((i) => {
    const due = i.dueAt ? `（截止 ${i.dueAt.slice(0, 10)}）` : "";
    const files =
      i.fileReqs.length > 0
        ? `；请补充「${i.fileReqs.map((f) => f.label).join("、")}」`
        : "";
    return `${stripCitationMarkers(i.title)}${due}${files}`;
  });
}

async function attachedItemIds(
  env: Env,
  projectId: string,
): Promise<Set<string>> {
  try {
    const q = await env.DB.prepare(
      `SELECT DISTINCT collab_item_id AS id FROM documents
       WHERE project_id = ?
         AND (deleted_at IS NULL OR deleted_at = '')
         AND collab_item_id IS NOT NULL AND collab_item_id <> ''`,
    )
      .bind(projectId)
      .all<{ id: string }>();
    return new Set((q.results ?? []).map((r) => r.id).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function listItemFiles(
  env: Env,
  projectId: string,
  itemId: string,
): Promise<
  {
    id: string;
    filename: string;
    uploadedBy: string | null;
    createdAt: string;
    fileCategory: string | null;
    periodLabel: string | null;
    isFinal: boolean | null;
    uploadNote: string | null;
    replacesDocumentId: string | null;
    versionGroup: string | null;
  }[]
> {
  try {
    const q = await env.DB.prepare(
      `SELECT id, filename, uploaded_by, created_at, file_category, period_label,
              is_final, upload_note, replaces_document_id, version_group
       FROM documents
       WHERE project_id = ? AND collab_item_id = ?
         AND (deleted_at IS NULL OR deleted_at = '')
       ORDER BY created_at DESC`,
    )
      .bind(projectId, itemId)
      .all<{
        id: string;
        filename: string;
        uploaded_by: string | null;
        created_at: string;
        file_category: string | null;
        period_label: string | null;
        is_final: number | null;
        upload_note: string | null;
        replaces_document_id: string | null;
        version_group: string | null;
      }>();
    return (q.results ?? []).map((r) => ({
      id: r.id,
      filename: r.filename,
      uploadedBy: r.uploaded_by,
      createdAt: r.created_at,
      fileCategory: r.file_category,
      periodLabel: r.period_label,
      isFinal: r.is_final == null ? null : Number(r.is_final) === 1,
      uploadNote: r.upload_note,
      replacesDocumentId: r.replaces_document_id,
      versionGroup: r.version_group,
    }));
  } catch {
    return [];
  }
}

/** GET /api/projects/:id/collab/overview */
export async function handleGetCollabOverview(
  env: Env,
  pathProjectId: string,
  userId: string,
): Promise<Response> {
  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  if (!(await canAccessProjectCollab(env, userId, projectId, project.createdBy))) {
    return json({ error: "无权查看项目协作方协作" }, 403);
  }
  const role = await resolveProjectRole(env, userId, projectId, project.createdBy);
  const includeInternal = isInvestorRole(role);
  let rows = await listCollabItems(env, projectId);
  if (isIssuerRole(role)) {
    rows = rows.filter((r) => visibleToIssuer(r, userId));
  }
  const items = rows.map((r) => rowToPublic(r, { includeInternal }));
  const attached = await attachedItemIds(env, projectId);
  const counts = summarizeCollabItems(items, attached);
  const latest = [...items].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )[0];
  return json({
    counts,
    nextSuggestions: nextSuggestions(items),
    latestReplyAt: latest?.replySubmittedAt ?? latest?.replySavedAt ?? null,
    nearestDueAt:
      items
        .filter((i) => i.dueAt && i.status !== "confirmed")
        .map((i) => i.dueAt!)
        .sort()[0] ?? null,
    itemCount: items.length,
  });
}

/** GET /api/projects/:id/collab/items */
export async function handleListCollabItems(
  env: Env,
  pathProjectId: string,
  userId: string,
): Promise<Response> {
  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  if (!(await canAccessProjectCollab(env, userId, projectId, project.createdBy))) {
    return json({ error: "无权查看协作事项" }, 403);
  }
  const role = await resolveProjectRole(env, userId, projectId, project.createdBy);
  const includeInternal = isInvestorRole(role);
  let rows = await listCollabItems(env, projectId);
  if (isIssuerRole(role)) {
    rows = rows.filter((r) => visibleToIssuer(r, userId));
  }
  const items = rows.map((r) => rowToPublic(r, { includeInternal }));
  const issuers = includeInternal ? await listIssuerAccounts(env, projectId) : [];
  return json({ items, issuers });
}

/** GET /api/projects/:id/collab/items/:itemId */
export async function handleGetCollabItem(
  env: Env,
  pathProjectId: string,
  itemId: string,
  userId: string,
): Promise<Response> {
  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  if (!(await canAccessProjectCollab(env, userId, projectId, project.createdBy))) {
    return json({ error: "无权查看协作事项" }, 403);
  }
  const row = await getCollabItem(env, projectId, itemId);
  if (!row) return json({ error: "事项不存在" }, 404);
  const role = await resolveProjectRole(env, userId, projectId, project.createdBy);
  if (isIssuerRole(role) && !visibleToIssuer(row, userId)) {
    return json({ error: "事项不存在" }, 404);
  }
  const files = await listItemFiles(env, projectId, itemId);
  return json({
    item: rowToPublic(row, { includeInternal: isInvestorRole(role) }),
    files,
  });
}

/** POST /api/projects/:id/collab/items  投资人发布 */
export async function handlePublishCollabItem(
  request: Request,
  env: Env,
  pathProjectId: string,
  userId: string,
): Promise<Response> {
  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  if (!(await canManageProjectCollab(env, userId, projectId, project.createdBy))) {
    return json({ error: "仅 Admin / Core 可发布给项目协作方" }, 403);
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "请求体须为 JSON" }, 400);
  }
  const title = stripCitationMarkers(String(body.title ?? "").trim());
  const content = stripCitationMarkers(String(body.body ?? "").trim());
  const sourceQuestionText = String(body.sourceQuestionText ?? "").trim();
  if (!title || !content) {
    return json({ error: "请填写对外标题与需确认内容" }, 400);
  }
  const fileReqs = parseFileReqs(JSON.stringify(body.fileReqs ?? []));
  const assignedTo = String(body.assignedTo ?? "").trim() || null;
  if (assignedTo) {
    const issuers = await listIssuerAccounts(env, projectId);
    if (!issuers.some((i) => i.userId === assignedTo)) {
      return json({ error: "请选择该项目的协作方账号" }, 400);
    }
  }
  const id = crypto.randomUUID();
  const row = await insertCollabItem(env, {
    id,
    projectId,
    sourceQuestionText: sourceQuestionText || title,
    title,
    body: content,
    replyMode: parseReplyMode(String(body.replyMode ?? "both")),
    priority: parsePriority(String(body.priority ?? "P2")),
    dueAt: String(body.dueAt ?? "").trim() || null,
    investorNote: String(body.investorNote ?? "").trim() || null,
    fileReqs: fileReqs.map((f) => ({
      ...f,
      id: f.id || crypto.randomUUID(),
    })) as CollabFileReq[],
    publishedBy: userId,
    assignedTo,
  });
  return json({ item: rowToPublic(row, { includeInternal: true }) }, 201);
}

/** PATCH 项目协作方保存/提交 */
export async function handleIssuerPatchCollabItem(
  request: Request,
  env: Env,
  pathProjectId: string,
  itemId: string,
  userId: string,
): Promise<Response> {
  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  const role = await resolveProjectRole(env, userId, projectId, project.createdBy);
  if (!isIssuerRole(role)) {
    return json({ error: "仅项目协作方可保存或提交答复" }, 403);
  }
  const row = await getCollabItem(env, projectId, itemId);
  if (!row || !visibleToIssuer(row, userId)) {
    return json({ error: "事项不存在" }, 404);
  }
  if (row.status === "confirmed") {
    return json({ error: "已确认事项不可再改" }, 400);
  }
  if (row.status === "submitted") {
    return json({ error: "已提交待审核，请等待投资团队处理" }, 400);
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "请求体须为 JSON" }, 400);
  }
  const action = String(body.action ?? "").trim();
  const replyText =
    body.replyText === undefined ? row.reply_text : String(body.replyText ?? "");
  const now = new Date().toISOString();

  if (action === "save") {
    const next = await updateCollabItem(env, projectId, itemId, {
      status: "saved",
      replyText,
      replySavedAt: now,
      replyBy: userId,
    });
    return json({ item: rowToPublic(next!) });
  }
  if (action === "submit") {
    const mode = parseReplyMode(row.reply_mode);
    if ((mode === "text" || mode === "both") && !String(replyText ?? "").trim()) {
      return json({ error: "请填写文字答复后再提交" }, 400);
    }
    if (mode === "file" || mode === "both") {
      const files = await listItemFiles(env, projectId, itemId);
      if (files.length === 0 && parseFileReqs(row.file_reqs_json).some((f) => f.required)) {
        return json({ error: "请先上传要求的文件" }, 400);
      }
    }
    const next = await updateCollabItem(env, projectId, itemId, {
      status: "submitted",
      replyText,
      replySavedAt: row.reply_saved_at ?? now,
      replySubmittedAt: now,
      replyBy: userId,
    });
    return json({ item: rowToPublic(next!) });
  }
  return json({ error: "action 须为 save 或 submit" }, 400);
}

/** POST 投资人审核 confirm | reject */
export async function handleReviewCollabItem(
  request: Request,
  env: Env,
  pathProjectId: string,
  itemId: string,
  userId: string,
): Promise<Response> {
  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  if (!(await canManageProjectCollab(env, userId, projectId, project.createdBy))) {
    return json({ error: "仅 Admin / Core 可审核" }, 403);
  }
  const row = await getCollabItem(env, projectId, itemId);
  if (!row) return json({ error: "事项不存在" }, 404);
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "请求体须为 JSON" }, 400);
  }
  const action = String(body.action ?? "").trim();
  const reviewNote = String(body.reviewNote ?? "").trim() || null;
  const now = new Date().toISOString();
  if (row.status !== "submitted") {
    return json({ error: "仅已提交事项可确认或退回" }, 400);
  }

  if (action === "reject") {
    const next = await updateCollabItem(env, projectId, itemId, {
      status: "needs_more",
      reviewNote,
    });
    return json({ item: rowToPublic(next!, { includeInternal: true }) });
  }
  if (action !== "confirm") {
    return json({ error: "action 须为 confirm 或 reject" }, 400);
  }

  const files = await listItemFiles(env, projectId, itemId);
  const reviewer = await getWorkspaceUserById(env, userId);
  const confirmedByLabel = reviewer?.display_name ?? userId;
  const block = buildConfirmedWritebackBlock({
    itemId,
    title: row.title,
    replyText: row.reply_text ?? "",
    fileNames: files.map((f) => f.filename),
    confirmedAt: now,
    confirmedByLabel,
  });
  const chapter = await getProjectKnowledgeChapterHtml(
    env.DB,
    projectId,
    "questions",
  );
  const nextHtml = appendConfirmedAnswerToQuestionsHtml(
    chapter?.html ?? "",
    row.source_question_text,
    block,
  );
  await upsertProjectKnowledgeChapterHtml(env.DB, {
    projectId,
    sectionId: "questions",
    html: nextHtml,
    source: "revise",
    llmBackend: null,
    updatedBy: userId,
  });
  const next = await updateCollabItem(env, projectId, itemId, {
    status: "confirmed",
    confirmedAt: now,
    confirmedBy: userId,
    reviewNote,
  });
  return json({
    item: rowToPublic(next!, { includeInternal: true }),
    wroteBack: true,
  });
}

/** POST 协作方已答复的事项：AI 判断完整否并起草补充问询，人工再改再发 */
export async function handleSuggestCollabFollowUp(
  env: Env & LlmClientEnv,
  pathProjectId: string,
  itemId: string,
  userId: string,
): Promise<Response> {
  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  if (!(await canManageProjectCollab(env, userId, projectId, project.createdBy))) {
    return json({ error: "仅 Admin / Core 可补充问询" }, 403);
  }
  const row = await getCollabItem(env, projectId, itemId);
  if (!row) return json({ error: "事项不存在" }, 404);
  const replied =
    Boolean(String(row.reply_text ?? "").trim()) ||
    row.status === "submitted" ||
    row.status === "confirmed" ||
    row.status === "needs_more";
  if (!replied) {
    return json({ error: "协作方尚未答复" }, 400);
  }
  const files = await listItemFiles(env, projectId, itemId);
  try {
    const { answer } = await callLlm(env, [
      { role: "system", content: COLLAB_FOLLOW_UP_SYSTEM },
      {
        role: "user",
        content: buildCollabFollowUpUserPrompt({
          title: row.title,
          body: row.body,
          replyText: row.reply_text ?? "",
          fileNames: files.map((f) => f.filename),
        }),
      },
    ]);
    const parsed = parseCollabFollowUpSuggest(answer);
    if (!parsed) {
      return json({ error: "未能解析判断结果" }, 502);
    }
    return json({ suggest: parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "判断失败" }, 502);
  }
}

/** GET /api/projects/:id/collab/files */
export async function handleListCollabFiles(
  env: Env,
  pathProjectId: string,
  userId: string,
): Promise<Response> {
  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  const role = await resolveProjectRole(env, userId, projectId, project.createdBy);
  if (!isIssuerRole(role) && !isInvestorRole(role)) {
    return json({ error: "无权查看协作文件" }, 403);
  }
  try {
    const q = await env.DB.prepare(
      `SELECT id, filename, relative_path, mime, byte_size, created_at, uploaded_by,
              source_kind, shared_with_issuer, collab_item_id, file_category,
              period_label, is_final, upload_note, replaces_document_id, version_group
       FROM documents
       WHERE project_id = ?
         AND (deleted_at IS NULL OR deleted_at = '')
         AND scope = 'package'
         AND (
           source_kind = 'issuer_upload'
           OR shared_with_issuer = 1
           OR source_kind = 'public_source'
         )
       ORDER BY created_at DESC
       LIMIT 300`,
    )
      .bind(projectId)
      .all<Record<string, unknown>>();
    let rows = q.results ?? [];
    if (isIssuerRole(role)) {
      rows = rows.filter((r) => {
        const kind = String(r.source_kind ?? "");
        const shared = Number(r.shared_with_issuer ?? 0) === 1;
        const mine = String(r.uploaded_by ?? "") === userId;
        return (
          kind === "issuer_upload" ||
          kind === "public_source" ||
          shared ||
          mine
        );
      });
    }
    return json({
      files: rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        relativePath: r.relative_path ?? "",
        mime: r.mime ?? null,
        sizeBytes: Number(r.byte_size ?? 0),
        createdAt: r.created_at,
        uploadedBy: r.uploaded_by ?? null,
        sourceKind: r.source_kind ?? null,
        sharedWithIssuer: Number(r.shared_with_issuer ?? 0) === 1,
        collabItemId: r.collab_item_id ?? null,
        fileCategory: r.file_category ?? null,
        periodLabel: r.period_label ?? null,
        isFinal: r.is_final == null ? null : Number(r.is_final) === 1,
        uploadNote: r.upload_note ?? null,
        replacesDocumentId: r.replaces_document_id ?? null,
        versionGroup: r.version_group ?? null,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown column/i.test(msg)) {
      return json({ files: [], warning: "请先执行迁移 0026" });
    }
    return json({ error: msg }, 500);
  }
}

/** PATCH 投资人逐份授权 */
export async function handleShareDocumentWithIssuer(
  request: Request,
  env: Env,
  pathProjectId: string,
  docId: string,
  userId: string,
): Promise<Response> {
  const projectId = decodePathProjectId(pathProjectId);
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  if (!(await canManageProjectCollab(env, userId, projectId, project.createdBy))) {
    return json({ error: "仅 Admin / Core 可授权文件给项目协作方" }, 403);
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "请求体须为 JSON" }, 400);
  }
  const share = Boolean(body.sharedWithIssuer);
  const kindRaw = String(body.sourceKind ?? "").trim();
  const sourceKind =
    kindRaw === "public_source" || kindRaw === "investor_share"
      ? kindRaw
      : share
        ? "investor_share"
        : null;
  try {
    await env.DB.prepare(
      `UPDATE documents
       SET shared_with_issuer = ?, source_kind = ?
       WHERE id = ? AND project_id = ?
         AND (deleted_at IS NULL OR deleted_at = '')`,
    )
      .bind(share ? 1 : 0, share ? sourceKind : null, docId, projectId)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown column/i.test(msg)) {
      return json({ error: "请先执行迁移 0026" }, 503);
    }
    return json({ error: msg }, 500);
  }
  return json({ ok: true, documentId: docId, sharedWithIssuer: share, sourceKind });
}

/** GET /api/me/collab-inbox 项目协作方主页 */
export async function handleListMyCollabInbox(
  env: Env,
  userId: string,
): Promise<Response> {
  const projects = await listProjects(env);
  const visible = await filterProjectsForDirectory(env, userId, projects);
  const issuerProjects: { id: string; name: string }[] = [];
  for (const p of visible) {
    const role = await resolveProjectRole(env, userId, p.id, p.createdBy);
    if (isIssuerRole(role)) issuerProjects.push({ id: p.id, name: p.name });
  }
  if (issuerProjects.length === 0) {
    return json({ items: [], total: 0 });
  }
  const rows = await listCollabItemsForProjects(
    env,
    issuerProjects.map((p) => p.id),
  );
  const nameById = new Map(issuerProjects.map((p) => [p.id, p.name] as const));
  const items = rows
    .filter((r) => r.status !== "confirmed")
    .filter((r) => visibleToIssuer(r, userId))
    .map((r) => ({
      ...rowToPublic(r),
      projectName: nameById.get(r.project_id) ?? r.project_id,
    }));
  return json({ items, total: items.length });
}
