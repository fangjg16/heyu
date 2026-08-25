import { stripAuthoringHintsFromText } from "@/lib/strip-authoring-hints";

/**
 * 知识网络引用标记：
 * [A-1] [A-100] [S-100] [U-7] [A-10b] [S12]
 * 句末可连续出现，如 [A-100][S-100]
 */
const CITE_ID_CORE =
  "(?:[A-Za-z][A-Za-z0-9]*-\\d+[A-Za-z]?|[A-Za-z]\\d+[A-Za-z]?)";
const CITE_ID_RE = new RegExp(`\\[\\s*(${CITE_ID_CORE})\\s*\\]`, "gu");
const CITE_CLUSTER_RE = new RegExp(
  `(?:\\s*\\[\\s*${CITE_ID_CORE}\\s*\\])+`,
  "gu",
);

export function knSourceAnchorId(citeId: string): string {
  return `kn-source-${citeId}`;
}

/** 将正文中的 [A-1] 转为可点上标（已是 <a> 的跳过） */
export function linkifyCitationMarkersHtml(html: string): string {
  if (!html) return html;
  const parts = html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/iu);
  return parts
    .map((part) => {
      if (/^<a\b/iu.test(part)) {
        // 旧数据可能是普通 kn-cite 无上标包裹
        if (
          /class=["'][^"']*kn-cite[^"']*["']/iu.test(part) &&
          !/kn-cite-sup/iu.test(part)
        ) {
          return `<sup class="kn-cite-sup">${part}</sup>`;
        }
        return part;
      }
      return part.replace(CITE_ID_RE, (_m, id: string) => {
        const aid = knSourceAnchorId(id);
        return `<sup class="kn-cite-sup"><a class="kn-cite" href="#${aid}" data-kn-cite="${id}" title="查看来源 ${id}">[${id}]</a></sup>`;
      });
    })
    .join("");
}

export function stripCitationMarkers(text: string): string {
  return (text ?? "")
    .replace(CITE_CLUSTER_RE, " ")
    .replace(/\s+([，。；：、])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

/** 发给项目协作方 / 项目协作方展示：去掉尾注，标题与正文拆开 */
export function formatOpenQuestionForIssuer(raw: string): {
  title: string;
  body: string;
} {
  const full = stripCitationMarkers(raw).replace(/\s+/gu, " ").trim();
  const { title, detail } = extractOpenQuestionTitle(raw);
  const cleanTitle = title || full;
  const body = (detail || stripTitleFromBody(full, cleanTitle)).trim();
  return {
    title: cleanTitle,
    body: body && body !== cleanTitle ? body : full,
  };
}

/** 已发出事项的展示清洗（兼容旧数据里还带着 [A-1][A-100][S-100]） */
export function previewCollabQuestion(input: {
  title?: string | null;
  body?: string | null;
}): { title: string; detail: string } {
  const cleanedTitle = stripCitationMarkers(input.title ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  const cleanedBody = stripCitationMarkers(input.body ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  const clipped = /…$|\.{2,}$/u.test(cleanedTitle);
  const parsed = extractOpenQuestionTitle(cleanedBody || cleanedTitle);
  const customTitle =
    Boolean(cleanedTitle) &&
    Boolean(cleanedBody) &&
    cleanedTitle !== cleanedBody &&
    !clipped &&
    !cleanedBody.startsWith(cleanedTitle.replace(/[…]+$/u, "").trim()) &&
    !cleanedTitle.startsWith(parsed.title);
  if (customTitle) {
    return {
      title: cleanedTitle,
      detail:
        stripTitleFromBody(cleanedBody, cleanedTitle.replace(/…+$/u, "").trim()) ||
        parsed.detail ||
        cleanedBody,
    };
  }
  if (parsed.title) {
    return {
      title: parsed.title,
      detail:
        parsed.detail ||
        stripTitleFromBody(cleanedBody || cleanedTitle, parsed.title),
    };
  }
  return { title: cleanedTitle || cleanedBody, detail: "" };
}

const CLAIM_END =
  "未确认|未提供|未核实|未验证|未披露|全未提供|待核实|待验证|待确认";

function shareTitleTokens(a: string, b: string): boolean {
  const toks = (s: string) =>
    s
      .split(/[\/·、,，\s]+/u)
      .map((x) => x.trim())
      .filter((x) => x.length >= 2);
  const left = toks(a);
  const right = toks(b);
  if (left.length === 0 || right.length === 0) return false;
  let hits = 0;
  for (const tok of left) {
    if (right.some((r) => r === tok || r.includes(tok) || tok.includes(r))) {
      hits += 1;
    }
  }
  return hits >= Math.min(2, left.length);
}

/** 去掉正文开头重复的标题（含同义短句，如 cap table / 股权结构表） */
export function stripTitleFromBody(text: string, title: string): string {
  const t = title.replace(/[….]+$/u, "").trim();
  if (!t) return text.trim();
  let s = text.trim();
  if (s.startsWith(t)) {
    s = s
      .slice(t.length)
      .replace(/^(?:[：:]\s*|[，,、;；。.\s]+)/u, "")
      .trim();
  }
  const ender = t.match(new RegExp(`(?:${CLAIM_END})$`, "u"))?.[0];
  if (ender) {
    const lead = s.match(new RegExp(`^.{4,48}?${ender}[\\s。；;，,]*`, "u"));
    if (lead?.[0] && shareTitleTokens(lead[0], t)) {
      s = s.slice(lead[0].length).trim();
    }
  }
  return s;
}

function pickHeadline(body: string): { title: string; detail: string } {
  const colon = body.match(/^(.{4,40}?)[：:]\s+(.+)$/u);
  if (colon) {
    return { title: colon[1]!.trim(), detail: colon[2]!.trim() };
  }

  const claim = body.match(
    new RegExp(`^(.{4,40}?(?:${CLAIM_END}))(?=\\s|[。；;，,]|$)`, "u"),
  );
  if (claim) {
    const title = claim[1]!.trim();
    return { title, detail: stripTitleFromBody(body, title) };
  }

  const breakAt = body.search(
    /[。；]|(?:\s+附件)|(?:\s+资料仅)|(?:\s+仅称)|(?:\s*(?:→|->|——)\s*)/u,
  );
  if (breakAt >= 8 && breakAt <= 48) {
    const title = body.slice(0, breakAt).replace(/[：:\s]+$/u, "").trim();
    return { title, detail: stripTitleFromBody(body, title) };
  }

  const compact = body.match(/^(.{6,28})\s+(.{12,})$/u);
  if (compact && !/[。；：:]/u.test(compact[1]!)) {
    const title = compact[1]!.trim();
    return { title, detail: stripTitleFromBody(body, title) };
  }

  return {
    title: body.length <= 40 ? body : body.slice(0, 40).trim(),
    detail: body,
  };
}

/**
 * 从待确认问题长句提取完整小标题，而不是按字数裁切加省略号。
 */
export function extractOpenQuestionTitle(raw: string): {
  title: string;
  detail: string;
} {
  const text = stripAuthoringHintsFromText(
    stripCitationMarkers(raw).replace(/\s+/gu, " "),
  );
  if (!text) return { title: "", detail: "" };

  const tagged = text.match(/^(Q\d+|P\d+)\s*[·.•]\s*(.+)$/iu);
  const prefix = tagged ? `${tagged[1]!.toUpperCase()} · ` : "";
  const body = tagged ? tagged[2]!.trim() : text;
  const picked = pickHeadline(body);
  const detail = stripTitleFromBody(picked.detail || body, picked.title);
  return {
    title: `${prefix}${picked.title}`.trim(),
    detail: detail && detail !== picked.title ? detail : "",
  };
}
