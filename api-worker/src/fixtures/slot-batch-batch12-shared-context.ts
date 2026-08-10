import type { Batch1SharedContextFixture } from "../knowledge-network-slot-batch-orchestrator";

/** Batch 3 smoke：Batch 1+2 已接受 shared context（proj-7c0f947a6a00 · 非 PET） */
export const DEFAULT_BATCH12_SHARED_CONTEXT: Batch1SharedContextFixture = {
  projectId: "proj-7c0f947a6a00",
  projectTitle: "中国-哈萨克斯坦跨境贸易项目",
  mode: "full",
  userMessage: "全量重做项目知识网络（slot-batched batch 3 smoke：resource/comps/valuation）。",
  shell: {
    config: {
      displayOrder: [
        "snapshot",
        "target-overview",
        "industry-market",
        "business-operations",
        "legal-ownership",
        "regulatory-compliance",
        "resource-network",
        "comps-benchmark",
        "valuation-returns",
        "diligence-gaps",
        "risks-mitigation",
        "timeline-milestones",
        "decision-framework",
      ],
      projectType: "general",
      renderingMode: "chinese-only",
    },
    meta: {
      title: "中国-哈萨克斯坦跨境贸易项目",
      autoSummary: "聚焦中亚—中国跨境贸易链路；Batch 1–2 已完成，Batch 3 待资源/对标/回报。",
    },
    summary: "Batch 1–2 已接受；本 smoke 仅生成 Batch 3。",
    sources: [
      { id: "A-1", type: "用户上传", title: "项目商业计划书" },
      { id: "A-2", type: "用户上传", title: "贸易流程说明" },
      { id: "A-3", type: "用户上传", title: "哈国市场简介" },
      { id: "A-4", type: "用户上传", title: "物流方案草案" },
      { id: "A-5", type: "用户上传", title: "客户清单（脱敏）" },
      { id: "A-6", type: "用户上传", title: "财务预测摘要" },
      { id: "A-7", type: "用户上传", title: "团队介绍" },
      { id: "A-8", type: "用户上传", title: "产品品类说明" },
      { id: "A-9", type: "用户上传", title: "竞争对手笔记" },
      { id: "A-10", type: "用户上传", title: "历史交易样本（部分）" },
      { id: "A-11", type: "用户上传", title: "风险与合规问答" },
    ],
  },
  batchSummaries: [
    "批次 1：snapshot / target-overview / industry-market 已通过 quality。",
    "批次 2：business-operations 通过；legal/regulatory gap-first 通过（score 72）。",
  ],
  slots: {
    snapshot: {
      stage: "早期尽调",
      status: "资料收集中",
      keyFacts: [
        { 项目项: "业务模式", 内容: "中国—哈萨克斯坦跨境贸易撮合与履约", "证据/来源": "A-1" },
        { 项目项: "当前阶段", 内容: "卖方材料初评", "证据/来源": "A-2" },
      ],
      gaps: [{ text: "缺第三方法律/审计验证", confidence: "gap" }],
    },
    "target-overview": {
      businessSummary: [{ paragraphs: ["项目以跨境贸易服务为核心，连接哈国供应与国内渠道。"] }],
      assetSummary: [
        {
          "资产/权利/能力": "贸易执行与关务协调能力",
          "定义与范围": "端到端跨境履约",
          可投资性: "待法律结构确认",
          "关键证据/缺口": "缺股权与合同包",
        },
      ],
    },
    "industry-market": {
      marketDrivers: [
        { 主题: "中亚贸易增长", "事实/数据": "区域互联互通", 投资含义: "需求侧 tailwind" },
        { 主题: "品类机会", "事实/数据": "若干进口品类", 投资含义: "许可路径待验证" },
        { 主题: "竞争格局", "事实/数据": "贸易商分散", 投资含义: "履约能力差异化" },
      ],
      gaps: [{ text: "缺独立行业数据", confidence: "gap" }],
    },
    "business-operations": {
      journeyMap: { stages: ["线索", "签约", "发运", "交付"] },
      revenueTree: [{ "应用/产品场景": "贸易服务", "价值主张": "跨境撮合", "证据/缺口": "A-1" }],
      gaps: [{ text: "运营 KPI 待补", confidence: "gap" }],
    },
    "legal-ownership": {
      entities: [{ "主体/权利": "运营主体（待确认）", "角色/归属": "—", "限制/负担": "—", "证据/缺口": "缺口" }],
      unresolvedLegalIssues: [
        {
          issue: "股权结构未披露",
          whyItMatters: "影响控制权",
          requiredEvidence: "章程",
          owner: "卖方法务",
          decisionImpact: "交割前须确认",
          riskLevel: "高",
        },
      ],
    },
    "regulatory-compliance": {
      regulatoryGaps: [
        {
          jurisdiction: "中国",
          requirement: "进出口备案",
          currentEvidence: "未提供",
          gap: "待确认",
          nextAction: "索取备案证明",
          riskLevel: "高",
        },
      ],
    },
  },
  slotQuality: {
    snapshot: { score: 100, ok: true, issues: [] },
    "target-overview": { score: 100, ok: true, issues: [] },
    "industry-market": { score: 100, ok: true, issues: [] },
    "business-operations": { score: 100, ok: true, issues: [] },
    "legal-ownership": { score: 72, ok: true, issues: [], gapFirstMode: true },
    "regulatory-compliance": { score: 72, ok: true, issues: [], gapFirstMode: true },
  },
  unresolvedGaps: [
    "comps-benchmark: 缺公开可比与交易案例",
    "valuation-returns: 缺投资金额/估值/股权比例，不可编造 IRR",
  ],
};
