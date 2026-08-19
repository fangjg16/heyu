/**
 * 与 api-worker/src/chapter-skill-map.ts 保持一致。
 * 管理端展示「生成时会注入哪些分析方法」；MD 骨架本身不含 skill。
 */
export const CHAPTER_SKILL_MAP: Readonly<Record<string, readonly string[]>> = {
  "project-overview": ["project-intake"],
  snapshot: ["project-intake"],
  objectives: ["public-info-search", "dd-claim-audit"],
  industry: ["public-info-search"],
  legal: ["dd-claim-audit"],
  benchmarks: ["comp-analysis"],
  business: ["returns-analysis"],
  returns: ["returns-analysis", "sensitivity-analysis"],
  capabilities: ["public-info-search"],
  ownership: ["background-check"],
  diligence: ["dd-checklist"],
  risks: ["risk-matrix"],
  questions: ["gap-tracking"],
  framework: ["risk-matrix", "returns-analysis"],
};

export function skillsForChapter(sectionId: string): string[] {
  const id = (sectionId ?? "").trim();
  return [...(CHAPTER_SKILL_MAP[id] ?? [])];
}
