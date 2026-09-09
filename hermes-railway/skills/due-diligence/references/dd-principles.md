# Diligence Principles

These principles govern the diligence segment of `due-diligence` — Phases 2–5 — and apply to every diligence workstream inside it. Read them before scoping requests, running the diligence loop, or declaring Diligence Readiness. Domain files (`dd-business.md`, `dd-financial.md`, `dd-industry.md`, and the rest) say how to write each workpaper. This file says how those workpapers divide labor, constrain one another, and pass a formal gate.

Later phases consume diligence output under their own reference files (`returns-analysis.md`, `risk-matrix.md`, `dd-synthesis.md`). Only the invalidation rules below reach into them.

## Workstream boundaries

Do not let one stream write another stream's conclusions.

### `dd-checklist`

Plan and track what must be requested or tested. Output a request list with workstream, purpose, priority, owner, status, and decision impact. Do not reach substantive conclusions.

### `dd-business`

Determine what the target really sells, to whom, how it delivers and earns, how the business evolved, which activities are current/core/non-core/vision, and what product or transaction capability supports sustainable growth. Use customer, supplier, contract, order, delivery, acceptance, product, technical, operational, employee, and management evidence. It may identify ownership, IP, employment, or licensing issues but sends legal conclusions to the appropriate specialist. Identity, ownership, affiliation, and adverse-record deep dives go to Phase 3B.

### `dd-background-check`

Business diligence performs the baseline review of organization, key people, ownership disclosures, and operating dependencies. Phase 3B is the specialist deep dive for identity resolution, beneficial ownership, affiliations, adverse-record matching, disclosure integrity, and related-party relationships. It is not a separate CapitalLens skill. When a full diligence loop finds no material signal, it produces no independent report. When the user named this step, always write `03-diligence/background-check.md`.

### `dd-industry`

Test the target externally: demand, market definition and size, growth, value chain, market structure, competitor behavior, product/price/business-model differences, adoption, and regulatory direction. It owns the analytical conclusion, not a separate search methodology.

### `dd-financial`

Quantify and validate historical and forecast performance: order-to-cash, growth speed, growth quality, growth drivers, revenue quality, margins, cost classification, working capital, cash conversion, debt, tax exposure, capital expenditure, related parties, internal controls, and quality of earnings. It does not decide whether the market is attractive and does not issue an audit, tax, or legal opinion.

### `dd-legal`

Screen licences, approvals, filings, industry access, privacy/data, cross-border rules, platform rules, and continuing obligations only to the extent they affect continued operation, investor rights, value, or deal feasibility. Not general legal advice or contract review.

### `dd-claim-audit`

Audit material claims across all workstreams. Link support and contradiction, detect scope or definition changes, grade evidence, record unresolved conflicts, and invalidate dependent artifacts. Do not write a fourth general diligence report.

## Shared claims

Business, industry, and financial workstreams share material claims but own different verification. Maintain at least these fields:

| Field | Requirement |
|---|---|
| Claim ID / 主张 | 单一、可证伪、带口径和期间 |
| 业务证据 | 产品、客户、交易、交付、运营或团队证据 |
| 行业证据 | 外部需求、规模、价格、竞争、价值链或监管证据 |
| 财务证据 | 订单、验收、收入、回款、成本、现金或资产负债证据 |
| 状态 | supported / contradicted / unverified / not_verifiable |
| 证据强度 | supportStrength 与 contradictionStrength 分别记录；同一原子主张存在未解决冲突时 conflictFlag=true |
| 矛盾与替代解释 | 不得只记录支持证据 |
| 决策影响 | 预测、估值、条款、风险、投后或否决 |
| 依赖工件 | 受变化影响的文件和模型 |
| 证据截止与负责人 | 用于新鲜度判断和闭环 |

### Minimum cross-stream checks

| 共同主张 | 业务尽调 | 行业尽调 | 财务尽调 |
|---|---|---|---|
| 真实客户需求 | 访谈、使用、续约、流失 | 预算、采用、替代、采购 | 订单、回款、留存收入 |
| 真实主营业务 | 产品、合同、交付与资源 | 行业坐标与可比活动 | 收入、毛利和现金贡献分类 |
| 核心能力/壁垒 | 机制、指标、复制和依赖 | 竞品/替代、进入壁垒 | 定价、毛利、留存、投入回报 |
| 增长 | 销售、交付、产能、渠道 | 市场增长、渗透、份额 | 订单—收入—回款与驱动桥 |
| 单位经济 | 获客、交付、服务方式 | 行业价格和可比经济性 | 贡献毛利、回收期、现金消耗 |
| 预测 | 能力和执行前提 | 市场空间和竞争前提 | 三表、现金和承保值 |

If one stream cannot prove a shared claim, do not count the same management statement again in another stream.

### Send back immediately

- 财务收入分类与业务实际交付不一致：发回业务尽调并检查业务粉饰。
- 标的增长显著高于行业但没有份额、价格或并购解释：业务和行业共同重检。
- 业务声称标准化但毛利、实施人天或交付周期无改善：重检产品化程度。
- 行业规模变化或竞品出现使 SOM、价格或壁垒失效：重跑业务扩张假设、财务预测和回报。
- 回款、关联方、渠道库存、退货或资本化异常：重检客户需求、交易真实性和管理层诚信。
- 新法规、许可、技术平台政策或成本变化：重跑行业、业务持续经营、财务成本和现金情景。

### Freshness and invalidation

Every workpaper records `evidenceCutoff`, `dependencyVersion`, and `lastReviewedAt`. When new evidence:

1. changes a material claim's status, definition, or either-direction evidence strength;
2. creates an unexplained contradiction;
3. changes a key market, customer, price, cost, regulatory, or forecast parameter;

mark direct dependents `invalidated` or `requires_rerun`, then propagate to risk, returns, and the investment analysis report. Restore status only after the affected sections are reviewed and the treatment is recorded. Never silently overwrite an old conclusion.

### Joint completion

Finishing three workpapers separately is not joint completion. Joint completion requires:

- every material shared claim has evidence in all three streams, is explicitly not applicable, or is a visible gap;
- definitions, periods, entities, and source IDs agree;
- contradictions are resolved, conditioned, or sent to risk / a no-go;
- latest evidence has propagated; no material is newer than the workpaper that depends on it;
- forecasts and returns use only underwritten or explicitly scenario-ized inputs.

## Formal quality gate

This gate checks the business, industry, and financial workpapers. It does not replace an investment-committee judgment and does not pass merely because files exist.

### Per workpaper

Answer `通过 / 部分 / 不通过 / 不适用` for each item:

1. Required numbered sections are complete; not-applicable has a reason; missing evidence is `未核验`, not omitted.
2. The header contains project and perspective, workstream and status, date and inputs, evidence cutoff / dependency version, decision question, and conclusion.
3. Facts, management claims, estimates, assumptions, opinions, and model inferences are distinguished.
4. Material conclusions carry source ID, definition, period, scope, four-state claim status, support strength, contradiction strength, and conflict treatment.
5. Sampling discloses population, selection method, coverage, exception samples, and limits.
6. Contradictions, evidence gaps, impact, owner, priority, and next action are traceable.
7. Conclusions transmit into forecast, valuation, risk, terms, post-investment, or a no-go.
8. The workpaper is not older than its material dependencies; if it is, it is marked invalidated.

Do not label a workpaper `diligence-adjusted` if a material section is missing, or if a material claim is supported only by same-source management materials.

### Business gate

- 一句话真实业务和业务边界明确；
- 当前主营、非核心、邻近延伸和愿景已分开；
- 业务演进和重大转向有结果证据；
- 产品体系、定义、功能/结构/原理、技术指标和应用案例达到决策所需深度；
- 客户、销售、获客、采购、交付、研发、服务和盈利形成闭环；
- 商业模式元素做过逻辑一致性测试；
- 核心能力区分产品能力与交易能力，并有机制、指标、独立证据和失效条件；
- 客户、供应商、渠道、关键人、外包和平台依赖已量化或显式缺口。

### Industry gate

- 行业坐标与标的真实业务一致；
- 需求、付款、采购、采用和替代被分别验证；
- 历史阶段与当前拐点说明结构变化；
- 市场规模至少两条独立路径，公式、口径和差异可复算；
- 增长、渗透、驱动和约束有经济传导链；
- 价值链、利润池、议价和现金关系明确；
- 竞争结构覆盖直接、间接、内部自建、通用工具、人工和平台吸收；
- 趋势、技术和监管按状态、时间和影响区分；
- 行业结论已映射到标的份额、定价、毛利、销售周期和预测。

### Financial gate

- 实体、期间、币种、口径、会计政策和数据源已勾稽；
- 订单—交付—验收—发票—收入—回款桥已测试或明确无法测试；
- 增长速度、质量和驱动力均被覆盖；
- 核心与非核心收入、一次性项目、集中度、续约和现金贡献被拆分；
- 收入截止、关联方、渠道压货/退货、成本费用错分和资本化被测试；
- 毛利、费用、QoE 调整、营运资金、现金、债务、税务和内控有结论；
- 管理层预测、尽调调整和承保值有可追溯桥；
- 无收入项目使用早期路径，没有虚构增长指标；重大专业问题已建议第三方 FDD/税务支持。

### Script check vs human judgment

Run:

```bash
python3 ../../scripts/validate_project.py PROJECT --formal-diligence
```

When preparing Diligence Readiness:

```bash
python3 ../../scripts/validate_project.py PROJECT --formal-diligence --diligence-readiness
```

The script only checks structure, status, and some freshness fields. Evidence truth, judgment quality, sampling adequacy, and material exceptions remain the investment team's responsibility.
