/** 章节改写模型输出解析：标记分段优先，兼容 JSON；并修复已落库的脏 HTML。 */

function stripFence(raw: string): string {
  let t = raw.trim();
  const fenced = /^```(?:json|html)?\s*([\s\S]*?)```$/iu.exec(t);
  if (fenced?.[1]) t = fenced[1].trim();
  return t;
}

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/gu, "\n")
    .replace(/\\r/gu, "\r")
    .replace(/\\t/gu, "\t")
    .replace(/\\"/gu, '"')
    .replace(/\\\//gu, "/")
    .replace(/\\\\/gu, "\\");
}

/** 从可能损坏的 JSON 里抠 html：取 `"html": "` 到最后一个 `"…}` */
function extractHtmlFieldLoose(raw: string): string | null {
  const m = /"html"\s*:\s*"/u.exec(raw);
  if (!m) return null;
  const start = m.index + m[0].length;
  let end = -1;
  for (let i = raw.length - 1; i > start; i -= 1) {
    if (raw[i] === '"' && /^\s*\}/u.test(raw.slice(i + 1))) {
      end = i;
      break;
    }
  }
  const body = end > start ? raw.slice(start, end) : raw.slice(start);
  const html = unescapeJsonString(body).trim();
  return html.length > 0 ? html : null;
}

function extractNoteFieldLoose(raw: string): string {
  const m = /"(?:note|reviseNote)"\s*:\s*"/u.exec(raw);
  if (!m) return "";
  const start = m.index + m[0].length;
  let out = "";
  let escaped = false;
  for (let j = start; j < raw.length; j += 1) {
    const ch = raw[j];
    if (escaped) {
      if (ch === "n") out += "\n";
      else if (ch === "t") out += "\t";
      else if (ch === "r") out += "\r";
      else out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') break;
    out += ch;
  }
  return out.trim().slice(0, 2000);
}

function looksLikeJsonWrapper(raw: string): boolean {
  const t = raw.trim();
  return t.startsWith("{") && /"(?:note|reviseNote|html)"\s*:/u.test(t);
}

function parseMarkedSections(raw: string): { html: string; note: string } | null {
  const chapter = /===CHAPTER===\s*([\s\S]*?)(?====NOTE===|===SOURCES_ADD===|$)/iu.exec(
    raw,
  );
  const note = /===NOTE===\s*([\s\S]*?)(?====CHAPTER===|$)/iu.exec(raw);
  if (chapter?.[1]?.trim()) {
    return {
      html: chapter[1].trim(),
      note: (note?.[1] ?? "").trim().slice(0, 2000),
    };
  }
  return null;
}

/** 解析改写模型输出：优先 ===NOTE=== / ===CHAPTER===；兼容 JSON {note,html} */
export function parseReviseChapterAnswer(answer: string): {
  html: string;
  note: string;
} {
  const raw = stripFence(answer);
  const marked = parseMarkedSections(raw);
  if (marked) {
    return { html: repairStoredChapterHtml(marked.html), note: marked.note };
  }

  try {
    const obj = JSON.parse(raw) as {
      note?: unknown;
      reviseNote?: unknown;
      html?: unknown;
      content?: unknown;
    };
    if (obj && typeof obj === "object") {
      const html = String(obj.html ?? obj.content ?? "").trim();
      const note = String(obj.note ?? obj.reviseNote ?? "")
        .trim()
        .slice(0, 2000);
      if (html) return { html: repairStoredChapterHtml(html), note };
    }
  } catch {
    /* 损坏 JSON：再抠字段 */
  }

  if (looksLikeJsonWrapper(raw)) {
    const html = extractHtmlFieldLoose(raw);
    const note = extractNoteFieldLoose(raw);
    if (html) return { html: repairStoredChapterHtml(html), note };
  }

  const split = /(?:^|\n)\s*-{3,}\s*HTML\s*-{3,}\s*\n([\s\S]*)$/iu.exec(raw);
  if (split?.[1]) {
    const before = raw.slice(0, split.index).trim();
    const note = before
      .replace(/^(?:改写说明|说明)[:：]\s*/u, "")
      .trim()
      .slice(0, 2000);
    return { html: repairStoredChapterHtml(split[1].trim()), note };
  }

  return { html: repairStoredChapterHtml(raw), note: "" };
}

/**
 * 修复已落库的改写脏稿：JSON 外壳、字面 \\n、围栏。
 * 正常 HTML 原样返回。
 */
export function repairStoredChapterHtml(raw: string): string {
  let t = String(raw ?? "").trim();
  if (!t) return "";
  t = stripFence(t);

  if (looksLikeJsonWrapper(t)) {
    try {
      const obj = JSON.parse(t) as { html?: unknown; content?: unknown };
      const inner = String(obj.html ?? obj.content ?? "").trim();
      if (inner) t = inner;
    } catch {
      const loose = extractHtmlFieldLoose(t);
      if (loose) t = loose;
    }
  }

  const marked = parseMarkedSections(t);
  if (marked) t = marked.html;

  if (/\\[ntr"]/u.test(t) && /<[a-z][\s\S]*>/iu.test(t)) {
    t = unescapeJsonString(t);
  }

  t = t.replace(/^(?:["'`])+|(?:["'`])+$/gu, "").trim();
  return t;
}
