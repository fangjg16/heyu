import type { AnalysisKind } from "./analysis-kind";
import { DEFAULT_ANALYSIS_KIND } from "./analysis-kind";
import {
  researchSectionIdsForKind,
  sectionLabel,
} from "./kn-catalog";
import { formatChapterVersionLabel } from "./chapter-version";

const PER_CHAPTER_CHARS = 2_800;
const SKIP_IDS = new Set([
  "project-overview",
  "sources",
  "glossary",
  "project-graph",
]);

function compactChapterHtml(html: string, maxChars: number): string {
  const compact = html
    .replace(/<script\b[\s\S]*?<\/script>/giu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)}\n…(截断)`;
}

function orderedResearchIds(
  kind: AnalysisKind,
  chapters: { sectionId: string; html?: string | null }[],
): string[] {
  const catalog = researchSectionIdsForKind(kind);
  const seen = new Set(catalog);
  const extra: string[] = [];
  for (const c of chapters) {
    const id = c.sectionId;
    if (!id || SKIP_IDS.has(id) || seen.has(id)) continue;
    if (!(c.html ?? "").trim()) continue;
    seen.add(id);
    extra.push(id);
  }
  return [...catalog, ...extra];
}

export function mergeChaptersPreferringDraft(
  live: { sectionId: string; html?: string | null }[],
  drafts: { sectionId: string; status: string; html?: string | null }[],
): { sectionId: string; html?: string | null }[] {
  const byId = new Map(
    live.map((c) => [c.sectionId, { sectionId: c.sectionId, html: c.html }]),
  );
  for (const d of drafts) {
    if (d.status !== "ok") continue;
    const html = (d.html ?? "").trim();
    if (!html) continue;
    byId.set(d.sectionId, { sectionId: d.sectionId, html });
  }
  return [...byId.values()];
}

export function buildKnowledgeNetworkSourceBlock(input: {
  version: number;
  chapters: { sectionId: string; html?: string | null }[];
  analysisKind?: AnalysisKind | null;
  fromDraft?: boolean;
}): { block: string; hasResearch: boolean } {
  const kind = input.analysisKind ?? DEFAULT_ANALYSIS_KIND;
  const byId = new Map(
    input.chapters.map((c) => [c.sectionId, (c.html ?? "").trim()] as const),
  );
  const parts: string[] = [];
  for (const id of orderedResearchIds(kind, input.chapters)) {
    const html = byId.get(id) ?? "";
    if (!html) continue;
    parts.push(
      `### ${sectionLabel(id, kind)}（${id}）\n${compactChapterHtml(html, PER_CHAPTER_CHARS)}`,
    );
  }
  if (parts.length === 0) {
    return {
      hasResearch: false,
      block: [
        input.fromDraft
          ? "【当前知识网络（本轮研究草案优先）】"
          : "【当前知识网络正式版】",
        "（尚无研究章节。可暂按附件填写并标「待补」；研究章生成后再更新概览以对齐。）",
      ].join("\n"),
    };
  }
  return {
    hasResearch: true,
    block: [
      input.fromDraft
        ? `【当前知识网络（本轮研究草案优先）${formatChapterVersionLabel(input.version)}】`
        : `【当前知识网络正式版 ${formatChapterVersionLabel(input.version)}】`,
      "以下为研究章节正文。项目概览必须根据这些内容填写模板：保留现有概览版式（成熟度、判断/下一步/风险卡、时间轴、关系图槽），不要扩写成研究长文，也不要把各章原文粘进概览。知识网络未覆盖处标「待补」。",
      "",
      ...parts,
    ].join("\n"),
  };
}
