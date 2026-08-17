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

/**
 * 从待确认问题长句提取列表小标题（冒号前 / 首个分句）。
 */
export function extractOpenQuestionTitle(raw: string): {
  title: string;
  detail: string;
} {
  const text = stripCitationMarkers(raw).replace(/\s+/gu, " ").trim();
  if (!text) return { title: "", detail: "" };

  const colon = text.match(/^(.{4,48}?)[：:]\s*(.+)$/u);
  if (colon) {
    return { title: colon[1]!.trim(), detail: colon[2]!.trim() };
  }

  const clause = text.match(/^(.{6,40}?)([，。；]|$)/u);
  if (clause && clause[1] && (clause[2] || text.length > clause[1].length)) {
    const title = clause[1].trim();
    const detail = text.slice(title.length).replace(/^[，。；]\s*/u, "").trim();
    if (detail) return { title, detail };
  }

  if (text.length <= 42) return { title: text, detail: "" };
  return { title: `${text.slice(0, 40)}…`, detail: text };
}
