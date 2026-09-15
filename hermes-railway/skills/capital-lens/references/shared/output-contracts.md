# Output Contracts

## Language

Write every user-facing document in the user's language. Detect the language from the user's messages, or use a language they explicitly request.

Keep one language throughout each document. Title, headings, subheadings, table headers, labels, body, and summaries must all be in that language. Do not mix languages — for example English headings with Chinese body.

Skill templates, section keys, and English examples are structural guides, not copy-paste text. Translate headings and prose into the user's language. Keep machine-readable codes (status enums, source IDs, file paths) and verbatim quotations in their original form.

## Control files

Each managed project uses only:

- `00-control/PROJECT_STATE.json`: machine-readable state and invalidation graph.
- `00-control/PROGRESS.md`: user-readable progress, decisions, blockers, artifacts, and next action.

Do not create separate decision-log or artifact-index files unless a user explicitly requests them.

## Workpaper header

Every principal Markdown workpaper includes:

- project and perspective;
- workstream and status;
- date and inputs used;
- decision question;
- conclusion;
- verified facts;
- assumptions and estimates;
- contradictions and evidence gaps;
- implications and next actions;
- sources or source IDs.

## Artifact status

Use one of:

- `indicative`: assumption-heavy and suitable only for scoping.
- `working`: analysis is active and may change.
- `diligence-adjusted`: material inputs have been checked, with residual gaps disclosed.
- `decision-frozen`: tied to a named evidence version and gate decision.
- `invalidated`: a dependency changed; do not rely on the artifact until rerun.

## No false completion

Document completion and evidence readiness are independent. A completed workpaper may still be `partial`, `not_passed`, or unsuitable for a decision.
