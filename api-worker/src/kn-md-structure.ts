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
  return /^(?:初筛结论|投资结论)$/u.test(headingBare(title));
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
  return t;
}

const CAP_CLAUSE =
  /(?:^|[。；;]\s*)([^。；;：:]{1,24})[:：]\s*([^。；;]+?\d+(?:\.\d+)?\s*%[^。；;]*)/gu;

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

function resolveEntity(name: string, entities: CapEntity[]): CapEntity | null {
  const exact = entities.find((e) => e.name === name);
  if (exact) return exact;
  return (
    entities.find(
      (e) => name.includes(e.name) || e.name.includes(name),
    ) ?? null
  );
}

function capNodeHtml(
  name: string,
  pct: string | null,
  entities: CapEntity[],
  depth: number,
  visited: Set<string>,
): string {
  const entity = resolveEntity(name, entities);
  const key = entity?.name ?? name;
  const kids =
    entity && depth < 4 && !visited.has(key) ? entity.holders : [];
  const nextVisited = new Set(visited);
  nextVisited.add(key);
  const rootCls = depth === 0 ? " kn-cap__node--root" : "";
  const pctHtml = pct
    ? `<span class="kn-cap__pct">${escapeHtml(pct)}</span>`
    : "";
  const node = `<div class="kn-cap__node${rootCls}"><span class="kn-cap__name">${escapeHtml(name)}</span>${pctHtml}</div>`;
  if (kids.length === 0) {
    return `<div class="kn-cap__branch">${node}</div>`;
  }
  const childHtml = kids
    .map((h) => capNodeHtml(h.name, h.pct, entities, depth + 1, nextVisited))
    .join("");
  return `<div class="kn-cap__branch">${node}<div class="kn-cap__kids">${childHtml}</div></div>`;
}

export function capTableHtml(text: string, caption = "登记股权"): string | null {
  const entities = parseCapTable(text);
  if (!entities) return null;
  const held = new Set<string>();
  for (const e of entities) {
    for (const h of e.holders) {
      const resolved = resolveEntity(h.name, entities);
      if (resolved) held.add(resolved.name);
    }
  }
  const roots = entities.filter((e) => !held.has(e.name));
  const start = roots[0] ?? entities[0]!;
  const tree = capNodeHtml(start.name, null, entities, 0, new Set());
  return `<figure class="kn-cap"><figcaption class="kn-cap__caption">${escapeHtml(caption)}</figcaption><div class="kn-cap__tree">${tree}</div></figure>`;
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
