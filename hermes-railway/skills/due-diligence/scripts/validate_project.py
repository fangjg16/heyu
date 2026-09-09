#!/usr/bin/env python3
"""Validate CapitalLens control state and optional formal diligence workpapers."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REQUIRED_STATE_FIELDS = {
    "contractVersion",
    "projectId",
    "plugin",
    "perspective",
    "workstreams",
    "gates",
    "artifacts",
    "lastUpdated",
}

CLAIM_STATUSES = {"supported", "contradicted", "unverified", "not_verifiable"}
CLAIM_TYPES = {"fact", "estimate", "assumption", "opinion", "forecast"}
CLAIM_ORIGINS = {"user", "target", "investor-assumption", "public-source", "model"}
EVIDENCE_STRENGTHS = {"not_assessed", "none", "weak", "moderate", "strong", "not_assessable"}
LOW_STRENGTHS = {"not_assessed", "none", "weak"}
SUFFICIENT_STRENGTHS = {"moderate", "strong"}
SOURCE_TIERS = {"primary", "professional-independent", "reputable-secondary", "informal", "internal-analysis"}
ASSESSMENT_KEYS = {"startup", "capitallens"}
REQUIRED_CLAIM_FIELDS = {
    "claimId", "statement", "claimType", "origin", "status",
    "supportStrength", "contradictionStrength", "conflictFlag",
    "supportingSourceIds", "contradictingSourceIds", "statusRationale",
    "affectedArtifacts",
}

HEADER_LABELS = (
    "项目与视角",
    "工作流与状态",
    "工件状态",
    "日期与输入",
    "证据截止与依赖版本",
    "决策问题",
    "结论",
)

FORMAL_WORKPAPERS = {
    "dd-business": {
        "path": "03-diligence/business-diligence.md",
        "headings": (
            "## 1. 执行结论与证据边界",
            "## 2. 真实业务与边界",
            "## 3. 业务演进与战略一致性",
            "## 4. 产品与技术",
            "## 5. 商业模式与交易闭环",
            "## 6. 运营、组织与关键依赖",
            "## 7. 核心能力与竞争力归因",
            "## 8. 关键主张测试与反证",
            "## 9. 跨流勾稽",
            "## 10. 缺口、影响与下一步",
            "## 来源",
        ),
    },
    "dd-industry": {
        "path": "03-diligence/industry-diligence.md",
        "headings": (
            "## 1. 执行结论与证据边界",
            "## 2. 行业定义与坐标",
            "## 3. 行业逻辑与需求形成",
            "## 4. 发展历程与关键拐点",
            "## 5. 市场现状、规模与增长",
            "## 6. 渗透、驱动因素与约束",
            "## 7. 价值链与利润池",
            "## 8. 竞争结构与参与者",
            "## 9. 趋势、技术与监管",
            "## 10. 标的映射与可比验证",
            "## 11. 关键主张测试与反证",
            "## 12. 缺口、影响与下一步",
            "## 来源",
        ),
    },
    "dd-financial": {
        "path": "03-diligence/financial-diligence.md",
        "headings": (
            "## 1. 执行结论与证据边界",
            "## 2. 范围、口径与数据可靠性",
            "## 3. 增长速度：订单至回款",
            "## 4. 增长质量与核心业务",
            "## 5. 增长驱动力与业务模型勾稽",
            "## 6. 收入质量与粉饰测试",
            "## 7. 毛利、费用与盈利质量",
            "## 8. 营运资金、现金与资本需求",
            "## 9. 债务、税务、关联方与内控",
            "## 10. 预测桥与尽调调整",
            "## 11. 跨流勾稽",
            "## 12. 缺口、影响与下一步",
            "## 来源",
        ),
    },
}


def validate_control(root: Path) -> dict:
    control = root / "00-control"
    state_path = control / "PROJECT_STATE.json"
    progress_path = control / "PROGRESS.md"
    if not state_path.is_file() or not progress_path.is_file():
        raise ValueError("required control files are missing")
    extras = sorted(
        path.name
        for path in control.iterdir()
        if path.is_file() and path.name not in {state_path.name, progress_path.name}
    )
    if extras:
        raise ValueError(f"unexpected control files: {extras}")
    state = json.loads(state_path.read_text(encoding="utf-8"))
    missing = sorted(REQUIRED_STATE_FIELDS - set(state))
    if missing:
        raise ValueError(f"missing state fields: {missing}")
    if (
        state["contractVersion"] != "1.0.0"
        or state["plugin"] != "capitallens"
        or state["perspective"] != "financial-investor"
    ):
        raise ValueError("contract/plugin/perspective mismatch")
    expected_gates = {"diligence-readiness"}
    if set(state["gates"]) != expected_gates:
        raise ValueError(f"gates must be exactly {sorted(expected_gates)}")
    pipeline = state.get("pipelineStatus")
    allowed_pipeline = {
        "inbound",
        "deal-screening",
        "due-diligence",
        "ic-review",
        "invested",
        "declined",
    }
    if pipeline not in allowed_pipeline:
        raise ValueError(f"invalid pipelineStatus: {pipeline!r}")
    validate_decisions(state, pipeline)
    return state


def validate_decisions(state: dict, pipeline: str) -> None:
    decisions = state.get("decisions", [])
    if not isinstance(decisions, list):
        raise ValueError("decisions must be an array")
    required_fields = {"decisionId", "action", "decisionMakerType", "decidedAt", "rationale"}
    allowed_actions = {"continue", "screeningSkipped", "submit_for_ic", "invest", "decline", "other"}
    ids: set[str] = set()
    actions: set[str] = set()
    for index, decision in enumerate(decisions):
        label = f"decisions[{index}]"
        if not isinstance(decision, dict) or not required_fields.issubset(decision):
            raise ValueError(f"{label}: missing required human-decision fields")
        decision_id = decision["decisionId"]
        if not isinstance(decision_id, str) or not decision_id or decision_id in ids:
            raise ValueError(f"{label}: decisionId must be unique and non-empty")
        ids.add(decision_id)
        if decision["action"] not in allowed_actions:
            raise ValueError(f"{label}: invalid action")
        if decision["decisionMakerType"] not in {"analyst", "human"}:
            raise ValueError(f"{label}: decisionMakerType must be analyst or human")
        if not isinstance(decision["decidedAt"], str) or not decision["decidedAt"]:
            raise ValueError(f"{label}: decidedAt must be non-empty")
        if not isinstance(decision["rationale"], str) or not decision["rationale"].strip():
            raise ValueError(f"{label}: rationale must be non-empty")
        actions.add(decision["action"])
    if pipeline == "due-diligence" and not actions.intersection({"continue", "screeningSkipped"}):
        raise ValueError("due-diligence requires a recorded human continue or screeningSkipped decision")
    if pipeline == "ic-review" and "submit_for_ic" not in actions:
        raise ValueError("ic-review requires a recorded analyst submit_for_ic decision")
    if pipeline == "invested" and not {"submit_for_ic", "invest"}.issubset(actions):
        raise ValueError("invested requires recorded submit_for_ic and invest decisions")
    if pipeline == "declined" and "decline" not in actions:
        raise ValueError("declined requires a recorded human decline decision")


def validate_claims(state: dict, readiness: bool) -> None:
    claims = state.get("claims", [])
    if not isinstance(claims, list):
        raise ValueError("claims must be an array")
    if readiness and not claims:
        raise ValueError("diligence readiness requires at least one material claim")

    failures: list[str] = []
    source_ids: set[str] = set()
    sources = state.get("sources", [])
    if not isinstance(sources, list):
        raise ValueError("sources must be an array")
    for index, source in enumerate(sources):
        label = f"sources[{index}]"
        if not isinstance(source, dict):
            failures.append(f"{label}: must be an object")
            continue
        source_id = source.get("sourceId")
        if not isinstance(source_id, str) or not source_id or source_id in source_ids:
            failures.append(f"{label}: sourceId must be unique and non-empty")
        else:
            source_ids.add(source_id)
        if source.get("sourceTier") not in SOURCE_TIERS:
            failures.append(f"{label}: invalid sourceTier")
        if not isinstance(source.get("title"), str) or not source["title"].strip():
            failures.append(f"{label}: title must be non-empty")
        if not isinstance(source.get("independenceGroup"), str) or not source["independenceGroup"].strip():
            failures.append(f"{label}: independenceGroup must be non-empty")
    claim_ids: set[str] = set()
    for index, claim in enumerate(claims):
        label = f"claims[{index}]"
        if not isinstance(claim, dict):
            failures.append(f"{label}: must be an object")
            continue
        missing = sorted(REQUIRED_CLAIM_FIELDS - set(claim))
        if missing:
            failures.append(f"{label}: missing fields {missing}")
            continue

        claim_id = claim["claimId"]
        if not isinstance(claim_id, str) or not claim_id.strip():
            failures.append(f"{label}: claimId must be non-empty")
        elif claim_id in claim_ids:
            failures.append(f"{label}: duplicate claimId {claim_id}")
        else:
            claim_ids.add(claim_id)

        if not isinstance(claim["statement"], str) or not claim["statement"].strip():
            failures.append(f"{label}: statement must be non-empty")
        if "confidence" in claim:
            failures.append(f"{label}: top-level confidence is not portable; use pluginAssessments.capitallens")
        assessments = claim.get("pluginAssessments", {})
        if not isinstance(assessments, dict) or not set(assessments).issubset(ASSESSMENT_KEYS):
            failures.append(f"{label}: invalid pluginAssessments namespace")
        elif any(
            not isinstance(assessment, dict)
            or not isinstance(assessment.get("assessmentSystem"), str)
            or not assessment["assessmentSystem"].strip()
            for assessment in assessments.values()
        ):
            failures.append(f"{label}: every plugin assessment requires assessmentSystem")
        if claim["claimType"] not in CLAIM_TYPES:
            failures.append(f"{label}: invalid claimType {claim['claimType']!r}")
        if claim["origin"] not in CLAIM_ORIGINS:
            failures.append(f"{label}: invalid origin {claim['origin']!r}")

        status = claim["status"]
        support = claim["supportStrength"]
        contradiction = claim["contradictionStrength"]
        conflict = claim["conflictFlag"]
        supporting_sources = claim["supportingSourceIds"]
        contradicting_sources = claim["contradictingSourceIds"]

        if status not in CLAIM_STATUSES:
            failures.append(f"{label}: invalid status {status!r}")
            continue
        if support not in EVIDENCE_STRENGTHS or contradiction not in EVIDENCE_STRENGTHS:
            failures.append(f"{label}: invalid evidence strength")
            continue
        if not isinstance(conflict, bool):
            failures.append(f"{label}: conflictFlag must be boolean")
            continue
        if not isinstance(supporting_sources, list) or not all(isinstance(item, str) for item in supporting_sources):
            failures.append(f"{label}: supportingSourceIds must be a string array")
            continue
        if not isinstance(contradicting_sources, list) or not all(isinstance(item, str) for item in contradicting_sources):
            failures.append(f"{label}: contradictingSourceIds must be a string array")
            continue
        unknown_sources = sorted((set(supporting_sources) | set(contradicting_sources)) - source_ids)
        if unknown_sources:
            failures.append(f"{label}: references unknown source IDs {unknown_sources}")

        if status == "supported":
            if support not in SUFFICIENT_STRENGTHS or contradiction not in {"none", "weak"} or not supporting_sources or conflict:
                failures.append(f"{label}: supported requires sufficient support, a source, no material contradiction, and no conflict")
        elif status == "contradicted":
            if support not in {"none", "weak"} or contradiction not in SUFFICIENT_STRENGTHS or not contradicting_sources or conflict:
                failures.append(f"{label}: contradicted requires sufficient contradiction, a source, no material support, and no conflict")
        elif status == "unverified" and conflict:
            if support not in SUFFICIENT_STRENGTHS or contradiction not in SUFFICIENT_STRENGTHS or not supporting_sources or not contradicting_sources:
                failures.append(f"{label}: conflicted unverified claim requires sufficient sourced evidence on both sides")
        elif status == "unverified":
            if support not in LOW_STRENGTHS or contradiction not in LOW_STRENGTHS:
                failures.append(f"{label}: unverified without conflict requires unassessed or insufficient evidence on both sides")
        elif status == "not_verifiable":
            if support != "not_assessable" or contradiction != "not_assessable" or conflict:
                failures.append(f"{label}: not_verifiable requires both strengths to be not_assessable and no conflict")

        if not isinstance(claim["statusRationale"], str) or not claim["statusRationale"].strip():
            failures.append(f"{label}: statusRationale must be non-empty")
        history = claim.get("statusHistory", [])
        if not isinstance(history, list):
            failures.append(f"{label}: statusHistory must be an array")
        else:
            dates: list[str] = []
            for history_index, entry in enumerate(history):
                history_label = f"{label}.statusHistory[{history_index}]"
                if not isinstance(entry, dict):
                    failures.append(f"{history_label}: must be an object")
                    continue
                if entry.get("status") not in CLAIM_STATUSES:
                    failures.append(f"{history_label}: invalid status")
                if entry.get("supportStrength") not in EVIDENCE_STRENGTHS or entry.get("contradictionStrength") not in EVIDENCE_STRENGTHS:
                    failures.append(f"{history_label}: invalid evidence strength")
                changed_at = entry.get("changedAt")
                if not isinstance(changed_at, str) or not changed_at:
                    failures.append(f"{history_label}: changedAt must be non-empty")
                else:
                    dates.append(changed_at)
                if not isinstance(entry.get("rationale"), str) or not entry["rationale"].strip():
                    failures.append(f"{history_label}: rationale must be non-empty")
            if dates != sorted(dates):
                failures.append(f"{label}: statusHistory must be chronological")

    for index, claim in enumerate(claims):
        if not isinstance(claim, dict):
            continue
        replaced_by = claim.get("replacedBy")
        if replaced_by is not None and (replaced_by not in claim_ids or replaced_by == claim.get("claimId")):
            failures.append(f"claims[{index}]: replacedBy must reference a different existing claim")

    if failures:
        raise ValueError("claim validation failed:\n- " + "\n- ".join(failures))


def validate_formal_diligence(root: Path, state: dict, readiness: bool) -> None:
    failures: list[str] = []
    if readiness:
        gate_status = state["gates"]["diligence-readiness"].get("status")
        if gate_status not in {"passed", "conditional"}:
            failures.append(f"diligence-readiness gate must be passed/conditional, found {gate_status!r}")
        readiness_path = root / "03-diligence/diligence-readiness.md"
        if not readiness_path.is_file():
            failures.append("missing workpaper: 03-diligence/diligence-readiness.md")
        else:
            readiness_text = readiness_path.read_text(encoding="utf-8")
            for label in HEADER_LABELS:
                if label not in readiness_text:
                    failures.append(f"diligence-readiness.md: missing header label '{label}'")
    for workstream, spec in FORMAL_WORKPAPERS.items():
        workstream_state = state["workstreams"].get(workstream)
        if not workstream_state:
            failures.append(f"missing workstream state: {workstream}")
            continue
        status = workstream_state.get("status")
        if status in {"invalidated", "requires_rerun", "blocked", "not_started"}:
            failures.append(f"stale or inactive workstream: {workstream}={status}")
        if readiness and status not in {"ready", "completed"}:
            failures.append(f"readiness requires ready/completed: {workstream}={status}")

        path = root / spec["path"]
        if not path.is_file():
            failures.append(f"missing workpaper: {spec['path']}")
            continue
        text = path.read_text(encoding="utf-8")
        for label in HEADER_LABELS:
            if label not in text:
                failures.append(f"{spec['path']}: missing header label '{label}'")
        for heading in spec["headings"]:
            if heading not in text:
                failures.append(f"{spec['path']}: missing heading '{heading}'")
        if readiness and "diligence-adjusted" not in text:
            failures.append(f"{spec['path']}: readiness requires diligence-adjusted artifact status")

    if failures:
        raise ValueError("formal diligence validation failed:\n- " + "\n- ".join(failures))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("project_dir")
    parser.add_argument("--formal-diligence", action="store_true")
    parser.add_argument("--diligence-readiness", action="store_true")
    args = parser.parse_args()
    if args.diligence_readiness and not args.formal_diligence:
        parser.error("--diligence-readiness requires --formal-diligence")

    root = Path(args.project_dir)
    try:
        state = validate_control(root)
        validate_claims(state, args.diligence_readiness)
        if args.formal_diligence:
            validate_formal_diligence(root, state, args.diligence_readiness)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"FAIL: {exc}")
        return 1

    suffix = " with formal diligence" if args.formal_diligence else ""
    if args.diligence_readiness:
        suffix += " and readiness structure"
    print(f"PASS: CapitalLens project{suffix}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
