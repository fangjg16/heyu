import {
  capTableHtml,
  chapterTakeawayHtml,
  isConclusionHeading,
  isJudgmentKey,
  isNextKey,
  isTakeawayKey,
  isVerifyKey,
  judgmentBlockHtml,
  localizeKnStatusText,
  looksLikeCapTable,
  mermaidFlowHtml,
  nextBlockHtml,
  parseStatusChips,
  splitConclusionSection,
  statusRowHtml,
  stripStatusClauses,
  takeawayKickerForKey,
  verifyStatusHtml,
  workpaperSheetHtml,
} from "./kn-structure";

const SOURCE_LEAD =
  /^(?:本章依据|资料来源|依据文件|依据资料|来源[:：]|Sources?\s*[:：])/u;

const PENDING_EXACT = /^(?:待补|待补充|尚未开展|暂缺|N\/?A|n\/?a|—|–|-)$/u;

const ONE_LINER_HEAD = /一句话/;

const RECOMMEND_HEAD =
  /^(?:建议|投资建议|总体评级|筛选建议|尽调建议|Recommendation|Invest(?:ment)?\s*recommendation)$/iu;

const READINESS_HEAD =
  /^(?:IC\s*就绪度|就绪度|投委就绪度|IC\s*readiness|Readiness)$/iu;

const PREREQ_HEAD =
  /^(?:前提条件|Preconditions?|Conditions?\s+precedent)$/iu;

const PRO_HEAD =
  /^(?:正方(?:意见)?|支持投资(?:的论点)?|看多|Bull(?:\s*case)?|Pros?)$/iu;

const CON_HEAD =
  /^(?:反方(?:意见)?|反对投资(?:的论点)?|看空|Bear(?:\s*case)?|Cons?)$/iu;

const STRONGEST_HEAD =
  /^(?:最强证据|最有力证据|Strongest evidence)$/iu;

export type KnTone = "go" | "caution" | "stop" | "neutral";

export function knPlain(text: string): string {
  return String(text ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** 章级 11. / 一、 由 tab 承担；1.1 / 2.3 这种子节号留在标题里。 */
export function knDisplayHeadingTitle(title: string): string {
  const raw = knPlain(title);
  if (/^\d+\.\d+/.test(raw)) return raw;
  const prefix =
    /^(?:[0-9]+[.)．、]?|[一二三四五六七八九十百]+[、.．])\s*/u.exec(raw);
  if (!prefix) return raw;
  return raw.slice(prefix[0].length).trim() || raw;
}

export function isKnSourceNote(text: string): boolean {
  const t = knPlain(text);
  if (t.length > 220) return false;
  if (SOURCE_LEAD.test(t)) return true;
  return (
    /(?:^|\s)[\w.-]+\.md(?:[、,，\s]|$)/u.test(t) && /依据|资料/u.test(t)
  );
}

export function isKnPendingText(text: string): boolean {
  const t = knPlain(text).replace(/[。.．]+$/u, "");
  if (!t) return false;
  if (PENDING_EXACT.test(t)) return true;
  return /^(?:待补|待补充)(?:[:：].{0,40})?$/u.test(t);
}

export function knVerdictTone(text: string): KnTone | null {
  const t = knPlain(text);
  if (!t || t.length > 80) return null;
  if (/not\s*ready|未就绪|不具备/iu.test(t)) return "stop";
  if (/\b(pass|reject|declined)\b|不投|否决|不买|放弃/iu.test(t)) return "stop";
  if (/\bdefer\b|暂缓|搁置|\bwatch\b|观察/iu.test(t)) return "caution";
  if (/有条件|条件推进|renegotiate|conditional/iu.test(t)) return "caution";
  if (
    /\b(exciting|promising|proceed)\b|通过|推进|买入|强烈建议/iu.test(t) &&
    !/不/u.test(t)
  ) {
    return "go";
  }
  if (/\bready\b|已就绪|就绪/iu.test(t)) return "go";
  return null;
}

export function knReadinessTone(text: string): KnTone | null {
  const t = knPlain(text);
  if (!t || t.length > 80) return null;
  if (/not\s*ready|未就绪|不具备/iu.test(t)) return "stop";
  if (/conditional|有条件/iu.test(t)) return "caution";
  if (/\bready\b|已就绪|就绪/iu.test(t)) return "go";
  return knVerdictTone(t);
}

export function looksLikeStatusValue(text: string): boolean {
  const t = knPlain(text);
  if (!t || t.length > 80) return false;
  if (knVerdictTone(t) || knReadinessTone(t)) return true;
  if (
    /^(?:Exciting|Promising|Watch|Pass|Proceed|Reject|Defer|Ready|Not Ready|Conditional)\b/iu.test(
      t,
    )
  ) {
    return true;
  }
  return /[（(][^）)]{1,12}[）)]$/.test(t) && t.length <= 40;
}

function headingText(el: Element): string {
  return knPlain(el.textContent ?? "");
}

function headingLabel(el: Element): string {
  const named = el.querySelector(":scope > .kn-md-h__t, :scope > .kn-md-sub__t");
  if (named) return knDisplayHeadingTitle(headingText(named));
  const clone = el.cloneNode(true) as Element;
  for (const n of clone.querySelectorAll(".kn-md-h__n, .kn-md-sub__k")) {
    n.remove();
  }
  for (const tag of clone.querySelectorAll(".kn-md-tag")) {
    if (/^\d+(?:\.\d+)*$/u.test(knPlain(tag.textContent ?? ""))) tag.remove();
  }
  return knDisplayHeadingTitle(knPlain(clone.textContent ?? ""));
}

function isHeading(el: Element | null): el is HTMLElement {
  return Boolean(el && /^H[1-6]$/u.test(el.tagName));
}

function nextElement(el: Element): Element | null {
  let n: ChildNode | null = el.nextSibling;
  while (n) {
    if (n.nodeType === 1) return n as Element;
    n = n.nextSibling;
  }
  return null;
}

function isBlockLabel(el: Element, re: RegExp): boolean {
  if (alreadyEnhanced(el)) return false;
  const text = headingLabel(el);
  if (isHeading(el)) return re.test(text);
  if (!/^(P|DIV)$/u.test(el.tagName)) return false;
  if (el.querySelector("ul,ol,table,p,div")) return false;
  if (text.length > 40 || !re.test(text)) return false;
  return Boolean(el.querySelector(":scope > strong, :scope > b, :scope > em"));
}

function alreadyEnhanced(el: Element): boolean {
  return Boolean(
    el.closest(
      ".kn-verdict, .kn-readiness, .kn-lede-card, .kn-split, .kn-source-note, .kn-stats, .kn-callout--verdict, .kn-callout--terms, .kn-hero, .kn-decision, .kn-cap, .kn-takeaway, .kn-judgment, .kn-next, .kn-statusrow, .kn-sheet",
    ),
  );
}

function wrapPendingIn(el: Element, doc: Document): void {
  const walk = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  let node: Node | null;
  while ((node = walk.nextNode())) {
    if (!(node instanceof Text)) continue;
    if (node.parentElement?.closest("script,style,.kn-pending")) continue;
    const raw = node.nodeValue ?? "";
    if (!isKnPendingText(raw) && !/^待补/u.test(knPlain(raw))) continue;
    if (!isKnPendingText(raw) && knPlain(raw).length > 24) continue;
    texts.push(node);
  }
  for (const t of texts) {
    const parent = t.parentElement;
    if (!parent || parent.classList.contains("kn-pending")) continue;
    const span = doc.createElement("span");
    span.className = "kn-pending";
    span.textContent = knPlain(t.nodeValue ?? "") || "待补";
    t.replaceWith(span);
    const stat = span.closest(".kn-stat");
    if (stat && span.closest(".kn-stat__value")) {
      stat.classList.add("kn-stat--pending");
    }
  }
}

function markSourceNotes(root: Element): void {
  for (const el of [...root.querySelectorAll("p,div,small,figcaption,li")]) {
    if (el.querySelector("p,div,table,ul,ol,section")) continue;
    if (el.classList.contains("kn-source-note")) continue;
    if (el.closest(".kn-md-sources, .kn-source-note, .kn-callout, .kn-lede-card")) {
      continue;
    }
    if (!isKnSourceNote(el.textContent ?? "")) continue;
    el.classList.add("kn-source-note");
    const list = el.parentElement;
    if (list && /^(UL|OL)$/u.test(list.tagName)) {
      list.classList.add("kn-source-list");
    }
  }
}

function wrapOneLiners(root: Element, doc: Document): void {
  const labels = [...root.querySelectorAll("h2,h3,h4,p,div")].filter((el) =>
    isBlockLabel(el, ONE_LINER_HEAD),
  );
  for (const h of labels) {
    if (!h.isConnected || alreadyEnhanced(h)) continue;
    const body = nextElement(h);
    if (!body || !/^(P|DIV)$/u.test(body.tagName)) continue;
    if (body.classList.contains("kn-lede-card") || body.closest(".kn-lede-card")) {
      continue;
    }
    const card = doc.createElement("aside");
    card.className = "kn-lede-card";
    const label = doc.createElement("p");
    label.className = "kn-lede-card__label";
    label.textContent = headingLabel(h) || "一句话业务";
    const copy = doc.createElement("div");
    copy.className = "kn-lede-card__body";
    copy.innerHTML = (body as HTMLElement).innerHTML;
    card.append(label, copy);
    h.replaceWith(card);
    body.remove();
  }
}

function splitStatusLine(text: string): { en: string; zh: string } {
  const t = knPlain(text);
  const m = /^(.{1,40}?)[（(]([^）)]{1,40})[）)]$/.exec(t);
  if (m) return { en: m[2]!.trim(), zh: m[1]!.trim() };
  return { en: t, zh: "" };
}

function appendValue(host: HTMLElement, valueText: string, kind: string): void {
  const v = host.ownerDocument.createElement("p");
  v.className = `kn-${kind}__value`;
  const { en, zh } = splitStatusLine(valueText);
  v.append(en);
  if (zh) {
    const span = host.ownerDocument.createElement("span");
    span.className = `kn-${kind}__zh`;
    span.textContent = zh;
    v.append(span);
  }
  host.append(v);
}

function makeVerdictCard(
  doc: Document,
  kicker: string,
  valueText: string,
  tone: KnTone,
): HTMLElement {
  const aside = doc.createElement("aside");
  aside.className = `kn-verdict kn-verdict--${tone}`;
  const k = doc.createElement("p");
  k.className = "kn-verdict__kicker";
  k.textContent = kicker;
  aside.append(k);
  appendValue(aside, valueText, "verdict");
  return aside;
}

function makeReadinessCard(
  doc: Document,
  kicker: string,
  valueText: string,
  tone: KnTone,
): HTMLElement {
  const aside = doc.createElement("aside");
  aside.className = `kn-readiness kn-readiness--${tone}`;
  const k = doc.createElement("p");
  k.className = "kn-readiness__kicker";
  k.textContent = kicker;
  const gate = doc.createElement("div");
  gate.className = "kn-gate kn-gate--readiness";
  const t = knPlain(valueText);
  const notReady = /not\s*ready|未就绪|不具备/iu.test(t) || tone === "stop";
  const conditional = /conditional|有条件/iu.test(t) || tone === "caution";
  const ready = !notReady && !conditional && tone === "go";
  const opts: Array<{ label: string; state: string; on: boolean }> = [
    { label: "Ready", state: "buy", on: ready },
    { label: "Conditional", state: "conditional", on: !notReady && conditional },
    { label: "Not Ready", state: "pass", on: notReady },
  ];
  for (const opt of opts) {
    const el = doc.createElement("div");
    el.className = opt.on ? "kn-gate__opt is-on" : "kn-gate__opt";
    el.setAttribute("data-state", opt.state);
    el.textContent = opt.label;
    gate.append(el);
  }
  aside.append(k, gate);
  appendValue(aside, valueText, "readiness");
  return aside;
}

function wrapStatusCards(
  root: Element,
  doc: Document,
  headRe: RegExp,
  kind: "verdict" | "readiness",
  toneOf: (text: string) => KnTone | null,
): void {
  const labels = [...root.querySelectorAll("h2,h3,h4,p,div")].filter((el) =>
    isBlockLabel(el, headRe),
  );
  for (const h of labels) {
    if (!h.isConnected || alreadyEnhanced(h)) continue;
    const body = nextElement(h);
    if (!body || !/^(P|DIV)$/u.test(body.tagName)) continue;
    if (body.querySelector("ul,ol,table")) continue;
    const value = knPlain(body.textContent ?? "");
    if (!looksLikeStatusValue(value)) continue;
    const tone = toneOf(value) ?? "neutral";
    const card =
      kind === "readiness"
        ? makeReadinessCard(doc, headingLabel(h), value, tone)
        : makeVerdictCard(doc, headingLabel(h), value, tone);
    h.replaceWith(card);
    body.remove();
  }
}

function wrapPrereqs(root: Element, doc: Document): void {
  const labels = [...root.querySelectorAll("h2,h3,h4,p,div")].filter((el) =>
    isBlockLabel(el, PREREQ_HEAD),
  );
  for (const h of labels) {
    if (!h.isConnected || alreadyEnhanced(h)) continue;
    const kids: Node[] = [];
    let n: ChildNode | null = h.nextSibling;
    while (n) {
      const next = n.nextSibling;
      if (n.nodeType === 1) {
        const el = n as Element;
        if (isHeading(el)) break;
        kids.push(n);
      } else if (knPlain(n.textContent ?? "")) {
        kids.push(n);
      }
      n = next;
    }
    if (kids.length === 0) continue;
    const aside = doc.createElement("aside");
    aside.className = "kn-callout kn-callout--terms";
    const label = doc.createElement("p");
    label.className = "kn-callout__label";
    label.textContent = headingLabel(h);
    aside.append(label);
    h.replaceWith(aside);
    for (const k of kids) aside.append(k);
  }
}

function fillCol(
  col: HTMLElement,
  title: string,
  nodes: Node[],
  headingToDrop: Element,
): void {
  const t = col.ownerDocument.createElement("p");
  t.className = "kn-split__title";
  t.textContent = title;
  col.append(t);
  for (const node of nodes) {
    if (node === headingToDrop) continue;
    col.append(node);
  }
}

function wrapSiblingSplit(
  doc: Document,
  parent: Element,
  proH: Element,
  conH: Element,
): void {
  const proKids: Node[] = [];
  let n: ChildNode | null = proH.nextSibling;
  while (n && n !== conH) {
    const next = n.nextSibling;
    proKids.push(n);
    n = next;
  }
  const conKids: Node[] = [];
  n = conH.nextSibling;
  while (n && !(n.nodeType === 1 && isHeading(n as Element))) {
    const next = n.nextSibling;
    conKids.push(n);
    n = next;
  }
  const split = doc.createElement("div");
  split.className = "kn-split";
  const go = doc.createElement("div");
  go.className = "kn-split__col kn-split__col--go";
  fillCol(go, headingLabel(proH) || "正方", proKids, proH);
  const stop = doc.createElement("div");
  stop.className = "kn-split__col kn-split__col--stop";
  fillCol(stop, headingLabel(conH) || "反方", conKids, conH);
  split.append(go, stop);
  parent.insertBefore(split, proH);
  proH.remove();
  conH.remove();
}

function wrapBlockSplit(
  doc: Document,
  proBlock: Element,
  conBlock: Element,
  proH: Element,
  conH: Element,
): void {
  const split = doc.createElement("div");
  split.className = "kn-split";
  const go = doc.createElement("div");
  go.className = "kn-split__col kn-split__col--go";
  fillCol(go, headingLabel(proH) || "正方", [...proBlock.childNodes], proH);
  const stop = doc.createElement("div");
  stop.className = "kn-split__col kn-split__col--stop";
  fillCol(stop, headingLabel(conH) || "反方", [...conBlock.childNodes], conH);
  split.append(go, stop);
  proBlock.replaceWith(split);
  conBlock.remove();
  proH.remove();
  conH.remove();
}

function colTitleText(col: Element): string {
  return knPlain(col.querySelector(":scope > .kn-split__title")?.textContent ?? "");
}

function unwrapSplit(split: Element, doc: Document): void {
  const parent = split.parentElement;
  if (!parent) return;
  const frag = doc.createDocumentFragment();
  for (const col of [...split.querySelectorAll(":scope > .kn-split__col")]) {
    const title = colTitleText(col);
    if (title) {
      const h = doc.createElement("h3");
      h.textContent = title;
      frag.append(h);
    }
    for (const child of [...col.childNodes]) {
      if (
        child.nodeType === 1 &&
        (child as Element).classList.contains("kn-split__title")
      ) {
        continue;
      }
      frag.append(child);
    }
  }
  parent.insertBefore(frag, split);
  split.remove();
}

function shouldUnwrapSplit(split: Element): boolean {
  const go = split.querySelector(":scope > .kn-split__col--go");
  const stop = split.querySelector(":scope > .kn-split__col--stop");
  if (!go || !stop) return false;
  const goT = knDisplayHeadingTitle(colTitleText(go));
  const stopT = knDisplayHeadingTitle(colTitleText(stop));
  if (STRONGEST_HEAD.test(goT) && CON_HEAD.test(stopT)) return true;
  const nested = [...stop.querySelectorAll("h2,h3,h4")].map((h) =>
    headingLabel(h),
  );
  return nested.some((t) => PRO_HEAD.test(t)) && nested.some((t) => CON_HEAD.test(t));
}

function unwrapMismatchedSplits(root: Element, doc: Document): void {
  for (const split of [...root.querySelectorAll(".kn-split")]) {
    if (shouldUnwrapSplit(split)) unwrapSplit(split, doc);
  }
}

function stripNumbersFromEnhancedLabels(root: Element): void {
  for (const card of root.querySelectorAll(".kn-lede-card")) {
    for (const tag of [...card.children]) {
      if (
        tag.classList.contains("kn-md-tag") &&
        /^\d+(?:\.\d+)*$/u.test(knPlain(tag.textContent ?? ""))
      ) {
        tag.remove();
      }
    }
  }
  for (const el of root.querySelectorAll(
    ".kn-lede-card__label, .kn-split__title, .kn-verdict__kicker, .kn-readiness__kicker, .kn-callout--terms > .kn-callout__label",
  )) {
    for (const n of el.querySelectorAll(".kn-md-h__n, .kn-md-sub__k")) n.remove();
    for (const tag of el.querySelectorAll(".kn-md-tag")) {
      if (/^\d+(?:\.\d+)*$/u.test(knPlain(tag.textContent ?? ""))) tag.remove();
    }
    if (el.querySelector("a,code")) continue;
    const cleaned = knDisplayHeadingTitle(knPlain(el.textContent ?? ""));
    if (cleaned && cleaned !== knPlain(el.textContent ?? "")) {
      el.textContent = cleaned;
    }
  }
}

function stripVisibleHeadingNumbers(root: Element): void {
  for (const h of [...root.querySelectorAll("h2,h3,h4")]) {
    for (const n of h.querySelectorAll(".kn-md-h__n, .kn-md-sub__k")) {
      if (/^\d+(?:\.\d+)*$/u.test(knPlain(n.textContent ?? ""))) n.remove();
    }
    for (const tag of h.querySelectorAll(".kn-md-tag")) {
      if (/^\d+(?:\.\d+)*$/u.test(knPlain(tag.textContent ?? ""))) tag.remove();
    }
    if (h.querySelector("a,code,span,em,strong")) continue;
    const cleaned = knDisplayHeadingTitle(headingText(h));
    if (cleaned && cleaned !== headingText(h)) h.textContent = cleaned;
  }
}

function dropRedundantDebateHeads(root: Element): void {
  for (const h of [...root.querySelectorAll("h2,h3,h4")]) {
    if (!h.isConnected) continue;
    if (!CON_HEAD.test(headingLabel(h)) && !PRO_HEAD.test(headingLabel(h))) {
      continue;
    }
    const nxt = nextElement(h);
    if (nxt?.classList.contains("kn-split")) h.remove();
  }
}

function wrapSplits(root: Element, doc: Document): void {
  for (const h of [...root.querySelectorAll("h2,h3,h4")]) {
    if (!h.isConnected) continue;
    if (!PRO_HEAD.test(headingLabel(h))) continue;
    if (h.closest(".kn-split")) continue;
    const parent = h.parentElement;
    if (!parent) continue;

    let con: Element | null = nextElement(h);
    while (con && !isHeading(con)) con = nextElement(con);
    if (
      con &&
      CON_HEAD.test(headingLabel(con)) &&
      con.parentElement === parent
    ) {
      wrapSiblingSplit(doc, parent, h, con);
      continue;
    }

    const block =
      parent.classList.contains("kn-md-subblock") ||
      parent.classList.contains("kn-md-section")
        ? parent
        : null;
    if (!block) continue;
    const nextBlock = nextElement(block);
    if (!nextBlock) continue;
    const conH = nextBlock.querySelector(":scope > h2, :scope > h3, :scope > h4");
    if (!conH || !CON_HEAD.test(headingLabel(conH))) continue;
    wrapBlockSplit(doc, block, nextBlock, h, conH);
  }
}

function hoistLaterDeliverables(root: Element): void {
  const files = [...root.querySelectorAll(":scope > .kn-from-md-file")];
  if (files.length < 2) return;
  const score = (el: Element) => {
    const t = knPlain(el.textContent ?? "").slice(0, 120);
    if (/投资分析|投资结论/u.test(t)) return 2;
    if (/筛选备忘录|初筛结论/u.test(t)) return 0;
    return 1;
  };
  const ranked = [...files].sort((a, b) => score(b) - score(a));
  if (ranked.every((el, i) => el === files[i])) return;
  for (const el of ranked) root.append(el);
}

function relabelCapPercents(root: Element, doc: Document): void {
  for (const node of [...root.querySelectorAll(".kn-cap__node")]) {
    if (!node.isConnected) continue;
    if (node.classList.contains("kn-cap__node--root")) continue;
    const cell = node.parentElement;
    if (!cell || cell.querySelector(":scope > .kn-cap__hold")) continue;
    const pct = node.querySelector(".kn-cap__pct");
    if (!pct) continue;
    const hold = doc.createElement("span");
    hold.className = "kn-cap__hold";
    hold.textContent = `持有 ${knPlain(pct.textContent ?? "")}`;
    cell.insertBefore(hold, node);
    pct.remove();
  }
}

function wrapWorkpaperLists(root: Element, doc: Document): void {
  for (const ul of [...root.querySelectorAll("ul")]) {
    if (!ul.isConnected || alreadyEnhanced(ul)) continue;
    const items = [...ul.querySelectorAll(":scope > li")].map((li) =>
      knPlain(li.textContent ?? ""),
    );
    if (items.length < 3) continue;
    const html = workpaperSheetHtml(items);
    if (!html) continue;
    const box = doc.createElement("div");
    box.innerHTML = html;
    const sheet = box.firstElementChild;
    if (sheet) ul.replaceWith(sheet);
  }
}

function wrapTakeawayAndJudgment(root: Element, doc: Document): void {
  for (const h of [...root.querySelectorAll("h2,h3,h4")]) {
    if (!h.isConnected || alreadyEnhanced(h)) continue;
    if (!isTakeawayKey(headingLabel(h))) continue;
    const nxt = nextElement(h);
    if (!nxt || !/^(P|DIV)$/u.test(nxt.tagName)) continue;
    const body = knPlain(nxt.textContent ?? "");
    if (!body) continue;
    const box = doc.createElement("div");
    box.innerHTML = chapterTakeawayHtml(
      body,
      parseStatusChips(body),
      takeawayKickerForKey(headingLabel(h)),
    );
    const card = box.firstElementChild;
    if (!card) continue;
    h.replaceWith(card);
    nxt.remove();
  }
  for (const el of [...root.querySelectorAll("p, .kn-md-kicker")]) {
    if (!el.isConnected || alreadyEnhanced(el)) continue;
    if (el.querySelector("ul,ol,table,div")) continue;
    const text = knPlain(el.textContent ?? "");
    const labeled = /^([^：:]{2,12})[:：]\s*(.+)$/u.exec(text);
    const key = labeled?.[1]?.trim() ?? "";
    const value = labeled?.[2]?.trim() ?? "";
    if (labeled && isTakeawayKey(key)) {
      const box = doc.createElement("div");
      box.innerHTML = chapterTakeawayHtml(
        value,
        parseStatusChips(text),
        takeawayKickerForKey(key),
      );
      const card = box.firstElementChild;
      if (card) el.replaceWith(card);
      continue;
    }
    if (el.classList.contains("kn-md-kicker") && isTakeawayKey(text)) {
      const nxt = nextElement(el);
      const body = nxt && /^(P|DIV)$/u.test(nxt.tagName)
        ? knPlain(nxt.textContent ?? "")
        : "";
      if (!body) continue;
      const box = doc.createElement("div");
      box.innerHTML = chapterTakeawayHtml(
        body,
        parseStatusChips(body),
        takeawayKickerForKey(text),
      );
      const card = box.firstElementChild;
      if (!card) continue;
      el.replaceWith(card);
      nxt?.remove();
      continue;
    }
    if (el.classList.contains("kn-md-kicker") && isVerifyKey(text)) {
      const nxt = nextElement(el);
      const body = nxt && /^(P|DIV)$/u.test(nxt.tagName)
        ? knPlain(nxt.textContent ?? "")
        : "";
      if (!body) continue;
      const box = doc.createElement("div");
      box.innerHTML = verifyStatusHtml(body);
      const card = box.firstElementChild;
      if (!card) continue;
      el.replaceWith(card);
      nxt?.remove();
      continue;
    }
    if (labeled && isVerifyKey(key)) {
      const box = doc.createElement("div");
      box.innerHTML = verifyStatusHtml(value);
      const card = box.firstElementChild;
      if (card) el.replaceWith(card);
      continue;
    }
    if (el.classList.contains("kn-md-kicker") && isJudgmentKey(text)) {
      const nxt = nextElement(el);
      const body = nxt && /^(P|DIV)$/u.test(nxt.tagName)
        ? knPlain(nxt.textContent ?? "")
        : "";
      if (!body) continue;
      const box = doc.createElement("div");
      box.innerHTML = judgmentBlockHtml(text, body);
      const card = box.firstElementChild;
      if (!card) continue;
      el.replaceWith(card);
      nxt?.remove();
      continue;
    }
    if (labeled && isJudgmentKey(key)) {
      const box = doc.createElement("div");
      box.innerHTML = judgmentBlockHtml(key, value);
      const card = box.firstElementChild;
      if (card) el.replaceWith(card);
      continue;
    }
    if (el.classList.contains("kn-md-kicker") && isNextKey(text)) {
      const nxt = nextElement(el);
      const body = nxt && /^(P|DIV)$/u.test(nxt.tagName)
        ? knPlain(nxt.textContent ?? "")
        : "";
      if (!body) continue;
      const box = doc.createElement("div");
      box.innerHTML = nextBlockHtml(text, body);
      const card = box.firstElementChild;
      if (!card) continue;
      el.replaceWith(card);
      nxt?.remove();
      continue;
    }
    if (labeled && isNextKey(key)) {
      const box = doc.createElement("div");
      box.innerHTML = nextBlockHtml(key, value);
      const card = box.firstElementChild;
      if (card) el.replaceWith(card);
      continue;
    }
    const chips = parseStatusChips(text);
    if (!chips.length) continue;
    const rest = stripStatusClauses(text);
    const row = doc.createElement("div");
    row.innerHTML = statusRowHtml(chips);
    const chipEl = row.firstElementChild;
    if (!chipEl) continue;
    el.parentElement?.insertBefore(chipEl, el);
    if (rest) el.textContent = rest;
    else el.remove();
  }
}

function wrapCapTables(root: Element, doc: Document): void {
  for (const el of [...root.querySelectorAll("pre")]) {
    if (!el.isConnected || alreadyEnhanced(el)) continue;
    const text = knPlain(el.textContent ?? "");
    const html = mermaidFlowHtml(text);
    if (!html) continue;
    const wrap = doc.createElement("div");
    wrap.innerHTML = html;
    const nodes = [...wrap.children];
    if (nodes.length === 1) el.replaceWith(nodes[0]!);
    else if (nodes.length > 1) el.replaceWith(...nodes);
  }
  for (const el of [...root.querySelectorAll("p")]) {
    if (!el.isConnected || alreadyEnhanced(el)) continue;
    if (el.querySelector("ul,ol,table,p,div")) continue;
    const text = knPlain(el.textContent ?? "");
    if (!looksLikeCapTable(text)) continue;
    const html = capTableHtml(text);
    if (!html) continue;
    const wrap = doc.createElement("div");
    wrap.innerHTML = html;
    const figure = wrap.firstElementChild;
    if (figure) el.replaceWith(figure);
  }
}

const FACT_LINE =
  /^(?:核心判断|投资建议|总体评级|下一步建议|内容状态|支持理由|主要保留意见|改变判断的条件)[:：]/u;

function wrapConclusionBlocks(root: Element, doc: Document): void {
  for (const h of [...root.querySelectorAll("h2,h3,h4")]) {
    if (!h.isConnected || alreadyEnhanced(h)) continue;
    if (!isConclusionHeading(headingLabel(h))) continue;
    const mdLines: string[] = [];
    const taken: Element[] = [];
    let n = nextElement(h);
    while (n && !isHeading(n)) {
      const next = nextElement(n);
      if (/^(UL|OL)$/u.test(n.tagName)) {
        const items = [...n.querySelectorAll(":scope > li")].map((li) =>
          knPlain(li.textContent ?? ""),
        );
        if (
          items.some((t) =>
            /^(?:总体评级|下一步建议|支持理由|主要保留意见|改变判断的条件)/u.test(
              t,
            ),
          )
        ) {
          for (const t of items) mdLines.push(`- ${t}`);
          taken.push(n);
        } else {
          break;
        }
      } else if (
        /^(P|DIV)$/u.test(n.tagName) &&
        FACT_LINE.test(knPlain(n.textContent ?? ""))
      ) {
        mdLines.push(knPlain(n.textContent ?? ""));
        taken.push(n);
      } else {
        break;
      }
      n = next;
    }
    const split = splitConclusionSection(headingLabel(h), mdLines.join("\n"));
    if (!split) continue;
    const box = doc.createElement("div");
    box.innerHTML = split.cardHtml;
    const card = box.firstElementChild;
    if (!card) continue;
    h.replaceWith(card);
    for (const el of taken) el.remove();
  }
}

function localizeShortStatusCells(root: Element): void {
  for (const el of [...root.querySelectorAll("td,th,strong,em,li")]) {
    if (el.querySelector("p,div,table,ul,ol,section")) continue;
    if (el.closest(".kn-decision, .kn-cap, .kn-verdict")) continue;
    const raw = knPlain(el.textContent ?? "");
    if (!raw || raw.length > 48) continue;
    const loc = localizeKnStatusText(raw);
    if (loc !== raw && el.childElementCount === 0) el.textContent = loc;
  }
}

function aliasLegacy(root: Element): void {
  for (const el of [...root.querySelectorAll(".adv-grid")]) {
    el.classList.add("kn-split");
  }
  for (const el of [...root.querySelectorAll(".adv-grid .pros, .pros")]) {
    if (el.closest(".kn-split__col")) continue;
    el.classList.add("kn-split__col", "kn-split__col--go");
  }
  for (const el of [...root.querySelectorAll(".adv-grid .cons, .cons")]) {
    if (el.closest(".kn-split__col")) continue;
    el.classList.add("kn-split__col", "kn-split__col--stop");
  }
  for (const el of [...root.querySelectorAll(".callout")]) {
    el.classList.add("kn-callout");
  }
  for (const el of [...root.querySelectorAll(".callout-title")]) {
    el.classList.add("kn-callout__label");
  }
  for (const el of [...root.querySelectorAll(".callout-hint")]) {
    el.classList.add("kn-source-note");
  }
  for (const el of [...root.querySelectorAll(".tag:not(.kn-md-tag)")]) {
    el.classList.add("kn-md-tag");
  }
  for (const el of [...root.querySelectorAll(".valuation-box")]) {
    el.classList.add("kn-hero");
  }
  for (const el of [...root.querySelectorAll(".valuation-box .big")]) {
    el.classList.add("kn-hero__value");
  }
  for (const table of [...root.querySelectorAll("table")]) {
    if (table.closest(".kn-table-wrap")) continue;
    const wrap = table.ownerDocument.createElement("div");
    wrap.className = "kn-table-wrap";
    table.parentNode?.insertBefore(wrap, table);
    wrap.append(table);
  }
}

export function enhanceKnChapterRoot(root: Element, doc: Document): void {
  aliasLegacy(root);
  unwrapMismatchedSplits(root, doc);
  stripVisibleHeadingNumbers(root);
  stripNumbersFromEnhancedLabels(root);
  markSourceNotes(root);
  wrapOneLiners(root, doc);
  wrapStatusCards(root, doc, RECOMMEND_HEAD, "verdict", knVerdictTone);
  wrapStatusCards(root, doc, READINESS_HEAD, "readiness", knReadinessTone);
  wrapConclusionBlocks(root, doc);
  wrapCapTables(root, doc);
  relabelCapPercents(root, doc);
  wrapWorkpaperLists(root, doc);
  wrapTakeawayAndJudgment(root, doc);
  hoistLaterDeliverables(root);
  wrapPrereqs(root, doc);
  wrapSplits(root, doc);
  dropRedundantDebateHeads(root);
  localizeShortStatusCells(root);
  wrapPendingIn(root, doc);
}

/** 展示时把常见裸文套上 kn-*，旧稿不必重生成。 */
export function enhanceKnChapterHtml(html: string): string {
  const raw = String(html ?? "");
  if (!raw.trim()) return raw;
  if (typeof DOMParser === "undefined") return raw;
  const doc = new DOMParser().parseFromString(
    `<div id="__kn_root">${raw}</div>`,
    "text/html",
  );
  const root = doc.getElementById("__kn_root");
  if (!root) return raw;
  enhanceKnChapterRoot(root, doc);
  return root.innerHTML;
}
