/**
 * 项目卡片水印：从标题里抽 2 个有辨识度的字/字母。
 * 跳过国名套话，避开「澳大」这类截断谐音，并尽量不与同屏其他卡片重复。
 */

const GENERIC = new Set([
  "项目",
  "投资",
  "收购",
  "开发",
  "业务",
  "基金",
  "股份",
  "有限",
  "公司",
  "集团",
  "计划",
  "机会",
  "合作",
  "简介",
  "平台",
  "系统",
  "方案",
  "服务",
  "管理",
  "经纪",
  "AI",
  "A.I.",
  "GPT",
  "LLM",
]);

/** 三字及以上地名，整段跳过，避免截成「澳大」「新加」 */
const GEO_SKIP = new Set([
  "澳大利亚",
  "美利坚",
  "印度尼西亚",
  "马来西亚",
  "新加坡",
  "菲律宾",
  "新西兰",
  "加拿大",
  "俄罗斯",
  "葡萄牙",
  "西班牙",
  "意大利",
  "奥地利",
  "法兰西",
  "德意志",
  "英格兰",
  "苏格兰",
  "爱尔兰",
  "比利时",
  "匈牙利",
  "土耳其",
  "伊拉克",
  "以色列",
  "阿根廷",
  "墨西哥",
  "哥伦比亚",
  "委内瑞拉",
  "哈萨克斯坦",
  "巴基斯坦",
  "孟加拉国",
  "斯里兰卡",
  "柬埔寨",
  "蒙古国",
  "阿拉伯",
  "沙特阿拉伯",
  "南极洲",
]);

const BLOCKED_PAIRS = new Set([
  "澳大",
  "新加",
  "美利",
  "菲律",
  "马来",
  "加拿",
  "俄罗",
  "意大",
  "西班",
  "葡萄",
]);

/** 二字国名/套话：单独当水印太空，有更具体的词就用那些 */
const GEO_MARK_SKIP = new Set([
  "中国",
  "美国",
  "日本",
  "韩国",
  "英国",
  "法国",
  "德国",
  "印度",
  "俄国",
  "巴西",
  "泰国",
  "越南",
  "缅甸",
  "朝鲜",
  "澳洲",
  "欧洲",
  "亚洲",
  "非洲",
  "国内",
  "境外",
  "海外",
  "国际",
]);

function isCjk(s: string): boolean {
  return /^[\u4e00-\u9fff]+$/u.test(s);
}

function isLatin(s: string): boolean {
  return /^[A-Za-z]/u.test(s);
}

function tokenize(name: string): string[] {
  const stripped = name.replace(/[（(][^）)]*[）)]/gu, " ");
  return stripped.match(/[\u4e00-\u9fff]+|[A-Za-z][A-Za-z0-9.&'-]*/gu) ?? [];
}

function usablePair(pair: string): boolean {
  if (pair.length !== 2) return false;
  if (pair[0] === pair[1]) return false;
  if (BLOCKED_PAIRS.has(pair)) return false;
  if (GEO_MARK_SKIP.has(pair)) return false;
  if (GENERIC.has(pair) || GENERIC.has(pair.toUpperCase())) return false;
  return true;
}

function stripLeadingGeo(s: string): string {
  const geos = [...GEO_SKIP].sort((a, b) => b.length - a.length);
  let out = s;
  let changed = true;
  while (changed) {
    changed = false;
    for (const geo of geos) {
      if (out.startsWith(geo)) {
        out = out.slice(geo.length);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function peelGenericPrefix(s: string): string {
  let out = s;
  let changed = true;
  while (changed && out.length >= 2) {
    changed = false;
    const two = out.slice(0, 2);
    if (GENERIC.has(two) || GENERIC.has(two.toUpperCase())) {
      out = out.slice(2);
      changed = true;
    }
  }
  return out;
}

function fromCjkToken(raw: string): string[] {
  const tok = peelGenericPrefix(stripLeadingGeo(raw));
  if (!tok || GEO_SKIP.has(tok)) return [];
  if (tok.length === 2) return usablePair(tok) ? [tok] : [];

  const out: string[] = [];
  const push = (p: string) => {
    if (usablePair(p) && !out.includes(p)) out.push(p);
  };
  // 连写标题按 2 字对齐切：首对不可用则错一位，避免「人人贷」→「贷投」、「中澳文旅」→「中金」
  const primary = usablePair(tok.slice(0, 2)) ? 0 : 1;
  const secondary = primary === 0 ? 1 : 0;
  for (const offset of [primary, secondary]) {
    for (let i = offset; i + 2 <= tok.length; i += 2) {
      push(tok.slice(i, i + 2));
    }
  }
  if (tok.length === 3) {
    push(tok.slice(-2));
    push(`${tok[0]}${tok[tok.length - 1]}`);
  }
  return out;
}

function fromLatin(words: string[]): string[] {
  const letters = words
    .map((w) => w.replace(/[^A-Za-z]/gu, ""))
    .filter((w) => w.length > 0);
  const out: string[] = [];
  if (letters.length >= 2) {
    const pair = `${letters[0]![0]}${letters[1]![0]}`.toUpperCase();
    if (usablePair(pair)) out.push(pair);
  }
  const first = letters[0];
  if (first && first.length >= 2) {
    const two = first.slice(0, 2).toUpperCase();
    if (usablePair(two) && !out.includes(two)) out.push(two);
  }
  return out;
}

function collectCandidates(name: string): string[] {
  const tokens = tokenize(name);
  const meaningful = tokens.filter(
    (t) =>
      !GENERIC.has(t) &&
      !GENERIC.has(t.toUpperCase()) &&
      !GEO_SKIP.has(t) &&
      !GEO_MARK_SKIP.has(t),
  );
  const cands: string[] = [];
  const push = (list: string[]) => {
    for (const c of list) {
      if (!cands.includes(c)) cands.push(c);
    }
  };

  for (const t of meaningful) {
    if (isCjk(t) && t.length === 2) push(fromCjkToken(t));
  }
  push(fromLatin(meaningful.filter(isLatin)));
  for (const t of meaningful) {
    if (isCjk(t) && t.length >= 3) push(fromCjkToken(t));
  }

  const compact = peelGenericPrefix(
    stripLeadingGeo(name.replace(/[^\u4e00-\u9fffA-Za-z]/gu, "")),
  );
  if (compact.length >= 2) {
    if (/^[A-Za-z]/u.test(compact)) {
      const three = compact.slice(0, Math.min(3, compact.length)).toUpperCase();
      const two = compact.slice(0, 2).toUpperCase();
      if (three.length >= 2) push([three]);
      if (usablePair(two)) push([two]);
    } else {
      const two = compact.slice(0, 2);
      if (usablePair(two)) push([two]);
      if (compact.length >= 3) {
        const skip = `${compact[0]}${compact[2]}`;
        if (usablePair(skip)) push([skip]);
      }
    }
  }
  push(["项"]);
  return cands;
}

/** 抽一张卡片的水印。传入 used 可避免同屏重复。 */
export function projectCardMark(
  name: string,
  used?: Set<string>,
): string {
  const t = name.trim();
  if (!t) {
    const fallback = "项";
    used?.add(fallback);
    return fallback;
  }
  const cands = collectCandidates(t);
  for (const c of cands) {
    const key = c.toUpperCase();
    if (used?.has(key)) continue;
    used?.add(key);
    return c;
  }
  const last = cands[0] ?? "项";
  used?.add(last.toUpperCase());
  return last;
}

export function projectCardMarksFor(
  names: { id: string; name: string }[],
): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  for (const row of names) {
    map.set(row.id, projectCardMark(row.name, used));
  }
  return map;
}
