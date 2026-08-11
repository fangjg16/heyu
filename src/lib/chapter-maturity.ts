/** 章节 HTML 启发成熟度（0–100），不依赖结构化 KB */

export type ChapterMaturity = {
  score: number;
  note: string;
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * 基于本章 HTML 的轻量启发分：
 * - 无实质内容 → 0
 * - 「待补」占比高 → 拉低
 * - 已填单元格/段落、引用标记 → 加分
 */
export function computeChapterMaturity(html: string | null | undefined): ChapterMaturity {
  const raw = (html ?? "").trim();
  if (!raw) {
    return { score: 0, note: "尚无本章内容" };
  }

  const text = stripTags(raw);
  if (text.length < 8 || /^(待补|—|-)+$/u.test(text)) {
    return { score: 0, note: "尚无实质填充内容" };
  }

  const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/giu;
  let cells = 0;
  let filledCells = 0;
  let pendingCells = 0;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(raw))) {
    cells += 1;
    const t = stripTags(m[1] ?? "");
    if (!t || t === "—" || t === "-") {
      pendingCells += 1;
      continue;
    }
    if (/^待补[.。…]*$/u.test(t) || t.includes("待补")) {
      pendingCells += 1;
      continue;
    }
    filledCells += 1;
  }

  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/giu;
  let paras = 0;
  let filledParas = 0;
  let pendingParas = 0;
  while ((m = pRe.exec(raw))) {
    paras += 1;
    const t = stripTags(m[1] ?? "");
    if (!t) continue;
    if (/^待补[.。…]*$/u.test(t) || t === "—") {
      pendingParas += 1;
      continue;
    }
    filledParas += 1;
  }

  const citeCount = (raw.match(/\[[A-Za-z]-\d+\]/gu) ?? []).length;
  const pendingHits = (text.match(/待补/gu) ?? []).length;

  const unitTotal = Math.max(1, cells + paras);
  const unitFilled = filledCells + filledParas;
  const unitPending = pendingCells + pendingParas;
  const fillRatio = unitFilled / unitTotal;
  const pendingRatio = unitPending / unitTotal;

  let score = 18;
  score += fillRatio * 62;
  score -= pendingRatio * 38;
  score += Math.min(16, citeCount * 2.5);
  score -= Math.min(20, pendingHits * 1.5);

  // 几乎全是待补
  if (fillRatio < 0.08 && pendingRatio > 0.5) {
    score = Math.min(score, 12);
  }

  score = clamp(score);

  let note: string;
  if (score <= 0) {
    note = "尚无实质填充内容";
  } else if (score < 25) {
    note = "证据很少，大量「待补」，需优先补资料";
  } else if (score < 50) {
    note = `填充约 ${Math.round(fillRatio * 100)}%，仍有较多待补项`;
  } else if (score < 75) {
    note = `证据/填充约 ${Math.round(fillRatio * 100)}%，可继续补强引用`;
  } else {
    note = "本章填充较充分；仍建议核对引用与缺口";
  }

  return { score, note };
}

/**
 * 项目研究成熟度：13 章启发分均分（缺章按 0）。
 * 与 api-worker/src/chapter-maturity.ts 对齐。
 */
export function computeProjectResearchMaturity(
  chapterHtmlBySection: Iterable<{ sectionId: string; html: string }>,
  sectionCount = 13,
): number {
  const meta = new Set([
    "sources",
    "glossary",
    "versions",
    "project-overview",
    "project-graph",
  ]);
  const denom = Math.max(1, sectionCount);
  let sum = 0;
  for (const row of chapterHtmlBySection) {
    if (meta.has(row.sectionId)) continue;
    sum += computeChapterMaturity(row.html).score;
  }
  return clamp(sum / denom);
}

export function maturityScoreClass(score: number): string {
  if (score < 25) return "text-[#A06358]";
  if (score < 50) return "text-[#B07d1f]";
  return "text-[#3F6F63]";
}

/** 侧栏说明文案（对齐原型 slotState.note） */
export function maturitySidebarNote(hasContent: boolean): string {
  if (!hasContent) {
    return "关键项目资料仍缺失；当前内容只说明已知边界和待确认事项。";
  }
  return "成熟度反映本项研究的证据充分程度，不代表项目一定可投。";
}
