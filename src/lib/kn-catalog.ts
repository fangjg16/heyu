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
    id: "discover",
    label: "访谈与发现",
    sections: [
      { id: "founder-interview", label: "用户访谈" },
      { id: "market-discovery", label: "市场发现" },
    ],
  },
  {
    id: "design",
    label: "设计",
    sections: [
      { id: "strategy", label: "策略" },
      { id: "brand", label: "品牌" },
      { id: "product", label: "产品" },
    ],
  },
  {
    id: "prove",
    label: "数字与验证",
    sections: [
      { id: "financials", label: "财务" },
      { id: "validation", label: "验证" },
    ],
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
  return [...ids, "project-overview"];
}

export function sectionLabel(
  id: string,
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): string {
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
  };
  return legacy[id] ?? id;
}

export function questionsSectionIdForKind(
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): string {
  if (kind === "acquire") return "open-items-exceptions";
  if (kind === "early") return "validation";
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
