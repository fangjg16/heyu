/** 与 api-worker/src/chapter-skill-map.ts 保持一致：后台映射表的前端兜底。 */
import type { ChapterSkillMapDto, ChapterSkillSpecDto } from "@/lib/admin-skills-api";
import { researchSectionsForKind } from "@/lib/kn-catalog";

type Spec = ChapterSkillSpecDto;

const EMPTY: Spec = { primary: [], borrow: [] };

const DUE: Spec = { primary: ["due-diligence"], borrow: [] };
const DUE_INDUSTRY: Spec = {
  primary: ["due-diligence"],
  borrow: ["startup-competitors"],
};

const MATURE: Record<string, Spec> = {
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

const ACQUIRE: Record<string, Spec> = {
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

const EARLY: Record<string, Spec> = {
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
  strategy: { primary: ["startup-design", "startup-positioning"], borrow: [] },
  product: { primary: ["startup-design"], borrow: ["startup-pitch"] },
  financials: { primary: ["startup-design"], borrow: [] },
  validation: { primary: ["startup-design"], borrow: [] },
};

const BY_KIND: Record<string, Record<string, Spec>> = {
  early: EARLY,
  mature: MATURE,
  acquire: ACQUIRE,
};

const OVERVIEW = { id: "project-overview", label: "项目概览" };

function sectionsForKind(kind: string): { id: string; label: string }[] {
  return [OVERVIEW, ...researchSectionsForKind(kind as "early" | "mature" | "acquire")];
}

export const FALLBACK_CHAPTER_SKILL_MAP: ChapterSkillMapDto = {
  kinds: [
    { id: "early", label: "创业" },
    { id: "mature", label: "投资" },
    { id: "acquire", label: "收购经营" },
  ],
  sections: [
    OVERVIEW,
    ...researchSectionsForKind("early"),
    ...researchSectionsForKind("mature"),
    ...researchSectionsForKind("acquire"),
  ].filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i),
  sectionsByKind: {
    early: sectionsForKind("early"),
    mature: sectionsForKind("mature"),
    acquire: sectionsForKind("acquire"),
  },
  cells: Object.fromEntries(
    Object.entries(BY_KIND).map(([kind, table]) => [
      kind,
      Object.fromEntries(
        sectionsForKind(kind).map((s) => [s.id, table[s.id] ?? EMPTY]),
      ),
    ]),
  ),
};
