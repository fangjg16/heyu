import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import { handleGetChatAudit } from "./chat-audit-admin";
import {
  handleGetActiveAgentJobs,
  handleGetChatState,
  handlePutChatState,
} from "./chat-sync";
import {
  handleDeleteProjectFile,
  handlePatchProjectFile,
} from "./documents-routes";
import { handleDownloadProjectFile } from "./documents-download";
import { handleParseProjectFileSummary } from "./documents-parse-summary";
import { handleReembedDocuments } from "./documents-embed-admin";
import { handleBackfillProjectKnowledgeNetworks } from "./project-knowledge-network-admin";
import {
  handleAdminGetGenerateSystemPrompt,
  handleAdminGetKnChapterTemplate,
  handleAdminListKnChapterTemplates,
  handleAdminPutGenerateSystemPrompt,
  handleAdminPutKnChapterTemplate,
  handleAdminReviseKnChapterTemplate,
} from "./kn-chapter-templates-admin-routes";
import {
  handleAdminGetLlmSettings,
  handleAdminPutLlmSettings,
  handleAdminRefreshLlmModels,
  handleAdminTestLlmSettings,
} from "./llm-settings-admin-routes";
import {
  handleGetProjectKnowledgeNetwork,
  handleGetProjectKnowledgeNetworkVersion,
  handlePutProjectKnowledgeNetwork,
} from "./project-knowledge-network-routes";
import {
  handleGenerateProjectKnowledgeChapter,
  handleGetProjectKnowledgeChapter,
  handleListProjectKnowledgeChapters,
  handleReviseProjectKnowledgeChapter,
} from "./project-knowledge-chapters-routes";
import {
  handleCreateChapterDraftRun,
  handleDeleteChapterDraftSection,
  handleDiscardChapterDraftRun,
  handleGenerateChapterDraftSection,
  handleGetChapterDraftRun,
  handleGetKnowledgeChapterVersion,
  handleListKnowledgeChapterVersions,
  handleListMyChapterDraftRuns,
  handlePublishChapterDraftRun,
  handlePutChapterDraftSection,
  handleReviseChapterDraftSection,
} from "./project-knowledge-chapter-draft-routes";
import {
  handleGetProjectPermissions,
  handleGetUserProjectRoles,
  handlePutProjectPermissions,
} from "./project-permissions-routes";
import {
  handleCreateJoinRequest,
  handleListMyJoinRequests,
  handleListProjectJoinRequests,
  handleReviewJoinRequest,
} from "./project-join-routes";
import { handleListMyOpenQuestions } from "./open-questions-routes";
import { decodePathProjectId } from "./projects-resolve";
import { reconcileActiveAgentJobsForUser } from "./agent-jobs";
import {
  handleAdminCreateWorkspaceUser,
  handleAdminDeleteUserProjectMembership,
  handleAdminDeleteWorkspaceUser,
  handleAdminGetUserProjectMemberships,
  handleAdminListWorkspaceUsers,
  handleAdminPatchWorkspaceUser,
  handleAdminSetWorkspaceUserPassword,
} from "./workspace-users-admin-routes";
import {
  handleAdminCreateSkill,
  handleAdminDeleteSkill,
  handleAdminGetSkill,
  handleAdminImportFromVolume,
  handleAdminListSkills,
  handleAdminPutSkill,
  handleAdminRestartHermesGateway,
  handleAdminSyncOneSkill,
  handleAdminSyncSkills,
} from "./skills-admin-routes";

type Env = {
  DB: AppDatabase;
  FILES: AppObjectStorage;
  [key: string]: unknown;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeUserId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim();
  return id.length > 0 ? id : null;
}

/**
 * 已通过 Bearer 鉴权后的 API 路由（除公开 auth 路径外）
 * handlers 由 index 注入，避免与 index 循环依赖
 */
export type AuthedRouteHandlers = {
  handleCitations: (projectId: string) => Promise<Response>;
  handleListFiles: (
    env: Env,
    projectId: string,
    userId: string,
  ) => Promise<Response>;
  handleUpload: (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    projectId: string,
    authUserId: string,
  ) => Promise<Response>;
  handleChat: (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ) => Promise<Response>;
  handleAgentJobPoll: (
    env: Env,
    jobId: string,
    userId: string,
  ) => Promise<Response>;
  handleCancelAgentJob: (
    env: Env,
    jobId: string,
    userId: string,
  ) => Promise<Response>;
  handleSlotBatchResumePublish: (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    projectId: string,
  ) => Promise<Response>;
  handleSlotBatchBatch2Smoke: (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    projectId: string,
  ) => Promise<Response>;
  handleSlotBatchBatch3Smoke: (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    projectId: string,
  ) => Promise<Response>;
};

export async function routeAuthedApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  path: string,
  url: URL,
  authUserId: string,
  handlers: AuthedRouteHandlers,
): Promise<Response> {
  // 路径级 userId 必须与会话一致
  const pathUserMatch = /^\/api\/users\/([^/]+)\//u.exec(path);
  if (pathUserMatch) {
    const routeUid = normalizeUserId(pathUserMatch[1]);
    if (routeUid && routeUid !== authUserId) {
      return json(
        { error: "userId 与登录会话不一致", code: "USER_MISMATCH" },
        403,
      );
    }
  }

  if (
    /^\/api\/projects\/[^/]+\/knowledge-network\/versions\/(\d+)$/u.test(path) &&
    request.method === "GET"
  ) {
    const knVersionMatch =
      /^\/api\/projects\/[^/]+\/knowledge-network\/versions\/(\d+)$/u.exec(path);
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    const version = Number(knVersionMatch?.[1] ?? "0");
    return handleGetProjectKnowledgeNetworkVersion(
      env,
      projectId,
      version,
      authUserId,
    );
  }

  if (
    /^\/api\/projects\/[^/]+\/knowledge-network\/slot-batch-resume-publish$/u.test(
      path,
    ) &&
    request.method === "POST"
  ) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    return handlers.handleSlotBatchResumePublish(request, env, ctx, projectId);
  }

  if (
    /^\/api\/projects\/[^/]+\/knowledge-network\/slot-batch-batch3-smoke$/u.test(
      path,
    ) &&
    request.method === "POST"
  ) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    return handlers.handleSlotBatchBatch3Smoke(request, env, ctx, projectId);
  }

  if (
    /^\/api\/projects\/[^/]+\/knowledge-network\/slot-batch-batch2-smoke$/u.test(
      path,
    ) &&
    request.method === "POST"
  ) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    return handlers.handleSlotBatchBatch2Smoke(request, env, ctx, projectId);
  }

  if (/^\/api\/projects\/[^/]+\/knowledge-network$/u.test(path)) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    if (request.method === "GET") {
      const htmlParam = (url.searchParams.get("html") ?? "1").trim();
      const includeHtml = htmlParam !== "0" && htmlParam !== "false";
      return handleGetProjectKnowledgeNetwork(
        env,
        projectId,
        authUserId,
        includeHtml,
      );
    }
    if (request.method === "PUT") {
      return handlePutProjectKnowledgeNetwork(
        request,
        env,
        projectId,
        authUserId,
      );
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (
    /^\/api\/projects\/[^/]+\/chapter-draft-runs\/[^/]+\/sections\/[^/]+\/generate$/u.test(
      path,
    ) &&
    request.method === "POST"
  ) {
    const parts = path.split("/");
    const projectId = decodePathProjectId(parts[3] ?? "");
    const runId = parts[5] ?? "";
    const sectionId = parts[7] ?? "";
    return handleGenerateChapterDraftSection(
      env,
      projectId,
      runId,
      sectionId,
      authUserId,
    );
  }

  if (
    /^\/api\/projects\/[^/]+\/chapter-draft-runs\/[^/]+\/sections\/[^/]+\/revise$/u.test(
      path,
    ) &&
    request.method === "POST"
  ) {
    const parts = path.split("/");
    const projectId = decodePathProjectId(parts[3] ?? "");
    const runId = parts[5] ?? "";
    const sectionId = parts[7] ?? "";
    return handleReviseChapterDraftSection(
      request,
      env,
      ctx,
      projectId,
      runId,
      sectionId,
      authUserId,
    );
  }

  if (
    /^\/api\/projects\/[^/]+\/chapter-draft-runs\/[^/]+\/sections\/[^/]+$/u.test(
      path,
    ) &&
    request.method === "PUT"
  ) {
    const parts = path.split("/");
    const projectId = decodePathProjectId(parts[3] ?? "");
    const runId = parts[5] ?? "";
    const sectionId = parts[7] ?? "";
    return handlePutChapterDraftSection(
      request,
      env,
      projectId,
      runId,
      sectionId,
      authUserId,
    );
  }

  if (
    /^\/api\/projects\/[^/]+\/chapter-draft-runs\/[^/]+\/sections\/[^/]+$/u.test(
      path,
    ) &&
    request.method === "DELETE"
  ) {
    const parts = path.split("/");
    const projectId = decodePathProjectId(parts[3] ?? "");
    const runId = parts[5] ?? "";
    const sectionId = parts[7] ?? "";
    return handleDeleteChapterDraftSection(
      env,
      projectId,
      runId,
      sectionId,
      authUserId,
    );
  }

  if (
    /^\/api\/projects\/[^/]+\/chapter-draft-runs\/[^/]+\/publish$/u.test(
      path,
    ) &&
    request.method === "POST"
  ) {
    const parts = path.split("/");
    const projectId = decodePathProjectId(parts[3] ?? "");
    const runId = parts[5] ?? "";
    return handlePublishChapterDraftRun(
      request,
      env,
      projectId,
      runId,
      authUserId,
    );
  }

  if (
    /^\/api\/projects\/[^/]+\/chapter-draft-runs\/[^/]+\/discard$/u.test(
      path,
    ) &&
    request.method === "POST"
  ) {
    const parts = path.split("/");
    const projectId = decodePathProjectId(parts[3] ?? "");
    const runId = parts[5] ?? "";
    return handleDiscardChapterDraftRun(env, projectId, runId, authUserId);
  }

  if (/^\/api\/projects\/[^/]+\/chapter-draft-runs\/[^/]+$/u.test(path)) {
    const parts = path.split("/");
    const projectId = decodePathProjectId(parts[3] ?? "");
    const runId = parts[5] ?? "";
    if (request.method === "GET") {
      return handleGetChapterDraftRun(env, projectId, runId, authUserId);
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (/^\/api\/projects\/[^/]+\/chapter-draft-runs$/u.test(path)) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    if (request.method === "POST") {
      return handleCreateChapterDraftRun(
        request,
        env,
        projectId,
        authUserId,
      );
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (
    /^\/api\/projects\/[^/]+\/knowledge-chapter-versions\/[^/]+$/u.test(path) &&
    request.method === "GET"
  ) {
    const parts = path.split("/");
    const projectId = decodePathProjectId(parts[3] ?? "");
    const version = parts[5] ?? "";
    return handleGetKnowledgeChapterVersion(
      env,
      projectId,
      version,
      authUserId,
    );
  }

  if (
    /^\/api\/projects\/[^/]+\/knowledge-chapter-versions$/u.test(path) &&
    request.method === "GET"
  ) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    return handleListKnowledgeChapterVersions(env, projectId, authUserId);
  }

  if (
    /^\/api\/projects\/[^/]+\/knowledge-chapters\/[^/]+\/generate$/u.test(
      path,
    ) &&
    request.method === "POST"
  ) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    const sectionId = path.split("/")[5] ?? "";
    return handleGenerateProjectKnowledgeChapter(
      env,
      projectId,
      sectionId,
      authUserId,
    );
  }

  if (
    /^\/api\/projects\/[^/]+\/knowledge-chapters\/[^/]+\/revise$/u.test(path) &&
    request.method === "POST"
  ) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    const sectionId = path.split("/")[5] ?? "";
    return handleReviseProjectKnowledgeChapter(
      request,
      env,
      projectId,
      sectionId,
      authUserId,
    );
  }

  if (/^\/api\/projects\/[^/]+\/knowledge-chapters\/[^/]+$/u.test(path)) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    const sectionId = path.split("/")[5] ?? "";
    if (request.method === "GET") {
      return handleGetProjectKnowledgeChapter(
        env,
        projectId,
        sectionId,
        authUserId,
      );
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (/^\/api\/projects\/[^/]+\/knowledge-chapters$/u.test(path)) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    if (request.method === "GET") {
      return handleListProjectKnowledgeChapters(env, projectId, authUserId);
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (
    path === "/api/admin/project-knowledge-network/backfill" &&
    request.method === "POST"
  ) {
    return handleBackfillProjectKnowledgeNetworks(request, env, url);
  }

  if (path === "/api/admin/documents/reembed" && request.method === "POST") {
    return handleReembedDocuments(request, env, url, ctx);
  }

  if (/^\/api\/projects\/[^/]+\/citations$/u.test(path) && request.method === "GET") {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    return handlers.handleCitations(projectId);
  }

  if (path === "/api/me/join-requests" && request.method === "GET") {
    return handleListMyJoinRequests(env, authUserId);
  }

  if (path === "/api/me/open-questions" && request.method === "GET") {
    return handleListMyOpenQuestions(env, authUserId);
  }

  if (path === "/api/me/chapter-draft-runs" && request.method === "GET") {
    return handleListMyChapterDraftRuns(env, authUserId);
  }

  if (
    /^\/api\/projects\/[^/]+\/join-requests\/[^/]+$/u.test(path) &&
    request.method === "PATCH"
  ) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    const requestId = path.split("/")[5] ?? "";
    return handleReviewJoinRequest(
      request,
      env,
      projectId,
      requestId,
      authUserId,
    );
  }

  if (/^\/api\/projects\/[^/]+\/join-requests$/u.test(path)) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    if (request.method === "GET") {
      return handleListProjectJoinRequests(
        env,
        projectId,
        authUserId,
        url.searchParams.get("status"),
      );
    }
    if (request.method === "POST") {
      return handleCreateJoinRequest(env, projectId, authUserId);
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (/^\/api\/projects\/[^/]+\/permissions$/u.test(path)) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    if (request.method === "GET") {
      return handleGetProjectPermissions(env, projectId, authUserId);
    }
    if (request.method === "PUT") {
      return handlePutProjectPermissions(request, env, projectId, authUserId);
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (/^\/api\/projects\/[^/]+\/files\/[^/]+\/parse-summary$/u.test(path)) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    const docId = path.split("/")[5] ?? "";
    if (request.method === "GET") {
      return handleParseProjectFileSummary(
        request,
        env,
        ctx,
        projectId,
        docId,
      );
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (/^\/api\/projects\/[^/]+\/files\/[^/]+\/download$/u.test(path)) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    const docId = path.split("/")[5] ?? "";
    if (request.method === "GET") {
      return handleDownloadProjectFile(request, env, projectId, docId);
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (/^\/api\/projects\/[^/]+\/files\/[^/]+$/u.test(path)) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    const docId = path.split("/")[5] ?? "";
    if (request.method === "DELETE") {
      return handleDeleteProjectFile(request, env, projectId, docId);
    }
    if (request.method === "PATCH") {
      return handlePatchProjectFile(request, env, projectId, docId);
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (/^\/api\/projects\/[^/]+\/files$/u.test(path)) {
    const projectId = decodePathProjectId(path.split("/")[3] ?? "");
    if (request.method === "GET") {
      return handlers.handleListFiles(env, projectId, authUserId);
    }
    if (request.method === "POST") {
      return handlers.handleUpload(request, env, ctx, projectId, authUserId);
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  if (path === "/api/chat" && request.method === "POST") {
    return handlers.handleChat(request, env, ctx);
  }

  if (/^\/api\/agent-jobs\/[^/]+$/u.test(path) && request.method === "GET") {
    const jobId = path.split("/")[3] ?? "";
    return handlers.handleAgentJobPoll(env, jobId, authUserId);
  }

  if (
    /^\/api\/agent-jobs\/[^/]+\/cancel$/u.test(path) &&
    request.method === "POST"
  ) {
    const jobId = path.split("/")[3] ?? "";
    return handlers.handleCancelAgentJob(env, jobId, authUserId);
  }

  if (
    /^\/api\/users\/[^/]+\/active-agent-jobs$/u.test(path) &&
    request.method === "GET"
  ) {
    await reconcileActiveAgentJobsForUser(env, authUserId);
    return handleGetActiveAgentJobs(env, authUserId);
  }

  if (path === "/api/admin/chat-audit" && request.method === "GET") {
    return handleGetChatAudit(request, env, url);
  }

  if (path === "/api/admin/skills" && request.method === "GET") {
    return handleAdminListSkills(env, authUserId);
  }
  if (path === "/api/admin/skills" && request.method === "POST") {
    return handleAdminCreateSkill(env, authUserId, request);
  }
  if (path === "/api/admin/skills/sync" && request.method === "POST") {
    return handleAdminSyncSkills(env, authUserId);
  }
  if (
    path === "/api/admin/skills/import-from-volume" &&
    request.method === "POST"
  ) {
    return handleAdminImportFromVolume(env, authUserId);
  }
  if (
    path === "/api/admin/skills/restart-gateway" &&
    request.method === "POST"
  ) {
    return handleAdminRestartHermesGateway(env, authUserId);
  }
  if (
    /^\/api\/admin\/skills\/[^/]+\/sync$/u.test(path) &&
    request.method === "POST"
  ) {
    const skillName = decodeURIComponent(path.split("/")[4] ?? "");
    return handleAdminSyncOneSkill(env, authUserId, skillName);
  }
  if (
    /^\/api\/admin\/skills\/[^/]+$/u.test(path) &&
    request.method === "GET"
  ) {
    const skillName = decodeURIComponent(path.split("/")[4] ?? "");
    return handleAdminGetSkill(env, authUserId, skillName);
  }
  if (
    /^\/api\/admin\/skills\/[^/]+$/u.test(path) &&
    request.method === "PUT"
  ) {
    const skillName = decodeURIComponent(path.split("/")[4] ?? "");
    return handleAdminPutSkill(env, authUserId, skillName, request);
  }
  if (
    /^\/api\/admin\/skills\/[^/]+$/u.test(path) &&
    request.method === "DELETE"
  ) {
    const skillName = decodeURIComponent(path.split("/")[4] ?? "");
    return handleAdminDeleteSkill(env, authUserId, skillName);
  }

  if (
    path === "/api/admin/knowledge-network-chapter-templates" &&
    request.method === "GET"
  ) {
    return handleAdminListKnChapterTemplates(env, authUserId);
  }
  if (
    path === "/api/admin/knowledge-network-prompt-settings/generate_system" &&
    request.method === "GET"
  ) {
    return handleAdminGetGenerateSystemPrompt(env, authUserId);
  }
  if (
    path === "/api/admin/knowledge-network-prompt-settings/generate_system" &&
    request.method === "PUT"
  ) {
    return handleAdminPutGenerateSystemPrompt(request, env, authUserId);
  }
  if (
    /^\/api\/admin\/knowledge-network-chapter-templates\/[^/]+\/revise$/u.test(
      path,
    ) &&
    request.method === "POST"
  ) {
    const tid = decodeURIComponent(path.split("/")[4] ?? "");
    return handleAdminReviseKnChapterTemplate(request, env, authUserId, tid);
  }
  if (
    /^\/api\/admin\/knowledge-network-chapter-templates\/[^/]+$/u.test(path) &&
    request.method === "GET"
  ) {
    const tid = decodeURIComponent(path.split("/")[4] ?? "");
    return handleAdminGetKnChapterTemplate(env, authUserId, tid);
  }
  if (
    /^\/api\/admin\/knowledge-network-chapter-templates\/[^/]+$/u.test(path) &&
    request.method === "PUT"
  ) {
    const tid = decodeURIComponent(path.split("/")[4] ?? "");
    return handleAdminPutKnChapterTemplate(request, env, authUserId, tid);
  }

  if (path === "/api/admin/llm-settings" && request.method === "GET") {
    return handleAdminGetLlmSettings(env, authUserId);
  }
  if (path === "/api/admin/llm-settings" && request.method === "PUT") {
    return handleAdminPutLlmSettings(request, env, authUserId);
  }
  if (path === "/api/admin/llm-settings/test" && request.method === "POST") {
    return handleAdminTestLlmSettings(env, authUserId);
  }
  if (
    path === "/api/admin/llm-settings/refresh-models" &&
    request.method === "POST"
  ) {
    return handleAdminRefreshLlmModels(env, authUserId);
  }

  if (path === "/api/admin/workspace-users" && request.method === "GET") {
    return handleAdminListWorkspaceUsers(env, authUserId);
  }
  if (path === "/api/admin/workspace-users" && request.method === "POST") {
    return handleAdminCreateWorkspaceUser(request, env, authUserId);
  }
  if (
    /^\/api\/admin\/workspace-users\/[^/]+$/u.test(path) &&
    request.method === "PATCH"
  ) {
    const targetId = decodeURIComponent(path.split("/")[4] ?? "");
    return handleAdminPatchWorkspaceUser(
      request,
      env,
      authUserId,
      targetId,
    );
  }
  if (
    /^\/api\/admin\/workspace-users\/[^/]+$/u.test(path) &&
    request.method === "DELETE"
  ) {
    const targetId = decodeURIComponent(path.split("/")[4] ?? "");
    return handleAdminDeleteWorkspaceUser(env, authUserId, targetId);
  }
  if (
    /^\/api\/admin\/workspace-users\/[^/]+\/password$/u.test(path) &&
    request.method === "PUT"
  ) {
    const targetId = decodeURIComponent(path.split("/")[4] ?? "");
    return handleAdminSetWorkspaceUserPassword(
      request,
      env,
      authUserId,
      targetId,
    );
  }
  if (
    /^\/api\/admin\/workspace-users\/[^/]+\/project-memberships$/u.test(path) &&
    request.method === "GET"
  ) {
    const targetId = decodeURIComponent(path.split("/")[4] ?? "");
    return handleAdminGetUserProjectMemberships(env, authUserId, targetId);
  }
  if (
    /^\/api\/admin\/workspace-users\/[^/]+\/project-memberships\/[^/]+$/u.test(
      path,
    ) &&
    request.method === "DELETE"
  ) {
    const targetId = decodeURIComponent(path.split("/")[4] ?? "");
    const projectId = decodeURIComponent(path.split("/")[6] ?? "");
    return handleAdminDeleteUserProjectMembership(
      env,
      authUserId,
      targetId,
      projectId,
    );
  }
  if (
    /^\/api\/users\/[^/]+\/project-roles$/u.test(path) &&
    request.method === "GET"
  ) {
    return handleGetUserProjectRoles(env, authUserId);
  }

  if (/^\/api\/users\/[^/]+\/chat-state$/u.test(path)) {
    if (request.method === "GET") {
      return handleGetChatState(env, authUserId);
    }
    if (request.method === "PUT") {
      const body = (await request.json()) as Parameters<
        typeof handlePutChatState
      >[2];
      return handlePutChatState(env, authUserId, body);
    }
    return json({ error: "Method Not Allowed" }, 405);
  }

  return json({ error: "Not Found" }, 404);
}
