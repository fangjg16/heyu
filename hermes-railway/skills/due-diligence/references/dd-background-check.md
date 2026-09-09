# Background Check

Use in Phase 3B of `due-diligence`. This is a diligence workstream, not a separate CapitalLens skill. Produce or update `03-diligence/background-check.md` only for a triggered deep dive.

## Purpose and boundary

Background check is a specialist deep dive inside the diligence loop. A user request to investigate named people, entities, ownership, or adverse records is itself a trigger: open `due-diligence` and run only this step (and Phase 1 if no project brief exists). Business diligence still performs the baseline org / people screen; this step goes deeper on identity, ownership, affiliation, adverse records, disclosure integrity, and related parties.

It owns identity resolution, entity and role relationships, beneficial ownership, adverse-record matching, false-positive controls, and investment implications of integrity or affiliation findings. Business diligence retains ownership of operating capability, organization, key-person dependence, and business continuity.

## Reuse before research

Read the project brief, source register, business diligence workpaper, claim audit, and screening memo first when they exist. Reuse resolved names, identifiers, entities, sources, and open questions. Do not repeat general intake or rebuild facts already established unless their reliability is the issue being tested.

## Triggers

A user request to run this step is a trigger. Also trigger a deep dive when Phase 3A or a prior screening memo finds one or more of the following that could materially affect value, governance, transaction feasibility, or investor rights:

- unresolved legal identity, alias, ownership, controller, or beneficial-owner questions;
- an undisclosed or inconsistent affiliate, prior role, related entity, or related transaction;
- revenue, contracts, licenses, assets, or IP appearing outside the disclosed investing entity;
- a plausible court, regulatory, sanctions, insolvency, professional-discipline, or adverse-media match;
- repeated or material inconsistencies in management disclosure;
- a sensitive sector, jurisdiction, counterparty, or ownership structure requiring enhanced screening.

When a full diligence loop reaches this step and none of those signals exist, record completion of the baseline screen in business diligence and do not create `background-check.md`. When the user invoked this step directly, always write the workpaper.

## Procedures

1. Build a subject registry with legal names, aliases, original-script names, dates or locations, registration numbers, roles, jurisdictions, and known relationships.
2. Resolve the entity and beneficial-ownership map, including prior entities and material affiliates.
3. Check relevant corporate, court, regulatory, sanctions, insolvency, media, and professional records using identifiers appropriate to each jurisdiction.
4. Distinguish allegation, investigation, filed proceeding, judgment, regulatory finding, settlement, and conviction. A name-only match is never a finding.
5. Test plausible false positives and false negatives; record search coverage, unavailable sources, time boundaries, and identity uncertainty.
6. Connect validated findings to governance, reputation, compliance, related-party exposure, cash-flow ownership, investor rights, deal terms, or escalation needs.

## Output when triggered

Create or update `03-diligence/background-check.md` only for a triggered deep dive. Include:

1. trigger, scope, subjects, jurisdictions, and evidence cutoff;
2. identity resolution and aliases;
3. entity, ownership, control, and relationship map;
4. professional and corporate history;
5. adverse, court, regulatory, sanctions, insolvency, and media findings;
6. related-party and disclosure-integrity findings;
7. false-positive controls, search coverage, and limitations;
8. investment implications, conditions, escalation, and specialist review needs;
9. open questions and evidence requests;
10. source register references and affected claim IDs.

Update the claim audit, source register, and affected business and financial diligence sections. Do not characterize unresolved identity matches as facts.

## Honesty rules for this step

Both failure directions are expensive: a suppressed finding puts capital behind an untrustworthy counterparty, and an inflated finding destroys a real person's reputation on a name match.

1. **A name-only match is never a finding.** If identity stays uncertain, the uncertainty is the result — not the underlying record.
2. **Disclose coverage, not just hits.** State jurisdictions, unavailable databases, time boundaries, and missing identifiers. A clean report from a narrow search is misleading.
3. **Preserve the legal state.** Allegation, investigation, filed proceeding, judgment, regulatory finding, settlement, and conviction are different facts. Collapsing them into "有负面记录" is a fabrication.
4. **Report false positives and false negatives symmetrically.** Silence about blind spots reads as coverage.
5. **Represent adverse media proportionally.** Count authoring parties; an aggregator recycling one article is one source.
6. **Don't moralize past the evidence.** State whether a record actually affects governance, rights, value, or feasibility.
7. **Never soften under deal pressure, never harden to look productive.** Evidence moves conclusions; timing and relationships don't.
8. **Escalate when a specialist is required** instead of producing an AI-grade approximation of a legal conclusion.

The workpaper ends with a **Flags** section (Red / Yellow, or "No flags identified" plus the search coverage that supports it).

| Anti-Pattern | What It Looks Like | What to Say |
|---|---|---|
| Name-match reporting | Common name matched to a court record without identifiers | "同名不是发现。用什么身份标识确认的？没有就报为无法确认。" |
| Clean-by-omission | "未发现负面记录" with no coverage statement | "检索了哪些辖区和库？哪些没查到？无覆盖说明的无发现没有意义。" |
| Legal-state collapse | Allegation reported as if it were a judgment | "这是立案、判决还是和解？状态不同，影响完全不同。" |
| Media echo counting | Five reposts of one article treated as five sources | "统计作者方而非文件数，这是一个信源。" |
| Suppression under deal pressure | Finding softened because signing is near 或关系方介绍 | "证据没变，结论不能因为时间点变化。" |
| Character inference | Unrelated old matter used to conclude "不诚信" | "这条记录如何影响治理、权利、价值或交易可行性？不影响就如实说明。" |
| Ownership hand-waving | Stopping at the first registered layer | "登记股东不等于受益所有人。往上追到自然人或说明追不动的原因。" |
| Silent scope drift | Deep dive turning into a second business intake | "这不是背调的边界，把经营能力问题送回业务尽调。" |
