"""Cabin air presets and what PSI tested in them (Linear DOB-83): /air/presets, /air/window, /air/coverage.

A preset is a window on oxygen (mole fraction) and pressure (kPa). Every preset names its
source. Fixed atmospheres get the team's tolerance (decided 14 November 2026): plus or minus
1 percentage point of oxygen and plus or minus 5% of the pressure. An open window ("30% oxygen
or more at 10.2 psi or less") is used exactly as its source writes it, with nothing added.

Coverage counts test rows of the 22 PSI tables (pipeline/catalog/tables.py), never pooled
values: for each fire stage, how many tests state the quantities the window constrains, and
how many of those ran inside it. It says "not_stated" when no table states them, which is
different from "never_tested" (stated, but never inside).

A visitor may also choose a custom point (sliders on oxygen and pressure): it gets the same
tolerance as the fixed atmospheres, from the same function, and its slider ranges come from the
catalogued tests themselves (custom_ranges). The window logic lives here and nowhere else.
Standard library only.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Union

KPA_PER_PSI = 6.894757293168361
O2_TOLERANCE = 0.01          # plus or minus 1 percentage point
PRESSURE_TOLERANCE = 0.05    # plus or minus 5% of the pressure
TOLERANCE_PLAIN = "Counts a test within 1 point of oxygen and 5% of the pressure."
OPEN_PLAIN = "Used exactly as the source states it: no tolerance added."
STAGES = ("spread", "detect", "suppress")
PSI20 = ("PSI-20 (ACME BRE) record, objective 1: \"NASA-considered atmosphere for human space "
         "missions will be examined: 14.7 psia, 21 % oxygen: 10.2 psia, 26.5 %; and 8.2 psia, 34 % oxygen.\"")
CHALLENGE = "docs/00-challenge-description.md (challenge page): \"likely 30% oxygen or more at 10.2 psi or less\""
# Custom air (sliders): the steps, and the words a visitor reads.
O2_STEP = 0.005               # half a percentage point of oxygen
PRESSURE_STEP_KPA = 0.5
CUSTOM_PLAIN = "The sliders cover the oxygen and pressure range of the catalogued PSI tests."
CUSTOM_SOURCE = "Chosen by the visitor. Not a NASA atmosphere."


def point_window(o2: float, kpa: float) -> Dict[str, Optional[float]]:
    """The window around one atmosphere (oxygen mole fraction, pressure in kPa): the team tolerance.

    The one place the tolerance is applied: the fixed presets and a visitor's custom point both use it.
    """
    return {"o2_min": round(o2 - O2_TOLERANCE, 4), "o2_max": round(o2 + O2_TOLERANCE, 4),
            "pressure_kpa_min": round(kpa * (1 - PRESSURE_TOLERANCE), 2),
            "pressure_kpa_max": round(kpa * (1 + PRESSURE_TOLERANCE), 2),
            "flow_cm_s_min": None, "flow_cm_s_max": None}


def _point(o2: float, psi: float) -> Dict[str, Optional[float]]:
    return point_window(o2, psi * KPA_PER_PSI)


def _open(o2_min=None, o2_max=None, kpa_min=None, kpa_max=None) -> Dict[str, Optional[float]]:
    return {"o2_min": o2_min, "o2_max": o2_max, "pressure_kpa_min": kpa_min, "pressure_kpa_max": kpa_max,
            "flow_cm_s_min": None, "flow_cm_s_max": None}


PRESETS: List[Dict[str, Any]] = [
    {"id": "station", "label": "Station cabin",
     "plain": "About 21% oxygen at 14.7 psi, like air at sea level",
     "window": _point(0.21, 14.7), "tolerance_plain": TOLERANCE_PLAIN,
     "source": PSI20 + " Also the challenge page: Earth's sea-level pressure is 14.7 psi."},
    {"id": "exploration", "label": "Exploration atmosphere",
     "plain": "30% oxygen or more, at 10.2 psi or less",
     "window": _open(o2_min=0.30, kpa_max=round(10.2 * KPA_PER_PSI, 2)), "tolerance_plain": OPEN_PLAIN,
     "source": CHALLENGE + ", for the Moon base and pressurized rovers."},
    {"id": "intermediate_26_5", "label": "26.5% oxygen at 10.2 psi",
     "plain": "26.5% oxygen at 10.2 psi, a NASA-considered cabin atmosphere",
     "window": _point(0.265, 10.2), "tolerance_plain": TOLERANCE_PLAIN, "source": PSI20},
    {"id": "exploration_34", "label": "34% oxygen at 8.2 psi",
     "plain": "34% oxygen at 8.2 psi, a NASA-considered cabin atmosphere",
     "window": _point(0.34, 8.2), "tolerance_plain": TOLERANCE_PLAIN, "source": PSI20},
    {"id": "high_oxygen", "label": "High oxygen",
     "plain": "40% oxygen or more, at any pressure",
     "window": _open(o2_min=0.40), "tolerance_plain": OPEN_PLAIN,
     "source": "docs/04-researchers-guide-iss-combustion.md: the ISS droplet hardware (MDCA) and SoFIE "
               "run up to 40% oxygen. A stress case, not a planned cabin."},
]
DEFAULT = "station"
_BY_ID = {p["id"]: p for p in PRESETS}


class UnknownAir(Exception):
    """An air value that is not a preset id."""


class BadAir(ValueError):
    """A custom point that is missing, not a number, or outside the slider ranges."""


def presets(catalog=None) -> Dict[str, Any]:
    """The presets; with a catalog, also the custom-air slider ranges (`custom`) and their sentence."""
    out: Dict[str, Any] = {"default": DEFAULT, "presets": PRESETS}
    if catalog is not None:
        out["custom"] = custom_ranges(catalog)
        out["custom_plain"] = CUSTOM_PLAIN
    return out


def _outward(value: float, step: float, fn) -> float:
    """value rounded to a multiple of step, down (math.floor) or up (math.ceil)."""
    return round(fn(round(value / step, 6)) * step, 6)


def custom_ranges(catalog) -> Dict[str, float]:
    """Slider ranges for a custom air, from the data: the oxygen and pressure span of the catalogued tests.

    The rows are the ones coverage counts (every test row of the 22 tables, no note lines). The
    smallest and largest stated value are rounded outward to the step (oxygen 0.005, pressure
    0.5 kPa). Pressure counts only values above 0 kPa, so FLEX test 114's published 0 mmHg (flagged
    suspect_pressure; nothing burns in a vacuum) cannot start the slider at zero, and the minimum is
    at least one step.
    """
    catalog._need()
    rows = [t for t in catalog.tests if not t["is_note"]]
    o2 = [t["o2_mole_fraction"] for t in rows if t["o2_mole_fraction"] is not None]
    kpa = [t["pressure_kpa"] for t in rows if t["pressure_kpa"] is not None and t["pressure_kpa"] > 0]
    if not o2 or not kpa:
        raise BadAir("no catalogued test states oxygen and pressure, so there is no range for a custom air")
    return {"o2_min": _outward(min(o2), O2_STEP, math.floor), "o2_max": _outward(max(o2), O2_STEP, math.ceil),
            "o2_step": O2_STEP,
            "pressure_kpa_min": max(PRESSURE_STEP_KPA, _outward(min(kpa), PRESSURE_STEP_KPA, math.floor)),
            "pressure_kpa_max": _outward(max(kpa), PRESSURE_STEP_KPA, math.ceil),
            "pressure_kpa_step": PRESSURE_STEP_KPA}


def _fmt(value: float, places: int) -> str:
    """A number for a sentence: at most `places` decimals, no trailing zeros (26.5, 21, 101.4)."""
    text = f"{value:.{places}f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def custom_air(catalog, o2: Any, pressure_kpa: Any) -> Dict[str, Any]:
    """A preset-shaped air for a visitor's point, with the same tolerance as the fixed atmospheres.

    o2 (mole fraction) and pressure_kpa may come straight from the query string: both are
    required, must be numbers and must lie inside custom_ranges, or BadAir names the range.
    """
    r = custom_ranges(catalog)
    both = (f"A custom air needs both o2 (oxygen mole fraction, from {_fmt(r['o2_min'], 3)} to "
            f"{_fmt(r['o2_max'], 3)}) and pressure_kpa (kPa, from {_fmt(r['pressure_kpa_min'], 1)} to "
            f"{_fmt(r['pressure_kpa_max'], 1)}), the range of the catalogued PSI tests "
            f"(GET /api/v1/air/presets, field custom).")
    values = []
    for name, raw, lo, hi in (("o2", o2, r["o2_min"], r["o2_max"]),
                              ("pressure_kpa", pressure_kpa, r["pressure_kpa_min"], r["pressure_kpa_max"])):
        if raw is None:
            raise BadAir(f"{name} is missing. {both}")
        try:
            v = float(raw)
        except (TypeError, ValueError):
            raise BadAir(f"{name} must be a number, not '{raw}'. {both}")
        if not lo <= v <= hi:                        # also refuses nan
            raise BadAir(f"{name} {_fmt(v, 4)} is outside its range. {both}")
        values.append(v)
    o2_v, kpa_v = values
    return {"id": "custom", "label": "Custom air",
            "plain": f"{_fmt(o2_v * 100, 1)}% oxygen at {_fmt(kpa_v, 1)} kPa ({_fmt(kpa_v / KPA_PER_PSI, 1)} psi)",
            "tolerance_plain": TOLERANCE_PLAIN, "source": CUSTOM_SOURCE,
            "window": point_window(o2_v, kpa_v), "point": {"o2_mole_fraction": o2_v, "pressure_kpa": kpa_v}}


Air = Union[str, Dict[str, Any]]


def resolve(catalog, air_id: str, o2: Any = None, pressure_kpa: Any = None) -> Dict[str, Any]:
    """The air a route answers for: a custom point when o2 or pressure_kpa is given (both are then
    required, and they win over air_id), otherwise the preset air_id."""
    if o2 is None and pressure_kpa is None:
        return preset(air_id)
    return custom_air(catalog, o2, pressure_kpa)


def preset(air_id: str) -> Dict[str, Any]:
    p = _BY_ID.get((air_id or "").strip())
    if p is None:
        raise UnknownAir(f"air must be one of {', '.join(_BY_ID)} (GET /api/v1/air/presets), not '{air_id}'")
    return p


def constrained(window: Dict[str, Optional[float]]) -> List[str]:
    """The shared columns a window puts a bound on."""
    cols = []
    for name, col in (("o2", "o2_mole_fraction"), ("pressure_kpa", "pressure_kpa"), ("flow_cm_s", "flow_cm_s")):
        key = "o2" if name == "o2" else name
        if window.get(f"{key}_min") is not None or window.get(f"{key}_max") is not None:
            cols.append(col)
    return cols


def inside(t: Dict[str, Any], window: Dict[str, Optional[float]]) -> bool:
    for key, col in (("o2", "o2_mole_fraction"), ("pressure_kpa", "pressure_kpa"), ("flow_cm_s", "flow_cm_s")):
        lo, hi, v = window.get(f"{key}_min"), window.get(f"{key}_max"), t[col]
        if lo is None and hi is None:
            continue
        if v is None or (lo is not None and v < lo) or (hi is not None and v > hi):
            return False
    return True


def _status(stated: int, n_inside: int) -> str:
    return "not_stated" if stated == 0 else ("tested" if n_inside else "never_tested")


def coverage(catalog, air: Air) -> Dict[str, Any]:
    """Per fire stage and per investigation: tests that state the window's quantities, and how many ran inside.

    `air` is a preset id or an air from resolve() (a custom point). `other` holds the
    investigations with no fire stage (fundamentals and related research), so a visitor still
    sees, for example, gas flames run in an exploration atmosphere.
    """
    catalog._need()
    p = air if isinstance(air, dict) else preset(air)
    window, cols = p["window"], constrained(p["window"])
    per: Dict[str, Dict[str, int]] = {}
    for t in catalog.tests:
        if t["is_note"]:
            continue
        c = per.setdefault(t["psi_id"], {"stated": 0, "inside": 0})
        if all(t[col] is not None for col in cols):
            c["stated"] += 1
            c["inside"] += inside(t, window)
    stages: Dict[str, Any] = {}
    for stage in STAGES + ("other",):
        invs = []
        for pid, inv in catalog.investigations.items():
            if (inv["stage"] or "other") != stage:
                continue
            c = per.get(pid, {"stated": 0, "inside": 0})
            invs.append({"psi_id": pid, "status": _status(c["stated"], c["inside"]),
                         "inside": c["inside"] if c["stated"] else None, "stated": c["stated"]})
        stated = sum(i["stated"] for i in invs)
        n_inside = sum(i["inside"] or 0 for i in invs)
        stages[stage] = {"status": _status(stated, n_inside), "inside": n_inside if stated else None,
                         "stated": stated, "investigations": invs}
    return {"air": p["id"], "window": window, "constrains": cols, "stages": stages}


def apply_to_query(q, air_id: Optional[str]) -> None:
    """Narrow a TestQuery to a preset's window (the tighter bound wins when both are given)."""
    if not air_id:
        return
    w = preset(air_id)["window"]
    for name, key in (("o2", "o2"), ("pressure", "pressure_kpa"), ("flow", "flow_cm_s")):
        lo, hi = w.get(f"{key}_min"), w.get(f"{key}_max")
        mine_lo, mine_hi = getattr(q, f"{name}_min"), getattr(q, f"{name}_max")
        if lo is not None:
            setattr(q, f"{name}_min", lo if mine_lo is None else max(lo, mine_lo))
        if hi is not None:
            setattr(q, f"{name}_max", hi if mine_hi is None else min(hi, mine_hi))
