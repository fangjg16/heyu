# 知识网络章节 Markdown 模板

本目录为项目详情「知识网络 → 章节」下 **13 个子 Tab** 的结构模板，与前端 [`ProjectKnowledgeNetworkSection.tsx`](../../../src/components/workspace/ProjectKnowledgeNetworkSection.tsx) 的 `CHAPTER_GROUPS` 一一对应。

用途：后续用「已填 Markdown + 上传资料」生成对应章节 HTML。**当前仅为空结构模板，不含任何项目演示数据。**

## 权威存储（数据库）

模板已落库表 `knowledge_network_chapter_templates`（migration **0017**）。仓库内 Markdown 作为种子源；**线上修改请走数据库 / 管理 API**，改完后如需同步仓库可再导出。

```powershell
cd api-worker
npm run mysql:migrate:local
npm run seed:kn-chapter-templates
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

| 章节 | 版式 |
|------|------|
| `snapshot` | 仅一张三列表格 |
| `objectives` | 判断维度表 + 金底门槛卡片 + 来源 |
| `industry` | 背景表 + 机制四宫格 + 形态表 + 宏观数据表 + 供给侧表 + 时间线 |
| `legal` | 监管前提 + 路径总览/闭环/角色/资质/行动表（对齐 BPC 合规） |
| `benchmarks` | 范围说明 + 对标组表 + 运营范式 + 定价层级（对齐 BPC 对标） |
| `business` | 路径总览 + 路径详情卡片 + 缺口条（对齐 BPC 业务模式） |
| `returns` | 前置缺口条 + 参考利润结构表（对齐 BPC 回报） |
| `capabilities` | 关系通道 A/B/C 表 + 缺乏资料条（对齐 BPC 资源网络） |
| `ownership` | 结构状态 + 主体/合同权利核查表 |
| `diligence` | 覆盖度表 + 优先补齐清单 |
| `risks` | 仅一张风险矩阵表 |
| `questions` | P1/P2/P3 `<details>` 问题分组（对齐 BPC） |
| `framework` | 路径矩阵 + 推荐卡片 + 行动清单 + 无法正式建议条（对齐 BPC） |

待填处统一写「待补」，由「更新本章」据项目上传附件填充。

## 使用边界

- 种子源在本目录；改 MD 后执行 `npm run seed:kn-chapter-templates` 写入数据库。
- 前端「更新本章」读库中 markdown + 项目资料生成 HTML。
- 不包含顶层 Tab「引用来源 / 名词解释 / 版本记录」的模板。
- 工作台「项目概览」模板见上级 [`project-overview.md`](../project-overview.md)（`id: project-overview`，不计入 13 章进度）。
