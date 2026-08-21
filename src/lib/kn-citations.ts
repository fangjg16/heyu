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
  const body = stripCitationMarkers(raw).replace(/\s+/gu, " ").trim();
  const { title } = extractOpenQuestionTitle(raw);
  return {
    title: (title || body).slice(0, 80),
    body: body || title,
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
  const parsed = extractOpenQuestionTitle(cleanedBody || cleanedTitle);
  const customTitle =
    Boolean(cleanedTitle) &&
    Boolean(cleanedBody) &&
    cleanedTitle !== cleanedBody &&
    !cleanedBody.startsWith(cleanedTitle) &&
    !cleanedTitle.startsWith(parsed.title);
  if (customTitle) {
    return {
      title: cleanedTitle,
      detail: parsed.detail || cleanedBody,
    };
  }
  if (parsed.title) return parsed;
  return { title: cleanedTitle || cleanedBody, detail: "" };
}

function clipQuestionTitle(s: string): string {
  const t = s.replace(/\s+/gu, " ").trim();
  if (t.length <= 36) return t;
  const cut = t.slice(0, 36);
  const punct = Math.max(
    cut.lastIndexOf("、"),
    cut.lastIndexOf("，"),
    cut.lastIndexOf(" "),
  );
  const base = punct > 14 ? cut.slice(0, punct) : cut;
  return `${base.replace(/[，、·.\s]+$/u, "")}…`;
}

/**
 * 从待确认问题长句提取列表小标题（Q1 · 短句 / 冒号前 / 首个分句）。
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

  const colon = body.match(/^(.{4,36}?)[：:]\s+(.+)$/u);
  if (colon) {
    return {
      title: clipQuestionTitle(`${prefix}${colon[1]!.trim()}`),
      detail: colon[2]!.trim(),
    };
  }

  const breakAt = body.search(/[。；]|(?:\s+附件)|(?:\s+资料仅)|(?:\s+仅称)/u);
  const headline = breakAt >= 8 ? body.slice(0, breakAt).trim() : body;
  const title = clipQuestionTitle(`${prefix}${headline}`);
  const remainder = breakAt >= 8 ? body.slice(breakAt).trim() : body;
  return {
    title,
    detail: remainder && remainder !== headline ? remainder : text === title ? "" : text,
  };
}
