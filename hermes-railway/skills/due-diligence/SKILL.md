---
name: due-diligence
description: 财务投资人正式尽调与投委会材料。这不是 deal screening，技能内没有筛选模式。在已有筛选备忘录且团队决定 continue 之后，或用户明确要求做尽调、写尽调报告、估值、IRR、投资风险、投委会材料、背景调查、查实控人、UBO 时使用。开展业务尽调、身份/股权/关联方/负面记录深潜、财务/行业尽调与持续经营合规筛查、主张核验、估值与投资人回报、投资风险登记、九域投资分析报告。用于“做尽调”“写尽调报告”“估值”“IRR”“投资风险”“投委会材料”“资料清单”“主张核验”“背景调查”“查实控人”“UBO”“关联方”“负面记录”“background check”“KYC”。用户只点名背景调查时打开本技能并只跑 Phase 3B。用户说 deal screening、“帮我看看”“值不值得投资”“能不能投”但还没有筛选备忘录时，先走 deal-screening，不要在本技能里模拟筛选。 Works standalone when the user explicitly asks for diligence.
---

# Due Diligence

A structured, multi-phase skill that takes an investment opportunity from a screening handoff — or from a raw source package when the user explicitly asks for diligence — to an IC-ready recommendation.

This is not deal screening. There is no screening mode inside this skill. If the user asked for deal screening, 筛选, 初筛, or “帮我看看 / 值不值得投资” and `02-screening/screening-memo.md` does not exist, stop and open `deal-screening`. Do not write a screening verdict, four-wave enrichment, or theme classification here.

The default first skill for a new project is `deal-screening`. Use this skill when a screening memo already exists and the team continued, or when the user names diligence, valuation, IRR, risk, IC materials, or a background check. The decision is: can we invest, is the expected return worth the risk, and under what value and conditions?

> **Route table:** Read `references/skill-routing.md` before Phase 0.

Diligence is one segment of that work (Phases 2–5): it verifies the material propositions the decision rests on. Underwriting returns, registering investment risk, and synthesizing the report consume diligence output; they do not produce new verified facts. Domain 9 of the report is the recommendation.

Three layers stay separate: science (definitions, evidence, calculations, falsifiable claims); judgment (business essence, core capability, how deep this decision justifies); responsibility (risk appetite and the final IC decision). AI assists; humans decide.

## How It Works

The process has numbered phases. Each phase produces output files and updates the progress tracker. If a session is interrupted, resume from the last incomplete phase.

```
RESUME → INTAKE → SCOPE / REQUESTS → DILIGENCE LOOP → CLAIM AUDIT → CROSS-CHECK → RETURNS → INVESTMENT RISK → INVESTMENT ANALYSIS REPORT
```

The middle is an iterative loop, not a waterfall:

- business diligence raises questions;
- background check tests identity, ownership, affiliation, and adverse records when triggered;
- financial diligence quantifies them;
- industry diligence evaluates them externally;
- compliance screens going-concern, rights, and permission issues;
- unresolved or adverse findings later transmit into returns, terms, and the report conclusion.

## Heyu Runtime Convention

Read `references/project-structure.md` and `references/gate-rules.md` at the start of a managed project. In this distribution, `PROGRESS.md` means `00-control/PROGRESS.md`; also maintain `00-control/PROJECT_STATE.json`. These are the only control files. Keep workpapers in their stage folders. Do not demand investment amount, target return, holding period, or risk preference when they are unknown. If the real question is how to found a company, recommend Startup instead of silently changing perspective.

> **Shared contracts:** Read `references/shared/operating-loop.md`, `references/shared/evidence-contract.md`, `references/shared/source-grading.md`, and `references/shared/output-contracts.md` at the start of a managed project.

### Language

Follow the Language rule in `references/shared/output-contracts.md`. Write workpapers and the investment analysis report in the user's language. If the user writes in Chinese, use Chinese for all diligence outputs — including titles, headings, subheadings, table headers, labels, and body. Skill-template headings in English are structural labels; translate them. Do not mix English headings with Chinese prose.

## Conclusion standard

Every material conclusion must have all four:

1. a clear definition;
2. an evaluable standard;
3. evidence;
4. a reason this item is being tested (its place on the diligence logic tree).

Do not treat ambition, relationship, unreplicable instinct, or unsourced expert endorsement as diligence findings. Vague traits such as “情怀” are out of scope unless they reduce to a falsifiable integrity or capability claim.

## Proportionality

Cover every important dimension (breadth). Deepen only the items that can change value, risk, terms, or a no-go (depth). Time and cost force this allocation. Checking everything lightly is a failure mode.

> **Principles:** Read `references/dd-principles.md` before scoping requests, running the diligence loop, or declaring Diligence Readiness. It defines workstream boundaries, shared-claim checks, invalidation, and the formal quality gate.

---

## Phase 0: Resume Check

Before anything else, check if `00-control/PROGRESS.md` exists. If it does, read it with `PROJECT_STATE.json`.

If no progress file exists, this is the first run. Look for `02-screening/screening-memo.md` before assuming a blank project. Start from Phase 1 and execute every subsequent phase in order through Phase 8. Do not skip. A first-run request for valuation, IRR, a report, or IC materials is not a shortcut — run the full pipeline.

Exception: a first-run request that names only background check, UBO, 查实控人, related parties, or adverse-record screening runs Phase 1 then only Phase 3B. Do not continue into financial or industry workpapers or the report unless the user asked for those too.

If progress exists, tell the user: "I found progress from a previous session. You completed [phases]. Picking up from [next phase]." Then:

- if the user asked to continue, resume from the last incomplete phase;
- if the user asked to update completed work (valuation, IRR, price, risk, the report, a named workpaper, or background check / UBO / 查实控人), run only that phase and any dependents the change invalidates.

### Output

No new files. Tell the user this is a first run starting at Phase 1, or what is already done and what comes next.

---

## Phase 1: Intake

> **Reference:** Read `references/project-intake.md`.

Capture the decision question, project identity, proposal, source package, knowns, unknowns, initial claims, and contradictions.

Unknown economics are unknowns, not blockers. Inherit screening artifacts when they exist. Start evidence collection and the relevant diligence workstreams in the same session. Formal diligence workpapers start after a team `continue` on the screening memo, or after the user explicitly asks to skip screening.

If there is no screening memo, and the user said “帮我看看 / 值不值得投资 / 能不能投 / 看这个项目” without naming diligence, valuation, IRR, or IC materials, switch to `deal-screening` instead of beginning this pipeline.

If the real question is how to found a company, recommend Startup instead of silently changing perspective.

### Output

- `00-control/PROJECT_STATE.json`
- `00-control/PROGRESS.md`
- `01-intake/project-brief.md`

Update PROGRESS.md. Mark Phase 1 complete.

---

## Phase 2: Scope and Requests

> **References:** Read `references/dd-checklist.md` and the workstream-boundary section of `references/dd-principles.md`.

Maintain `03-diligence/diligence-request-list.md`. Each request states the claim it tests, expected evidence, workstream, priority, owner, status, and decision consequence if unresolved. The list is not a diligence report and must not contain substantive conclusions.

### Output

- `03-diligence/diligence-request-list.md`

Update PROGRESS.md. Mark Phase 2 complete.

---

## Phase 3: Diligence Loop

Run the five workstreams as a loop. Any stream may request more evidence or invalidate another. Re-run only affected sections. Preserve versions.

> **Cross-stream rules:** Read the shared-claim section of `references/dd-principles.md` whenever a material claim is shared across streams.

Business raises the question → background check tests who actually controls the target when identity, ownership, affiliation, or adverse-record signals appear → finance quantifies it → industry evaluates it against external evidence → compliance checks whether the business can continue to operate and whether investor rights are intact. Example: management claims a leading product; business defines product, customer, use case, and metrics; background check resolves controllers and related parties if the baseline screen raised a signal; finance tests margin, orders, delivery, R&D spend, and collection; industry compares on the same definition; compliance checks IP, licences, data, key people, and operating qualifications.

### 3A Business

> **Reference:** Read `references/dd-business.md`.

Understand the real business and the core capability (product capability and/or transaction capability). Define the business in one sentence with customer, function, and product form. Separate current core, non-core, adjacent, vision, and stopped activities. Do not omit a material section: label missing evidence `未核验`.

If identity, ownership, affiliation, adverse-record, disclosure-integrity, or related-party signals appear, run Phase 3B in the same loop. Do not open a separate skill.

### 3B Background check

> **Reference:** Read `references/dd-background-check.md`.

Identity, ownership, affiliation, and adverse-record deep dive. Business diligence keeps the baseline org / people screen; this step goes deeper. Run it when the user named background check, UBO, 查实控人, related parties, or adverse records, or when 3A or a screening memo left a documented signal that could affect value, governance, feasibility, or investor rights.

When a full diligence loop reaches this step and no material signal exists, record the baseline-screen result in business diligence and do not create `03-diligence/background-check.md`. When the user invoked this phase directly, always write the workpaper. A name-only match is never a finding. Feed validated findings back into claims, sources, business diligence, financial related-party tests, and later into risk.

### 3C Financial

> **Reference:** Read `references/dd-financial.md`.

Quantify growth speed, growth quality, and growth drivers. Reconcile order → delivery → revenue → collection. Identify presentation risk, liquidity, tax, related parties, and control issues that can change the investment. This is investor-side analysis, not an audit opinion.

### 3D Industry

> **Reference:** Read `references/dd-industry.md`.

Place the target on an industry coordinate system and test demand, history, size, growth, value chain, structure, participants, trends, and regulation. Industry diligence is not generic industry research; it exists to raise the odds of a correct investment decision. Operating comparables belong here; valuation multiples belong in Phase 6.

When external evidence is missing, search in the same run. Follow `references/shared/source-grading.md`. Do not hand off collection to a separate search skill.

### 3E Compliance / going-concern screen

> **Reference:** Read `references/dd-legal.md`.

Screen licences, approvals, filings, industry access, privacy/data, cross-border rules, platform rules, and continuing obligations only to the extent they affect continued operation, investor rights, value, or deal feasibility. Not general legal advice or contract review. Feed material findings into the owning workpapers, the request list, and later into risk and returns. There is no separate compliance file.

### Output

- `03-diligence/business-diligence.md`
- `03-diligence/financial-diligence.md`
- `03-diligence/industry-diligence.md`
- `02-evidence/source-register.md` — update when new sources are collected
- `03-diligence/background-check.md` — only if Phase 3B ran a triggered deep dive

Update PROGRESS.md after each loop that changes a material conclusion.

---

## Phase 4: Claim Audit

> **References:** Read `references/dd-claim-audit.md` and `references/shared/evidence-contract.md`.

Split composite statements into atomic claims. Use only `supported`, `contradicted`, `unverified`, and `not_verifiable`. Record support and contradiction strength independently. An unresolved conflict on the same atomic claim is `unverified` with `conflictFlag: true`. Do not write a fourth narrative diligence report.

### Output

- `03-diligence/claim-audit.md`
- claims in `00-control/PROJECT_STATE.json`

Update PROGRESS.md. Mark Phase 4 complete.

---

## Phase 5: Cross-Check and Quality Gate

> **References:** Read the shared-claim and quality-gate sections of `references/dd-principles.md`.

Before treating diligence as complete or Diligence Readiness as passed:

- shared claims agree across streams or disclose conflict;
- no material dependency is newer than the workpaper that relies on it;
- every `未核验` / `部分核验` item has owner, impact, and next action;
- `scripts/validate_project.py PROJECT --formal-diligence --diligence-readiness` is necessary but not sufficient when run from this skill directory.

A finished document does not prove its claims. Diligence Readiness is a CapitalLens gate, not a licence to stop collecting evidence.

### Output

- `03-diligence/diligence-readiness.md`
- `diligence-readiness` gate status in `00-control/PROJECT_STATE.json`

Update PROGRESS.md. Mark Phase 5 complete.

---

## Phase 6: Returns

> **Reference:** Read `references/returns-analysis.md`.

Underwrite investor cash flows, value, and price. Do not repeat historical accounting validation. Unknown cheque, price, or hold period are inputs to solve for, not reasons to skip the phase. Label `indicative` or `diligence-adjusted` honestly.

This step prepares domain 6 of the investment analysis report. Domain 6 itself is written in Phase 8.

### Output

- `04-underwriting/valuation-and-returns.md` — only when cash-flow tables need a versioned working model
- `04-underwriting/sensitivity-and-scenarios.md` — only if sensitivities must stand alone

Update PROGRESS.md. Mark Phase 6 complete.

---

## Phase 7: Investment Risk

> **Reference:** Read `references/risk-matrix.md`.

Translate diligence and Phase 6 findings into an investment risk register: failure mode, evidence, economic transmission, probability/impact, mitigation, residual risk, owner, trigger, stop condition, and decision consequence. Include growth, durability, financial quality, people/governance, ownership/regulatory, transaction, and exit risks. Compliance findings belong here only insofar as they change continued operation, rights, value, or deal feasibility.

This step prepares domain 7 of the investment analysis report. Do not write a standalone risk file; Phase 8 presents the register in domain 7.

### Output

No separate risk file. The register is written into domain 7 of `05-decision/investment-analysis-report.md` in Phase 8.

Update PROGRESS.md. Mark Phase 7 complete.

---

## Phase 8: Investment Analysis Report

> **References:** Read `references/dd-synthesis.md`.

Write `05-decision/investment-analysis-report.md` using the nine investor domains and four appendices. This is the synthesis step — the analogue of Startup's research synthesis — not a substitute for the three workpapers. Present Phase 6 in domain 6 (`investment-structure-returns`) and Phase 7 in domain 7 (`investment-risks`); do not create second returns or risk narratives.

Completing the report does not move the project to `ic-review`. Keep `pipelineStatus: due-diligence` until an analyst explicitly records `submit_for_ic` in `decisions[]`; only then may the state move to `ic-review`. Only a person may later set `invested` or `declined`.

Domain 9 is the recommendation. Use one of: `Proceed`, `Proceed with conditions`, `Renegotiate`, `Defer`, or `Reject`. A conditional recommendation must name every condition. Do not hide conditions or treat an AI judgment as the final responsibility. If domain 6 is empty and the decision depends on value or cash-flow, run Phase 6 first.

If the user supplied raw files and no workpapers, inventory sources, extract claims, distinguish project-party statements from verified facts, and populate every domain the evidence supports. Missing workpapers are not a reason to return an empty shell. Still apply `references/returns-analysis.md` and `references/risk-matrix.md` when filling domains 6 and 7.

Do not emit HTML or a separate knowledge-base file.

### Output

- `05-decision/investment-analysis-report.md`

Update PROGRESS.md. Mark Phase 8 complete.

---

## Honesty Protocol

> **Reference:** Read `references/honesty-protocol.md` at the start of every session for the full protocol and anti-pattern table. The key rules are summarized here.

This skill helps the team reach a correct decision, not close a deal. Honesty is non-negotiable across all phases:

1. **Deal momentum is not evidence.** Sunk diligence cost, a partner's enthusiasm, and a late-stage timeline never move a claim's status.
2. **A management statement is not a fact.** It is a target-origin claim; same-source repetition across workpapers is not corroboration.
3. **A blank cell beats a guess.** Missing but obtainable evidence is `未核验` / `unverified` with owner, impact, and next action. Use `not_verifiable` only when the claim cannot reasonably be tested within the stated access or method boundary.
4. **Label report status honestly.** `working`, `indicative`, or `diligence-adjusted` by what the evidence supports. A finished document does not prove its claims.
5. **Don't reverse-engineer the answer.** Underwrite returns from evidence; never solve backwards from a target IRR or an agreed price.
6. **Disclose conflicts.** An unresolved contradiction is `unverified` with `conflictFlag: true`, not a silent choice of the convenient source.
7. **Give a clear verdict and name every condition.** Hiding conditions to make domain 9 read cleanly is a serious failure.
8. **Identity matching is not character analysis.** When Phase 3B runs, follow `references/dd-background-check.md`. A name-only match is never a finding. Allegation, investigation, proceeding, judgment, regulatory finding, settlement, and conviction are different facts. Disclose search coverage; a clean report from a narrow search is misleading.

Every workpaper and the investment analysis report end with a **Flags** section (Red / Yellow, or "No flags identified"). Flags are an early-warning surface, not a replacement for the Phase 7 risk register.

---

## Reference Files

Read only what the current phase needs.

| File                         | When to read     | Purpose                                                             |
| ---------------------------- | ---------------- | ------------------------------------------------------------------- |
| `honesty-protocol.md`        | Start of session | Claim labelling, flags, verdict discipline, anti-patterns           |
| `project-intake.md`          | Phase 1          | Brief, knowns/unknowns; inherit screening when present              |
| `dd-principles.md`           | Phases 2–5       | Workstream boundaries, shared-claim checks, Diligence Readiness     |
| `dd-checklist.md`            | Phase 2          | Request list; no substantive conclusions                            |
| `dd-business.md`             | Phase 3A         | Real business and core capability                                   |
| `dd-background-check.md`     | Phase 3B         | Identity, UBO, affiliation, and adverse-record deep dive            |
| `dd-financial.md`            | Phase 3C         | Growth speed, quality, drivers, financial risk                      |
| `dd-industry.md`             | Phase 3D         | External test of the business                                       |
| `dd-legal.md`                | Phase 3E         | Going-concern legal/regulatory screen                               |
| `dd-claim-audit.md`          | Phase 4          | Four-state atomic claims                                            |
| `returns-analysis.md`        | Phase 6          | Investor cash flows, value, and price; presented as report domain 6 |
| `risk-matrix.md`             | Phase 7          | Investment risk register; presented as report domain 7              |
| `dd-synthesis.md`            | Phase 8          | Nine-domain outline, coverage floor, and Markdown template          |
