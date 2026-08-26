import { isKnowledgeNetworkDeliveryIntent } from "@/lib/knowledge-network-intent";

/**
 * 与 api-worker chat-modes INTENT_RULES 对齐：非 standard 即深度/专项交付。
 * 前端用于：深度任务不走轻问 SSE 气泡、避免误报「流式响应异常」。
 */
const DEEP_SKILL_PATTERNS: RegExp[] = [
  /投资委员会|ic\s*memo|ic备忘录|投资决策备忘录|立项备忘录|表决建议|条款清单|投委会|decision memo|prepare for ic|总结一下这个项目|write up the deal/u,
  /商业尽调|业务尽调|商业尽职|业务尽职|商业模式.{0,12}尽调|尽调.{0,12}商业模式|business[-\s]?due[-\s]?diligence|\bbusiness\s*dd\b/iu,
  /行业尽调|产业尽调|行业尽职|经营对标|市场对标|可比交易|估值参照|对标|industry[-\s]?due[-\s]?diligence|\bindustry\s*dd\b|comp analysis|comparable|market positioning/iu,
  /财务尽调|财务尽职|financial[-\s]?due[-\s]?diligence|\bfinancial\s*dd\b|\bfdd\b/iu,
  /收购尽调|并购尽调|收购尽职|acquisition[-\s]?due[-\s]?diligence/iu,
  /收购闸门|并购闸门|买不买|是否收购|该不该买|acquisition\s*gate/iu,
  /收购经济性|并购经济性|收购划不划算|acquisition\s*economics/iu,
  /标的筛选|目标筛选|筛标的|target\s*screening/iu,
  /接手适配|买方适配|老板依赖|买后接手|buyer[-\s]?fit/iu,
  /收购入驻|并购入驻|收购立项|并购立项|acquisition\s*intake/iu,
  /路演稿|路演材料|pitch\s*deck|startup\s*pitch|融资bp|融资BP/iu,
  /创业定位|早期定位|startup\s*positioning/iu,
  /创业竞品|早期竞品|竞品分析|startup\s*competitors/iu,
  /创业设计|早期项目设计|startup\s*design|早期验证/iu,
  /投资主题|主题分类|属于什么赛道|什么行业主题|classify[-\s]?investment[-\s]?theme/iu,
  /合规分析|合规尽调|合规检查|牌照资质|监管约束|compliance[-\s]?check/iu,
  /dd\s*checklist|尽调清单|diligence request|data room review|尽调跟踪|还要查什么|what do we still need to check|工作流清单/u,
  /声明审计|claim audit|verify claims|cross check|信息审计|矛盾|contradiction|审计.*声明|可信度|is this true|audit this/u,
  /风险矩阵|risk matrix|风险评估|what could go wrong|what are the risks|风险登记/u,
  /回报测算|returns analysis|what'?s the irr|投资回报|financial model|cash flow model|irr|npv|equity multiple/u,
  /敏感性分析|sensitivity|what if|假设变动|tornado|stress test|情景/u,
  /背景调查|background check|对手调查|实控人|counterparty|who is this|check the seller|关联交易/u,
  /增值方案|value creation|投后增值|value-add|how do we add value|what can we do with this asset/u,
  /信息缺口|gap tracking|what'?s missing|outstanding items|还缺什么|缺口清单|gap status/u,
  /节点监控|node monitoring|关键节点|decision nodes|what are we waiting for|外部事件|monitor/u,
  /整理文件|organize document|file index|文档索引|sort these files|有哪些文件|文件分类/u,
  /术语表|glossary|专有名词|add footnote|什么是 da|explain lfp|footnote/u,
  /查外部资料|公开信息|public info|搜一下|search for|background on|网上查|联网搜索|what can we find on/u,
  /project[-\s]?intake|intake|入驻|五维|覆盖度|尽调(?!清单)|成熟度诊断|资料覆盖|全面分析|完整分析|深度分析|项目.{0,6}分析|怎么看.{0,8}项目|看下这个项目|new project|look at this deal|投资价值|交易结构|瓶颈|硬实力/u,
];

export function isDeepSkillMessage(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (isKnowledgeNetworkDeliveryIntent(m)) return true;
  return DEEP_SKILL_PATTERNS.some((re) => re.test(m));
}

import { stripAssistantThinkTags } from "@/lib/chat-think-tags";

/** 流式生成中：隐藏未闭合的 ```html 大块，避免气泡里刷源码 */
export function streamingAssistantDisplayText(content: string, isStreaming: boolean): string {
  const stripped = stripAssistantThinkTags(content, isStreaming);
  if (!isStreaming) return stripped;
  const open = /```html\b/i.exec(stripped);
  if (!open) return stripped;
  const before = stripped.slice(0, open.index).trim();
  return before || "正在生成内容，请稍候…";
}
