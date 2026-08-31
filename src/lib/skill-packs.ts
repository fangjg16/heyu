/** 与 api-worker/src/skill-packs.ts 保持一致。 */

export const SKILL_PACKS = [
  { id: "startup", label: "创业" },
  { id: "capitallens", label: "财务投资" },
  { id: "buy-to-build", label: "收购" },
  { id: "platform", label: "平台共用" },
] as const;

export type SkillPackId = (typeof SKILL_PACKS)[number]["id"];

const STARTUP = [
  "startup-design",
  "startup-competitors",
  "startup-positioning",
  "startup-pitch",
] as const;

const CAPITALENS = [
  "project-intake",
  "classify-investment-theme",
  "industry-due-diligence",
  "business-due-diligence",
  "financial-due-diligence",
  "background-check",
  "compliance-check",
  "returns-analysis",
  "risk-matrix",
  "ic-memo",
  "value-creation-plan",
  "gap-tracking",
  "dd-checklist",
  "dd-claim-audit",
] as const;

const BUY_TO_BUILD = [
  "acquisition-intake",
  "target-screening",
  "acquisition-due-diligence",
  "acquisition-economics",
  "buyer-fit-transition",
  "acquisition-gate",
] as const;

const PACK_SKILLS: Record<Exclude<SkillPackId, "platform">, readonly string[]> = {
  startup: STARTUP,
  capitallens: CAPITALENS,
  "buy-to-build": BUY_TO_BUILD,
};

const PACK_BY_SKILL = new Map<string, SkillPackId>();
for (const [pack, names] of Object.entries(PACK_SKILLS) as Array<
  [Exclude<SkillPackId, "platform">, readonly string[]]
>) {
  for (const name of names) PACK_BY_SKILL.set(name, pack);
}

export function skillPackForName(name: string): SkillPackId {
  return PACK_BY_SKILL.get(name.trim()) ?? "platform";
}

export function skillPackLabel(id: SkillPackId): string {
  return SKILL_PACKS.find((p) => p.id === id)?.label ?? id;
}
