/**
 * 网页知识网络章节 → Hermes skill 方法来源。
 * 生成时只把方法拼进 callLlm 提示词；MD 模板仍是版式硬锁。
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

export function skillsForChapter(sectionId: string): readonly string[] {
  const id = (sectionId ?? "").trim();
  return CHAPTER_SKILL_MAP[id] ?? [];
}
