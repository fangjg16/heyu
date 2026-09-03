/**
 * 把资料包 Markdown 总文件渲成知识网络章节 HTML。
 * 模板不再让模型填骨架，只做呈现：class + kn-elements.css。
 */

import {
  antiPatternListHtml,
  renderSpecialLead,
  riskCardsHtml,
  scoreHeroHtml,
  stripAntiPatternName,
} from "./kn-md-specials";
import {
  evidenceTagPattern,
  localizeKnText,
  localizeOutsideTags,
  localizeTagLabel,
  tagKindFromLabel,
} from "./kn-md-zh";

const EMPTY_CHAPTER_HTML =
  '<div class="kn-callout"><p class="kn-callout__body">尚未开展</p></div>';

function escapeHtml(s: string): string {
  return s
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function tagKind(label: string): string {
  return tagKindFromLabel(label);
}

function inline(s: string): string {
  let t = escapeHtml(localizeOutsideTags(s));
  t = t.replace(/`([^`]*\.md)`/giu, "");
  t = t.replace(/\[\]\([^)]*\)/gu, "");
  t = t.replace(/\[[^\]]*\]\((?:https?:)?[^)]+\.md\)/giu, "");
  t = t.replace(
    evidenceTagPattern("inline"),
    (_m, label: string) => {
      const kind = tagKind(label);
      const extra = kind ? ` kn-md-tag--${kind}` : "";
      return `<span class="kn-md-tag${extra}">${escapeHtml(localizeTagLabel(label))}</span>`;
    },
  );
  t = t.replace(
    /`([^`]+)`/gu,
    (_m, code: string) => `<code>${code}</code>`,
  );
  t = t.replace(
    /\*\*([^*]+)\*\*/gu,
    (_m, body: string) => `<strong>${body}</strong>`,
  );
  t = t.replace(
    /(?<!\*)\*([^*]+)\*(?!\*)/gu,
    (_m, body: string) => `<em>${body}</em>`,
  );
  t = t.replace(
    /\[([^\]]+)\]\((https?:[^)\s]+)\)/gu,
    (_m, label: string, href: string) =>
      `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`,
  );
  return t;
}

function isTableSep(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
}

function tableHtml(rows: string[]): string {
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\|/u, "")
      .replace(/\|$/u, "")
      .split("|")
      .map((c) => c.trim());
  const head = cells(rows[0] ?? "");
  const body = rows.slice(2).map(cells);
  const heatmap =
    head.length >= 5 &&
    body.length >= 4 &&
    /可能性|likelihood/iu.test(head.join(" "));
  const badgeTone = (plain: string): "crit" | "high" | "mid" | "low" | null => {
    const t = plain.replace(/\*/gu, "").trim();
    if (!t) return null;
    if (/critical|crit|严重|fatal/iu.test(t)) return "crit";
    if (/medium[- –—]?high|中高/iu.test(t)) return "mid";
    if (/medium[- –—]?low|中偏低/iu.test(t)) return "low";
    if (/\bhigh\b|major|较高|^高$/iu.test(t)) return "high";
    if (/\blow\b|minor|偏低|^低$/iu.test(t)) return "low";
    if (/\bmedium\b|moderate|mid|中等|^中$/iu.test(t)) return "mid";
    return null;
  };
  const confI = head.findIndex((h) => /把握|confidence/iu.test(h));
  const cellHtml = (c: string, ci: number) => {
    const tone = badgeTone(c) ?? (ci === confI && c.trim() ? "mid" : null);
    const shown =
      ci === confI ? inline(tidyConfidence(c.replace(/\*/gu, "").trim())) : inline(c);
    if (/^待补/u.test(c.replace(/\*/gu, "").trim())) {
      return `<span class="kn-pending">${shown}</span>`;
    }
    if (!tone) return shown;
    return `<span class="kn-badge kn-badge--${tone}">${shown}</span>`;
  };
  if (
    head.length === 3 &&
    !(head[0] ?? "").trim() &&
    body.length === 2 &&
    body.every((r) => r.length >= 3)
  ) {
    const x1 = inline(head[1] ?? "");
    const x2 = inline(head[2] ?? "");
    const y1 = inline(body[0]?.[0] ?? "");
    const y2 = inline(body[1]?.[0] ?? "");
    const c11 = cellHtml(body[0]?.[1] ?? "", 1);
    const c12 = cellHtml(body[0]?.[2] ?? "", 2);
    const c21 = cellHtml(body[1]?.[1] ?? "", 1);
    const c22 = cellHtml(body[1]?.[2] ?? "", 2);
    return `<div class="kn-quad"><div class="kn-quad__corner"></div><div class="kn-quad__x">${x1}</div><div class="kn-quad__x">${x2}</div><div class="kn-quad__y">${y1}</div><div class="kn-quad__cell">${c11}</div><div class="kn-quad__cell">${c12}</div><div class="kn-quad__y">${y2}</div><div class="kn-quad__cell">${c21}</div><div class="kn-quad__cell kn-quad__cell--us">${c22}</div></div>`;
  }
  const thead = `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((r, ri) => {
      const tds = r
        .map((c, ci) => {
          if (heatmap && ci > 0) {
            const lik = 4 - Math.min(ri, 3);
            const imp = Math.min(ci, 4);
            const tones = [
              ["idle", "idle", "low", "mid"],
              ["idle", "low", "mid", "high"],
              ["low", "mid", "high", "crit"],
              ["mid", "high", "crit", "crit"],
            ];
            const tone = tones[lik - 1]?.[imp - 1] ?? "idle";
            return `<td class="kn-heat--${tone}">${inline(c)}</td>`;
          }
          return `<td>${cellHtml(c, ci)}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("")}</tbody>`;
  const cls = heatmap ? ' class="kn-heatmap"' : "";
  const table = `<div class="kn-table-wrap"><table${cls}>${thead}${tbody}</table></div>`;
  const looksJourney =
    /旅程|Journey|阶段|角色/iu.test(head.join(" ")) ||
    /旅程|Journey/iu.test(body.map((r) => r[0] ?? "").join(" "));
  if (!heatmap && !looksJourney && head.length >= 6 && body.length >= 3) {
    return `<details class="kn-fold kn-wide-table"><summary><span class="kn-fold__title">对照表</span><span class="kn-fold__count">${body.length} 行</span></summary>${table}</details>`;
  }
  return table;
}

function parseMetaLine(line: string): { key: string; value: string } | null {
  const t = line.trim();
  // **Key:** value
  let m = /^\*\*([^*]+?)[:：]\s*\*\*\s*(.+)$/u.exec(t);
  if (m) {
    const key = m[1]!.trim();
    const value = m[2]!.trim();
    if (key && value) return { key, value };
  }
  // **Key: value**  冒号写在加粗里面，合域 GPT 草案常用
  m = /^\*\*([^*]+?)[:：]\s+(.+?)\*\*\s*$/u.exec(t);
  if (m) {
    const key = m[1]!.trim();
    const value = m[2]!.trim().replace(/[。.]\s*$/u, "");
    if (key && value) return { key, value };
  }
  return null;
}

const DOC_META_KEY =
  /^(Phase|Project|Date|Confidence|Status|Verdict|Overall|阶段|项目|日期|把握|进度|判断|综合)$/iu;

const COVER_SKIP_KEY =
  /^(mitigation|category|overall threat|对策|应对)$/iu;

function isSectionConfLine(line: string): boolean {
  const m = parseMetaLine(line);
  return Boolean(m && /^section\s+confidence$|^本节把握$/iu.test(m.key));
}

function isDocMetaLine(line: string): boolean {
  const m = parseMetaLine(line);
  if (!m || isSectionConfLine(line)) return false;
  return DOC_META_KEY.test(m.key);
}

/** 文首所有 **Key:** 都收进封面，避免 Financial Model Stage 挡住后面的日期。 */
function isCoverMetaLine(line: string): boolean {
  const m = parseMetaLine(line);
  if (!m || isSectionConfLine(line)) return false;
  return !COVER_SKIP_KEY.test(m.key);
}

function metaId(key: string): string {
  const k = key.trim().toLowerCase();
  if (/^(phase|阶段)$/u.test(k)) return "phase";
  if (/^(project|项目)$/u.test(k)) return "project";
  if (/^(date|日期)$/u.test(k)) return "date";
  if (/^(confidence|把握)$/u.test(k)) return "confidence";
  if (/^(status|进度)$/u.test(k)) return "status";
  if (/^(verdict|判断)$/u.test(k)) return "verdict";
  if (/^(overall|综合)$/u.test(k)) return "overall";
  if (/^(currency|币种)$/u.test(k)) return "currency";
  if (/financial model|财务模型/u.test(k)) return "model";
  if (/validation status|验证状态/u.test(k)) return "validation";
  if (/^(objective|目标)$/u.test(k)) return "objective";
  return k;
}

function isProjectSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{7,}$/u.test(value.trim());
}

function tidyPhase(value: string): string {
  const stripped = value.replace(/^\d+\s*[—–\-:]\s*/u, "").trim();
  const map: Record<string, string> = {
    "final deliverable": "终稿",
    validation: "验证",
    "market research synthesis": "市场研究综合",
    "customer discovery": "用户访谈",
  };
  return map[stripped.toLowerCase()] ?? stripped;
}

function tidyConfidence(value: string): string {
  const map: Record<string, string> = {
    low: "把握偏低",
    medium: "把握中等",
    "medium-low": "把握中偏低",
    "medium-high": "把握中高",
    "low-medium": "把握中偏低",
    high: "把握较高",
  };
  const exact = map[value.trim().toLowerCase().replace(/[–—]/gu, "-")];
  if (exact) return exact;
  const raw = value.trim();
  if (/^medium\b/iu.test(raw) && /risk exists/iu.test(raw)) {
    return "中等（风险存在）";
  }
  if (/^medium[- –—]?high\b/iu.test(raw)) return "把握中高";
  if (/^medium[- –—]?low\b/iu.test(raw)) return "把握中偏低";
  return value.replace(
    /\b(medium-low|medium-high|low[–—-]medium|medium|low|high)\b/giu,
    (m) => map[m.toLowerCase().replace(/[–—]/gu, "-")] ?? m,
  );
}

function tidyVerdict(value: string): { word: string; score: string } {
  const score = /(\d+(?:\.\d+)?)\s*\/\s*10/u.exec(value)?.[1] ?? "";
  let word = value
    .replace(/\bVERDICT[:：]?\s*/iu, "")
    .replace(/\s*[—–-]\s*\d+(?:\.\d+)?\s*\/\s*10.*$/u, "")
    .trim();
  if (/^conditional\b/iu.test(word)) word = "有条件继续";
  else if (/^go\b/iu.test(word)) word = "可以继续";
  else if (/^no[- ]?go\b/iu.test(word)) word = "不宜继续";
  return { word, score };
}

function clipLede(value: string, n = 120): string {
  const t = value.split("|")[0]!.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n).trim()}…`;
}

function coverHtml(lines: string[]): string {
  const parsed = lines
    .map((line) => parseMetaLine(line))
    .filter((m): m is { key: string; value: string } => Boolean(m));
  if (parsed.length === 0) return "";
  const by: Record<string, string> = {};
  for (const m of parsed) by[metaId(m.key)] = m.value;

  const chips: string[] = [];
  if (by.currency) chips.push(escapeHtml(by.currency));
  if (by.model) {
    chips.push(escapeHtml(localizeKnText(clipLede(by.model, 40))));
  }
  if (by.project && !isProjectSlug(by.project)) {
    chips.push(escapeHtml(by.project));
  }
  const byline = chips.length
    ? `<p class="kn-dochead__byline">${chips.map((c) => `<span>${c}</span>`).join("")}</p>`
    : "";

  const rawVerdict = by.verdict || by.overall || "";
  let verdict = "";
  if (rawVerdict) {
    const { word, score } = tidyVerdict(rawVerdict);
    const note = localizeKnText(word);
    if (score) {
      verdict = scoreHeroHtml(score, note, "inline");
    } else {
      verdict = `<p class="kn-dochead__verdict"><span>${inline(note)}</span></p>`;
    }
  }

  const ledeBits = [
    by.status,
    by.confidence ? tidyConfidence(by.confidence) : "",
    by.validation ? clipLede(by.validation) : "",
    by.objective ? clipLede(by.objective) : "",
  ].filter(Boolean);
  const lede = ledeBits.length
    ? `<div class="kn-dochead__lede">${ledeBits.map((t) => `<p>${inline(t)}</p>`).join("")}</div>`
    : "";

  return `${byline}${verdict}${lede}`;
}

function isGateHeading(title: string): boolean {
  return /yellow\s*light|green\s*light|red\s*light|🟡|🟢|🔴|黄灯|绿灯|红灯/iu.test(
    title,
  );
}

function gateBannerHtml(title: string): string {
  return `<blockquote class="kn-callout"><p class="kn-callout__label">闸门</p><p class="kn-callout__body">${inline(title.replace(/^[🟡🟢🔴]\s*/u, ""))}</p></blockquote>`;
}

function isFoldHeading(title: string): boolean {
  return /^(?:\d+\.\s+)?(?:sources|references|来源|参考文献|附录|备注|方法说明|methodology|limitations|notes|appendix|document index|文件目录|文件索引)(?:\b|$|[：:\s])/iu.test(
    title,
  );
}

function isInternalIndexHeading(title: string): boolean {
  return /document index|文件目录|文件索引/iu.test(title);
}

function sectionConfHtml(value: string): string {
  return `<p class="kn-section-conf"><span class="kn-section-conf__k">本节把握</span> ${inline(tidyConfidence(value))}</p>`;
}

function isNumberedSectionTitle(title: string): boolean {
  return (
    /^\d+[.)、]\s+\S/u.test(title) || /^[一二三四五六七八九十]+、\S/u.test(title)
  );
}

function isSubHeadingTitle(title: string): boolean {
  if (isNumberedSectionTitle(title)) return false;
  if (/^[A-Za-z]\d{1,2}\s*[:：—–-]\s+\S/u.test(title)) return true;
  if (/^阶段\s*\d+/u.test(title)) return true;
  if (/^第[一二三四1-4]周/u.test(title)) return true;
  return /^\d+\.\d+(?:\.\d+)?\s+\S/u.test(title);
}

function headingInner(title: string): { cls: string; inner: string } {
  const numbered = /^(\d+)[.)、]\s+(\S.*)$/u.exec(title);
  if (numbered) {
    return {
      cls: "kn-md-h",
      inner: `<span class="kn-md-h__n">${escapeHtml(numbered[1]!)}.</span><span class="kn-md-h__t">${inline(localizeHeadingTitle(numbered[2]!))}</span>`,
    };
  }
  const cn = /^([一二三四五六七八九十]+)、(\S.*)$/u.exec(title);
  if (cn) {
    return {
      cls: "kn-md-h",
      inner: `<span class="kn-md-h__n">${escapeHtml(cn[1]!)}、</span><span class="kn-md-h__t">${inline(localizeHeadingTitle(cn[2]!))}</span>`,
    };
  }
  const code = /^([A-Za-z]\d{1,2})\s*[:：—–-]\s+(\S.*)$/u.exec(title);
  if (code) {
    return {
      cls: "kn-md-sub",
      inner: `<span class="kn-md-sub__k">${escapeHtml(code[1]!.toUpperCase())}</span><span class="kn-md-sub__t">${inline(code[2]!)}</span>`,
    };
  }
  const dec = /^(\d+\.\d+(?:\.\d+)?)\s+(\S.*)$/u.exec(title);
  if (dec) {
    return {
      cls: "kn-md-sub",
      inner: `<span class="kn-md-sub__k">${escapeHtml(dec[1]!)}</span><span class="kn-md-sub__t">${inline(dec[2]!)}</span>`,
    };
  }
  return { cls: "", inner: inline(localizeHeadingTitle(title)) };
}

function headingTagName(hashes: number, title: string): "h2" | "h3" | "h4" {
  if (hashes === 1) return "h2";
  if (isNumberedSectionTitle(title) || hashes === 2) return "h3";
  if (isSubHeadingTitle(title) || hashes >= 4) return "h4";
  return "h3";
}

function isChineseChapterTitle(line: string): boolean {
  return /^[一二三四五六七八九十]+、\S.{0,48}$/u.test(line) && !/[。！？]$/u.test(line);
}

function firstHeadingTitle(md: string): string {
  const m = /^#\s+(.+)$/mu.exec(md.replace(/^\uFEFF/, "").trim());
  return (m?.[1] ?? "").trim();
}

function markdownHasBody(md: string): boolean {
  return (
    md
      .replace(/^\uFEFF/, "")
      .trim()
      .replace(/^#\s+.+(?:\r?\n+|$)/u, "")
      .trim().length > 0
  );
}

function evidenceKind(title: string): "strong" | "weak" | null {
  const t = title.replace(/\*+/gu, "").trim();
  if (/strongest evidence|最强证据|最有力证据/iu.test(t)) return "strong";
  if (/weakest links?|最弱环节|最弱链接|最弱证据/iu.test(t)) return "weak";
  return null;
}

function evidenceCol(title: string, kind: "go" | "stop", body: string): string {
  const inner = markdownToKnHtmlInner(body).trim() || "<p>待补</p>";
  return `<div class="kn-split__col kn-split__col--${kind}"><div class="kn-split__title">${escapeHtml(localizeKnText(title))}</div>${inner}</div>`;
}

function taggedLine(
  line: string,
): { label: string; kind: string; rest: string } | null {
  const m = evidenceTagPattern("line").exec(line.trim());
  if (!m) return null;
  return {
    label: m[1]!,
    kind: tagKind(m[1]!) || "plain",
    rest: (m[2] ?? "").trim(),
  };
}

function isStructuralBoundary(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^(#{1,6})\s+/u.test(t)) return true;
  const bold = /^\*\*([^*]+)\*\*$/u.exec(t);
  return Boolean(bold && evidenceKind(bold[1]!) != null);
}

function collectUntilBoundary(
  lines: string[],
  start: number,
): { body: string[]; next: number } {
  let i = start;
  const body: string[] = [];
  while (i < lines.length && !isStructuralBoundary(lines[i] ?? "")) {
    body.push(lines[i] ?? "");
    i += 1;
  }
  return { body, next: i };
}

function consumeEvidencePair(
  lines: string[],
  startAfterTitle: number,
  firstTitle: string,
  firstKind: "strong" | "weak",
): { html: string; next: number } {
  const first = collectUntilBoundary(lines, startAfterTitle);
  let i = first.next;
  let strongTitle = firstKind === "strong" ? firstTitle : "最强证据";
  let weakTitle = firstKind === "weak" ? firstTitle : "最弱环节";
  let strongBody = firstKind === "strong" ? first.body : [];
  let weakBody = firstKind === "weak" ? first.body : [];
  if (firstKind === "strong") {
    const peek = (lines[i] ?? "").trim();
    const nextH = /^(#{1,6})\s+(.+)$/u.exec(peek);
    const nextBold = /^\*\*([^*]+)\*\*$/u.exec(peek);
    const nextTitle = (nextH?.[2] ?? nextBold?.[1] ?? "").trim();
    if (nextTitle && evidenceKind(nextTitle) === "weak") {
      weakTitle = nextTitle;
      i += 1;
      const weak = collectUntilBoundary(lines, i);
      weakBody = weak.body;
      i = weak.next;
    }
  }
  return {
    html: `<div class="kn-split">${evidenceCol(strongTitle, "go", strongBody.join("\n"))}${evidenceCol(weakTitle, "stop", weakBody.join("\n"))}</div>`,
    next: i,
  };
}

function skipFollowingRule(lines: string[], start: number): number {
  let i = start;
  while (i < lines.length && !(lines[i] ?? "").trim()) i += 1;
  if (i < lines.length && /^---+$/u.test((lines[i] ?? "").trim())) i += 1;
  return i;
}

function renderFlagsBlock(title: string, bodyLines: string[]): string {
  const { tables, rest } = splitFlagTables(bodyLines);
  let tone: "red" | "amber" | "none" = /red\s*flag|红旗/iu.test(title)
    ? "red"
    : /yellow\s*flag|黄旗|amber/iu.test(title)
      ? "amber"
      : "none";
  const items: Array<{ tone: "red" | "amber"; text: string }> = [];
  for (const raw of rest) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("|")) continue;
    if (/red\s*flags?|红旗/iu.test(line) && !/^[-*]\s+/u.test(line)) {
      tone = "red";
      continue;
    }
    if (/yellow\s*flags?|黄旗|amber/iu.test(line) && !/^[-*]\s+/u.test(line)) {
      tone = "amber";
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/u.exec(line);
    const text = (bullet?.[1] ?? line).trim();
    if (!text) continue;
    const itemTone: "red" | "amber" =
      /红旗/u.test(text) || tone === "red" ? "red" : "amber";
    if (tone === "none") {
      items.push({
        tone: /红旗|red flag/iu.test(text) ? "red" : "amber",
        text,
      });
    } else {
      items.push({ tone: itemTone, text });
    }
  }
  const tableHtmls = tables.map((rows) => tableHtml(rows)).join("");
  const tableRows = tables.reduce((n, t) => n + Math.max(0, t.length - 2), 0);
  if (items.length === 0 && !tableHtmls) {
    return `<div class="kn-callout"><p class="kn-callout__label">${inline(title)}</p></div>`;
  }
  const groups: Array<{
    tone: "red" | "amber";
    label: string;
    hint: string;
    items: string[];
  }> = [
    { tone: "red", label: "红旗", hint: "必须先看", items: [] },
    { tone: "amber", label: "黄旗", hint: "需要盯住", items: [] },
  ];
  for (const it of items) {
    const g = groups.find((x) => x.tone === it.tone);
    if (g) g.items.push(it.text);
  }
  const nonempty = groups.filter((g) => g.items.length > 0);
  if (nonempty.length === 0 && tableHtmls) {
    const foldTone = tone === "amber" ? "amber" : "red";
    const label = foldTone === "red" ? "红旗" : "黄旗";
    const hint = foldTone === "red" ? "必须先看" : "需要盯住";
    const count = tableRows || tables.length;
    return `<details class="kn-fold kn-flags-fold kn-flags-fold--${foldTone}" open><summary><span class="kn-flags-fold__mark" aria-hidden="true"></span><span class="kn-fold__title">${label}</span><span class="kn-flags-fold__hint">${hint}</span><span class="kn-fold__count">${count} 项</span></summary><div class="kn-flags kn-flags--table">${tableHtmls}</div></details>`;
  }
  return nonempty
    .map((g, gi) => {
      const lis = g.items
        .map(
          (text) =>
            `<div class="kn-flag kn-flag--${g.tone}">${inline(text)}</div>`,
        )
        .join("");
      const extra = gi === 0 ? tableHtmls : "";
      return `<details class="kn-fold kn-flags-fold kn-flags-fold--${g.tone}" open><summary><span class="kn-flags-fold__mark" aria-hidden="true"></span><span class="kn-fold__title">${g.label}</span><span class="kn-flags-fold__hint">${g.hint}</span><span class="kn-fold__count">${g.items.length} 项</span></summary><div class="kn-flags">${lis}${extra}</div></details>`;
    })
    .join("");
}

function isWeekHeading(title: string): boolean {
  return /^(Week\s+\d+|第\s*[一二三四1-4]\s*周)/iu.test(title);
}

function isSpineHeading(title: string): boolean {
  return (
    isWeekHeading(title) || /^(Experiment\s+\d+|实验\s*\d+)/iu.test(title)
  );
}

function weekParts(title: string): { num: string; rest: string } {
  const week = /^(?:Week\s+(\d+)|第\s*([一二三四1-4])\s*周)\s*[—–·\-]*\s*(.*)$/iu.exec(
    title.trim(),
  );
  if (week) {
    return {
      num: (week[1] ?? week[2] ?? "").trim(),
      rest: (week[3] ?? "").trim(),
    };
  }
  const exp = /^(?:Experiment|实验)\s*(\d+)\s*[—–·\-]*\s*(.*)$/iu.exec(
    title.trim(),
  );
  return {
    num: (exp?.[1] ?? "").trim(),
    rest: (exp?.[2] ?? "").trim(),
  };
}

function splitFlagTables(lines: string[]): { tables: string[][]; rest: string[] } {
  const tables: string[][] = [];
  const rest: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? "").trim();
    if (line.startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1] ?? "")) {
      const rows = [line];
      i += 1;
      rows.push((lines[i] ?? "").trim());
      i += 1;
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push((lines[i] ?? "").trim());
        i += 1;
      }
      tables.push(rows);
      continue;
    }
    rest.push(lines[i] ?? "");
    i += 1;
  }
  return { tables, rest };
}

function looksLikeLooseItem(line: string): boolean {
  if (/^[•·◦]\s+\S/u.test(line)) return true;
  if (line.length > 280) return false;
  if (/——/.test(line)) return true;
  if (/\[[^\]]+\]\s*$/u.test(line) && line.length < 220) return true;
  return false;
}

function collectUntilHeadingRank(
  lines: string[],
  start: number,
  rank: number,
): { body: string[]; next: number } {
  let i = start;
  const body: string[] = [];
  while (i < lines.length) {
    const t = (lines[i] ?? "").trim();
    const n = /^(#{1,6})\s+(.+)$/u.exec(t);
    if (n && n[1]!.length <= rank && !/^\d+[.)]/.test(n[2]!.trim())) break;
    body.push(lines[i] ?? "");
    i += 1;
  }
  return { body, next: i };
}

function isInternalPathItem(line: string): boolean {
  const t = line
    .trim()
    .replace(/^[-*\d.)]+\s+/u, "")
    .trim();
  if (!t) return false;
  if (/^\[\]\([^)]+\)/u.test(t)) return true;
  if (/\.md\b/iu.test(t) && /(`|\]\(|\/\d{2}-|PROGRESS\.md|PROJECT_STATE)/iu.test(t)) {
    return true;
  }
  return false;
}

function isFileIndexBody(body: string[]): boolean {
  const items = body
    .map((l) => l.trim())
    .filter((l) => l && !/^---+$/u.test(l) && !/^(#{1,6})\s+/u.test(l));
  if (items.length < 2) return false;
  const hits = items.filter((l) => isInternalPathItem(l)).length;
  return hits >= 2 && hits === items.length;
}

function isTaskOwner(who: string): boolean {
  return /^(?:老板|Jessica|Jensen)(?:\s*[+＋和、]\s*(?:老板|Jessica|Jensen))*$/u.test(
    who.replace(/[:：]\s*$/u, "").trim(),
  );
}

function localizeHeadingTitle(title: string): string {
  const exact: Record<string, string> = {
    research: "研究",
    strategy: "策略",
    product: "产品",
    control: "管控",
    financial: "财务",
    validation: "验证",
  };
  const key = title.trim().toLowerCase();
  return exact[key] ?? title;
}

function omitMatchingSections(md: string, titleRe: RegExp): string {
  const lines = md.split(/\r?\n/u);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const h = /^(#{1,6})\s+(.+)$/u.exec((lines[i] ?? "").trim());
    if (h && titleRe.test(h[2]!.trim())) {
      const { next } = collectUntilHeadingRank(lines, i + 1, h[1]!.length);
      i = next;
      continue;
    }
    out.push(lines[i] ?? "");
    i += 1;
  }
  return out.join("\n");
}

function collectUntilNextHeading(
  lines: string[],
  start: number,
): { body: string[]; next: number } {
  let i = start;
  const body: string[] = [];
  while (i < lines.length && !/^(#{1,6})\s+/u.test((lines[i] ?? "").trim())) {
    body.push((lines[i] ?? "").trim());
    i += 1;
  }
  return { body, next: i };
}

export function markdownToKnHtml(md: string, fileId?: string): string {
  let src = (md ?? "").replace(/^\uFEFF/, "").trim();
  if (!src) return EMPTY_CHAPTER_HTML;
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/u.exec(src);
  if (fm?.[1]) src = fm[1].trim();
  if (!src) return EMPTY_CHAPTER_HTML;

  const lead = renderSpecialLead(src, fileId);
  let rest = src;
  if (/kn-risks|kn-risk-pair/u.test(lead)) {
    rest = omitMatchingSections(rest, /三大风险|Top three risks|风险与对策/iu);
  }
  const inner = markdownToKnHtmlInner(rest);
  if (!lead && !inner) return EMPTY_CHAPTER_HTML;
  let body = inner;
  if (lead) {
    if (/<header class="kn-dochead">/u.test(inner)) {
      body = inner.replace(/<\/header>/u, `</header>\n${lead}`);
    } else {
      body = `${lead}${inner}`;
    }
  }
  return `<div class="kn-from-md">${body}</div>`;
}

function listItemHtml(raw: string): string {
  const t = stripAntiPatternName(raw.trim());
  if (!t) return "";
  const owned =
    /^\*\*([^*]{1,40}?)[:：]\*\*\s*(.+)$/u.exec(t) ??
    /^\*\*([^*]{1,32})\*\*[:：]\s*(.+)$/u.exec(t) ??
    /^((?:老板|Jessica|Jensen)(?:\s*[+＋和、]\s*(?:老板|Jessica|Jensen))*)[:：]\s*(.+)$/u.exec(
      t,
    );
  if (owned && isTaskOwner(owned[1]!)) {
    return `<li class="kn-task"><span class="kn-task__who">${inline(owned[1]!.replace(/[:：]\s*$/u, ""))}</span><span class="kn-task__do">${inline(owned[2]!)}</span></li>`;
  }
  return `<li>${inline(t)}</li>`;
}

function markdownToKnHtmlInner(src: string): string {
  const lines = src.split(/\r?\n/u);
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let inMdSection = false;
  let inMdSub = false;

  const closeMdSub = () => {
    if (!inMdSub) return;
    out.push("</div>");
    inMdSub = false;
  };

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!listKind || listItems.length === 0) {
      listKind = null;
      listItems = [];
      return;
    }
    const tag = listKind;
    const items = listItems.map(listItemHtml).filter(Boolean);
    const tasky = items.some((h) => h.includes("kn-task"));
    out.push(
      `<${tag}${tasky ? ' class="kn-tasks"' : ""}>${items.join("")}</${tag}>`,
    );
    listKind = null;
    listItems = [];
  };
  const closeMdSection = () => {
    closeMdSub();
    if (!inMdSection) return;
    out.push("</section>");
    inMdSection = false;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      i += 1;
      continue;
    }

    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1] ?? "")) {
      flushPara();
      flushList();
      const rows = [trimmed];
      i += 1;
      rows.push((lines[i] ?? "").trim());
      i += 1;
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push((lines[i] ?? "").trim());
        i += 1;
      }
      out.push(tableHtml(rows));
      continue;
    }

    const h = /^(#{1,6})\s+(.+)$/u.exec(trimmed);
    if (h) {
      flushPara();
      flushList();
      const title = h[2]!.trim();
      const hashes = h[1]!.length;
      const ev = evidenceKind(title);
      if (ev) {
        closeMdSection();
        i += 1;
        const pair = consumeEvidencePair(lines, i, title, ev);
        out.push(pair.html);
        i = pair.next;
        continue;
      }
      if (hashes === 1 && isGateHeading(title)) {
        closeMdSection();
        i += 1;
        out.push(gateBannerHtml(title));
        continue;
      }
      if (isFoldHeading(title)) {
        closeMdSection();
        i += 1;
        if (isInternalIndexHeading(title)) {
          const skipped = collectUntilHeadingRank(lines, i, hashes);
          i = skipped.next;
          continue;
        }
        const { body, next } = collectUntilNextHeading(lines, i);
        i = next;
        const inner = markdownToKnHtmlInner(body.join("\n"));
        out.push(
          `<details class="kn-fold kn-md-sources"><summary><span class="kn-fold__title">${inline(title)}</span></summary>${inner}</details>`,
        );
        continue;
      }
      const indexPeek = collectUntilHeadingRank(lines, i + 1, hashes);
      if (hashes >= 2 && isFileIndexBody(indexPeek.body)) {
        closeMdSection();
        i = indexPeek.next;
        continue;
      }
      if (/三大风险|Top three risks|风险与对策/iu.test(title)) {
        closeMdSection();
        i += 1;
        const { body, next } = collectUntilHeadingRank(lines, i, hashes);
        i = next;
        out.push(`<h3 class="kn-md-sec">${headingInner(title).inner}</h3>`);
        const cards = riskCardsHtml(body.join("\n"));
        out.push(cards || markdownToKnHtmlInner(body.join("\n")));
        continue;
      }
      if (/常见误区|Anti-patterns?/iu.test(title)) {
        closeMdSection();
        i += 1;
        const { body, next } = collectUntilHeadingRank(lines, i, hashes);
        i = next;
        out.push(`<h3 class="kn-md-sec">${headingInner(title).inner}</h3>`);
        const list = antiPatternListHtml(body.join("\n"));
        out.push(list || markdownToKnHtmlInner(body.join("\n")));
        continue;
      }
      if (/founder pivot overlay|创始人调整/iu.test(title)) {
        closeMdSection();
        i += 1;
        const { body, next } = collectUntilNextHeading(lines, i);
        i = next;
        const inner = markdownToKnHtmlInner(body.join("\n")).trim();
        out.push(
          `<blockquote class="kn-callout"><p class="kn-callout__label">${inline("创始人调整")}</p>${inner}</blockquote>`,
        );
        continue;
      }
      if (isSpineHeading(title)) {
        closeMdSection();
        i += 1;
        const { body, next } = collectUntilNextHeading(lines, i);
        i = next;
        const inner = markdownToKnHtmlInner(body.join("\n")).trim();
        const { num, rest } = weekParts(title);
        const open = num === "1" || num === "一" ? " open" : "";
        const label = rest || title;
        out.push(
          `<details class="kn-week"${open}><summary><span class="kn-week__n">${escapeHtml(num || "·")}</span><span class="kn-week__t">${inline(label)}</span></summary><div class="kn-week__body">${inner}</div></details>`,
        );
        continue;
      }
      const numbered = hashes >= 2 && isNumberedSectionTitle(title);
      const sub = !numbered && (isSubHeadingTitle(title) || hashes >= 4);
      if (numbered) {
        closeMdSection();
        out.push('<section class="kn-md-section">');
        inMdSection = true;
      } else if (sub) {
        closeMdSub();
        out.push('<div class="kn-md-subblock">');
        inMdSub = true;
      } else {
        closeMdSection();
      }
      i += 1;
      if (/flag|红旗|黄旗|flags/iu.test(title)) {
        const { body, next } = collectUntilNextHeading(lines, i);
        i = next;
        out.push(renderFlagsBlock(title, body));
        continue;
      }
      const tag = headingTagName(hashes, title);
      const parts = headingInner(title);
      let cls = parts.cls;
      if (!cls && hashes === 1) cls = "kn-doc-title";
      else if (!cls && hashes === 2 && !numbered) cls = "kn-md-sec";
      else if (!cls && hashes === 3 && !numbered && !sub) cls = "kn-md-topic";
      const open = cls ? `<${tag} class="${cls}">` : `<${tag}>`;
      if (hashes === 1) {
        const meta: string[] = [];
        while (i < lines.length) {
          const next = (lines[i] ?? "").trim();
          if (!next) {
            i += 1;
            continue;
          }
          if (isCoverMetaLine(next)) {
            meta.push(next);
            i += 1;
            continue;
          }
          break;
        }
        const cover = coverHtml(meta);
        const byline =
          /<p class="kn-dochead__byline">[\s\S]*?<\/p>/u.exec(cover)?.[0] ?? "";
        const rest = cover.replace(byline, "");
        out.push(
          `<header class="kn-dochead">${byline}${open}${parts.inner}</${tag}>${rest}</header>`,
        );
        if (meta.length > 0) i = skipFollowingRule(lines, i);
        continue;
      }
      out.push(`${open}${parts.inner}</${tag}>`);
      while (i < lines.length && !(lines[i] ?? "").trim()) i += 1;
      const peek = (lines[i] ?? "").trim();
      if (isSectionConfLine(peek)) {
        out.push(sectionConfHtml(parseMetaLine(peek)!.value));
        i += 1;
      }
      continue;
    }

    const boldOnly = /^\*\*([^*]+)\*\*$/u.exec(trimmed);
    if (boldOnly && evidenceKind(boldOnly[1]!)) {
      flushPara();
      flushList();
      closeMdSection();
      i += 1;
      const pair = consumeEvidencePair(
        lines,
        i,
        boldOnly[1]!.trim(),
        evidenceKind(boldOnly[1]!)!,
      );
      out.push(pair.html);
      i = pair.next;
      continue;
    }

    if (isSectionConfLine(trimmed)) {
      flushPara();
      flushList();
      out.push(sectionConfHtml(parseMetaLine(trimmed)!.value));
      i += 1;
      continue;
    }

    if (/^\*\*(Mitigation|对策|应对)[:：]\s*\*\*\s*$/iu.test(trimmed)) {
      flushPara();
      flushList();
      out.push(`<p class="kn-md-kicker">${inline("对策")}</p>`);
      i += 1;
      continue;
    }

    const labeled = parseMetaLine(trimmed);
    if (
      labeled &&
      !isDocMetaLine(trimmed) &&
      !isSectionConfLine(trimmed)
    ) {
      flushPara();
      flushList();
      const keyZh = /^(mitigation|对策|应对)$/iu.test(labeled.key)
        ? "对策"
        : /^(goal|目标)$/iu.test(labeled.key)
          ? "目标"
          : /^(deliverables?|产出)$/iu.test(labeled.key)
            ? "产出"
            : /^(exit|通过门槛)$/iu.test(labeled.key)
              ? "通过门槛"
              : /^(do not do|don't do|不要做)$/iu.test(labeled.key)
                ? "不要做"
                : /^(expected limitation|预期限制)$/iu.test(labeled.key)
                  ? "预期限制"
                  : localizeKnText(labeled.key);
      const planKind = /^(不要做)$/u.test(keyZh)
        ? " kn-plan--stop"
        : /^(产出)$/u.test(keyZh)
          ? " kn-plan--out"
          : /^(目标)$/u.test(keyZh)
            ? " kn-plan--goal"
            : "";
      if (planKind) {
        out.push(
          `<div class="kn-plan${planKind}"><p class="kn-plan__label">${inline(keyZh)}</p>${labeled.value ? `<p class="kn-plan__lead">${inline(labeled.value)}</p>` : ""}</div>`,
        );
      } else {
        out.push(
          `<p class="kn-md-kicker">${inline(keyZh)}</p><p>${inline(labeled.value)}</p>`,
        );
      }
      i += 1;
      continue;
    }

    const tagged = taggedLine(trimmed);
    if (tagged) {
      flushPara();
      flushList();
      const block: string[] = [];
      if (tagged.rest) block.push(tagged.rest);
      i += 1;
      while (i < lines.length) {
        const next = (lines[i] ?? "").trim();
        if (!next) {
          block.push("");
          i += 1;
          continue;
        }
        if (
          taggedLine(next) ||
          /^(#{1,6})\s+/u.test(next) ||
          /^---+$/u.test(next) ||
          isDocMetaLine(next) ||
          isSectionConfLine(next) ||
          isStructuralBoundary(next)
        ) {
          break;
        }
        block.push(lines[i] ?? "");
        i += 1;
      }
      const inner = markdownToKnHtmlInner(block.join("\n")).trim();
      const kindClass = tagged.kind ? ` kn-tagged--${tagged.kind}` : "";
      out.push(
        `<div class="kn-tagged${kindClass}"><span class="kn-md-tag kn-md-tag--${tagged.kind}">${escapeHtml(localizeTagLabel(tagged.label))}</span>${inner}</div>`,
      );
      continue;
    }

    if (/^\*\*VERDICT\b/iu.test(trimmed) || /^\*\*总评[:：]/u.test(trimmed)) {
      flushPara();
      flushList();
      out.push(
        `<div class="kn-callout"><p class="kn-callout__label">判断</p><p class="kn-callout__body">${inline(trimmed.replace(/^\*\*|\*\*$/gu, ""))}</p></div>`,
      );
      i += 1;
      continue;
    }

    const scoreLine =
      /^(?:\*\*)?(?:综合)?(?:可靠度)?评分[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*10\s*[（(]([^）)]+)[）)](?:\*\*)?$/u.exec(
        trimmed,
      );
    if (scoreLine) {
      flushPara();
      flushList();
      out.push(
        scoreHeroHtml(
          scoreLine[1]!,
          localizeKnText(scoreLine[2]!.trim()),
          "inline",
        ),
      );
      i += 1;
      continue;
    }

    if (isDocMetaLine(trimmed) && out.length > 0) {
      flushPara();
      flushList();
      const meta = [trimmed];
      i += 1;
      while (i < lines.length && isDocMetaLine((lines[i] ?? "").trim())) {
        meta.push((lines[i] ?? "").trim());
        i += 1;
      }
      const cover = coverHtml(meta);
      if (cover) out.push(`<aside class="kn-dochead kn-dochead--inline">${cover}</aside>`);
      i = skipFollowingRule(lines, i);
      continue;
    }

    if (trimmed.startsWith("```")) {
      flushPara();
      flushList();
      i += 1;
      const code: string[] = [];
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        code.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      out.push(
        `<pre class="kn-pre"><code>${escapeHtml(code.join("\n"))}</code></pre>`,
      );
      continue;
    }

    if (/^---+$/u.test(trimmed)) {
      flushPara();
      flushList();
      out.push("<hr />");
      i += 1;
      continue;
    }

    if (/^>\s?/u.test(trimmed)) {
      flushPara();
      flushList();
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/u.test((lines[i] ?? "").trim())) {
        quote.push((lines[i] ?? "").trim().replace(/^>\s?/u, ""));
        i += 1;
      }
      out.push(
        `<blockquote class="kn-callout"><p class="kn-callout__body">${inline(quote.join(" "))}</p></blockquote>`,
      );
      continue;
    }

    const ul = /^[-*•·◦]\s+(.+)$/u.exec(trimmed);
    if (ul) {
      flushPara();
      if (isInternalPathItem(ul[1]!)) {
        i += 1;
        continue;
      }
      if (listKind && listKind !== "ul") flushList();
      listKind = "ul";
      listItems.push(ul[1]!);
      i += 1;
      continue;
    }
    const ol = /^\d+[.)]\s+(.+)$/u.exec(trimmed);
    if (ol) {
      flushPara();
      if (isInternalPathItem(ol[1]!)) {
        i += 1;
        continue;
      }
      if (listKind && listKind !== "ol") flushList();
      listKind = "ol";
      listItems.push(ol[1]!);
      i += 1;
      continue;
    }

    if (looksLikeLooseItem(trimmed)) {
      flushPara();
      if (listKind && listKind !== "ul") flushList();
      listKind = "ul";
      listItems.push(trimmed.replace(/^[•·◦]\s+/u, ""));
      i += 1;
      continue;
    }

    const boldNum = /^\*\*(\d+[.)、]\s+[^*]+)\*\*$/u.exec(trimmed);
    if (boldNum) {
      flushPara();
      flushList();
      closeMdSub();
      out.push('<div class="kn-md-subblock">');
      inMdSub = true;
      const parts = headingInner(boldNum[1]!.trim());
      out.push(`<h4 class="kn-md-sub">${parts.inner}</h4>`);
      i += 1;
      continue;
    }

    if (isChineseChapterTitle(trimmed)) {
      flushPara();
      flushList();
      closeMdSection();
      out.push('<section class="kn-md-section">');
      inMdSection = true;
      const parts = headingInner(trimmed);
      out.push(`<h3 class="${parts.cls}">${parts.inner}</h3>`);
      i += 1;
      continue;
    }

    const isLabel =
      trimmed.length >= 4 &&
      trimmed.length <= 80 &&
      /[：:]\s*$/u.test(trimmed) &&
      !/^[-*|#>]/u.test(trimmed) &&
      !/^(#{1,6})\s+/u.test(trimmed);
    if (isLabel) {
      let j = i + 1;
      while (j < lines.length && !(lines[j] ?? "").trim()) j += 1;
      const next = (lines[j] ?? "").trim();
      if (next.startsWith("|") || /^[-*]\s+/u.test(next) || /^\d+[.)]\s+/u.test(next)) {
        flushPara();
        flushList();
        out.push(
          `<p class="kn-md-kicker">${inline(trimmed.replace(/[：:]\s*$/u, ""))}</p>`,
        );
        i += 1;
        continue;
      }
    }

    if (
      trimmed.startsWith("|") &&
      !isTableSep(trimmed) &&
      !((lines[i + 1] ?? "").trim().startsWith("|"))
    ) {
      const cell = trimmed.replace(/^\|\s*/u, "").replace(/\s*\|$/u, "").trim();
      if (cell) {
        flushList();
        para.push(cell);
        i += 1;
        continue;
      }
    }

    flushList();
    para.push(trimmed);
    i += 1;
  }
  flushPara();
  flushList();
  closeMdSection();

  const html = out.join("\n").trim();
  return html;
}

export function renderDeliverableChapterHtml(
  files: { title: string; markdown: string; id?: string }[],
): string {
  const withText = files.filter((f) => f.markdown.trim());
  const withBody = withText.filter((f) => markdownHasBody(f.markdown));
  const nonempty = withBody.length > 0 ? withBody : withText;
  if (nonempty.length === 0) return EMPTY_CHAPTER_HTML;
  if (nonempty.length === 1) {
    return markdownToKnHtml(nonempty[0]!.markdown, nonempty[0]!.id);
  }
  return nonempty
    .map((f) => {
      const same = firstHeadingTitle(f.markdown) === f.title;
      const kicker = same
        ? ""
        : `<h2 class="kn-file-kicker">${escapeHtml(f.title)}</h2>`;
      return `<section class="kn-from-md-file">${kicker}${markdownToKnHtml(f.markdown, f.id)}</section>`;
    })
    .join("\n");
}

export { EMPTY_CHAPTER_HTML };
