import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import { persistInterviewTranscript } from "./ai-generated-documents";
import { getStoredAnalysisKind } from "./analysis-kind";
import { callLlm, type LlmClientEnv } from "./llm-client";
import { handleCreateChapterDraftRun } from "./project-knowledge-chapter-draft-routes";
import { findActiveDraftRun } from "./project-knowledge-chapter-revisions-db";
import { getProjectById } from "./projects-db";
import {
  findActiveInterview,
  findInterviewByConversation,
  insertInterview,
  nextInterviewRound,
  updateInterview,
  type StartupInterview,
} from "./startup-interview-db";
import {
  canEnterProjectChat,
  canPublishProjectKnowledgeNetwork,
  resolveProjectRole,
} from "./workspace-roles";
import { seedInterviewOpeningMessage } from "./chat-sync";

type Env = { DB: AppDatabase; FILES: AppObjectStorage } & LlmClientEnv;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function dto(row: StartupInterview) {
  return {
    id: row.id,
    projectId: row.projectId,
    conversationId: row.conversationId,
    status: row.status,
    roundIndex: row.roundIndex,
    answererUserId: row.answererUserId,
    startedBy: row.startedBy,
    startedAt: row.startedAt,
    pausedAt: row.pausedAt,
    endedAt: row.endedAt,
    pendingPrompt: row.pendingPrompt,
    hasReplies: Boolean(row.transcript?.trim()),
  };
}

const FIRST_INTERVIEW_QUESTIONS = `这是用户访谈，请直接用自己的话回答，不必写成尽调表。

1. 你们现在做给谁用？最近一个真实用户或使用场景是谁？
2. 他们现在怎么凑合，最痛的一点是什么？
3. 你们已经验证过什么（有没有人真的在用，或愿意付钱）？
4. 接下来四周最想搞清楚的一件事是什么？`;

async function seedConversation(
  db: AppDatabase,
  userId: string,
  projectId: string,
  conversationId: string,
  preview: string,
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        `INSERT INTO user_conversations (id, user_id, project_id, title, preview, updated_at, variant, files_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           title = excluded.title, preview = excluded.preview, updated_at = excluded.updated_at,
           variant = excluded.variant, deleted_at = NULL`,
      )
      .bind(
        conversationId,
        userId,
        projectId,
        "用户访谈",
        preview.slice(0, 180),
        now,
        "named",
        "[]",
      )
      .run();
  } catch {
    /* 对话表未就绪时访谈行仍可工作 */
  }
}

export async function handleGetStartupInterview(
  env: Env,
  projectId: string,
  userId: string,
): Promise<Response> {
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  const kind = await getStoredAnalysisKind(env.DB, projectId);
  if (kind !== "early") {
    return json({ interview: null, enabled: false });
  }
  if (!(await canEnterProjectChat(env, userId, projectId, project.createdBy))) {
    const role = await resolveProjectRole(env, userId, projectId, project.createdBy);
    if (role === "guest") return json({ error: "未加入项目" }, 403);
  }
  try {
    const active = await findActiveInterview(env.DB, projectId);
    return json({ interview: active ? dto(active) : null, enabled: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unknown table|no such table/i.test(msg)) {
      return json({ interview: null, enabled: true });
    }
    throw e;
  }
}

export async function handleStartStartupInterview(
  request: Request,
  env: Env,
  projectId: string,
  userId: string,
): Promise<Response> {
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  const kind = await getStoredAnalysisKind(env.DB, projectId);
  if (kind !== "early") {
    return json({ error: "仅创业项目可开始用户访谈", code: "NOT_EARLY" }, 400);
  }
  if (!(await canPublishProjectKnowledgeNetwork(env, userId, projectId, project.createdBy))) {
    return json({ error: "只有管理员可以开始用户访谈", code: "FORBIDDEN" }, 403);
  }
  const active = await findActiveInterview(env.DB, projectId).catch(() => null);
  if (active?.status === "in_progress") {
    return json({
      interview: dto(active),
      reused: true,
      invited: userId !== active.answererUserId,
    });
  }
  if (active?.status === "paused") {
    await updateInterview(env.DB, active.id, {
      status: "in_progress",
      pausedAt: null,
    });
    const resumed = await findActiveInterview(env.DB, projectId);
    const row = resumed ?? active;
    return json({
      interview: dto(row),
      reused: true,
      invited: userId !== row.answererUserId,
    });
  }
  const draft = await findActiveDraftRun(env.DB, projectId).catch(() => null);
  if (draft) {
    return json(
      {
        error: "有未发布的知识网络草案，请先发布或放弃后再开下一轮访谈",
        code: "DRAFT_LOCK",
        draftRunId: draft.id,
      },
      409,
    );
  }
  let answererUserId = userId;
  try {
    const body = (await request.json()) as { answererUserId?: string };
    if (body.answererUserId?.trim()) answererUserId = body.answererUserId.trim();
  } catch {
    /* 默认当前管理员自己答 */
  }
  if (
    !(await canEnterProjectChat(env, answererUserId, projectId, project.createdBy))
  ) {
    return json(
      { error: "回答人必须是可对话的项目成员", code: "INVALID_ANSWERER" },
      400,
    );
  }
  const roundIndex = await nextInterviewRound(env.DB, projectId);
  const conversationId = `${projectId}-interview-${roundIndex}-${crypto.randomUUID().slice(0, 8)}`;
  const pending = FIRST_INTERVIEW_QUESTIONS;
  const row = await insertInterview(env.DB, {
    projectId,
    conversationId,
    answererUserId,
    startedBy: userId,
    roundIndex,
    pendingPrompt: pending,
  });
  await seedConversation(env.DB, answererUserId, projectId, conversationId, pending);
  if (userId !== answererUserId) {
    await seedConversation(env.DB, userId, projectId, conversationId, pending);
  }
  await seedInterviewOpeningMessage(env, {
    userIds: [answererUserId, userId],
    conversationId,
    content: pending,
  }).catch((e) => {
    console.warn(
      "[startup-interview] seed opening message",
      e instanceof Error ? e.message : e,
    );
  });
  return json({
    interview: dto(row),
    firstMessage: pending,
    invited: userId !== answererUserId,
  });
}

export async function handlePauseStartupInterview(
  env: Env,
  projectId: string,
  userId: string,
): Promise<Response> {
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  if (!(await canPublishProjectKnowledgeNetwork(env, userId, projectId, project.createdBy))) {
    return json({ error: "只有管理员可以暂停访谈", code: "FORBIDDEN" }, 403);
  }
  const active = await findActiveInterview(env.DB, projectId);
  if (!active || active.status !== "in_progress") {
    return json({ error: "没有进行中的访谈" }, 400);
  }
  await updateInterview(env.DB, active.id, {
    status: "paused",
    pausedAt: new Date().toISOString(),
  });
  return json({ ok: true });
}

export async function handleEndStartupInterview(
  env: Env,
  ctx: ExecutionContext,
  projectId: string,
  userId: string,
): Promise<Response> {
  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);
  if (!(await canPublishProjectKnowledgeNetwork(env, userId, projectId, project.createdBy))) {
    return json({ error: "只有管理员可以结束访谈", code: "FORBIDDEN" }, 403);
  }
  const active = await findActiveInterview(env.DB, projectId);
  if (!active) return json({ error: "没有进行中的访谈" }, 400);
  const endedAt = new Date().toISOString();
  const transcript = [
    `# 用户访谈纪要（第 ${active.roundIndex} 次）`,
    ``,
    `- 回答人：${active.answererUserId}`,
    `- 结束时间：${endedAt}`,
    ``,
    active.transcript?.trim() || active.pendingPrompt || "（尚无纪要正文）",
  ].join("\n");
  await updateInterview(env.DB, active.id, {
    status: "ended",
    endedAt,
    transcript,
  });
  try {
    await persistInterviewTranscript(env, {
      projectId,
      userId,
      conversationId: active.conversationId,
      body: transcript,
      roundIndex: active.roundIndex,
    });
  } catch (e) {
    console.error("[startup-interview] persist transcript", e);
  }
  const fake = new Request(`https://local/api/projects/${projectId}/chapter-draft-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "full" }),
  });
  const draftRes = await handleCreateChapterDraftRun(
    fake,
    env,
    ctx,
    projectId,
    userId,
  );
  const draftJson = (await draftRes.json().catch(() => ({}))) as {
    run?: { id?: string };
    error?: string;
  };
  return json({
    ok: true,
    interviewId: active.id,
    conversationId: active.conversationId,
    draftRunId: draftJson.run?.id ?? null,
    draftError: draftJson.error ?? null,
  });
}

export async function maybeHandleInterviewChat(
  env: Env,
  input: {
    projectId: string;
    userId: string;
    conversationId?: string | null;
    message: string;
  },
): Promise<Response | null> {
  const cid = (input.conversationId ?? "").trim();
  if (!cid) return null;
  let interview: StartupInterview | null = null;
  try {
    interview = await findInterviewByConversation(env.DB, cid);
  } catch {
    return null;
  }
  if (!interview || interview.projectId !== input.projectId) return null;
  if (interview.status === "ended") return null;
  if (interview.status === "paused") {
    return json({
      answer: "访谈已暂停。管理员可在知识网络继续上次没问完的访谈，或去普通对话。",
      async: false,
      chatMode: "standard",
      skillIntent: "standard",
      interviewLocked: true,
    });
  }
  if (input.userId !== interview.answererUserId) {
    if (input.userId === interview.startedBy) {
      return json({
        answer:
          "本轮访谈已指定给其他成员回答。你可以在知识网络暂停或结束访谈，但请不要代答。",
        async: false,
        chatMode: "standard",
        skillIntent: "standard",
        interviewLocked: true,
      });
    }
    return json(
      { error: "当前账号不是本轮访谈回答人", code: "NOT_ANSWERER" },
      403,
    );
  }
  const { answer } = await callLlm(env, [
    {
      role: "system",
      content:
        "你正在进行创业项目用户访谈。只按 startup-design 问法推进：一次 3–5 个短问题。用户若聊偏了，用一两句短拒并摆回未答题。不要生成知识网络，不要做尽调表。记下更正。",
    },
    {
      role: "user",
      content: `未答完的问题：\n${interview.pendingPrompt || "（无）"}\n\n用户刚才说：\n${input.message}`,
    },
  ]);
  const next = (answer || "请继续回答上一批未完成的问题。").trim();
  const prev = interview.transcript?.trim() ?? "";
  const transcript = `${prev}\n\n## 用户\n${input.message}\n\n## 访谈官\n${next}`.trim();
  await updateInterview(env.DB, interview.id, {
    pendingPrompt: next,
    transcript,
  });
  return json({
    answer: next,
    async: false,
    chatMode: "standard",
    skillIntent: "standard",
    interviewLocked: true,
  });
}
