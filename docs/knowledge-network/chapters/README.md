# 知识网络章节 Markdown 模板

本目录为项目详情「知识网络 → 章节」下 **13 个子 Tab** 的结构模板，与前端 [`ProjectKnowledgeNetworkSection.tsx`](../../../src/components/workspace/ProjectKnowledgeNetworkSection.tsx) 的 `CHAPTER_GROUPS` 一一对应。

用途：后续用「已填 Markdown + 上传资料」生成对应章节 HTML。**当前仅为空结构模板，不含任何项目演示数据。**

## 权威存储（数据库）

模板已落库表 `knowledge_network_chapter_templates`（migration **0017**）。仓库内 Markdown 作为种子源；**线上修改请走数据库 / 管理 API**，改完后如需同步仓库可再导出。

```powershell
cd api-worker
npm run mysql:migrate:local
npm run seed:kn-chapter-templates -- --force
```

管理 API（需平台管理员）：

| 方法 | 路径 |
|------|------|
| GET | `/api/admin/knowledge-network-chapter-templates` |
| GET | `/api/admin/knowledge-network-chapter-templates/:id` |
| PUT | `/api/admin/knowledge-network-chapter-templates/:id` body `{ "markdown": "..." }` |

## 目录索引

| 分组 | 文件 | UI `id` | 标题 |
|------|------|---------|------|
| 项目概况 | [overview/snapshot.md](overview/snapshot.md) | `snapshot` | 项目快照 |
| 项目概况 | [overview/objectives.md](overview/objectives.md) | `objectives` | 标的概况 |
| 基础研究 | [research/industry.md](research/industry.md) | `industry` | 行业分析 |
| 基础研究 | [research/legal.md](research/legal.md) | `legal` | 合规分析 |
| 基础研究 | [research/benchmarks.md](research/benchmarks.md) | `benchmarks` | 对标分析 |
| 方案与回报 | [structure/business.md](structure/business.md) | `business` | 业务模式 |
| 方案与回报 | [structure/returns.md](structure/returns.md) | `returns` | 财务与回报 |
| 方案与回报 | [structure/capabilities.md](structure/capabilities.md) | `capabilities` | 资源网络 |
| 方案与回报 | [structure/ownership.md](structure/ownership.md) | `ownership` | 背景调查 |
| 方案与回报 | [structure/diligence.md](structure/diligence.md) | `diligence` | 尽职调查 |
| 风险与决策 | [risk/risks.md](risk/risks.md) | `risks` | 风险矩阵 |
| 风险与决策 | [risk/questions.md](risk/questions.md) | `questions` | 待确认问题 |
| 风险与决策 | [risk/framework.md](risk/framework.md) | `framework` | 决策路径与法律结构 |

## Frontmatter 字段

| 字段 | 含义 |
|------|------|
| `id` | 与 UI section id 一致 |
| `group` | `overview` \| `research` \| `structure` \| `risk` |
| `groupLabel` | 分组中文名 |
| `title` | 章节标题 |
| `kicker` | 原型副标（如 `项目概况 · A.1`） |
| `canonicalHint` | 对应 Hermes `kb-schema` 槽位提示键（仅文档用途，不驱动后端） |

## 正文约定（输出骨架，勿加填写指引）

模板正文即期望生成的 HTML 结构，**不要**再写「填写指引」等说明文字（易导致模型跳出版式）。

| 章节 | 版式（网页格子为准；skill 只提供填法） |
|------|------|
| `snapshot` | 范围表 + 交易要点；不要 Factor A/B 十一段或综合成熟度表 |
| `objectives` | public-info-search 检索档案 + dd-claim-audit 审计/矛盾/敏感性/待核 |
| `industry` | public-info-search 七类检索档案 + 信息质量 |
| `legal` | dd-claim-audit 合规声明审计四表 |
| `benchmarks` | comp-analysis：筛选标准 + 可比表 + 溢价/折价锚 + 估值区间 |
| `business` | public-info-search：客户/定价/单位经济/经营 KPI（不要 IRR） |
| `returns` | returns-analysis + sensitivity-analysis：看板/现金流/杠杆/Tornado 表/双变量/情景/盈亏平衡 |
| `capabilities` | public-info-search 检索档案 + 关系对手方 |
| `ownership` | background-check：对象/股权链/主体/个人/诉讼/关联交易/红旗 |
| `diligence` | dd-checklist：工作流进度 + 检查项跟踪 + 红旗 |
| `risks` | risk-matrix：HTML 热力图 + 风险登记 + 高风险明细 + 缓释行动 |
| `questions` | gap-tracking 方法，版式为 P1/P2/P3 `<details>` 折叠卡片 |
| `framework` | value-creation-plan：建议/论点/法律路径/增值杠杆/路线图/下一步 |

待填处统一写「待补」，由「更新本章」据项目上传附件填充。行数可按资料增减，表头不可改。

## 使用边界

- 种子源在本目录；改 MD 后执行 `npm run seed:kn-chapter-templates -- --force` 写入数据库（`--force` 才会覆盖已有 format_hint）。
- 前端「更新本章」读库中 markdown + 项目资料生成 HTML。
- 不包含顶层 Tab「引用来源 / 名词解释 / 版本记录」的模板。
- 工作台「项目概览」模板见上级 [`project-overview.md`](../project-overview.md)（`id: project-overview`，不计入 13 章进度）。框架含标题/简介、右上角综合成熟度、判断三卡、四卡、时间轴；关系图由 `===GRAPH===` 挂载。
