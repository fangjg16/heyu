# CapitalLens Gate Rules

Pipeline status (`inbound` → `deal-screening` → `due-diligence` → `ic-review` → `invested` | `declined`) records where the project sits. It is not a freeze gate. A recorded analyst decision is required for both `deal-screening` → `due-diligence` and `due-diligence` → `ic-review`; only a person may set `invested` or `declined`. The only formal gate is Diligence Readiness below.

## Diligence Readiness

This gate asks whether the current evidence can support formal underwriting and an investment recommendation. It is not permission to continue working; evidence collection and partial diligence may continue regardless.

Assess:

- the real business and revenue drivers are understood;
- material market and competitive claims have external support or explicit gaps;
- financial history and key forecast bridges are reconcilable;
- ownership, licenses, and continued-operation blockers are identified;
- material contradictions have owners and resolution paths;
- valuation and return inputs are reproducible or explicitly indicative.

Before `passed` or `conditional`, also require:

- `03-diligence/diligence-readiness.md` records the evidence cutoff, workpaper versions, gate conclusion, conditions, and open critical matters;
- every applicable business, industry, and financial workpaper passes the structural checks in `../skills/due-diligence/references/dd-principles.md`;
- the three-way cross-validation matrix is current and material contradictions are resolved or explicitly conditioned;
- no material dependency is newer than the workpaper that relies on it;
- each `部分核验` or `未核验` item has an owner, decision impact, and downstream treatment;
- `scripts/validate_project.py PROJECT --formal-diligence --diligence-readiness` passes when run from the `due-diligence` skill directory. Script success is necessary but not sufficient for the human gate decision.

Status: `passed`, `conditional`, `not_passed`, or `deferred`.
