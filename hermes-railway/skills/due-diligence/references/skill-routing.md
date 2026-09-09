# Skill Routing

CapitalLens has two workstream skills plus an entry router. Read this before opening a workstream. Do one skill at a time.

| Situation | Skill |
|---|---|
| User attached this plugin, said “帮我看看 / 值不值得投资 / 能不能投 / deal screening / 筛选 / 初筛”, or dropped a description or BP with no screening memo | `deal-screening` |
| Screening memo exists and the team recorded `continue`, or the user named 尽调、估值、IRR、投资风险、投委会材料 | `due-diligence` |
| Identity, UBO, affiliation, or adverse-record deep dive | `due-diligence` (Phase 3B only) |

Rules:

1. `deal-screening` is the default first skill for a new project.
2. `due-diligence` does not contain a screening mode. Do not run theme classification, four-wave enrichment, or a screening verdict inside diligence.
3. If the user named deal screening, stay in `deal-screening` until that memo is drafted.
4. Only a person moves pipeline from `deal-screening` to `due-diligence`.
5. Background check is Phase 3B of `due-diligence`, not a separate skill. A request that names only 背景调查 / 查实控人 / UBO / 关联方 / 负面记录 opens diligence and runs Phase 1 if needed, then only Phase 3B.
