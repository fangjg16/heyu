# Source Grading

## Hierarchy

1. **Primary**: statutes, regulators, registries, courts, signed contracts, bank records, transaction records, raw operating data, direct interviews.
2. **Professional independent**: audited accounts, legal opinions, valuation reports, technical reports, established industry databases.
3. **Reputable secondary**: established press, trade publications, peer-reviewed or clearly sourced research.
4. **Informal**: blogs, social posts, unsourced databases, marketing pages.
5. **Internal analysis**: AI output, investor notes, target summaries, and derived models. These explain evidence but do not add independent corroboration.

## Independence rules

- Count authoring parties, not file count.
- Do not count an article and the report it quotes as two independent sources.
- Treat target-created materials as one target-side perspective unless a visible independent author exists.
- Record contradictory sources instead of selecting the convenient one silently.
- Label stale information in context; do not apply a universal age cutoff where older history remains relevant.

## Evidence strength

Do not put a top-level generic `confidence` score on the portable claim. Grade sources here and record portable support and contradiction independently. A plugin may also keep its own confidence model under the claim's namespaced `pluginAssessments` entry; that private assessment does not replace source grading and is not converted across plugins.

Use source tier and independence to justify those strengths: primary or genuinely independent professional sources can support `moderate` or `strong`; informal or internal analysis cannot add independent corroboration.

## Collection in-run

Each analysis skill searches for its own topic. There is no separate search skill.

When collecting public information, record the claim or question, scope and definitions, geography, time period, queries, publication date, the date the underlying fact occurred, source ID, independence group, contradictions, and gaps. Prefer primary records, filings, regulator and official statistics, then high-quality independent research. Separate target claims, independent facts, estimates, and inference. Searching does not replace the workstream's analytical conclusion.
