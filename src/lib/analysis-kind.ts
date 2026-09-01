export const ANALYSIS_KINDS = ["early", "mature", "acquire"] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];

export const DEFAULT_ANALYSIS_KIND: AnalysisKind = "mature";

export const ANALYSIS_KIND_LABELS: Record<AnalysisKind, string> = {
  early: "创业",
  mature: "投资",
  acquire: "收购经营",
};

export const ANALYSIS_KIND_DESCRIPTIONS: Record<AnalysisKind, string> = {
  early: "从零验证产品与市场，可做用户访谈。没有项目协作工作台。",
  mature: "对已在运转的经营体做尽调与投资研究。",
  acquire: "交易目的是买下来过手经营（控股收购、接手）。",
};

/** 表单展示顺序：家办默认先看投资。 */
export const ANALYSIS_KIND_OPTIONS: {
  id: AnalysisKind;
  label: string;
  description: string;
}[] = [
  {
    id: "mature",
    label: ANALYSIS_KIND_LABELS.mature,
    description: ANALYSIS_KIND_DESCRIPTIONS.mature,
  },
  {
    id: "early",
    label: ANALYSIS_KIND_LABELS.early,
    description: ANALYSIS_KIND_DESCRIPTIONS.early,
  },
  {
    id: "acquire",
    label: ANALYSIS_KIND_LABELS.acquire,
    description: ANALYSIS_KIND_DESCRIPTIONS.acquire,
  },
];

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

export function analysisKindLabel(raw: unknown): string {
  const kind = parseAnalysisKind(raw);
  return kind ? ANALYSIS_KIND_LABELS[kind] : "未选定";
}
