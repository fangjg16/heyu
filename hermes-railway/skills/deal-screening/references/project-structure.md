# CapitalLens Project Structure

```text
project/
├── 00-control/
│   ├── PROJECT_STATE.json
│   └── PROGRESS.md
├── 01-intake/
│   ├── project-brief.md
│   ├── theme-classification.md
│   └── investment-theme-coordinate.json
├── 02-screening/
│   ├── enrichment.md
│   └── screening-memo.md
├── 02-evidence/
│   ├── source-register.md
│   ├── evidence-synthesis.md
│   └── verification-report.md
├── 03-diligence/
│   ├── diligence-request-list.md
│   ├── business-diligence.md
│   ├── industry-diligence.md
│   ├── financial-diligence.md
│   ├── claim-audit.md
│   └── diligence-readiness.md
├── 04-underwriting/
│   ├── valuation-and-returns.md
│   └── sensitivity-and-scenarios.md
└── 05-decision/
    └── investment-analysis-report.md
```

Create only relevant files. Do not generate empty workpapers merely to complete the tree. Once a business, industry, or financial workstream is opened, however, its formal workpaper must preserve all required sections; missing evidence is recorded inside the section rather than causing the section to disappear. Every principal workpaper follows `shared/output-contracts.md`. Create `03-diligence/background-check.md` only when Phase 3B runs a triggered identity / ownership / adverse-record deep dive.

`02-screening/` and `02-evidence/` are siblings. Screening writes the first source IDs; diligence reuses them.

## Pipeline status

`PROJECT_STATE.json` carries `pipelineStatus`:

```text
inbound → deal-screening → due-diligence → ic-review → invested | declined
```

The agent may move a project from `inbound` to `deal-screening`. Only a person may move screening to `due-diligence` via a recorded `continue` (or `screeningSkipped`), move completed analysis from `due-diligence` to `ic-review` via a recorded `submit_for_ic`, or set `invested` or `declined`. Every `decisions[]` record uses `decisionId`, `action`, `decisionMakerType` (`analyst` or `human`), `decidedAt`, and `rationale`. Without the applicable human decision, keep the current pipeline status. Pipeline status is not Diligence Readiness.

`investment-theme-coordinate.json` is CapitalLens analytical output. If `heyu-workspace` provides `classification.json`, read it as an input and explain any difference, but never overwrite it or present the CapitalLens coordinate as the website project-card classification.

## Economics status

If sufficient data exists early, create `valuation-and-returns.md` as `indicative`. Evidence collection and diligence never depend on it. Update the same workpaper to `diligence-adjusted` when material inputs have been checked.

## Progress

`PROJECT_STATE.json` is machine-readable. `PROGRESS.md` explains current workstreams, decisions, blockers, artifacts, invalidations, and the next useful action. Do not create separate logs or indexes by default.
