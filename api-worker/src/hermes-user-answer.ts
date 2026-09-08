/** 去掉 Hermes 不该对用户说的接口/工具名。 */

const LEAKS: Array<[RegExp, string]> = [
  [/项目资料\s*API\s*暂时不可用[。.]?/gu, ""],
  [/项目资料平台接口暂时不可用[^。\n]{0,80}[。.]?/gu, ""],
  [/当前联网检索工具（\s*Tavily\s*）/giu, "公开检索"],
  [/\bTavily\b/giu, "公开检索"],
  [/\bjfo-r2-materials\b/giu, "项目资料"],
  [/JFO_API_PUBLIC_BASE|JFO_INTERNAL_KEY/gu, ""],
];

export function sanitizeHermesUserFacingAnswer(raw: string): string {
  let t = (raw ?? "").replace(/\r\n/gu, "\n");
  for (const [re, to] of LEAKS) {
    t = t.replace(re, to);
  }
  t = t.replace(/[ \t]{2,}/gu, " ");
  t = t.replace(/\n{3,}/gu, "\n\n");
  return t.trim();
}
