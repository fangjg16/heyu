/**
 * 知识网络结构件：股权架构图、初筛/投资结论卡、状态词中文。
 * 只改呈现，不改资料包原文。
 */

export type KnTone = "go" | "caution" | "stop" | "neutral";

type Holding = { name: string; pct: string };
type CapEntity = { name: string; holders: Holding[] };

const STATUS_ZH: Record<string, string> = {
  watch: "观察",
  exciting: "值得跟进",
  promising: "有前景",
  pass: "不推进",
  proceed: "推进",
  defer: "暂缓",
  reject: "否决",
  declined: "否决",
  request_information: "先补关键事实",
  continue_diligence: "启动尽调",
  partially_meets: "部分符合",
  meets: "符合",
  misses: "不符合",
  not_passed: "未通过",
  not_assessed: "未评估",
  not_ready: "未就绪",
  ready: "就绪",
  conditional: "有条件",
  partial: "部分核验",
  indicative: "示意",
  populated: "已填充",
  stub: "草稿",
  working: "工作稿",
  empty: "空白",
  unsupported: "未获支持",
  unverified: "未核验",
  supported: "已支持",
  not_verifiable: "无法核验",
  "due-diligence": "尽调",
  "deal-screening": "筛选",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function stripMd(s: string): string {
  return s
    .replace(/\*\*/gu, "")
    .replace(/^[-*•]\s+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function headingBare(title: string): string {
  return title
    .replace(/^\d+(?:\.\d+)*[.)．、]?\s*/u, "")
    .replace(/^[一二三四五六七八九十]+、\s*/u, "")
    .trim();
}

export function isConclusionHeading(title: string): boolean {
  return /^(?:初筛结论|投资结论|本章结论)$/u.test(headingBare(title));
}

export function knStatusTone(text: string): KnTone {
  const t = stripMd(text);
  if (!t) return "neutral";
  if (/not\s*ready|未就绪|不具备|不推进|否决|不投|放弃|\bpass\b|\breject\b/iu.test(t)) {
    return "stop";
  }
  if (/\bdefer\b|暂缓|搁置|\bwatch\b|观察|有条件|renegotiate|conditional/iu.test(t)) {
    return "caution";
  }
  if (/\b(exciting|promising|proceed|ready)\b|值得跟进|有前景|推进|就绪/iu.test(t)) {
    return "go";
  }
  return "neutral";
}

export function displayStatus(raw: string): {
  primary: string;
  detail: string;
  code: string;
} {
  const t = stripMd(raw).replace(/[。.．]+$/u, "");
  const wrapped =
    /^([A-Za-z][\w]*)\s*[（(]([^）)]+)[）)]$/u.exec(t) ??
    /^(request_information|continue_diligence|partially_meets|not_passed|not_assessed|not_ready)\s*[（(]([^）)]+)[）)]$/iu.exec(
      t,
    );
  if (wrapped) {
    const code = wrapped[1] ?? "";
    const inside = (wrapped[2] ?? "").trim();
    const parts = inside.split(/[，,]/u).map((p) => p.trim()).filter(Boolean);
    return {
      primary: parts[0] || STATUS_ZH[code.toLowerCase()] || inside,
      detail: parts.slice(1).join("，"),
      code,
    };
  }
  const key = t.toLowerCase().replace(/\s+/gu, "_");
  if (STATUS_ZH[key]) {
    return { primary: STATUS_ZH[key]!, detail: "", code: t };
  }
  return { primary: t, detail: "", code: "" };
}

/** 正文里的状态代号收成中文，避免 Watch（观察）并排。 */
export function localizeKnStatusText(s: string): string {
  let t = s;
  t = t.replace(
    /\b(Watch|Exciting|Promising|Pass|Proceed|Defer|Reject|Declined|Ready|Conditional|request_information|continue_diligence|partially_meets|not_passed|not_assessed|not_ready)\s*[（(]([^）)]+)[）)]/giu,
    (_all, _code: string, zh: string) => zh.trim(),
  );
  t = t.replace(/\brequest_information\b/giu, "先补关键事实");
  t = t.replace(/\bcontinue_diligence\b/giu, "启动尽调");
  t = t.replace(/\bpartially_meets\b/giu, "部分符合");
  t = t.replace(/\bnot_passed\b/giu, "未通过");
  t = t.replace(/\bnot_assessed\b/giu, "未评估");
  t = t.replace(/\bnot_ready\b/giu, "未就绪");
  t = t.replace(/\bDefer\b/gu, "暂缓");
  t = t.replace(/\bWatch\b/gu, "观察");
  t = t.replace(/\bExciting\b/gu, "值得跟进");
  t = t.replace(/\bPromising\b/gu, "有前景");
  t = t.replace(/\bProceed\b/gu, "推进");
  t = t.replace(/\bReject(?:ed)?\b/gu, "否决");
  t = t.replace(/\bdue[-\s]?diligence\b/giu, "尽调");
  t = t.replace(/\bdeal[-\s]?screening\b/giu, "筛选");
  t = t.replace(/\bic[-\s]?review\b/giu, "投委会");
  t = t.replace(/[/／]\s*partial\b/giu, " · 部分核验");
  t = t.replace(/\bworking\b/giu, "工作稿");
  t = t.replace(/\bindicative\b/giu, "示意");
  t = t.replace(/\bunsupported\b/giu, "未获支持");
  t = t.replace(/\bunverified\b/giu, "未核验");
  t = t.replace(/\bnot[_-]?verifiable\b/giu, "无法核验");
  t = t.replace(/\bclosest\b/giu, "贴近");
  t = t.replace(/\btaxonomy_version\b/giu, "分类版本");
  t = t.replace(/\bevidenceCutoff\b/giu, "证据截止");
  t = t.replace(/\bdependencyVersion\b/giu, "依赖版本");
  t = t.replace(/\blastReviewedAt\b/giu, "复核日期");
  t = t.replace(
    /([\u4e00-\u9fff])(未获支持|未核验|无法核验)/gu,
    "$1（$2）",
  );
  return t;
}

const CAP_CLAUSE =
  /(?:^|[。；;]\s*)([^。；;：:]{1,24})[:：]\s*([^。；;]+?\d+(?:\.\d+)?\s*%[^。；;]*)/gu;

type CapNode = { name: string; pct: string | null; children: CapNode[] };

function parseHolders(blob: string): Holding[] {
  const out: Holding[] = [];
  const re = /([^、，,]+?)(\d+(?:\.\d+)?)\s*%/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob))) {
    const name = (m[1] ?? "").replace(/[：:\s]+$/u, "").trim();
    const pct = `${m[2]}%`;
    if (name && name.length <= 32) out.push({ name, pct });
  }
  return out;
}

export function parseCapTable(text: string): CapEntity[] | null {
  const src = stripMd(text);
  if ((src.match(/%/gu) ?? []).length < 2) return null;
  if (!/[:：]/u.test(src)) return null;
  const entities: CapEntity[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(CAP_CLAUSE.source, "gu");
  while ((m = re.exec(src))) {
    const name = (m[1] ?? "").trim();
    const holders = parseHolders(m[2] ?? "");
    if (!name || holders.length < 1) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    entities.push({ name, holders });
  }
  if (entities.length < 2) return null;
  const holderCount = entities.reduce((n, e) => n + e.holders.length, 0);
  if (holderCount < 3) return null;
  return entities;
}

export function looksLikeCapTable(text: string): boolean {
  return parseCapTable(text) != null;
}

export function looksLikeMermaidFlow(text: string): boolean {
  return /^\s*flowchart\s+(?:TD|TB|LR|RL)?/imu.test(text) && /-->\|/.test(text);
}

function edgePct(label: string): string {
  const m = /(\d+(?:\.\d+)?)\s*%/u.exec(label);
  return m ? `${m[1]}%` : label.trim();
}

export function parseMermaidCapEntities(code: string): CapEntity[] | null {
  if (!looksLikeMermaidFlow(code)) return null;
  const labels = new Map<string, string>();
  const nodeRe = /([A-Za-z][\w]*)\[([^\]]+)\]/gu;
  let nm: RegExpExecArray | null;
  while ((nm = nodeRe.exec(code))) {
    labels.set(nm[1] ?? "", (nm[2] ?? "").trim());
  }
  const byTarget = new Map<string, Holding[]>();
  const edgeRe =
    /([A-Za-z][\w]*)(?:\[[^\]]+\])?\s*-->\|([^|]+)\|\s*([A-Za-z][\w]*)(?:\[[^\]]+\])?/gu;
  let m: RegExpExecArray | null;
  while ((m = edgeRe.exec(code))) {
    const fromId = m[1] ?? "";
    const toId = m[3] ?? "";
    const pct = edgePct(m[2] ?? "");
    if (!fromId || !toId) continue;
    const fromName = labels.get(fromId) ?? fromId;
    const toName = labels.get(toId) ?? toId;
    labels.set(fromId, fromName);
    labels.set(toId, toName);
    const holders = byTarget.get(toId) ?? [];
    if (!holders.some((h) => h.name === fromName)) {
      holders.push({ name: fromName, pct });
    }
    byTarget.set(toId, holders);
  }
  const entities: CapEntity[] = [];
  for (const [id, holders] of byTarget) {
    const name = labels.get(id) ?? id;
    if (!name || holders.length < 1) continue;
    entities.push({ name, holders });
  }
  if (entities.length < 2) return null;
  return entities;
}

function resolveEntity(name: string, entities: CapEntity[]): CapEntity | null {
  const exact = entities.find((e) => e.name === name);
  if (exact) return exact;
  return (
    entities.find(
      (e) => name.includes(e.name) || e.name.includes(name),
    ) ?? null
  );
}

function heldNames(entities: CapEntity[]): Set<string> {
  const held = new Set<string>();
  for (const e of entities) {
    for (const h of e.holders) {
      const resolved = resolveEntity(h.name, entities);
      if (resolved) held.add(resolved.name);
    }
  }
  return held;
}

function pickRoots(entities: CapEntity[], prefer?: RegExp): CapEntity[] {
  if (prefer) {
    const hit = entities.find((e) => prefer.test(e.name));
    if (hit) return [hit];
  }
  const held = heldNames(entities);
  const roots = entities.filter((e) => !held.has(e.name));
  return roots.length ? roots : [entities[0]!];
}

function buildCapNode(
  name: string,
  pct: string | null,
  entities: CapEntity[],
  depth: number,
  visited: Set<string>,
): CapNode {
  const entity = resolveEntity(name, entities);
  const key = entity?.name ?? name;
  const kids =
    entity && depth < 5 && !visited.has(key) ? entity.holders : [];
  const nextVisited = new Set(visited);
  nextVisited.add(key);
  return {
    name,
    pct,
    children: kids.map((h) =>
      buildCapNode(h.name, h.pct, entities, depth + 1, nextVisited),
    ),
  };
}

function leafCount(node: CapNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((n, child) => n + leafCount(child), 0);
}

function collectNames(node: CapNode, into: Set<string>): void {
  into.add(node.name);
  for (const child of node.children) collectNames(child, into);
}

function cellsAtDepth(
  node: CapNode,
  depth: number,
  target: number,
): { node: CapNode | null; span: number }[] {
  const span = leafCount(node);
  if (depth === target) return [{ node, span }];
  if (node.children.length === 0) return [{ node: null, span }];
  return node.children.flatMap((child) =>
    cellsAtDepth(child, depth + 1, target),
  );
}

function parentsAtDepth(
  node: CapNode,
  depth: number,
  target: number,
  col: number,
): { node: CapNode; col: number; span: number }[] {
  const span = leafCount(node);
  if (depth === target) return [{ node, col, span }];
  if (node.children.length === 0) return [];
  const out: { node: CapNode; col: number; span: number }[] = [];
  let next = col;
  for (const child of node.children) {
    out.push(...parentsAtDepth(child, depth + 1, target, next));
    next += leafCount(child);
  }
  return out;
}

function treeDepth(node: CapNode): number {
  if (node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(treeDepth));
}

function capNodeBox(node: CapNode, isRoot: boolean): string {
  const rootCls = isRoot ? " kn-cap__node--root" : "";
  return `<div class="kn-cap__node${rootCls}"><span class="kn-cap__name">${escapeHtml(node.name)}</span></div>`;
}

function holdLabel(pct: string | null): string {
  if (!pct) return "";
  return `<span class="kn-cap__hold">持有 ${escapeHtml(pct)}</span>`;
}

function wiresSvg(
  parents: { node: CapNode; col: number; span: number }[],
  cols: number,
): string {
  const lines: string[] = [];
  for (const p of parents) {
    if (p.node.children.length === 0) continue;
    const parentX = p.col + p.span / 2;
    const childXs: number[] = [];
    let childCol = p.col;
    for (const child of p.node.children) {
      const span = leafCount(child);
      childXs.push(childCol + span / 2);
      childCol += span;
    }
    if (childXs.length === 1) {
      lines.push(
        `<line x1="${parentX}" y1="0" x2="${childXs[0]}" y2="2" />`,
      );
      continue;
    }
    const x1 = childXs[0]!;
    const x2 = childXs[childXs.length - 1]!;
    lines.push(`<line x1="${parentX}" y1="0" x2="${parentX}" y2="1" />`);
    lines.push(`<line x1="${x1}" y1="1" x2="${x2}" y2="1" />`);
    for (const cx of childXs) {
      lines.push(`<line x1="${cx}" y1="1" x2="${cx}" y2="2" />`);
    }
  }
  if (lines.length === 0) return "";
  return `<svg class="kn-cap__wires" viewBox="0 0 ${cols} 2" preserveAspectRatio="none" aria-hidden="true">${lines.join("")}</svg>`;
}

function renderCapTree(root: CapNode, caption: string): string {
  const cols = leafCount(root);
  const depth = treeDepth(root);
  const rows: string[] = [];
  for (let d = 0; d < depth; d += 1) {
    if (d > 0) {
      rows.push(wiresSvg(parentsAtDepth(root, 0, d - 1, 0), cols));
      const holds = cellsAtDepth(root, 0, d)
        .map((cell) => {
          const inner = cell.node ? holdLabel(cell.node.pct) : "";
          return `<div class="kn-cap__cell" style="grid-column: span ${cell.span}">${inner}</div>`;
        })
        .join("");
      rows.push(`<div class="kn-cap__holds">${holds}</div>`);
    }
    const cells = cellsAtDepth(root, 0, d)
      .map((cell) => {
        const inner = cell.node ? capNodeBox(cell.node, d === 0) : "";
        return `<div class="kn-cap__cell" style="grid-column: span ${cell.span}">${inner}</div>`;
      })
      .join("");
    rows.push(`<div class="kn-cap__level">${cells}</div>`);
  }
  const cap = caption
    ? `<figcaption class="kn-cap__caption">${escapeHtml(caption)}</figcaption>`
    : "";
  return `<figure class="kn-cap">${cap}<div class="kn-cap__levels" style="--cols: ${cols}">${rows.join("")}</div></figure>`;
}

function capFiguresFromEntities(
  entities: CapEntity[],
  caption: string,
  prefer?: RegExp,
): string | null {
  const roots = pickRoots(entities, prefer);
  const figures: string[] = [];
  const used = new Set<string>();
  for (const start of roots) {
    if (used.has(start.name)) continue;
    const tree = buildCapNode(start.name, null, entities, 0, new Set());
    collectNames(tree, used);
    figures.push(
      renderCapTree(tree, figures.length === 0 ? caption : ""),
    );
  }
  if (figures.length === 0) return null;
  return figures.join("");
}

export function capTableHtml(
  text: string,
  caption = "登记股权 · 数字为对上一层持股",
): string | null {
  const entities = parseCapTable(text);
  if (!entities) return null;
  return capFiguresFromEntities(entities, caption, /传媒/u);
}

export function mermaidFlowHtml(code: string): string | null {
  const entities = parseMermaidCapEntities(code);
  if (!entities) return null;
  const owner = capFiguresFromEntities(
    entities,
    "登记股权 · 数字为对上一层持股",
    /传媒/u,
  );
  if (!owner) return null;
  const used = new Set<string>();
  const ownerRoot = pickRoots(entities, /传媒/u)[0];
  if (ownerRoot) {
    collectNames(
      buildCapNode(ownerRoot.name, null, entities, 0, new Set()),
      used,
    );
  }
  const rest = entities.filter((e) => !used.has(e.name));
  const extra =
    rest.length > 0 ? capFiguresFromEntities(rest, "对外投资") ?? "" : "";
  return `${owner}${extra}`;
}

const FACT_KEYS: Array<{ re: RegExp; id: string; label: string }> = [
  { re: /^核心判断[:：]\s*/u, id: "lede", label: "核心判断" },
  { re: /^投资建议[:：]\s*/u, id: "verdict", label: "投资建议" },
  { re: /^总体评级[:：]\s*/u, id: "rating", label: "总体评级" },
  { re: /^下一步建议[:：]\s*/u, id: "next", label: "下一步" },
  { re: /^内容状态[:：]\s*/u, id: "status", label: "内容状态" },
  { re: /^支持理由[:：]\s*/u, id: "pro", label: "支持" },
  { re: /^主要保留意见[:：]\s*/u, id: "con", label: "保留" },
  { re: /^改变判断的条件[:：]\s*/u, id: "flip", label: "改变判断" },
];

export function splitConclusionSection(
  title: string,
  bodyMd: string,
): { cardHtml: string; restMd: string } | null {
  if (!isConclusionHeading(title)) return null;
  const kind = /投资/u.test(headingBare(title)) ? "dd" : "screen";
  const facts: Record<string, string> = {};
  const rest: string[] = [];
  for (const raw of bodyMd.split(/\r?\n/u)) {
    const plain = stripMd(raw);
    if (!plain) {
      if (rest.length > 0) rest.push("");
      continue;
    }
    let hit = false;
    for (const key of FACT_KEYS) {
      if (!key.re.test(plain)) continue;
      const value = plain.replace(key.re, "").trim();
      if (!value) continue;
      if (!facts[key.id]) facts[key.id] = value;
      else facts[key.id] += value;
      hit = true;
      break;
    }
    if (!hit) rest.push(raw);
  }
  const verdictRaw = facts.verdict || facts.rating || "";
  if (!verdictRaw && !facts.lede) return null;
  const shown = displayStatus(verdictRaw);
  const tone = knStatusTone(verdictRaw || facts.next || "caution");
  const kicker = headingBare(title);
  const nextShown = facts.next ? displayStatus(facts.next) : null;
  const statusShown = facts.status
    ? displayStatus(facts.status.replace(/[。.．].*$/u, ""))
    : null;
  const statusTail = facts.status
    ? facts.status.replace(/^[^。．.]*[。．.]?\s*/u, "").trim()
    : "";

  const chips: string[] = [];
  if (nextShown?.primary) {
    chips.push(
      `<span class="kn-decision__chip">下一步 · ${escapeHtml(nextShown.primary)}</span>`,
    );
  }
  if (statusShown?.primary) {
    chips.push(
      `<span class="kn-decision__chip">状态 · ${escapeHtml(statusShown.primary)}</span>`,
    );
  }
  const detail = shown.detail
    ? `<p class="kn-decision__detail">${escapeHtml(shown.detail)}</p>`
    : "";
  const lede = facts.lede
    ? `<p class="kn-decision__lede">${escapeHtml(localizeKnStatusText(facts.lede))}</p>`
    : "";
  const note = statusTail
    ? `<p class="kn-decision__note">${escapeHtml(localizeKnStatusText(statusTail))}</p>`
    : "";
  const rows = [
    ["pro", "支持"],
    ["con", "保留"],
    ["flip", "改变判断"],
  ]
    .filter(([id]) => facts[id!])
    .map(
      ([id, label]) =>
        `<div class="kn-decision__row"><dt>${label}</dt><dd>${escapeHtml(localizeKnStatusText(facts[id!]!))}</dd></div>`,
    )
    .join("");
  const dl = rows
    ? `<dl class="kn-decision__facts">${rows}</dl>`
    : "";
  const chipRow = chips.length
    ? `<p class="kn-decision__chips">${chips.join("")}</p>`
    : "";
  const cardHtml = `<aside class="kn-decision kn-decision--${tone} kn-decision--${kind}"><header class="kn-decision__head"><p class="kn-decision__kicker">${escapeHtml(kicker)}</p><p class="kn-decision__verdict">${escapeHtml(shown.primary || "待定")}</p>${detail}</header>${chipRow}${lede}${note}${dl}</aside>`;
  const restMd = rest.join("\n").trim();
  return { cardHtml, restMd };
}

export type KnStatusChip = { label: string; value: string };

const STATUS_CLAUSE =
  /(文稿状态|证据核验状态|核验状态|内容状态|工件状态)[:：]\s*([^；。]+)/gu;

const VERIFY_ZH: Record<string, string> = {
  部分完成: "部分核验",
  部分核验: "部分核验",
  已完成: "已核验",
  未开始: "未核验",
};

export function displayVerifyStatus(raw: string): string {
  const t = stripMd(raw).replace(/[。.．]+$/u, "");
  if (VERIFY_ZH[t]) return VERIFY_ZH[t]!;
  return displayStatus(t).primary;
}

export function parseStatusChips(text: string): KnStatusChip[] {
  const out: KnStatusChip[] = [];
  const seen = new Set<string>();
  const re = new RegExp(STATUS_CLAUSE.source, "gu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const rawLabel = (m[1] ?? "").trim();
    const value = displayVerifyStatus(m[2] ?? "");
    if (!value) continue;
    const label = /核验|内容/u.test(rawLabel) ? "核验" : "文稿";
    const key = `${label}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, value });
  }
  return out;
}

export function stripStatusClauses(text: string): string {
  return text
    .replace(new RegExp(STATUS_CLAUSE.source, "gu"), "")
    .replace(/[；;]\s*[；;]/gu, "；")
    .replace(/^[；;。.\s]+|[；;。.\s]+$/gu, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

export function isTakeawayKey(key: string): boolean {
  return /^(本章结论|本章判断|结论)$/u.test(key.trim());
}

export function isVerifyKey(key: string): boolean {
  return /^(核验状态|证据核验状态|内容状态)$/u.test(key.trim());
}

export function takeawayKickerForKey(key: string): string {
  if (/本章判断/u.test(key)) return "本章判断";
  if (/本章/u.test(key)) return "本章结论";
  return "结论";
}

export function isJudgmentKey(key: string): boolean {
  return /^(判断|融资判断|投资判断|风险传导)$/u.test(key.trim());
}

export function isNextKey(key: string): boolean {
  return /^(关闭标准|下一步)$/u.test(key.trim());
}

export function statusRowHtml(chips: KnStatusChip[]): string {
  if (!chips.length) return "";
  const inner = chips
    .map(
      (c) =>
        `<span class="kn-statuschip">${escapeHtml(c.label)} · ${escapeHtml(c.value)}</span>`,
    )
    .join("");
  return `<p class="kn-statusrow">${inner}</p>`;
}

function splitPrioritySentence(body: string): { main: string; next: string } {
  const m =
    /(?:当前)?最需优先解决的是[：:]\s*(.+?)(?:[。．]|$)/u.exec(body);
  if (!m) return { main: body.trim(), next: "" };
  return { main: body.trim(), next: (m[1] ?? "").trim() };
}

function stripTakeawayLead(body: string): string {
  return body.replace(/^(?:来源|依据)[:：]\s*/u, "").trim();
}

export function chapterTakeawayHtml(
  body: string,
  chips: KnStatusChip[] = [],
  kicker = "本章结论",
): string {
  const split = splitPrioritySentence(stripTakeawayLead(body));
  const chipHtml = chips.length
    ? `<p class="kn-takeaway__chips">${chips
        .map(
          (c) =>
            `<span class="kn-statuschip">${escapeHtml(c.label)} · ${escapeHtml(c.value)}</span>`,
        )
        .join("")}</p>`
    : "";
  const next = split.next
    ? `<div class="kn-next kn-next--inline"><p class="kn-next__k">下一步</p><p class="kn-next__body">${escapeHtml(split.next)}</p></div>`
    : "";
  return `<aside class="kn-takeaway"><header class="kn-takeaway__head"><p class="kn-takeaway__k">${escapeHtml(kicker)}</p>${chipHtml}</header><p class="kn-takeaway__body">${escapeHtml(localizeKnStatusText(split.main))}</p>${next}</aside>`;
}

export function judgmentBlockHtml(kind: string, body: string): string {
  const label = kind.trim() || "判断";
  return `<aside class="kn-judgment"><p class="kn-judgment__k">${escapeHtml(label)}</p><p class="kn-judgment__body">${escapeHtml(localizeKnStatusText(body))}</p></aside>`;
}

export function nextBlockHtml(kind: string, body: string): string {
  const label = /关闭/u.test(kind) ? "关闭标准" : "下一步";
  return `<aside class="kn-next"><p class="kn-next__k">${escapeHtml(label)}</p><p class="kn-next__body">${escapeHtml(localizeKnStatusText(body))}</p></aside>`;
}

export function verifyStatusHtml(value: string): string {
  const zh = displayVerifyStatus(localizeKnStatusText(value));
  if (!zh) return "";
  return statusRowHtml([{ label: "核验", value: zh }]);
}

type WorkpaperFieldId =
  | "project"
  | "workflow"
  | "artifact"
  | "dates"
  | "evidence"
  | "decision"
  | "conclusion"
  | "taxonomy"
  | "primary"
  | "match";

const WORKPAPER_KEYS: Array<{ id: WorkpaperFieldId; re: RegExp }> = [
  { id: "project", re: /^项目(?:与视角|\s*\/\s*视角|\/视角)?$/u },
  { id: "workflow", re: /^(?:工作流与状态|工作流)$/u },
  { id: "artifact", re: /^工件状态$/u },
  { id: "dates", re: /^(?:日期与输入|日期与信息截止|日期)$/u },
  { id: "evidence", re: /^(?:证据截止与依赖版本|证据截止)$/u },
  { id: "decision", re: /^决策问题$/u },
  { id: "conclusion", re: /^结论$/u },
  { id: "taxonomy", re: /^(?:taxonomy_version|分类版本)$/iu },
  { id: "primary", re: /^(?:主分类|次分类)$/u },
  { id: "match", re: /^匹配类型(?:\s*\/\s*置信度)?$/u },
];

function classifyWorkpaperKey(key: string): WorkpaperFieldId | null {
  const k = key.replace(/\*\*/gu, "").trim();
  for (const row of WORKPAPER_KEYS) {
    if (row.re.test(k)) return row.id;
  }
  return null;
}

function stripWorkpaperItem(s: string): string {
  return s
    .replace(/\*\*/gu, "")
    .replace(/^[-*•·◦]\s+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function firstDate(s: string): string {
  const m = /(\d{4}-\d{2}-\d{2})/u.exec(s);
  return m?.[1] ?? "";
}

function stageChips(raw: string): string[] {
  const t = raw.replace(/[（(][^）)]{0,80}[）)]/gu, " ");
  const chips: string[] = [];
  const push = (v: string) => {
    if (v && !chips.includes(v)) chips.push(v);
  };
  if (/due[-\s]?diligence|尽调/iu.test(t)) push("尽调");
  else if (/deal[-\s]?screening|筛选/iu.test(t)) push("筛选");
  else if (/ic[-\s]?review|投委/iu.test(t)) push("投委会");
  if (/[/／]\s*partial|部分核验|部分完成/iu.test(t)) push("部分核验");
  if (/\bworking\b|工作稿/iu.test(t)) push("工作稿");
  if (/\bindicative\b|示意/iu.test(t)) push("示意");
  if (/\bstub\b/iu.test(t)) push("草稿");
  return chips;
}

export function parseWorkpaperHeader(
  items: string[],
): Partial<Record<WorkpaperFieldId, string>> | null {
  const fields: Partial<Record<WorkpaperFieldId, string>> = {};
  let hits = 0;
  for (const raw of items) {
    const plain = stripWorkpaperItem(raw);
    const clauses = plain.split(/[；;]/u).map((c) => c.trim()).filter(Boolean);
    for (const clause of clauses) {
      const m = /^([^：:]{1,24})[:：]\s*(.*)$/u.exec(clause);
      if (!m) continue;
      const id = classifyWorkpaperKey(m[1] ?? "");
      if (!id) continue;
      hits += 1;
      const value = (m[2] ?? "").replace(/[。.．]+$/u, "").trim();
      if (!value) continue;
      if (id === "primary" && fields.primary) {
        fields.primary = `${fields.primary} → ${value}`;
      } else if (!fields[id]) {
        fields[id] = value;
      }
    }
  }
  if (hits < 3) return null;
  if (!fields.conclusion && !fields.decision && !fields.workflow && !fields.artifact) {
    return null;
  }
  return fields;
}

export function workpaperSheetHtml(items: string[]): string | null {
  const fields = parseWorkpaperHeader(items);
  if (!fields) return null;
  const chips = [
    ...stageChips(`${fields.workflow ?? ""} ${fields.artifact ?? ""}`),
  ];
  const date = firstDate(fields.dates ?? "") || firstDate(fields.evidence ?? "");
  if (date) chips.push(date);
  if (fields.match) {
    const matchZh = localizeKnStatusText(fields.match).replace(/\s*\/\s*/gu, " · ");
    if (matchZh) chips.push(matchZh);
  }
  const bar = chips.length
    ? `<p class="kn-sheet__bar">${chips
        .map((c) => `<span class="kn-statuschip">${escapeHtml(c)}</span>`)
        .join("")}</p>`
    : "";
  const project = fields.project
    ? `<p class="kn-sheet__by">${escapeHtml(localizeKnStatusText(fields.project))}</p>`
    : "";
  const klass = fields.primary
    ? `<p class="kn-sheet__class">${escapeHtml(localizeKnStatusText(fields.primary))}</p>`
    : "";
  const conclusion = (fields.conclusion ?? "").trim();
  const takeaway = conclusion
    ? chapterTakeawayHtml(conclusion, [], "结论")
    : "";
  const decision = (fields.decision ?? "").trim();
  const ask = decision
    ? `<aside class="kn-sheet__ask"><p class="kn-sheet__ask-k">决策问题</p><p class="kn-sheet__ask-body">${escapeHtml(localizeKnStatusText(decision))}</p></aside>`
    : "";
  if (!bar && !takeaway && !ask && !project) return null;
  return `<aside class="kn-sheet">${bar}${project}${klass}${takeaway}${ask}</aside>`;
}
