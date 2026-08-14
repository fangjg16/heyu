/**
 * 引用来源 / 名词解释：随任意章节「更新本章」增量合并（不整表重写）。
 * 锚点：id=kn-source-A-1；名词可选 id=kn-term-…
 */

const CITE_ID_RE = /\[([A-Za-z]+-\d+)\]/gu;

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
    /<tr(\s[^>]*)?>\s*<td([^>]*)>\s*([A-Za-z]+-\d+)\s*<\/td>/giu,
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
    if (/^[A-Za-z]+-\d+$/u.test(id)) ids.push(id);
  }
  return ids;
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
    if (!/^[A-Za-z]+-\d+$/u.test(id)) continue;
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
    /===GRAPH===\s*([\s\S]*?)(?====SOURCES_ADD===|===SOURCES===|===GLOSSARY_ADD===|$)/iu.exec(
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
