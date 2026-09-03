/**
 * 把合域这类 startup 总文件里能对上的块，收成知识网络现成元件。
 * 正文仍按 Markdown 渲；这些块叠在章节顶部当「一眼能看的版式」。
 */

import { localizeKnText } from "./kn-md-zh";

function escapeHtml(s: string): string {
  return s
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function stripInlineMd(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/\[(?:Data|Opinion|Assumption|Gap|Estimate|Founder decision|Unknown|Required)[^\]]*\]/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function clip(s: string, n = 88): string {
  const t = stripInlineMd(s);
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}…`;
}

export function splitMarkdownH2(
  md: string,
): Array<{ title: string; body: string }> {
  const src = md.replace(/^\uFEFF/, "").trim();
  const parts = src.split(/^(?=## )/mu);
  const out: Array<{ title: string; body: string }> = [];
  for (const part of parts) {
    const m = /^## ([^\n]+)\r?\n?([\s\S]*)$/u.exec(part.trim());
    if (!m) continue;
    out.push({ title: (m[1] ?? "").trim(), body: (m[2] ?? "").trim() });
  }
  return out;
}

function normTitle(title: string): string {
  return title
    .replace(/^\d+\.\s+/u, "")
    .replace(/^[一二三四五六七八九十]+、/u, "")
    .trim();
}

function sectionBy(
  sections: Array<{ title: string; body: string }>,
  re: RegExp,
): string {
  const hit = sections.find((s) => re.test(normTitle(s.title)));
  return hit?.body ?? "";
}

export function splitMarkdownHeadings(
  md: string,
): Array<{ title: string; body: string; level: number }> {
  const src = md.replace(/^\uFEFF/, "").trim();
  const parts = src.split(/^(?=#{2,6} )/mu);
  const out: Array<{ title: string; body: string; level: number }> = [];
  for (const part of parts) {
    const m = /^(#{2,6}) ([^\n]+)\r?\n?([\s\S]*)$/u.exec(part.trim());
    if (!m) continue;
    out.push({
      level: m[1]!.length,
      title: (m[2] ?? "").trim(),
      body: (m[3] ?? "").trim(),
    });
  }
  return out;
}

function headingBody(md: string, re: RegExp): string {
  const all = splitMarkdownHeadings(md);
  const i = all.findIndex((s) => re.test(normTitle(s.title)));
  if (i < 0) return "";
  const start = all[i]!;
  const parts = [start.body];
  for (let j = i + 1; j < all.length; j += 1) {
    if (all[j]!.level <= start.level) break;
    parts.push(`${"#".repeat(all[j]!.level)} ${all[j]!.title}\n${all[j]!.body}`);
  }
  return parts.join("\n\n").trim();
}

function bodyItems(body: string, max = 5): string[] {
  if (!body.trim()) return [];
  const tables = parseTables(body);
  if (tables[0]?.rows.length) {
    return tables[0]!.rows
      .slice(0, max)
      .map((r) => clip(r[0] ?? "", 72))
      .filter(Boolean);
  }
  return compactItems(body, max);
}

function splitHtml(
  leftTitle: string,
  left: string[],
  rightTitle: string,
  right: string[],
  leftKind: "stop" | "go" | "" = "stop",
  rightKind: "stop" | "go" | "" = "go",
): string {
  if (left.length === 0 || right.length === 0) return "";
  const lcls = leftKind ? ` kn-split__col--${leftKind}` : "";
  const rcls = rightKind ? ` kn-split__col--${rightKind}` : "";
  return `<div class="kn-split"><div class="kn-split__col${lcls}"><div class="kn-split__title">${escapeHtml(leftTitle)}</div>${itemsUl(left)}</div><div class="kn-split__col${rcls}"><div class="kn-split__title">${escapeHtml(rightTitle)}</div>${itemsUl(right)}</div></div>`;
}

function isPipeJunk(s: string): boolean {
  const t = s.replace(/\s+/gu, "");
  if (!t) return true;
  if (/^[\|\-:]+$/u.test(t)) return true;
  const bars = (t.match(/\|/gu) ?? []).length;
  return bars >= 3 && /-{3,}/u.test(t);
}

function tableLeadItems(body: string, max = 4): string[] {
  const table = parseTables(body)[0];
  if (!table?.rows.length) return [];
  return table.rows
    .slice(0, max)
    .map((row) => {
      const cells = row
        .map((c) => stripInlineMd(c))
        .filter((c) => c && !/^[-:|\s]+$/u.test(c));
      if (cells.length === 0) return "";
      if (cells.length === 1) return clip(cells[0]!, 160);
      return clip(`${cells[0]} · ${cells.slice(1, 3).join(" · ")}`, 180);
    })
    .filter((s) => s && !isPipeJunk(s));
}

function compactItems(body: string, max = 4): string[] {
  if (!body.trim()) return [];
  const fromTable = tableLeadItems(body, max);
  const proseSrc = body.replace(/^\s*\|.*$/gmu, "").trim();
  const h3 = [...proseSrc.matchAll(/^#{2,6}\s+(.+)$/gmu)].map((m) =>
    clip(m[1] ?? "", 72),
  );
  const bullets = [...proseSrc.matchAll(/^[-*]\s+(.+)$/gmu)]
    .map((m) => clip(m[1] ?? "", 160))
    .filter((s) => !isPipeJunk(s));
  const nums = [...proseSrc.matchAll(/^\d+[.)]\s+(.+)$/gmu)]
    .map((m) => clip(m[1] ?? "", 160))
    .filter((s) => !isPipeJunk(s));
  const para = proseSrc
    .split(/\n\s*\n/u)
    .map((p) => clip(p.replace(/^>\s?/gmu, ""), 160))
    .filter((s) => s && !isPipeJunk(s));
  const prose =
    h3.length >= 2
      ? h3
      : bullets.length > 0
        ? bullets
        : nums.length > 0
          ? nums
          : para.slice(0, 2);
  if (fromTable.length) {
    return [...prose.slice(0, 1), ...fromTable].slice(0, max);
  }
  return prose.slice(0, max);
}

function itemsUl(items: string[]): string {
  if (items.length === 0) return "<ul><li>待补</li></ul>";
  return `<ul>${items.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}</ul>`;
}

type MdTable = { headers: string[]; rows: string[][] };

function parseTables(md: string): MdTable[] {
  const lines = md.split(/\r?\n/u);
  const tables: MdTable[] = [];
  const isSep = (line: string) =>
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/u, "")
      .replace(/\|$/u, "")
      .split("|")
      .map((c) => c.trim());
  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? "").trim();
    if (line.startsWith("|") && i + 1 < lines.length && isSep(lines[i + 1] ?? "")) {
      const headers = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push(cells((lines[i] ?? "").trim()));
        i += 1;
      }
      tables.push({ headers, rows });
      continue;
    }
    i += 1;
  }
  return tables;
}

function colIndex(headers: string[], re: RegExp): number {
  return headers.findIndex((h) => re.test(h));
}

const CANVAS_SLOTS: Array<{
  label: string;
  re: RegExp;
  cls: string;
}> = [
  { label: "问题", re: /^problem$|^问题/iu, cls: "" },
  { label: "方案", re: /solution|方案/iu, cls: "" },
  {
    label: "价值主张",
    re: /unique value|价值主张|uvp/iu,
    cls: "kn-canvas__cell--accent kn-canvas__cell--span2",
  },
  { label: "不公平优势", re: /unfair|不公平优势/iu, cls: "" },
  { label: "客群", re: /customer segment|客群|客户细分/iu, cls: "kn-canvas__cell--span2" },
  { label: "关键指标", re: /key metric|关键指标/iu, cls: "" },
  { label: "渠道", re: /^channels?$|^渠道/iu, cls: "" },
  { label: "成本", re: /cost structure|^成本/iu, cls: "" },
  { label: "收入", re: /revenue|^收入/iu, cls: "" },
];

export function renderLeanCanvasLead(md: string): string {
  const filled = CANVAS_SLOTS.filter((slot) => headingBody(md, slot.re));
  if (filled.length < 6) return "";
  const cells = CANVAS_SLOTS.map((slot) => {
    const body = headingBody(md, slot.re);
    const extra = slot.cls ? ` ${slot.cls}` : "";
    return `<div class="kn-canvas__cell${extra}"><div class="kn-canvas__label">${escapeHtml(slot.label)}</div>${itemsUl(compactItems(body, 3))}</div>`;
  }).join("");
  return `<div class="kn-canvas">${cells}</div>`;
}

export function renderBattleCardsLead(md: string): string {
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const name = colIndex(t.headers, /name|^名称|^对手|^竞品/iu);
    const str = colIndex(t.headers, /strength|优势|差异|强项/iu);
    const weak = colIndex(t.headers, /weakness|缺口|弱点|劣势|弱项/iu);
    return name >= 0 && str >= 0 && weak >= 0 && t.rows.length >= 2;
  });
  if (!table) return "";
  const nameI = colIndex(table.headers, /name|^名称|^对手|^竞品/iu);
  const strI = colIndex(table.headers, /strength|优势|差异|强项/iu);
  const weakI = colIndex(table.headers, /weakness|缺口|弱点|劣势|弱项/iu);
  const cards = table.rows.slice(0, 8).map((row) => {
    const name = clip(row[nameI] ?? "", 40);
    const diff = clip(row[strI] ?? "", 96);
    const play = clip(row[weakI] ?? "", 96);
    return `<div class="kn-battle"><div class="kn-battle__name">${escapeHtml(name)}</div><div class="kn-battle__row"><span class="kn-battle__k">差异 · </span>${escapeHtml(diff)}</div><div class="kn-battle__row"><span class="kn-battle__k">可打 · </span>${escapeHtml(play)}</div></div>`;
  });
  if (cards.length === 0) return "";
  return `<div class="kn-battles">${cards.join("")}</div>`;
}

function heroTone(note: string): "concern" | "caution" | "go" | "" {
  if (/重大疑虑|significant concerns|不宜|停止|红灯/iu.test(note)) {
    return "concern";
  }
  if (/有条件|conditional|黄灯|调整/iu.test(note)) return "caution";
  if (/可以继续|绿灯|(?:^|\s)go\b/iu.test(note)) return "go";
  return "";
}

export function scoreHeroHtml(
  score: string,
  note: string,
  variant: "lead" | "inline" = "lead",
): string {
  const tone = heroTone(note);
  const toneCls = tone ? ` kn-hero--${tone}` : "";
  const varCls = variant === "inline" ? " kn-hero--inline" : "";
  const verdict = note.trim()
    ? `<span class="kn-hero__verdict">${escapeHtml(note)}</span>`
    : "";
  return `<div class="kn-hero${varCls}${toneCls}"><div class="kn-hero__value">${escapeHtml(score)}<span class="kn-hero__den">/10</span></div><div class="kn-hero__meta">${verdict}</div></div>`;
}

export function renderScoreHeroLead(md: string): string {
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const dim = colIndex(t.headers, /dimension|维度/iu);
    const score = colIndex(t.headers, /score|分数|评分|得分/iu);
    return dim >= 0 && score >= 0;
  });
  let score = "";
  if (table) {
    const dimI = colIndex(table.headers, /dimension|维度/iu);
    const scoreI = colIndex(table.headers, /score|分数|评分|得分/iu);
    const overall =
      table.rows.find((r) => /overall|综合|总分/iu.test(r[dimI] ?? "")) ??
      table.rows[table.rows.length - 1];
    score = stripInlineMd(overall?.[scoreI] ?? "").replace(/[^\d.]/gu, "");
  }
  if (!score) score = scoreFromProse(md);
  if (!score) return "";
  const verdict =
    /（([^）]*(?:concerns|疑虑|有条件|继续)[^）]*)）/iu.exec(md)?.[1]?.trim() ??
    /VERDICT[:：]?\s*([^\n*]+)/iu.exec(md)?.[1]?.trim() ??
    /^\*\*总评[:：]\*\*\s*(.+)$/mu.exec(md)?.[1]?.trim();
  const note = verdict
    ? clip(localizeKnText(verdict).replace(/有条件继续\s*[—–-]\s*有条件继续。?/u, "有条件继续"), 80)
    : "综合评分";
  return scoreHeroHtml(score, note);
}

function scoreFromProse(md: string): string {
  const m =
    /\*\*综合可靠度评分[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*10[^*]*\*\*/u.exec(md) ??
    /综合可靠度评分[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*10/u.exec(md) ??
    /\*\*可靠度评分[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*10[^*]*\*\*/u.exec(md);
  return m?.[1] ?? "";
}

export function renderPositionSplitLead(md: string): string {
  const alt =
    headingBody(md, /competitive alternative|替代方案|若不存在会用什么替代|^替代/iu);
  const uniq = headingBody(
    md,
    /unique attribute|独有|差异化属性|独特属性/iu,
  );
  if (!alt || !uniq) return "";
  const altItems = tableLeadItems(alt, 6);
  const uniqItems = tableLeadItems(uniq, 6);
  const altFinal = altItems.length ? altItems : compactItems(alt, 5);
  const uniqFinal = uniqItems.length ? uniqItems : compactItems(uniq, 5);
  if (altFinal.length === 0 || uniqFinal.length === 0) return "";
  return `<div class="kn-split"><div class="kn-split__col kn-split__col--stop"><div class="kn-split__title">替代方案</div>${itemsUl(altFinal)}</div><div class="kn-split__col kn-split__col--go"><div class="kn-split__title">我们独有</div>${itemsUl(uniqFinal)}</div></div>`;
}

function collectJourneyMatches(md: string): RegExpMatchArray[] {
  const fromHead = [
    ...md.matchAll(
      /^#{2,6}\s+(?:Journey|旅程|阶段|Step|步骤)\s*(\d+)\s*(?:[—–:：-]\s*)?(.*)$/gmu,
    ),
  ];
  if (fromHead.length >= 2) return fromHead;
  const fromBold = [
    ...md.matchAll(
      /^\*\*(?:Step|步骤|Journey|旅程)\s*(\d+)\s*[—–:：-]\s*([^*]+)\*\*$/gmu,
    ),
  ];
  return fromBold.length >= 2 ? fromBold : fromHead;
}

function looksLikeLoop(md: string, names: string[]): boolean {
  const blob = names.join(" ");
  const hits = [
    /邀请/u,
    /完结|回收/u,
    /知识网络/u,
    /观察/u,
    /回写|再邀请|再来/u,
    /可分享版本|选择项目/u,
  ].filter((re) => re.test(blob)).length;
  if (hits >= 2) return true;
  return (
    /启动动作|Activation(?:\s+Motion)?/iu.test(md) &&
    hits >= 1 &&
    names.length >= 5
  );
}

function looksLikeOpsTasks(titles: string[]): boolean {
  return (
    titles.filter((t) =>
      /完成|推进|关注|要求|披露|BOM|预付|对照试验|巨头/u.test(t),
    ).length >= 2
  );
}

function collectLoopStations(
  md: string,
): Array<{ name: string; note: string; focal: boolean }> {
  const stepMatches = collectJourneyMatches(md).filter((m) =>
    /Step|步骤/iu.test(m[0] ?? ""),
  );
  let raw: Array<{ name: string; note: string }> = [];
  if (stepMatches.length >= 5 && stepMatches.length <= 8) {
    raw = stepMatches.map((m) => {
      const title = localizeKnText((m[2] ?? "").trim());
      const [who, what] = title.split(/：|:\s*/u, 2);
      return { name: clip(who || title, 16), note: clip(what || "", 22) };
    });
  } else if (!/对策|Mitigation/iu.test(md)) {
    const bold = [...md.matchAll(/^(\d+)[.)]\s+\*\*([^*]+)\*\*/gmu)];
    if (bold.length >= 5 && bold.length <= 8) {
      raw = bold.map((m) => ({
        name: clip(localizeKnText(m[2] ?? ""), 16),
        note: "",
      }));
    }
  }
  if (raw.length < 5 || raw.length > 8) return [];
  if (looksLikeOpsTasks(raw.map((s) => `${s.name} ${s.note}`))) return [];
  if (!looksLikeLoop(md, raw.map((s) => `${s.name} ${s.note}`))) return [];
  const focalIdx = raw.findIndex((s) =>
    /观察|真实行为|Decide|审批/u.test(s.name),
  );
  const focalAt = focalIdx >= 0 ? focalIdx : -1;
  return raw.map((s, i) => ({ ...s, focal: i === focalAt }));
}

function hasMultiPersonaJourney(md: string): boolean {
  if (!/五个角色|Journey Scope|旅程范围/iu.test(md)) return false;
  return (
    [
      /项目管理员/u,
      /\bCore\b|核心成员/u,
      /\bBasic\b|只读/u,
      /协作方/u,
      /系统管理员/u,
    ].filter((re) => re.test(md)).length >= 3
  );
}

export function renderJourneyLead(md: string): string {
  const journeys = collectJourneyMatches(md);
  if (journeys.length < 2) return "";
  if (collectLoopStations(md).length >= 5) return "";
  if (hasMultiPersonaJourney(md)) return "";
  if (renderJourneyMapLead(md)) return "";
  const sections = splitMarkdownHeadings(md);
  const prepared = journeys.slice(0, 6).map((m) => {
    const n = m[1] ?? "";
    const raw = localizeKnText((m[2] ?? "").trim());
    const [who, what] = raw.split(/：|:\s*/u, 2);
    const sec = sections.find((s) =>
      new RegExp(
        `(?:Journey|旅程|阶段|Step|步骤)\\s*${n}\\b`,
        "u",
      ).test(s.title),
    );
    const fromBody = sec ? compactItems(sec.body, 1)[0] ?? "" : "";
    const note = (what ?? "").trim() || fromBody;
    return {
      n,
      title: clip(who || raw, 28),
      note: note ? clip(note, 72) : "",
    };
  });
  if (prepared.every((s) => !s.note) && prepared.length >= 3) return "";
  const steps = prepared.map(
    (s) =>
      `<div class="kn-journey__step"><div class="kn-journey__n">${escapeHtml(s.n)}</div><div class="kn-journey__title">${escapeHtml(s.title)}</div>${s.note ? `<div class="kn-journey__note">${escapeHtml(s.note)}</div>` : ""}</div>`,
  );
  return `<div class="kn-journey kn-journey--spine"><p class="kn-chart__cap">用户怎么用</p>${steps.join("")}</div>`;
}

export function renderWeekTimelineLead(md: string): string {
  const weeks = [
    ...md.matchAll(/^#{2,6}\s+(Week\s+\d+|第\s*[一二三四1-4]\s*周)[^\n]*$/gmu),
  ];
  if (weeks.length < 2) return "";
  const sections = splitMarkdownHeadings(md);
  const items = weeks.map((m) => {
    const title = (m[1] ?? "").trim();
    const rawTitle = (m[0] ?? "").replace(/^#{2,6}\s+/u, "");
    const sec = sections.find((s) => s.title.startsWith(rawTitle) || s.title.startsWith(title));
    const goal =
      /^\*\*(?:Goal|目标)[:：]\*\*\s*(.+)$/mu.exec(sec?.body ?? "")?.[1];
    const note = goal
      ? clip(goal, 72)
      : compactItems(sec?.body ?? "", 1)[0] ?? "";
    return `<div class="kn-timeline__item"><div class="kn-timeline__dot"></div><div class="kn-timeline__when">${escapeHtml(title)}</div><div class="kn-timeline__note">${escapeHtml(note)}</div></div>`;
  });
  return `<div class="kn-timeline">${items.join("")}</div>`;
}

export function renderMoscowStatsLead(md: string): string {
  const countRows = (re: RegExp) => {
    const sec = splitMarkdownHeadings(md).find((s) => re.test(normTitle(s.title)));
    if (!sec) return 0;
    const tables = parseTables(sec.body);
    if (tables[0]?.rows.length) return tables[0]!.rows.length;
    return compactItems(sec.body, 40).length;
  };
  const must = countRows(/must[- ]?have|^must\b|必须有|必须具备|^必须$/iu);
  const should = countRows(/should[- ]?have|^should\b|应该有|应当|^应该$/iu);
  const could = countRows(/could[- ]?have|^could\b|可以有|可有|^可以$/iu);
  const wont = countRows(/won'?t[- ]?have|^won'?t\b|本次不做|明确不做|^不做$/iu);
  if ([must, should, could, wont].filter((n) => n > 0).length < 3) return "";
  const cell = (label: string, n: number) =>
    `<div class="kn-stat"><div class="kn-stat__label">${escapeHtml(label)}</div><div class="kn-stat__value">${n}</div></div>`;
  return `<div class="kn-stats kn-stats--4">${cell("必须", must)}${cell("应该", should)}${cell("可以", could)}${cell("不做", wont)}</div>`;
}

function firstMoney(text: string): string {
  const t = stripInlineMd(text);
  const m =
    /(?:US\$|\$|€|£|¥|￥)\s*[\d.,]+\s*[kmbKMB]?(?:\s*ARR)?/u.exec(t) ??
    /[\d.,]+\s*(?:亿|万|千万)\s*(?:元|人民币)?/u.exec(t) ??
    /[\d.,]+\s*(?:万元|元)\s*\/?\s*(?:年|月)?/u.exec(t);
  if (!m) return "";
  const raw = clip(m[0].replace(/\s+/gu, " "), 18);
  if (isHollowMetric(raw)) return "";
  return raw;
}

function isHollowMetric(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  if (/^待补/u.test(t)) return true;
  if (/^(n\/?a|unknown|unquantified|not quantified)$/iu.test(t)) return true;
  if (/^US$/iu.test(t)) return true;
  if (/^(US\$?|\$|€|£|¥)?\s*0+(\.0+)?\s*[kmbKMB]?$/iu.test(t)) return true;
  if (/^0+k?$/iu.test(t)) return true;
  return false;
}

function baselineArr(table: MdTable | undefined): string {
  if (!table) return "";
  const row =
    table.rows.find((r) => /基准|base/iu.test(r.join(" "))) ??
    table.rows.find((r) => firstMoney(r.join(" "))) ??
    table.rows[0];
  if (!row) return "";
  const moneyCell = row.find((c) => firstMoney(c));
  if (moneyCell) return firstMoney(moneyCell);
  return firstMoney(row.join(" ")) || clip(stripInlineMd(row[row.length - 1] ?? ""), 18);
}

function marketValue(md: string, tableRe: RegExp, headingRe: RegExp): string {
  const tables = parseTables(md);
  for (const t of tables) {
    const row = t.rows.find((r) => tableRe.test(stripInlineMd(r[0] ?? "")));
    if (!row) continue;
    const scaleI = colIndex(t.headers, /规模|size|金额|数值|规划|arr/iu);
    const money =
      (scaleI >= 0 ? firstMoney(row[scaleI] ?? "") : "") ||
      firstMoney(row.slice(1).join(" ")) ||
      stripInlineMd(row[scaleI >= 0 ? scaleI : 1] ?? "");
    if (isHollowMetric(money) || /^待补/u.test(money.trim())) return "待补";
    if (money.trim()) return clip(money, 18);
  }
  const named = tables.find((t) => t.headers.some((h) => tableRe.test(h)));
  if (named) {
    const fromBase = baselineArr(named);
    if (fromBase && !isHollowMetric(fromBase)) return fromBase;
  }
  const found =
    firstMoney(headingBody(md, headingRe)) || metricNear(md, headingRe);
  if (!found || isHollowMetric(found)) return "待补";
  return found;
}

export function renderMarketStatsLead(md: string): string {
  const tamV = marketValue(
    md,
    /planning tam|\bTAM\b|总市场/iu,
    /总市场|^tam\b/iu,
  );
  const samV = marketValue(
    md,
    /planning sam|\bSAM\b|可服务市场|可服务/iu,
    /可服务市场|^sam\b/iu,
  );
  const somV = marketValue(
    md,
    /planning som|\bSOM\b|可获得份额|可获得/iu,
    /可获得份额|^som\b/iu,
  );
  if ([tamV, samV, somV].filter(Boolean).length < 2) return "";
  const cell = (label: string, value: string) => {
    const pending = isHollowMetric(value) || /^待补/u.test(value.trim());
    const cls = pending ? "kn-stat kn-stat--pending" : "kn-stat";
    const shown = pending ? "待补" : clip(value, 18);
    return `<div class="${cls}"><div class="kn-stat__label">${escapeHtml(label)}</div><div class="kn-stat__value">${escapeHtml(shown)}</div><div class="kn-stat__note">规划口径</div></div>`;
  };
  const parts = [
    tamV ? cell("总市场", tamV) : "",
    samV ? cell("可服务", samV) : "",
    somV ? cell("可获得", somV) : "",
  ].filter(Boolean);
  const wrap = parts.length === 2 ? "kn-stats kn-stats--2" : "kn-stats";
  return `<div class="${wrap}">${parts.join("")}</div>`;
}

function gateState(md: string): "buy" | "conditional" | "pass" | null {
  const line =
    md.split(/\n/u).find((l) =>
      /green light|yellow light|red light|绿灯|黄灯|红灯|\*\*GO\*\*|\*\*NO-GO\*\*|Recommendation|闸门/iu.test(
        l,
      ),
    ) ?? md.slice(0, 1800);
  if (/red light|红灯|\bno-?go\b|建议停止|不建议继续/iu.test(line)) return "pass";
  if (
    /yellow light|黄灯|mixed signal|有条件|调整后|CONDITIONAL|零验证|significant concerns/iu.test(
      line,
    )
  ) {
    return "conditional";
  }
  if (/green light|绿灯|(?:^|\s)\*?GO\b|建议继续|supports proceeding/iu.test(line)) {
    return "buy";
  }
  return null;
}

function firstProseWhy(md: string): string {
  const rec = headingBody(md, /recommendation|rationale|建议/iu);
  const pools = rec ? [rec, md] : [md];
  for (const src of pools) {
    for (const line of src.split(/\r?\n/u)) {
      const t = line.trim().replace(/^>\s*/u, "");
      if (!t) continue;
      if (/^(#{1,6})\s+/u.test(t)) continue;
      if (/^\*\*[^*]+[:：]/u.test(t)) continue;
      if (/^---+$/u.test(t)) continue;
      if (/^[-*|]/u.test(t)) continue;
      if (
        /yellow\s*light|green\s*light|red\s*light|🟡|🟢|🔴|黄灯|绿灯|红灯/iu.test(
          t,
        )
      ) {
        continue;
      }
      return t;
    }
  }
  return "";
}

export function renderResearchGateLead(md: string): string {
  const state = gateState(md);
  if (!state) return "";
  const whySrc = firstProseWhy(md);
  const on = (s: "buy" | "conditional" | "pass") =>
    s === state ? " is-on" : "";
  const why = whySrc
    ? `<p class="kn-gate__why">${escapeHtml(clip(localizeKnText(whySrc), 140))}</p>`
    : "";
  return `<div class="kn-gate"><div class="kn-gate__opt${on("buy")}" data-state="buy">继续</div><div class="kn-gate__opt${on("conditional")}" data-state="conditional">调整</div><div class="kn-gate__opt${on("pass")}" data-state="pass">停止</div></div>${why}`;
}

export function renderTripwireLead(md: string): string {
  const wires: Array<{ signal: string; action: string }> = [];
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const a = colIndex(
      t.headers,
      /condition|criterion|trigger|signal|标准|若|如果|kill/iu,
    );
    const b = colIndex(
      t.headers,
      /action|then|stop|pivot|处置|动作|后果|决策/iu,
    );
    return a >= 0 && b >= 0 && a !== b && t.rows.length >= 2;
  });
  if (table) {
    const a = colIndex(
      table.headers,
      /condition|criterion|trigger|signal|标准|若|如果|kill/iu,
    );
    const b = colIndex(
      table.headers,
      /action|then|stop|pivot|处置|动作|后果|决策/iu,
    );
    for (const row of table.rows.slice(0, 7)) {
      const signal = clip(row[a] ?? "", 96);
      const action = clip(row[b] ?? "", 80);
      if (signal && action) wires.push({ signal, action });
    }
  } else {
    for (const m of md.matchAll(
      /^(?:\d+[.)]\s+|[-*]\s+)?(?:\*\*)?(?:If|若|如果)\s+(.+?)\s*(?:\*\*)?\s*(?:—+|→|->|then|则)\s+(.+)$/gimu,
    )) {
      wires.push({
        signal: clip(m[1] ?? "", 96),
        action: clip(m[2] ?? "", 80),
      });
    }
  }
  if (wires.length < 2) return "";
  return `<div class="kn-tripwires">${wires
    .slice(0, 7)
    .map(
      (w) =>
        `<div class="kn-tripwire"><div class="kn-tripwire__signal">${escapeHtml(w.signal)}</div><div class="kn-tripwire__arrow">→</div><div class="kn-tripwire__action">${escapeHtml(w.action)}</div></div>`,
    )
    .join("")}</div>`;
}

function axisRank(text: string, kind: "L" | "I"): number {
  const t = stripInlineMd(text).toLowerCase();
  const n = Number.parseInt(t.replace(/[^\d]/gu, ""), 10);
  if (n >= 1 && n <= 4 && t.length < 8) return n;
  if (kind === "L") {
    if (/high|高|>\s*60/.test(t)) return 4;
    if (/medium|中|mid/.test(t)) return 3;
    if (/low|低/.test(t)) return 2;
    return 0;
  }
  if (/critical|严重|致命/.test(t)) return 4;
  if (/major|high|高/.test(t)) return 3;
  if (/moderate|medium|中|mid/.test(t)) return 2;
  if (/minor|low|低/.test(t)) return 1;
  return 0;
}

function heatTone(lik: number, imp: number): string {
  const row = [
    ["idle", "idle", "low", "mid"],
    ["idle", "low", "mid", "high"],
    ["low", "mid", "high", "crit"],
    ["mid", "high", "crit", "crit"],
  ];
  return row[lik - 1]?.[imp - 1] ?? "idle";
}

export function renderRiskHeatmapLead(md: string): string {
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const lik = colIndex(t.headers, /likelihood|可能|概率/iu);
    const imp = colIndex(t.headers, /impact|影响|后果/iu);
    return lik >= 0 && imp >= 0 && t.rows.length >= 3;
  });
  if (!table) return "";
  const riskI = colIndex(table.headers, /risk|情景|风险|^name/iu);
  const likI = colIndex(table.headers, /likelihood|可能|概率/iu);
  const impI = colIndex(table.headers, /impact|影响|后果/iu);
  const grid: string[][][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => [] as string[]),
  );
  let placed = 0;
  for (const row of table.rows) {
    const lik = axisRank(row[likI] ?? "", "L");
    const imp = axisRank(row[impI] ?? "", "I");
    if (lik < 1 || imp < 1) continue;
    const name = clip(row[riskI >= 0 ? riskI : 0] ?? "", 22);
    if (!name) continue;
    grid[lik - 1]![imp - 1]!.push(name);
    placed += 1;
  }
  if (placed < 3) return "";
  const labels = ["1 低", "2", "3", "4 高"];
  const rowsHtml = [4, 3, 2, 1]
    .map((lik) => {
      const cells = [1, 2, 3, 4]
        .map((imp) => {
          const names = (grid[lik - 1]?.[imp - 1] ?? []).slice(0, 2);
          const tone = heatTone(lik, imp);
          const text = names.length ? escapeHtml(names.join("；")) : "";
          return `<td class="kn-heat--${tone}">${text}</td>`;
        })
        .join("");
      const lab = lik === 4 ? "4 高" : lik === 1 ? "1 低" : String(lik);
      return `<tr><td>${lab}</td>${cells}</tr>`;
    })
    .join("");
  return `<div class="kn-table-wrap"><table class="kn-heatmap"><thead><tr><th>可能性 \\ 影响</th>${labels.map((l) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
}

function firstQuote(md: string): string {
  const q = /^>\s+(.+)$/mu.exec(md)?.[1];
  return q ? clip(q, 140) : "";
}

function audienceAvoidFromTable(md: string): string {
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const who = colIndex(t.headers, /人群|客群|persona|用户/iu);
    const pri = colIndex(t.headers, /优先级|priority|服务/iu);
    return who >= 0 && pri >= 0;
  });
  if (!table) return "";
  const who = colIndex(table.headers, /人群|客群|persona|用户/iu);
  const pri = colIndex(table.headers, /优先级|priority|服务/iu);
  const rows = table.rows.filter((r) => /明确不做|不服务|out of scope|won't/iu.test(r[pri] ?? ""));
  return rows.map((r) => `- ${r[who]}`).join("\n");
}

function audienceFromPriorityTable(md: string): { serve: string[]; avoid: string[] } {
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const who = colIndex(t.headers, /人群|客群|persona|用户/iu);
    const pri = colIndex(t.headers, /优先级|priority/iu);
    return who >= 0 && pri >= 0 && t.rows.length >= 2;
  });
  if (!table) return { serve: [], avoid: [] };
  const who = colIndex(table.headers, /人群|客群|persona|用户/iu);
  const pri = colIndex(table.headers, /优先级|priority/iu);
  const serve: string[] = [];
  const avoid: string[] = [];
  for (const row of table.rows) {
    const name = clip(stripInlineMd(row[who] ?? ""), 72);
    if (!name) continue;
    const p = stripInlineMd(row[pri] ?? "");
    if (/明确不做|不服务|out of scope|won't|anti/iu.test(p)) avoid.push(name);
    else if (/高|首要|主|high|primary|core/iu.test(p) && !/次/u.test(p)) {
      serve.push(name);
    }
  }
  return { serve, avoid };
}

export function renderAudienceLead(md: string): string {
  const serveBody =
    headingBody(md, /primary persona|首要客群|主客群|目标客群|目标用户|^persona\b/iu) ||
    headingBody(md, /服务谁|who to serve/iu);
  const avoidBody =
    headingBody(md, /anti-?persona|反客群|不服务谁|who not|不要服务/iu) ||
    audienceAvoidFromTable(md);
  let serve = bodyItems(serveBody, 4);
  let avoid = bodyItems(avoidBody, 4);
  const fromPri = audienceFromPriorityTable(md);
  if (serve.length === 0) serve = fromPri.serve;
  if (avoid.length === 0) avoid = fromPri.avoid;
  const avoidKey = new Set(avoid.map((s) => s.replace(/\s+/gu, "").slice(0, 16)));
  serve = serve.filter((s) => !avoidKey.has(s.replace(/\s+/gu, "").slice(0, 16)));
  const split = splitHtml("服务谁", serve, "不服务谁", avoid, "go", "stop");
  const quote = firstQuote(serveBody || md);
  const qHtml = quote
    ? `<figure class="kn-quote"><blockquote>${escapeHtml(quote)}</blockquote></figure>`
    : "";
  if (!split && !qHtml) return "";
  return `${split}${qHtml}`;
}

export function renderMvpSplitLead(md: string): string {
  const must =
    headingBody(md, /must[- ]?have|必须有|首版做|核心功能/iu) ||
    headingBody(md, /in scope|范围内/iu);
  const wont = headingBody(
    md,
    /out of scope|明确不做|won't have|不在范围/iu,
  );
  return splitHtml(
    "首版做",
    bodyItems(must, 5),
    "明确不做",
    bodyItems(wont, 5),
    "go",
    "stop",
  );
}

export function renderTrendSplitLead(md: string): string {
  const wind = headingBody(md, /tailwind|顺风/iu);
  const head = headingBody(md, /headwind|逆风/iu);
  return splitHtml(
    "顺风",
    bodyItems(wind, 4),
    "逆风",
    bodyItems(head, 4),
    "go",
    "stop",
  );
}

export function renderValuePropLead(md: string): string {
  const jobs = headingBody(md, /jobs-to-be-done|要完成的事|要完成的工作|^jobs?\b/iu);
  const pains = headingBody(md, /pains?$|痛点/iu);
  const gains = headingBody(md, /gains?$|收益|所得/iu);
  const tables = parseTables(md);
  const vpc = tables.find((t) => {
    const j = colIndex(t.headers, /job|要完成/iu);
    const p = colIndex(t.headers, /pain|痛点/iu);
    const g = colIndex(t.headers, /gain|收益/iu);
    return j >= 0 && p >= 0 && g >= 0;
  });
  const clipJoin = (items: string[]) =>
    clip(items.filter(Boolean).join("；"), 96);
  const jobT = jobs
    ? clipJoin(bodyItems(jobs, 3))
    : vpc
      ? clipJoin(
          vpc.rows
            .slice(0, 3)
            .map((r) =>
              stripInlineMd(r[colIndex(vpc.headers, /job|要完成/iu)] ?? ""),
            ),
        )
      : "";
  const painT = pains
    ? clipJoin(bodyItems(pains, 3))
    : vpc
      ? clipJoin(
          vpc.rows
            .slice(0, 3)
            .map((r) =>
              stripInlineMd(r[colIndex(vpc.headers, /pain|痛点/iu)] ?? ""),
            ),
        )
      : "";
  const gainT = gains
    ? clipJoin(bodyItems(gains, 3))
    : vpc
      ? clipJoin(
          vpc.rows
            .slice(0, 3)
            .map((r) =>
              stripInlineMd(r[colIndex(vpc.headers, /gain|收益/iu)] ?? ""),
            ),
        )
      : "";
  if (!jobT || !painT || !gainT) return "";
  const card = (label: string, body: string) =>
    `<div class="kn-scenario"><div class="kn-scenario__label">${escapeHtml(label)}</div><div class="kn-scenario__body">${escapeHtml(body)}</div></div>`;
  return `<div class="kn-scenarios">${card("要完成的事", jobT)}${card("痛点", painT)}${card("收益", gainT)}</div>`;
}

export function renderNumberedJourneyLead(md: string): string {
  if (collectLoopStations(md).length >= 5) return "";
  const existing = renderJourneyLead(md);
  if (existing) return existing;
  const numbered = [...md.matchAll(/^\d+[.)]\s+(.+)$/gmu)].map((m) =>
    clip(m[1] ?? "", 64),
  );
  if (numbered.length < 3) return "";
  if (looksLikeOpsTasks(numbered)) return "";
  const steps = numbered.slice(0, 6).map((title, i) => {
    const n = String(i + 1);
    return `<div class="kn-journey__step"><div class="kn-journey__n">${n}</div><div class="kn-journey__title">${escapeHtml(title)}</div></div>`;
  });
  return `<div class="kn-journey kn-journey--spine">${steps.join("")}</div>`;
}

function loopCircleHits(
  cx: number,
  cy: number,
  r: number,
  x: number,
  y: number,
  w: number,
  h: number,
): Array<{ x: number; y: number; ang: number }> {
  const pts: Array<{ x: number; y: number; ang: number }> = [];
  const add = (px: number, py: number) => {
    if (px >= x - 0.6 && px <= x + w + 0.6 && py >= y - 0.6 && py <= y + h + 0.6) {
      pts.push({ x: px, y: py, ang: Math.atan2(py - cy, px - cx) });
    }
  };
  for (const xe of [x, x + w]) {
    const d = r * r - (xe - cx) ** 2;
    if (d >= 0) {
      const s = Math.sqrt(d);
      add(xe, cy + s);
      add(xe, cy - s);
    }
  }
  for (const ye of [y, y + h]) {
    const d = r * r - (ye - cy) ** 2;
    if (d >= 0) {
      const s = Math.sqrt(d);
      add(cx + s, ye);
      add(cx - s, ye);
    }
  }
  const uniq: typeof pts = [];
  for (const p of pts) {
    if (!uniq.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.9)) uniq.push(p);
  }
  return uniq;
}

function clockDelta(from: number, to: number): number {
  let d = to - from;
  while (d < 0) d += Math.PI * 2;
  while (d >= Math.PI * 2) d -= Math.PI * 2;
  return d;
}

function boxDistance(ux: number, uy: number, halfW: number, halfH: number): number {
  const tx = Math.abs(ux) < 1e-9 ? Number.POSITIVE_INFINITY : halfW / Math.abs(ux);
  const ty = Math.abs(uy) < 1e-9 ? Number.POSITIVE_INFINITY : halfH / Math.abs(uy);
  return Math.min(tx, ty);
}

export function renderLoopLead(md: string): string {
  const stations = collectLoopStations(md);
  if (stations.length < 5) return "";
  const n = stations.length;
  const sizeW = 520;
  const sizeH = 400;
  const cx = 260;
  const cy = 200;
  const R = 128;
  const sw = 108;
  const sh = 40;
  const hw = 92;
  const hh = 52;
  const hubName = /知识网络/u.test(md) ? "知识网络" : "项目记录";
  const boxes = stations.map((s, k) => {
    const theta = -Math.PI / 2 + (k * 2 * Math.PI) / n;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const px = cx + R * ux;
    const py = cy + R * uy;
    return {
      ...s,
      theta,
      ux,
      uy,
      px,
      py,
      x: px - sw / 2,
      y: py - sh / 2,
    };
  });
  const arcs = boxes
    .map((box, k) => {
      const next = boxes[(k + 1) % n]!;
      const hits = loopCircleHits(cx, cy, R, box.x, box.y, sw, sh);
      const nextHits = loopCircleHits(cx, cy, R, next.x, next.y, sw, sh);
      let exit = { x: box.px, y: box.py, ang: box.theta };
      let entry = { x: next.px, y: next.py, ang: next.theta };
      let exitD = 99;
      let entryD = 99;
      for (const p of hits) {
        const d = clockDelta(box.theta, p.ang);
        if (d > 0.04 && d < exitD) {
          exitD = d;
          exit = p;
        }
      }
      for (const p of nextHits) {
        const d = clockDelta(p.ang, next.theta);
        if (d > 0.04 && d < entryD) {
          entryD = d;
          entry = p;
        }
      }
      const overhang = 1.2 / R;
      const phiEnd = entry.ang - overhang;
      const endX = cx + R * Math.cos(phiEnd);
      const endY = cy + R * Math.sin(phiEnd);
      return `<path class="kn-loop__ring" d="M ${exit.x.toFixed(1)} ${exit.y.toFixed(1)} A ${R} ${R} 0 0 1 ${endX.toFixed(1)} ${endY.toFixed(1)}" marker-end="url(#kn-loop-mk)" />`;
    })
    .join("");
  const spokes = boxes
    .map((box) => {
      const dStation = boxDistance(box.ux, box.uy, sw / 2, sh / 2);
      const dHub = boxDistance(box.ux, box.uy, hw / 2, hh / 2);
      const sx = box.px - dStation * box.ux;
      const sy = box.py - dStation * box.uy;
      const ex = cx + (dHub + 6) * box.ux;
      const ey = cy + (dHub + 6) * box.uy;
      return `<line class="kn-loop__spoke" x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" marker-end="url(#kn-loop-spoke)" />`;
    })
    .join("");
  const stationNodes = boxes
    .map((box) => {
      const cls = box.focal ? " kn-loop__st--focal" : "";
      const note = box.note
        ? `<text class="kn-loop__sub" x="${box.px.toFixed(1)}" y="${(box.py + 8).toFixed(1)}" text-anchor="middle">${escapeHtml(box.note)}</text>`
        : "";
      const nameY = box.note ? box.py - 6 : box.py + 1;
      return `<rect class="kn-loop__st${cls}" x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${sw}" height="${sh}" rx="6" /><text class="kn-loop__name" x="${box.px.toFixed(1)}" y="${nameY.toFixed(1)}" text-anchor="middle">${escapeHtml(box.name)}</text>${note}`;
    })
    .join("");
  return `<div class="kn-loop"><p class="kn-chart__cap">启动飞轮</p><svg viewBox="0 0 ${sizeW} ${sizeH}" role="img" aria-label="启动飞轮"><defs><marker id="kn-loop-mk" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><polygon points="0,0 8,4 0,8" fill="hsl(5 18% 62%)" /></marker><marker id="kn-loop-spoke" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><polygon points="0,0 8,4 0,8" fill="hsl(5 10% 72%)" /></marker></defs>${arcs}${spokes}${stationNodes}<rect class="kn-loop__hub" x="${cx - hw / 2}" y="${cy - hh / 2}" width="${hw}" height="${hh}" rx="8" /><text class="kn-loop__hubname" x="${cx}" y="${cy - 4}" text-anchor="middle">${escapeHtml(hubName)}</text><text class="kn-loop__hubsub" x="${cx}" y="${cy + 12}" text-anchor="middle">每圈写回</text></svg></div>`;
}

function moscowItems(md: string, re: RegExp): string[] {
  const sec = splitMarkdownHeadings(md).find((s) => re.test(normTitle(s.title)));
  if (!sec) return [];
  const tables = parseTables(sec.body);
  if (tables[0]?.rows.length) {
    return tables[0]!.rows.map((r) => clip(r[0] ?? "", 22)).filter(Boolean);
  }
  return compactItems(sec.body, 12);
}

export function renderMoscowKanbanLead(md: string): string {
  const cols = [
    {
      title: "必须",
      items: moscowItems(md, /must[- ]?have|^must\b|必须有|必须具备|^必须$/iu),
      limit: 4,
      kind: "wip",
    },
    {
      title: "应该",
      items: moscowItems(md, /should[- ]?have|^should\b|应该有|应当|^应该$/iu),
      limit: 4,
      kind: "wip",
    },
    {
      title: "可以",
      items: moscowItems(md, /could[- ]?have|^could\b|可以有|可有|^可以$/iu),
      limit: 4,
      kind: "wip",
    },
    {
      title: "不做",
      items: moscowItems(md, /won'?t[- ]?have|^won'?t\b|本次不做|明确不做|^不做$/iu),
      limit: 0,
      kind: "done",
    },
  ];
  if (cols.filter((c) => c.items.length > 0).length < 3) return "";
  const board = cols
    .map((col) => {
      const extra = Math.max(0, col.items.length - 4);
      const shown = extra
        ? [...col.items.slice(0, 3), `+${col.items.length - 3} 项`]
        : col.items.slice(0, 4);
      const chip =
        col.kind === "wip"
          ? `<span class="kn-kanban__wip${col.items.length > 4 ? " kn-kanban__wip--over" : ""}">${col.items.length}/4</span>`
          : `<span class="kn-kanban__n">${col.items.length}</span>`;
      const cards = shown
        .map((title) => {
          const done = col.kind === "done" ? " kn-kanban__card--done" : "";
          return `<article class="kn-kanban__card${done}">${escapeHtml(title)}</article>`;
        })
        .join("");
      return `<section class="kn-kanban__col"><header><h3>${escapeHtml(col.title)}</h3>${chip}</header>${cards}</section>`;
    })
    .join("");
  return `<div class="kn-kanban"><p class="kn-chart__cap">功能优先级</p><div class="kn-kanban__board">${board}</div></div>`;
}

function churnToSentiment(cell: string): number | null {
  const t = stripInlineMd(cell);
  if (!t || /^待补|^—|^-$|^n\/?a$/iu.test(t)) return null;
  if (/中高|偏高|medium[- ]?high/iu.test(t)) return 1;
  if (/中低|偏低|medium[- ]?low/iu.test(t)) return 3;
  if (/流失高|严重|\bhigh\b|frustrated|angry|drop|^高$/iu.test(t) || (/高/u.test(t) && !/中/u.test(t)))
    return 0;
  if (/中|一般|\bmedium\b|neutral/iu.test(t)) return 2;
  if (/流失低|\blow\b|^低$|顺|positive/iu.test(t) || (/低/u.test(t) && !/中/u.test(t)))
    return 4;
  return null;
}

function feelToSentiment(cell: string): number | null {
  const t = stripInlineMd(cell);
  if (!t || /^待补|^—|^-$|^n\/?a$/iu.test(t)) return null;
  if (/烦|怒|痛|卡死|崩溃|low/iu.test(t)) return 0;
  if (/卡|犹豫|担心|anxious/iu.test(t)) return 1;
  if (/平|一般|neutral/iu.test(t)) return 2;
  if (/顺|还行|ok/iu.test(t)) return 3;
  if (/喜|爽|信任|delight|high/iu.test(t)) return 4;
  return churnToSentiment(t);
}

export function renderJourneyMapLead(md: string): string {
  if (hasMultiPersonaJourney(md)) return "";
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const stageI = colIndex(t.headers, /阶段|stage/iu);
    const feelI = colIndex(t.headers, /情绪|sentiment|感受/iu);
    const churnI = colIndex(t.headers, /流失|churn|痛/iu);
    return stageI >= 0 && (feelI >= 0 || churnI >= 0) && t.rows.length >= 3;
  });
  if (!table) return "";
  const stageI = Math.max(0, colIndex(table.headers, /阶段|stage/iu));
  const feelI = colIndex(table.headers, /情绪|sentiment|感受/iu);
  const churnI = colIndex(table.headers, /流失|churn|痛/iu);
  const actI = colIndex(table.headers, /触点|动作|action|touch/iu);
  const rows = table.rows.slice(0, 6).map((row) => {
    const stage = clip(row[stageI] ?? "", 10);
    const feel =
      feelI >= 0 ? feelToSentiment(row[feelI] ?? "") : null;
    const churn =
      churnI >= 0 ? churnToSentiment(row[churnI] ?? "") : null;
    const sentiment = feel ?? churn;
    const act = actI >= 0 && actI !== feelI ? clip(row[actI] ?? "", 16) : "";
    const pain =
      sentiment != null && sentiment <= 1
        ? clip(row[churnI >= 0 ? churnI : feelI] ?? "", 14)
        : "";
    return { stage, sentiment, act, pain };
  });
  if (rows.filter((r) => r.sentiment != null).length < 3) return "";
  const n = rows.length;
  const w = 400;
  const pts = rows
    .map((r, i) => {
      const s = r.sentiment ?? 2;
      const x = ((i + 0.5) / n) * w;
      const y = 6 + ((4 - s) / 4) * 34;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  let painMarks = 0;
  const dots = rows
    .map((r, i) => {
      const s = r.sentiment ?? 2;
      const x = ((i + 0.5) / n) * w;
      const y = 6 + ((4 - s) / 4) * 34;
      const trough = s <= 1 && painMarks < 2;
      if (trough) painMarks += 1;
      const cls = trough ? " kn-jmap__dot--pain" : "";
      return `<circle class="kn-jmap__dot${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${trough ? 4 : 3}" />`;
    })
    .join("");
  painMarks = 0;
  const cols = rows
    .map((r) => {
      const trough = r.sentiment != null && r.sentiment <= 1 && painMarks < 2;
      if (trough) painMarks += 1;
      const pain = trough && r.pain
        ? `<p class="kn-jmap__pain">${escapeHtml(r.pain)}</p>`
        : "";
      const act = r.act && r.act !== "待补"
        ? `<p class="kn-jmap__act">${escapeHtml(r.act)}</p>`
        : "";
      return `<div class="kn-jmap__col"><div class="kn-jmap__stage">${escapeHtml(r.stage)}</div>${act}${pain}</div>`;
    })
    .join("");
  return `<div class="kn-jmap" style="--n:${n}"><p class="kn-chart__cap">用户感受</p><svg class="kn-jmap__curve" viewBox="0 0 ${w} 48" preserveAspectRatio="none" role="img" aria-label="用户感受">${`<polyline class="kn-jmap__line" points="${pts}" />`}${dots}</svg><div class="kn-jmap__cols">${cols}</div></div>`;
}

function metricNear(md: string, labelRe: RegExp): string {
  for (const m of md.matchAll(/^\*\*([^*]+?)[:：]\s*\*\*\s*(.+)$/gmu)) {
    if (labelRe.test(m[1] ?? "")) return clip(m[2] ?? "", 18);
  }
  for (const t of parseTables(md)) {
    for (const row of t.rows) {
      if (labelRe.test(row[0] ?? "") || labelRe.test(row.join(" "))) {
        const val =
          row.find((c, i) => i > 0 && /[\d$月]/.test(c)) ?? row[1] ?? "";
        if (val) return clip(val, 18);
      }
    }
  }
  return "";
}

export function renderCostStatsLead(md: string): string {
  const runway = metricNear(md, /runway|跑道/iu);
  const burn = metricNear(md, /burn|月消耗|monthly (?:cost|spend)|固定成本/iu);
  const rev = metricNear(md, /收入|预收|revenue|arr/iu);
  if ([runway, burn, rev].filter(Boolean).length < 2) return "";
  const cell = (label: string, value: string) =>
    `<div class="kn-stat"><div class="kn-stat__label">${escapeHtml(label)}</div><div class="kn-stat__value">${escapeHtml(value || "待补")}</div></div>`;
  return `<div class="kn-stats">${cell("跑道", runway)}${cell("月消耗", burn)}${cell("收入 / 预收", rev)}</div>`;
}

export function renderUnitEconLead(md: string): string {
  const cac = metricNear(md, /获客成本|^cac\b/iu);
  const ltv = metricNear(md, /^ltv\b|终身价值|客户终身/iu);
  const price = metricNear(md, /定价|客单价|年费|订阅价/iu);
  const margin = metricNear(md, /毛利率|贡献毛利|^margin\b/iu);
  const parts = [
    cac ? ["获客成本", cac] : null,
    ltv ? ["终身价值", ltv] : null,
    price ? ["定价", price] : null,
    margin ? ["毛利率", margin] : null,
  ].filter((x): x is string[] => Boolean(x));
  if (parts.length < 2) return "";
  const wrap = parts.length >= 4 ? "kn-stats kn-stats--4" : "kn-stats";
  return `<div class="${wrap}">${parts
    .map(
      ([label, value]) =>
        `<div class="kn-stat"><div class="kn-stat__label">${escapeHtml(label!)}</div><div class="kn-stat__value">${escapeHtml(value!)}</div></div>`,
    )
    .join("")}</div>`;
}

export function renderProjectionLead(md: string): string {
  const tables = parseTables(md);
  const yearRe = /year\s*[123]|第[一二三1-3]年|y[123]\b/iu;
  const cell = (label: string, value: string) =>
    `<div class="kn-stat"><div class="kn-stat__label">${escapeHtml(label)}</div><div class="kn-stat__value">${escapeHtml(clip(value || "待补", 18))}</div></div>`;
  const byRow = tables.find((t) => {
    const y = colIndex(t.headers, /year|年份|^年$/iu);
    const r = colIndex(t.headers, /收入|revenue|arr/iu);
    return y >= 0 && r >= 0 && t.rows.length >= 2;
  });
  if (byRow) {
    const yI = colIndex(byRow.headers, /year|年份|^年$/iu);
    const rI = colIndex(byRow.headers, /收入|revenue|arr/iu);
    const items = byRow.rows.slice(0, 3).map((row) =>
      cell(
        clip(row[yI] ?? "", 10) || "年",
        firstMoney(row[rI] ?? "") || clip(row[rI] ?? "", 14),
      ),
    );
    if (items.length >= 2) return `<div class="kn-stats">${items.join("")}</div>`;
  }
  const byCol = tables.find(
    (t) => t.headers.filter((h) => yearRe.test(h)).length >= 2,
  );
  if (byCol) {
    const incomeRow =
      byCol.rows.find((r) => /收入|revenue|arr/iu.test(r[0] ?? "")) ??
      byCol.rows[0];
    if (incomeRow) {
      const items = byCol.headers
        .map((h, i) =>
          yearRe.test(h)
            ? cell(
                clip(h, 10),
                firstMoney(incomeRow[i] ?? "") || clip(incomeRow[i] ?? "", 14),
              )
            : "",
        )
        .filter(Boolean)
        .slice(0, 3);
      if (items.length >= 2) return `<div class="kn-stats">${items.join("")}</div>`;
    }
  }
  const y1 = firstMoney(headingBody(md, /第一年|year\s*1/iu));
  const y2 = firstMoney(headingBody(md, /第二年|year\s*2/iu));
  const y3 = firstMoney(headingBody(md, /第三年|year\s*3/iu));
  if ([y1, y2, y3].filter(Boolean).length < 2) return "";
  return `<div class="kn-stats">${cell("第一年", y1)}${cell("第二年", y2)}${cell("第三年", y3)}</div>`;
}

export function renderCoverageLead(md: string): string {
  const solid = headingBody(
    md,
    /highest confidence|高确信|已覆盖|solid ground|最高把握|最有把握|已站稳/iu,
  );
  const open = headingBody(
    md,
    /critical unknown|最低确信|待澄清|unknown|lowest confidence|关键未知|最不确定|待验证|thin ice|薄冰/iu,
  );
  const left = bodyItems(solid, 5);
  const right = bodyItems(open, 5);
  if (left.length === 0 || right.length === 0) return "";
  return `<div class="kn-coverage"><div class="kn-coverage__col"><h3>已站稳</h3>${itemsUl(left)}</div><div class="kn-coverage__col kn-coverage__col--open"><h3>仍在薄冰</h3>${itemsUl(right)}</div></div>`;
}

export function renderAssumptionFoldsLead(md: string): string {
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const a = colIndex(t.headers, /assumption|假设/iu);
    const s = colIndex(t.headers, /status|状态/iu);
    return a >= 0 && s >= 0 && t.rows.length >= 3;
  });
  if (!table) return "";
  const aI = colIndex(table.headers, /assumption|假设/iu);
  const sI = colIndex(table.headers, /status|状态/iu);
  const groups: Array<{ title: string; re: RegExp; items: string[] }> = [
    { title: "未测", re: /untested|未测|未验证/iu, items: [] },
    { title: "验证中", re: /testing|验证中|in progress/iu, items: [] },
    { title: "已证实", re: /validated|已证实|已验证/iu, items: [] },
  ];
  for (const row of table.rows) {
    const g = groups.find((x) => x.re.test(row[sI] ?? ""));
    if (!g) continue;
    const name = clip(row[aI] ?? "", 72);
    if (name) g.items.push(name);
  }
  const nonempty = groups.filter((g) => g.items.length > 0);
  if (nonempty.length < 2) return "";
  return nonempty
    .map((g, i) => {
      const open = i === 0 ? " open" : "";
      const lis = g.items
        .slice(0, 6)
        .map((it) => `<li><strong>${escapeHtml(it)}</strong></li>`)
        .join("");
      return `<details class="kn-fold"${open}><summary><span class="kn-fold__title">${escapeHtml(g.title)}</span><span class="kn-fold__count">${g.items.length} 项</span></summary><ol>${lis}</ol></details>`;
    })
    .join("");
}

export function renderExperimentScoreLead(md: string): string {
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const r = colIndex(t.headers, /result|结果|status|状态/iu);
    const e = colIndex(t.headers, /experiment|实验/iu);
    return r >= 0 && e >= 0 && t.rows.length >= 2;
  });
  if (!table) return "";
  const rI = colIndex(table.headers, /result|结果|status|状态/iu);
  let pass = 0;
  let fail = 0;
  let mid = 0;
  for (const row of table.rows) {
    const v = row[rI] ?? "";
    if (/通过|pass|validated|成功/iu.test(v)) pass += 1;
    else if (/未通过|fail|invalidat|失败/iu.test(v)) fail += 1;
    else if (/进行中|testing|in progress|running/iu.test(v)) mid += 1;
  }
  if (pass + fail + mid < 2) return "";
  return `<div class="kn-score-sum"><span>通过 <b>${pass}</b></span><span>未通过 <b>${fail}</b></span><span>进行中 <b>${mid}</b></span></div>`;
}

function featTone(
  cell: string,
): "strong" | "ok" | "weak" | "none" | "unk" | "" {
  const plain = stripInlineMd(cell);
  const t = plain.toLowerCase();
  if (!t) return "";
  if (/unknown|未知|待补|n\/a/iu.test(t)) return "unk";
  if (/^✅/.test(plain) || /^(yes|y)$/iu.test(t)) return "strong";
  if (/^△/.test(plain) || /^~/.test(plain)) return "ok";
  if (
    /^(—|–|-)$/u.test(plain) ||
    /missing|^none$|^无$|^缺$|不做|空白|^no$/iu.test(t)
  ) {
    return "none";
  }
  if (/^strong$|^强$|^高$|优秀|齐全/iu.test(t)) return "strong";
  if (/adequate|enough|^够$|^中$|一般|部分/iu.test(t)) return "ok";
  if (/^weak$|^弱$|^低$|不足|浅/iu.test(t)) return "weak";
  return "";
}

function featScore(tone: ReturnType<typeof featTone>): number {
  if (tone === "strong") return 4;
  if (tone === "ok") return 3;
  if (tone === "weak") return 2;
  if (tone === "none") return 1;
  return 0;
}

function findFeatureMatrix(md: string): MdTable | null {
  const tables = parseTables(md);
  return (
    tables.find((t) => {
      if (t.headers.length < 3 || t.rows.length < 3) return false;
      if (colIndex(t.headers, /score|分数|评分|得分/iu) >= 0) return false;
      const rated = t.rows
        .flatMap((r) => r.slice(1).map(featTone))
        .filter(Boolean);
      return rated.length >= t.rows.length;
    }) ?? null
  );
}

function shouldTransposeFeat(table: MdTable): boolean {
  const h0 = table.headers[0] ?? "";
  if (/能力|维度|feature|capability/iu.test(h0)) return false;
  if (/name|名称|竞品|公司|对手|player/iu.test(h0)) return true;
  const col0Rated = table.rows.filter((r) => featTone(r[0] ?? "")).length;
  return col0Rated === 0 && table.headers.length >= 5;
}

function radarSeriesFrom(table: MdTable): {
  dims: string[];
  series: Array<{ name: string; values: number[] }>;
} {
  if (shouldTransposeFeat(table)) {
    return {
      dims: table.headers.slice(1).map((h) => clip(h, 18)).filter(Boolean),
      series: table.rows
        .map((r) => ({
          name: clip(r[0] ?? "", 16),
          values: r.slice(1).map((c) => featScore(featTone(c))),
        }))
        .filter((s) => s.name && s.values.some((v) => v > 0)),
    };
  }
  return {
    dims: table.rows.map((r) => clip(r[0] ?? "", 18)).filter(Boolean),
    series: table.headers
      .slice(1)
      .map((h, j) => ({
        name: clip(h, 16),
        values: table.rows.map((r) => featScore(featTone(r[j + 1] ?? ""))),
      }))
      .filter((s) => s.name && s.values.some((v) => v > 0)),
  };
}

function pickRadarSeries(
  series: Array<{ name: string; values: number[] }>,
): Array<{ name: string; values: number[] }> {
  const us = series.filter((s) =>
    /本项目|我们|^us$|heyu|合域|somni|fullive/iu.test(s.name),
  );
  const rest = series.filter((s) => !us.includes(s));
  return [...us, ...rest].slice(0, 3);
}

function pickRadarAxes(
  dims: string[],
  series: Array<{ name: string; values: number[] }>,
): number[] {
  if (dims.length <= 5) return dims.map((_, i) => i);
  const scored = dims.map((_, i) => {
    const vals = series.map((s) => s.values[i] ?? 0);
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
    const v = vals.reduce((a, b) => a + (b - mean) ** 2, 0);
    return { i, v };
  });
  return scored
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .slice(0, 5)
    .sort((a, b) => a.i - b.i)
    .map((s) => s.i);
}

function renderFeatureRadar(table: MdTable): string {
  const oriented = radarSeriesFrom(table);
  if (oriented.dims.length < 3) return "";
  const picked = pickRadarSeries(oriented.series);
  if (picked.length < 2) return "";
  const axisIdx = pickRadarAxes(oriented.dims, picked);
  const dims = axisIdx.map((i) => oriented.dims[i]!).filter(Boolean);
  const series = picked.map((s) => ({
    ...s,
    values: axisIdx.map((i) => s.values[i] ?? 0),
  }));
  if (dims.length < 3) return "";
  const n = dims.length;
  const size = 400;
  const cx = 200;
  const cy = 200;
  const maxR = 112;
  const labelGap = 38;
  const dimClip = 8;
  const pt = (i: number, score: number): string => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = maxR * (Math.max(0.15, score) / 4);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  };
  const grid = [1, 2, 3, 4]
    .map((level) => {
      const points = dims.map((_, i) => pt(i, level)).join(" ");
      return `<polygon class="kn-radar__grid" points="${points}" />`;
    })
    .join("");
  const axes = dims
    .map((d, i) => {
      const end = pt(i, 4);
      const [x, y] = end.split(",");
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const lx = (cx + (maxR + labelGap) * Math.cos(a)).toFixed(1);
      const ly = (cy + (maxR + labelGap) * Math.sin(a)).toFixed(1);
      return `<line class="kn-radar__axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" /><text class="kn-radar__label" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(clip(d, dimClip))}</text>`;
    })
    .join("");
  const palette = ["#C43C2C", "#1F6B8A", "#D4A017", "#2E7D4F", "#6B3FA0"];
  const polys = series
    .slice(0, 5)
    .map((s, si) => {
      const color = palette[si % palette.length]!;
      const points = s.values.map((v, i) => pt(i, v)).join(" ");
      return `<polygon class="kn-radar__poly" points="${points}" fill="${color}" fill-opacity="0.07" stroke="${color}" stroke-width="2.2" />`;
    })
    .join("");
  const legend = series
    .slice(0, 5)
    .map((s, si) => {
      const color = palette[si % palette.length]!;
      return `<span class="kn-radar__leg"><i style="background:${color}"></i>${escapeHtml(s.name)}</span>`;
    })
    .join("");
  const cap =
    oriented.dims.length > 5 ? "能力对比 · 差异最大的五维" : "能力对比";
  return `<div class="kn-radar"><p class="kn-chart__cap">${cap}</p><svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${cap}">${grid}${axes}${polys}</svg><div class="kn-radar__legend">${legend}</div></div>`;
}

export function renderFeatureMatrixLead(md: string): string {
  const table = findFeatureMatrix(md);
  if (!table) return "";
  const head = `<tr>${table.headers
    .map((h) => `<th>${escapeHtml(clip(h, 18))}</th>`)
    .join("")}</tr>`;
  const body = table.rows
    .slice(0, 16)
    .map((row) => {
      const cells = row
        .map((c, i) => {
          if (i === 0) return `<th>${escapeHtml(clip(c, 28))}</th>`;
          const tone = featTone(c);
          const cls = tone ? ` class="kn-feat kn-feat--${tone}"` : "";
          const label =
            tone === "strong"
              ? "强"
              : tone === "ok"
                ? "够"
                : tone === "weak"
                  ? "弱"
                  : tone === "none"
                    ? "无"
                    : tone === "unk"
                      ? "待补"
                      : clip(c, 10);
          return `<td${cls}>${escapeHtml(label)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const heatmap = `<div class="kn-table-wrap"><table class="kn-featmap"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  return `${heatmap}${renderFeatureRadar(table)}`;
}

function axisPct(text: string): number | null {
  const t = stripInlineMd(text);
  const n = Number.parseFloat(t.replace(/[^\d.]/gu, ""));
  if (Number.isFinite(n)) {
    if (n >= 0 && n <= 1) return Math.round(n * 100);
    if (n >= 0 && n <= 10) return Math.round(n * 10);
    if (n >= 0 && n <= 100) return Math.round(n);
  }
  if (/high|高|贵|完整|深/iu.test(t)) return 82;
  if (/medium|mid|中|适中/iu.test(t)) return 50;
  if (/low|低|便宜|窄|浅/iu.test(t)) return 18;
  return null;
}

function moneyPct(values: number[], v: number): number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max <= min) return 50;
  return Math.round(((v - min) / (max - min)) * 100);
}

export function renderPositionAxesLead(md: string): string {
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const name = colIndex(t.headers, /name|^名称|^对手|^竞品|玩家/iu);
    const x = colIndex(
      t.headers,
      /complete|功能|完整|广度|专业|覆盖|x\b/iu,
    );
    const y = colIndex(t.headers, /price|价格|定价|客单|y\b/iu);
    return name >= 0 && x >= 0 && y >= 0 && x !== y && t.rows.length >= 2;
  });
  if (!table) return "";
  const nameI = colIndex(table.headers, /name|^名称|^对手|^竞品|玩家/iu);
  const xI = colIndex(table.headers, /complete|功能|完整|广度|专业|覆盖|x\b/iu);
  const yI = colIndex(table.headers, /price|价格|定价|客单|y\b/iu);
  const xLabel = clip(table.headers[xI] ?? "功能完整", 10);
  const yLabel = clip(table.headers[yI] ?? "价格", 8);
  const parsed = table.rows
    .map((row) => {
      const name = clip(row[nameI] ?? "", 12);
      if (!name) return null;
      const x = axisPct(row[xI] ?? "");
      const yRaw = axisPct(row[yI] ?? "");
      const yMoney = Number.parseFloat(
        (row[yI] ?? "").replace(/[^\d.]/gu, ""),
      );
      return { name, x, y: yRaw, yMoney: Number.isFinite(yMoney) ? yMoney : null };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  const moneyVals = parsed
    .map((p) => p.yMoney)
    .filter((n): n is number => n != null && n > 0);
  const dots = parsed
    .map((p) => {
      const x = p.x ?? 50;
      const y =
        p.y ??
        (p.yMoney != null && moneyVals.length >= 2
          ? moneyPct(moneyVals, p.yMoney)
          : null);
      if (y == null && p.x == null) return null;
      const left = Math.min(92, Math.max(8, x));
      const bottom = Math.min(92, Math.max(8, y ?? 50));
      const ours = /我们|本产品|^us$|^our\b/iu.test(p.name);
      const cls = ours ? " kn-axes__dot--us" : "";
      return `<span class="kn-axes__dot${cls}" style="left:${left}%;bottom:${bottom}%">${escapeHtml(p.name)}</span>`;
    })
    .filter(Boolean);
  if (dots.length < 2) return "";
  return `<div class="kn-axes"><div class="kn-axes__y">${escapeHtml(yLabel)} →</div><div class="kn-axes__plot">${dots.join("")}</div><div class="kn-axes__spacer"></div><div class="kn-axes__x">${escapeHtml(xLabel)} →</div></div>`;
}

export function renderPriceBandLead(md: string): string {
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const name = colIndex(t.headers, /name|^名称|^对手|^竞品/iu);
    const price = colIndex(t.headers, /price|价格|定价|年费|客单/iu);
    return name >= 0 && price >= 0 && t.rows.length >= 2;
  });
  if (!table) return "";
  const nameI = colIndex(table.headers, /name|^名称|^对手|^竞品/iu);
  const priceI = colIndex(table.headers, /price|价格|定价|年费|客单/iu);
  const items = table.rows
    .map((row) => {
      const name = clip(row[nameI] ?? "", 18);
      const raw = row[priceI] ?? "";
      const n = Number.parseFloat(raw.replace(/[^\d.]/gu, ""));
      if (!name || !Number.isFinite(n) || n <= 0) return null;
      if (/^\d{4}-\d{2}-\d{2}$/u.test(name) || /^US$/iu.test(name)) return null;
      return { name, n, label: firstMoney(raw) || clip(raw, 14) };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  if (items.length < 2) return "";
  const max = Math.max(...items.map((i) => i.n));
  const rows = [...items]
    .sort((a, b) => a.n - b.n)
    .slice(0, 8)
    .map((it) => {
      const ours = /我们|本产品|^us$|^our\b|合域|heyu/iu.test(it.name);
      const pct = Math.max(8, Math.round((it.n / max) * 100));
      const cls = ours ? " kn-pricelist__row--us" : "";
      return `<div class="kn-pricelist__row${cls}"><span class="kn-pricelist__name">${escapeHtml(it.name)}</span><span class="kn-pricelist__bar"><i style="width:${pct}%"></i></span><span class="kn-pricelist__amt">${escapeHtml(it.label)}</span></div>`;
    })
    .join("");
  return `<div class="kn-pricelist"><p class="kn-chart__cap">价格对照</p>${rows}</div>`;
}

export function renderMarketRingsLead(md: string): string {
  const tamV = marketValue(
    md,
    /planning tam|\bTAM\b|总市场/iu,
    /总市场|^tam\b/iu,
  );
  const samV = marketValue(
    md,
    /planning sam|\bSAM\b|可服务市场|可服务/iu,
    /可服务市场|^sam\b/iu,
  );
  const somV = marketValue(
    md,
    /planning som|\bSOM\b|可获得份额|可获得/iu,
    /可获得份额|^som\b/iu,
  );
  if (!tamV || !samV) return "";
  if (isHollowMetric(tamV) || isHollowMetric(samV)) return "";
  if (tamV === samV) return "";
  const som = somV && !isHollowMetric(somV) && somV !== samV
    ? `<div class="kn-ring kn-ring--som"><span>可获得 <b>${escapeHtml(somV)}</b></span></div>`
    : "";
  return `<div class="kn-rings"><div class="kn-ring kn-ring--tam"><span>总市场 <b>${escapeHtml(tamV)}</b></span><div class="kn-ring kn-ring--sam"><span>可服务 <b>${escapeHtml(samV)}</b></span>${som}</div></div></div>`;
}

export function renderRoleStripLead(md: string): string {
  if (!/五个角色|Journey Scope|旅程范围/iu.test(md)) return "";
  const roles = [
    [/项目管理员/u, "项目管理员"],
    [/\bCore\b|核心成员/u, "核心成员"],
    [/\bBasic\b|只读/u, "只读成员"],
    [/协作方/u, "协作方"],
    [/系统管理员/u, "系统管理员"],
  ] as const;
  const hits = roles.filter(([re]) => re.test(md)).map(([, label]) => label);
  if (hits.length < 3) return "";
  return `<div class="kn-roles">${hits.map((r) => `<span>${escapeHtml(r)}</span>`).join("")}</div>`;
}

export function renderNetworkDefLead(md: string): string {
  const included = bodyItems(
    headingBody(md, /纳入对象|included|首阶段纳入/iu),
    6,
  );
  const notLimit = bodyItems(
    headingBody(md, /不以以下|不限制|not limited|不作为门槛/iu),
    6,
  );
  if (included.length < 2 || notLimit.length < 2) return "";
  return splitHtml(
    "首阶段纳入",
    included.map((s) => localizeKnText(s)),
    "不作为门槛",
    notLimit.map((s) => localizeKnText(s)),
    "go",
    "stop",
  );
}

export function renderNetworkScaleLead(md: string): string {
  const tables = parseTables(md);
  const table = tables.find(
    (t) =>
      t.rows.length >= 2 &&
      t.rows.filter((r) => /^(5|10|25)\b/u.test(stripInlineMd(r[0] ?? ""))).length >= 2,
  );
  if (!table) return "";
  const srcI = Math.max(1, colIndex(table.headers, /关系|来源|source/iu));
  const actI = colIndex(table.headers, /行为|门槛|threshold|有效/iu);
  const bizI = colIndex(table.headers, /商业|运营|business/iu);
  const nodes = table.rows
    .map((row) => {
      const n = stripInlineMd(row[0] ?? "").replace(/[^\d]/gu, "");
      if (!n) return null;
      const src = clip(row[srcI] ?? "", 36);
      const act = actI >= 0 ? clip(row[actI] ?? "", 48) : "";
      const biz = bizI >= 0 ? clip(row[bizI] ?? "", 48) : "";
      const width = n === "5" ? 46 : n === "10" ? 70 : 100;
      return { n: Number(n) || 0, html: `<li class="kn-pyramid__tier" style="--w:${width}%"><span class="kn-pyramid__n">${escapeHtml(n)}</span><div class="kn-pyramid__body"><p class="kn-pyramid__src">${escapeHtml(src)}</p>${act ? `<p>${escapeHtml(act)}</p>` : ""}${biz ? `<p>${escapeHtml(biz)}</p>` : ""}</div></li>` };
    })
    .filter((x): x is { n: number; html: string } => Boolean(x))
    .sort((a, b) => a.n - b.n)
    .map((x) => x.html);
  if (nodes.length < 2) return "";
  return `<div class="kn-pyramid"><p class="kn-chart__cap">活跃机构</p><ol>${nodes.join("")}</ol></div>`;
}

const ANTI_PATTERN_LEAD =
  /^(?:Boiling the ocean|Building in stealth|Premature scaling|Solution looking(?: for a problem)?|Ignoring unit economics)\s*[.。:：—–-]?\s*/iu;

function extractMdSection(md: string, titleRe: RegExp): string {
  const lines = md.replace(/^\uFEFF/, "").split(/\r?\n/u);
  for (let i = 0; i < lines.length; i += 1) {
    const h = /^(#{1,6})\s+(.+)$/u.exec((lines[i] ?? "").trim());
    if (!h || !titleRe.test(h[2]!.trim())) continue;
    const rank = h[1]!.length;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const n = /^(#{1,6})\s+(.+)$/u.exec((lines[j] ?? "").trim());
      if (n && n[1]!.length <= rank && !/^\d+[.)]/.test(n[2]!.trim())) break;
      body.push(lines[j] ?? "");
    }
    return body.join("\n");
  }
  return md;
}

function splitFixChunk(chunk: string): { body: string; fix: string } {
  const fixM =
    /\*\*(?:对策|Mitigation)[:：]?\*\*\s*([\s\S]+?)(?=\n{2,}\d+[.)]|\n#{1,6}\s|$)/iu.exec(
      chunk,
    ) ?? /(?:对策|Mitigation)[:：]\s*([\s\S]+)/iu.exec(chunk);
  const body = chunk
    .replace(/\*\*(?:对策|Mitigation)[:：]?\*\*[\s\S]*$/iu, "")
    .replace(/(?:^|\n)\*?\*?(?:对策|Mitigation)[:：][\s\S]*$/iu, "")
    .trim();
  return {
    body: clip(body, 220),
    fix: clip((fixM?.[1] ?? "").trim(), 200),
  };
}

type RiskItem = { n: string; title: string; body: string; fix: string };

function parseRiskItems(block: string): RiskItem[] {
  const headingHits = [...block.matchAll(/^#{2,4}\s+(\d+)[.)]\s+(.+)$/gmu)];
  const listHits = [
    ...block.matchAll(/^(\d+)[.)]\s+(?:\*\*([^*]+)\*\*|([^\n*].*?))\s*$/gmu),
  ];
  const hits =
    headingHits.length >= 2
      ? headingHits
      : listHits.filter((m) => {
          const title = (m[2] ?? m[3] ?? "").trim();
          return title.length > 0 && title.length < 80;
        });
  if (hits.length < 2) return [];
  return hits.slice(0, 4).map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end =
      i + 1 < hits.length ? (hits[i + 1]!.index ?? block.length) : block.length;
    const { body, fix } = splitFixChunk(block.slice(start, end));
    const title = stripInlineMd((m[2] ?? m[3] ?? "").trim());
    return { n: m[1] ?? String(i + 1), title, body, fix };
  });
}

export function riskCardsHtml(block: string): string {
  const items = parseRiskItems(block).filter((it) => it.title);
  if (items.length < 2) return "";
  if (items.filter((it) => it.fix).length < 2 && items.length < 3) return "";
  const cards = items.map((it) => {
    const title = escapeHtml(localizeKnText(it.title));
    const body = it.body
      ? `<p>${escapeHtml(localizeKnText(it.body))}</p>`
      : "";
    const fix = it.fix
      ? `<p>${escapeHtml(localizeKnText(it.fix))}</p>`
      : "<p>待补</p>";
    return `<article class="kn-risk-pair"><div class="kn-risk-pair__n">${escapeHtml(it.n)}</div><div class="kn-risk-card kn-risk-card--risk"><p class="kn-risk-card__k">风险</p><h3>${title}</h3>${body}</div><div class="kn-risk-card kn-risk-card--fix"><p class="kn-risk-card__k">对策</p>${fix}</div></article>`;
  });
  return `<div class="kn-risks">${cards.join("")}</div>`;
}

export function renderTopRisksLead(md: string): string {
  const scoped = extractMdSection(
    md,
    /三大风险|Top three risks|风险与对策/iu,
  );
  return riskCardsHtml(scoped) || riskCardsHtml(md);
}

const ANTI_NAMES =
  /Boiling the ocean|Building in stealth|Premature scaling|Solution looking(?: for a problem)?|Ignoring unit economics/iu;

export function stripAntiPatternName(s: string): string {
  return s
    .replace(/^\*\*([^*]+)\*\*[.。:：—–-]*\s*/u, (_all, name: string) =>
      ANTI_NAMES.test(name) ? "" : _all,
    )
    .replace(ANTI_PATTERN_LEAD, "")
    .trim();
}

export function antiPatternListHtml(block: string): string {
  const items: string[] = [];
  const hits = [...block.matchAll(/^(\d+)[.)]\s+(.+)$/gmu)];
  if (hits.length >= 2) {
    for (let i = 0; i < hits.length; i += 1) {
      const start = (hits[i]!.index ?? 0) + hits[i]![0].length;
      const end =
        i + 1 < hits.length
          ? (hits[i + 1]!.index ?? block.length)
          : block.length;
      const head = stripAntiPatternName(stripInlineMd(hits[i]![2] ?? ""));
      const rest = stripAntiPatternName(
        stripInlineMd(block.slice(start, end)),
      );
      const text = [head, rest].filter(Boolean).join(" ").trim();
      if (text && /[\u4e00-\u9fff]/.test(text)) items.push(text);
    }
  }
  if (items.length < 2) return "";
  return `<ol class="kn-pitfalls">${items
    .slice(0, 8)
    .map((t) => `<li>${escapeHtml(localizeKnText(t))}</li>`)
    .join("")}</ol>`;
}

export function renderAntiPatternsLead(md: string): string {
  if (!/常见误区|Anti-patterns?/iu.test(md)) return "";
  return antiPatternListHtml(
    extractMdSection(md, /常见误区|Anti-patterns?/iu),
  );
}

const FILE_LEADS: Record<string, Array<(md: string) => string>> = {
  "competitor-landscape": [
    renderBattleCardsLead,
    renderFeatureMatrixLead,
    renderPriceBandLead,
  ],
  positioning: [renderPositionSplitLead, renderPositionAxesLead],
  "market-analysis": [renderMarketStatsLead, renderMarketRingsLead],
  "lean-canvas": [renderLeanCanvasLead],
  scorecard: [renderScoreHeroLead],
  "research-gate": [renderResearchGateLead],
  "target-audience": [renderAudienceLead],
  "mvp-definition": [renderMvpSplitLead],
  "industry-trends": [renderTrendSplitLead],
  "value-proposition": [renderValuePropLead],
  "user-journey": [renderRoleStripLead, renderJourneyMapLead, renderJourneyLead],
  "go-to-market": [
    renderLoopLead,
    renderNumberedJourneyLead,
    renderNetworkDefLead,
    renderNetworkScaleLead,
  ],
  "action-plan-30-days": [],
  "feature-prioritization": [
    (md) => renderMoscowKanbanLead(md) || renderMoscowStatsLead(md),
  ],
  "cost-structure": [renderCostStatsLead],
  "business-model": [renderUnitEconLead],
  "revenue-model": [renderUnitEconLead],
  projections: [renderProjectionLead],
  "confidence-dashboard": [renderCoverageLead],
  "risk-analysis": [renderTopRisksLead, renderRiskHeatmapLead],
  "assumptions-tracker": [renderAssumptionFoldsLead],
  "kill-criteria": [renderTripwireLead],
  "validation-playbook": [renderTripwireLead, renderExperimentScoreLead],
  "experiment-design": [renderExperimentScoreLead],
};

export function renderSpecialLead(md: string, fileId?: string): string {
  const id = (fileId ?? "").trim();
  const mapped = FILE_LEADS[id];
  if (mapped) {
    return mapped
      .map((fn) => fn(md))
      .filter(Boolean)
      .join("\n");
  }
  const chunks: string[] = [];
  const add = (html: string) => {
    if (html) chunks.push(html);
  };
  add(
    id === "lean-canvas" ||
      /##\s+\d+\.\s+(Problem|问题)/iu.test(md) ||
      /#{2,6}\s+[一二三四五六七八九十]+、问题/u.test(md)
      ? renderLeanCanvasLead(md)
      : "",
  );
  add(
    id === "competitor-landscape" || /Key Strength|核心优势|主要优势|强项/iu.test(md)
      ? renderBattleCardsLead(md)
      : "",
  );
  add(
    id === "scorecard" ||
      /##\s+Scorecard|综合总评/iu.test(md) ||
      (/\|\s*(Dimension|维度)\s*\|/iu.test(md) && /Overall|综合/iu.test(md))
      ? renderScoreHeroLead(md)
      : "",
  );
  add(
    id === "research-gate" ||
      /Green light|Yellow light|Red light|研究闸门|绿灯|黄灯|红灯/iu.test(md)
      ? renderResearchGateLead(md)
      : "",
  );
  add(
    id === "positioning" ||
      /Competitive Alternatives|竞争替代|替代方案/iu.test(md)
      ? renderPositionSplitLead(md)
      : "",
  );
  add(
    id === "target-audience" ||
      /Anti-?persona|反客群|不服务谁|目标用户/iu.test(md)
      ? renderAudienceLead(md)
      : "",
  );
  add(
    id === "mvp-definition" || /out of scope|明确不做|首版做/iu.test(md)
      ? renderMvpSplitLead(md)
      : "",
  );
  add(
    id === "industry-trends" || /Tailwind|Headwind|顺风|逆风/iu.test(md)
      ? renderTrendSplitLead(md)
      : "",
  );
  add(
    id === "value-proposition" || /Jobs-to-be-done|要完成的事|要完成的工作/iu.test(md)
      ? renderValuePropLead(md)
      : "",
  );
  add(
    /五个角色|Journey Scope|旅程范围/iu.test(md) ? renderRoleStripLead(md) : "",
  );
  add(renderJourneyMapLead(md));
  add(
    id === "user-journey" ||
      /#{2,6}\s+(?:Journey|旅程|阶段|Step|步骤)\s*1/iu.test(md)
      ? renderJourneyLead(md)
      : "",
  );
  add(renderLoopLead(md));
  add(
    collectLoopStations(md).length >= 5
      ? ""
      : id === "go-to-market" ||
          /First 100|Launch strategy|前\s*100|启动策略|Activation Motion|启动动作/iu.test(
            md,
          )
        ? renderNumberedJourneyLead(md)
        : "",
  );
  add(
    /纳入对象|不以以下|Initial Network/iu.test(md)
      ? renderNetworkDefLead(md)
      : "",
  );
  add(
    /5\s*→\s*10\s*→\s*25|Network Plan|网络计划/iu.test(md)
      ? renderNetworkScaleLead(md)
      : "",
  );
  add(
    id === "feature-prioritization" || /Must Have|必须有|必须具备/iu.test(md)
      ? renderMoscowKanbanLead(md) || renderMoscowStatsLead(md)
      : "",
  );
  add(
    id === "market-analysis" ? renderMarketStatsLead(md) : "",
  );
  add(
    id === "cost-structure" || /Runway|月消耗|跑道/iu.test(md)
      ? renderCostStatsLead(md)
      : "",
  );
  add(
    id === "business-model" ||
      id === "revenue-model" ||
      /获客成本|\bCAC\b|\bLTV\b|单位经济/iu.test(md)
      ? renderUnitEconLead(md)
      : "",
  );
  add(
    id === "projections" || /三年预测|第一年[\s\S]{0,80}第二年/iu.test(md)
      ? renderProjectionLead(md)
      : "",
  );
  add(
    id === "confidence-dashboard" ||
      /Highest confidence|Critical unknown|最高把握|关键未知/iu.test(md)
      ? renderCoverageLead(md)
      : "",
  );
  add(
    id === "risk-analysis" ||
      (/Likelihood/iu.test(md) && /Impact/iu.test(md))
      ? renderRiskHeatmapLead(md)
      : "",
  );
  add(
    id === "assumptions-tracker" ||
      (/\|[^|\n]*假设[^|\n]*\|/u.test(md) && /状态|Status/iu.test(md))
      ? renderAssumptionFoldsLead(md)
      : "",
  );
  add(
    id === "kill-criteria" ||
      id === "validation-playbook" ||
      /Kill Criteria|失效条件|停止标准/iu.test(md)
      ? renderTripwireLead(md)
      : "",
  );
  add(
    id === "validation-playbook" ||
      (/实验/u.test(md) && /结果/u.test(md))
      ? renderExperimentScoreLead(md)
      : "",
  );
  return chunks.join("\n");
}
