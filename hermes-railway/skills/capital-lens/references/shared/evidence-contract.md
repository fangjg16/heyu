# Evidence Contract

Use one portable claim and source envelope across both plugins. The shared fields preserve provenance, scope, sources, contradictions, and lifecycle across handoffs. Each plugin may keep its own confidence or scoring model inside a namespaced `pluginAssessments` entry; those private assessments remain separate outputs and are never translated automatically.

## Claim record

```json
{
  "claimId": "CLM-001",
  "statement": "",
  "claimType": "fact | estimate | assumption | opinion | forecast",
  "origin": "user | target | investor-assumption | public-source | model",
  "scope": {
    "entity": "",
    "period": "",
    "geography": "",
    "definition": ""
  },
  "decisionUse": "",
  "status": "supported | contradicted | unverified | not_verifiable",
  "supportStrength": "not_assessed | none | weak | moderate | strong | not_assessable",
  "contradictionStrength": "not_assessed | none | weak | moderate | strong | not_assessable",
  "conflictFlag": false,
  "supportingSourceIds": [],
  "contradictingSourceIds": [],
  "openQuestions": [],
  "statusRationale": "",
  "validFrom": null,
  "validTo": null,
  "replacedBy": null,
  "statusHistory": [],
  "affectedArtifacts": [],
  "pluginAssessments": {
    "startup": {
      "assessmentSystem": "startup-v1",
      "confidence": "high | medium | low",
      "rationale": ""
    }
  }
}
```

Do not use `mixed`, `partially_supported`, `unsupported`, `not_tested`, `superseded`, or `not-verifiable` as the shared verification status. Do not use `investor` as origin; investor-side beliefs are `investor-assumption`. Do not add a top-level generic `confidence` field to the portable claim. Plugin-private confidence belongs under `pluginAssessments.<plugin>` with an `assessmentSystem` version and rationale.

## Status decision

- `supported`: sufficient reliable evidence supports the atomic claim and no material unresolved contradiction remains. Requires `supportStrength` of `moderate` or `strong`, a supporting source, `contradictionStrength` of `none` or `weak`, and `conflictFlag: false`.
- `contradicted`: sufficient reliable evidence disproves or materially negates the atomic claim. Requires `contradictionStrength` of `moderate` or `strong`, a contradicting source, `supportStrength` of `none` or `weak`, and `conflictFlag: false`.
- `unverified`: verification remains open, evidence is absent or insufficient, or reliable support and contradiction remain unresolved. An unresolved conflict on the same atomic claim is `unverified` with `conflictFlag: true`, sufficient sourced evidence on both sides, and both strengths `moderate` or `strong`. Without conflict, both strengths stay in `not_assessed`, `none`, or `weak`.
- `not_verifiable`: the claim cannot reasonably be verified under the available method, access, or evidence boundary. Both strengths must be `not_assessable`, and `conflictFlag` must be false. Record why and what would make it verifiable.

Missing evidence or an unperformed procedure is `unverified`. Workflow status belongs on the evidence request, not on the claim.

## Plugin-private assessments

- `pluginAssessments` is optional and keyed by plugin name: `startup` or `capitallens`.
- Each entry is owned by that plugin and must identify its `assessmentSystem`. Its schema and vocabulary may differ from other plugins.
- A handoff preserves private assessments as opaque context. The receiving plugin may form its own assessment, but must not overwrite, average, or mechanically translate the originating plugin's confidence.
- If two plugins analyze the same underlying opportunity, keep separate managed-project roots or plugin-namespaced analysis directories, each with its own `00-control` files. Reuse source IDs; do not merge decision state.

Record support and contradiction independently. Explain the status in `statusRationale`, including source quality, independence, coverage, and unresolved limitations.

When new evidence changes the assessment of the same atomic claim, append the prior assessment to `statusHistory`, update the current status, and invalidate dependent artifacts. When wording, scope, definition, entity, or period changes, create a new claim and preserve the relationship through `validTo` and `replacedBy`; replacement is metadata, not a status. `replacedBy` must point to a different existing claim.

## Source record

```json
{
  "sourceId": "SRC-001",
  "title": "",
  "authoringParty": "",
  "sourceType": "user-file | target-file | regulator | registry | court | audited-financials | professional-report | database | press | interview | model-output",
  "sourceTier": "primary | professional-independent | reputable-secondary | informal | internal-analysis",
  "publishedDate": "",
  "retrievedDate": "",
  "pathOrUrl": "",
  "excerptOrLocator": "",
  "independenceGroup": "",
  "limitations": []
}
```

## Evidence request

A domain skill may request external evidence without owning a second search methodology:

```json
{
  "requestId": "ER-001",
  "requestingWorkstream": "industry-due-diligence",
  "claimIds": ["CLM-001"],
  "questions": [],
  "preferredSourceTypes": [],
  "decisionUse": "",
  "priority": "critical | high | medium | low",
  "status": "open | searching | satisfied | partial | unavailable"
}
```

The requesting domain owns the analytical conclusion. The evidence workflow owns search discipline, source grading, and source-register updates.
