# 知识网络章节模板

现行种子在 `mature/`、`early/`，id 与当前目录 tab 一致。呈现 class 见前端 `src/styles/kn-elements.css`。

旧 13 格 Markdown（`overview/`、`research/`、`structure/`、`risk/`）仍会 seed，仅供历史章节改写，不再作为新生成目录。投资旧二级 tab（`industry-overview`、`investment-conclusion` 等）同样只服务历史 HTML。

```powershell
cd api-worker
npm run seed:kn-chapter-templates -- --force
```

| 形态 | 目录 |
|------|------|
| 投资 | [mature/](mature/) |
| 创业 | [early/](early/) |
| 概览 | [../project-overview.md](../project-overview.md) |

生成时只替换「待补」，保留 class。对不上专属呈现的内容用表。创业无材料时只保留「尚未开展」。市场规模三数用「总市场 / 可服务市场 / 可获得份额」。

## 投资（mature）

筛选和尽调共用七个一级目录，但**按项目流水线阶段换底稿**，不把 screening-memo 和 investment-analysis-report 叠进每一章。阶段仍是筛选时，资料包里即使已有尽调文件也不改装配。结论写在 1.1（筛选备忘录 / 尽调报告里，不另建评分底稿）。表内子节是必有内容，不是白名单——专章底稿整份进入。深度用工件状态 `indicative` / `working` / `diligence-adjusted` 区分。Agent 建议不改项目流水线。

| 章 | 筛选 | 尽调 |
|----|------|------|
| 1 项目概况（1.1 初筛结论 · 1.2 项目基本情况） | 备忘录第 1 章；enrichment 综合/评分 → 1.1；brief → 1.2 事实；theme / coordinate → 1.2 分类 | investment-analysis-report 第 1 章 + 简报/主题 |
| 2 行业与竞争（2.1–2.5） | 备忘录第 2 章；enrichment 四轮证据按节填入 2.1–2.5，不整份顶成「公开补充要点」 | industry-diligence.md 整份 |
| 3 业务与技术（3.1–3.5） | 备忘录第 3 章；brief → 3.1；enrichment 需求/渠道/能力 → 3.2–3.5 | business-diligence.md 整份 |
| 4 公司与团队（4.1–4.4） | 备忘录第 4 章；brief 公司/团队 → 4.1、4.2；公开检索线索 → 4.4 | company-team.md、简报、业务底稿组织节、background-check（有深查才有） |
| 5 财务分析（5.1–5.4） | 备忘录第 5 章；brief 数字 → 5.1、5.2；enrichment 需求/价格/渠道 → 5.3 | financial-diligence.md 整份 |
| 6 风险与回报（6.1–6.3） | 备忘录第 6 章；brief + enrichment 综合 → 6.1–6.3 | valuation-and-returns.md + claim-audit.md + investment-risks.md |
| 7 待解决问题（7.1–7.2） | 备忘录第 7 章；材料/公开研究/评分缺口 → 7.1、7.2 | diligence-request-list.md + diligence-readiness.md |

平台终态用词是 `passed`（不投）；skill 里是 `declined`。流水线筛选→尽调仍需人点「推进到尽调」。

## 创业（early）

创业目录对齐 startup-design 产出。用户访谈是独立流程，不占知识网络 tab。旧 7 章（`founder-interview` 等）仍会 seed，仅供历史改写。

| 分组 | 章 | 对应产出 |
|------|----|----------|
| 项目概况 | 执行摘要 / 综合总评 | README.md / scorecard.md |
| 市场发现 | 研究结论 / 目标客户 / 市场分析 / 竞争格局 / 行业趋势 | research-gate.md + confidence-dashboard.md / target-audience.md / market-analysis.md / competitor-landscape.md / industry-trends.md |
| 战略定位 | 商业模式 / 价值主张 / 差异化定位 / 市场进入 | lean-canvas.md + business-model.md / value-proposition.md / positioning.md / go-to-market.md |
| 品牌设计 | 品牌设计 | 材料不足时「尚未开展」 |
| 产品设计 | MVP产品 / 用户旅程 / 功能规划 | mvp-definition.md / user-journey.md / feature-prioritization.md |
| 财务测算 | 三年预测 / 收入模式 / 成本结构 | projections.md / revenue-model.md / cost-structure.md |
| 风险验证 | 风险清单 / 关键假设 / 假设验证 | risk-analysis.md / assumptions-tracker.md / validation-playbook.md + experiment-design + kill-criteria.md |
| 未来行动 | 下一步行动 | action-plan-30-days.md |

