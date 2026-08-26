import { isKnowledgeNetworkDeliveryIntent } from "./knowledge-network-intent";

/**
 * 网站对话 ↔ Hermes skills 意图映射（内部用，用户不可见 skill 名）
 *
 * jfo-r2-materials：Hermes 版项目资料读取层（manifest + 按需 textUrl）；Worker 可预注入任务相关摘录。
 * public-info-search：与 Tavily 联网配合（index 里强制触发外部检索）。
 */

export type SkillIntent =
  | "standard"
  | "project_intake"
  | "knowledge_network"
  | "ic_memo"
  | "business_due_diligence"
  | "industry_due_diligence"
  | "financial_due_diligence"
  | "acquisition_due_diligence"
  | "acquisition_intake"
  | "target_screening"
  | "acquisition_economics"
  | "acquisition_gate"
  | "buyer_fit_transition"
  | "startup_design"
  | "startup_competitors"
  | "startup_positioning"
  | "startup_pitch"
  | "classify_investment_theme"
  | "compliance_check"
  | "dd_checklist"
  | "dd_claim_audit"
  | "document_reorganize"
  | "public_info_search"
  | "term_annotator"
  | "background_check"
  | "risk_matrix"
  | "returns_analysis"
  | "sensitivity_analysis"
  | "value_creation_plan"
  | "gap_tracking"
  | "node_monitoring"
  | "skill_verify";

/** @deprecated 用 SkillIntent；保留别名供 API 字段兼容 */
export type ChatMode = SkillIntent;

type IntentRule = { intent: SkillIntent; re: RegExp };

/** 越靠前优先级越高（更具体的意图先匹配） */
const INTENT_RULES: IntentRule[] = [
  {
    intent: "skill_verify",
    re: /测试\s*skill|skill\s*验证|验证新\s*skill|VERIFY-SKILL|jfo-skill-verify|jfo\s*skill\s*verify/iu,
  },
  { intent: "ic_memo", re: /投资委员会|ic\s*memo|ic备忘录|投资决策备忘录|立项备忘录|表决建议|条款清单|投委会|decision memo|prepare for ic|总结一下这个项目|write up the deal/u },
  {
    intent: "business_due_diligence",
    re: /商业尽调|业务尽调|商业尽职|业务尽职|商业模式.{0,12}尽调|尽调.{0,12}商业模式|business[-\s]?due[-\s]?diligence|\bbusiness\s*dd\b/iu,
  },
  {
    intent: "industry_due_diligence",
    re: /行业尽调|产业尽调|行业尽职|经营对标|市场对标|可比交易|估值参照|对标|industry[-\s]?due[-\s]?diligence|\bindustry\s*dd\b|comp analysis|comparable|market positioning/iu,
  },
  {
    intent: "financial_due_diligence",
    re: /财务尽调|财务尽职|financial[-\s]?due[-\s]?diligence|\bfinancial\s*dd\b|\bfdd\b/iu,
  },
  {
    intent: "acquisition_due_diligence",
    re: /收购尽调|并购尽调|收购尽职|acquisition[-\s]?due[-\s]?diligence/iu,
  },
  {
    intent: "acquisition_gate",
    re: /收购闸门|并购闸门|买不买|是否收购|该不该买|acquisition\s*gate/iu,
  },
  {
    intent: "acquisition_economics",
    re: /收购经济性|并购经济性|收购划不划算|acquisition\s*economics/iu,
  },
  {
    intent: "target_screening",
    re: /标的筛选|目标筛选|筛标的|target\s*screening/iu,
  },
  {
    intent: "buyer_fit_transition",
    re: /接手适配|买方适配|老板依赖|买后接手|buyer[-\s]?fit/iu,
  },
  {
    intent: "acquisition_intake",
    re: /收购入驻|并购入驻|收购立项|并购立项|acquisition\s*intake/iu,
  },
  {
    intent: "startup_pitch",
    re: /路演稿|路演材料|pitch\s*deck|startup\s*pitch|融资bp|融资BP/iu,
  },
  {
    intent: "startup_positioning",
    re: /创业定位|早期定位|startup\s*positioning/iu,
  },
  {
    intent: "startup_competitors",
    re: /创业竞品|早期竞品|竞品分析|startup\s*competitors/iu,
  },
  {
    intent: "startup_design",
    re: /创业设计|早期项目设计|startup\s*design|早期验证/iu,
  },
  {
    intent: "classify_investment_theme",
    re: /投资主题|主题分类|属于什么赛道|什么行业主题|classify[-\s]?investment[-\s]?theme/iu,
  },
  {
    intent: "compliance_check",
    re: /合规分析|合规尽调|合规检查|牌照资质|监管约束|compliance[-\s]?check/iu,
  },
  { intent: "dd_checklist", re: /dd\s*checklist|尽调清单|diligence request|data room review|尽调跟踪|还要查什么|what do we still need to check|工作流清单/u },
  { intent: "dd_claim_audit", re: /声明审计|claim audit|verify claims|cross check|信息审计|矛盾|contradiction|审计.*声明|可信度|is this true|audit this/u },
  { intent: "risk_matrix", re: /风险矩阵|risk matrix|风险评估|what could go wrong|what are the risks|风险登记/u },
  { intent: "returns_analysis", re: /回报测算|returns analysis|what'?s the irr|投资回报|financial model|cash flow model|irr|npv|equity multiple|估值测算|valuation model|\/valuation/u },
  { intent: "sensitivity_analysis", re: /敏感性分析|sensitivity|what if|假设变动|tornado|stress test|情景/u },
  { intent: "background_check", re: /背景调查|background check|对手调查|实控人|counterparty|who is this|check the seller|关联交易/u },
  { intent: "value_creation_plan", re: /增值方案|value creation|投后增值|value-add|how do we add value|what can we do with this asset/u },
  { intent: "gap_tracking", re: /信息缺口|gap tracking|what'?s missing|outstanding items|还缺什么|缺口清单|gap status/u },
  { intent: "node_monitoring", re: /节点监控|node monitoring|关键节点|decision nodes|what are we waiting for|外部事件|monitor/u },
  { intent: "document_reorganize", re: /整理文件|organize document|file index|文档索引|sort these files|有哪些文件|文件分类/u },
  { intent: "term_annotator", re: /术语表|glossary|专有名词|add footnote|什么是 da|explain lfp|footnote/u },
  { intent: "public_info_search", re: /查外部资料|公开信息|public info|搜一下|search for|background on|网上查|联网搜索|what can we find on/u },
  {
    intent: "project_intake",
    re: /project[-\s]?intake|intake|入驻|五维|覆盖度|尽调(?!清单)|成熟度诊断|资料覆盖|全面分析|完整分析|深度分析|项目.{0,6}分析|怎么看.{0,8}项目|看下这个项目|new project|look at this deal|投资价值|交易结构|瓶颈|硬实力|项目类型|project[-\s]?type|maturity\s+diagnosis|两因素|来源多样性|\/intake/u,
  },
];

export function detectSkillIntent(message: string): SkillIntent {
  const m = message.trim();
  if (isKnowledgeNetworkDeliveryIntent(m)) return "knowledge_network";
  for (const { intent, re } of INTENT_RULES) {
    if (re.test(m)) return intent;
  }
  return "standard";
}

/** @deprecated */
export const detectChatMode = detectSkillIntent;

export function usesFullPackageCorpus(intent: SkillIntent): boolean {
  return intent !== "standard";
}

export function shouldForceExternalSearch(intent: SkillIntent): boolean {
  return intent === "public_info_search";
}

/** 非轻问任务走 Hermes Agent（真 skills），需配置 HERMES_BASE_URL + HERMES_API_KEY */
export function shouldRouteToHermes(intent: SkillIntent): boolean {
  return intent !== "standard" && intent !== "knowledge_network";
}

export function websitePlatformIdentityLines(): string[] {
  return [
    "【平台身份】你是「联合家办平台」项目页里的唯一 AI 助手。用户不知道、也不需要知道 Hermes、skill、插件、合域、Opportunistic 等后台实现。",
    "【表达禁令】禁止提及 Hermes、投资智库、skill 名、JSON Schema、导出到某系统、带产品名的「标准模板」。",
    "【元叙述禁令】禁止用整段开场白解释工作方式（如「我们以机会型投资视角」「全文仅使用报告」）——直接写交付正文。",
    "【收尾禁令】禁止结尾推销「如需生成 Hermes xxx」；下一步用人话，如「需要尽调清单或 IC 备忘录，直接说即可」。",
    "本页可完成深度分析交付：入驻评估、尽调清单、风险矩阵、回报测算、IC 备忘录等。项目知识网络请在项目页生成，不要在对话里产出整页 HTML。",
    "对人话命名：项目入驻评估、尽调清单、风险矩阵、投资委员会备忘录、项目知识网络、公开资料检索（「查外部资料：…」）。",
  ];
}

function sharedCorpusLines(): string[] {
  return [
    "已注入本项目资料包摘录（含用户上传的尽调等材料）。基于摘录作答；不足处标「缺乏资料/待核实」，勿编造。",
    "引用上传资料用 [ID:n]；推论标「推论」或「待核实」。",
  ];
}

const SKILL_PROMPTS: Record<Exclude<SkillIntent, "standard">, string[]> = {
  project_intake: [
    "【项目入驻/成熟度评估】识别 8 类 project-type（real-estate-dev/income、energy-operating/dev、biotech、technology、trade-commodities、hospitality），两因素成熟度（Factor A 分母 11 canonical slots × Factor B 来源多样性）。",
    "新建 KB 时须写入 KB-CONFIG（display-order、project-type、rendering-mode、multi-asset、config-version、display-order-history）。输出结构化分析：核心定位、资产、法律结构、财务要点、主要风险、建议。",
  ],
  knowledge_network: [
    "【项目知识网络】已改为仅在网页生成。不要输出整页 HTML、不要 ```html 代码块、不要写入 [AI]_知识网络.html。",
    "请用户打开本项目「知识网络」，使用「更新全部章节」或「更新本章」；概览用顶栏「更新概览」。",
  ],
  ic_memo: [
    "【投资委员会备忘录（草稿）】输出 Markdown：投资概要、标的与交易、投资逻辑、主要风险与缓释、关键条款/交割条件、表决建议（通过/有条件/否决及条件）。",
    "优先基于当前项目知识网络 KB；仅当 KB 缺关键事实时再按需读取相关原始资料。",
    "禁止声称已生成 Word/.docx 文件——本平台当前仅交付 Markdown 草稿（非 Cowork 本地 .docx 产物）。",
  ],
  business_due_diligence: [
    "【商业尽调】写标的怎么赚钱：卖什么、卖给谁、获客/交付/回款如何串起来，核心能力是否支撑增长。",
    "用合同、订单、流程样本，不要只听管理层叙事。不要写成投资人 IRR 或尽调工作流总清单。",
    "资料不足标缺口。财务质量交给财务尽调；市场定义交给行业尽调。",
  ],
  industry_due_diligence: [
    "【行业尽调】判断所处市场是否可投：市场定义、需求、规模口径、价值链、竞争与监管方向。",
    "经营对标写在这里；估值倍数和 IRR 不要写在这里。证据不足就写缺口。",
  ],
  financial_due_diligence: [
    "【财务尽调】核验历史与预测：收入质量、利润、现金、营运资本、债务与盈利质量。",
    "不判断市场好不好；估值倍数和 IRR 交给回报分析。",
  ],
  acquisition_due_diligence: [
    "【收购尽调】覆盖业务/行业/财务要点，并必须测：离开老板能否转、隐藏资本开支、控制权变更与接手风险。",
    "不要合成一份空泛总报告。",
  ],
  acquisition_intake: [
    "【收购立项】写清买方是谁、能干什么、生活与资金约束、这条收购命题是什么。允许预算和回报暂不明确。",
    "不要滑成被动财务投资视角。",
  ],
  target_screening: [
    "【标的筛选】只排尽调顺序与筛选理由，不下买或不买的结论。",
  ],
  acquisition_economics: [
    "【收购经济性】测算买下来划不划算：对价、资本开支、接手成本与回报口径。不要写成行业故事。",
  ],
  acquisition_gate: [
    "【收购闸门】对照尽调、融资、经济性与接手版本，给出买 / 有条件 / 不买，并写明谁接受例外。",
  ],
  buyer_fit_transition: [
    "【接手适配】买方能力、老板依赖、交接后能否运转。不要写成人事八卦。",
  ],
  startup_design: [
    "【早期项目设计】市场怎么切、客户是谁、模式如何验证。写缺口与实验，不要做成品牌或路演稿。",
  ],
  startup_competitors: [
    "【早期竞品】点名对手的产品/价格/获客差异，不要写成出价表或成熟并购对标。",
  ],
  startup_positioning: [
    "【早期定位】这轮该占哪条缝、对谁成立。不要扩成全行业扫描。",
  ],
  startup_pitch: [
    "【路演材料】按已有资料整理融资叙述。缺证据就标缺口，不要编增长曲线。",
  ],
  classify_investment_theme: [
    "【投资主题分类】按经济实质归入一级主题和二级赛道白名单。名称不足或跨界时说明置信度，不得为了给标签而强行归类。",
  ],
  compliance_check: [
    "【合规检查】只写牌照、审批、权属、持续经营相关事实与缺口。不要写成法律意见书或合同审查。",
  ],
  dd_checklist: [
    "【尽调清单】按行业与交易类型生成多工作流 checklist 表格，列：工作流 | 检查项 | 状态 | 优先级 | 备注。",
    "工作流至少含：财务、法律、税务、商业/运营、工程/建设、环境、人事、IT。结合【资料摘录】标注已覆盖项，其余标待索取。",
    "状态列仅用：✅已有、⚠️部分、❌缺失（或待索取）。不要写「dd-checklist skill」；标题用「尽调清单与待办」。",
    "输出格式：先一行标题 ## 尽调清单与待办，简短说明不超过 2 行，然后直接输出 Markdown 表格；不要长段元叙述（如「我们以机会型视角」）。",
  ],
  dd_claim_audit: [
    "【声明与数据审计】列出材料中的关键声明/数字，逐条：声明内容 | 来源 [ID:n] | 可信度（✅/🟡/🔵/⚪）| 交叉验证 | 矛盾或待核项。",
  ],
  document_reorganize: [
    "【项目文件索引】按类型整理已知文件：文件名 | 类型（尽调/财务/法律/…）| 日期 | 摘要一句 | 关联项。基于摘录与文件名推断。",
  ],
  public_info_search: [
    "【公开信息检索】本轮应结合【外部检索】与【资料摘录】：先列公开来源要点 [WEB:n]，再与内部材料对照（一致/差异/待核）。",
  ],
  term_annotator: [
    "【术语注释】列出文中专业术语表格：术语 | 英文/缩写 | 简要解释 | 首次出现上下文。若用户针对某词提问，重点解释该词。",
  ],
  background_check: [
    "【背景调查框架】交易对手/主体：股权结构、实控人、诉讼/信用/声誉（摘录有的写 ✅，无则列待公开核查项）；勿捏造工商细节。",
  ],
  risk_matrix: [
    "【风险矩阵】表格：风险项 | 类别 | 可能性 | 影响 | 综合等级 | 依据 [ID:n] | 缓释/监控建议。覆盖建设、招商、财务、政策、运营等。",
  ],
  returns_analysis: [
    "【回报测算】基于摘录中的数字：基准/上行/下行情景表格（投资、NOI/租金、Cap Rate、IRR/回收期等）；缺参数则列假设与待补数据。",
  ],
  sensitivity_analysis: [
    "【敏感性分析】列出关键假设及变动对回报/估值的影响（表格或 tornado 文字描述）；标明哪些假设最敏感。",
  ],
  value_creation_plan: [
    "【投后增值方案】杠杆列表：举措 | 预期影响 | 难度/周期 | 依赖条件；分短期（0-12月）与中期。",
  ],
  gap_tracking: [
    "【信息缺口清单】表格：缺口描述 | 影响层级 | 紧急度 | 建议负责人 | 解决方式（索取/公开检索/现场）。",
  ],
  node_monitoring: [
    "【关键节点监控】表格：节点/事件 | 预计时间 | 影响程度 | 若正面/负面结果分别触发什么行动。含建设、招商、政策、融资等。",
  ],
  skill_verify: [
    "【Skill 联调探针】回复第一行必须恰好是：[VERIFY-SKILL-OK]",
    "随后用简体中文写 2～4 句确认探针已生效；不要做项目分析、不要输出知识网络 HTML。",
  ],
};

export function skillIntentSystemLines(
  intent: SkillIntent,
  projectNameHint?: string,
): string[] {
  if (intent === "standard") return [];
  const lines = [...sharedCorpusLines(), ...SKILL_PROMPTS[intent]];
  if (intent === "knowledge_network") {
    lines.push(
      "禁止交付整页知识网络 HTML；引导用户到项目页「知识网络」生成章节。",
    );
  }
  return lines;
}

export function deepAnalysisSystemLines(): string[] {
  return skillIntentSystemLines("project_intake");
}

export function icMemoSystemLines(): string[] {
  return skillIntentSystemLines("ic_memo");
}

export function knowledgeNetworkSystemLines(projectNameHint?: string): string[] {
  return skillIntentSystemLines("knowledge_network", projectNameHint);
}

/** 对话命中「生成知识网络」时的固定回复：不再跑 Hermes 整页 HTML */
export const KNOWLEDGE_NETWORK_USE_WEB_ANSWER =
  "项目知识网络请在网页生成：打开本项目「知识网络」，用「更新全部章节」或「更新本章」（概览用顶栏「更新概览」）。对话不再生成整页 HTML。";

export function extractKnowledgeNetworkHtml(answer: string): string | null {
  const fence = answer.match(/```html\s*([\s\S]*?)```/i);
  if (!fence) return null;
  const html = fence[1].trim();
  if (html.length < 200) return null;
  if (!/<html[\s>]/i.test(html) && !/kb-shell|项目知识网络/i.test(html)) return null;
  return html;
}

/** 无 ```html 围栏时，从正文抽取整页 HTML（Hermes 常只贴裸 HTML） */
export function extractKnowledgeNetworkHtmlLoose(answer: string): string | null {
  const fenced = extractKnowledgeNetworkHtml(answer);
  if (fenced) return fenced;

  const doctype = answer.match(/(<!DOCTYPE[\s\S]*?<\/html\s*>)/i);
  if (doctype) {
    const html = doctype[1].trim();
    if (html.length >= 200) return html;
  }

  const htmlBlock = answer.match(/(<html[\s\S]*?<\/html\s*>)/i);
  if (htmlBlock) {
    const html = htmlBlock[1].trim();
    if (html.length >= 200 && (/kb-shell|panel-switcher|项目知识网络/i.test(html) || html.length > 800)) {
      return html;
    }
  }

  return null;
}

/** 供前端快捷芯片等人话文案（不含 skill 名） */
export const USER_QUICK_PROMPTS: { label: string; message: string }[] = [
  { label: "分析项目", message: "帮我全面分析下这个项目" },
  { label: "五维覆盖度", message: "根据尽调资料做五维覆盖度，用 ✅⚠️❌ 标注" },
  { label: "尽调清单", message: "生成尽调清单，标出已有和还缺的材料" },
  { label: "风险矩阵", message: "做一版风险矩阵，列主要风险和缓释建议" },
  { label: "IC 备忘录", message: "写一版投资委员会备忘录草稿" },
  { label: "查外部资料", message: "查外部资料：补充这个项目公开信息并与现有材料对照" },
];
