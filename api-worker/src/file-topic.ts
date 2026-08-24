/** 与前端 src/lib/file-topic.ts 保持同一套桶；解析入库前把自由发挥的类型收成可合并的主题。 */

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

type FileTopicBucket = {
  id: FileTopicId;
  label: string;
  match: RegExp;
};

const FILE_TOPIC_BUCKETS: readonly FileTopicBucket[] = [
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
    match: /尽调|checklist|data\s*room|资料室|问题清单/iu,
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
      /商业计划|\bbp\b|deck|teaser|路演|推介|简介|概览|项目介绍|pitch/iu,
  },
  {
    id: "positioning",
    label: "定位与进展",
    match:
      /定位|验证|进展|追踪|头脑风暴|切口|工作底稿|工作单|intake|brief|progress|positioning/iu,
  },
];

export const FILE_TOPIC_LABELS: readonly string[] = [
  ...FILE_TOPIC_BUCKETS.map((b) => b.label),
  "其他",
];

export function resolveFileTopic(input: {
  filename?: string | null;
  relativePath?: string | null;
  fileCategory?: string | null;
  documentType?: string | null;
}): { id: FileTopicId; label: string } {
  const blob = [
    input.filename ?? "",
    input.relativePath ?? "",
    input.fileCategory ?? "",
    input.documentType ?? "",
  ]
    .join("\n")
    .trim();
  if (!blob) return { id: "other", label: "其他" };
  for (const bucket of FILE_TOPIC_BUCKETS) {
    if (bucket.match.test(blob)) return { id: bucket.id, label: bucket.label };
  }
  return { id: "other", label: "其他" };
}

export function canonicalizeFileTopic(
  documentType: string,
  filename?: string | null,
): string {
  return resolveFileTopic({ documentType, filename }).label;
}
