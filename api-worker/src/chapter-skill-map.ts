/**
 * 网页知识网络章节 → skill 方法来源（按项目形态混用三包）。
 * 网页 Tab 框架是权威；skill 只提供「怎么填这个格子」。
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

const MATURE: Record<string, ChapterSkillSpec> = {
  "project-overview": { primary: ["project-intake"], borrow: [] },
  "project-summary": {
    primary: ["project-intake"],
    borrow: ["classify-investment-theme"],
  },
  "industry-competition": {
    primary: ["industry-due-diligence"],
    borrow: ["startup-competitors"],
  },
  "business-technology": { primary: ["business-due-diligence"], borrow: [] },
  "company-team": {
    primary: ["background-check"],
    borrow: ["compliance-check"],
  },
  "financial-diligence": { primary: ["financial-due-diligence"], borrow: [] },
  "investment-structure-returns": {
    primary: ["returns-analysis"],
    borrow: ["financial-due-diligence"],
  },
  "investment-risks": { primary: ["risk-matrix"], borrow: [] },
  "diligence-gaps": {
    primary: ["gap-tracking"],
    borrow: ["dd-checklist"],
  },
  "investment-conclusion": {
    primary: ["ic-memo"],
    borrow: ["value-creation-plan"],
  },
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
  brand: { primary: ["startup-design"], borrow: [] },
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
  "startup-design": ["references/honesty-protocol.md"],
  "startup-competitors": ["references/honesty-protocol.md"],
  "startup-positioning": ["references/honesty-protocol.md"],
  "startup-pitch": ["references/honesty-protocol.md"],
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
