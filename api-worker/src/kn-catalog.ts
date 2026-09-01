/**
 * 知识网络章节目录（按 analysis_kind）。
 * 与 src/lib/kn-catalog.ts 保持一致。
 */
import type { AnalysisKind } from "./analysis-kind";
import { DEFAULT_ANALYSIS_KIND } from "./analysis-kind";

export type KnCatalogSection = { id: string; label: string };
export type KnCatalogGroup = {
  id: string;
  label: string;
  sections: readonly KnCatalogSection[];
};

const OVERVIEW: KnCatalogSection = {
  id: "project-overview",
  label: "项目概览",
};

const MATURE_SECTIONS: readonly KnCatalogSection[] = [
  { id: "investment-conclusion", label: "结论" },
  { id: "project-summary", label: "项目概况" },
  { id: "industry-competition", label: "行业与竞争" },
  { id: "business-technology", label: "业务与技术" },
  { id: "company-team", label: "公司与团队" },
  { id: "financial-diligence", label: "财务研究" },
  { id: "investment-structure-returns", label: "投资方案与收益预测" },
  { id: "investment-risks", label: "投资风险" },
  { id: "diligence-gaps", label: "待解决问题" },
];

const MATURE_GROUPS: readonly KnCatalogGroup[] = MATURE_SECTIONS.map((s) => ({
  id: s.id,
  label: s.label,
  sections: [s],
}));

const ACQUIRE_GROUPS: readonly KnCatalogGroup[] = [
  {
    id: "verdict",
    label: "闸门结论",
    sections: [
      { id: "exec-verdict", label: "执行结论" },
      { id: "decision-object", label: "决策对象与版本" },
    ],
  },
  {
    id: "underwrite",
    label: "值不值得买",
    sections: [
      { id: "business-worth-buying", label: "业务是否值得买" },
      { id: "price-financing-downside", label: "价格、融资与下行求生" },
      { id: "buyer-fit-takeover", label: "买方适配与接管" },
    ],
  },
  {
    id: "gate",
    label: "条件与反论",
    sections: [
      { id: "acquisition-risk-register", label: "收购风险登记" },
      { id: "open-items-exceptions", label: "未决事项与例外" },
      { id: "counterarguments-invalidation", label: "反论与失效触发" },
      { id: "recommendation-conditions", label: "建议与条件" },
    ],
  },
];

const EARLY_GROUPS: readonly KnCatalogGroup[] = [
  {
    id: "overview",
    label: "项目概况",
    sections: [
      { id: "exec-summary", label: "执行摘要" },
      { id: "project-scorecard", label: "综合总评" },
    ],
  },
  {
    id: "discovery",
    label: "市场发现",
    sections: [
      { id: "research-gate", label: "研究结论" },
      { id: "target-audience", label: "目标客户" },
      { id: "market-analysis", label: "市场分析" },
      { id: "competitor-landscape", label: "竞争格局" },
      { id: "industry-trends", label: "行业趋势" },
    ],
  },
  {
    id: "strategy",
    label: "战略定位",
    sections: [
      { id: "lean-business-model", label: "商业模式" },
      { id: "value-proposition", label: "价值主张" },
      { id: "positioning", label: "差异化定位" },
      { id: "go-to-market", label: "市场进入" },
    ],
  },
  {
    id: "brand",
    label: "品牌设计",
    sections: [{ id: "brand", label: "品牌设计" }],
  },
  {
    id: "product",
    label: "产品设计",
    sections: [
      { id: "mvp-definition", label: "MVP产品" },
      { id: "user-journey", label: "用户旅程" },
      { id: "feature-prioritization", label: "功能规划" },
    ],
  },
  {
    id: "finance",
    label: "财务测算",
    sections: [
      { id: "projections", label: "三年预测" },
      { id: "revenue-model", label: "收入模式" },
      { id: "cost-structure", label: "成本结构" },
    ],
  },
  {
    id: "prove",
    label: "风险验证",
    sections: [
      { id: "risk-analysis", label: "风险清单" },
      { id: "assumptions-tracker", label: "关键假设" },
      { id: "validation-playbook", label: "假设验证" },
    ],
  },
  {
    id: "next",
    label: "未来行动",
    sections: [{ id: "action-plan-30d", label: "下一步行动" }],
  },
];

export const KN_CATALOG_BY_KIND: Readonly<
  Record<AnalysisKind, readonly KnCatalogGroup[]>
> = {
  mature: MATURE_GROUPS,
  acquire: ACQUIRE_GROUPS,
  early: EARLY_GROUPS,
};

/** 旧 13 格，仅用于读历史草案 / 已落库 HTML，不再出现在章节条 */
export const LEGACY_RESEARCH_SECTION_IDS = [
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
  "founder-interview",
  "market-discovery",
  "strategy",
  "product",
  "financials",
  "validation",
] as const;

export const META_SECTION_IDS = [
  "sources",
  "glossary",
  "project-overview",
  "project-graph",
] as const;

export function catalogGroupsForKind(
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): readonly KnCatalogGroup[] {
  return KN_CATALOG_BY_KIND[kind] ?? MATURE_GROUPS;
}

export function researchSectionsForKind(
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): KnCatalogSection[] {
  return catalogGroupsForKind(kind).flatMap((g) => [...g.sections]);
}

export function researchSectionIdsForKind(
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): string[] {
  return researchSectionsForKind(kind).map((s) => s.id);
}

/** 「更新全部」：研究章 + 最后生成项目概览。投资形态的结论放在研究章之后、概览之前生成。 */
export function fullDraftSectionIds(
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): string[] {
  const ids = researchSectionIdsForKind(kind);
  if (kind === "mature") {
    const rest = ids.filter((id) => id !== "investment-conclusion");
    return [...rest, "investment-conclusion", OVERVIEW.id];
  }
  if (kind === "early") {
    const rest = ids.filter(
      (id) => id !== "exec-summary" && id !== "project-scorecard",
    );
    return [...rest, "exec-summary", "project-scorecard", OVERVIEW.id];
  }
  return [...ids, OVERVIEW.id];
}

export function allCurrentResearchSectionIds(): string[] {
  const ids = new Set<string>();
  for (const kind of ["mature", "acquire", "early"] as const) {
    for (const id of researchSectionIdsForKind(kind)) ids.add(id);
  }
  return [...ids];
}

const CURRENT_RESEARCH_SET = new Set(allCurrentResearchSectionIds());
const LEGACY_SET = new Set<string>(LEGACY_RESEARCH_SECTION_IDS);
const META_SET = new Set<string>(META_SECTION_IDS);

export function isMetaSectionId(id: string): boolean {
  return META_SET.has(id);
}

export function isResearchSectionId(id: string): boolean {
  return CURRENT_RESEARCH_SET.has(id) || LEGACY_SET.has(id);
}

export function isGeneratableSectionId(id: string): boolean {
  return CURRENT_RESEARCH_SET.has(id) || id === "project-overview" || LEGACY_SET.has(id);
}

export function isKnownSectionId(id: string): boolean {
  return isResearchSectionId(id) || isMetaSectionId(id);
}

export function questionsSectionIdForKind(
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): string {
  if (kind === "acquire") return "open-items-exceptions";
  if (kind === "early") return "assumptions-tracker";
  return "diligence-gaps";
}

export const DELIVERABLE_DRAFT_PREFIX = "dlv:";

export function isDeliverableDraftId(id: string): boolean {
  return id.startsWith(DELIVERABLE_DRAFT_PREFIX);
}

export function deliverableDraftId(fileId: string): string {
  return `${DELIVERABLE_DRAFT_PREFIX}${fileId}`;
}

export function deliverableFileIdFromDraft(id: string): string {
  return isDeliverableDraftId(id)
    ? id.slice(DELIVERABLE_DRAFT_PREFIX.length)
    : id;
}

export function sectionLabel(
  id: string,
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): string {
  if (isDeliverableDraftId(id)) {
    return `文件 · ${deliverableFileIdFromDraft(id)}`;
  }
  if (id === OVERVIEW.id) return OVERVIEW.label;
  if (id === "sources") return "引用来源";
  if (id === "glossary") return "名词解释";
  if (id === "project-graph") return "项目关系图";
  const hit = researchSectionsForKind(kind).find((s) => s.id === id);
  if (hit) return hit.label;
  for (const k of ["mature", "acquire", "early"] as const) {
    const other = researchSectionsForKind(k).find((s) => s.id === id);
    if (other) return other.label;
  }
  const legacy: Record<string, string> = {
    snapshot: "项目快照",
    objectives: "标的概况",
    industry: "行业分析",
    legal: "合规分析",
    benchmarks: "对标分析",
    business: "业务模式",
    returns: "财务与回报",
    capabilities: "资源网络",
    ownership: "背景调查",
    diligence: "尽职调查",
    risks: "风险矩阵",
    questions: "待确认问题",
    framework: "决策路径与法律结构",
    "founder-interview": "用户访谈",
    "market-discovery": "市场发现",
    strategy: "策略",
    product: "产品",
    financials: "财务",
    validation: "验证",
  };
  return legacy[id] ?? id;
}

const EARLY_EMPTY_SECTION_IDS = new Set<string>([
  ...EARLY_GROUPS.flatMap((g) => g.sections.map((s) => s.id)),
  "founder-interview",
  "market-discovery",
  "strategy",
  "product",
  "financials",
  "validation",
]);

export function fallbackChapterMarkdown(id: string, title: string): string {
  const early = EARLY_EMPTY_SECTION_IDS.has(id);
  if (early) {
    return `---
id: ${id}
title: ${title}
---

<div class="kn-empty">
  <p class="kn-empty__title">尚未开展</p>
  <p class="kn-empty__purpose">待补</p>
  <p class="kn-empty__label">待备材料</p>
  <ul><li>待补</li></ul>
  <p class="kn-empty__next"><span>建议动作</span>待补</p>
</div>
`;
  }
  return `---
id: ${id}
title: ${title}
---

<aside class="kn-callout">
  <p class="kn-callout__label">判断</p>
  <p class="kn-callout__body">待补</p>
</aside>
<div class="kn-table-wrap">
<table>
  <thead>
    <tr><th>要点</th><th>内容</th><th>证据/来源</th></tr>
  </thead>
  <tbody>
    <tr><td>结论</td><td>待补</td><td>[A-1]</td></tr>
    <tr><td>已核实事实</td><td>待补</td><td>[A-1]</td></tr>
  </tbody>
</table>
</div>
`;
}

export const DEFAULT_CHAPTER_FORMAT_HINT =
  "===CHAPTER=== 按模板填 HTML，保留 class。一句话用判断条，明细用表。证据/来源列只写 [A-1]。缺依据写待补。创业章若该环节尚未开展，只保留「尚未开展」块。禁止散文、禁止完整页面、禁止 SVG。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。";
