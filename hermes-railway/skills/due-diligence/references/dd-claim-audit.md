# Claim Audit

Use in Phase 4. Read this file and `references/shared/evidence-contract.md` before auditing. Update `03-diligence/claim-audit.md` and the structured claims in `PROJECT_STATE.json`. Do not write a fourth general diligence report.

Audit only material claims: claims that can change value, risk, transaction feasibility, or recommendation. The exact vocabulary and field definitions are governed by `references/shared/evidence-contract.md`.

## Atomic claims

One claim must express one falsifiable proposition for one defined entity, period, geography, and metric or fact. Split a composite claim before assigning a status. Each record should contain:

- claim ID, exact wording, claim type, origin, scope, and decision use;
- supporting and contradicting source IDs;
- current status, `supportStrength`, `contradictionStrength`, and `conflictFlag`;
- open questions, status rationale, status history, and affected artifacts.

## Status decision

Use only these four claim statuses:

- `supported`: sufficient reliable evidence supports the atomic claim and no material unresolved contradiction remains.
- `contradicted`: sufficient reliable evidence disproves or materially negates the atomic claim.
- `unverified`: verification remains open, evidence is absent or insufficient, or reliable support and contradiction remain unresolved. For the last case set `conflictFlag: true`.
- `not_verifiable`: the claim cannot reasonably be verified under the available method, access, or evidence boundary. Record why and what would make it verifiable.

Missing evidence or an unperformed procedure is `unverified`; the request or test record carries the workflow status. Do not use `mixed`, `partially_supported`, `unsupported`, `not_tested`, or `superseded` as claim statuses.

## Evidence strength and history

Record support and contradiction independently. Do not assign a generic confidence score to a claim. Explain the status in `statusRationale`, including source quality, independence, coverage, and unresolved limitations.

When new evidence changes the assessment of the same atomic claim, append the prior assessment to `statusHistory`, update the current status, and invalidate dependent artifacts. When wording, scope, definition, entity, or period changes, create a new claim and preserve the relationship through `validTo` and `replacedBy`; replacement is metadata, not a status.

Update `03-diligence/claim-audit.md`, structured project-state claims, and affected dependencies. Do not create a fourth narrative diligence report.
