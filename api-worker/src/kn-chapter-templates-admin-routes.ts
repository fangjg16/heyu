import type { AppDatabase } from "./app-database";
import { callLlm, type LlmClientEnv } from "./llm-client";
import { isPlatformAdmin } from "./projects-auth";
import {
  getKnChapterTemplate,
  getPromptSetting,
  KN_PROMPT_SETTING_GENERATE_SYSTEM,
  listKnChapterTemplates,
  updateKnChapterTemplateContent,
  updateKnChapterTemplateMarkdown,
  upsertPromptSetting,
  type KnChapterTemplatePublic,
} from "./kn-chapter-templates-db";

type Env = { DB: AppDatabase } & LlmClientEnv;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function requirePlatformAdmin(
  env: Env,
  authUserId: string,
): Promise<Response | null> {
  if (!(await isPlatformAdmin(env, authUserId))) {
    return json({ error: "需要平台管理员权限", code: "FORBIDDEN" }, 403);
  }
  return null;
}

function tableMissingResponse(msg: string): Response | null {
  if (
    /Unknown table ['`]?knowledge_network_chapter_templates['`]?/i.test(msg) ||
    /no such table:\s*knowledge_network_chapter_templates/i.test(msg) ||
    /Unknown table ['`]?knowledge_network_prompt_settings['`]?/i.test(msg) ||
    /no such table:\s*knowledge_network_prompt_settings/i.test(msg) ||
    /Unknown column ['`]?format_hint['`]?/i.test(msg)
  ) {
    return json(
      {
        error:
          "表未迁移：请执行 migration 0017/0020，并运行 npm run seed:kn-chapter-templates",
      },
      503,
    );
  }
  return null;
}

const REVISE_TEMPLATE_SYSTEM = `你是投研知识网络「章节 Markdown 模板」改写助手。模板通常含 YAML frontmatter + HTML 骨架，用于指导后续生成章节 HTML。

根据用户指令，在现有模板上做最小必要修改，返回**完整更新后的模板全文**。

要求：
1. 只改用户点名的部分；未提及处尽量保持原样。
2. 必须保留 YAML frontmatter（--- ... ---）；不要删改无关元数据字段，除非指令明确要求。
3. 正文保持 HTML 骨架结构（表格/卡片/分区等），禁止扩写成无关长文或演示数据。
4. 不要编造具体项目事实；占位仍用「待补」或原有占位符。
5. 只输出模板全文本身，不要 markdown 代码围栏，不要解释。`;

function stripMarkdownFences(raw: string): string {
  let text = (raw ?? "").trim();
  const fenced = /^```(?:markdown|md|html)?\s*\n?([\s\S]*?)\n?```$/iu.exec(text);
  if (fenced?.[1]) text = fenced[1].trim();
  return text;
}

/** 按指令改写章节模板 markdown（不落库） */
export async function reviseChapterTemplateMarkdown(
  env: LlmClientEnv,
  input: {
    title: string;
    markdown: string;
    instruction: string;
  },
): Promise<{ markdown: string; llmBackend: string }> {
  const userPrompt = [
    `章节模板：${input.title}`,
    "",
    "【用户改写指令】",
    input.instruction,
    "",
    "【当前模板全文】",
    input.markdown,
  ].join("\n");

  const result = await callLlm(env, [
    { role: "system", content: REVISE_TEMPLATE_SYSTEM },
    { role: "user", content: userPrompt },
  ]);
  const markdown = stripMarkdownFences(result.answer);
  if (!markdown) {
    throw new Error("模型未返回有效模板内容");
  }
  return { markdown, llmBackend: result.llmBackend };
}

/** GET /api/admin/knowledge-network-chapter-templates */
export async function handleAdminListKnChapterTemplates(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;
  try {
    const templates = await listKnChapterTemplates(env.DB);
    return json({ templates });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const missing = tableMissingResponse(msg);
    if (missing) return missing;
    throw e;
  }
}

/** GET /api/admin/knowledge-network-chapter-templates/:id */
export async function handleAdminGetKnChapterTemplate(
  env: Env,
  authUserId: string,
  id: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;
  const tid = id.trim();
  if (!tid) return json({ error: "缺少章节 id" }, 400);
  try {
    const template = await getKnChapterTemplate(env.DB, tid);
    if (!template) return json({ error: "章节模板不存在" }, 404);
    return json({ template });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const missing = tableMissingResponse(msg);
    if (missing) return missing;
    throw e;
  }
}

/** PUT /api/admin/knowledge-network-chapter-templates/:id
 *  body: { markdown?: string, formatHint?: string | null } — 至少一项
 */
export async function handleAdminPutKnChapterTemplate(
  request: Request,
  env: Env,
  authUserId: string,
  id: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;
  const tid = id.trim();
  if (!tid) return json({ error: "缺少章节 id" }, 400);

  let body: { markdown?: unknown; formatHint?: unknown } = {};
  try {
    body = (await request.json()) as {
      markdown?: unknown;
      formatHint?: unknown;
    };
  } catch {
    return json({ error: "请求体须为 JSON" }, 400);
  }

  const hasMarkdown = typeof body.markdown === "string";
  const hasFormatHint =
    typeof body.formatHint === "string" || body.formatHint === null;
  if (!hasMarkdown && !hasFormatHint) {
    return json(
      { error: "须提供 markdown 与/或 formatHint" },
      400,
    );
  }

  const markdown = hasMarkdown ? (body.markdown as string) : undefined;
  if (markdown !== undefined && markdown.length > 500_000) {
    return json({ error: "markdown 过长" }, 400);
  }
  let formatHint: string | null | undefined;
  if (hasFormatHint) {
    formatHint =
      body.formatHint === null
        ? null
        : String(body.formatHint);
    if (formatHint !== null && formatHint.length > 100_000) {
      return json({ error: "formatHint 过长" }, 400);
    }
  }

  try {
    const existing = await getKnChapterTemplate(env.DB, tid);
    if (!existing) return json({ error: "章节模板不存在" }, 404);
    const template = await updateKnChapterTemplateContent(
      env.DB,
      tid,
      { markdown, formatHint },
      authUserId,
    );
    return json({ ok: true, template });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      tableMissingResponse(msg) ?? json({ error: `更新失败：${msg}` }, 500)
    );
  }
}

/** GET /api/admin/knowledge-network-prompt-settings/generate_system */
export async function handleAdminGetGenerateSystemPrompt(
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;
  try {
    const setting = await getPromptSetting(
      env.DB,
      KN_PROMPT_SETTING_GENERATE_SYSTEM,
    );
    return json({
      settingKey: KN_PROMPT_SETTING_GENERATE_SYSTEM,
      value: setting?.value ?? "",
      updatedAt: setting?.updatedAt ?? null,
      updatedBy: setting?.updatedBy ?? null,
      empty: !setting?.value?.trim(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const missing = tableMissingResponse(msg);
    if (missing) return missing;
    throw e;
  }
}

/** PUT /api/admin/knowledge-network-prompt-settings/generate_system  body: { value } */
export async function handleAdminPutGenerateSystemPrompt(
  request: Request,
  env: Env,
  authUserId: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;

  let body: { value?: unknown } = {};
  try {
    body = (await request.json()) as { value?: unknown };
  } catch {
    return json({ error: "请求体须为 JSON：{ value }" }, 400);
  }
  if (typeof body.value !== "string") {
    return json({ error: "缺少 value 字符串" }, 400);
  }
  const value = body.value;
  if (!value.trim()) {
    return json({ error: "value 不能为空" }, 400);
  }
  if (value.length > 200_000) {
    return json({ error: "value 过长" }, 400);
  }

  try {
    const setting = await upsertPromptSetting(
      env.DB,
      KN_PROMPT_SETTING_GENERATE_SYSTEM,
      value,
      authUserId,
    );
    return json({ ok: true, setting });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      tableMissingResponse(msg) ?? json({ error: `保存失败：${msg}` }, 500)
    );
  }
}

/** POST /api/admin/knowledge-network-chapter-templates/:id/revise  body: { instruction } */
export async function handleAdminReviseKnChapterTemplate(
  request: Request,
  env: Env,
  authUserId: string,
  id: string,
): Promise<Response> {
  const denied = await requirePlatformAdmin(env, authUserId);
  if (denied) return denied;
  const tid = id.trim();
  if (!tid) return json({ error: "缺少章节 id" }, 400);

  let body: { instruction?: unknown } = {};
  try {
    body = (await request.json()) as { instruction?: unknown };
  } catch {
    return json({ error: "请求体须为 JSON：{ instruction }" }, 400);
  }
  const instruction =
    typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction) {
    return json({ error: "instruction 不能为空" }, 400);
  }
  if (instruction.length > 4000) {
    return json({ error: "instruction 过长" }, 400);
  }

  let existing: KnChapterTemplatePublic | null;
  try {
    existing = await getKnChapterTemplate(env.DB, tid);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const missing = tableMissingResponse(msg);
    if (missing) return missing;
    throw e;
  }
  if (!existing) return json({ error: "章节模板不存在" }, 404);
  if (!existing.markdown.trim()) {
    return json({ error: "模板内容为空，无法改写", code: "NO_MARKDOWN" }, 400);
  }

  let revisedMarkdown: string;
  let llmBackend: string;
  try {
    const revised = await reviseChapterTemplateMarkdown(env, {
      title: existing.title,
      markdown: existing.markdown,
      instruction,
    });
    revisedMarkdown = revised.markdown;
    llmBackend = revised.llmBackend;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `改写失败：${msg}` }, 502);
  }

  try {
    const template = await updateKnChapterTemplateMarkdown(
      env.DB,
      tid,
      revisedMarkdown,
      authUserId,
    );
    return json({ ok: true, template, llmBackend });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      tableMissingResponse(msg) ?? json({ error: `保存改写结果失败：${msg}` }, 500)
    );
  }
}
