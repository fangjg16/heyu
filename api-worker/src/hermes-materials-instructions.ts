import type { SkillIntent } from "./chat-modes";
import type { KnowledgeNetworkUpdateMode } from "./knowledge-network-mode";

/** Hermes 用内部接口做公开网页检索（Tavily），不要让网站对话层抢先搜 */
export function buildHermesWebSearchInstructions(jfoBase: string): string {
  const url = `${jfoBase.replace(/\/$/u, "")}/api/hermes/web-search`;
  return [
    "",
    "【公开检索 · Tavily】",
    "需要核对公开网页、新闻、政策、工商或用户给出的 http(s) 链接时，用本接口，不要用搜索引擎口令敷衍，也不要让用户再说一遍「查外部资料」。",
    "微信公众号（mp.weixin.qq.com）常被登录墙挡住：搜得到登录页就说明读不了正文，如实告知，请用户粘贴文章或上传，禁止编造正文。",
    "",
    "调用：",
    `POST ${url}`,
    "Header: Authorization: Bearer $JFO_INTERNAL_KEY",
    "Header: Content-Type: application/json",
    `Body: {"query":"<检索词或完整 URL>","maxResults":5}`,
    "用返回的 hits[].title / url / content 对照项目资料；引用时写 URL，不要虚构链接。",
    "寒暄或纯项目内事实、用户未要求核实公开信息时，不要调用。",
  ].join("\n");
}

export function hermesParsedCacheSearchUrl(
  jfoBase: string,
  projectId: string,
  userId: string,
  conversationId: string,
): string {
  const base = `${jfoBase.replace(/\/$/u, "")}/api/hermes/projects/${encodeURIComponent(projectId)}/search`;
  const params = new URLSearchParams();
  params.set("scope", userId ? "all" : "package");
  if (userId) params.set("userId", userId);
  if (conversationId) params.set("conversationId", conversationId);
  return `${base}?${params.toString()}`;
}

/** Hermes 版「项目资料读取层」：先检索上传时已解析的缓存，不够再按需拉正文 */
export function buildJfoMaterialsInstructions(
  jfoBase: string,
  projectId: string,
  intent: SkillIntent,
  userId: string,
  conversationId: string,
  knMode?: KnowledgeNetworkUpdateMode,
): string {
  const knUrl = `${jfoBase}/api/hermes/projects/${encodeURIComponent(projectId)}/knowledge-network/current?format=raw`;
  const searchUrl = hermesParsedCacheSearchUrl(jfoBase, projectId, userId, conversationId);
  const packageManifest = `${jfoBase}/api/hermes/projects/${encodeURIComponent(projectId)}/manifest?scope=package`;
  const sessionManifest =
    userId && conversationId
      ? `${jfoBase}/api/hermes/projects/${encodeURIComponent(projectId)}/manifest?scope=session&userId=${encodeURIComponent(userId)}&conversationId=${encodeURIComponent(conversationId)}`
      : null;
  const allManifest =
    userId && conversationId
      ? `${jfoBase}/api/hermes/projects/${encodeURIComponent(projectId)}/manifest?scope=all&userId=${encodeURIComponent(userId)}&conversationId=${encodeURIComponent(conversationId)}`
      : null;

  const readingByTask = taskReadingGuidance(intent, knMode);

  const lines = [
    "",
    "【项目知识】",
    "上传并解析后的资料已经是本项目的知识，不是每轮要跑的流程。指令里若已有【项目知识】/【原文】/预注入摘录，视为已经在场，直接用。",
    "只有知识盖不住（缺某份全文、要公开网页、要写专项交付）才补读。",
    "",
    `- projectId=${projectId}`,
    `- 需要从项目知识里回想更多原文时：GET ${searchUrl}&q=<主题>`,
    "  Header: Authorization: Bearer $JFO_INTERNAL_KEY",
    `- 文件清单（确认有哪些文件，或知识不够时）：${packageManifest}`,
    ...(sessionManifest
      ? [
          `- 本对话附件清单：${sessionManifest}`,
          `- 资料包 + 本对话：${allManifest}`,
        ]
      : ["- 本对话无 conversationId：知识范围是资料包；用户称刚上传附件时向 Worker 确认 userId/conversationId"]),
    `- 当前版知识网络 KB（任务涉及 KB 时）：GET ${knUrl}`,
    "",
    "规则：",
    "- 问答默认基于已在场的项目知识，不要每轮 curl 一遍资料。",
    "- 知识不够时再 search 或对缺口文件 GET textUrl。禁止机械拉取每个 parsed=true 的文件。",
    "- 禁止只凭文件名做结论。",
    "- 引用与事实须可追溯到项目知识、KB、textUrl 或公开来源。",
    "- 用户刚在对话上传文件时：知识范围含 session，不能只看 package。",
    "- 若上方有【Worker 预注入 · 用户点名源文件】：视为已经掌握该文件。",
    "- 若上方有【Worker 预注入 · 项目知识】或【项目资料摘录】：就是本项目已掌握的内容。",
    "- 若上方有【Slot Material Hints】：阅读导航；先用已在场的知识。",
    "- 若上方有【Slot Reading Plan】：阅读路线（mustRead/shouldRead/stopRule），不是事实结论；未掌握的文件不得强结论，缺事实写 gap。",
    "- incremental 未点名 slot 时 hints/plan 仅为 global 紧凑列表（最多 5 个）；initial/full 才展开 13 slot。",
    "- reorder 模式不注入 hints 与 reading plan，也不必补读资料包。",
    "",
    `本任务补读策略：${readingByTask.summary}`,
    ...readingByTask.bullets.map((b) => `- ${b}`),
    "",
    "textUrl：Header Authorization: Bearer $JFO_INTERNAL_KEY；仅对知识盖不住的文件 GET。",
    "知识够用就直接交付；不够再补读后执行主分析 skill。",
  ];

  return lines.join("\n");
}

function taskReadingGuidance(
  intent: SkillIntent,
  knMode?: KnowledgeNetworkUpdateMode,
): { summary: string; bullets: string[] } {
  if (intent === "knowledge_network") {
    if (knMode === "reorder") {
      return {
        summary: "reorder · 仅当前 KB",
        bullets: [
          "只 GET 当前知识网络 HTML，读取 <!-- KB-CONFIG -->",
          "不拉项目资料包/session 正文",
          "只更新 display-order、nav、section 编号",
        ],
      };
    }
    if (knMode === "incremental") {
      return {
        summary: "incremental · 当前 KB + 相关片段",
        bullets: [
          "GET 当前 KB；读取 KB-CONFIG",
          "先 search 点名 slot 相关缓存；不够再拉对应 textUrl",
          "本对话新附件（session）优先纳入检索，仍不必无差别拉全文",
        ],
      };
    }
    if (knMode === "full") {
      return {
        summary: "full · 主要资料 + 从零写 KB",
        bullets: [
          "先 search 核心尽调主题；命中不够的文件再 textUrl",
          "本对话 session 附件纳入检索",
          "按 kb-template 写入完整 KB-CONFIG",
        ],
      };
    }
    return {
      summary: "initial · manifest + 核心资料 + 首次 KB",
        bullets: [
          "先 search 入驻/尽调要点；缺口文件再 textUrl，非全文灌入",
          "本对话 session 附件纳入检索",
          "project-intake 识别 project-type 后写入 KB-CONFIG",
        ],
    };
  }

  if (intent === "project_intake") {
    return {
      summary: "入驻 · 主要资料",
        bullets: [
          "先 search 尽调/推介/财务等主题",
          "session 附件优先于 package；缓存不够再 textUrl",
          "无 KB 时准备写入首版 KB-CONFIG",
        ],
    };
  }

  if (intent === "ic_memo") {
    return {
      summary: "IC 备忘录 · KB 优先",
        bullets: [
          "优先 GET 当前知识网络 KB 作为事实底座",
          "KB 缺关键数字/条款时先 search 解析缓存，仍不够再 textUrl",
          "输出 Markdown 草稿（非 Word 文件）",
        ],
    };
  }

  if (intent === "public_info_search") {
    return {
      summary: "公开检索 · 上下文轻读",
        bullets: [
          "search 解析缓存 + 当前 KB（若有）作项目上下文",
          "再执行外部检索并与内部材料对照",
          "勿无差别拉取全部 package 正文",
        ],
    };
  }

  if (
    intent === "returns_analysis" ||
    intent === "sensitivity_analysis" ||
    intent === "value_creation_plan" ||
    intent === "risk_matrix" ||
    intent === "dd_checklist" ||
    intent === "business_due_diligence" ||
    intent === "industry_due_diligence" ||
    intent === "financial_due_diligence" ||
    intent === "acquisition_due_diligence" ||
    intent === "acquisition_intake" ||
    intent === "target_screening" ||
    intent === "acquisition_economics" ||
    intent === "acquisition_gate" ||
    intent === "buyer_fit_transition" ||
    intent === "startup_design" ||
    intent === "startup_competitors" ||
    intent === "startup_positioning" ||
    intent === "startup_pitch" ||
    intent === "classify_investment_theme" ||
    intent === "deal_screening" ||
    intent === "due_diligence" ||
    intent === "compliance_check" ||
    intent === "dd_claim_audit" ||
    intent === "background_check"
  ) {
    return {
      summary: "尽调/估值/风险 · KB + 相关片段",
        bullets: [
          "先 GET 当前 KB（若存在），再 search 与任务相关的缓存",
          "仅对缓存盖不住的财务/法律/合同文件拉 textUrl",
          "session 新附件纳入检索；不要默认全文读取每个附件",
        ],
    };
  }

  if (intent === "standard") {
    return {
      summary: "对话 · 项目知识已在场",
      bullets: [
        "直接用已注入的项目知识作答",
        "不要为短问 curl 资料",
        "知识盖不住再补读缺口文件",
      ],
    };
  }

  return {
      summary: "深度任务 · 相关节选",
      bullets: [
        "先 search 任务主题",
        "缓存不够再节选 textUrl，非全文灌入",
        "session 附件优先级高于 package",
      ],
  };
}
