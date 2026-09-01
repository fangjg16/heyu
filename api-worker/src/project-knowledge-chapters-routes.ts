import type { AppDatabase } from "./app-database";
import {
  getKnChapterTemplate,
  getPromptSetting,
  KN_PROMPT_SETTING_GENERATE_SYSTEM,
} from "./kn-chapter-templates-db";
import {
  buildChapterSkillMethodBlock,
  GENERATE_SYSTEM_SKILL_LOCK,
} from "./chapter-skill-method";
import { parseReviseChapterAnswer, repairStoredChapterHtml } from "./chapter-revise-parse";
import { callLlm, type LlmClientEnv } from "./llm-client";
import { ensureAnalysisKind, getStoredAnalysisKind } from "./analysis-kind";
import { DEFAULT_ANALYSIS_KIND } from "./analysis-kind";
import {
  mapHasHtmlFromLegacy,
  resolveMappedChapterHtml,
} from "./kn-legacy-map";
import {
  DEFAULT_CHAPTER_FORMAT_HINT,
  fallbackChapterMarkdown,
  isGeneratableSectionId,
  isKnownSectionId,
  researchSectionIdsForKind,
  sectionLabel,
} from "./kn-catalog";
import { filterTemplateByKind } from "./kn-template-kind";
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
  ensureChapterBundle,
  getDraftItem,
  getDraftRun,
  listDraftItems,
  refreshDraftRunProgress,
  upsertDraftItem,
} from "./project-knowledge-chapter-revisions-db";
import { buildChapterGenerateMaterials } from "./project-knowledge-chapters-digest";
import { buildKnowledgeNetworkSourceBlock, mergeChaptersPreferringDraft } from "./overview-from-knowledge-network";
import {
  formatNamedSubjectsBlock,
  missingNamedSubjects,
} from "./chapter-named-subjects";
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
  extractSourceIds,
} from "./project-knowledge-citations";
import {
  parseProjectGraphFromLlmAnswer,
  PROJECT_GRAPH_JSON_HINT,
} from "./project-overview-graph";
import { getProjectById } from "./projects-db";
import {
  canListProjectFiles,
  canPublishProjectKnowledgeNetwork,
  canUpdateProjectKnowledgeNetwork,
} from "./workspace-roles";
import { syncProjectSourcesFromPublishedChapters } from "./project-knowledge-sources-sync";

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
  ...researchSectionIdsForKind("mature"),
  ...researchSectionIdsForKind("acquire"),
  ...researchSectionIdsForKind("early"),
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

/** 元页面：可读写落库，但不计入「已有内容」；其中 project-overview 有模板可生成 */
const META_SECTION_IDS = new Set([
  "sources",
  "glossary",
  "project-overview",
  "project-graph",
]);

/** 有 Markdown 模板、可走 generate 的元页面 */
const GENERATABLE_META_SECTION_IDS = new Set(["project-overview"]);

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
  if (isKnownSectionId(id) || VALID_SECTION_IDS.has(id)) return id;
  return null;
}

function hasChapterTemplate(id: string): boolean {
  return isGeneratableSectionId(id);
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
1. 模板有什么块、表头与内联 style，输出就保留什么；允许按资料增删数据行，禁止改表头、禁止增加模板没有的大块（尤其禁止「填写指引」、长篇前言、页外说明）。
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
7. 若模板已含 class 或内联 style：必须保留这些 class 与 style，只替换「待补」内容。禁止拆掉 kn-callout、kn-gate、kn-stats 等 class。
8. 事实必须来自【资料目录】【本章深读】【相关段落补充】。目录里有、深读/补充未覆盖的细节写「待补」，禁止编造，禁止把未深读文件当成已读全文。
9. 标记外禁止任何说明文字。章节内图表用 HTML <table>（含热力图格子），禁止 SVG。关系图禁止输出 SVG/HTML，只输出 JSON。
10. 附件文件名或摘录里反复出现的对标主体、产品名、公司名必须写入对应章节（尤其对标分析），禁止只列通用海外模型而漏国内点名对象。
${GENERATE_SYSTEM_SKILL_LOCK}`;

const SECTION_FORMAT_HINT: Record<string, string> = {
  "project-summary":
    "===CHAPTER=== 判断条 + 类型/辖区/阶段数字条 + 范围表 + 交易要点表。保留 class。证据列只写 [A-1]。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "industry-competition":
    "===CHAPTER=== 判断条 + 总市场/可服务市场/可获得份额数字条（不要写 TAM/SAM/SOM 当主标题）+ 可比表 + 红黄旗。不要对战卡。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "business-technology":
    "===CHAPTER=== 判断条 + 客户路径 + BMC 宫格 + 单位经济表。禁止 IRR/三情景。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "company-team":
    "===CHAPTER=== 判断条 + 控制链卡片 + 主体表 + 关键个人表 + 红黄旗。禁止 SVG。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "financial-diligence":
    "===CHAPTER=== 判断条 + 收入/毛利率/现金数字条 + 账实质量表。禁止三情景、禁止 IRR。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "investment-structure-returns":
    "===CHAPTER=== 判断条 + 估值大数字 + Down/Base/Up 三情景 + 结构敏感性表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "investment-risks":
    "===CHAPTER=== 判断条 + 4×4 热力图（保留 kn-heat-* 底色）+ 带徽章的风险登记表。禁止 SVG。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "diligence-gaps":
    "===CHAPTER=== 判断条 + P1/P2/P3 kn-fold 折叠。允许增删 li。禁止改成三列表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "investment-conclusion":
    "===CHAPTER=== 建议判断条 + 推进/暂缓左右对照 + 路线图。不要闸门灯。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "exec-verdict":
    "===CHAPTER=== 闸门灯三态只亮一态（买/有条件/不买）+ 理由 + 建议判断条。不要概况数字条。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "founder-interview":
    "===CHAPTER=== 有访谈：访谈摘要 + 引用条 + 已覆盖/待澄清议题。无访谈：只留「尚未开展」。禁止尽调三列表。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "exec-summary":
    "===CHAPTER=== 有材料：判断条 + 要点表 + 红黄旗。无材料：只留尚未开展。禁止散文。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "project-scorecard":
    "===CHAPTER=== 有材料：建议判断条 + 维度评分表。无材料：只留尚未开展。禁止 IRR。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "research-gate":
    "===CHAPTER=== 有材料：闸门灯三态只亮一态（继续/调整/停止）+ 判断条 + 结论可靠度表。无材料：只留尚未开展。不要投资买/不买文案。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "target-audience":
    "===CHAPTER=== 有材料：判断条 + 客群表。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "market-analysis":
    "===CHAPTER=== 有材料：判断条 + 总市场/可服务市场/可获得份额数字条（不要写 TAM/SAM/SOM 当主标题）+ 切法表。无材料：只留尚未开展。不要对战卡。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "competitor-landscape":
    "===CHAPTER=== 有材料：判断条 + 对战卡 + 功能对比表。无材料：只留尚未开展。不要总市场投资版数字条。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "industry-trends":
    "===CHAPTER=== 有材料：判断条 + 趋势表 + 红黄旗。无材料：只留尚未开展。不要对战卡。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "lean-business-model":
    "===CHAPTER=== 有材料：判断条 + Lean 宫格 + 单位经济表。无材料：只留尚未开展。禁止 IRR。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "value-proposition":
    "===CHAPTER=== 有材料：判断条 + 痛点/收益对照表。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  positioning:
    "===CHAPTER=== 有材料：判断条 + 替代方案/我们独有 左右对照 + 定位表。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "go-to-market":
    "===CHAPTER=== 有材料：判断条 + 路径 + 渠道表。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  brand:
    "===CHAPTER=== 有材料：判断条 + 调性板（语气/关键词/禁区）。无材料：只留尚未开展。禁止 Canvas。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "mvp-definition":
    "===CHAPTER=== 有材料：判断条 + 必须有/后做/不做范围表。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "user-journey":
    "===CHAPTER=== 有材料：判断条 + 路径 + 阶段表。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "feature-prioritization":
    "===CHAPTER=== 有材料：判断条 + 优先级表。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  projections:
    "===CHAPTER=== 有材料：判断条 + 三年收入/成本/现金流表 + 敏感假设表。禁止三情景和 IRR。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "revenue-model":
    "===CHAPTER=== 有材料：判断条 + 收入线表。禁止 IRR。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "cost-structure":
    "===CHAPTER=== 有材料：判断条 + 跑道/消耗/收入数字条 + 成本表。禁止三情景和 IRR。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "risk-analysis":
    "===CHAPTER=== 有材料：判断条 + 4×4 热力图（保留 kn-heat-* 底色）+ 带徽章的风险登记表。禁止 SVG。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "assumptions-tracker":
    "===CHAPTER=== 有材料：判断条 + 假设表 + P1/P2/P3 kn-fold 折叠。允许增删 li。禁止改成只剩三列表。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "validation-playbook":
    "===CHAPTER=== 有实验：判断条 + 通过/未通过/进行中计数 + 实验表 + 失效条件。禁止 IRR。无实验：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "action-plan-30d":
    "===CHAPTER=== 有材料：判断条 + 路径 + 30 天动作表。无材料：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  validation:
    "===CHAPTER=== 有实验：判断条 + 通过/未通过/进行中计数 + 实验表。禁止 IRR。无实验：只留尚未开展。保留 class。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  snapshot:
    "===CHAPTER=== 按模板：一句话范围 + 类型/辖区/阶段三色事实卡 + 项目范围表 + 交易要点表。不要输出 Factor A/B 十一段表或综合成熟度三卡；成熟度只在项目概览右上角。保留表头、卡片与内联 style；证据/来源列只写 [A-1]。禁止散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  objectives:
    "===CHAPTER=== 按模板：结论/已核实事实/假设与估计/证据缺口四段封面（底稿头）+ 声明审计表 + 矛盾登记表 + 假设敏感性表 + 待核项表。不要已核实/存疑/矛盾三个计数大卡，不要公开检索总表。保留卡片与表头；允许增删数据行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  risks:
    "===CHAPTER=== 按模板：总体风险画像 callout + 带底色的 4×4 热力图 + 带级别徽章的风险登记表 + 高风险明细 + 缓释行动表。热力图格必须保留背景色，禁止 SVG。允许增删数据行，禁止改表头。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  questions:
    "===CHAPTER=== 按模板：P1/P2/P3 三组 <details> 折叠卡片。P1 默认 open。每组 summary 含标题与「N 项」；组内用 <ol><li>，每条含问题、说明、下一步。紧急度：P1=阻断 Blocking，P2=精度 Precision，P3=增强 Enhancement。允许增删 <li>；禁止改成大表或散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  industry:
    "===CHAPTER=== 按模板：行业要点 callout + TAM/SAM/SOM 三色卡 + 政策卡 + 与标的咬合 + 红黄旗 + 信息质量表。禁止对战卡、出价区间和公开检索总表。保留卡片与表头；允许增删行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  legal:
    "===CHAPTER=== 按模板：合规要点 callout + 声明审计表 + 矛盾登记表 + 假设敏感性 + 待核项（聚焦合规/审批/权属声明）。允许增删行；禁止路径卡片散文。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  benchmarks:
    "===CHAPTER=== 只填模板里出现的块（服务端已按项目形态去掉另一套）。早期：功能矩阵 + 定价 + 3–5 张对战卡，无成交则不要出价大数字。成熟/收购：出价区间 + 可比交易（含经营差异列）+ 溢价/折价。禁止两套并排。附件点名的对标主体必须进入矩阵或对战卡；禁止只用通用品类/海外工具示例顶替。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  business:
    "===CHAPTER=== 只填模板里出现的那一张画布。早期：Lean Canvas 宫格；有交付才填短 Journey。成熟/收购：Journey + BMC。再填客户表、单位经济、待验证假设。禁止 IRR/MOIC。保留内联 grid style。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  returns:
    "===CHAPTER=== 按模板：文首标明假设模型或已校准 + 回报摘要 + 估值大数字 + 三情景卡 + 看板/现金流/敏感性。收购形态另有买价/融资/下行存活块（若模板中出现）。情景卡必须保留，禁止 SVG。缺数字写待补。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  capabilities:
    "===CHAPTER=== 按模板：关系摘要 + 对手方/顾问/关键个人三卡 + 关系表。收购形态另有接手节奏表（若模板中出现）。不要公开检索总表。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  ownership:
    "===CHAPTER=== 按模板：调查结论 + HTML 控制结构卡片链（非 SVG）+ 调查对象表 + 股权链表 + 主体档案 + 个人档案 + 诉讼登记 + 关联交易 + 红旗表。允许增删行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  diligence:
    "===CHAPTER=== 按模板：工作流进度表 + 检查项跟踪表（事项｜工作流｜优先级｜状态｜负责人｜截止日期｜备注）+ 红旗表。状态用 Not Started / Requested / Received / In Review / Complete / Red Flag。允许增删行。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  framework:
    "===CHAPTER=== 按模板：决策建议 callout + 双列条件卡（投资：推进/暂缓；收购：买/不买；早期：出资/不追投）+ 论点 + 法律路径 + 杠杆 + 路线图 + 下一步。不要 Top5 风险表和三情景 IRR 摘要。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
  "project-overview":
    "===CHAPTER=== 保留模板既有概览：标题、简介、右上角综合成熟度（只填这一个数或状态词，不要 Factor A/B 分卡和十一段表）、当前判断/下一步/核心风险三卡、BP披露/待验证假设/红线风险/优先资料四卡、项目时间轴、#project-graph-slot 占位（不要在槽内画 SVG）。时间轴只写与本项目直接相关的带日期节点。禁止 SVG。随后 ===GRAPH=== 输出关系图 JSON；再 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。",
};

/** 保留模板多表结构；只做表头/单元格抛光，不再抽成单表或旧版式 */
function enforceChapterHtmlFormat(html: string): string {
  return polishChapterTableHtml(html.trim());
}

const REVISE_SYSTEM = `你是投研知识网络章节改写助手。根据用户指令，在现有 HTML 片段上做最小必要修改。

输出格式严格为标记分段（不要 JSON，不要 markdown 围栏，不要其它说明）：
===NOTE===
（3～6 句中文：听懂了什么、改了哪些、刻意没改什么；不要复述整章）
===CHAPTER===
（完整更新后的 HTML 片段本身，不要完整页面）

要求：
1. 只改用户点名的部分；未提及处尽量保持原样。
2. 保持原版式（表格章仍是表格，三块结构仍是三块），禁止扩写成模板外结构。
3. 不要编造无依据的新事实；缺依据处用「待补」。若用户指出源文件中的对标/主体，必须写入对应表格或对战卡。
4. ===CHAPTER=== 内只放 HTML，禁止把说明或 JSON 包进 HTML。`;

export { parseReviseChapterAnswer, repairStoredChapterHtml } from "./chapter-revise-parse";

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

async function assertCanPublishLive(
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
      { error: "仅项目管理员可直接写入正式版知识网络", code: "PUBLISH_FORBIDDEN" },
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
  const htmlById = new Map(chapters.map((c) => [c.sectionId, c.html]));
  const populatedCount = await countPopulatedProjectKnowledgeChapters(
    env.DB,
    projectId,
  );
  const bundle = await ensureChapterBundle(env.DB, projectId, userId);
  const analysisKind =
    (await getStoredAnalysisKind(env.DB, projectId)) ?? DEFAULT_ANALYSIS_KIND;
  const researchIds = researchSectionIdsForKind(analysisKind);

  const listed = chapters.map((c) => ({
    sectionId: c.sectionId,
    hasHtml: Boolean(c.html.trim()),
    source: c.source,
    llmBackend: c.llmBackend,
    updatedAt: c.updatedAt,
    updatedBy: c.updatedBy,
  }));
  if (analysisKind === "mature") {
    for (const id of researchIds) {
      if (listed.some((c) => c.sectionId === id && c.hasHtml)) continue;
      if (!mapHasHtmlFromLegacy(id, htmlById)) continue;
      listed.push({
        sectionId: id,
        hasHtml: true,
        source: "generate",
        llmBackend: null,
        updatedAt: "",
        updatedBy: null,
      });
    }
  }

  return json({
    ok: true,
    projectId,
    analysisKind,
    totalSections: researchIds.length,
    populatedCount,
    currentVersion: bundle.version,
    overviewVersion: bundle.overviewVersion,
    overviewKnVersion: bundle.overviewKnVersion,
    catalog: researchIds.map((id) => ({
      id,
      label: sectionLabel(id, analysisKind),
    })),
    chapters: listed,
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
  if (!html?.trim()) {
    const all = await listProjectKnowledgeChapterHtml(env.DB, projectId);
    const mapped = resolveMappedChapterHtml(
      sectionId,
      new Map(all.map((c) => [c.sectionId, c.html])),
    );
    if (mapped.trim()) html = mapped;
  }
  if (html?.trim()) {
    if (sectionId === "project-graph") {
      /* JSON 原文，不做 HTML polish */
    } else if (sectionId === "sources" || sectionId === "glossary") {
      html = ensureTableHeaderNoWrap(html);
      if (sectionId === "sources") {
        try {
          html = await syncProjectSourcesFromPublishedChapters(
            env.DB,
            projectId,
            userId,
            html,
          );
        } catch {
          /* 回填失败仍返回已存表 */
        }
        html = linkifyCitationMarkers(ensureSourceRowAnchors(html));
      }
    } else {
      html = polishChapterTableHtml(
        linkifyCitationMarkers(repairStoredChapterHtml(html)),
      );
    }
  } else if (sectionId === "sources") {
    try {
      html = await syncProjectSourcesFromPublishedChapters(
        env.DB,
        projectId,
        userId,
        html,
      );
      if (html?.trim()) {
        html = linkifyCitationMarkers(ensureSourceRowAnchors(html));
      }
    } catch {
      /* 无表且回填失败则保持空 */
    }
  }

  return json({
    ok: true,
    projectId,
    sectionId,
    title: template?.title ?? sectionLabel(sectionId),
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

  const isDraft = generateTarget.target === "draft";
  const denied = isDraft
    ? await assertCanWrite(env, userId, projectId, project.createdBy)
    : await assertCanPublishLive(env, userId, projectId, project.createdBy);
  if (denied) return denied;

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
    if (!isGeneratableSectionId(sectionId)) {
      return json(
        {
          error: "草案仅支持研究章节或项目概览",
          code: "INVALID_SECTION",
        },
        400,
      );
    }
  }

  let template =
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
    const title = sectionLabel(sectionId);
    template = {
      id: sectionId,
      groupId: "fallback",
      groupLabel: "目录",
      title,
      kicker: null,
      canonicalHint: sectionId,
      markdown: fallbackChapterMarkdown(sectionId, title),
      formatHint: DEFAULT_CHAPTER_FORMAT_HINT,
      sortOrder: 0,
      updatedAt: new Date().toISOString(),
      updatedBy: null,
    };
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

  const materialsBundle = await buildChapterGenerateMaterials(
    env,
    projectId,
    userId,
    { sectionId },
  );
  const digest = materialsBundle.digest;
  const namedSubjectsBlock = formatNamedSubjectsBlock(
    materialsBundle.namedSubjects,
  );
  const analysisKind = await ensureAnalysisKind(env, projectId, digest);

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
    DEFAULT_CHAPTER_FORMAT_HINT ||
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
  let overviewKnBlock = "";
  let overviewFromKnowledge = false;
  if (isOverview) {
    // 概览生成只读当前形态目录 id 上自己的 HTML，不把旧 13 格对照进来。
    const [bundle, liveChapters] = await Promise.all([
      ensureChapterBundle(env.DB, projectId, userId),
      listProjectKnowledgeChapterHtml(env.DB, projectId),
    ]);
    let chaptersForOverview = liveChapters;
    let fromDraft = false;
    if (isDraft && draftRunId) {
      const draftItems = await listDraftItems(env.DB, draftRunId).catch(
        () => [],
      );
      chaptersForOverview = mergeChaptersPreferringDraft(
        liveChapters,
        draftItems,
      );
      fromDraft = draftItems.some(
        (i) =>
          i.status === "ok" &&
          i.sectionId !== "project-overview" &&
          Boolean(i.html?.trim()),
      );
    }
    const kn = buildKnowledgeNetworkSourceBlock({
      version: bundle.version,
      chapters: chaptersForOverview,
      analysisKind,
      fromDraft,
    });
    overviewKnBlock = kn.block;
    overviewFromKnowledge = kn.hasResearch;
  }
  const skillMethod = await buildChapterSkillMethodBlock(
    sectionId,
    env.DB,
    analysisKind,
  );
  if (
    skillMethod &&
    !generateSystem.includes("若用户消息含「分析方法」")
  ) {
    generateSystem = `${generateSystem.trim()}\n${GENERATE_SYSTEM_SKILL_LOCK}`;
  }
  const skeleton = filterTemplateByKind(template!.markdown, analysisKind);
  const userPrompt = [
    `章节：${template!.title}`,
    template!.kicker ? `副标：${template!.kicker}` : "",
    `项目形态（创建/编辑时选定，生成时不得改判）：${analysisKind}`,
    "",
    `版式锁定：${formatHint}`,
    "",
    isOverview
      ? overviewFromKnowledge
        ? "任务：根据下方知识网络研究章节填写项目概览 HTML（含时间轴）并输出关系图 JSON；保持现有概览版式，不要把各章揉成一篇。附件仅供核对引用。增量补充引用来源与非常用名词。"
        : "任务：知识网络尚无研究章节。可暂按附件生成项目概览 HTML（含时间轴）并输出关系图 JSON；缺处标「待补」。增量补充引用来源与非常用名词。"
      : "任务：基于下方「项目上传附件」按模板生成本章内容；===GRAPH=== 写 NONE；并仅增量补充引用来源与非常用名词。",
    "",
    "【章节 Markdown 模板】",
    skeleton,
    "",
    skillMethod,
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
    overviewKnBlock,
    digest.trim() ||
      "【项目上传附件】\n（暂无可用资料；请在对应位置标注「待补」。）",
    namedSubjectsBlock,
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
  html = enforceChapterHtmlFormat(html);

  if (!html) {
    await markDraftFailed("模型未返回有效 HTML 片段");
    return json({ error: "模型未返回有效 HTML 片段" }, 502);
  }

  const missingSubjects = missingNamedSubjects(
    html,
    materialsBundle.namedSubjects,
  );
  if (missingSubjects.length > 0) {
    try {
      const retry = await callLlm(env, [
        { role: "system", content: generateSystem },
        {
          role: "user",
          content: [
            userPrompt,
            "",
            "【漏列补写】上一稿漏了这些附件点名的主体，必须写入表格或对战卡，不要改成 JSON：",
            ...missingSubjects.map((n) => `- ${n}`),
            "",
            "【当前 HTML】",
            html,
          ].join("\n"),
        },
      ]);
      const retryParsed = parseChapterGenerateAnswer(retry.answer);
      let retryHtml = normalizeChapterHtmlFragment(retryParsed.chapterHtml);
      retryHtml = linkifyCitationMarkers(retryHtml);
      retryHtml = enforceChapterHtmlFormat(retryHtml);
      if (retryHtml) {
        const stillMissing = missingNamedSubjects(
          retryHtml,
          materialsBundle.namedSubjects,
        );
        if (stillMissing.length <= missingSubjects.length) {
          html = retryHtml;
          llmBackend = retry.llmBackend;
        }
      }
    } catch {
      /* 保留首稿 */
    }
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
        const graph = parseProjectGraphFromLlmAnswer(
          answer,
          parsed.graphSegment,
        );
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

        if (sourcesChanged || extractSourceIds(mergedSources).length > 0) {
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
    const graph = parseProjectGraphFromLlmAnswer(answer, parsed.graphSegment);
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

      if (sourcesChanged || extractSourceIds(mergedSources).length > 0) {
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

  try {
    const synced = await syncProjectSourcesFromPublishedChapters(
      env.DB,
      projectId,
      userId,
      savedSources?.html,
    );
    if (synced?.trim()) {
      savedSources = {
        ...(savedSources ?? {
          projectId,
          sectionId: "sources",
          html: synced,
          source: "generate",
          llmBackend: null,
          updatedAt: new Date().toISOString(),
          updatedBy: userId,
        }),
        html: synced,
      };
    }
  } catch {
    /* 章节已保存；引用来源回填失败不阻断 */
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
    projectId?: string;
    userId?: string;
    sectionId?: string;
  },
): Promise<{ html: string; note: string; llmBackend: string }> {
  let materials = "";
  let namedSubjects: string[] = [];
  if (input.projectId && input.userId) {
    try {
      const bundle = await buildChapterGenerateMaterials(
        env,
        input.projectId,
        input.userId,
        { sectionId: input.sectionId, extraQuery: input.instruction },
      );
      materials = bundle.digest;
      namedSubjects = bundle.namedSubjects;
    } catch {
      materials = "";
    }
  }

  const userPrompt = [
    `章节：${input.title}`,
    input.kicker ? `副标：${input.kicker}` : "",
    "",
    "【用户改写指令】",
    input.instruction,
    "",
    materials
      ? "源文件里点名的对标/主体，必须写进本章对应表格或对战卡，不得只改说明文字。"
      : "",
    formatNamedSubjectsBlock(namedSubjects),
    materials,
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
  if (!html || html.trim().startsWith("{")) {
    throw new Error("模型未返回有效 HTML 片段");
  }

  const missing = missingNamedSubjects(html, namedSubjects);
  let llmBackend = result.llmBackend;
  let note = parsed.note.trim();
  if (missing.length > 0) {
    try {
      const retry = await callLlm(env, [
        { role: "system", content: REVISE_SYSTEM },
        {
          role: "user",
          content: [
            userPrompt,
            "",
            "【漏列补写】上一稿漏了这些附件点名的主体，必须写入表格或对战卡：",
            ...missing.map((n) => `- ${n}`),
            "",
            "【当前 HTML】",
            html,
          ].join("\n"),
        },
      ]);
      const retryParsed = parseReviseChapterAnswer(retry.answer);
      let retryHtml = normalizeChapterHtmlFragment(retryParsed.html);
      retryHtml = linkifyCitationMarkers(retryHtml);
      retryHtml = polishChapterTableHtml(retryHtml);
      if (retryHtml && !retryHtml.trim().startsWith("{")) {
        html = retryHtml;
        llmBackend = retry.llmBackend;
        note = retryParsed.note.trim() || note;
      }
    } catch {
      /* 保留首稿 */
    }
  }

  const reviseNote =
    note ||
    `已按指令改写「${input.title}」：已处理你指出的问题；未点名部分尽量保持原样。`;
  return { html, note: reviseNote, llmBackend };
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

  const denied = await assertCanPublishLive(
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
  let existingHtml = existing?.html ?? "";
  if (!existingHtml.trim()) {
    const all = await listProjectKnowledgeChapterHtml(env.DB, projectId);
    existingHtml = resolveMappedChapterHtml(
      sectionId,
      new Map(all.map((c) => [c.sectionId, c.html])),
    );
  }
  if (!existingHtml.trim()) {
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
      html: repairStoredChapterHtml(existingHtml),
      instruction,
      projectId,
      userId,
      sectionId,
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

/** PUT /api/projects/:id/knowledge-chapters/:sectionId  项目管理员人工保存正式版 HTML */
export async function handlePutProjectKnowledgeChapter(
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
      { error: "引用来源、名词解释与关系图请通过章节/概览更新维护" },
      400,
    );
  }

  const project = await getProjectById(env, projectId);
  if (!project) return json({ error: "项目不存在" }, 404);

  const denied = await assertCanPublishLive(
    env,
    userId,
    projectId,
    project.createdBy,
  );
  if (denied) return denied;

  let body: { html?: string };
  try {
    body = (await request.json()) as { html?: string };
  } catch {
    return json({ error: "请求体须为 JSON：{ html }" }, 400);
  }
  const html = typeof body.html === "string" ? body.html : "";
  if (!html.trim()) {
    return json({ error: "html 不能为空" }, 400);
  }

  const existing = await getProjectKnowledgeChapterHtml(
    env.DB,
    projectId,
    sectionId,
  );
  if (!existing?.html.trim()) {
    return json(
      { error: "本章尚无内容，请先生成后再人工编辑", code: "NO_HTML" },
      400,
    );
  }

  const saved = await upsertProjectKnowledgeChapterHtml(env.DB, {
    projectId,
    sectionId,
    html: repairStoredChapterHtml(html),
    source: "revise",
    llmBackend: existing.llmBackend,
    updatedBy: userId,
  });

  return json({
    ok: true,
    projectId,
    sectionId,
    html: saved.html,
    source: saved.source,
    llmBackend: saved.llmBackend,
    updatedAt: saved.updatedAt,
    updatedBy: saved.updatedBy,
  });
}
