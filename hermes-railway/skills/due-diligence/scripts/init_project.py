#!/usr/bin/env python3
"""Initialize a minimal CapitalLens managed project."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("project_dir")
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--decision-question", default="现在是否值得启动正式尽调？")
    args = parser.parse_args()
    root = Path(args.project_dir)
    control = root / "00-control"
    if (control / "PROJECT_STATE.json").exists() or (control / "PROGRESS.md").exists():
        raise SystemExit("Refusing to overwrite existing control files")
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    state = {
        "contractVersion": "1.0.0", "projectId": args.project_id,
        "plugin": "capitallens", "perspective": "financial-investor",
        "decisionQuestion": args.decision_question,
        "pipelineStatus": "inbound",
        "knowns": [], "unknowns": [],
        "workstreams": {
            "deal-screening": {"status": "not_started"},
        },
        "gates": {"diligence-readiness": {"status": "not_started"}},
        "sources": [], "claims": [], "evidenceRequests": [], "decisions": [], "nextActions": [], "artifacts": [], "lastUpdated": now,
    }
    control.mkdir(parents=True, exist_ok=True)
    (control / "PROJECT_STATE.json").write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (control / "PROGRESS.md").write_text(
        f"# {args.project_id} Progress\n\n- Perspective: financial-investor\n- Decision question: {args.decision_question}\n- pipelineStatus: inbound\n- Status: intake\n\n## Active workstreams\n\nNone yet.\n\n## Blockers\n\nNone recorded.\n\n## Next useful action\n\nCapture the project description and run deal screening.\n",
        encoding="utf-8",
    )
    print(f"Initialized {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
