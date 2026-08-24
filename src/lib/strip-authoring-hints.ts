/** 生成模板里写给模型的制作说明，不应出现在用户看到的章节里。 */
const HINT_RE =
  /禁止改成\s*SVG|禁止\s*SVG|仅写入与本项目直接相关|不要写\s*IRR|禁止编造\s*IRR|不要再画一张九宫格|不要三个核验计数|格内填风险编号|生成后由页面挂载|不要和行业章重复|只写\s*3[–—-]?\s*5\s*个关键对手|格内用\s*强\s*\/\s*够|标签用\s*\[Data\]|但仍须保留本节|可改成流程增值图|不要写对战卡|按已发生事项、待核验节点/u;

const PAREN_HINT_RE = /（[^）]{0,80}(?:不要|禁止|仅写入|格内填|须保留)[^）]{0,80}）/gu;

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/gu, "\n")
    .replace(/\\r/gu, "\r")
    .replace(/\\t/gu, "\t")
    .replace(/\\"/gu, '"')
    .replace(/\\\//gu, "/")
    .replace(/\\\\/gu, "\\");
}

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

/**
 * 修复改写落库脏稿：JSON {note,html} 外壳、字面 \\n。
 * 正常 HTML 原样返回。
 */
export function repairDisplayedChapterHtml(raw: string): string {
  let t = String(raw ?? "").trim();
  if (!t) return "";
  const fenced = /^```(?:json|html)?\s*([\s\S]*?)```$/iu.exec(t);
  if (fenced?.[1]) t = fenced[1].trim();

  if (t.startsWith("{") && /"(?:note|reviseNote|html)"\s*:/u.test(t)) {
    try {
      const obj = JSON.parse(t) as { html?: unknown; content?: unknown };
      const inner = String(obj.html ?? obj.content ?? "").trim();
      if (inner) t = inner;
    } catch {
      const loose = extractHtmlFieldLoose(t);
      if (loose) t = loose;
    }
  }

  const chapter = /===CHAPTER===\s*([\s\S]*?)(?====NOTE===|===SOURCES_ADD===|$)/iu.exec(
    t,
  );
  if (chapter?.[1]?.trim()) t = chapter[1].trim();

  if (/\\[ntr"]/u.test(t) && /<[a-z][\s\S]*>/iu.test(t)) {
    t = unescapeJsonString(t);
  }

  return t.replace(/^(?:["'`])+|(?:["'`])+$/gu, "").trim();
}

export function stripAuthoringHintsFromHtml(html: string): string {
  const raw = repairDisplayedChapterHtml(String(html ?? ""));
  if (!raw.trim()) return raw;
  if (typeof DOMParser === "undefined") {
    return raw.replace(PAREN_HINT_RE, "");
  }
  const doc = new DOMParser().parseFromString(
    `<div id="__kn_root">${raw}</div>`,
    "text/html",
  );
  const root = doc.getElementById("__kn_root");
  if (!root) return raw;
  for (const el of [...root.querySelectorAll("p,div,span,small,em,li")]) {
    if (el.querySelector("p,div,table,ul,ol,section")) continue;
    const text = (el.textContent ?? "").trim();
    if (text && text.length < 180 && HINT_RE.test(text)) {
      el.remove();
    }
  }
  return root.innerHTML.replace(PAREN_HINT_RE, "");
}

export function stripAuthoringHintsFromText(text: string): string {
  return String(text ?? "")
    .replace(PAREN_HINT_RE, "")
    .split(/\n+/)
    .filter((line) => {
      const t = line.trim();
      return !(t && t.length < 180 && HINT_RE.test(t));
    })
    .join("\n")
    .replace(/\s{2,}/gu, " ")
    .trim();
}
