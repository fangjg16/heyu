/** 与 api-worker/src/chapter-skill-map.ts 保持一致：后台映射表的前端兜底。 */
import type { ChapterSkillMapDto, ChapterSkillSpecDto } from "@/lib/admin-skills-api";

type Spec = ChapterSkillSpecDto;

const EMPTY: Spec = { primary: [], borrow: [] };

const MATURE: Record<string, Spec> = {
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

const ACQUIRE: Record<string, Spec> = {
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

const EARLY: Record<string, Spec> = {
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

const BY_KIND: Record<string, Record<string, Spec>> = {
  early: EARLY,
  mature: MATURE,
  acquire: ACQUIRE,
};

const SECTIONS: { id: string; label: string }[] = [
  { id: "project-overview", label: "项目概览" },
  { id: "snapshot", label: "项目快照" },
  { id: "objectives", label: "标的概况" },
  { id: "industry", label: "行业分析" },
  { id: "legal", label: "合规分析" },
  { id: "benchmarks", label: "对标分析" },
  { id: "business", label: "业务模式" },
  { id: "returns", label: "财务与回报" },
  { id: "capabilities", label: "资源网络" },
  { id: "ownership", label: "背景调查" },
  { id: "diligence", label: "尽职调查" },
  { id: "risks", label: "风险矩阵" },
  { id: "questions", label: "待确认问题" },
  { id: "framework", label: "决策路径与法律结构" },
];

export const FALLBACK_CHAPTER_SKILL_MAP: ChapterSkillMapDto = {
  kinds: [
    { id: "early", label: "早期" },
    { id: "mature", label: "成熟投资" },
    { id: "acquire", label: "收购经营" },
  ],
  sections: SECTIONS,
  cells: Object.fromEntries(
    Object.entries(BY_KIND).map(([kind, table]) => [
      kind,
      Object.fromEntries(
        SECTIONS.map((s) => [s.id, table[s.id] ?? EMPTY]),
      ),
    ]),
  ),
};
