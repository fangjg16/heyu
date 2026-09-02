/**
 * 把资料包 Markdown 总文件渲成知识网络章节 HTML。
 * 模板不再让模型填骨架，只做呈现：class + kn-elements.css。
 */

import { renderSpecialLead } from "./kn-md-specials";

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
  const k = (label.split(/[,\s/]/u)[0] ?? "").trim().toLowerCase();
  if (k === "data") return "data";
  if (k === "opinion") return "opinion";
  if (k === "assumption") return "assumption";
  if (k === "gap") return "gap";
  if (k === "estimate") return "estimate";
  return "";
}

function inline(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(
    /\[((?:Data|Opinion|Assumption|Gap|Estimate)[^\]]*)\]/giu,
    (_m, label: string) => {
      const kind = tagKind(label);
      const extra = kind ? ` kn-md-tag--${kind}` : "";
      return `<span class="kn-md-tag${extra}">${label}</span>`;
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
    if (/^(Critical|Crit|严重)$/iu.test(t)) return "crit";
    if (/^(High|Major|高)$/iu.test(t)) return "high";
    if (/^(Medium|Moderate|Mid|中)$/iu.test(t)) return "mid";
    if (/^(Low|Minor|低)$/iu.test(t)) return "low";
    return null;
  };
  const cellHtml = (c: string) => {
    const tone = badgeTone(c);
    const inner = inline(c);
    if (!tone) return inner;
    return `<span class="kn-badge kn-badge--${tone}">${inner}</span>`;
  };
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
          return `<td>${cellHtml(c)}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("")}</tbody>`;
  const cls = heatmap ? ' class="kn-heatmap"' : "";
  return `<div class="kn-table-wrap"><table${cls}>${thead}${tbody}</table></div>`;
}

function parseMetaLine(line: string): { key: string; value: string } | null {
  const m = /^\*\*([^*]+?)[:：]\s*\*\*\s*(.+)$/u.exec(line.trim());
  if (!m) return null;
  const key = m[1]!.trim();
  const value = m[2]!.trim();
  if (!key || !value) return null;
  return { key, value };
}

const DOC_META_KEY =
  /^(Phase|Project|Date|Confidence|Status|Verdict|Overall|阶段|项目|日期|把握|进度|判断|综合)$/iu;

function isSectionConfLine(line: string): boolean {
  const m = parseMetaLine(line);
  return Boolean(m && /^section\s+confidence$|^本节把握$/iu.test(m.key));
}

function isDocMetaLine(line: string): boolean {
  const m = parseMetaLine(line);
  if (!m || isSectionConfLine(line)) return false;
  return DOC_META_KEY.test(m.key);
}

const META_LABELS: Record<string, string> = {
  phase: "阶段",
  project: "项目",
  date: "日期",
  confidence: "把握",
  status: "进度",
  verdict: "判断",
  overall: "综合",
  阶段: "阶段",
  项目: "项目",
  日期: "日期",
  把握: "把握",
  进度: "进度",
  判断: "判断",
  综合: "综合",
};

function metaLabel(key: string): string {
  return META_LABELS[key.trim().toLowerCase()] ?? key;
}

function metaHtml(lines: string[]): string {
  const cells = lines
    .map((line) => {
      const m = parseMetaLine(line);
      if (!m || isSectionConfLine(line)) return "";
      const wide = m.value.length > 42 ? " kn-masthead__cell--wide" : "";
      return `<div class="kn-masthead__cell${wide}"><span class="kn-masthead__k">${escapeHtml(metaLabel(m.key))}</span><span class="kn-masthead__v">${inline(m.value)}</span></div>`;
    })
    .filter(Boolean);
  if (cells.length === 0) return "";
  return `<div class="kn-masthead">${cells.join("")}</div>`;
}

function sectionConfHtml(value: string): string {
  return `<p class="kn-section-conf"><span class="kn-section-conf__k">本节把握</span>${inline(value)}</p>`;
}

function evidenceKind(title: string): "strong" | "weak" | null {
  const t = title.replace(/\*+/gu, "").trim();
  if (/strongest evidence|最强证据|最有力证据/iu.test(t)) return "strong";
  if (/weakest links?|最弱环节|最弱链接|最弱证据/iu.test(t)) return "weak";
  return null;
}

function evidenceCol(title: string, kind: "go" | "stop", body: string): string {
  const inner = markdownToKnHtmlInner(body).trim() || "<p>待补</p>";
  return `<div class="kn-split__col kn-split__col--${kind}"><div class="kn-split__title">${escapeHtml(title)}</div>${inner}</div>`;
}

function taggedLine(
  line: string,
): { label: string; kind: string; rest: string } | null {
  const m =
    /^(?:\*\*)?\[((?:Data|Opinion|Assumption|Gap|Estimate)[^\]]*)\](?:\*\*)?\s*(.*)$/iu.exec(
      line.trim(),
    );
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
  if (/^(#{1,3})\s+/u.test(t)) return true;
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
    const nextH = /^(#{1,3})\s+(.+)$/u.exec(peek);
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
  let tone: "red" | "amber" | "none" = /red\s*flag|红旗/iu.test(title)
    ? "red"
    : /yellow\s*flag|黄旗|amber/iu.test(title)
      ? "amber"
      : "none";
  const items: Array<{ tone: "red" | "amber"; text: string }> = [];
  for (const raw of bodyLines) {
    const line = raw.trim();
    if (!line) continue;
    if (/red\s*flags?|红旗/iu.test(line) && !/^[-*]\s+/u.test(line)) {
      tone = "red";
      const rest = line
        .replace(/^\*\*/, "")
        .replace(/\*\*:?\s*$/u, "")
        .replace(/^red\s*flags?:?\s*/iu, "")
        .replace(/^红旗[:：]?\s*/u, "")
        .trim();
      if (rest && !/^[-*]\s+/u.test(rest)) {
        /* heading only */
      }
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
      /红旗/u.test(text) || tone === "red"
        ? "red"
        : "amber";
    if (tone === "none") {
      items.push({
        tone: /红旗|red flag/iu.test(text) ? "red" : "amber",
        text,
      });
    } else {
      items.push({ tone: itemTone, text });
    }
  }
  if (items.length === 0) {
    return `<div class="kn-callout"><p class="kn-callout__label">${inline(title)}</p></div>`;
  }
  return `<div class="kn-flags">${items
    .map(
      (it) =>
        `<div class="kn-flag kn-flag--${it.tone === "red" ? "red" : "amber"}">${inline(it.text)}</div>`,
    )
    .join("")}</div>`;
}

function collectUntilNextHeading(
  lines: string[],
  start: number,
): { body: string[]; next: number } {
  let i = start;
  const body: string[] = [];
  while (i < lines.length && !/^(#{1,3})\s+/u.test((lines[i] ?? "").trim())) {
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
  const inner = markdownToKnHtmlInner(src);
  if (!lead && !inner) return EMPTY_CHAPTER_HTML;
  return `<div class="kn-from-md">${lead}${inner}</div>`;
}

function markdownToKnHtmlInner(src: string): string {
  const lines = src.split(/\r?\n/u);
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let inMdSection = false;

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
    out.push(
      `<${tag}>${listItems.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`,
    );
    listKind = null;
    listItems = [];
  };
  const closeMdSection = () => {
    if (!inMdSection) return;
    out.push("</section>");
    inMdSection = false;
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      flushList();
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

    const h = /^(#{1,3})\s+(.+)$/u.exec(trimmed);
    if (h) {
      flushPara();
      flushList();
      const title = h[2]!.trim();
      const ev = evidenceKind(title);
      if (ev) {
        closeMdSection();
        i += 1;
        const pair = consumeEvidencePair(lines, i, title, ev);
        out.push(pair.html);
        i = pair.next;
        continue;
      }
      closeMdSection();
      const numbered = h[1]!.length >= 2 && /^\d+[.)]\s+\S/u.test(title);
      if (numbered) {
        out.push('<section class="kn-md-section">');
        inMdSection = true;
      }
      const level = Math.min(3, h[1]!.length) + 1;
      const tag = `h${level}`;
      i += 1;
      if (/flag|红旗|黄旗|flags/iu.test(title)) {
        const { body, next } = collectUntilNextHeading(lines, i);
        i = next;
        out.push(renderFlagsBlock(title, body));
        continue;
      }
      if (/^(\d+\.\s+)?(sources|references|来源|参考文献|附录)\b/iu.test(title)) {
        const { body, next } = collectUntilNextHeading(lines, i);
        i = next;
        const inner = markdownToKnHtmlInner(body.join("\n"));
        out.push(
          `<details class="kn-fold kn-md-sources"><summary><span class="kn-fold__title">${inline(title)}</span></summary>${inner}</details>`,
        );
        continue;
      }
      out.push(`<${tag}>${inline(title)}</${tag}>`);
      while (i < lines.length && !(lines[i] ?? "").trim()) i += 1;
      const peek = (lines[i] ?? "").trim();
      if (isSectionConfLine(peek)) {
        out.push(sectionConfHtml(parseMetaLine(peek)!.value));
        i += 1;
      } else if (h[1]!.length === 1) {
        const meta: string[] = [];
        while (i < lines.length) {
          const next = (lines[i] ?? "").trim();
          if (!next) {
            i += 1;
            continue;
          }
          if (isDocMetaLine(next)) {
            meta.push(next);
            i += 1;
            continue;
          }
          break;
        }
        if (meta.length > 0) {
          out.push(metaHtml(meta));
          i = skipFollowingRule(lines, i);
        }
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
          /^(#{1,3})\s+/u.test(next) ||
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
        `<div class="kn-tagged${kindClass}"><span class="kn-md-tag kn-md-tag--${tagged.kind}">${escapeHtml(tagged.label)}</span>${inner}</div>`,
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

    if (isDocMetaLine(trimmed) && out.length > 0) {
      flushPara();
      flushList();
      const meta = [trimmed];
      i += 1;
      while (i < lines.length && isDocMetaLine((lines[i] ?? "").trim())) {
        meta.push((lines[i] ?? "").trim());
        i += 1;
      }
      out.push(metaHtml(meta));
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

    const ul = /^[-*]\s+(.+)$/u.exec(trimmed);
    if (ul) {
      flushPara();
      if (listKind && listKind !== "ul") flushList();
      listKind = "ul";
      listItems.push(ul[1]!);
      i += 1;
      continue;
    }
    const ol = /^\d+[.)]\s+(.+)$/u.exec(trimmed);
    if (ol) {
      flushPara();
      if (listKind && listKind !== "ol") flushList();
      listKind = "ol";
      listItems.push(ol[1]!);
      i += 1;
      continue;
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
  const nonempty = files.filter((f) => f.markdown.trim());
  if (nonempty.length === 0) return EMPTY_CHAPTER_HTML;
  if (nonempty.length === 1) {
    return markdownToKnHtml(nonempty[0]!.markdown, nonempty[0]!.id);
  }
  return nonempty
    .map(
      (f) =>
        `<section class="kn-from-md-file"><h2>${escapeHtml(f.title)}</h2>${markdownToKnHtml(f.markdown, f.id)}</section>`,
    )
    .join("\n");
}

export { EMPTY_CHAPTER_HTML };
