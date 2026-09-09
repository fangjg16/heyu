# Project Intake

Use in Phase 1. Create or update the two control files and `01-intake/project-brief.md`. Preserve unknown economics as unknowns.

Before writing a new brief, read any screening artifacts that exist:

- `00-control/PROJECT_STATE.json` (`pipelineStatus`, `decisions`)
- `01-intake/project-brief.md`
- `01-intake/theme-classification.md` and `01-intake/investment-theme-coordinate.json`
- `02-screening/screening-memo.md` and `02-screening/enrichment.md`
- `02-evidence/source-register.md`

Then:

| Situation | Intake action |
|---|---|
| Team recorded `continue`; pipeline is or becomes `due-diligence` | Inherit identity, theme, source IDs, and claims. Change the decision question to whether to invest, at what value and conditions. Seed `03-diligence/diligence-request-list.md` from unanswered screening questions. Public enrichment is prior evidence; later workpapers may revise it if they state the difference. Dimensions marked `misses` must be addressed, not ignored. |
| Pipeline is still `deal-screening` (waiting on answers) | Do not open formal diligence workpapers unless the user explicitly overrides. Record which open questions remain. |
| Pipeline is `declined` | Warn that the team declined at screening. Continue only if the user explicitly reopens diligence, and log that override. |
| No screening memo, user asked for diligence, valuation, IRR, or IC materials | Proceed. Write a thin brief, set `pipelineStatus` to `due-diligence`, and record `screeningSkipped` with a reason in `PROGRESS.md` and `decisions[]`. |
| No screening memo, user only dropped a description or BP | Switch to `deal-screening`. |

Capture the decision question, project identity, proposal, source package, known facts, unknowns, initial claims, material contradictions, and useful next workstreams. Missing price, cheque size, target return, holding period, or risk appetite are normal unknowns, not blockers. If a workspace `classification.json`, CapitalLens `investment-theme-coordinate.json`, or `sources/source-register.json` exists, read it and reuse applicable labels or `sourceId` values without overwriting the workspace classification.

When screening already produced `01-intake/project-brief.md`, update it: add the investment decision question, unknown terms, and inherited open questions. Do not invent a second, conflicting project story.

Create or update `00-control/PROJECT_STATE.json`, `00-control/PROGRESS.md`, and `01-intake/project-brief.md`. Assign stable IDs to claims and sources. Mark any early economics `indicative`. Evidence collection may continue while screening questions are open; opening the three formal diligence workpapers waits on `continue` or an explicit skip.

Record the perspective as `financial-investor`. If the actual question is how to start a company, recommend the sibling Startup plugin instead of silently changing perspective.
