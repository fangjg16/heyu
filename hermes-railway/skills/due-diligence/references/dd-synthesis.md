# Investment Analysis Report Synthesis

Use in Phase 8. The deliverable is one Markdown investment analysis report: `05-decision/investment-analysis-report.md`. It synthesizes intake, evidence, the three diligence workpapers, claim audit, Phase 6 returns, and the Phase 7 risk register into nine investor domains and four appendices. Domain 6 is the returns analysis; domain 7 is the risk register; domain 9 is the recommendation. It is not a document inventory, not an HTML knowledge base, and not a substitute for the workpapers.

Workpapers remain independent source artifacts. This file is the outline, the coverage floor, and the writing protocol for that single report.

## Before writing

1. Read `00-control/PROJECT_STATE.json` and `00-control/PROGRESS.md` when they exist.
2. Read every available workpaper and evidence file before drafting: project brief, theme classification, screening memo, enrichment, source register, business/industry/financial diligence, claim audit, request list, and any prior report. Apply `returns-analysis.md` when assembling domain 6 and `risk-matrix.md` when assembling domain 7. The report should be able to retrace screening verdict, dimension scores, open questions, and the human decision that moved pipeline to diligence. Screening claims stay screening-grade until diligence re-tests them.
3. Look for patterns that repeat across workstreams.
4. Identify contradictions — keep both sides visible, cite sources, and do not pick the convenient version silently.
5. Route each conclusion to one primary domain and cross-reference related domains.
6. Do not invent missing coverage. When evidence is absent, state the exact evidence needed, why it matters, and what conclusion it unlocks.

## Mode selection

### Direct first-pass generation

Use when the user supplies decks, PDFs, spreadsheets, links, or prior analyses but no complete workpaper set.

1. Inventory every input and assign source IDs.
2. Extract material claims, numbers, definitions, dates, entities, transaction terms, and contradictions.
3. Mark each item as project-party statement, independent fact, analyst calculation, analyst inference, assumption, or unresolved gap.
4. Populate every domain that the evidence supports. Missing workpapers are not a reason to return an empty shell.
5. Add specific missing-evidence rows rather than leaving supported domains as generic stubs.

Direct generation may be `working` or `indicative`. It is not Diligence Readiness.

### Workpaper synthesis

Use when business, industry, financial, or claim-audit workpapers already exist.

1. Resolve changed claims and invalidated dependents.
2. Preserve conclusion, evidence, contradiction, gap, and decision implication.
3. Prefer workpaper conclusions over marketing language in source decks.
4. Keep one authoritative statement when a fact appears in several domains; use concise cross-references instead of duplicate paragraphs.

### Incremental refresh

Update only affected sections, appendix rows, and the version ledger. Never silently overwrite a decision-frozen conclusion.

## Quality sequence

1. **Coverage** — evidence-supported parts of all nine domains are populated.
2. **Logic** — business, financial, industry, ownership/compliance, returns, risk, and decision claims agree or disclose conflict.
3. **Evidence** — material facts have inline source IDs and the source index contains each ID.
4. **Structure** — follow the nine-domain template below; use tables where comparison, registers, or numbers matter.
5. **Decision usefulness** — show implications, missing evidence, downside, conditions, and next action.

Keep presentation quality separate from readiness. A complete report may still conclude `not ready`.

## Nine domains

The nine domains are top-level information boundaries, not nine generic prose boxes. Preserve useful granularity through subsections, tables, and one mechanism diagram where it helps.

Each domain heading records one of: `populated`, `partial`, `stub`, `invalidated`, or `empty`. `populated` describes available content, not decision readiness.

Every domain section includes:

- status;
- a concise analytical conclusion;
- domain-specific subsections and tables;
- precise evidence gaps when the source package cannot answer required questions.

Material facts carry inline source IDs. Every cited ID must exist in the source appendix.

| Key | Title | Boundary |
|---|---|---|
| `project-summary` | 项目概况 | company, project, transaction stage, key numbers, proposal summary, investment logic |
| `industry-competition` | 行业与竞争 | industry definition, demand, size, growth, value chain, structure, competitors, operating comparisons |
| `business-technology` | 业务与技术 | products, technology, business model, customers, suppliers, delivery, revenue logic, core capability |
| `company-team` | 公司与团队 | entity, ownership, history, subsidiaries, management, employees, governance and integrity evidence |
| `financial-diligence` | 财务研究 | growth speed, quality and drivers, order-to-cash, margins, cash, working capital, debt, QoE and financial risks |
| `investment-structure-returns` | 投资方案与收益预测 | investment structure, terms with economic effect, valuation, scenarios, IRR, MOIC, sensitivities and exits |
| `investment-risks` | 投资风险 | growth and continued-operation risks, evidence, economic transmission, mitigation, owner and stop conditions |
| `diligence-gaps` | 待解决问题 / 待提供资料 | claims, contradictions, requests, owner, priority, blocker and status |
| `investment-conclusion` | 结论 | recommendation, conditions, counterarguments, IC readiness, human decisions and next action |

Appendices:

- `source-index`: source register and authoring-party independence.
- `glossary`: terms required for a non-specialist IC reader.
- `data-dictionary`: formulas, model assumptions, transformations, sample scope, and data lineage.
- `version-ledger`: evidence version, workpaper version, decision freezes, invalidations, and changes.

## Coverage by domain

### 1. `project-summary` - 项目概况

Cover company/project identity, jurisdiction, stage, counterparties, what is being financed or acquired, actual business in one sentence, current proposal or ask, headline operating/financial figures, investment logic, key contradiction, current decision posture, and the single most important gate.

Recommended sub-sections: key facts, target/asset perimeter, proposal, investment highlights, and headline caveat.

### 2. `industry-competition` - 行业与竞争

Cover industry definition and logic, demand, market size and scope, development history, current state, trends, policy background, value chain, competitive structure, named participants and substitutes, operating comparables, evidence limitations, and implications for this target.

Operating/strategic comparisons belong here. Valuation multiples and precedent transaction value implications belong in `investment-structure-returns`.

### 3. `business-technology` - 业务与技术

Answer what the company really sells, to whom, in what form, through which process, and why it can earn and scale.

Cover product system and definition, use cases, technology principle and core indicators, R&D/IP evidence, marketing/procurement/production/R&D/profit models, customer and supplier structure, delivery and order-to-cash mechanism, pricing, costs, unit economics, operating KPIs, bottlenecks, core capability, business reality versus distant plan, and unverified assumptions.

Use one useful mechanism visual in Markdown — Mermaid journey, process flow, revenue tree, value chain, flywheel, or ecosystem map — then verify it with tables. A diagram alone is not diligence.

### 4. `company-team` - 公司与团队

Cover legal entity and business history, ownership/UBO, financing history, subsidiaries and associated entities, organization, core management and key people, team evidence and counter-evidence, employee composition/turnover where material, important external resources, related parties, rights ownership/transferability, and integrity/background findings.

Do not turn biographies or management self-description into verified judgments. State the source and observable facts behind team conclusions.

### 5. `financial-diligence` - 财务研究

Cover growth and its drivers, order-delivery-revenue-collection reconciliation, revenue mix/quality/concentration/cut-off, gross margin and cost classification, normalized earnings, operating expense, working capital, cash conversion, debt and debt-like items, capex, tax, related parties, internal controls, forecast bridge, data limitations, and financial risks.

If audited or source data is unavailable, show the available figures as project-party claims and create a specific reconciliation plan. Do not replace the section with “待财务尽调”.

### 6. `investment-structure-returns` - 投资方案与收益预测

This domain presents the Phase 6 analysis. Read `returns-analysis.md`. Cover transaction structure, investment amount/range, price/valuation, ownership, sources and uses, economically material terms, valuation methods and valuation/transaction comparables, investor cash-flow logic, assumptions, base/upside/downside, IRR/MOIC/payback or explicitly “not measurable”, sensitivities, break-even or maximum acceptable price, exit/repayment, funding constraints, and missing inputs that prevent underwriting.

Unknown price or investment amount is not a reason to omit the section. Solve for ranges or show what cannot yet be measured. Do not repeat historical accounting validation here.

### 7. `investment-risks` - 投资风险

This domain presents the Phase 7 register. Read `risk-matrix.md`. Use a risk-register table. Each material row states a concrete failure mode, category, probability/impact rationale, evidence, affected cash-flow/value driver, mitigation, residual risk, owner/controller, trigger, stop condition, and decision consequence.

Cover growth and continued-operation risks, including material ownership, regulatory, people, financial, business-model, transaction, and exit issues. Separate red flags and kill/pause conditions. Do not treat this domain as a second compliance chapter.

### 8. `diligence-gaps` - 待解决问题 / 待提供资料

Use prioritized evidence groups, normally P0/P1/P2. Each item includes the exact claim/question, current evidence or contradiction, requested proof/sample, owner/source, urgency, blocking status, why it matters, affected artifact/decision, and closure criterion.

Do not use vague phrases such as “补充财务资料”. Specify periods, entities, fields, samples, and reconciliation expected.

### 9. `investment-conclusion` - 结论

State recommendation and exact decision requested, one-sentence reason, 3-5 theses tied to evidence, strongest counterarguments, preconditions, price/structure/rights conditions, pause/kill triggers, feasible options and trade-offs, value-creation hypotheses, IC readiness, accepted human exceptions, and next actions with owner and timing.

Use one of: `Proceed`, `Proceed with conditions`, `Renegotiate`, `Defer`, or `Reject`. A conditional recommendation must name each condition.

### Appendices

- `source-index`: source ID, type, title, authoring party, date/period, independence, excerpt/limitation, and affected domains.
- `glossary`: only terms needed by a non-specialist decision maker.
- `data-dictionary`: formulas, definitions, sample scope, cleaning/reconciliation, model assumptions, and caveats.
- `version-ledger`: version, timestamp, parent, evidence/model versions, status, and decision-relevant changes.

## Output template

Render the report in the user's language per `references/shared/output-contracts.md`. The English headings below are structural labels, not copy-paste text. Translate all titles, headings, subheadings, table headers, and labels into the user's language; keep status enums, source IDs, and file paths unchanged.

```markdown
# Investment Analysis Report: {project}
*Skill: due-diligence | Generated: {date} | Status: indicative | working | diligence-adjusted | decision-frozen | invalidated*

## Header
- **Project / perspective:**
- **Decision question:**
- **Inputs used:**
- **Evidence cutoff:**
- **Conclusion (one paragraph):**

## 1. 项目概况
**Status:** populated | partial | stub | invalidated | empty

**Summary:** {analytical conclusion}

### Key facts
### Target / asset perimeter
### Proposal
### Investment highlights
### Headline caveat

**Missing:** {exact evidence needed, or 无}

## 2. 行业与竞争
**Status:**
**Summary:**

### Industry definition and logic
### Demand, size, and growth
### Value chain and structure
### Competitors and substitutes
### Operating comparables
### Implications for this target

**Missing:**

## 3. 业务与技术
**Status:**
**Summary:**

### What the company sells, to whom, and how it is delivered
### Product, technology, and IP
### Commercial model, customers, and suppliers
### Unit economics and operating KPIs
### Core capability vs. plan
### Mechanism
{One Mermaid diagram if it clarifies the business; tables must still verify it.}

**Missing:**

## 4. 公司与团队
**Status:**
**Summary:**

### Entity, ownership, and history
### Management, employees, and governance
### Related parties, rights, and integrity findings

**Missing:**

## 5. 财务研究
**Status:**
**Summary:**

### Growth and drivers
### Order-to-cash and revenue quality
### Margins, cash, working capital, and debt
### Forecast bridge and financial risks

**Missing:**

## 6. 投资方案与收益预测
**Status:**
**Summary:**

### Structure, price, and economically material terms
### Valuation and comparables
### Investor cash flows, scenarios, and sensitivities
### Exit / repayment and what cannot yet be measured

**Missing:**

## 7. 投资风险
**Status:**
**Summary:**

| Risk | Category | Evidence | Transmission | Mitigation | Residual | Owner | Trigger / stop | Decision consequence |
|---|---|---|---|---|---|---|---|---|

### Red flags and kill / pause conditions

**Missing:**

## 8. 待解决问题 / 待提供资料
**Status:**
**Summary:**

### P0
### P1
### P2

| Claim / question | Current evidence | Request | Owner | Priority | Blocker | Closure criterion |
|---|---|---|---|---|---|---|

**Missing:**

## 9. 结论
**Status:**
**Summary:**

**Recommendation:** Proceed | Proceed with conditions | Renegotiate | Defer | Reject

### Why
### Theses
### Counterarguments
### Conditions and stop triggers
### IC readiness and next actions

## Appendix A. Source index
| ID | Type | Title | Authoring party | Date / period | Independence | Limitation | Domains |
|---|---|---|---|---|---|---|---|

## Appendix B. Glossary

## Appendix C. Data dictionary

## Appendix D. Version ledger
| Version | Time | Parent | Evidence / model versions | Status | Change |
|---|---|---|---|---|---|
```

Omit empty appendix bodies only when there is genuinely nothing to record. Do not omit a numbered domain. If a domain has no evidence, keep the heading, mark `empty` or `stub`, and state the missing evidence.

## Boundary

- Do not emit HTML, `kb-data-v3.json`, or a separate knowledge-base file.
- Do not treat this report as Diligence Readiness.
- Do not replace `03-diligence/*.md` workpapers.
- Do not fabricate social proof, audited numbers, or resolved claims.
