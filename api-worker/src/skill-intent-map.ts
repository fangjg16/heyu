import type { SkillIntent } from "./chat-modes";

/** 对话意图 → Hermes skill 目录名（不含 standard） */
export const INTENT_TO_SKILL: Record<
  Exclude<SkillIntent, "standard">,
  string
> = {
  project_intake: "project-intake",
  // 仅网页知识网络任务；对话检测到该意图会直接引导去项目页，不 invoke
  knowledge_network: "opportunistic-investments-hermes",
  ic_memo: "ic-memo",
  business_due_diligence: "business-due-diligence",
  industry_due_diligence: "industry-due-diligence",
  financial_due_diligence: "financial-due-diligence",
  acquisition_due_diligence: "acquisition-due-diligence",
  acquisition_intake: "acquisition-intake",
  target_screening: "target-screening",
  acquisition_economics: "acquisition-economics",
  acquisition_gate: "acquisition-gate",
  buyer_fit_transition: "buyer-fit-transition",
  startup_design: "startup-design",
  startup_competitors: "startup-competitors",
  startup_positioning: "startup-positioning",
  startup_pitch: "startup-pitch",
  classify_investment_theme: "classify-investment-theme",
  compliance_check: "compliance-check",
  dd_checklist: "dd-checklist",
  dd_claim_audit: "dd-claim-audit",
  document_reorganize: "document-reorganize",
  public_info_search: "public-info-search",
  term_annotator: "term-annotator",
  background_check: "background-check",
  risk_matrix: "risk-matrix",
  returns_analysis: "returns-analysis",
  sensitivity_analysis: "sensitivity-analysis",
  value_creation_plan: "value-creation-plan",
  gap_tracking: "gap-tracking",
  node_monitoring: "node-monitoring",
  skill_verify: "jfo-skill-verify",
};

const SKILL_TO_INTENT = new Map<string, SkillIntent>();
for (const [intent, skill] of Object.entries(INTENT_TO_SKILL)) {
  if (!SKILL_TO_INTENT.has(skill)) {
    SKILL_TO_INTENT.set(skill, intent as SkillIntent);
  }
}

export function skillNameToIntent(name: string): SkillIntent | null {
  return SKILL_TO_INTENT.get(name.trim()) ?? null;
}

/** skill 目录名 → 关联意图列表 */
export function skillToIntentsMap(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [intent, skill] of Object.entries(INTENT_TO_SKILL)) {
    if (!out[skill]) out[skill] = [];
    out[skill].push(intent);
  }
  return out;
}
