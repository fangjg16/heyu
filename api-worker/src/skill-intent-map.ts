import type { SkillIntent } from "./chat-modes";

/** 对话意图 → Hermes skill 目录名（不含 standard） */
export const INTENT_TO_SKILL: Record<
  Exclude<SkillIntent, "standard">,
  string
> = {
  project_intake: "project-intake",
  knowledge_network: "opportunistic-investments-hermes",
  ic_memo: "ic-memo",
  dd_checklist: "dd-checklist",
  dd_claim_audit: "dd-claim-audit",
  document_reorganize: "document-reorganize",
  public_info_search: "public-info-search",
  term_annotator: "term-annotator",
  comp_analysis: "comp-analysis",
  background_check: "background-check",
  risk_matrix: "risk-matrix",
  returns_analysis: "returns-analysis",
  sensitivity_analysis: "sensitivity-analysis",
  value_creation_plan: "value-creation-plan",
  gap_tracking: "gap-tracking",
  node_monitoring: "node-monitoring",
  skill_verify: "jfo-skill-verify",
};

/** skill 目录名 → 关联意图列表 */
export function skillToIntentsMap(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [intent, skill] of Object.entries(INTENT_TO_SKILL)) {
    if (!out[skill]) out[skill] = [];
    out[skill].push(intent);
  }
  return out;
}
