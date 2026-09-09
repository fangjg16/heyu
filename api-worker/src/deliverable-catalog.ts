/**
 * 三套形态「先写资料包文件、再填知识网络」的文件目录。
 * 路径：AI生成/{pack}/{folder}/{filename}，同一路径再生成是新版本。
 */
import type { AnalysisKind } from "./analysis-kind";
import { DEFAULT_ANALYSIS_KIND } from "./analysis-kind";
import {
  deliverableDraftId,
  fullDraftSectionIds,
} from "./kn-catalog";
import { AI_GENERATED_ROOT } from "./ai-generated-path";
import type { SkillPackId } from "./skill-packs";

export type DeliverableLegacyPath = {
  readonly folder: string;
  readonly filename: string;
};

export type DeliverableFile = {
  readonly id: string;
  readonly pack: Exclude<SkillPackId, "platform">;
  readonly folder: string;
  readonly filename: string;
  readonly title: string;
  readonly skill: string;
  readonly knSectionIds: readonly string[];
  readonly phase: number;
  /** 相对 skill 目录；有则网页写文件只喂这些说明书，不灌整份 SKILL.md */
  readonly skillFiles?: readonly string[];
  /** 旧资料包路径，渲染时若新路径还没有文件则回退 */
  readonly legacy?: readonly DeliverableLegacyPath[];
};

function f(
  id: string,
  pack: Exclude<SkillPackId, "platform">,
  folder: string,
  filename: string,
  title: string,
  skill: string,
  knSectionIds: readonly string[],
  phase: number,
  skillFiles?: readonly string[],
  legacy?: readonly DeliverableLegacyPath[],
): DeliverableFile {
  return {
    id,
    pack,
    folder,
    filename,
    title,
    skill,
    knSectionIds,
    phase,
    ...(skillFiles?.length ? { skillFiles } : {}),
    ...(legacy?.length ? { legacy } : {}),
  };
}

const EARLY: readonly DeliverableFile[] = [
  f("market-analysis", "startup", "01-discovery", "market-analysis.md", "市场分析", "startup-design", ["market-analysis"], 1),
  f("competitor-landscape", "startup", "01-discovery", "competitor-landscape.md", "竞争格局", "startup-competitors", ["competitor-landscape"], 1),
  f("industry-trends", "startup", "01-discovery", "industry-trends.md", "行业趋势", "startup-design", ["industry-trends"], 1),
  f("target-audience", "startup", "01-discovery", "target-audience.md", "目标客户", "startup-design", ["target-audience"], 1),
  f("confidence-dashboard", "startup", "01-discovery", "confidence-dashboard.md", "结论可靠度", "startup-design", ["research-gate"], 2),
  f("research-gate", "startup", "01-discovery", "research-gate.md", "研究闸门", "startup-design", ["research-gate"], 2),
  f("lean-canvas", "startup", "02-strategy", "lean-canvas.md", "Lean Canvas", "startup-design", ["lean-business-model"], 3),
  f("business-model", "startup", "02-strategy", "business-model.md", "商业模式", "startup-design", ["lean-business-model"], 3),
  f("value-proposition", "startup", "02-strategy", "value-proposition.md", "价值主张", "startup-design", ["value-proposition"], 3),
  f("positioning", "startup", "02-strategy", "positioning.md", "差异化定位", "startup-positioning", ["positioning"], 3),
  f("go-to-market", "startup", "02-strategy", "go-to-market.md", "市场进入", "startup-pitch", ["go-to-market"], 3),
  f("mvp-definition", "startup", "04-product", "mvp-definition.md", "MVP产品", "startup-design", ["mvp-definition"], 4),
  f("user-journey", "startup", "04-product", "user-journey.md", "用户旅程", "startup-design", ["user-journey"], 4),
  f("feature-prioritization", "startup", "04-product", "feature-prioritization.md", "功能规划", "startup-design", ["feature-prioritization"], 4),
  f("revenue-model", "startup", "05-financial", "revenue-model.md", "收入模式", "startup-design", ["revenue-model"], 5),
  f("cost-structure", "startup", "05-financial", "cost-structure.md", "成本结构", "startup-design", ["cost-structure"], 5),
  f("projections", "startup", "05-financial", "projections.md", "三年预测", "startup-design", ["projections"], 5),
  f("risk-analysis", "startup", "06-validation", "risk-analysis.md", "风险清单", "startup-design", ["risk-analysis"], 6),
  f("assumptions-tracker", "startup", "06-validation", "assumptions-tracker.md", "关键假设", "startup-design", ["assumptions-tracker"], 6),
  f("validation-playbook", "startup", "06-validation", "validation-playbook.md", "验证手册", "startup-design", ["validation-playbook"], 6),
  f("experiment-design", "startup", "06-validation", "experiment-design.md", "实验设计", "startup-design", ["validation-playbook"], 6),
  f("kill-criteria", "startup", "06-validation", "kill-criteria.md", "停止标准", "startup-design", ["validation-playbook"], 6),
  f("scorecard", "startup", "00-overview", "scorecard.md", "综合总评", "startup-design", ["project-scorecard"], 7),
  f("readme", "startup", "00-overview", "README.md", "执行摘要", "startup-design", ["exec-summary"], 7),
  f("action-plan-30-days", "startup", "07-next", "action-plan-30-days.md", "下一步行动", "startup-design", ["action-plan-30d"], 7),
];

const HONESTY = "references/honesty-protocol.md";

const INDUSTRY_KN = [
  "industry-overview",
  "industry-demand",
  "industry-value-chain",
  "industry-competition-structure",
  "industry-outlook",
] as const;

const BUSINESS_KN = [
  "business-overview",
  "product-situation",
  "technology-situation",
  "commercial-model",
  "core-competitiveness",
  "company-team",
] as const;

const MATURE: readonly DeliverableFile[] = [
  f("brief", "capitallens", "01-intake", "project-brief.md", "项目简报", "deal-screening", [], 1, ["references/project-intake.md", HONESTY], [{ folder: "00-intake", filename: "brief.md" }]),
  f("theme", "capitallens", "01-intake", "theme-classification.md", "投资主题", "deal-screening", [], 1, ["references/theme-classification.md", "references/taxonomy.md", "references/decision-rules.md", HONESTY], [{ folder: "00-intake", filename: "theme.md" }]),
  f("enrichment", "capitallens", "02-screening", "enrichment.md", "公开信息补充", "deal-screening", [], 1, ["references/enrichment.md", "references/research-principles.md", HONESTY]),
  f("screening-memo", "capitallens", "02-screening", "screening-memo.md", "筛选备忘录", "deal-screening", [], 1, ["references/screening-memo.md", "references/scoring.md", "references/open-questions.md", HONESTY]),
  f("industry-due-diligence", "capitallens", "03-diligence", "industry-diligence.md", "行业尽调", "due-diligence", INDUSTRY_KN, 2, ["references/dd-industry.md", HONESTY], [{ folder: "01-industry", filename: "industry-due-diligence.md" }]),
  f("business-due-diligence", "capitallens", "03-diligence", "business-diligence.md", "商业尽调", "due-diligence", BUSINESS_KN, 3, ["references/dd-business.md", HONESTY], [{ folder: "02-business", filename: "business-due-diligence.md" }]),
  f("background-check", "capitallens", "03-diligence", "background-check.md", "背景调查", "due-diligence", ["company-background"], 4, ["references/dd-background-check.md", HONESTY], [{ folder: "04-company", filename: "background-check.md" }]),
  f("compliance-check", "capitallens", "03-diligence", "legal-screening.md", "合规筛查", "due-diligence", [], 4, ["references/dd-legal.md", HONESTY], [{ folder: "04-company", filename: "compliance-check.md" }]),
  f("financial-due-diligence", "capitallens", "03-diligence", "financial-diligence.md", "财务尽调", "due-diligence", ["financial-diligence"], 5, ["references/dd-financial.md", HONESTY], [{ folder: "03-financials", filename: "financial-due-diligence.md" }]),
  f("returns", "capitallens", "04-underwriting", "valuation-and-returns.md", "回报测算", "due-diligence", ["investment-structure-returns"], 6, ["references/returns-analysis.md", HONESTY], [{ folder: "05-decision", filename: "returns.md" }]),
  f("risk-matrix", "capitallens", "05-decision", "investment-risks.md", "投资风险", "due-diligence", [], 7, ["references/risk-matrix.md", HONESTY], [{ folder: "05-decision", filename: "risk-matrix.md" }]),
  f("gaps", "capitallens", "03-diligence", "diligence-request-list.md", "尽调请求", "due-diligence", ["diligence-gaps"], 8, ["references/dd-checklist.md", "references/dd-principles.md", HONESTY], [{ folder: "05-decision", filename: "gaps.md" }]),
  f("dd-checklist", "capitallens", "03-diligence", "diligence-readiness.md", "尽调就绪", "due-diligence", [], 8, ["references/dd-principles.md", "references/dd-checklist.md", HONESTY], [{ folder: "05-decision", filename: "dd-checklist.md" }]),
  f("claim-audit", "capitallens", "03-diligence", "claim-audit.md", "声明审计", "due-diligence", ["assumption-validation"], 8, ["references/dd-claim-audit.md", HONESTY]),
  f("investment-analysis-report", "capitallens", "05-decision", "investment-analysis-report.md", "投资分析", "due-diligence", [], 9, ["references/dd-synthesis.md", HONESTY]),
  f("source-register", "capitallens", "02-evidence", "source-register.md", "引用来源", "due-diligence", [], 9, ["references/shared/source-grading.md", "references/shared/evidence-contract.md", HONESTY]),
];

/** 一份尽调文件切到多个二级 tab 时，按标题抽取。 */
export const MATURE_KN_HEADING_SLICES: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = {
  "industry-due-diligence": {
    "industry-overview": [
      "行业定义与坐标",
      "市场现状、规模与增长",
      "发展历程与关键拐点",
    ],
    "industry-demand": [
      "行业逻辑与需求形成",
      "渗透、驱动因素与约束",
      "驱动因素与约束",
    ],
    "industry-value-chain": ["价值链与利润池"],
    "industry-competition-structure": ["竞争结构与参与者"],
    "industry-outlook": ["趋势、技术与监管"],
  },
  "business-due-diligence": {
    "business-overview": ["真实业务与边界", "业务演进与战略一致性", "业务概览"],
    "product-situation": ["产品情况", "产品定义", "产品与技术"],
    "technology-situation": ["技术情况", "技术原理", "研发与知识产权"],
    "commercial-model": ["商业模式与交易闭环", "商业模式"],
    "core-competitiveness": ["核心能力与竞争力归因", "核心竞争力"],
    "company-team": ["运营、组织与关键依赖", "公司与团队", "公司基本信息"],
  },
};

export function headingSlicesForDeliverable(
  file: DeliverableFile,
  sectionId: string,
): readonly string[] | null {
  const map = MATURE_KN_HEADING_SLICES[file.id];
  if (!map) return null;
  const titles = map[sectionId];
  return titles?.length ? titles : null;
}

const ACQUIRE: readonly DeliverableFile[] = [
  f("intake", "buy-to-build", "00-intake", "intake.md", "收购立项", "acquisition-intake", ["decision-object"], 1),
  f("screening", "buy-to-build", "01-screening", "screening.md", "标的筛选", "target-screening", ["decision-object"], 1),
  f("acquisition-due-diligence", "buy-to-build", "02-diligence", "acquisition-due-diligence.md", "收购尽调", "acquisition-due-diligence", ["business-worth-buying"], 2),
  f("acquisition-economics", "buy-to-build", "03-economics", "acquisition-economics.md", "收购经济性", "acquisition-economics", ["price-financing-downside"], 3),
  f("buyer-fit", "buy-to-build", "04-fit", "buyer-fit.md", "买方适配", "buyer-fit-transition", ["buyer-fit-takeover"], 4),
  f("acquisition-risk-matrix", "buy-to-build", "05-risk", "risk-matrix.md", "收购风险", "risk-matrix", ["acquisition-risk-register"], 5),
  f("acquisition-gaps", "buy-to-build", "05-risk", "gaps.md", "未决事项", "gap-tracking", ["open-items-exceptions"], 6),
  f("claim-audit", "buy-to-build", "05-risk", "claim-audit.md", "声明审计", "dd-claim-audit", ["counterarguments-invalidation"], 6),
  f("acquisition-decision", "buy-to-build", "06-decision", "acquisition-decision.md", "收购闸门", "acquisition-gate", ["exec-verdict", "recommendation-conditions"], 7),
];

const BY_KIND: Record<AnalysisKind, readonly DeliverableFile[]> = {
  early: EARLY,
  mature: MATURE,
  acquire: ACQUIRE,
};

export function deliverablesForKind(
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): readonly DeliverableFile[] {
  return BY_KIND[kind] ?? MATURE;
}

export function deliverableById(
  kind: AnalysisKind,
  fileId: string,
): DeliverableFile | undefined {
  return deliverablesForKind(kind).find((d) => d.id === fileId);
}

export function deliverableRelativePath(file: DeliverableFile): string {
  return `${AI_GENERATED_ROOT}/${file.pack}/${file.folder}`;
}

export function deliverablesForKnSection(
  kind: AnalysisKind,
  sectionId: string,
): DeliverableFile[] {
  return deliverablesForKind(kind).filter((d) =>
    d.knSectionIds.includes(sectionId),
  );
}

export function deliverableFilenamesForKnSection(
  kind: AnalysisKind,
  sectionId: string,
): string[] {
  return deliverablesForKnSection(kind, sectionId).map((d) => d.filename);
}

/** 更新全部：文件条目在前，研究章 + 概览在后。单章：该章文件 + 该章。 */
export function draftGenerateItemIds(
  kind: AnalysisKind,
  scope: "full" | "section",
  sectionId?: string | null,
): string[] {
  if (scope === "section" && sectionId) {
    const files = deliverablesForKnSection(kind, sectionId).map((d) =>
      deliverableDraftId(d.id),
    );
    return [...files, sectionId];
  }
  const files = deliverablesForKind(kind).map((d) => deliverableDraftId(d.id));
  return [...files, ...fullDraftSectionIds(kind)];
}

export function deliverableDraftIdsForKnSections(
  kind: AnalysisKind,
  sectionIds: readonly string[],
): string[] {
  const wanted = new Set(sectionIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of deliverablesForKind(kind)) {
    if (!d.knSectionIds.some((id) => wanted.has(id))) continue;
    const itemId = deliverableDraftId(d.id);
    if (seen.has(itemId)) continue;
    seen.add(itemId);
    out.push(itemId);
  }
  return out;
}

export function earlierDeliverables(
  kind: AnalysisKind,
  file: DeliverableFile,
): DeliverableFile[] {
  const all = deliverablesForKind(kind);
  const idx = all.findIndex((d) => d.id === file.id);
  return idx <= 0 ? [] : [...all.slice(0, idx)];
}

export function unpublishedGenerateItemIds(
  kind: AnalysisKind,
  unpublishedKnIds: readonly string[],
): string[] {
  const kn = unpublishedKnIds.filter((id) => !id.startsWith("dlv:"));
  return [...deliverableDraftIdsForKnSections(kind, kn), ...kn];
}

export function orderDeliverableDraftIds(
  kind: AnalysisKind,
  ids: readonly string[],
): string[] {
  const order = new Map(
    deliverablesForKind(kind).map((d, i) => [deliverableDraftId(d.id), i]),
  );
  return [...ids].sort(
    (a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999),
  );
}

export const FILE_DRAFT_HTML_PREFIX = "file:";

export function deliverableDraftHtmlMarker(file: DeliverableFile): string {
  return `${FILE_DRAFT_HTML_PREFIX}${deliverableRelativePath(file)}/${file.filename}`;
}

export function isDeliverableDraftHtml(html: string | null | undefined): boolean {
  return (html ?? "").trim().startsWith(FILE_DRAFT_HTML_PREFIX);
}
