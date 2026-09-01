/**
 * 知识网络更新前：按阶段把 Markdown 总文件写入项目资料包。
 * 草案 item 只记路径标记，禁止把 Markdown 发布成知识网络正文。
 */
import type { AppDatabase } from "./app-database";
import type { AppObjectStorage } from "./app-storage";
import { persistMarkdownAtPath } from "./ai-generated-documents";
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
import { buildChapterGenerateMaterials } from "./project-knowledge-chapters-digest";
import {
  getDraftRun,
  refreshDraftRunProgress,
  upsertDraftItem,
} from "./project-knowledge-chapter-revisions-db";
import { getProjectById } from "./projects-db";

type Env = { DB: AppDatabase; FILES: AppObjectStorage } & LlmClientEnv;

const FILE_SYSTEM = `你是投研资料撰写助手。根据项目资料包事实，写出一份完整的 Markdown 总文件。

硬性规则：
1. 只输出 Markdown 正文，不要 HTML，不要 \`\`\` 围栏，不要 ===CHAPTER=== 等标记。
2. 用二级/三级标题组织；缺证据处写「待补」，禁止编造。
3. 事实必须来自【资料目录】【本章深读】【相关段落补充】和【已生成总文件】。目录里有、深读未覆盖的细节写「待补」。
4. 创业财务不要 IRR、MOIC、投资人 Down/Base/Up 三情景。市场规模写「总市场 / 可服务市场 / 可获得份额」，不要把 TAM/SAM/SOM 当主标题。
5. 这是写入项目资料包的总文件，不是知识网络章节；不要输出 kn-* class 或 HTML 表格骨架。`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function extractMarkdownBody(answer: string): string {
  const t = answer.trim();
  const fenced = /```(?:markdown|md)?\s*\n([\s\S]*?)```/iu.exec(t);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  return t.replace(/^===CHAPTER===\s*/u, "").trim();
}

function looksLikeMarkdownFile(text: string): boolean {
  if (text.length < 120) return false;
  if (/^深度分析失败/.test(text)) return false;
  if (/class=["']kn-/iu.test(text) && /<table/iu.test(text)) return false;
  return true;
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
  );
  const relativePath = deliverableRelativePath(file);
  const userPrompt = [
    `项目：${project.name}`,
    project.summary ? `简介：${project.summary}` : "",
    `项目形态：${kind}`,
    `要写入的资料文件：${relativePath}/${file.filename}`,
    `文件标题：${file.title}`,
    `对应知识网络章节：${file.knSectionIds.join("、")}`,
    "",
    "任务：写出这份 Markdown 总文件。后一层知识网络会根据它来填章节模板。",
    "",
    skillMethod,
    "",
    materials.digest.trim() ||
      "【项目上传附件】\n（暂无可用资料；请在对应位置标注「待补」。）",
  ]
    .filter(Boolean)
    .join("\n");

  let answer: string;
  let llmBackend: string;
  try {
    const result = await callLlm(env, [
      { role: "system", content: FILE_SYSTEM },
      { role: "user", content: userPrompt },
    ]);
    answer = result.answer;
    llmBackend = result.llmBackend;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markFailed(`生成失败：${msg}`);
    return json({ error: `生成失败：${msg}` }, 502);
  }

  const body = extractMarkdownBody(answer);
  if (!looksLikeMarkdownFile(body)) {
    await markFailed("模型未返回有效 Markdown");
    return json({ error: "模型未返回有效 Markdown" }, 502);
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
}
