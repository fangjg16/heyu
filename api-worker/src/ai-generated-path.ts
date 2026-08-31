/**
 * AI 产出落入资料树的稳定路径。
 * 同一路径再生成是新版本，不用日期文件夹。
 */
import { skillPackForName } from "./skill-packs";
import { INTENT_TO_SKILL } from "./skill-intent-map";
import type { SkillIntent } from "./chat-modes";

export type AiGeneratedPath = {
  pack: string;
  folder: string;
  filename: string;
  relativePath: string;
};

const INTENT_FOLDER: Record<string, { folder: string; filename: string }> = {
  startup_design: { folder: "00-intake", filename: "brief.md" },
  startup_competitors: { folder: "01-discovery", filename: "competitors.md" },
  startup_positioning: { folder: "02-strategy", filename: "positioning.md" },
  startup_pitch: { folder: "04-product", filename: "pitch.md" },
  project_intake: { folder: "00-intake", filename: "brief.md" },
  classify_investment_theme: {
    folder: "00-intake",
    filename: "theme.md",
  },
  industry_due_diligence: {
    folder: "01-industry",
    filename: "industry-due-diligence.md",
  },
  business_due_diligence: {
    folder: "02-business",
    filename: "business-due-diligence.md",
  },
  financial_due_diligence: {
    folder: "03-financials",
    filename: "financial-due-diligence.md",
  },
  background_check: { folder: "04-company", filename: "background-check.md" },
  compliance_check: { folder: "04-company", filename: "compliance-check.md" },
  returns_analysis: { folder: "05-decision", filename: "returns.md" },
  risk_matrix: { folder: "05-decision", filename: "risk-matrix.md" },
  ic_memo: {
    folder: "05-decision",
    filename: "investment-analysis-report.md",
  },
  value_creation_plan: {
    folder: "05-decision",
    filename: "value-creation-plan.md",
  },
  gap_tracking: { folder: "05-decision", filename: "gaps.md" },
  dd_checklist: { folder: "05-decision", filename: "dd-checklist.md" },
  dd_claim_audit: { folder: "05-decision", filename: "claim-audit.md" },
  acquisition_intake: { folder: "00-intake", filename: "intake.md" },
  target_screening: { folder: "01-screening", filename: "screening.md" },
  acquisition_due_diligence: {
    folder: "02-diligence",
    filename: "acquisition-due-diligence.md",
  },
  acquisition_economics: {
    folder: "03-economics",
    filename: "acquisition-economics.md",
  },
  buyer_fit_transition: { folder: "04-fit", filename: "buyer-fit.md" },
  acquisition_gate: {
    folder: "06-decision",
    filename: "acquisition-decision.md",
  },
  document_reorganize: { folder: "00-ops", filename: "file-index.md" },
  public_info_search: { folder: "00-ops", filename: "public-info.md" },
  term_annotator: { folder: "00-ops", filename: "glossary.md" },
  sensitivity_analysis: { folder: "00-ops", filename: "sensitivity.md" },
  node_monitoring: { folder: "00-ops", filename: "nodes.md" },
};

export const AI_GENERATED_ROOT = "AI生成";

export function aiGeneratedPathForIntent(
  intent: string,
): AiGeneratedPath | null {
  const key = (intent ?? "").trim();
  if (!key || key === "standard" || key === "knowledge_network") return null;
  const spec = INTENT_FOLDER[key];
  const skill =
    INTENT_TO_SKILL[key as Exclude<SkillIntent, "standard">] ?? key;
  const pack = skillPackForName(skill);
  const folder = spec?.folder ?? "00-misc";
  const filename = spec?.filename ?? `${skill.replace(/_/gu, "-")}.md`;
  return {
    pack,
    folder,
    filename,
    relativePath: `${AI_GENERATED_ROOT}/${pack}/${folder}`,
  };
}

export function interviewNotesPath(): AiGeneratedPath {
  return {
    pack: "startup",
    folder: "00-intake",
    filename: "interview-notes.md",
    relativePath: `${AI_GENERATED_ROOT}/startup/00-intake`,
  };
}
