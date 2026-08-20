/**
 * 网页知识网络章节 → Hermes skill 方法来源。
 * 网页 Tab / 概览框架是权威；skill 只提供「怎么填这个格子」。
 * 生成时把方法拼进 callLlm；MD 模板仍是版式硬锁。
 */
export const CHAPTER_SKILL_MAP: Readonly<Record<string, readonly string[]>> = {
  "project-overview": ["project-intake", "node-monitoring"],
  snapshot: ["project-intake", "public-info-search"],
  objectives: ["public-info-search", "dd-claim-audit"],
  industry: ["public-info-search"],
  legal: ["dd-claim-audit"],
  benchmarks: ["comp-analysis"],
  business: ["public-info-search"],
  returns: ["returns-analysis", "sensitivity-analysis"],
  capabilities: ["public-info-search", "background-check"],
  ownership: ["background-check"],
  diligence: ["dd-checklist"],
  risks: ["risk-matrix"],
  questions: ["gap-tracking"],
  framework: ["value-creation-plan"],
};

export function skillsForChapter(sectionId: string): readonly string[] {
  const id = (sectionId ?? "").trim();
  return CHAPTER_SKILL_MAP[id] ?? [];
}
