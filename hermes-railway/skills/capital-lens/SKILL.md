---
name: capital-lens
description: Heyu CapitalLens 入口分流。用户使用本插件、说“帮我看看”“值不值得投资”“能不能投”“deal screening”“筛选”“初筛”，或丢来项目描述/BP 且未点名尽调报告、估值、IRR、投委会时，立即转到 deal-screening，不要在本技能里做分析。已有筛选备忘录且团队 continue，或用户明确要求尽调/估值/IC 时，转到 due-diligence。背景调查、查实控人、UBO、关联方、负面记录也转到 due-diligence（只跑 Phase 3B）。本技能只分流，不写筛选稿，不写尽调报告。
---

# CapitalLens Entry

This skill only chooses the next CapitalLens skill. It does not score a deal, write a memo, or run diligence.

> **Route table:** Read `references/skill-routing.md` and follow it.

## Dispatch

1. Read `00-control/PROJECT_STATE.json` if it exists.
2. Choose exactly one skill from the route table.
3. Tell the user which skill you are opening and why.
4. Open that skill and stop using this file.

Default for a new project, a thin description, “值不值得投资”, or any wording that includes deal screening / 筛选 / 初筛: `deal-screening`.

A request that names only 背景调查 / 查实控人 / UBO / 关联方 / 负面记录: `due-diligence` (Phase 3B only).

Do not implement four-wave research, dimension scores, valuation, or an investment-analysis report here.
