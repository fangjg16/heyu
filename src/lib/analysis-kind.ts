export const ANALYSIS_KINDS = ["early", "mature", "acquire"] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];

export const DEFAULT_ANALYSIS_KIND: AnalysisKind = "mature";

export const ANALYSIS_KIND_LABELS: Record<AnalysisKind, string> = {
  early: "创业",
  mature: "财务投资",
  acquire: "收购",
};

export function parseAnalysisKind(raw: unknown): AnalysisKind | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "early" || v === "mature" || v === "acquire") return v;
  if (v === "startup" || v === "idea" || v === "seed") return "early";
  if (v === "buy-to-build" || v === "acquisition" || v === "eta") {
    return "acquire";
  }
  if (v === "capitallens" || v === "investment") return "mature";
  return null;
}

export function resolveAnalysisKind(raw: unknown): AnalysisKind {
  return parseAnalysisKind(raw) ?? DEFAULT_ANALYSIS_KIND;
}
