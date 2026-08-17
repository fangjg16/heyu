import type { AppDatabase } from "./app-database";
import {
  getKnChapterTemplate,
  getPromptSetting,
  KN_PROMPT_SETTING_GENERATE_SYSTEM,
} from "./kn-chapter-templates-db";
import { callLlm, type LlmClientEnv } from "./llm-client";
import {
  countPopulatedProjectKnowledgeChapters,
  getProjectKnowledgeChapterHtml,
  listProjectKnowledgeChapterHtml,
  upsertProjectKnowledgeChapterHtml,
} from "./project-knowledge-chapters-db";
import {
  completeReviseInstructionLog,
  insertReviseInstructionLog,
} from "./chapter-revise-logs-db";
import {
  getDraftItem,
  getDraftRun,
  refreshDraftRunProgress,
  upsertDraftItem,
} from "./project-knowledge-chapter-revisions-db";
import { buildChapterGenerateMaterialsDigest } from "./project-knowledge-chapters-digest";
import {
  ensureSourceRowAnchors,
  ensureTableHeaderNoWrap,
  GLOSSARY_TABLE_SKELETON,
  linkifyCitationMarkers,
  listExistingMetaDigest,
  mergeGlossaryAppend,
  mergeSourcesAppend,
  parseChapterGenerateAnswer,
  polishChapterTableHtml,
  SOURCES_TABLE_SKELETON,
} from "./project-knowledge-citations";
import {
  parseProjectGraphFromAnswerSegment,
  PROJECT_GRAPH_JSON_HINT,
} from "./project-overview-graph";
import { getProjectById } from "./projects-db";
import {
  canListProjectFiles,
  canPublishProjectKnowledgeNetwork,
} from "./workspace-roles";

type Env = { DB: AppDatabase } & LlmClientEnv;

/** 并行 generate 时串行化 sources/glossary 合并写库 */
async function withNamedLock<T>(
  db: AppDatabase,
  lockNameRaw: string,
  fn: () => Promise<T>,
  errorLabel: string,
): Promise<T> {
  const lockName = lockNameRaw.slice(0, 64);
  const row = await db
    .prepare("SELECT GET_LOCK(?, 120) AS acquired")
    .bind(lockName)
    .first<{ acquired: number | bigint | null }>();
  const acquired = row?.acquired == null ? 0 : Number(row.acquired);
  if (acquired !== 1) {
    throw new Error(`无法获取${errorLabel}，请稍后重试`);
  }
  try {
    return await fn();
  } finally {
    try {
      await db
        .prepare("SELECT RELEASE_LOCK(?) AS released")
        .bind(lockName)
        .first();
    } catch {
      /* 释放失败不掩盖业务结果 */
    }
  }
}

async function withKnMetaLock<T>(
  db: AppDatabase,
  projectId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withNamedLock(db, `kn-meta:${projectId}`, fn, "知识网络元数据锁");
}

async function withKnDraftMetaLock<T>(
  db: AppDatabase,
  runId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withNamedLock(db, `kn-draft-meta:${runId}`, fn, "草案元数据锁");
}

export type GenerateChapterTarget =
  | { target: "live" }
  | { target: "draft"; runId: string };

const VALID_SECTION_IDS = new Set([
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
]);

/** 元页面：可读写落库，但不计入「已有内容 / 13」；其中 project-overview 有模板可生成 */
const META_SECTION_IDS = new Set([
  "sources",
  "glossary",
  "project-overview",
  "project-graph",
]);

/** 有 Markdown 模板、可走 generate 的元页面 */
const GENERATABLE_META_SECTION_IDS = new Set(["project-overview"]);

const TOTAL_SECTIONS = 13;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeUserId(raw: string | null): string | null {
  const id = (raw ?? "").trim();
  return id.length > 0 ? id : null;
}

function normalizeSectionId(raw: string): string | null {
  const id = decodeURIComponent(raw || "").trim();
  if (!id) return null;
  if (VALID_SECTION_IDS.has(id) || META_SECTION_IDS.has(id)) return id;
  return null;
}

function hasChapterTemplate(id: string): boolean {
  return VALID_SECTION_IDS.has(id) || GENERATABLE_META_SECTION_IDS.has(id);
}

/** 将模型输出规范为单段 HTML 片段 */
export function normalizeChapterHtmlFragment(raw: string): string {
  let t = (raw ?? "").trim();
  if (!t) return "";

  const fullFence = /^```(?:html)?\s*([\s\S]*?)```$/iu.exec(t);
  if (fullFence?.[1]) {
    t = fullFence[1].trim();
  } else {
    const partialFence = /```(?:html)?\s*([\s\S]*?)```/iu.exec(t);
    if (partialFence?.[1]) t = partialFence[1].trim();
  }

  t = t.replace(/<!DOCTYPE[^>]*>/iu, "").trim();
  const htmlWrap = /<html\b[^>]*>([\s\S]*)<\/html>/iu.exec(t);
  if (htmlWrap?.[1]) t = htmlWrap[1].trim();
  const bodyWrap = /<body\b[^>]*>([\s\S]*)<\/body>/iu.exec(t);
  if (bodyWrap?.[1]) t = bodyWrap[1].trim();
  t = t.replace(/<\/?(?:head|meta|title|link|style)[^>]*>/giu, "").trim();

  return t;
}

const GENERATE_SYSTEM = `你是投研知识网络章节撰写助手。根据「章节 Markdown 模板」的结构，并**综合分析本项目资料包全部上传附件**中的事实，输出带标记的 HTML（不要完整 html/body/head，不要 markdown 围栏）。

硬性规则：
1. 模板有什么结构与内联 style，输出就保留什么；禁止增加模板中不存在的章节（尤其禁止「填写指引」、长篇前言、页外说明）。
2. 输出格式严格为标记分段（顺序固定）：
===CHAPTER===
（本章 HTML）
===GRAPH===
（仅「项目概览」：关系图 JSON；其他章节写 NONE）
===SOURCES_ADD===
（本章新出现的引用来源；无新增写 NONE）
===GLOSSARY_ADD===
（本章新出现的非常用名词；无新增写 NONE）
3. 引用来源与名词解释均为**增量**：禁止重写整张已有表；已有 ID / 已有名词不得再输出；只补新行。
4. 名词解释只收非常用术语（如多字母缩写 GRS、rPTA、AHPRA、BPC-157、FTO、Schedule 4）；常识词（公司、投资、市场、股权、利润等）禁止加入。
5. 凡表格「证据/来源」列：单元格内**只输出**引用标记如 [A-1]，禁止「项目协作方整理」「项目方整理」「BP称」等说明文字；多个引用用空格分隔。
6. 表格表头须可单行完整显示（勿把长表头拆成多行文字）。
7. 若模板已含带 style 的 HTML 骨架：必须保留这些 style，只替换「待补」内容。
8. 事实必须来自附件摘录；缺依据写「待补」，禁止编造。
9. 标记外禁止任何说明文字。关系图禁止输出 SVG/HTML，只输出 JSON。`;

const SECTION_FORMAT_HINT: Record<string, string> = {
  snapshot:
    "===CHAPTER=== 下一张三列表（项目项｜内容｜证据/来源）；「项目项」列文字单行完整显示（勿换行）；证据/来源列只写 [A-1] 等引用标记，禁止其它说明文字。表头单行完整显示。随后 ===SOURCES_ADD===（六列，仅新 ID）与 ===GLOSSARY_ADD===（仅非常用缩写/术语）。",
  objectives:
    "===CHAPTER=== 必须原样保留模板中的 HTML 结构与内联 style（尤其门槛卡片的金底边框样式），只替换「待补」为事实。门槛块必须是：margin-top:22px;padding:15px 17px;background:rgba(213,154,47,0.08);border:1px solid rgba(213,154,47,0.25)；标题 color:#B07d1f。禁止改成 callout/卡片阴影/h3 散文。最后一行「来源：…」用 font-size:12px;color:#59625F。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  risks:
    "===CHAPTER=== 只输出一张风险矩阵 HTML <table>（级别｜风险｜证据｜缓释），表格外禁止任何文字。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  questions:
    "===CHAPTER=== 严格按模板：三个 <details> 分组（P1/P2/P3），每组内为编号问题段落；保留内联 style；禁止改成研究结论散文或五列表格。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  industry:
    "===CHAPTER=== 严格按模板 HTML 骨架输出（对齐 BPC 行业分析版式）：①产品/标的背景表 ②作用机制四宫格+纠偏条 ③产品形态对比表 ④市场规模表(指标|数据|来源) ⑤供给侧参与方表 ⑥监管/行业时间线。保留模板内联 style；只替换「待补」；禁止改成「研究结论+关键发现」三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  legal:
    "===CHAPTER=== 严格按模板（对齐 BPC 合规分析）：监管前提红条 + 路径总览表 + 路径一闭环表 + 角色定位表 + 政策窗口提示 + 路径二表 + 执法风险提示 + 资质表 + 建议行动表 + 待审查清单。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  benchmarks:
    "===CHAPTER=== 严格按模板（对齐 BPC 对标分析）：范围说明条 + 对标组表 + 运营范式表/风险条 + 定价层级表。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  business:
    "===CHAPTER=== 严格按模板（对齐 BPC 业务模式）：导语 + 路径总览表 + 路径详情卡片（客群/单位经济/前提/可行性）+ 信息缺口条。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  returns:
    "===CHAPTER=== 严格按模板（对齐 BPC 财务与回报）：前置条件缺口条 + 参考利润结构表（非正式 IRR）。保留内联 style；禁止编造正式回报数字。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  capabilities:
    "===CHAPTER=== 严格按模板（对齐 BPC 资源网络）：通道 A/B/C 三张「维度|内容|可信度」表 + 缺乏资料清单条。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  ownership:
    "===CHAPTER=== 严格按模板：结构状态条 + 主体控制权表 + 合同权利表。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  diligence:
    "===CHAPTER=== 严格按模板：导语 + 尽调覆盖度表 + 优先补齐清单表。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  framework:
    "===CHAPTER=== 严格按模板（对齐 BPC 决策框架）：导语 + 路径比较矩阵 + 推荐逻辑卡片 + 行动清单表 + 无法出具正式建议条。保留内联 style；禁止三块散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "project-overview":
    "===CHAPTER=== 必须原样保留模板 HTML（含「项目时间轴」卡片网格）：判断标题、简介、成熟度、当前判断、下一步、核心风险、四块摘要、时间轴。时间轴只写与本项目直接相关的带日期节点；状态可用已发生/已取得/待核验/待完成/计划/项目协作方披露等。禁止增加 SVG 关系图。随后 ===GRAPH=== 输出关系图 JSON（禁止 SVG）；再 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
};

const OBJECTIVES_GATE_TITLE = "进入估值与交易讨论前的门槛";

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** 将标的概况门槛块强制对齐原型样式 */
function normalizeObjectivesGateHtml(html: string): string {
  let t = html.trim();
  if (!t) return t;

  // 已是正确样式则保留正文，仅校正外壳
  const styledGate =
    /<div[^>]*background:\s*rgba\(213,\s*154,\s*47,\s*0\.08\)[^>]*>[\s\S]*?进入估值与交易讨论前的门槛[\s\S]*?<\/div>\s*<\/div>/iu.exec(
      t,
    );

  let gateBody = "待补";
  if (styledGate?.[0]) {
    const inner = /margin-top:\s*6px[^>]*>([\s\S]*?)<\/div>/iu.exec(styledGate[0]);
    if (inner?.[1]) gateBody = stripTags(inner[1]) || "待补";
  } else {
    // h3/h2/strong + 后续段落
    const headingBlock =
      /<(?:h[1-6]|div|p|strong)[^>]*>\s*进入估值与交易讨论前的门槛\s*<\/(?:h[1-6]|div|p|strong)>\s*([\s\S]*?)(?=<div[^>]*>\s*来源|<p[^>]*>\s*来源|来源：|<table\b|$)/iu.exec(
        t,
      );
    if (headingBlock?.[1]) {
      gateBody = stripTags(headingBlock[1]) || "待补";
    } else {
      const any = /进入估值与交易讨论前的门槛[：:\s]*([\s\S]{0,800}?)(?=来源：|<table\b|$)/u.exec(
        stripTags(t),
      );
      if (any?.[1]?.trim()) gateBody = any[1].trim();
    }
  }

  const gateHtml = `<div style="margin-top:22px;padding:15px 17px;background:rgba(213,154,47,0.08);border:1px solid rgba(213,154,47,0.25)"><div style="font-size:12px;font-weight:600;color:#B07d1f">${OBJECTIVES_GATE_TITLE}</div><div style="font-size:13px;line-height:1.75;margin-top:6px">${gateBody}</div></div>`;

  // 抽表格
  const table = t.match(/<table\b[\s\S]*?<\/table>/iu)?.[0] ?? "";

  // 抽来源
  let source = "待补";
  const sourceMatch =
    /来源[：:]\s*([^<\n]+)/u.exec(t) ||
    /<div[^>]*>\s*来源[：:]\s*([\s\S]*?)<\/div>/iu.exec(t);
  if (sourceMatch?.[1]) source = stripTags(sourceMatch[1]) || "待补";
  const sourceHtml = `<div style="margin-top:22px;font-size:12px;color:#59625F">来源：${source}</div>`;

  if (table) return [table, gateHtml, sourceHtml].join("\n");
  return [gateHtml, sourceHtml].join("\n");
}

/** 按章节锁死版式，避免模型跳出版式 */
function enforceChapterHtmlFormat(sectionId: string, html: string): string {
  let t = html.trim();
  if (!t) return t;

  if (sectionId === "objectives") {
    return polishChapterTableHtml(normalizeObjectivesGateHtml(t));
  }

  if (sectionId === "snapshot" || sectionId === "risks") {
    const table = t.match(/<table\b[\s\S]*?<\/table>/iu);
    if (table?.[0]) return polishChapterTableHtml(table[0].trim());
    return polishChapterTableHtml(t);
  }

  if (sectionId === "questions") {
    // 保留 details 分组；若模型退化成多表则包装回 P1/P2/P3
    if (/<details\b/iu.test(t)) return polishChapterTableHtml(t);
    const tables = t.match(/<table\b[\s\S]*?<\/table>/giu) ?? [];
    if (tables.length >= 1) {
      const headings = ["P1 紧急", "P2 重要", "P3 跟进"];
      const parts: string[] = [];
      for (let i = 0; i < Math.min(3, tables.length); i++) {
        parts.push(
          `<details ${i === 0 ? "open " : ""}style="margin:0 0 14px;border:1px solid rgba(78,66,57,0.12);overflow:hidden"><summary style="padding:12px 16px;background:rgba(78,66,57,0.05);font-size:13px;font-weight:600;cursor:pointer">${headings[i] ?? `P${i + 1}`}</summary><div style="padding:14px 16px;border-top:1px solid rgba(78,66,57,0.08)">${tables[i]!}</div></details>`,
        );
      }
      return polishChapterTableHtml(parts.join("\n"));
    }
    return polishChapterTableHtml(t);
  }

  return polishChapterTableHtml(t);
}

const REVISE_SYSTEM = `你是投研知识网络章节改写助手。根据用户指令，在现有 HTML 片段上做最小必要修改。

输出唯一 JSON 对象（不要 markdown 围栏，不要其它说明），字段：
{"note":"改写说明","html":"完整更新后的 HTML 片段"}

要求：
1. 只改用户点名的部分；未提及处尽量保持原样。
2. 保持原版式（表格章仍是表格，三块结构仍是三块），禁止扩写成模板外结构。
3. 不要编造无依据的新事实；缺依据处用「待补」。
4. note：用中文写 3～6 句短说明，说明你听懂了什么、改了哪些、刻意没改什么；不要复述整章正文。
5. html：完整更新后的 HTML 片段本身（不要完整页面）。`;

function stripJsonFence(raw: string): string {
  let t = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/iu.exec(t);
  if (fenced?.[1]) t = fenced[1].trim();
  return t;
}

/** 解析改写模型输出：优先 JSON {note,html}；兼容旧版纯 HTML */
export function parseReviseChapterAnswer(answer: string): {
  html: string;
  note: string;
} {
  const raw = stripJsonFence(answer);
  try {
    const obj = JSON.parse(raw) as {
      note?: unknown;
      reviseNote?: unknown;
      html?: unknown;
      content?: unknown;
    };
    if (obj && typeof obj === "object") {
      const html = String(obj.html ?? obj.content ?? "").trim();
      const note = String(obj.note ?? obj.reviseNote ?? "")
        .trim()
        .slice(0, 2000);
      if (html) return { html, note };
    }
  } catch {
    /* 非 JSON，走纯 HTML */
  }
  const split = /(?:^|\n)\s*-{3,}\s*HTML\s*-{3,}\s*\n([\s\S]*)$/iu.exec(raw);
  if (split?.[1]) {
    const before = raw.slice(0, split.index).trim();
    const note = before
      .replace(/^(?:改写说明|说明)[:：]\s*/u, "")
      .trim()
      .slice(0, 2000);
    return { html: split[1].trim(), note };
  }
  return { html: raw, note: "" };
}

async function assertCanRead(
  env: Env,
  userId: string,
  projectId: string,
  createdBy: string | null | undefined,
): Promise<Response | null> {
  if (!(await canListProjectFiles(env, userId, projectId, createdBy))) {
    return json(
      { error: "无权查看项目知识网络章节", code: "VIEW_FORBIDDEN" },
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

/** GET /api/projects/:id/knowledge-chapters */
export async function handleListProjectKnowledgeChapters(
  env: Env,
  projectId: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const denied = await assertCanRead(env, userId, projectId, project.createdBy);
  if (denied) return denied;

  const chapters = await listProjectKnowledgeChapterHtml(env.DB, projectId);
  const populatedCount = await countPopulatedProjectKnowledgeChapters(
    env.DB,
    projectId,
  );

  return json({
    ok: true,
    projectId,
    totalSections: TOTAL_SECTIONS,
    populatedCount,
    chapters: chapters.map((c) => ({
      sectionId: c.sectionId,
      hasHtml: Boolean(c.html.trim()),
      source: c.source,
      llmBackend: c.llmBackend,
      updatedAt: c.updatedAt,
      updatedBy: c.updatedBy,
    })),
  });
}

/** GET /api/projects/:id/knowledge-chapters/:sectionId */
export async function handleGetProjectKnowledgeChapter(
  env: Env,
  projectId: string,
  sectionIdRaw: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const sectionId = normalizeSectionId(sectionIdRaw);
  if (!sectionId) return json({ error: "无效的章节 id" }, 400);

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const denied = await assertCanRead(env, userId, projectId, project.createdBy);
  if (denied) return denied;

  const row = await getProjectKnowledgeChapterHtml(env.DB, projectId, sectionId);
  const template = hasChapterTemplate(sectionId)
    ? await getKnChapterTemplate(env.DB, sectionId)
    : null;

  let html = row?.html ?? null;
  if (html?.trim()) {
    if (sectionId === "project-graph") {
      /* JSON 原文，不做 HTML polish */
    } else if (sectionId === "sources" || sectionId === "glossary") {
      html = ensureTableHeaderNoWrap(html);
      if (sectionId === "sources") {
        html = linkifyCitationMarkers(ensureSourceRowAnchors(html));
      }
    } else {
      html = polishChapterTableHtml(linkifyCitationMarkers(html));
    }
  }

  return json({
    ok: true,
    projectId,
    sectionId,
    title:
      template?.title ??
      (sectionId === "sources"
        ? "引用来源"
        : sectionId === "glossary"
          ? "名词解释"
          : sectionId === "project-overview"
            ? "项目概览"
            : sectionId === "project-graph"
              ? "项目关系图"
              : sectionId),
    kicker: template?.kicker ?? null,
    hasHtml: Boolean(html?.trim()),
    html,
    source: row?.source ?? null,
    llmBackend: row?.llmBackend ?? null,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  });
}

/** POST /api/projects/:id/knowledge-chapters/:sectionId/generate
 *  或草案：target=draft 时只写 draft_items，不碰正式章节 */
export async function handleGenerateProjectKnowledgeChapter(
  env: Env,
  projectId: string,
  sectionIdRaw: string,
  userIdRaw: string | null,
  generateTarget: GenerateChapterTarget = { target: "live" },
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const sectionId = normalizeSectionId(sectionIdRaw);
  if (!sectionId) return json({ error: "无效的章节 id" }, 400);

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const denied = await assertCanWrite(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  if (denied) return denied;

  const isDraft = generateTarget.target === "draft";
  let draftRunId: string | null = null;
  if (isDraft) {
    draftRunId = generateTarget.runId;
    const run = await getDraftRun(env.DB, draftRunId);
    if (!run || run.projectId !== projectId) {
      return json({ error: "草案 run 不存在" }, 404);
    }
    if (run.status === "published" || run.status === "discarded") {
      return json({ error: "该草案已结束，无法继续生成", code: "RUN_CLOSED" }, 409);
    }
    if (
      !VALID_SECTION_IDS.has(sectionId) &&
      sectionId !== "project-overview"
    ) {
      return json(
        {
          error: "草案仅支持研究章节或项目概览",
          code: "INVALID_SECTION",
        },
        400,
      );
    }
  }

  const template =
    sectionId === "sources" ||
    sectionId === "glossary" ||
    sectionId === "project-graph"
      ? null
      : await getKnChapterTemplate(env.DB, sectionId);
  if (
    sectionId !== "sources" &&
    sectionId !== "glossary" &&
    sectionId !== "project-graph" &&
    !template
  ) {
    return json(
      {
        error:
          "章节模板不存在，请先执行 migration 0017 并 seed:kn-chapter-templates",
      },
      404,
    );
  }
  if (
    sectionId === "sources" ||
    sectionId === "glossary" ||
    sectionId === "project-graph"
  ) {
    return json(
      {
        error:
          sectionId === "project-graph"
            ? "项目关系图请通过顶栏「更新概览」一并生成"
            : "引用来源与名词解释随任意章节「更新本章」增量补充，请勿单独生成",
        code: "USE_CHAPTER_GENERATE",
      },
      400,
    );
  }

  const markDraftFailed = async (error: string) => {
    if (!isDraft || !draftRunId) return;
    try {
      await upsertDraftItem(env.DB, {
        runId: draftRunId,
        sectionId,
        status: "failed",
        html: null,
        error,
        reviseNote: null,
        llmBackend: null,
      });
      await refreshDraftRunProgress(env.DB, draftRunId);
    } catch {
      /* ignore */
    }
  };

  const digest = await buildChapterGenerateMaterialsDigest(
    env,
    projectId,
    userId,
  );

  // 草案 prompt 以正式版 meta 为基线；合并结果写入草案侧
  const existingSources = await getProjectKnowledgeChapterHtml(
    env.DB,
    projectId,
    "sources",
  );
  const existingGlossary = await getProjectKnowledgeChapterHtml(
    env.DB,
    projectId,
    "glossary",
  );

  const formatHint =
    template!.formatHint?.trim() ||
    SECTION_FORMAT_HINT[sectionId] ||
    "严格按模板结构输出 HTML，禁止增加模板外章节；随后 ===GRAPH=== 写 NONE，再 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。";

  let generateSystem = GENERATE_SYSTEM;
  try {
    const sysSetting = await getPromptSetting(
      env.DB,
      KN_PROMPT_SETTING_GENERATE_SYSTEM,
    );
    if (sysSetting?.value?.trim()) {
      generateSystem = sysSetting.value;
    }
  } catch {
    /* 未迁移 / 缺表时回退代码默认 */
  }

  const isOverview = sectionId === "project-overview";
  const userPrompt = [
    `章节：${template!.title}`,
    template!.kicker ? `副标：${template!.kicker}` : "",
    "",
    `版式锁定：${formatHint}`,
    "",
    isOverview
      ? "任务：基于附件生成项目概览 HTML（含时间轴），并输出关系图 JSON；增量补充引用来源与非常用名词。"
      : "任务：基于下方「项目上传附件」按模板生成本章内容；===GRAPH=== 写 NONE；并仅增量补充引用来源与非常用名词。",
    "",
    "【章节 Markdown 模板】",
    template!.markdown,
    "",
    listExistingMetaDigest({
      sourcesHtml: existingSources?.html,
      glossaryHtml: existingGlossary?.html,
    }),
    ...(isOverview
      ? ["", "【关系图 JSON 说明（放在 ===GRAPH===）】", PROJECT_GRAPH_JSON_HINT]
      : []),
    "",
    "【引用来源新增行骨架（仅新 ID，放在 ===SOURCES_ADD===）】",
    SOURCES_TABLE_SKELETON,
    "",
    "【名词解释新增行骨架（仅非常用词，放在 ===GLOSSARY_ADD===）】",
    GLOSSARY_TABLE_SKELETON,
    "",
    digest.trim() ||
      "【项目上传附件】\n（暂无可用资料；请在对应位置标注「待补」。）",
  ]
    .filter(Boolean)
    .join("\n");

  let answer: string;
  let llmBackend: string;
  try {
    const result = await callLlm(env, [
      { role: "system", content: generateSystem },
      { role: "user", content: userPrompt },
    ]);
    answer = result.answer;
    llmBackend = result.llmBackend;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markDraftFailed(`生成失败：${msg}`);
    return json({ error: `生成失败：${msg}` }, 502);
  }

  const parsed = parseChapterGenerateAnswer(answer);
  let html = normalizeChapterHtmlFragment(parsed.chapterHtml);
  html = linkifyCitationMarkers(html);
  html = enforceChapterHtmlFormat(sectionId, html);

  if (!html) {
    await markDraftFailed("模型未返回有效 HTML 片段");
    return json({ error: "模型未返回有效 HTML 片段" }, 502);
  }

  if (isDraft && draftRunId) {
    let sourcesHtml: string | null = null;
    let glossaryHtml: string | null = null;
    let graphJson: unknown = null;
    try {
      await upsertDraftItem(env.DB, {
        runId: draftRunId,
        sectionId,
        status: "ok",
        html,
        error: null,
        reviseNote: null,
        llmBackend,
      });

      if (isOverview) {
        const graph = parseProjectGraphFromAnswerSegment(parsed.graphSegment);
        if (graph) {
          graphJson = graph;
          await upsertDraftItem(env.DB, {
            runId: draftRunId,
            sectionId: "project-graph",
            status: "ok",
            html: JSON.stringify(graph),
            error: null,
            llmBackend,
          });
        }
      }

      await withKnDraftMetaLock(env.DB, draftRunId, async () => {
        const draftSources = await getDraftItem(env.DB, draftRunId!, "sources");
        const draftGlossary = await getDraftItem(
          env.DB,
          draftRunId!,
          "glossary",
        );
        const baseSourcesHtml =
          draftSources?.html?.trim() || existingSources?.html || "";
        const baseGlossaryHtml =
          draftGlossary?.html?.trim() || existingGlossary?.html || "";

        const mergedSources = mergeSourcesAppend({
          existingHtml: baseSourcesHtml,
          addHtml: parsed.sourcesAddHtml,
          sectionLabel: template!.title,
        });
        const mergedGlossary = mergeGlossaryAppend({
          existingHtml: baseGlossaryHtml,
          addHtml: parsed.glossaryAddHtml,
        });

        const sourcesChanged =
          mergedSources.trim() !== baseSourcesHtml.trim() &&
          /<td\b/iu.test(mergedSources);
        const glossaryChanged =
          mergedGlossary.trim() !== baseGlossaryHtml.trim() &&
          /<td\b/iu.test(mergedGlossary);

        if (sourcesChanged || parsed.sourcesAddHtml.trim()) {
          sourcesHtml = linkifyCitationMarkers(
            ensureSourceRowAnchors(mergedSources),
          );
          await upsertDraftItem(env.DB, {
            runId: draftRunId!,
            sectionId: "sources",
            status: "ok",
            html: sourcesHtml,
            error: null,
            llmBackend,
          });
        } else if (baseSourcesHtml.trim()) {
          sourcesHtml = baseSourcesHtml;
          if (!draftSources?.html?.trim()) {
            await upsertDraftItem(env.DB, {
              runId: draftRunId!,
              sectionId: "sources",
              status: "ok",
              html: sourcesHtml,
              error: null,
              llmBackend,
            });
          }
        }

        if (glossaryChanged || parsed.glossaryAddHtml.trim()) {
          glossaryHtml = mergedGlossary;
          await upsertDraftItem(env.DB, {
            runId: draftRunId!,
            sectionId: "glossary",
            status: "ok",
            html: glossaryHtml,
            error: null,
            llmBackend,
          });
        } else if (baseGlossaryHtml.trim()) {
          glossaryHtml = baseGlossaryHtml;
          if (!draftGlossary?.html?.trim()) {
            await upsertDraftItem(env.DB, {
              runId: draftRunId!,
              sectionId: "glossary",
              status: "ok",
              html: glossaryHtml,
              error: null,
              llmBackend,
            });
          }
        }
      });

      const run = await refreshDraftRunProgress(env.DB, draftRunId);
      return json({
        ok: true,
        target: "draft",
        projectId,
        runId: draftRunId,
        sectionId,
        title: template!.title,
        html,
        graphJson,
        sourcesHtml,
        glossaryHtml,
        llmBackend,
        run,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markDraftFailed(`草案写入失败：${msg}`);
      return json({ error: `草案写入失败：${msg}` }, 502);
    }
  }

  const saved = await upsertProjectKnowledgeChapterHtml(env.DB, {
    projectId,
    sectionId,
    html,
    source: "generate",
    llmBackend,
    updatedBy: userId,
  });

  let savedGraph: Awaited<
    ReturnType<typeof upsertProjectKnowledgeChapterHtml>
  > | null = null;
  let graphJson: unknown = null;
  if (isOverview) {
    const graph = parseProjectGraphFromAnswerSegment(parsed.graphSegment);
    if (graph) {
      graphJson = graph;
      savedGraph = await upsertProjectKnowledgeChapterHtml(env.DB, {
        projectId,
        sectionId: "project-graph",
        html: JSON.stringify(graph),
        source: "generate",
        llmBackend,
        updatedBy: userId,
      });
    }
  }

  let savedSources: Awaited<
    ReturnType<typeof upsertProjectKnowledgeChapterHtml>
  > | null = null;
  let savedGlossary: Awaited<
    ReturnType<typeof upsertProjectKnowledgeChapterHtml>
  > | null = null;

  try {
    await withKnMetaLock(env.DB, projectId, async () => {
      const latestSources = await getProjectKnowledgeChapterHtml(
        env.DB,
        projectId,
        "sources",
      );
      const latestGlossary = await getProjectKnowledgeChapterHtml(
        env.DB,
        projectId,
        "glossary",
      );

      const mergedSources = mergeSourcesAppend({
        existingHtml: latestSources?.html,
        addHtml: parsed.sourcesAddHtml,
        sectionLabel: template!.title,
      });
      const mergedGlossary = mergeGlossaryAppend({
        existingHtml: latestGlossary?.html,
        addHtml: parsed.glossaryAddHtml,
      });

      const sourcesChanged =
        mergedSources.trim() !== (latestSources?.html ?? "").trim() &&
        /<td\b/iu.test(mergedSources);
      const glossaryChanged =
        mergedGlossary.trim() !== (latestGlossary?.html ?? "").trim() &&
        /<td\b/iu.test(mergedGlossary);

      if (sourcesChanged || parsed.sourcesAddHtml.trim()) {
        savedSources = await upsertProjectKnowledgeChapterHtml(env.DB, {
          projectId,
          sectionId: "sources",
          html: linkifyCitationMarkers(ensureSourceRowAnchors(mergedSources)),
          source: "generate",
          llmBackend,
          updatedBy: userId,
        });
      } else if (latestSources?.html.trim()) {
        savedSources = latestSources;
      }

      if (glossaryChanged || parsed.glossaryAddHtml.trim()) {
        savedGlossary = await upsertProjectKnowledgeChapterHtml(env.DB, {
          projectId,
          sectionId: "glossary",
          html: mergedGlossary,
          source: "generate",
          llmBackend,
          updatedBy: userId,
        });
      } else if (latestGlossary?.html.trim()) {
        savedGlossary = latestGlossary;
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `引用来源/名词解释合并失败：${msg}` }, 502);
  }

  return json({
    ok: true,
    target: "live",
    projectId,
    sectionId,
    title: template!.title,
    html: saved.html,
    graphJson:
      graphJson ??
      (savedGraph?.html
        ? (() => {
            try {
              return JSON.parse(savedGraph.html) as unknown;
            } catch {
              return null;
            }
          })()
        : null),
    sourcesHtml: savedSources?.html ?? null,
    glossaryHtml: savedGlossary?.html ?? null,
    source: saved.source,
    llmBackend: saved.llmBackend,
    updatedAt: saved.updatedAt,
    updatedBy: saved.updatedBy,
  });
}

/** 按指令改写 HTML（不落库）；供 live / draft 共用 */
export async function reviseChapterHtmlContent(
  env: Env,
  input: {
    title: string;
    kicker?: string | null;
    html: string;
    instruction: string;
  },
): Promise<{ html: string; note: string; llmBackend: string }> {
  const userPrompt = [
    `章节：${input.title}`,
    input.kicker ? `副标：${input.kicker}` : "",
    "",
    "【用户改写指令】",
    input.instruction,
    "",
    "【当前 HTML】",
    input.html,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await callLlm(env, [
    { role: "system", content: REVISE_SYSTEM },
    { role: "user", content: userPrompt },
  ]);
  const parsed = parseReviseChapterAnswer(result.answer);
  let html = normalizeChapterHtmlFragment(parsed.html);
  html = linkifyCitationMarkers(html);
  html = polishChapterTableHtml(html);
  if (!html) {
    throw new Error("模型未返回有效 HTML 片段");
  }
  const note =
    parsed.note.trim() ||
    `已按指令改写「${input.title}」：已处理你指出的问题；未点名部分尽量保持原样。`;
  return { html, note, llmBackend: result.llmBackend };
}

/** POST /api/projects/:id/knowledge-chapters/:sectionId/revise */
export async function handleReviseProjectKnowledgeChapter(
  request: Request,
  env: Env,
  projectId: string,
  sectionIdRaw: string,
  userIdRaw: string | null,
): Promise<Response> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return json({ error: "缺少 userId" }, 400);

  const sectionId = normalizeSectionId(sectionIdRaw);
  if (!sectionId) return json({ error: "无效的章节 id" }, 400);
  if (
    sectionId === "sources" ||
    sectionId === "glossary" ||
    sectionId === "project-graph"
  ) {
    return json(
      {
        error: "引用来源、名词解释与关系图请通过章节/概览更新维护",
        code: "USE_CHAPTER_GENERATE",
      },
      400,
    );
  }

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const denied = await assertCanWrite(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  if (denied) return denied;

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

  const existing = await getProjectKnowledgeChapterHtml(
    env.DB,
    projectId,
    sectionId,
  );
  if (!existing?.html.trim()) {
    return json(
      { error: "本章尚无内容，请先点击「更新本章」生成", code: "NO_HTML" },
      400,
    );
  }

  const template = await getKnChapterTemplate(env.DB, sectionId);
  const title = template?.title ?? sectionId;

  const logId = await insertReviseInstructionLog(env.DB, {
    projectId,
    runId: null,
    sectionId,
    userId,
    instruction,
  });

  let html: string;
  let llmBackend: string;
  let reviseNote: string;
  try {
    const revised = await reviseChapterHtmlContent(env, {
      title,
      kicker: template?.kicker,
      html: existing.html,
      instruction,
    });
    html = revised.html;
    llmBackend = revised.llmBackend;
    reviseNote = revised.note;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await completeReviseInstructionLog(env.DB, logId, {
      status: "failed",
      error: msg,
    });
    const status = msg.includes("模型未返回") ? 502 : 502;
    return json({ error: `改写失败：${msg}` }, status);
  }

  const saved = await upsertProjectKnowledgeChapterHtml(env.DB, {
    projectId,
    sectionId,
    html,
    source: "revise",
    llmBackend,
    updatedBy: userId,
  });

  await completeReviseInstructionLog(env.DB, logId, {
    status: "ok",
    reviseNote,
    llmBackend,
  });

  return json({
    ok: true,
    projectId,
    sectionId,
    title,
    html: saved.html,
    reviseNote,
    source: saved.source,
    llmBackend: saved.llmBackend,
    updatedAt: saved.updatedAt,
    updatedBy: saved.updatedBy,
  });
}
