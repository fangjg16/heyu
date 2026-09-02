/**
 * 知识网络呈现层用的中文：标签、英文规范标题、夹杂在中文里的术语。
 * 不改资料包原文，只改页面上看到的字。
 */

const TAG_KIND_ZH: Record<string, string> = {
  data: "资料",
  opinion: "判断",
  assumption: "假设",
  gap: "缺口",
  estimate: "估算",
  "founder decision": "团队决定",
  unknown: "未知",
  required: "必填",
  "data gap": "资料缺口",
};

const TAG_SUFFIX_ZH: Record<string, string> = {
  opinion: "判断",
  "company-reported": "厂商自报",
  "potentially outdated": "可能过期",
  "low confidence": "把握偏低",
  unvalidated: "未验证",
  "validation threshold": "验证门槛",
  "founder-reported": "团队自述",
  stale: "过时",
};

const PHRASES: Array<[RegExp, string]> = [
  [/\bSignificant concerns\b/giu, "重大疑虑"],
  [/\bRed Flags?\b/giu, "红旗"],
  [/\bYellow Flags?\b/giu, "黄旗"],
  [/\bAmber Flags?\b/giu, "黄旗"],
  [/\bStrongest evidence\b/giu, "最强证据"],
  [/\bWeakest links?\b/giu, "最弱环节"],
  [/\bExecutive summary\b/giu, "执行摘要"],
  [/\bExecutive View\b/giu, "总览"],
  [/\bKey findings\b/giu, "要点"],
  [/\bStrategic positioning\b/giu, "战略定位"],
  [/\bCompetitive Overview\b/giu, "竞争全景"],
  [/\bDocument index\b/giu, "文件目录"],
  [/\bAnti-patterns detected\b/giu, "常见误区"],
  [/\bAnti-patterns?\b/giu, "常见误区"],
  [/\bImmediate validation gates?\b/giu, "近期验证门槛"],
  [/\bConfidence dashboard summary\b/giu, "可靠度摘要"],
  [/\bFounder Pivot Overlay\b/giu, "创始人调整"],
  [/\bAudience Decision\b/giu, "客群决定"],
  [/\bPrimary Personas?\b/giu, "首要客群"],
  [/\bSecondary Personas?\b/giu, "次要角色"],
  [/\bAnti-?personas?\b/giu, "不服务谁"],
  [/\bCustomer Pain Hierarchy\b/giu, "痛点排序"],
  [/\bJobs-to-be-[Dd]one\b/giu, "要完成的工作"],
  [/\bLanguage Map\b/giu, "用语对照"],
  [/\bPositioning Map\b/giu, "定位图"],
  [/\bSwitching Costs?\b/giu, "迁移成本"],
  [/\bWhere We Can Win\b/giu, "可赢之处"],
  [/\bDefensibility Requirements?\b/giu, "壁垒条件"],
  [/\bData Gaps?\b/giu, "待补证据"],
  [/\bStrategic Connections?\b/giu, "与其他章的关系"],
  [/\bValidation status\b/giu, "验证状态"],
  [/\bFinancial Model Stage\b/giu, "财务模型阶段"],
  [/\bCurrent Business Model Decision\b/giu, "当前模式"],
  [/\bRevenue Model\b/giu, "收入模式"],
  [/\bGo-to-[Mm]arket\b/giu, "进入市场"],
  [/\bGTM Decision\b/giu, "进入策略"],
  [/\bHigh-level concept\b/giu, "概念"],
  [/\bAha moments?\b/giu, "顿悟点"],
  [/\bNon-negotiable rules\b/giu, "不可妥协的规则"],
  [/\bExpected limitation\b/giu, "预期限制"],
  [/\bDo not do\b/giu, "不要做"],
  [/\bDeliverables\b/giu, "产出"],
  [/\bDay-30 decision table\b/giu, "第30天决策"],
  [/\bIndependent customer discovery\b/giu, "独立用户访谈"],
  [/\bCustomer Segments?\b/giu, "客户细分"],
  [/\bUnique Value Proposition\b/giu, "独特价值主张"],
  [/\bUnfair Advantage\b/giu, "不公平优势"],
  [/\bKey Metrics?\b/giu, "关键指标"],
  [/\bKey Strengths?\b/giu, "长处"],
  [/\bKey Weaknesses?\b/giu, "短处"],
  [/\bCost Structure\b/giu, "成本结构"],
  [/\bRevenue Streams?\b/giu, "收入来源"],
  [/\bTailwinds?\b/giu, "顺风"],
  [/\bHeadwinds?\b/giu, "逆风"],
  [/\bKill [Cc]riteria\b/giu, "停止标准"],
  [/\bMust[- ]Haves?\b/giu, "必须有"],
  [/\bShould[- ]Haves?\b/giu, "应该有"],
  [/\bCould[- ]Haves?\b/giu, "可以有"],
  [/\bWon'?t[- ]Haves?\b/giu, "明确不做"],
  [/\bSection confidence\b/giu, "本节把握"],
  [/\bCustomer Discovery\b/giu, "用户访谈"],
  [/\bMarket Research Synthesis\b/giu, "市场研究综合"],
  [/\bFinal Deliverable\b/giu, "终稿"],
  [/\bPlanning TAM\b/giu, "总市场"],
  [/\bPlanning SAM\b/giu, "可服务市场"],
  [/\bPlanning SOM\b/giu, "可获得份额"],
  [/\bYellow Light\b/giu, "黄灯"],
  [/\bGreen Light\b/giu, "绿灯"],
  [/\bRed Light\b/giu, "红灯"],
  [/\bConditional Proceed\b/giu, "有条件继续"],
  [/\bGo\/No-Go\b/giu, "继续或停止"],
  [/\bWeek\s+(\d+)\s*[—–-]\s+/giu, "第$1周 · "],
  [/\bExperiment\s+(\d+)\b/giu, "实验 $1"],
  [/\bCONDITIONAL\b/gu, "有条件继续"],
  [/\bVERDICT[:：]?\s*/gu, "判断："],
  [/\bRCT\b/gu, "对照试验"],
  [/\bFlags\b/gu, "风险标记"],
  [/\bSources\b/gu, "来源"],
];

export function tagKindFromLabel(label: string): string {
  const first = (label.split(/[,，、/\s]|—|–/u)[0] ?? "").trim().toLowerCase();
  const whole = label.trim().toLowerCase();
  if (whole === "data gap" || first === "gap") return "gap";
  if (first === "data") return "data";
  if (first === "opinion") return "opinion";
  if (first === "assumption") return "assumption";
  if (first === "estimate") return "estimate";
  if (first === "unknown" || first === "required") return "gap";
  if (first === "founder" || whole.startsWith("founder")) return "opinion";
  return "";
}

export function localizeTagLabel(label: string): string {
  const parts = label
    .split(/[,，、/]|—|–/u)
    .map((p) => p.trim())
    .filter(Boolean);
  const head = parts[0] ?? "";
  const kind =
    TAG_KIND_ZH[head.toLowerCase()] ??
    TAG_KIND_ZH[head.split(/\s+/u)[0]?.toLowerCase() ?? ""] ??
    head;
  const rest = parts
    .slice(1)
    .map((p) => TAG_SUFFIX_ZH[p.toLowerCase()] ?? localizeKnText(p))
    .join(" · ");
  return rest ? `${kind} · ${rest}` : kind;
}

export function localizeKnText(s: string): string {
  let t = s;
  for (const [re, zh] of PHRASES) t = t.replace(re, zh);
  return t;
}

/** 方括号标签里的 Data/Opinion 留给标签解析，其余英文词先译。 */
export function localizeOutsideTags(s: string): string {
  return s.replace(/(\[[^\]]*\])|([^[]+)/gu, (_all, tag: string, rest: string) => {
    if (tag) return tag;
    return localizeKnText(rest ?? "");
  });
}

/**
 * 是否整篇偏英文、值得在重新排版时送去翻译。
 * 合域这类中英混排（正文已是中文、标题还是英文规范）不要走整篇翻译，
 * 否则会把已有中文再改一遍；标题和标签靠词表即可。
 */
export function isEnglishHeavyMarkdown(md: string): boolean {
  const sample = md.slice(0, 4500);
  const letters = (sample.match(/[A-Za-z]/g) ?? []).length;
  const hans = (sample.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return letters >= 120 && letters > hans * 1.15;
}

const EVIDENCE_TAG =
  "(?:Data|Opinion|Assumption|Gap|Estimate|Founder decision|Unknown|Required)";

export function evidenceTagPattern(kind: "line" | "inline"): RegExp {
  if (kind === "line") {
    return new RegExp(
      `^(?:\\*\\*)?\\[(${EVIDENCE_TAG}[^\\]]*)\\](?:\\*\\*)?\\s*(.*)$`,
      "iu",
    );
  }
  return new RegExp(`\\[(${EVIDENCE_TAG}[^\\]]*)\\]`, "giu");
}
