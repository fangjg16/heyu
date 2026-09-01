/**
 * 项目形态由创建/编辑时选定，生成章节时只读取、不改写。
 * early = 创业（用户访谈；无项目协作工作台）
 * acquire = 买下来过手经营
 * mature = 运转中经营体上的投资 / 尽调
 */
import type { AppDatabase } from "./app-database";
import { callLlm, type LlmClientEnv } from "./llm-client";

export const ANALYSIS_KINDS = ["early", "mature", "acquire"] as const;
export type AnalysisKind = (typeof ANALYSIS_KINDS)[number];

export const DEFAULT_ANALYSIS_KIND: AnalysisKind = "mature";

export const ANALYSIS_KIND_LABELS: Readonly<Record<AnalysisKind, string>> = {
  early: "创业",
  mature: "投资",
  acquire: "收购经营",
};

export const ANALYSIS_KIND_DESCRIPTIONS: Readonly<
  Record<AnalysisKind, string>
> = {
  early: "从零验证产品与市场，可做用户访谈。没有项目协作工作台。",
  mature: "对已在运转的经营体做尽调与投资研究。",
  acquire: "交易目的是买下来过手经营（控股收购、接手）。",
};

export const ANALYSIS_KIND_OPTIONS: readonly {
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

export function parseAnalysisKindFromModel(answer: string): AnalysisKind {
  const t = String(answer ?? "").trim();
  const line = t.split(/\r?\n/u)[0] ?? "";
  const word = line
    .replace(/[`"'.*:_-]/gu, " ")
    .trim()
    .split(/\s+/u)[0];
  return parseAnalysisKind(word) ?? DEFAULT_ANALYSIS_KIND;
}

const KIND_COL_MISSING =
  /Unknown column ['`]?analysis_kind['`]?|no such column:\s*analysis_kind/i;

export async function getStoredAnalysisKind(
  db: AppDatabase,
  projectId: string,
): Promise<AnalysisKind | null> {
  try {
    const row = await db
      .prepare(`SELECT analysis_kind FROM projects WHERE id = ?`)
      .bind(projectId)
      .first<{ analysis_kind: string | null }>();
    return parseAnalysisKind(row?.analysis_kind);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    if (KIND_COL_MISSING.test(msg)) return null;
    throw e;
  }
}

export async function saveAnalysisKind(
  db: AppDatabase,
  projectId: string,
  kind: AnalysisKind,
): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE projects SET analysis_kind = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(kind, new Date().toISOString(), projectId)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "");
    if (KIND_COL_MISSING.test(msg)) return;
    throw e;
  }
}

const CLASSIFY_SYSTEM = `你判断家办投资项目的形态。只输出一个英文词，不要解释。
early = 创业/极早期/idea，或已有公司但客户、交付、财务仍主要靠叙事，PMF 未钉住。
acquire = 交易目的是买下来过手经营（控股收购、接手、买下来自己开）。
mature = 已经在运转的经营体上的投资（少数股权、成长期但仍有稳定交付/财务可核对）。尽调标的一律 mature，不因名字含 AI/剧本/创业而改判。
有公司名字不等于 mature。买股权不等于 acquire。`;

/** 仅供排查；生成路径不得调用，以免覆盖用户选定的形态。 */
export async function inferAnalysisKindFromDigest(
  env: LlmClientEnv,
  digest: string,
): Promise<AnalysisKind> {
  const excerpt = String(digest ?? "").trim().slice(0, 8000);
  const user = excerpt
    ? `根据下列项目资料判断形态：\n${excerpt}`
    : "资料很少。若看不出收购或早期迹象，输出 mature。";
  try {
    const { answer } = await callLlm(env, [
      { role: "system", content: CLASSIFY_SYSTEM },
      { role: "user", content: user },
    ]);
    return parseAnalysisKindFromModel(answer);
  } catch {
    return DEFAULT_ANALYSIS_KIND;
  }
}

/** 已落库的形态一律沿用。未选定则按投资生成，不写回、不重判。 */
export async function ensureAnalysisKind(
  env: { DB: AppDatabase } & Partial<LlmClientEnv>,
  projectId: string,
  _digest?: string,
  _opts?: { refresh?: boolean },
): Promise<AnalysisKind> {
  const stored = await getStoredAnalysisKind(env.DB, projectId);
  return stored ?? DEFAULT_ANALYSIS_KIND;
}
