/**
 * 知识网络更新前：按阶段把 Markdown 总文件写入项目资料包。
 * 草案 item 只记路径标记，禁止把 Markdown 发布成知识网络正文。
 */
import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import {
  persistMarkdownAtPath,
  readCurrentMarkdownAtPath,
  tryReuseSeedFirstVersionDeliverable,
} from "./ai-generated-documents";
import { getStoredAnalysisKind, DEFAULT_ANALYSIS_KIND } from "./analysis-kind";
import { buildFileSkillMethodBlock } from "./chapter-skill-method";
import {
  deliverableById,
  deliverableDraftHtmlMarker,
  deliverableRelativePath,
  earlierDeliverables,
  type DeliverableFile,
} from "./deliverable-catalog";
import {
  deliverableFileIdFromDraft,
  isDeliverableDraftId,
} from "./kn-catalog";
import { callLlm, type LlmClientEnv } from "./llm-client";
import {
  extractMarkdownBody,
  FILE_WRITE_RETRY_HINT,
  isWriteReceiptMarkdown,
  looksLikeMarkdownFile,
  shouldReuseExistingDeliverable,
} from "./deliverable-markdown-quality";
import { buildChapterGenerateMaterials } from "./project-knowledge-chapters-digest";
import {
  getDraftRun,
  refreshDraftRunProgress,
  upsertDraftItem,
} from "./project-knowledge-chapter-revisions-db";
import { getProjectById } from "./projects-db";

type Env = { DB: AppDatabase; FILES: AppObjectStorage } & LlmClientEnv;

const FILE_SYSTEM = `你是投研资料撰写助手。根据项目资料包事实，写出一份完整的 Markdown 分析正文。

硬性规则：
1. 只输出 Markdown 正文。第一行必须是 # 或 ## 标题。不要 HTML，不要 \`\`\` 围栏，不要 ===CHAPTER===。
2. 用二级/三级标题、表格、列表把分析写完整。缺证据处写「待补」，禁止编造。
3. 事实必须来自【资料目录】【本章深读】【相关段落补充】和【已生成总文件】。目录里有、深读未覆盖的细节写「待补」。
4. 创业财务不要 IRR、MOIC、投资人 Down/Base/Up 三情景。市场规模写「总市场 / 可服务市场 / 可获得份额」，不要把 TAM/SAM/SOM 当主标题。
5. 不要输出 kn-* class 或 HTML 表格骨架。
6. 你没有写文件工具。禁止输出「已写入」「文件已保存到」「写到 AI生成/…」「14.2KB」「下一层知识网络可填模板」这类回执。你的回复本身就是文件内容。`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function preferredNamesForFile(
  kind: Parameters<typeof earlierDeliverables>[0],
  file: DeliverableFile,
): string[] {
  const earlier = earlierDeliverables(kind, file);
  return [file.filename, ...earlier.slice(-6).map((d) => d.filename)];
}

export async function handleGenerateDeliverableDraft(
  env: Env,
  projectId: string,
  draftItemId: string,
  userId: string,
  runId: string,
): Promise<Response> {
  if (!isDeliverableDraftId(draftItemId)) {
    return json({ error: "不是资料文件条目", code: "INVALID_SECTION" }, 400);
  }
  const run = await getDraftRun(env.DB, runId);
  if (!run || run.projectId !== projectId) {
    return json({ error: "草案 run 不存在" }, 404);
  }
  if (run.status === "published" || run.status === "discarded") {
    return json({ error: "该草案已结束，无法继续生成", code: "RUN_CLOSED" }, 409);
  }

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const kind =
    (await getStoredAnalysisKind(env.DB, projectId)) ?? DEFAULT_ANALYSIS_KIND;
  const fileId = deliverableFileIdFromDraft(draftItemId);
  const file = deliverableById(kind, fileId);
  if (!file) {
    await upsertDraftItem(env.DB, {
      runId,
      sectionId: draftItemId,
      status: "failed",
      html: null,
      error: "当前形态没有这份资料文件",
      llmBackend: null,
    });
    await refreshDraftRunProgress(env.DB, runId);
    return json({ error: "当前形态没有这份资料文件" }, 400);
  }

  const markFailed = async (error: string) => {
    await upsertDraftItem(env.DB, {
      runId,
      sectionId: draftItemId,
      status: "failed",
      html: null,
      error,
      llmBackend: null,
    });
    await refreshDraftRunProgress(env.DB, runId);
  };

  const relativePath = deliverableRelativePath(file);
  const reused = await tryReuseSeedFirstVersionDeliverable(
    env,
    projectId,
    relativePath,
    file.filename,
  );
  if (reused) {
    const marker = deliverableDraftHtmlMarker(file);
    await upsertDraftItem(env.DB, {
      runId,
      sectionId: draftItemId,
      status: "ok",
      html: marker,
      error: null,
      llmBackend: "reuse",
    });
    await refreshDraftRunProgress(env.DB, runId);
    return json({
      ok: true,
      reused: true,
      sectionId: draftItemId,
      path: `${relativePath}/${file.filename}`,
      documentId: reused.documentId,
    });
  }

  const currentMd = await readCurrentMarkdownAtPath(
    env,
    projectId,
    relativePath,
    file.filename,
  );
  if (shouldReuseExistingDeliverable(currentMd)) {
    const marker = deliverableDraftHtmlMarker(file);
    await upsertDraftItem(env.DB, {
      runId,
      sectionId: draftItemId,
      status: "ok",
      html: marker,
      error: null,
      llmBackend: "reuse",
    });
    await refreshDraftRunProgress(env.DB, runId);
    return json({
      ok: true,
      reused: true,
      reusedCurrent: true,
      sectionId: draftItemId,
      path: `${relativePath}/${file.filename}`,
    });
  }

  const preferredFilenames = preferredNamesForFile(kind, file);
  const materials = await buildChapterGenerateMaterials(env, projectId, userId, {
    sectionId: file.knSectionIds[0],
    extraQuery: `${file.title} ${file.filename}`,
    preferredFilenames,
  });
  const skillMethod = await buildFileSkillMethodBlock(
    file.id,
    [file.skill],
    env.DB,
    file.filename,
  );
  const userPrompt = [
    `项目：${project.name}`,
    project.summary ? `简介：${project.summary}` : "",
    `项目形态：${kind}`,
    `请直接输出「${file.title}」的完整 Markdown 分析（对应 ${file.filename}）。`,
    `结构可对照知识网络「${file.knSectionIds.join("、")}」，但不要在正文里提章节模板或路径。`,
    "",
    "从第一个 # 或 ## 标题起写完整分析、表格和判断。缺证据写「待补」。",
    "不要写已写入、不要写路径、不要写下一层怎么用。你的回复就是这份文件。",
    "",
    skillMethod,
    "",
    materials.digest.trim() ||
      "【项目上传附件】\n（暂无可用资料；请在对应位置标注「待补」。）",
  ]
    .filter(Boolean)
    .join("\n");

  const runModel = (user: string) =>
    callLlm(env, [
      { role: "system", content: FILE_SYSTEM },
      { role: "user", content: user },
    ]);

  let answer: string;
  let llmBackend: string;
  try {
    const first = await runModel(userPrompt);
    answer = first.answer;
    llmBackend = first.llmBackend;
    let body = extractMarkdownBody(answer);
    if (isWriteReceiptMarkdown(body) || !looksLikeMarkdownFile(body)) {
      const second = await runModel(`${userPrompt}\n\n${FILE_WRITE_RETRY_HINT}`);
      answer = second.answer;
      llmBackend = second.llmBackend;
      body = extractMarkdownBody(answer);
    }
    if (isWriteReceiptMarkdown(body) || !looksLikeMarkdownFile(body)) {
      await markFailed("这次没有写出完整分析，请再生成一次");
      return json({ error: "这次没有写出完整分析，请再生成一次" }, 502);
    }

    const docId = await persistMarkdownAtPath(env, {
      projectId,
      userId,
      relativePath,
      filename: file.filename,
      body,
      sourceKind: "ai_generated",
      fileCategory: file.title,
    });
    if (!docId) {
      await markFailed("写入资料包失败");
      return json({ error: "写入资料包失败" }, 500);
    }

    const marker = deliverableDraftHtmlMarker(file);
    await upsertDraftItem(env.DB, {
      runId,
      sectionId: draftItemId,
      status: "ok",
      html: marker,
      error: null,
      llmBackend,
    });
    await refreshDraftRunProgress(env.DB, runId);
    return json({
      ok: true,
      sectionId: draftItemId,
      path: `${relativePath}/${file.filename}`,
      documentId: docId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markFailed(`生成失败：${msg}`);
    return json({ error: `生成失败：${msg}` }, 502);
  }
}
