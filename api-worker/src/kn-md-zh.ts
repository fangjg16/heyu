/**
 * 知识网络呈现层用的中文：标签、英文规范标题、夹杂在中文里的术语。
 * 不改资料包原文，只改页面上看到的字。
 */

const TAG_KIND_ZH: Record<string, string> = {
  data: "资料",
  opinion: "判断",
  assumption: "假设",
  gap: "缺口",
  estimate: "估算",
};

const PHRASES: Array<[RegExp, string]> = [
  [/\bSignificant concerns\b/giu, "重大疑虑"],
  [/\bRed Flags?\b/giu, "红旗"],
  [/\bYellow Flags?\b/giu, "黄旗"],
  [/\bAmber Flags?\b/giu, "黄旗"],
  [/\bStrongest evidence\b/giu, "最强证据"],
  [/\bWeakest links?\b/giu, "最弱环节"],
  [/\bExecutive View\b/giu, "总览"],
  [/\bCompetitive Overview\b/giu, "竞争全景"],
  [/\bCustomer Segments?\b/giu, "客户细分"],
  [/\bUnique Value Proposition\b/giu, "独特价值主张"],
  [/\bUnfair Advantage\b/giu, "不公平优势"],
  [/\bKey Metrics?\b/giu, "关键指标"],
  [/\bCost Structure\b/giu, "成本结构"],
  [/\bRevenue Streams?\b/giu, "收入来源"],
  [/\bPrimary persona\b/giu, "首要客群"],
  [/\bAnti-?persona\b/giu, "不服务谁"],
  [/\bTailwinds?\b/giu, "顺风"],
  [/\bHeadwinds?\b/giu, "逆风"],
  [/\bKill [Cc]riteria\b/giu, "停止标准"],
  [/\bMust[- ]Haves?\b/giu, "必须有"],
  [/\bShould[- ]Haves?\b/giu, "应该有"],
  [/\bCould[- ]Haves?\b/giu, "可以有"],
  [/\bWon'?t[- ]Haves?\b/giu, "明确不做"],
  [/\bSection confidence\b/giu, "本节把握"],
  [/\bCustomer Discovery\b/giu, "用户访谈"],
  [/\bMarket Research Synthesis\b/giu, "市场研究综合"],
  [/\bFinal Deliverable\b/giu, "终稿"],
  [/\bPlanning TAM\b/giu, "总市场"],
  [/\bPlanning SAM\b/giu, "可服务市场"],
  [/\bPlanning SOM\b/giu, "可获得份额"],
  [/\bGo\/No-Go\b/giu, "继续或停止"],
  [/\bCONDITIONAL\b/gu, "有条件继续"],
  [/\bVERDICT[:：]?\s*/gu, "判断："],
  [/\bRCT\b/gu, "对照试验"],
  [/\bFlags\b/gu, "风险标记"],
];

export function tagKindFromLabel(label: string): string {
  const k = (label.split(/[,，、/\s]/u)[0] ?? "").trim().toLowerCase();
  if (k === "data") return "data";
  if (k === "opinion") return "opinion";
  if (k === "assumption") return "assumption";
  if (k === "gap") return "gap";
  if (k === "estimate") return "estimate";
  return "";
}

export function localizeTagLabel(label: string): string {
  const parts = label
    .split(/[,，、/]/u)
    .map((p) => p.trim())
    .filter(Boolean);
  const head = parts[0] ?? "";
  const kind = TAG_KIND_ZH[head.toLowerCase()] ?? head;
  const rest = parts.slice(1).join(" · ");
  return rest ? `${kind} · ${rest}` : kind;
}

export function localizeKnText(s: string): string {
  let t = s;
  for (const [re, zh] of PHRASES) t = t.replace(re, zh);
  return t;
}

/** 方括号标签里的 Data/Opinion 留给标签解析，其余英文词先译。 */
export function localizeOutsideTags(s: string): string {
  return s.replace(/(\[[^\]]*\])|([^[]+)/gu, (_all, tag: string, rest: string) => {
    if (tag) return tag;
    return localizeKnText(rest ?? "");
  });
}

export function isEnglishHeavyMarkdown(md: string): boolean {
  const sample = md.slice(0, 4500);
  const letters = (sample.match(/[A-Za-z]/g) ?? []).length;
  const hans = (sample.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return letters >= 120 && letters > hans * 1.15;
}
