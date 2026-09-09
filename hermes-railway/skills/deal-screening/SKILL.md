---
name: deal-screening
description: 财务投资人入口筛选，CapitalLens 看新项目的默认第一步。在正式尽调之前，根据项目文字描述或 BP/teaser，确认合域赛道、做公开信息补充、按项目本身分维评分，并给出 Exciting / Promising / Watch / Pass 建议与面向被投方的开放问题。用于“帮我看看”“看这个项目”“值不值得投资”“值不值得尽调”“能不能投”“筛一下”“初筛”“项目评分”“deal screening”，或用户丢来描述/BP 但未明确要求写尽调报告、估值、IRR 或投委会材料。尚未有筛选备忘录时，即使问题听起来像投资决策，也先走本技能。Agent 起草筛选稿；投资团队审阅后决定是否进入尽调。不得按家办投资偏好或 mandate fit 打分。
---

# Deal Screening

A structured skill that takes a financial-investment opportunity from a short description or a thin source pack to a screening memo. The decision question is: is this project clear and strong enough, on its own merits, to justify analyst time in formal diligence?

If the user asked for deal screening, 筛选, or 初筛, stay in this skill until the memo is drafted. Do not open `due-diligence`. Do not write valuation, IRR, or an IC report here.

> **Route table:** Read `references/skill-routing.md` at the start of a new project.

Screening is not diligence and not an investment-committee decision. The agent drafts the memo. The Heyu investment team reviews the rationale, applies judgment, and records the pipeline decision. The agent does not mark a project `declined`, `ic-review`, or `invested`.

Three layers stay separate: science (theme coordinate, public facts, dimension scores, sources, open questions); judgment (whether the scores and gaps are accepted); responsibility (whether pipeline moves to diligence).

## How It Works

```
RESUME → INTAKE → THEME CLASSIFICATION → ENRICHMENT (4 WAVES) → SCORING → OPEN QUESTIONS → SCREENING MEMO → TEAM REVIEW
```

Pipeline status for a CapitalLens project:

```
inbound → deal-screening → due-diligence → ic-review → invested | declined
```

## Heyu Runtime Convention

Read `references/project-structure.md` and `references/gate-rules.md` at the start of a managed project. In this distribution, `PROGRESS.md` means `00-control/PROGRESS.md`; also maintain `00-control/PROJECT_STATE.json`. These are the only control files. Keep workpapers in their stage folders. Do not demand investment amount, target return, holding period, or risk preference when they are unknown.

Set `pipelineStatus` to `deal-screening` when this skill starts. Diligence Readiness remains the only formal gate; pipeline status is not a gate.

> **Shared contracts:** Read `references/shared/operating-loop.md`, `references/shared/evidence-contract.md`, `references/shared/source-grading.md`, and `references/shared/output-contracts.md` at the start of a managed project.

### Language

Follow the Language rule in `references/shared/output-contracts.md`. Write workpapers in the user's language. If the user writes in Chinese, use Chinese for all screening outputs — including titles, headings, subheadings, table headers, labels, and body. Do not copy English template headings into a Chinese memo.

---

## Phase 0: Resume Check

Before anything else, check if `00-control/PROGRESS.md` exists. If it does, read it with `PROJECT_STATE.json`.

- If this skill has incomplete phases, tell the user what is done and resume from the next phase.
- If `pipelineStatus` is `due-diligence`, `ic-review`, or `invested`, say screening is not the current stage. Do not overwrite diligence or IC artifacts.
- If `pipelineStatus` is `declined`, start a new screening run only when the user explicitly asks to rescreen with new material. Preserve the prior memo; do not silently edit it.

If no progress file exists, this is the first run. Start from Phase 1.

### Output

No new files. Tell the user this is a first run starting at Phase 1, or what is already done and what comes next.

---

## Phase 1: Intake

> **Reference:** Read `references/project-intake.md`.

A paragraph of description is enough. A BP, teaser, CIM, or links are welcome and not required.

Capture project identity, one-sentence economic essence, sources, target/user claims, known contradictions, and the decision question: whether formal diligence is worth starting now. Unknown cheque, price, return, or hold period stay unknown.

Create or update control files. Set `pipelineStatus` to `deal-screening`.

### Output

- `00-control/PROJECT_STATE.json`
- `00-control/PROGRESS.md`
- `01-intake/project-brief.md`

Update PROGRESS.md. Mark Phase 1 complete.

---

## Phase 2: Theme Classification

> **References:** Read `references/theme-classification.md`, then `references/taxonomy.md` and `references/decision-rules.md`.

Place the target on the Heyu investment-theme whitelist. This is a CapitalLens analytical coordinate, not the `heyu-workspace` project-card classification. If a workspace `classification.json` exists, reuse it as an input and explain any difference; do not overwrite it. The coordinate is not a score, pass/fail filter, or investment conclusion.

Always return a non-empty primary theme and subsector from the bundled whitelist. Record `taxonomy_version`, match type, and confidence.

### Output

- `01-intake/theme-classification.md`
- `01-intake/investment-theme-coordinate.json`

Update PROGRESS.md. Mark Phase 2 complete.

---

## Phase 3: Public Enrichment

> **References:** Read `references/research-principles.md`, then `references/enrichment.md`. Search in-run using `references/shared/source-grading.md`.

Run four sequential waves of public research to test whether an investment opportunity exists now:

1. Market landscape and timing
2. Competitive alternatives and position
3. Customer and demand evidence
4. Distribution and market entry

Each wave must appear. Missing data is a gap, not a reason to drop a wave. This is screening-grade collection, not formal industry, business, or financial diligence.

If identity, control, affiliation, or adverse-record signals appear, note them for `due-diligence` Phase 3B. Do not run the deep dive inside screening. If the user asked to investigate named people, UBO, or adverse records during screening, stop and open `due-diligence` to run only Phase 3B.

### Output

- `02-screening/enrichment.md`
- `02-evidence/source-register.md`

Update PROGRESS.md. Mark Phase 3 complete.

---

## Phase 4: Dimension Scoring

> **Reference:** Read `references/scoring.md`.

Score the project itself on three criteria. Each dimension is `meets`, `partially_meets`, or `misses`. If the facts needed to score a dimension are absent after intake and enrichment, leave it unevaluated and send the missing item to open questions. Do not treat missing data as `misses`.

Dimensions:

- Market timing
- Competitive positioning
- Team / founder quality

If the business cannot be restated as who pays, for what, and how cash arrives, still score what can be scored; cap the overall verdict at `Watch`.

### Output

Scores are written into the screening memo in Phase 6. No separate score file.

Update PROGRESS.md. Mark Phase 4 complete.

---

## Phase 5: Open Questions

> **Reference:** Read `references/open-questions.md`.

Draft questions for the target (via the introducer if needed). Cover what is unclear and what is unreasonable. Each question states what to ask, why it matters now, what an adequate answer looks like, and what happens if it stays unanswered.

Public facts this skill could have searched for do not belong here.

### Output

Open questions are written into the screening memo in Phase 6. No separate questions file.

Update PROGRESS.md. Mark Phase 5 complete.

---

## Phase 6: Screening Memo

> **Reference:** Read `references/screening-memo.md`.

Write `02-screening/screening-memo.md`. Roll dimension scores into one of `Exciting`, `Promising`, `Watch`, or `Pass`, with a suggested next step: `continue_diligence`, `request_information`, or `pass`.

Leave the team-decision block empty. Do not write `pipelineStatus` as `declined` or `due-diligence`. Leave comparable-deal and network sections as not assessed.

Label the memo `indicative` or `working`.

### Output

- `02-screening/screening-memo.md`

Update PROGRESS.md. Mark Phase 6 complete. Tell the user the memo is a draft for team review.

---

## Phase 7: Team Review

A team member records one of:

| Team decision | `pipelineStatus` |
|---|---|
| `continue` | `due-diligence` |
| request more information / wait for a named catalyst | stay `deal-screening` |
| decline at this stage | `declined` |

The team may override the agent verdict. Record the human rationale in the memo and in `PROJECT_STATE.json` `decisions[]`. Only after this phase may later work start `due-diligence` on the strength of a `continue` decision.

If the user is the decision-maker in this session and states a clear decision, record it. If not, stop after Phase 6 and wait.

### Output

- Updated `02-screening/screening-memo.md` team-decision block
- Updated `pipelineStatus` and `decisions[]`

Update PROGRESS.md. Mark Phase 7 complete when a team decision exists.

---

## Honesty Protocol

> **Reference:** Read `references/honesty-protocol.md` at the start of every session.

1. A description or BP is a claim, not a fact.
2. A blank cell beats a guess. Unevaluated plus an open question, never a fabricated `meets`.
3. Missing data is not `misses` and not `Pass`.
4. State search coverage when a public search returns nothing.
5. A name-only match is never a finding.
6. Cover all four enrichment waves; deepen only what can change whether diligence starts now.
7. Put unreasonable claims in open questions instead of smoothing them.
8. End the memo with Flags (Red / Yellow, or none identified).

---

## After screening

When the team records `continue`, `due-diligence` inherits the brief, theme, sources, scores, open questions, and enrichment. Diligence may revise the industry coordinate and claim statuses; it must say where it differs.

When the user asks for diligence, valuation, IRR, or IC materials without a screening memo, `due-diligence` may proceed and must record that screening was skipped.

---

## Reference Files

Read only what the current phase needs.

| File | When to read | Purpose |
|---|---|---|
| `honesty-protocol.md` | Start of session | Claim labelling, flags, anti-patterns |
| `project-intake.md` | Phase 1 | Thin brief; pipeline `deal-screening` |
| `theme-classification.md` | Phase 2 | How to apply the whitelist |
| `taxonomy.md` | Phase 2 | Theme and subsector labels |
| `decision-rules.md` | Phase 2 | Adjudication and boundary rules |
| `research-principles.md` | Phase 3 | Search quality, dating, gaps |
| `enrichment.md` | Phase 3 | Four waves of public research |
| `scoring.md` | Phase 4 | Criteria and `meets` / `partially_meets` / `misses` |
| `open-questions.md` | Phase 5 | Questions for the target |
| `screening-memo.md` | Phase 6 | Memo structure, verdict rollup, team block |
