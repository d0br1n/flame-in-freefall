"""Rank the 24 PSI investigations for a chosen cabin air (Linear DOB-73): /catalog/rank.

score = sum of weight x part, each part from 0 to 1, each with a plain reason naming the counts
it used. Every input comes from the catalog: the curation tags (DOB-61), the test rows of the
22 tables and the air coverage (DOB-83), and PSI's file lists. Nothing is typed in by hand.

The parts (the rule is fixed here; the weights are a team decision, Linear ALE-57 and its DOB
twin, so they default to 0.25 each and can be changed per request):
- pillar:   1 if the challenge page itself names the investigation for its fire-safety pillar,
            0.5 if our curation puts it in a fire-safety pillar (prevention, detection,
            suppression) the page does not name it for, 0 for related or fundamental research.
- evidence: the share of its tests that ran inside the chosen air, out of the tests that state
            the quantities the air bounds. 0 when no table states them (said so in the reason).
- data:     0.5 for an experimental table in PSI, plus 0.5 for downloadable data files.
- fuel:     1 for solid fuels (cabin materials), 0.5 for liquid or gas, 0 for aerosol (dust or
            smoke samples, not something that burns).
Ties keep PSI number order. Standard library only.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from . import air as air_mod
from .catalog import BadQuery

PARTS = ("pillar", "evidence", "data", "fuel")
DEFAULT_WEIGHTS = {p: 0.25 for p in PARTS}
FORMULA = "score = sum of weight x part, each part from 0 to 1"
FIRE_PILLARS = ("prevention", "detection", "suppression")
# The pillars the challenge page itself names (docs/00-challenge-description.md); the same map
# guards the curation file (pipeline/catalog/curation/validate.py).
CHALLENGE_PILLARS = {
    "PSI-26": "prevention", "PSI-25": "prevention", "PSI-98": "prevention", "PSI-99": "prevention",
    "PSI-100": "prevention", "PSI-102": "detection", "PSI-101": "detection", "PSI-69": "suppression",
}
FUEL_SCORE = {"solid": 1.0, "liquid": 0.5, "gas": 0.5, "aerosol": 0.0}
FUEL_WORDS = {"solid": "Solid fuel, like cabin materials.", "liquid": "Liquid fuel droplets.",
              "gas": "Gas flames.", "aerosol": "Dust or smoke samples, not a burning fuel."}


def weights_from(w_pillar: Optional[float] = None, w_evidence: Optional[float] = None,
                 w_data: Optional[float] = None, w_fuel: Optional[float] = None):
    """(normalised weights, are they the defaults). A weight not given keeps its default 0.25."""
    given = {"pillar": w_pillar, "evidence": w_evidence, "data": w_data, "fuel": w_fuel}
    if all(v is None for v in given.values()):
        return dict(DEFAULT_WEIGHTS), True
    raw = {k: (DEFAULT_WEIGHTS[k] if v is None else float(v)) for k, v in given.items()}
    if any(v < 0 for v in raw.values()):
        raise BadQuery("weights must be 0 or more")
    total = sum(raw.values())
    if total <= 0:
        raise BadQuery("at least one weight must be above 0")
    return {k: v / total for k, v in raw.items()}, False


def _name(inv: Dict[str, Any], pid: str) -> str:
    return (inv.get("acronym") or "").strip() or pid


def pillar_part(pid: str, inv: Dict[str, Any]) -> Dict[str, Any]:
    pillar = inv["pillar"]
    if CHALLENGE_PILLARS.get(pid) == pillar:
        return {"score": 1.0, "reason": f"Named by the challenge page for {pillar}."}
    if pillar in FIRE_PILLARS:
        return {"score": 0.5, "reason": f"Tagged {pillar} by our curation; the challenge page does not name it."}
    return {"score": 0.0, "reason": f"{pillar.capitalize()} research, not one of the three fire-safety pillars."}


def evidence_part(pid: str, inv: Dict[str, Any], cov_row: Dict[str, Any], air_label: str) -> Dict[str, Any]:
    stated, inside = cov_row["stated"], cov_row["inside"]
    name = _name(inv, pid)
    if not stated:
        return {"score": 0.0, "inside": None, "stated": 0,
                "reason": f"No {name} table states the oxygen and pressure needed to check {air_label}."}
    return {"score": round(inside / stated, 4), "inside": inside, "stated": stated,
            "reason": f"{inside} of {stated} {name} tests ran inside {air_label}."}


def data_part(summary: Dict[str, Any]) -> Dict[str, Any]:
    tables, files = summary["table_count"], summary["files_count"]
    score = (0.5 if tables else 0.0) + (0.5 if files else 0.0)
    t = f"{tables} experimental table{'s' if tables != 1 else ''}"
    f = f"{files} downloadable file{'s' if files != 1 else ''}"
    return {"score": score, "reason": f"{t} and {f} in PSI."}


def fuel_part(inv: Dict[str, Any]) -> Dict[str, Any]:
    phase = inv["fuel_phase"]
    return {"score": FUEL_SCORE.get(phase, 0.0), "reason": FUEL_WORDS.get(phase, f"Fuel phase {phase}.")}


def rank(catalog, air: air_mod.Air, weights: Optional[Dict[str, float]] = None,
         weights_are_default: Optional[bool] = None) -> Dict[str, Any]:
    """The 24 investigations ordered by score for this air, each part with its reason.

    `air` is a preset id or an air from air.resolve(); a custom air also reports its `window`.
    """
    catalog._need()
    if weights is None:
        weights, weights_are_default = dict(DEFAULT_WEIGHTS), True
    preset = air if isinstance(air, dict) else air_mod.preset(air)
    cov = air_mod.coverage(catalog, preset)
    by_pid = {i["psi_id"]: i for s in cov["stages"].values() for i in s["investigations"]}
    # A custom plain already ends in "(... psi)": a comma reads better than nested brackets.
    air_label = (f"this custom air, {preset['plain']}" if preset["id"] == "custom"
                 else f"this air ({preset['plain']})")
    rows = []
    for pid, inv in catalog.investigations.items():      # PSI number order: ties keep it
        summary = catalog._summaries[pid]
        parts = {"pillar": pillar_part(pid, inv), "evidence": evidence_part(pid, inv, by_pid[pid], air_label),
                 "data": data_part(summary), "fuel": fuel_part(inv)}
        score = round(sum(weights[p] * parts[p]["score"] for p in PARTS), 4)
        top = max(PARTS, key=lambda p: (weights[p] * parts[p]["score"], -PARTS.index(p)))
        # One sentence a visitor reads: the part that adds most to the score, then the evidence in this air.
        reason = parts[top]["reason"] if top == "evidence" else f"{parts[top]['reason']} {parts['evidence']['reason']}"
        rows.append({"psi_id": pid, "acronym": summary["acronym"], "pillar": inv["pillar"], "stage": inv["stage"],
                     "score": score, "parts": parts, "reason": reason})
    rows.sort(key=lambda r: -r["score"])                  # stable sort: equal scores stay in PSI order
    for i, r in enumerate(rows, start=1):
        r["rank"] = i
    items = [{"rank": r["rank"], **{k: v for k, v in r.items() if k != "rank"}} for r in rows]
    out: Dict[str, Any] = {"air": preset["id"]}
    if preset["id"] == "custom":               # a preset id names its window; a custom point says it
        out["window"] = preset["window"]
    out.update(weights=weights, weights_are_default=bool(weights_are_default), formula=FORMULA, items=items)
    return out
