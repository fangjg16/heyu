/**
 * 知识网络引用标记：
 * [A-1] [A-100] [S-100] [U-7] [A-10b] [S12]
 * 句末可连续出现，如 [A-100][S-100]
 */
const CITE_ID_CORE =
  "(?:[A-Za-z][A-Za-z0-9]*-\\d+[A-Za-z]?|[A-Za-z]\\d+[A-Za-z]?)";
const CITE_CLUSTER_RE = new RegExp(
  `(?:\\s*\\[\\s*${CITE_ID_CORE}\\s*\\])+`,
  "gu",
);

/** 发给项目方的标题/正文去掉尾注；内部原题保留引用以便回写 */
export function stripCitationMarkers(text: string): string {
  return (text ?? "")
    .replace(CITE_CLUSTER_RE, " ")
    .replace(/\s+([，。；：、])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}
