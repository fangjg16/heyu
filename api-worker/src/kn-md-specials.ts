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

function compactItems(body: string, max = 4): string[] {
  if (!body.trim()) return [];
  const h3 = [...body.matchAll(/^#{2,6}\s+(.+)$/gmu)].map((m) =>
    clip(m[1] ?? "", 72),
  );
  if (h3.length >= 2) return h3.slice(0, max);
  const bullets = [...body.matchAll(/^[-*]\s+(.+)$/gmu)].map((m) =>
    clip(m[1] ?? ""),
  );
  if (bullets.length > 0) return bullets.slice(0, max);
  const nums = [...body.matchAll(/^\d+[.)]\s+(.+)$/gmu)].map((m) =>
    clip(m[1] ?? ""),
  );
  if (nums.length > 0) return nums.slice(0, max);
  const para = body
    .split(/\n\s*\n/u)
    .map((p) => clip(p.replace(/^>\s?/gmu, ""), 100))
    .filter(Boolean);
  return para.slice(0, 2);
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
    ? `<p class="kn-hero__note"><span class="kn-hero__verdict">${escapeHtml(note)}</span></p>`
    : "";
  return `<div class="kn-hero${varCls}${toneCls}"><div class="kn-hero__score"><div class="kn-hero__label">综合</div><div class="kn-hero__value">${escapeHtml(score)}<span class="kn-hero__den">/10</span></div></div>${verdict}</div>`;
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
    ? clip(localizeKnText(verdict), 80)
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
  const altItems = (() => {
    const tables = parseTables(alt);
    if (tables[0]?.rows.length) {
      return tables[0]!.rows.slice(0, 6).map((r) => clip(r[0] ?? "", 72));
    }
    return compactItems(alt, 5);
  })();
  const uniqItems = compactItems(uniq, 5);
  if (altItems.length === 0 || uniqItems.length === 0) return "";
  return `<div class="kn-split"><div class="kn-split__col kn-split__col--stop"><div class="kn-split__title">替代方案</div>${itemsUl(altItems)}</div><div class="kn-split__col kn-split__col--go"><div class="kn-split__title">我们独有</div>${itemsUl(uniqItems)}</div></div>`;
}

export function renderJourneyLead(md: string): string {
  const journeys = [
    ...md.matchAll(
      /^#{2,6}\s+(?:Journey|旅程|阶段)\s*(\d+)\s*(?:[—–:：-]\s*)?(.*)$/gmu,
    ),
  ];
  if (journeys.length < 2) return "";
  const steps = journeys.slice(0, 6).map((m) => {
    const n = escapeHtml(m[1] ?? "");
    const raw = (m[2] ?? "").trim();
    const [who, what] = raw.split(/：|:\s*/u, 2);
    return `<div class="kn-journey__step"><div class="kn-journey__n">${n}</div><div class="kn-journey__title">${escapeHtml(clip(who || raw, 28))}</div>${what ? `<div class="kn-journey__note">${escapeHtml(clip(what, 64))}</div>` : ""}</div>`;
  });
  return `<div class="kn-journey">${steps.join("")}</div>`;
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
  return m ? clip(m[0].replace(/\s+/gu, " "), 18) : "";
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
  const table = tables.find(
    (t) =>
      t.headers.some((h) => tableRe.test(h)) ||
      t.rows.some((r) => tableRe.test(r[0] ?? "")),
  );
  if (table) {
    const scaleI = colIndex(table.headers, /规模|size|金额|数值/iu);
    const row = table.rows.find((r) => tableRe.test(r[0] ?? "")) ?? table.rows[0];
    const scale = stripInlineMd(row?.[scaleI >= 0 ? scaleI : 1] ?? "");
    if (/^待补/u.test(scale)) return "待补";
  }
  return (
    baselineArr(table) ||
    firstMoney(headingBody(md, headingRe)) ||
    metricNear(md, headingRe)
  );
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
  const cell = (label: string, value: string) =>
    `<div class="kn-stat"><div class="kn-stat__label">${escapeHtml(label)}</div><div class="kn-stat__value">${escapeHtml(clip(value, 18))}</div><div class="kn-stat__note">规划口径</div></div>`;
  const parts = [
    tamV ? cell("总市场", tamV) : "",
    samV ? cell("可服务", samV) : "",
    somV ? cell("可获得", somV) : "",
  ].filter(Boolean);
  return `<div class="kn-stats">${parts.join("")}</div>`;
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

export function renderResearchGateLead(md: string): string {
  const state = gateState(md);
  if (!state) return "";
  const whySrc =
    headingBody(md, /recommendation|verdict|判断|结论|rationale/iu) ||
    compactItems(md.replace(/^# .+$/mu, ""), 1)[0] ||
    "";
  const on = (s: "buy" | "conditional" | "pass") =>
    s === state ? " is-on" : "";
  const why = whySrc
    ? `<p class="kn-gate__why">${escapeHtml(clip(whySrc, 140))}</p>`
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

export function renderAudienceLead(md: string): string {
  const serve =
    headingBody(md, /primary persona|首要|主客群|目标客群|目标用户|核心痛点|痛点人群/iu) ||
    headingBody(md, /^persona\b|客群/iu);
  const avoid =
    headingBody(md, /anti-?persona|反客群|不服务|who not|不要服务|明确不做/iu) ||
    audienceAvoidFromTable(serve || md);
  const split = splitHtml(
    "服务谁",
    bodyItems(serve, 4),
    "不服务谁",
    bodyItems(avoid, 4),
    "go",
    "stop",
  );
  const quote = firstQuote(serve || md);
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
  const existing = renderJourneyLead(md);
  if (existing) return existing;
  const numbered = [...md.matchAll(/^\d+[.)]\s+(.+)$/gmu)].map((m) =>
    clip(m[1] ?? "", 64),
  );
  if (numbered.length < 3) return "";
  const steps = numbered.slice(0, 6).map((title, i) => {
    const n = String(i + 1);
    return `<div class="kn-journey__step"><div class="kn-journey__n">${n}</div><div class="kn-journey__title">${escapeHtml(title)}</div></div>`;
  });
  return `<div class="kn-journey">${steps.join("")}</div>`;
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

function renderFeatureRadar(table: MdTable): string {
  const dims = table.rows
    .map((r) => clip(r[0] ?? "", 16))
    .filter(Boolean);
  if (dims.length < 5) return "";
  const series = table.headers
    .slice(1)
    .map((h, j) => ({
      name: clip(h, 14),
      values: table.rows.map((r) => featScore(featTone(r[j + 1] ?? ""))),
    }))
    .filter((s) => s.name && s.values.some((v) => v > 0));
  if (series.length < 2) return "";
  const n = dims.length;
  const cx = 160;
  const cy = 160;
  const maxR = 108;
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
      const lx = (cx + (maxR + 22) * Math.cos(a)).toFixed(1);
      const ly = (cy + (maxR + 22) * Math.sin(a)).toFixed(1);
      return `<line class="kn-radar__axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" /><text class="kn-radar__label" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(d)}</text>`;
    })
    .join("");
  const palette = ["#7A3B36", "#4A5E6D", "#A67C4A", "#3D6B52", "#8A5A3C"];
  const polys = series
    .slice(0, 5)
    .map((s, si) => {
      const color = palette[si % palette.length]!;
      const points = s.values.map((v, i) => pt(i, v)).join(" ");
      return `<polygon class="kn-radar__poly" points="${points}" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="1.6" />`;
    })
    .join("");
  const legend = series
    .slice(0, 5)
    .map((s, si) => {
      const color = palette[si % palette.length]!;
      return `<span class="kn-radar__leg"><i style="background:${color}"></i>${escapeHtml(s.name)}</span>`;
    })
    .join("");
  return `<div class="kn-radar"><svg viewBox="0 0 320 320" role="img" aria-label="能力对比">${grid}${axes}${polys}</svg><div class="kn-radar__legend">${legend}</div></div>`;
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
      const name = clip(row[nameI] ?? "", 12);
      const raw = row[priceI] ?? "";
      const n = Number.parseFloat(raw.replace(/[^\d.]/gu, ""));
      if (!name || !Number.isFinite(n) || n <= 0) return null;
      return { name, n, label: firstMoney(raw) || clip(raw, 12) };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  if (items.length < 2) return "";
  const nums = items.map((i) => i.n);
  const ticks = items
    .slice(0, 8)
    .map((it) => {
      const left = Math.min(92, Math.max(8, moneyPct(nums, it.n)));
      const ours = /我们|本产品|^us$|^our\b/iu.test(it.name);
      const cls = ours ? " kn-priceband__tick--us" : "";
      return `<span class="kn-priceband__tick${cls}" style="left:${left}%"><b>${escapeHtml(it.name)}</b><i>${escapeHtml(it.label)}</i></span>`;
    })
    .join("");
  return `<div class="kn-priceband"><div class="kn-priceband__track">${ticks}</div><div class="kn-priceband__scale"><span>低价</span><span>高价</span></div></div>`;
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
  const som = somV
    ? `<div class="kn-ring kn-ring--som"><span>可获得 <b>${escapeHtml(somV)}</b></span></div>`
    : "";
  return `<div class="kn-rings"><div class="kn-ring kn-ring--tam"><span>总市场 <b>${escapeHtml(tamV)}</b></span><div class="kn-ring kn-ring--sam"><span>可服务 <b>${escapeHtml(samV)}</b></span>${som}</div></div></div>`;
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
  "user-journey": [renderJourneyLead],
  "go-to-market": [renderNumberedJourneyLead],
  "action-plan-30-days": [renderWeekTimelineLead],
  "feature-prioritization": [renderMoscowStatsLead],
  "cost-structure": [renderCostStatsLead],
  "business-model": [renderUnitEconLead],
  "revenue-model": [renderUnitEconLead],
  projections: [renderProjectionLead],
  "confidence-dashboard": [renderCoverageLead],
  "risk-analysis": [renderRiskHeatmapLead],
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
    id === "user-journey" ||
      /#{2,6}\s+(?:Journey|旅程|阶段)\s*1/iu.test(md)
      ? renderJourneyLead(md)
      : "",
  );
  add(
    id === "go-to-market" || /First 100|Launch strategy|前\s*100|启动策略/iu.test(md)
      ? renderNumberedJourneyLead(md)
      : "",
  );
  add(
    id === "action-plan-30-days" ||
      /#{2,6}\s+(Week\s+1|第\s*[一1]\s*周)/iu.test(md)
      ? renderWeekTimelineLead(md)
      : "",
  );
  add(
    id === "feature-prioritization" || /Must Have|必须有|必须具备/iu.test(md)
      ? renderMoscowStatsLead(md)
      : "",
  );
  add(
    id === "market-analysis" || /Planning TAM|总市场|可服务市场/iu.test(md)
      ? renderMarketStatsLead(md)
      : "",
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
