/**
 * 网页知识网络章节 → skill 方法来源（按项目形态混用三包）。
 * 资料包 Markdown 写文件时读完整说明书；知识网络研究章由这些文件渲染。
 */
import type { AnalysisKind } from "./analysis-kind";
import {
  ANALYSIS_KIND_LABELS,
  DEFAULT_ANALYSIS_KIND,
} from "./analysis-kind";
import { researchSectionsForKind } from "./kn-catalog";

export type ChapterSkillSpec = {
  readonly primary: readonly string[];
  readonly borrow: readonly string[];
};

const EMPTY: ChapterSkillSpec = { primary: [], borrow: [] };

const DUE: ChapterSkillSpec = { primary: ["due-diligence"], borrow: [] };
const DUE_INDUSTRY: ChapterSkillSpec = {
  primary: ["due-diligence"],
  borrow: ["startup-competitors"],
};

const MATURE: Record<string, ChapterSkillSpec> = {
  "project-overview": { primary: ["deal-screening"], borrow: [] },
  "project-summary": { primary: ["deal-screening"], borrow: [] },
  "industry-overview": DUE_INDUSTRY,
  "industry-demand": DUE_INDUSTRY,
  "industry-value-chain": DUE_INDUSTRY,
  "industry-competition-structure": DUE_INDUSTRY,
  "industry-outlook": DUE_INDUSTRY,
  "business-overview": DUE,
  "product-situation": DUE,
  "technology-situation": DUE,
  "commercial-model": DUE,
  "core-competitiveness": DUE,
  "company-team": DUE,
  "company-background": DUE,
  "financial-diligence": DUE,
  "investment-structure-returns": DUE,
  "assumption-validation": DUE,
  "diligence-gaps": DUE,
  "industry-competition": DUE_INDUSTRY,
  "business-technology": DUE,
  "investment-risks": DUE,
  "investment-conclusion": DUE,
};

const ACQUIRE: Record<string, ChapterSkillSpec> = {
  "project-overview": { primary: ["acquisition-intake"], borrow: [] },
  "exec-verdict": { primary: ["acquisition-gate"], borrow: [] },
  "decision-object": {
    primary: ["acquisition-intake"],
    borrow: ["target-screening"],
  },
  "business-worth-buying": {
    primary: ["acquisition-due-diligence"],
    borrow: ["business-due-diligence"],
  },
  "price-financing-downside": {
    primary: ["acquisition-economics"],
    borrow: ["financial-due-diligence"],
  },
  "buyer-fit-takeover": {
    primary: ["buyer-fit-transition"],
    borrow: ["background-check"],
  },
  "acquisition-risk-register": {
    primary: ["risk-matrix"],
    borrow: ["acquisition-due-diligence"],
  },
  "open-items-exceptions": {
    primary: ["gap-tracking"],
    borrow: ["dd-checklist"],
  },
  "counterarguments-invalidation": {
    primary: ["dd-claim-audit"],
    borrow: ["acquisition-due-diligence"],
  },
  "recommendation-conditions": {
    primary: ["acquisition-gate"],
    borrow: ["value-creation-plan"],
  },
};

const EARLY: Record<string, ChapterSkillSpec> = {
  "project-overview": { primary: ["startup-design"], borrow: ["project-intake"] },
  "exec-summary": { primary: ["startup-design"], borrow: [] },
  "project-scorecard": { primary: ["startup-design"], borrow: [] },
  "research-gate": {
    primary: ["startup-design", "startup-competitors"],
    borrow: [],
  },
  "target-audience": { primary: ["startup-design"], borrow: [] },
  "market-analysis": {
    primary: ["startup-design"],
    borrow: ["industry-due-diligence"],
  },
  "competitor-landscape": {
    primary: ["startup-design", "startup-competitors"],
    borrow: [],
  },
  "industry-trends": { primary: ["startup-design"], borrow: [] },
  "lean-business-model": {
    primary: ["startup-design", "startup-positioning"],
    borrow: [],
  },
  "value-proposition": { primary: ["startup-design"], borrow: [] },
  positioning: { primary: ["startup-design", "startup-positioning"], borrow: [] },
  "go-to-market": { primary: ["startup-design"], borrow: ["startup-pitch"] },
  "mvp-definition": { primary: ["startup-design"], borrow: ["startup-pitch"] },
  "user-journey": { primary: ["startup-design"], borrow: [] },
  "feature-prioritization": { primary: ["startup-design"], borrow: [] },
  projections: { primary: ["startup-design"], borrow: [] },
  "revenue-model": { primary: ["startup-design"], borrow: [] },
  "cost-structure": { primary: ["startup-design"], borrow: [] },
  "risk-analysis": { primary: ["startup-design"], borrow: [] },
  "assumptions-tracker": { primary: ["startup-design"], borrow: [] },
  "validation-playbook": { primary: ["startup-design"], borrow: [] },
  "action-plan-30d": { primary: ["startup-design"], borrow: [] },
  "founder-interview": { primary: ["startup-design"], borrow: [] },
  "market-discovery": {
    primary: ["startup-design", "startup-competitors"],
    borrow: ["industry-due-diligence"],
  },
  strategy: {
    primary: ["startup-design", "startup-positioning"],
    borrow: [],
  },
  product: { primary: ["startup-design"], borrow: ["startup-pitch"] },
  financials: { primary: ["startup-design"], borrow: [] },
  validation: { primary: ["startup-design"], borrow: [] },
};

export const CHAPTER_SKILL_BY_KIND: Readonly<
  Record<AnalysisKind, Readonly<Record<string, ChapterSkillSpec>>>
> = {
  mature: MATURE,
  acquire: ACQUIRE,
  early: EARLY,
};

/** 除 SKILL.md 外，网页生成要一并读入的说明书（相对 skill 目录）。 */
export const SKILL_REFERENCE_FILES: Readonly<
  Record<string, readonly string[]>
> = {
  "industry-due-diligence": ["references/industry-due-diligence.md"],
  "business-due-diligence": ["references/business-due-diligence.md"],
  "financial-due-diligence": ["references/financial-due-diligence.md"],
  "compliance-check": ["references/compliance-check.md"],
  "ic-memo": ["references/ic-memo.md"],
  "acquisition-intake": ["references/acquisition-thesis.md"],
  "acquisition-due-diligence": ["references/acquisition-diligence.md"],
  "acquisition-economics": ["references/acquisition-economics.md"],
  "acquisition-gate": ["references/acquisition-gate.md"],
  "buyer-fit-transition": ["references/buyer-fit-transition.md"],
  "target-screening": ["references/target-screening.md"],
  "classify-investment-theme": [
    "references/taxonomy.md",
    "references/decision-rules.md",
  ],
  "deal-screening": ["references/honesty-protocol.md"],
  "due-diligence": ["references/honesty-protocol.md"],
  "startup-design": [
    "references/honesty-protocol.md",
    "references/output-guidelines.md",
    "references/output-specs.md",
    "references/frameworks.md",
  ],
  "startup-competitors": ["references/honesty-protocol.md"],
  "startup-positioning": ["references/honesty-protocol.md"],
  "startup-pitch": ["references/honesty-protocol.md"],
};

/**
 * 成熟投资章只喂对应说明书，避免把整份 due-diligence SKILL.md 灌进 9k 上限。
 * 条目格式：`skillName:relative/path.md`
 */
export const CHAPTER_SKILL_REF_FILES: Readonly<
  Partial<Record<AnalysisKind, Readonly<Record<string, readonly string[]>>>>
> = {
  mature: {
    "project-overview": [
      "deal-screening:references/project-intake.md",
      "deal-screening:references/honesty-protocol.md",
    ],
    "project-summary": [
      "deal-screening:references/project-intake.md",
      "deal-screening:references/theme-classification.md",
      "deal-screening:references/screening-memo.md",
      "deal-screening:references/honesty-protocol.md",
    ],
    "industry-overview": [
      "due-diligence:references/dd-industry.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "industry-demand": [
      "due-diligence:references/dd-industry.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "industry-value-chain": [
      "due-diligence:references/dd-industry.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "industry-competition-structure": [
      "due-diligence:references/dd-industry.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "industry-outlook": [
      "due-diligence:references/dd-industry.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "business-overview": [
      "due-diligence:references/dd-business.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "product-situation": [
      "due-diligence:references/dd-business.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "technology-situation": [
      "due-diligence:references/dd-business.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "commercial-model": [
      "due-diligence:references/dd-business.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "core-competitiveness": [
      "due-diligence:references/dd-business.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "company-team": [
      "due-diligence:references/dd-business.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "company-background": [
      "due-diligence:references/dd-background-check.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "financial-diligence": [
      "due-diligence:references/dd-financial.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "investment-structure-returns": [
      "due-diligence:references/returns-analysis.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "assumption-validation": [
      "due-diligence:references/dd-claim-audit.md",
      "due-diligence:references/honesty-protocol.md",
    ],
    "diligence-gaps": [
      "due-diligence:references/dd-checklist.md",
      "due-diligence:references/dd-principles.md",
      "due-diligence:references/honesty-protocol.md",
    ],
  },
};

export { ANALYSIS_KIND_LABELS };

const OVERVIEW_SECTION = { id: "project-overview", label: "项目概览" };

export function serializeChapterSkillMap(): {
  kinds: { id: AnalysisKind; label: string }[];
  sections: { id: string; label: string }[];
  sectionsByKind: Record<string, { id: string; label: string }[]>;
  cells: Record<string, Record<string, ChapterSkillSpec>>;
} {
  const kinds = (["early", "mature", "acquire"] as const).map((id) => ({
    id,
    label: ANALYSIS_KIND_LABELS[id],
  }));
  const cells: Record<string, Record<string, ChapterSkillSpec>> = {};
  const sectionsByKind: Record<string, { id: string; label: string }[]> = {};
  const union = new Map<string, { id: string; label: string }>();
  union.set(OVERVIEW_SECTION.id, OVERVIEW_SECTION);
  for (const kind of ["early", "mature", "acquire"] as const) {
    const sections = [OVERVIEW_SECTION, ...researchSectionsForKind(kind)];
    sectionsByKind[kind] = sections;
    cells[kind] = {};
    for (const section of sections) {
      cells[kind]![section.id] = specForChapter(section.id, kind);
      if (!union.has(section.id)) union.set(section.id, section);
    }
  }
  return {
    kinds,
    sections: [...union.values()],
    sectionsByKind,
    cells,
  };
}

export function specForChapter(
  sectionId: string,
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): ChapterSkillSpec {
  const id = (sectionId ?? "").trim();
  return CHAPTER_SKILL_BY_KIND[kind]?.[id] ?? EMPTY;
}

export function skillsForChapter(
  sectionId: string,
  kind: AnalysisKind = DEFAULT_ANALYSIS_KIND,
): readonly string[] {
  const spec = specForChapter(sectionId, kind);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of [...spec.primary, ...spec.borrow]) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** 成熟投资的默认映射，便于旧测试与无 kind 调用。 */
export const CHAPTER_SKILL_MAP: Readonly<Record<string, readonly string[]>> =
  Object.fromEntries(
    Object.entries(MATURE).map(([id, spec]) => [
      id,
      [...spec.primary, ...spec.borrow],
    ]),
  );
