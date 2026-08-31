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

const MATURE_GROUPS: readonly KnCatalogGroup[] = [
  {
    id: "research",
    label: "投资研究",
    sections: [
      { id: "project-summary", label: "项目概况" },
      { id: "industry-competition", label: "行业与竞争" },
      { id: "business-technology", label: "业务与技术" },
      { id: "company-team", label: "公司与团队" },
      { id: "financial-diligence", label: "财务研究" },
    ],
  },
  {
    id: "decision",
    label: "方案与结论",
    sections: [
      { id: "investment-structure-returns", label: "投资方案与收益预测" },
      { id: "investment-risks", label: "投资风险" },
      { id: "diligence-gaps", label: "待解决问题" },
      { id: "investment-conclusion", label: "结论" },
    ],
  },
];

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

/** 「更新全部」：研究章 + 最后生成项目概览 */
export function fullDraftSectionIds(
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): string[] {
  return [...researchSectionIdsForKind(kind), OVERVIEW.id];
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
  if (kind === "early") return "validation";
  return "diligence-gaps";
}

export function sectionLabel(
  id: string,
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): string {
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
  };
  return legacy[id] ?? id;
}

export function fallbackChapterMarkdown(id: string, title: string): string {
  const emptyHint =
    id === "founder-interview" ||
    id === "market-discovery" ||
    id === "strategy" ||
    id === "brand" ||
    id === "product" ||
    id === "financials" ||
    id === "validation"
      ? "若这一步还没做，正文写「这一步还没做」，并说明缺什么材料或访谈，禁止用空尽调格充数。"
      : "缺依据写「待补」，禁止编造。";
  return `---
id: ${id}
title: ${title}
---

<h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#1F2423">${title}</h2>
<p style="margin:0 0 16px;font-size:13.5px;line-height:1.75;color:#59625F">待补（一句话结论）</p>
<p style="margin:0 0 16px;font-size:12.5px;line-height:1.65;color:#969E9A">${emptyHint}</p>
<div style="overflow-x:auto">
<table style="width:100%;border-collapse:collapse;border:1px solid rgba(78,66,57,0.12)">
  <thead>
    <tr style="background:rgba(78,66,57,0.05);font-size:12px;font-weight:600;color:#59625F">
      <th style="white-space:nowrap;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">要点</th>
      <th style="white-space:nowrap;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">内容</th>
      <th style="white-space:nowrap;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">证据/来源</th>
    </tr>
  </thead>
  <tbody>
    <tr style="font-size:13px;line-height:1.6;border-top:1px solid rgba(78,66,57,0.1)">
      <td style="padding:13px 14px">结论</td>
      <td style="padding:13px 14px">待补</td>
      <td style="padding:13px 14px">[A-1]</td>
    </tr>
    <tr style="font-size:13px;line-height:1.6;border-top:1px solid rgba(78,66,57,0.1)">
      <td style="padding:13px 14px">已核实事实</td>
      <td style="padding:13px 14px">待补</td>
      <td style="padding:13px 14px">[A-1]</td>
    </tr>
    <tr style="font-size:13px;line-height:1.6;border-top:1px solid rgba(78,66,57,0.1)">
      <td style="padding:13px 14px">缺口 / 下一步</td>
      <td style="padding:13px 14px">待补</td>
      <td style="padding:13px 14px">[A-1]</td>
    </tr>
  </tbody>
</table>
</div>
`;
}

export const DEFAULT_CHAPTER_FORMAT_HINT =
  "===CHAPTER=== 按模板填 HTML：一句话结论 + 要点表（要点｜内容｜证据/来源）。证据/来源列只写 [A-1]。缺依据写待补。早期阶段若该步尚未开展，写「这一步还没做」。禁止散文、禁止完整页面、禁止 SVG。随后 ===SOURCES_ADD=== / ===GLOSSARY_ADD===。";
