/** 前端：知识网络引用标记 [A-1] */

const CITE_ID_RE = /\[([A-Za-z]+-\d+)\]/gu;

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
  return text.replace(CITE_ID_RE, "").replace(/\s{2,}/gu, " ").trim();
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
