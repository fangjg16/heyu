/** 源文件「按主题」分组：少数投研桶，而不是每个文件自拟一条类型。 */

export type FileTopicId =
  | "intro"
  | "positioning"
  | "comps"
  | "market"
  | "finance"
  | "legal"
  | "ownership"
  | "diligence"
  | "other";

export type FileTopicBucket = {
  id: FileTopicId;
  label: string;
  match: RegExp;
};

/** 顺序即优先级：先命中更具体的桶 */
export const FILE_TOPIC_BUCKETS: readonly FileTopicBucket[] = [
  {
    id: "comps",
    label: "对标与竞品",
    match:
      /对标|可比|对比|竞品|对手|定价全景|pricing|benchmark|comparable|\bcomps?\b|\bpeer|\bvs\b|jucloud|剧云|sudowrite|novelai/iu,
  },
  {
    id: "finance",
    label: "财务与估值",
    match: /财务|估值|回报|模型|现金流|irr|moic|capex|financial\s*model/iu,
  },
  {
    id: "legal",
    label: "法律与合规",
    match: /合规|牌照|许可|监管|合同|协议|term\s*sheet|license|compliance/iu,
  },
  {
    id: "ownership",
    label: "股权与主体",
    match: /股权|股东|权属|工商|章程|ubo|cap\s*table|shareholder/iu,
  },
  {
    id: "diligence",
    label: "尽调材料",
    match: /尽调|checklist|data\s*room|资料室|问题清单|测绘图|规划图|航拍|总平面|总体规划/iu,
  },
  {
    id: "market",
    label: "行业与市场",
    match: /行业|市场|赛道|趋势|时机|tam|sam|som|研报|industry|market/iu,
  },
  {
    id: "intro",
    label: "项目介绍",
    match:
      /商业计划|\bbp\b|deck|teaser|路演|推介|简介|概览|项目介绍|pitch|新闻稿|独家\s*[|｜]|获投|投了|媒体报道|融资新闻/iu,
  },
  {
    id: "positioning",
    label: "定位与进展",
    match:
      /定位|验证|进展|追踪|头脑风暴|切口|工作底稿|工作单|intake|brief|progress|positioning/iu,
  },
] as const;

export const FILE_TOPIC_LABELS: readonly string[] = [
  ...FILE_TOPIC_BUCKETS.map((b) => b.label),
  "其他",
];

export type FileTopicInput = {
  filename?: string | null;
  relativePath?: string | null;
  fileCategory?: string | null;
  documentType?: string | null;
};

function blobOf(input: FileTopicInput): string {
  return [
    input.filename ?? "",
    input.relativePath ?? "",
    input.fileCategory ?? "",
    input.documentType ?? "",
  ]
    .join("\n")
    .trim();
}

export function resolveFileTopic(input: FileTopicInput): {
  id: FileTopicId;
  label: string;
} {
  const blob = blobOf(input);
  if (!blob) return { id: "other", label: "其他" };
  for (const bucket of FILE_TOPIC_BUCKETS) {
    if (bucket.match.test(blob)) {
      return { id: bucket.id, label: bucket.label };
    }
  }
  const exact = FILE_TOPIC_LABELS.find((l) => l === blob.trim());
  if (exact === "其他") return { id: "other", label: "其他" };
  return { id: "other", label: "其他" };
}

export function canonicalizeFileTopic(
  documentType: string,
  filename?: string | null,
): string {
  return resolveFileTopic({ documentType, filename }).label;
}

/** 投研抽屉名：只用于「按主题」合并，不能当文件文种标题 */
export function isTopicBucketLabel(text: string): boolean {
  const t = (text ?? "").trim();
  return FILE_TOPIC_LABELS.includes(t);
}

/**
 * 文件文种（详情标题）：这份材料是什么。
 * 与主题桶分开：主题回答「放哪个抽屉」，文种回答「这是新闻稿还是 BP」。
 * 顺序即优先级。
 */
export const DOCUMENT_GENRE_HINTS: readonly { label: string; match: RegExp }[] = [
  {
    label: "融资新闻稿",
    match:
      /融资新闻|新闻稿|独家\s*[|｜]|获投|投了|媒体报道|36氪|钛媒体|晚点|财新|亿欧|报道[：:]/iu,
  },
  { label: "测绘图", match: /测绘图|cadastral|\bsurvey\b/iu },
  {
    label: "规划图",
    match: /总体规划|总平面|总平图|规划图|site[\s._-]*plan|master[\s._-]*plan/iu,
  },
  { label: "航拍图", match: /航拍/iu },
  { label: "权属文件", match: /title\s*search|权属检索|产权证/iu },
  { label: "商业计划书", match: /商业计划|\bbp\b|pitch\s*deck|路演材料|路演PPT/iu },
  { label: "访谈纪要", match: /访谈|会议纪要/iu },
  { label: "股东协议", match: /股东协议|股权转让|term\s*sheet/iu },
  { label: "财务报表", match: /财务报表|损益表|资产负债表/iu },
  { label: "行业研报", match: /研报|行业报告/iu },
  { label: "尽调清单", match: /尽调清单|问题清单|data\s*room/iu },
  { label: "邮件", match: /\.eml$/iu },
];

const GENRE_MAX_CHARS = 32;

export function sanitizeDocumentGenre(raw: string): string {
  const t = (raw ?? "").replace(/\s+/gu, " ").trim();
  if (!t || /https?:\/\//i.test(t)) return "";
  return Array.from(t).slice(0, GENRE_MAX_CHARS).join("");
}

/**
 * 详情标题用的文种。
 * 模型若只回了主题桶（项目介绍…），就按文件名回退到更具体的文种，避免每个媒体报道都叫项目介绍。
 */
export function inferDocumentGenre(input: FileTopicInput): string {
  const llm = sanitizeDocumentGenre(input.documentType ?? "");
  if (llm && !isTopicBucketLabel(llm)) return llm;
  const nameBlob = [input.filename ?? "", input.relativePath ?? ""].join("\n");
  for (const hint of DOCUMENT_GENRE_HINTS) {
    if (hint.match.test(nameBlob)) return hint.label;
  }
  return llm;
}
