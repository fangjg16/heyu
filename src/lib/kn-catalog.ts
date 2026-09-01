/**
 * 知识网络章节目录（按 analysis_kind）。
 * 与 api-worker/src/kn-catalog.ts 保持一致。
 */
import type { AnalysisKind } from "@/lib/analysis-kind";
import { DEFAULT_ANALYSIS_KIND } from "@/lib/analysis-kind";

export type KnCatalogSection = { id: string; label: string };
export type KnCatalogGroup = {
  id: string;
  label: string;
  sections: readonly KnCatalogSection[];
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
    return [...rest, "investment-conclusion", "project-overview"];
  }
  if (kind === "early") {
    const rest = ids.filter(
      (id) => id !== "exec-summary" && id !== "project-scorecard",
    );
    return [...rest, "exec-summary", "project-scorecard", "project-overview"];
  }
  return [...ids, "project-overview"];
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
  if (id === "project-overview") return "项目概览";
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

export function questionsSectionIdForKind(
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): string {
  if (kind === "acquire") return "open-items-exceptions";
  if (kind === "early") return "assumptions-tracker";
  return "diligence-gaps";
}

export function resolveSectionLocation(
  sectionRaw: string | null,
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): { groupId: string; sectionId: string } | null {
  const sid = (sectionRaw ?? "").trim();
  if (!sid) return null;
  for (const g of catalogGroupsForKind(kind)) {
    if (g.sections.some((s) => s.id === sid)) {
      return { groupId: g.id, sectionId: sid };
    }
  }
  return null;
}
