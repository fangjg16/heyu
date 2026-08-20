/**
 * 网页知识网络章节 → skill 方法来源（按项目形态混用三包）。
 * 网页 Tab 框架是权威；skill 只提供「怎么填这个格子」。
 */
import type { AnalysisKind } from "./analysis-kind";
import { DEFAULT_ANALYSIS_KIND } from "./analysis-kind";

export type ChapterSkillSpec = {
  readonly primary: readonly string[];
  readonly borrow: readonly string[];
};

const EMPTY: ChapterSkillSpec = { primary: [], borrow: [] };

const MATURE: Record<string, ChapterSkillSpec> = {
  "project-overview": { primary: ["project-intake"], borrow: [] },
  snapshot: { primary: ["project-intake"], borrow: ["classify-investment-theme"] },
  objectives: { primary: ["dd-claim-audit"], borrow: [] },
  industry: {
    primary: ["industry-due-diligence"],
    borrow: ["startup-design", "startup-competitors"],
  },
  legal: { primary: ["compliance-check"], borrow: ["dd-claim-audit"] },
  benchmarks: {
    primary: ["industry-due-diligence", "returns-analysis"],
    borrow: ["startup-competitors"],
  },
  business: { primary: ["business-due-diligence"], borrow: [] },
  returns: { primary: ["returns-analysis"], borrow: ["financial-due-diligence"] },
  capabilities: { primary: ["background-check"], borrow: [] },
  ownership: { primary: ["background-check"], borrow: [] },
  diligence: { primary: ["dd-checklist"], borrow: [] },
  risks: { primary: ["risk-matrix"], borrow: [] },
  questions: { primary: ["gap-tracking"], borrow: [] },
  framework: { primary: ["value-creation-plan", "ic-memo"], borrow: [] },
};

const ACQUIRE: Record<string, ChapterSkillSpec> = {
  "project-overview": { primary: ["acquisition-intake"], borrow: [] },
  snapshot: {
    primary: ["acquisition-intake"],
    borrow: ["target-screening", "classify-investment-theme"],
  },
  objectives: {
    primary: ["dd-claim-audit"],
    borrow: ["acquisition-due-diligence"],
  },
  industry: {
    primary: ["industry-due-diligence"],
    borrow: ["startup-design", "startup-competitors"],
  },
  legal: {
    primary: ["compliance-check"],
    borrow: ["dd-claim-audit", "acquisition-due-diligence"],
  },
  benchmarks: {
    primary: ["industry-due-diligence", "returns-analysis"],
    borrow: ["startup-competitors"],
  },
  business: { primary: ["acquisition-due-diligence"], borrow: [] },
  returns: {
    primary: ["acquisition-economics"],
    borrow: ["financial-due-diligence", "returns-analysis"],
  },
  capabilities: {
    primary: ["buyer-fit-transition"],
    borrow: ["background-check"],
  },
  ownership: {
    primary: ["background-check"],
    borrow: ["acquisition-due-diligence"],
  },
  diligence: {
    primary: ["dd-checklist"],
    borrow: ["acquisition-due-diligence"],
  },
  risks: { primary: ["risk-matrix"], borrow: ["acquisition-due-diligence"] },
  questions: { primary: ["gap-tracking"], borrow: [] },
  framework: {
    primary: ["acquisition-gate"],
    borrow: ["value-creation-plan"],
  },
};

const EARLY: Record<string, ChapterSkillSpec> = {
  "project-overview": { primary: ["project-intake"], borrow: ["startup-design"] },
  snapshot: {
    primary: ["project-intake", "classify-investment-theme"],
    borrow: ["startup-design"],
  },
  objectives: {
    primary: ["dd-claim-audit"],
    borrow: ["startup-design", "startup-pitch"],
  },
  industry: {
    primary: ["startup-design", "startup-competitors"],
    borrow: ["industry-due-diligence"],
  },
  legal: { primary: ["compliance-check"], borrow: ["dd-claim-audit"] },
  benchmarks: {
    primary: ["startup-competitors", "startup-positioning"],
    borrow: ["returns-analysis"],
  },
  business: {
    primary: ["startup-design"],
    borrow: ["business-due-diligence"],
  },
  returns: { primary: ["returns-analysis"], borrow: ["startup-design"] },
  capabilities: { primary: ["startup-design"], borrow: ["background-check"] },
  ownership: { primary: ["background-check"], borrow: [] },
  diligence: { primary: ["dd-checklist"], borrow: ["startup-design"] },
  risks: { primary: ["risk-matrix"], borrow: ["startup-design"] },
  questions: { primary: ["gap-tracking"], borrow: ["startup-design"] },
  framework: { primary: ["ic-memo"], borrow: ["startup-design"] },
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
