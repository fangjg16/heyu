/**
 * 引用来源 / 名词解释：随任意章节「更新本章」增量合并（不整表重写）。
 * 锚点：id=kn-source-A-1；名词可选 id=kn-term-…
 */

const CITE_ID_CORE =
  "(?:[A-Za-z][A-Za-z0-9]*-\\d+[A-Za-z]?|[A-Za-z]\\d+[A-Za-z]?)";
const CITE_ID_RE = new RegExp(`\\[(${CITE_ID_CORE})\\]`, "gu");

export function knSourceAnchorId(citeId: string): string {
  return `kn-source-${citeId}`;
}

/** 将纯文本 [A-1] 转为可点击上标引用（已是 <a> 的跳过） */
export function linkifyCitationMarkers(html: string): string {
  if (!html) return html;
  const parts = html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/iu);
  return parts
    .map((part) => {
      if (/^<a\b/iu.test(part)) return part;
      return part.replace(CITE_ID_RE, (_m, id: string) => {
        const aid = knSourceAnchorId(id);
        return `<sup class="kn-cite-sup"><a class="kn-cite" href="#${aid}" data-kn-cite="${id}" title="查看来源 ${id}">[${id}]</a></sup>`;
      });
    })
    .join("");
}

export function ensureSourceRowAnchors(sourcesHtml: string): string {
  return sourcesHtml.replace(
    /<tr(\s[^>]*)?>\s*<td([^>]*)>\s*([A-Za-z][A-Za-z0-9]*-\d+[A-Za-z]?)\s*<\/td>/giu,
    (_m, trRest: string | undefined, tdRest: string, id: string) => {
      const trAttrs = trRest ?? "";
      let tdAttrs = tdRest ?? "";
      if (!/white-space\s*:\s*nowrap/iu.test(tdAttrs)) {
        if (/style\s*=\s*"/iu.test(tdAttrs)) {
          tdAttrs = tdAttrs.replace(
            /style\s*=\s*"/iu,
            'style="white-space:nowrap;',
          );
        } else {
          tdAttrs = ` style="white-space:nowrap;font-weight:600;color:#A3262C"${tdAttrs}`;
        }
      }
      if (/\bid\s*=/iu.test(trAttrs)) {
        return `<tr${trAttrs}><td${tdAttrs}>${id}</td>`;
      }
      return `<tr id="${knSourceAnchorId(id)}"${trAttrs}><td${tdAttrs}>${id}</td>`;
    },
  );
}

export const SOURCES_TABLE_SKELETON = `<table style="width:100%;border-collapse:collapse;border:1px solid rgba(78,66,57,0.12)">
  <thead>
    <tr style="background:rgba(78,66,57,0.05);font-size:12px;font-weight:600;color:#59625F">
      <th style="white-space:nowrap;width:1%;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">ID</th>
      <th style="white-space:nowrap;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">类型</th>
      <th style="white-space:nowrap;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">标题</th>
      <th style="white-space:nowrap;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">主体</th>
      <th style="white-space:nowrap;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">摘录/说明</th>
      <th style="white-space:nowrap;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">影响章节</th>
    </tr>
  </thead>
  <tbody>
  </tbody>
</table>`;

export const GLOSSARY_TABLE_SKELETON = `<table style="width:100%;border-collapse:collapse;border:1px solid rgba(78,66,57,0.12)">
  <thead>
    <tr style="background:rgba(78,66,57,0.05);font-size:12px;font-weight:600;color:#59625F">
      <th style="white-space:nowrap;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">名词</th>
      <th style="white-space:nowrap;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">解释</th>
      <th style="white-space:nowrap;padding:12px 14px;text-align:left;border-bottom:1px solid rgba(78,66,57,0.12)">在本项目中的意义</th>
    </tr>
  </thead>
  <tbody>
  </tbody>
</table>`;

/** 常识/常用词，禁止进入名词解释 */
const COMMON_GLOSSARY_BLOCKLIST = new Set(
  [
    "公司",
    "项目",
    "投资",
    "融资",
    "股权",
    "利润",
    "市场",
    "客户",
    "产品",
    "技术",
    "产能",
    "成本",
    "收入",
    "现金流",
    "估值",
    "风险",
    "合同",
    "协议",
    "法律",
    "政策",
    "行业",
    "需求",
    "供给",
    "价格",
    "订单",
    "工厂",
    "团队",
    "股东",
    "董事",
    "bp",
    "irr",
    "roi",
    "ceo",
    "cfo",
    "ipo",
    "pdf",
    "china",
    "中国",
    "美国",
    "天津",
    "待补",
  ].map((s) => s.toLowerCase()),
);

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function extractFirstTable(html: string): string | null {
  const m = html.match(/<table\b[\s\S]*?<\/table>/iu);
  return m?.[0]?.trim() ?? null;
}

function extractTbodyRows(tableHtml: string): string[] {
  const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/iu.exec(tableHtml);
  const body = tbody?.[1] ?? tableHtml;
  return body.match(/<tr\b[\s\S]*?<\/tr>/giu) ?? [];
}

function rowFirstCellText(rowHtml: string): string {
  const m = /<td\b[^>]*>([\s\S]*?)<\/td>/iu.exec(rowHtml);
  return stripTags(m?.[1] ?? "");
}

function rowCellTexts(rowHtml: string): string[] {
  const cells = rowHtml.match(/<td\b[^>]*>[\s\S]*?<\/td>/giu) ?? [];
  return cells.map((c) => stripTags(c.replace(/^<td\b[^>]*>|<\/td>$/giu, "")));
}

export function extractSourceIds(sourcesHtml: string): string[] {
  if (!sourcesHtml.trim()) return [];
  const ids: string[] = [];
  for (const row of extractTbodyRows(sourcesHtml)) {
    const id = rowFirstCellText(row);
    if (/^[A-Za-z][A-Za-z0-9]*-\d+[A-Za-z]?$/u.test(id)) ids.push(id);
  }
  return ids;
}

export function normalizeCiteId(raw: string): string | null {
  const s = String(raw ?? "")
    .replace(/^source-/iu, "")
    .trim();
  if (!s) return null;
  const dashed = /^([A-Za-z][A-Za-z0-9]*)-(\d+[A-Za-z]?)$/u.exec(s);
  if (dashed) return `${dashed[1]!.toUpperCase()}-${dashed[2]}`;
  const short = /^([A-Za-z])(\d+[A-Za-z]?)$/u.exec(s);
  if (short) return `${short[1]!.toUpperCase()}-${short[2]}`;
  return null;
}

export function extractCiteIdsFromHtml(html: string): string[] {
  if (!html?.trim()) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const id = normalizeCiteId(raw);
    if (!id) return;
    const key = id.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(id);
  };
  for (const m of html.matchAll(CITE_ID_RE)) add(m[1] ?? "");
  for (const m of html.matchAll(/data-kn-cite=["']([^"']+)["']/giu)) {
    add(m[1] ?? "");
  }
  for (const m of html.matchAll(/#(?:kn-)?source-([A-Za-z][A-Za-z0-9_-]*)/giu)) {
    add(m[1] ?? "");
  }
  return found;
}

function typeFromCiteId(id: string): string {
  const prefix = id.split("-")[0]?.toUpperCase() ?? "";
  if (prefix === "A") return "项目文件";
  if (prefix === "U") return "用户上传";
  if (prefix === "S") return "公开资料";
  return "引用";
}

function patchSourceUsedIn(
  tableHtml: string,
  id: string,
  sectionLabel: string,
): string {
  if (!sectionLabel.trim()) return tableHtml;
  return tableHtml.replace(
    new RegExp(
      `(<tr\\b[^>]*\\bid=["']${knSourceAnchorId(id)}["'][^>]*>[\\s\\S]*?<\\/tr>)|(<tr\\b[^>]*>\\s*<td[^>]*>\\s*${id}\\s*<\\/td>[\\s\\S]*?<\\/tr>)`,
      "iu",
    ),
    (full) => {
      const tds = full.match(/<td\b[^>]*>[\s\S]*?<\/td>/giu) ?? [];
      if (tds.length < 6) return full;
      const usedIn = stripTags(tds[5]!);
      const next = mergeUsedIn(usedIn, sectionLabel);
      if (next === usedIn) return full;
      const newTd = tds[5]!.replace(/>([\s\S]*)</u, `>${next}<`);
      return full.replace(tds[5]!, newTd);
    },
  );
}

export type SourceFileHint = {
  id: string;
  title: string;
  type?: string;
  excerpt?: string;
};

/** 用已发布章节里的引用标记 + 资料包文件，补全空的引用来源表 */
export function mergeCitedSourcesIntoTable(params: {
  existingHtml?: string | null;
  citations: { id: string; usedIn: string }[];
  files?: SourceFileHint[];
}): { html: string; changed: boolean } {
  const before = (params.existingHtml ?? "").trim();
  let base = ensureSourcesTableShell(params.existingHtml);
  const existingIds = new Set(
    extractSourceIds(base).map((id) => id.toUpperCase()),
  );
  const usedById = new Map<string, string[]>();
  const displayId = new Map<string, string>();
  const remember = (id: string, usedIn?: string) => {
    const key = id.toUpperCase();
    if (!displayId.has(key)) displayId.set(key, id);
    if (!usedIn?.trim()) return;
    const arr = usedById.get(key) ?? [];
    if (!arr.includes(usedIn)) arr.push(usedIn);
    usedById.set(key, arr);
  };

  for (const c of params.citations) {
    const id = normalizeCiteId(c.id);
    if (id) remember(id, c.usedIn);
  }
  for (const file of params.files ?? []) {
    const id = normalizeCiteId(file.id) ?? file.id;
    remember(id);
  }

  const orderedKeys: string[] = [];
  for (const file of params.files ?? []) {
    const id = normalizeCiteId(file.id) ?? file.id;
    const key = id.toUpperCase();
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }
  for (const key of usedById.keys()) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }

  const fileById = new Map(
    (params.files ?? []).map((f) => {
      const id = normalizeCiteId(f.id) ?? f.id;
      return [id.toUpperCase(), f] as const;
    }),
  );

  const toAppend: string[] = [];
  for (const key of orderedKeys) {
    const id = displayId.get(key) ?? key;
    const labels = usedById.get(key) ?? [];
    if (existingIds.has(key)) {
      for (const label of labels) {
        base = patchSourceUsedIn(base, id, label);
      }
      continue;
    }
    const file = fileById.get(key);
    toAppend.push(
      formatSourceRow(
        id,
        file?.type || typeFromCiteId(id),
        file?.title || `来源 ${id}`,
        "",
        file?.excerpt || "",
        labels.join("、") || (file ? "资料包" : "待补"),
      ),
    );
    existingIds.add(key);
  }

  base = appendRowsToTbody(base, toAppend);
  const html = ensureSourceRowAnchors(base);
  return { html, changed: html.trim() !== before };
}

export function extractGlossaryTerms(glossaryHtml: string): string[] {
  if (!glossaryHtml.trim()) return [];
  const terms: string[] = [];
  for (const row of extractTbodyRows(glossaryHtml)) {
    const term = rowFirstCellText(row);
    if (term) terms.push(term);
  }
  return terms;
}

function normalizeTermKey(term: string): string {
  return term.replace(/\s+/gu, "").toLowerCase();
}

/** 是否值得收入名词解释：非常用；优先多字母缩写/专业术语 */
export function shouldKeepGlossaryTerm(term: string): boolean {
  const t = term.trim();
  if (!t || t === "待补" || t.length <= 1) return false;
  const key = normalizeTermKey(t);
  if (COMMON_GLOSSARY_BLOCKLIST.has(key)) return false;

  // 多字母拉丁缩写 / 带数字的缩写（如 BPC-157、rPTA、GMP、AHPRA）
  if (/^[A-Za-z]{2,}(?:[-/][A-Za-z0-9]+)*$/u.test(t)) return true;
  if (/\b[A-Za-z]{2,}[-/]?[A-Za-z0-9]*\b/u.test(t) && /[A-Za-z]{2,}/u.test(t)) {
    return true;
  }

  // 纯中文：至少 3 字；排除公司名后缀
  if (/^[\u4e00-\u9fff]{3,12}$/u.test(t)) {
    if (/(公司|有限|股份|集团)$/u.test(t)) return false;
    return true;
  }

  return false;
}

const KNOWN_GLOSSARY_DEFS: Record<string, string> = {
  TAM: "Total Addressable Market，总潜在市场",
  SAM: "Serviceable Addressable Market，可服务市场",
  SOM: "Serviceable Obtainable Market，短期内可获得的市场份额",
  MVP: "Minimum Viable Product，最小可行产品",
  GTM: "Go-to-Market，市场进入策略",
  ICP: "Ideal Customer Profile，理想客户画像",
  PMF: "Product-Market Fit，产品与市场契合",
  CAC: "Customer Acquisition Cost，获客成本",
  LTV: "Lifetime Value，客户终身价值",
  ARR: "Annual Recurring Revenue，年经常性收入",
  MRR: "Monthly Recurring Revenue，月经常性收入",
};

function escapeGlossaryCell(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rememberGlossaryEntry(
  byKey: Map<string, { term: string; definition: string }>,
  term: string,
  definition: string,
): void {
  const t = term.trim();
  if (!shouldKeepGlossaryTerm(t)) return;
  const key = normalizeTermKey(t);
  const def = definition.replace(/\s+/gu, " ").trim();
  const prev = byKey.get(key);
  if (!prev) {
    byKey.set(key, { term: t, definition: def });
    return;
  }
  if (def && def.length > prev.definition.length) {
    byKey.set(key, { term: prev.term, definition: def });
  }
}

/** 从已渲章节 HTML 抽出非常用术语（括号/冒号释义，以及 TAM/SAM 等常见研究缩写） */
export function extractGlossaryEntriesFromHtml(
  html: string,
): { term: string; definition: string }[] {
  if (!html?.trim()) return [];
  const text = stripTags(html);
  const byKey = new Map<string, { term: string; definition: string }>();

  for (const m of html.matchAll(
    /\b([A-Za-z][A-Za-z0-9]{1,14}(?:[-/][A-Za-z0-9]+)*)\s*[（(]([^）)]{2,120})[）)]/gu,
  )) {
    rememberGlossaryEntry(byKey, m[1] ?? "", m[2] ?? "");
  }
  for (const m of text.matchAll(
    /\b([A-Za-z][A-Za-z0-9]{1,14}(?:[-/][A-Za-z0-9]+)*)\s*[：:]\s*([^\n。；;]{2,80})/gu,
  )) {
    rememberGlossaryEntry(byKey, m[1] ?? "", m[2] ?? "");
  }
  for (const m of html.matchAll(
    /<(?:strong|b)[^>]*>\s*([A-Za-z][A-Za-z0-9]{1,14}(?:[-/][A-Za-z0-9]+)*)\s*<\/(?:strong|b)>\s*[：:（(]?\s*([^<]{2,80})/giu,
  )) {
    rememberGlossaryEntry(
      byKey,
      m[1] ?? "",
      (m[2] ?? "").replace(/[）)]$/u, ""),
    );
  }

  for (const [term, def] of Object.entries(KNOWN_GLOSSARY_DEFS)) {
    const hit =
      new RegExp(`\\b${term}\\b`, "iu").test(text) ||
      (term === "TAM" && /总潜在市场|总市场/.test(text)) ||
      (term === "SAM" && /可服务市场/.test(text)) ||
      (term === "SOM" && /可获得份额|可获得市场/.test(text)) ||
      (term === "MVP" && /最小可行产品/.test(text));
    if (hit) rememberGlossaryEntry(byKey, term, def);
  }

  return [...byKey.values()].filter((e) => e.definition);
}

export function glossaryAddHtmlFromEntries(
  entries: { term: string; definition: string; relevance?: string }[],
): string {
  if (entries.length === 0) return "";
  const rows = entries.map(
    (e) =>
      `<tr><td>${escapeGlossaryCell(e.term)}</td><td>${escapeGlossaryCell(e.definition)}</td><td>${escapeGlossaryCell(e.relevance ?? "")}</td></tr>`,
  );
  return `<table><tbody>\n${rows.join("\n")}\n</tbody></table>`;
}

export function mergeGlossaryFromChapterHtml(params: {
  existingHtml: string | null | undefined;
  chapterHtml: string;
  sectionLabel: string;
}): string {
  const entries = extractGlossaryEntriesFromHtml(params.chapterHtml).map(
    (e) => ({
      ...e,
      relevance: params.sectionLabel,
    }),
  );
  if (entries.length === 0) {
    return (params.existingHtml ?? "").trim();
  }
  return mergeGlossaryAppend({
    existingHtml: params.existingHtml,
    addHtml: glossaryAddHtmlFromEntries(entries),
  });
}

function ensureSourcesTableShell(html: string | null | undefined): string {
  const table = html?.trim() ? extractFirstTable(html) : null;
  if (table && /<tbody\b/iu.test(table)) {
    return ensureSourceRowAnchors(table);
  }
  return SOURCES_TABLE_SKELETON;
}

function ensureGlossaryTableShell(html: string | null | undefined): string {
  const table = html?.trim() ? extractFirstTable(html) : null;
  if (table && /<tbody\b/iu.test(table)) return table;
  return GLOSSARY_TABLE_SKELETON;
}

function appendRowsToTbody(tableHtml: string, newRows: string[]): string {
  if (newRows.length === 0) return tableHtml;
  if (/<tbody\b[^>]*>\s*<\/tbody>/iu.test(tableHtml)) {
    return tableHtml.replace(
      /<tbody\b[^>]*>\s*<\/tbody>/iu,
      `<tbody>\n${newRows.join("\n")}\n</tbody>`,
    );
  }
  return tableHtml.replace(/<\/tbody>/iu, `${newRows.join("\n")}\n</tbody>`);
}

function formatSourceRow(
  id: string,
  type: string,
  title: string,
  author: string,
  excerpt: string,
  usedIn: string,
): string {
  const cell =
    'style="padding:13px 14px;border-bottom:1px solid rgba(78,66,57,0.1)"';
  return `<tr id="${knSourceAnchorId(id)}"><td style="white-space:nowrap;padding:13px 14px;font-weight:600;color:#A3262C;border-bottom:1px solid rgba(78,66,57,0.1)">${id}</td><td ${cell}>${type || "待补"}</td><td ${cell}>${title || "待补"}</td><td ${cell}>${author || "待补"}</td><td ${cell}>${excerpt || "待补"}</td><td ${cell}>${usedIn || "待补"}</td></tr>`;
}

function formatGlossaryRow(
  term: string,
  definition: string,
  relevance: string,
): string {
  const cell = 'style="padding:14px;border-top:1px solid rgba(78,66,57,0.1)"';
  return `<tr id="kn-term-${encodeURIComponent(normalizeTermKey(term))}"><td style="padding:14px;font-weight:600;color:#A3262C;border-top:1px solid rgba(78,66,57,0.1)">${term}</td><td ${cell}>${definition || "待补"}</td><td style="padding:14px;color:#59625F;border-top:1px solid rgba(78,66,57,0.1)">${relevance || "待补"}</td></tr>`;
}

function mergeUsedIn(existing: string, sectionLabel: string): string {
  const parts = existing
    .split(/[、,，;/｜|]/u)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sectionLabel.trim()) return existing || sectionLabel;
  if (
    parts.some((p) => p === sectionLabel) ||
    existing.includes(sectionLabel)
  ) {
    return existing;
  }
  return existing.trim() ? `${existing.trim()}、${sectionLabel}` : sectionLabel;
}

/**
 * 把 LLM 给出的「新增来源」合并进现有表：已有 ID 不覆盖，仅可追加影响章节；新 ID 追加行。
 */
export function mergeSourcesAppend(params: {
  existingHtml: string | null | undefined;
  addHtml: string | null | undefined;
  sectionLabel: string;
}): string {
  let base = ensureSourcesTableShell(params.existingHtml);
  const addTable = params.addHtml?.trim()
    ? extractFirstTable(params.addHtml)
    : null;
  if (!addTable) {
    return ensureSourceRowAnchors(base);
  }

  const existingIds = new Set(
    extractSourceIds(base).map((id) => id.toUpperCase()),
  );
  const toAppend: string[] = [];

  for (const row of extractTbodyRows(addTable)) {
    const cells = rowCellTexts(row);
    const id = (cells[0] ?? "").trim();
    if (!/^[A-Za-z][A-Za-z0-9]*-\d+[A-Za-z]?$/u.test(id)) continue;
    const idKey = id.toUpperCase();
    if (existingIds.has(idKey)) {
      base = base.replace(
        new RegExp(
          `(<tr\\b[^>]*\\bid=["']${knSourceAnchorId(id)}["'][^>]*>[\\s\\S]*?<\\/tr>)|(<tr\\b[^>]*>\\s*<td[^>]*>\\s*${id}\\s*<\\/td>[\\s\\S]*?<\\/tr>)`,
          "iu",
        ),
        (full) => {
          const tds = full.match(/<td\b[^>]*>[\s\S]*?<\/td>/giu) ?? [];
          if (tds.length < 6) return full;
          const usedIn = stripTags(tds[5]!);
          const next = mergeUsedIn(usedIn, params.sectionLabel);
          if (next === usedIn) return full;
          const newTd = tds[5]!.replace(/>([\s\S]*)</u, `>${next}<`);
          return full.replace(tds[5]!, newTd);
        },
      );
      continue;
    }
    existingIds.add(idKey);
    toAppend.push(
      formatSourceRow(
        id,
        cells[1] ?? "",
        cells[2] ?? "",
        cells[3] ?? "",
        cells[4] ?? "",
        mergeUsedIn(cells[5] ?? "", params.sectionLabel),
      ),
    );
  }

  base = appendRowsToTbody(base, toAppend);
  return ensureSourceRowAnchors(base);
}

/** 增量合并名词解释：已有名词跳过；常识词过滤掉。 */
export function mergeGlossaryAppend(params: {
  existingHtml: string | null | undefined;
  addHtml: string | null | undefined;
}): string {
  let base = ensureGlossaryTableShell(params.existingHtml);
  const addTable = params.addHtml?.trim()
    ? extractFirstTable(params.addHtml)
    : null;
  if (!addTable) return base;

  const existing = new Set(
    extractGlossaryTerms(base).map((t) => normalizeTermKey(t)),
  );
  const toAppend: string[] = [];

  for (const row of extractTbodyRows(addTable)) {
    const cells = rowCellTexts(row);
    const term = (cells[0] ?? "").trim();
    if (!term || !shouldKeepGlossaryTerm(term)) continue;
    const key = normalizeTermKey(term);
    if (existing.has(key)) continue;
    existing.add(key);
    toAppend.push(formatGlossaryRow(term, cells[1] ?? "", cells[2] ?? ""));
  }

  return appendRowsToTbody(base, toAppend);
}

export function parseChapterGenerateAnswer(answer: string): {
  chapterHtml: string;
  sourcesAddHtml: string;
  glossaryAddHtml: string;
  graphSegment: string;
} {
  const raw = (answer ?? "").trim();

  const chapterMark =
    /===CHAPTER===\s*([\s\S]*?)(?====GRAPH===|===SOURCES_ADD===|===SOURCES===|===GLOSSARY_ADD===|$)/iu.exec(
      raw,
    ) ??
    /===SNAPSHOT===\s*([\s\S]*?)(?====GRAPH===|===SOURCES_ADD===|===SOURCES===|===GLOSSARY_ADD===|$)/iu.exec(
      raw,
    );

  const graphMark =
    /===(?:GRAPH|关系图)===\s*([\s\S]*?)(?====(?:SOURCES_ADD|SOURCES|GLOSSARY_ADD|CHAPTER)===|$)/iu.exec(
      raw,
    );

  const sourcesMark =
    /===SOURCES_ADD===\s*([\s\S]*?)(?====GLOSSARY_ADD===|$)/iu.exec(raw) ??
    /===SOURCES===\s*([\s\S]*?)(?====GLOSSARY_ADD===|$)/iu.exec(raw);

  const glossaryMark = /===GLOSSARY_ADD===\s*([\s\S]*?)$/iu.exec(raw);

  let chapterHtml = (chapterMark?.[1] ?? "").trim();
  let graphSegment = (graphMark?.[1] ?? "").trim();
  let sourcesAddHtml = (sourcesMark?.[1] ?? "").trim();
  let glossaryAddHtml = (glossaryMark?.[1] ?? "").trim();

  if (/^(NONE|无|无新增)\s*$/iu.test(sourcesAddHtml)) sourcesAddHtml = "";
  if (/^(NONE|无|无新增)\s*$/iu.test(glossaryAddHtml)) glossaryAddHtml = "";
  if (/^(NONE|无|无新增)\s*$/iu.test(graphSegment)) graphSegment = "";

  if (!chapterHtml) {
    const before =
      raw
        .split(
          /===GRAPH===|===SOURCES_ADD===|===SOURCES===|===GLOSSARY_ADD===/iu,
        )[0]
        ?.trim() ?? "";
    chapterHtml = before
      .replace(/^===CHAPTER===\s*/iu, "")
      .replace(/^===SNAPSHOT===\s*/iu, "")
      .trim();
  }

  if (!chapterHtml && !sourcesAddHtml && !glossaryAddHtml && !graphSegment) {
    const tables = raw.match(/<table\b[\s\S]*?<\/table>/giu) ?? [];
    if (tables.length >= 1) {
      chapterHtml = tables[0]!;
      if (tables.length >= 2) sourcesAddHtml = tables[1]!;
      if (tables.length >= 3) glossaryAddHtml = tables[2]!;
    } else {
      chapterHtml = raw;
    }
  }

  return { chapterHtml, sourcesAddHtml, glossaryAddHtml, graphSegment };
}

/** @deprecated 兼容旧测试 */
export function parseSnapshotAndSourcesAnswer(answer: string): {
  snapshotHtml: string;
  sourcesHtml: string;
} {
  const p = parseChapterGenerateAnswer(answer);
  return { snapshotHtml: p.chapterHtml, sourcesHtml: p.sourcesAddHtml };
}

export function listExistingMetaDigest(params: {
  sourcesHtml: string | null | undefined;
  glossaryHtml: string | null | undefined;
}): string {
  const ids = extractSourceIds(params.sourcesHtml ?? "");
  const terms = extractGlossaryTerms(params.glossaryHtml ?? "");
  return [
    "【知识网络已有引用来源 ID】",
    ids.length ? ids.join("、") : "（尚无）",
    "",
    "【知识网络已有名词】",
    terms.length ? terms.join("、") : "（尚无）",
    "",
    "增量规则：===SOURCES_ADD=== / ===GLOSSARY_ADD=== 只输出本章新出现且上方清单中没有的条目；已有 ID/名词不要重复整行重写。若无新增，该段写 NONE。",
  ].join("\n");
}

/** 表头不换行：给所有 <th> 补 white-space:nowrap */
export function ensureTableHeaderNoWrap(html: string): string {
  if (!html) return html;
  return html.replace(/<th(\s[^>]*?)?>/giu, (full, attrs = "") => {
    const a = attrs ?? "";
    if (/white-space\s*:\s*nowrap/iu.test(a)) return full;
    if (/style\s*=\s*"/iu.test(a)) {
      return `<th${a.replace(/style\s*=\s*"/iu, 'style="white-space:nowrap;')}>`;
    }
    return `<th style="white-space:nowrap"${a}>`;
  });
}

function isEvidenceSourceHeader(text: string): boolean {
  const t = text.replace(/\s+/gu, "");
  return /证据[/／]来源/u.test(t) || t === "证据来源";
}

/**
 * 「证据/来源」列只保留引用链接（或 [A-1]）；去掉「项目方整理」等说明文字。
 * 无引用时保留「待补」/「—」等短占位，否则清空为「待补」。
 */
export function stripEvidenceSourceCellsToLinksOnly(html: string): string {
  if (!html || !/<table\b/iu.test(html)) return html;

  return html.replace(/<table\b[\s\S]*?<\/table>/giu, (table) => {
    const headerRow =
      /<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>/iu.exec(table)?.[1] ??
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/iu.exec(table)?.[1];
    if (!headerRow) return table;

    const headers = [
      ...(headerRow.match(/<th\b[^>]*>[\s\S]*?<\/th>/giu) ?? []),
      ...(headerRow.match(/<td\b[^>]*>[\s\S]*?<\/td>/giu) ?? []),
    ];
    const evidenceIdx = headers.findIndex((h) =>
      isEvidenceSourceHeader(stripTags(h)),
    );
    if (evidenceIdx < 0) return table;

    return table.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/giu, (row, offset) => {
      // 跳过表头行（含 th）
      if (/<th\b/iu.test(row)) return row;
      // 若首行在 thead 外且是用 td 写的表头，已由 evidenceIdx 识别；仍避免改第一行若它就是 headerRow
      if (offset === 0 && row.includes(headerRow)) return row;

      const cells = row.match(/<td\b[^>]*>[\s\S]*?<\/td>/giu);
      if (!cells || evidenceIdx >= cells.length) return row;

      const cell = cells[evidenceIdx]!;
      const inner = cell.replace(/^<td\b[^>]*>/iu, "").replace(/<\/td>$/iu, "");
      const links = inner.match(/<a\b[^>]*>[\s\S]*?<\/a>/giu) ?? [];
      const bareMarkers = [
        ...new Set(
          [...inner.replace(/<a\b[^>]*>[\s\S]*?<\/a>/giu, "").matchAll(/\[([A-Za-z]+-\d+)\]/gu)].map(
            (m) => m[0]!,
          ),
        ),
      ];

      let nextInner: string;
      if (links.length > 0) {
        nextInner = [...links, ...bareMarkers].join(" ");
      } else if (bareMarkers.length > 0) {
        nextInner = bareMarkers.join(" ");
      } else {
        const plain = stripTags(inner).trim();
        nextInner =
          !plain ||
          plain === "待补" ||
          plain === "—" ||
          plain === "-" ||
          plain === "缺口"
            ? plain || "待补"
            : "待补";
      }

      const open = /^<td\b[^>]*>/iu.exec(cell)?.[0] ?? "<td>";
      const newCell = `${open}${nextInner}</td>`;
      return row.replace(cell, newCell);
    });
  });
}

/**
 * 项目快照：「项目项」列单行完整显示（首列 td/th 加 white-space:nowrap）。
 */
export function ensureSnapshotItemColumnNoWrap(html: string): string {
  if (!html || !/<table\b/iu.test(html)) return html;

  return html.replace(/<table\b[\s\S]*?<\/table>/giu, (table) => {
    const headerRow =
      /<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>/iu.exec(table)?.[1] ??
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/iu.exec(table)?.[1];
    if (!headerRow) return table;
    const firstHeader =
      /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/iu.exec(headerRow)?.[1] ?? "";
    if (stripTags(firstHeader).replace(/\s+/gu, "") !== "项目项") return table;

    return table.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/giu, (row) =>
      row.replace(/<(th|td)(\s[^>]*?)?>/iu, (_m, tag: string, attrs = "") => {
        const a = attrs ?? "";
        const isTh = tag.toLowerCase() === "th";
        if (/white-space\s*:\s*nowrap/iu.test(a)) {
          if (isTh && !/width\s*:/iu.test(a) && /style\s*=\s*"/iu.test(a)) {
            return `<${tag}${a.replace(/style\s*=\s*"/iu, 'style="width:1%;')}>`;
          }
          return `<${tag}${a}>`;
        }
        if (/style\s*=\s*"/iu.test(a)) {
          return `<${tag}${a.replace(
            /style\s*=\s*"/iu,
            isTh
              ? 'style="white-space:nowrap;width:1%;'
              : 'style="white-space:nowrap;',
          )}>`;
        }
        return `<${tag} style="white-space:nowrap${isTh ? ";width:1%" : ""}"${a}>`;
      }),
    );
  });
}

/** 章节 HTML 后处理：表头不换行 + 证据列只留链接 */
export function polishChapterTableHtml(html: string): string {
  let t = ensureTableHeaderNoWrap(html);
  t = ensureSnapshotItemColumnNoWrap(t);
  t = stripEvidenceSourceCellsToLinksOnly(t);
  return t;
}
