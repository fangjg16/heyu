/**
 * 把合域这类 startup 总文件里能对上的块，收成知识网络现成元件。
 * 正文仍按 Markdown 渲；这些块叠在章节顶部当「一眼能看的版式」。
 */

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
    .replace(/\[(?:Data|Opinion|Assumption|Gap|Estimate)[^\]]*\]/giu, "")
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
  return title.replace(/^\d+\.\s+/u, "").trim();
}

function sectionBy(
  sections: Array<{ title: string; body: string }>,
  re: RegExp,
): string {
  const hit = sections.find((s) => re.test(normTitle(s.title)));
  return hit?.body ?? "";
}

function compactItems(body: string, max = 4): string[] {
  if (!body.trim()) return [];
  const h3 = [...body.matchAll(/^###\s+(.+)$/gmu)].map((m) =>
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
  { label: "方案", re: /^solution$|^方案/iu, cls: "" },
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
  const sections = splitMarkdownH2(md);
  const filled = CANVAS_SLOTS.filter((slot) =>
    sections.some((s) => slot.re.test(normTitle(s.title))),
  );
  if (filled.length < 6) return "";
  const cells = CANVAS_SLOTS.map((slot) => {
    const body = sectionBy(sections, slot.re);
    const extra = slot.cls ? ` ${slot.cls}` : "";
    return `<div class="kn-canvas__cell${extra}"><div class="kn-canvas__label">${escapeHtml(slot.label)}</div>${itemsUl(compactItems(body, 3))}</div>`;
  }).join("");
  return `<div class="kn-canvas">${cells}</div>`;
}

export function renderBattleCardsLead(md: string): string {
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const name = colIndex(t.headers, /name|^名称|^对手|^竞品/iu);
    const str = colIndex(t.headers, /strength|优势|差异/iu);
    const weak = colIndex(t.headers, /weakness|缺口|弱点/iu);
    return name >= 0 && str >= 0 && weak >= 0 && t.rows.length >= 2;
  });
  if (!table) return "";
  const nameI = colIndex(table.headers, /name|^名称|^对手|^竞品/iu);
  const strI = colIndex(table.headers, /strength|优势|差异/iu);
  const weakI = colIndex(table.headers, /weakness|缺口|弱点/iu);
  const cards = table.rows.slice(0, 8).map((row) => {
    const name = clip(row[nameI] ?? "", 40);
    const diff = clip(row[strI] ?? "", 96);
    const play = clip(row[weakI] ?? "", 96);
    return `<div class="kn-battle"><div class="kn-battle__name">${escapeHtml(name)}</div><div class="kn-battle__row"><span class="kn-battle__k">差异 · </span>${escapeHtml(diff)}</div><div class="kn-battle__row"><span class="kn-battle__k">可打 · </span>${escapeHtml(play)}</div></div>`;
  });
  if (cards.length === 0) return "";
  return `<div class="kn-battles">${cards.join("")}</div>`;
}

export function renderScoreHeroLead(md: string): string {
  const tables = parseTables(md);
  const table = tables.find((t) => {
    const dim = colIndex(t.headers, /dimension|维度/iu);
    const score = colIndex(t.headers, /score|分数/iu);
    return dim >= 0 && score >= 0;
  });
  if (!table) return "";
  const dimI = colIndex(table.headers, /dimension|维度/iu);
  const scoreI = colIndex(table.headers, /score|分数/iu);
  const overall =
    table.rows.find((r) => /overall|综合/iu.test(r[dimI] ?? "")) ??
    table.rows[table.rows.length - 1];
  if (!overall) return "";
  const score = stripInlineMd(overall[scoreI] ?? "").replace(/[^\d.]/gu, "");
  if (!score) return "";
  const verdict = /VERDICT[:：]?\s*([^\n*]+)/iu.exec(md)?.[1]?.trim();
  const note = verdict
    ? escapeHtml(clip(verdict, 80))
    : escapeHtml("综合评分");
  return `<div class="kn-hero"><div><div class="kn-hero__label">综合</div><div class="kn-hero__value">${escapeHtml(score)}</div></div><p class="kn-hero__note">${note}</p></div>`;
}

export function renderPositionSplitLead(md: string): string {
  const sections = splitMarkdownH2(md);
  const alt = sectionBy(sections, /competitive alternative|替代/iu);
  const uniq = sectionBy(sections, /unique attribute|独有|差异化属性/iu);
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
    ...md.matchAll(/^##\s+(?:Journey|旅程)\s+(\d+)\s*[—–:-]\s*(.+)$/gmu),
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
  const weeks = [...md.matchAll(/^##\s+(Week\s+\d+|第[一二三四1-4]周)[^\n]*$/gmu)];
  if (weeks.length < 2) return "";
  const sections = splitMarkdownH2(md);
  const items = weeks.map((m) => {
    const title = (m[1] ?? "").trim();
    const sec = sections.find((s) => s.title.startsWith(m[0]!.replace(/^##\s+/u, "")));
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
    const sec = splitMarkdownH2(md).find((s) => re.test(s.title));
    if (!sec) return 0;
    const tables = parseTables(sec.body);
    if (tables[0]?.rows.length) return tables[0]!.rows.length;
    return compactItems(sec.body, 40).length;
  };
  const must = countRows(/must[- ]?have|^must\b/iu);
  const should = countRows(/should[- ]?have|^should\b/iu);
  const could = countRows(/could[- ]?have|^could\b/iu);
  const wont = countRows(/won'?t[- ]?have|^won'?t\b/iu);
  if ([must, should, could, wont].filter((n) => n > 0).length < 3) return "";
  const cell = (label: string, n: number) =>
    `<div class="kn-stat"><div class="kn-stat__label">${escapeHtml(label)}</div><div class="kn-stat__value">${n}</div></div>`;
  return `<div class="kn-stats kn-stats--4">${cell("Must", must)}${cell("Should", should)}${cell("Could", could)}${cell("Won't", wont)}</div>`;
}

function baselineArr(table: MdTable | undefined): string {
  if (!table) return "";
  const row =
    table.rows.find((r) => /基准|base/iu.test(r.join(" "))) ?? table.rows[1];
  if (!row) return "";
  const joined = row.join(" ");
  const m = /US\$[\d.]+[kmb]\s*ARR/iu.exec(joined) ?? /US\$[\d.,]+[kmb]?/iu.exec(joined);
  return m?.[0] ?? stripInlineMd(row[row.length - 1] ?? "");
}

export function renderMarketStatsLead(md: string): string {
  const tables = parseTables(md);
  const tam = tables.find((t) =>
    t.headers.some((h) => /planning tam|\bTAM\b/iu.test(h)),
  );
  const sam = tables.find((t) =>
    t.headers.some((h) => /planning sam|\bSAM\b/iu.test(h)),
  );
  if (!tam && !sam) return "";
  const som = tables.find((t) =>
    t.headers.some((h) => /planning som|\bSOM\b|可获得/iu.test(h)),
  );
  const tamV = baselineArr(tam);
  const samV = baselineArr(sam);
  const somV = baselineArr(som);
  if (!tamV && !samV) return "";
  const cell = (label: string, value: string) =>
    `<div class="kn-stat"><div class="kn-stat__label">${escapeHtml(label)}</div><div class="kn-stat__value">${escapeHtml(clip(value || "待补", 18))}</div><div class="kn-stat__note">规划口径</div></div>`;
  return `<div class="kn-stats">${cell("总市场", tamV)}${cell("可服务", samV)}${cell("可获得", somV)}</div>`;
}

export function renderSpecialLead(md: string, fileId?: string): string {
  const id = (fileId ?? "").trim();
  const chunks: string[] = [];
  const canvas =
    id === "lean-canvas" || /##\s+\d+\.\s+Problem/iu.test(md)
      ? renderLeanCanvasLead(md)
      : "";
  if (canvas) chunks.push(canvas);
  const battles =
    id === "competitor-landscape" || /Key Strength/iu.test(md)
      ? renderBattleCardsLead(md)
      : "";
  if (battles) chunks.push(battles);
  const hero =
    id === "scorecard" ||
    /##\s+Scorecard/iu.test(md) ||
    (/\|\s*Dimension\s*\|/iu.test(md) && /Overall/iu.test(md))
      ? renderScoreHeroLead(md)
      : "";
  if (hero) chunks.push(hero);
  const split =
    id === "positioning" || /Competitive Alternatives/iu.test(md)
      ? renderPositionSplitLead(md)
      : "";
  if (split) chunks.push(split);
  const journey =
    id === "user-journey" || /##\s+(?:Journey|旅程)\s+1/iu.test(md)
      ? renderJourneyLead(md)
      : "";
  if (journey) chunks.push(journey);
  const weeks =
    id === "action-plan-30-days" || /##\s+Week\s+1/iu.test(md)
      ? renderWeekTimelineLead(md)
      : "";
  if (weeks) chunks.push(weeks);
  const moscow =
    id === "feature-prioritization" || /Must Have/iu.test(md)
      ? renderMoscowStatsLead(md)
      : "";
  if (moscow) chunks.push(moscow);
  const market =
    id === "market-analysis" || /Planning TAM/iu.test(md)
      ? renderMarketStatsLead(md)
      : "";
  if (market) chunks.push(market);
  return chunks.join("\n");
}
