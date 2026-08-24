/** 从本章相关附件抽出必须写入正文的主体名，并验收生成结果是否覆盖。 */

const LATIN_STOP = new Set(
  [
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "pdf",
    "xlsx",
    "docx",
    "pptx",
    "http",
    "https",
    "www",
    "com",
    "inc",
    "ltd",
    "llc",
    "ai",
    "llm",
    "gpt",
    "api",
    "app",
    "vs",
    "id",
    "v1",
    "v2",
    "v3",
  ].map((s) => s.toLowerCase()),
);

const CJK_STOP = new Set([
  "的",
  "了",
  "是",
  "在",
  "和",
  "与",
  "或",
  "及",
  "等",
  "对",
  "为",
  "从",
  "到",
  "这",
  "那",
  "有",
  "无",
  "不",
  "也",
  "还",
  "就",
  "都",
  "很",
  "更",
  "最",
  "被",
  "把",
  "让",
  "给",
  "用",
  "以",
  "其",
  "此",
  "该",
  "本",
  "各",
  "每",
  "可以",
  "如果",
  "以及",
  "或者",
  "但是",
  "因为",
  "所以",
  "不是",
  "没有",
  "进行",
  "通过",
  "相关",
  "主要",
  "目前",
  "已经",
  "需要",
  "包括",
  "项目",
  "公司",
  "市场",
  "行业",
  "产品",
  "用户",
  "客户",
  "平台",
  "技术",
  "功能",
  "服务",
  "数据",
  "内容",
  "剧本",
  "工具",
  "国内",
  "国外",
  "海外",
  "对比",
  "对标",
  "竞品",
  "对手",
  "分析",
  "文件",
  "资料",
  "附件",
  "摘要",
  "要点",
  "正文",
  "摘录",
  "生成",
  "智能",
  "人工",
  "模型",
  "系统",
  "版本",
]);

function bump(map: Map<string, { count: number; display: string }>, raw: string, weight: number) {
  const name = raw.trim();
  if (!name) return;
  const key = /[A-Za-z]/.test(name) ? name.toLowerCase() : name;
  const prev = map.get(key);
  if (prev) {
    prev.count += weight;
    if (name.length > prev.display.length) prev.display = name;
  } else {
    map.set(key, { count: weight, display: name });
  }
}

function overlappingCjkGrams(text: string): string[] {
  const runs = text.match(/[\u4e00-\u9fff]+/gu) ?? [];
  const out: string[] = [];
  for (const run of runs) {
    for (let i = 0; i < run.length; i += 1) {
      for (let len = 2; len <= 4 && i + len <= run.length; len += 1) {
        out.push(run.slice(i, i + len));
      }
    }
  }
  return out;
}

function isUsefulCjkName(gram: string): boolean {
  if (CJK_STOP.has(gram)) return false;
  if ([...gram].every((ch) => CJK_STOP.has(ch))) return false;
  if (/^[一二三四五六七八九十百千万]+$/u.test(gram)) return false;
  return true;
}

/** 从对比类附件文本抽出主体名。不写死某个项目的名字。 */
export function extractNamedSubjectsFromText(
  text: string,
  options?: { filenameBoost?: string; max?: number },
): string[] {
  const blob = String(text ?? "");
  if (!blob.trim()) return [];
  const scores = new Map<string, { count: number; display: string }>();
  const filename = options?.filenameBoost ?? "";

  for (const m of blob.match(/[A-Za-z][A-Za-z0-9][A-Za-z0-9._-]{0,38}/gu) ?? []) {
    if (LATIN_STOP.has(m.toLowerCase())) continue;
    bump(scores, m.replace(/[._-]+$/u, ""), 1);
  }
  for (const gram of overlappingCjkGrams(blob)) {
    if (!isUsefulCjkName(gram)) continue;
    bump(scores, gram, 1);
  }

  if (filename.trim()) {
    for (const m of filename.match(/[A-Za-z][A-Za-z0-9][A-Za-z0-9._-]{0,38}/gu) ?? []) {
      if (LATIN_STOP.has(m.toLowerCase())) continue;
      bump(scores, m.replace(/[._-]+$/u, ""), 8);
    }
    for (const gram of overlappingCjkGrams(filename)) {
      if (!isUsefulCjkName(gram)) continue;
      bump(scores, gram, 8);
    }
  }

  const ranked = [...scores.values()]
    .filter((row) => {
      const isLatin = /[A-Za-z]/.test(row.display);
      const inFilename = filename
        .toLowerCase()
        .includes(row.display.toLowerCase());
      if (inFilename) return row.count >= 8;
      if (isLatin) return row.count >= 2;
      if (row.display.length >= 3) return row.count >= 2;
      return row.count >= 4;
    })
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display, "zh"));

  const names: string[] = [];
  for (const row of ranked) {
    if (names.some((n) => n !== row.display && n.includes(row.display))) continue;
    names.push(row.display);
    if (names.length >= (options?.max ?? 12)) break;
  }
  return names;
}

export function htmlCoversSubject(html: string, name: string): boolean {
  const hay = String(html ?? "");
  if (!name.trim()) return true;
  if (hay.includes(name)) return true;
  const compactHay = hay.toLowerCase().replace(/[\s._-]+/gu, "");
  const compactName = name.toLowerCase().replace(/[\s._-]+/gu, "");
  return compactName.length >= 2 && compactHay.includes(compactName);
}

export function missingNamedSubjects(html: string, names: string[]): string[] {
  return names.filter((n) => !htmlCoversSubject(html, n));
}

export function formatNamedSubjectsBlock(names: string[]): string {
  if (names.length === 0) return "";
  return [
    "【本章必须列入的主体（从附件抽出，不是示例）】",
    ...names.map((n) => `- ${n}`),
    "以上名字必须出现在本章表格或对战卡中。禁止只用通用品类/海外工具示例顶替清单内主体；清单外的名字仅当附件也点名才可写。",
  ].join("\n");
}
