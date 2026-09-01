# 知识网络章节模板

现行种子在 `mature/`、`early/`、`acquire/`，id 与当前目录 tab 一致。呈现 class 见前端 `src/styles/kn-elements.css`。

旧 13 格 Markdown（`overview/`、`research/`、`structure/`、`risk/`）仍会 seed，仅供历史章节改写，不再作为新生成目录。

```powershell
cd api-worker
npm run seed:kn-chapter-templates -- --force
```

| 形态 | 目录 |
|------|------|
| 投资 | [mature/](mature/) |
| 收购 | [acquire/](acquire/) |
| 创业 | [early/](early/) |
| 概览 | [../project-overview.md](../project-overview.md) |

生成时只替换「待补」，保留 class。对不上专属呈现的内容用表。创业无材料时只保留「尚未开展」。市场规模三数用「总市场 / 可服务市场 / 可获得份额」。

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

