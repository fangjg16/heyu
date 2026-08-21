/** 生成模板里写给模型的制作说明，不应出现在用户看到的章节里。 */
const HINT_RE =
  /禁止改成\s*SVG|禁止\s*SVG|仅写入与本项目直接相关|不要写\s*IRR|禁止编造\s*IRR|不要再画一张九宫格|不要三个核验计数|格内填风险编号|生成后由页面挂载|不要和行业章重复|只写\s*3[–—-]?\s*5\s*个关键对手|格内用\s*强\s*\/\s*够|标签用\s*\[Data\]|但仍须保留本节|可改成流程增值图|不要写对战卡|按已发生事项、待核验节点/u;

const PAREN_HINT_RE = /（[^）]{0,80}(?:不要|禁止|仅写入|格内填|须保留)[^）]{0,80}）/gu;

export function stripAuthoringHintsFromHtml(html: string): string {
  const raw = String(html ?? "");
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
