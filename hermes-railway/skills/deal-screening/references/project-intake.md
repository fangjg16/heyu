# Project Intake

Use in Phase 1. Create or update the two control files and `01-intake/project-brief.md`. A written description of the prospective investment is sufficient. Files, links, and decks are optional.

Capture:

- project name and any legal or trading names;
- one-sentence economic essence: the target reaches [customer] with [product/service] through [activity/asset] and is paid by [revenue source]. Write “输入未说明” for any missing part;
- source list with stable `sourceId` values (the user’s text is itself a source);
- claims made by the target, introducer, or user, kept distinct from public facts;
- contradictions or statements that already look internally inconsistent;
- knowns and unknowns;
- the decision question: whether formal diligence is worth starting now.

Missing price, cheque size, target return, holding period, or risk appetite are normal unknowns. Do not block intake on them. Do not score the project against a family-office mandate, sector preference, ticket size, or geography filter.

If a workspace `classification.json`, CapitalLens `01-intake/investment-theme-coordinate.json`, or `02-evidence/source-register.md` / `sources/source-register.json` already exists, read it and reuse applicable labels or `sourceId` values. Never overwrite the workspace classification.

Set `plugin` to `capitallens`, `perspective` to `financial-investor`, and `pipelineStatus` to `deal-screening`. Add workstream `deal-screening` with status `in_progress`. Keep `gates.diligence-readiness` at `not_started`.

Create only the two control files and `01-intake/project-brief.md` in this phase. Assign claim IDs when a material statement will be scored or asked about later.

The brief follows `references/shared/output-contracts.md`. Status: `indicative` or `working`.
