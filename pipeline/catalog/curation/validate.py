"""Checks for pipeline/catalog/curation/investigations.yaml (Linear DOB-61).

The file is written as JSON, which is valid YAML, so the standard library can read it and the
tests need no extra package. A missing entry stops the build and names the PSI ID.
"""

import json
from pathlib import Path

CURATION = Path(__file__).resolve().parent / "investigations.yaml"

EXPECTED_IDS = [
    "PSI-10", "PSI-20", "PSI-21", "PSI-22", "PSI-23", "PSI-159", "PSI-25", "PSI-26", "PSI-39",
    "PSI-68", "PSI-69", "PSI-98", "PSI-99", "PSI-100", "PSI-101", "PSI-102", "PSI-47", "PSI-106",
    "PSI-107", "PSI-60", "PSI-62", "PSI-115", "PSI-117", "PSI-142",
]
PILLARS = {"prevention", "detection", "suppression", "related", "fundamentals"}
FUEL_PHASES = {"solid", "liquid", "gas", "aerosol"}
HARDWARE = {"acme_cir", "mdca_cir", "msg_flow_duct", "saffire_cygnus", "smoke_diagnostics", "ground"}
STAGE_OF = {"prevention": "spread", "detection": "detect", "suppression": "suppress"}
# Pillars the challenge page itself names (docs/00-challenge-description.md).
CHALLENGE_PILLARS = {
    "PSI-26": "prevention", "PSI-25": "prevention", "PSI-98": "prevention", "PSI-99": "prevention",
    "PSI-100": "prevention", "PSI-102": "detection", "PSI-101": "detection", "PSI-69": "suppression",
}


def load(path: Path = CURATION) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))["investigations"]


def validate(entries: dict) -> list[str]:
    """Return a list of problems; empty means valid."""
    errors = []
    for pid in EXPECTED_IDS:
        if pid not in entries:
            errors.append(f"{pid}: missing entry")
    for pid in entries:
        if pid not in EXPECTED_IDS:
            errors.append(f"{pid}: not one of the 24 investigations")
    for pid, e in entries.items():
        for field, allowed in (("pillar", PILLARS), ("fuel_phase", FUEL_PHASES), ("hardware_group", HARDWARE)):
            block = e.get(field) or {}
            if block.get("value") not in allowed:
                errors.append(f"{pid}: {field} value {block.get('value')!r} not allowed")
            if not str(block.get("source", "")).strip():
                errors.append(f"{pid}: {field} has no source")
        m = e.get("measurements") or {}
        if not m.get("value") or not str(m.get("source", "")).strip():
            errors.append(f"{pid}: measurements empty or without source")
        s = e.get("summary_plain") or {}
        if not s.get("text", "").strip() or not s.get("written_by") or not s.get("source"):
            errors.append(f"{pid}: summary_plain incomplete")
        if not str(e.get("cannot_tell", "")).strip():
            errors.append(f"{pid}: cannot_tell empty")
        pillar = (e.get("pillar") or {}).get("value")
        if e.get("stage") != STAGE_OF.get(pillar):
            errors.append(f"{pid}: stage {e.get('stage')!r} does not match pillar {pillar!r}")
        if pid in CHALLENGE_PILLARS and pillar != CHALLENGE_PILLARS[pid]:
            errors.append(f"{pid}: pillar {pillar!r} differs from the challenge page ({CHALLENGE_PILLARS[pid]})")
    return errors


if __name__ == "__main__":
    problems = validate(load())
    for p in problems:
        print(p)
    raise SystemExit(1 if problems else 0)
