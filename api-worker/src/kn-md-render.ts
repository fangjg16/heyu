/**
 * 把资料包 Markdown 总文件渲成知识网络章节 HTML。
 * 模板不再让模型填骨架，只做呈现：class + kn-elements.css。
 */

const EMPTY_CHAPTER_HTML =
  '<div class="kn-callout"><p class="kn-callout__body">尚未开展</p></div>';

function escapeHtml(s: string): string {
  return s
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function inline(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(
    /\[((?:Data|Opinion|Assumption|Gap|Estimate)[^\]]*)\]/giu,
    (_m, label: string) => `<span class="kn-md-tag">${label}</span>`,
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
  const thead = `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${body
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody>`;
  return `<div class="kn-table-wrap"><table>${thead}${tbody}</table></div>`;
}

function parseMetaLine(line: string): { key: string; value: string } | null {
  const m = /^\*\*([^*]+?)[:：]\s*\*\*\s*(.+)$/u.exec(line.trim());
  if (!m) return null;
  const key = m[1]!.trim();
  const value = m[2]!.trim();
  if (!key || !value) return null;
  return { key, value };
}

function isMetaLine(line: string): boolean {
  return parseMetaLine(line) != null;
}

function metaHtml(lines: string[]): string {
  const parts = lines
    .map((line) => {
      const m = parseMetaLine(line);
      if (!m) return "";
      return `<span>${inline(m.key)} <b>${inline(m.value)}</b></span>`;
    })
    .filter(Boolean);
  if (parts.length === 0) return "";
  return `<div class="kn-score-sum">${parts.join("")}</div>`;
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

export function markdownToKnHtml(md: string): string {
  let src = (md ?? "").replace(/^\uFEFF/, "").trim();
  if (!src) return EMPTY_CHAPTER_HTML;
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/u.exec(src);
  if (fm?.[1]) src = fm[1].trim();
  if (!src) return EMPTY_CHAPTER_HTML;

  const lines = src.split(/\r?\n/u);
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let listItems: string[] = [];

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
      const level = Math.min(3, h[1]!.length) + 1;
      const title = h[2]!.trim();
      const tag = `h${level}`;
      i += 1;
      if (/flag|红旗|黄旗|flags/iu.test(title)) {
        const { body, next } = collectUntilNextHeading(lines, i);
        i = next;
        out.push(renderFlagsBlock(title, body));
        continue;
      }
      out.push(`<${tag}>${inline(title)}</${tag}>`);
      if (h[1]!.length === 1) {
        const meta: string[] = [];
        while (i < lines.length) {
          const peek = (lines[i] ?? "").trim();
          if (!peek) {
            i += 1;
            continue;
          }
          if (isMetaLine(peek)) {
            meta.push(peek);
            i += 1;
            continue;
          }
          break;
        }
        if (meta.length > 0) out.push(metaHtml(meta));
      }
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

    if (isMetaLine(trimmed) && out.length > 0) {
      flushPara();
      flushList();
      const meta = [trimmed];
      i += 1;
      while (i < lines.length && isMetaLine((lines[i] ?? "").trim())) {
        meta.push((lines[i] ?? "").trim());
        i += 1;
      }
      out.push(metaHtml(meta));
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

  const html = out.join("\n").trim();
  return html
    ? `<div class="kn-from-md">${html}</div>`
    : EMPTY_CHAPTER_HTML;
}

export function renderDeliverableChapterHtml(
  files: { title: string; markdown: string }[],
): string {
  const nonempty = files.filter((f) => f.markdown.trim());
  if (nonempty.length === 0) return EMPTY_CHAPTER_HTML;
  if (nonempty.length === 1) return markdownToKnHtml(nonempty[0]!.markdown);
  return nonempty
    .map(
      (f) =>
        `<section class="kn-from-md-file"><h2>${escapeHtml(f.title)}</h2>${markdownToKnHtml(f.markdown)}</section>`,
    )
    .join("\n");
}

export { EMPTY_CHAPTER_HTML };
