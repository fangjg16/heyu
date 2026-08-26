import { CHAPTER_SKILL_SECTIONS } from "./chapter-skill-map";
import {
  RESEARCH_CHAPTER_IDS,
  formatChapterVersionLabel,
} from "./chapter-version";

const PER_CHAPTER_CHARS = 2_800;

function compactChapterHtml(html: string, maxChars: number): string {
  const compact = html
    .replace(/<script\b[\s\S]*?<\/script>/giu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)}\n…(截断)`;
}

export function buildKnowledgeNetworkSourceBlock(input: {
  version: number;
  chapters: { sectionId: string; html?: string | null }[];
}): { block: string; hasResearch: boolean } {
  const byId = new Map(
    input.chapters.map((c) => [c.sectionId, (c.html ?? "").trim()] as const),
  );
  const parts: string[] = [];
  for (const id of RESEARCH_CHAPTER_IDS) {
    const html = byId.get(id) ?? "";
    if (!html) continue;
    const label =
      CHAPTER_SKILL_SECTIONS.find((s) => s.id === id)?.label ?? id;
    parts.push(`### ${label}（${id}）\n${compactChapterHtml(html, PER_CHAPTER_CHARS)}`);
  }
  if (parts.length === 0) {
    return {
      hasResearch: false,
      block: [
        "【当前知识网络正式版】",
        "（尚无已发布研究章节。可暂按附件填写并标「待补」；知识网络发布后再更新概览以对齐。）",
      ].join("\n"),
    };
  }
  return {
    hasResearch: true,
    block: [
      `【当前知识网络正式版 ${formatChapterVersionLabel(input.version)}】`,
      "以下为已发布的 13 个研究章节正文。项目概览必须根据这些内容填写模板：保留现有概览版式（成熟度、判断/下一步/风险卡、时间轴、关系图槽），不要扩写成研究长文，也不要把 13 章原文粘进概览。知识网络未覆盖处标「待补」。",
      "",
      ...parts,
    ].join("\n"),
  };
}
