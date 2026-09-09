# Shared Project Operating Loop

The suite uses a fixed entry and decision boundary with an iterative middle. Do not treat it as a waterfall.

```text
Resume or intake
  -> define the project, decision question, claims, and known gaps
  <-> collect evidence
  <-> run domain analysis
  <-> audit claims and track gaps
  <-> update economics, risks, and options
  -> freeze a decision only when the applicable gate is met or an exception is explicitly accepted
```

## Rules

1. Start useful evidence work even when price, investment amount, target return, or holding period is unknown.
2. Treat preliminary economics as optional and indicative. Never require it before evidence collection.
3. Let any workstream request more evidence or invalidate dependent artifacts.
4. Re-run only affected work. Preserve prior versions and record why an artifact became stale.
5. Separate work completion from decision readiness. A finished document does not prove its claims.
6. Allow the user to defer work, but label downstream conclusions and limitations.
7. Use gates only at material decision boundaries, not between every workstream.

## Shared statuses

Use: `not_started`, `in_progress`, `completed`, `partial`, `deferred`, `blocked`, `not_passed`, `invalidated`, `requires_rerun`, `ready`.

## Perspective isolation

- `startup`: judge whether and how a founder should validate and build a new business.
- `capitallens`: judge whether a financial investor should invest, at what value, and under what conditions.

Share facts and evidence, never the final definition of a good project.
