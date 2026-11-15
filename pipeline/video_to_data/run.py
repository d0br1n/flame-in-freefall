# Code generated with SI assistance (Claude Code), reviewed by the team.
"""One command from the downloaded BASS-II videos (PSI-25) to the hand-over folder (DOB-41).

    uv run --python 3.12 --with-requirements pipeline/video_to_data/requirements.txt \
        python -m pipeline.video_to_data.run [--videos data/raw/files/PSI-25] \
        [--out data/modules/video-to-data] [--only B1,B4]

For every video named in config.csv: track the flame (track.py, 5 samples per second, samples
before `track_start_s` and after the optional `track_end_s` dropped), find ignition and extinction (events.py), fit the spread rate on
the leading edge between ignition and extinction (fit.py), then write the evidence, findings,
results table, not-measurable list, per-test images, curve and overlay clip, validation stub and
module.json into the output folder. No pixel scale exists in the videos, so rates are in px/s and
carry the flag `no_scale`. Nothing here is tuned to a published value.

The assembly (records, findings, tables) is pure: the `build_*` functions take already measured
values and return the records, so they run without any video. Output is deterministic: running
twice gives byte-identical files (the overlay clip is encoded single-threaded with bit-exact
flags; if a different ffmpeg build ever changes its bytes, compare the other files).
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

from . import events, faint, fit, grades, overlay, review_clip, stages, track

ROOT = Path(__file__).resolve().parents[2]
ENGINE_DIR = Path(__file__).resolve().parent

# One background policy for every video. False: the tracker uses the raw brightness signal.
# True: the per-pixel median of the samples inside each test's pre-ignition range is subtracted.
BACKGROUND_SUBTRACTION = False

FPS = 5.0           # samples per second
SEED = 0            # every random step (the fit's bootstrap) uses this seed
MODULE = "video-to-data"
PSI = "PSI-25"
LINK = "https://psi.nasa.gov"
REPORT_FILE = "PSI-25_Reports_BASS-II Summary Report.pdf"
TABLE_FILE = "PSI-25_Experimental table_BASS-II.csv"
HAND_CHECK_ID = "find-example-tracker-vs-hand"  # same id as the placeholder, the site may key on it
MAX_CLIP_S = 20.0
MAX_CLIP_BYTES = 800_000
CLIP_MAX_FPS = 30

RESULTS_COLUMNS = [
    "test_id", "segment", "sample", "material", "thickness_mm", "width_mm", "flow_direction",
    "o2_before", "o2_after", "ignition_time_s", "extinction_time_s", "outcome", "rate",
    "rate_unit", "rate_ci_low", "rate_ci_high", "window_start_s", "window_end_s", "flags",
    "pixel_scale_px_per_mm", "published_value", "signed_error", "provenance", "psi_file",
]
NOT_MEASURABLE_COLUMNS = ["test_id", "file_name", "reason"]
READOUT_COLUMNS = ["time_s", "fuel", "fan", "air", "rad", "clock_s"]
FAN_WINDOW_S = 3.0        # the median FAN reading in this many seconds after ignition
FAN_MIN_READINGS = 3
FALL_WINDOW_S = 3.0       # flame gone this soon after the fan voltage began to fall (headline)
B1_REPORT_WINDOW_S = 2.0  # NASA: the flame extinguished within 2 s of the flow being cut off
B1_REPORT_TOLERANCE_S = 0.5  # read-out refresh and tracker loss of the last dim flame
FAN_UNIT = "V x10"        # NASA: fan voltage x10 on the video display (maximum 122 = 12.2 V)
AIR_UNIT = "cm/s"
AIR_NOTE = "NASA's duct flow sensor, slow to respond (about 1 min)"
CLOCK_BAND = (0.99, 1.01)
CURVE_COLUMNS = ["time_s", "leading_edge_px", "trailing_edge_px", "area_px", "flame_light", "stage"]
STEPS_MAX_BYTES = 200_000
STEPS_PANEL = (480, 320)  # width, height of each of the four panels
STEPS_CLIP_MAX_BYTES = 1_000_000
STEPS_CLIP_CRFS = (28, 32, 36, 40, 44)
STEPS_CLIP_FPS_DIVISORS = (1, 2, 3)   # lower the frame rate only when no quality fits
STEPS_CLIP_LABELS = ("1 NASA's frame + outline", "2 Brightness", "3 Flame mask")
INDEX_FILE = "index.json"
# The outcome check (outcome_check.csv) is built but the owner has not decided how to show it.
USE_OUTCOME_CHECK = False
LIGHT_UNIT = "relative units, uncalibrated"
LIGHT_NOTE = ("Flame light is a relative brightness measure from uncalibrated 8-bit video with "
              "saturated flame cores; it is not a temperature.")

# What an SI viewer saw on contact sheets before any tracker output. A flag, never a filter.
EYE_FLAGS = {"spreading": [], "doubtful": ["eye_doubtful"], "no_spread": ["eye_no_spread"]}

CANNOT_TELL = [
    "There is no partial-gravity data in PSI-25.",
    "A dim blue flame can vanish from video before it is truly out.",
    "The FAN read-out is the fan voltage times ten, not an air speed.",
    "Rates without a reliable scale are in pixels per second.",
    "Results describe these BASS-II samples, not a cabin fire.",
    "Positions and rates are in pixels because no scale reference is visible in the videos.",
    "The last dim seconds of a flame can be below the tracker's threshold.",
    "The AIR read-out is NASA's measured flow speed in cm/s, but the sensor takes about a minute "
    "to respond, so it lags behind any change.",
    "The time between the fan voltage starting to fall and the flame leaving the video is good to "
    "about half a second: the read-out refreshes 5 times a second and the tracker loses the last "
    "dim half second of a flame.",
    "Flame light is a relative brightness measure from uncalibrated 8-bit video with saturated "
    "flame cores; it is not a temperature.",
    "The stage names follow NIST's description of a fuel-limited fire; where one stage ends and "
    "the next begins is our own rule, and it describes this small test flame, not the hazard of a "
    "cabin fire.",
    "Ignition time is the first light in the video, the igniter spark included; it can be up to "
    "about 2.5 s before the flame is established.",
    "The T-series outcomes were graded by SI from brightened frames and the fan voltage history, "
    "not measured by the tracker; the dim fabric flames are too faint for it.",
    faint.LIMIT_TEXT,
]
FAINT_FILE = "faint_light.csv"
T_NOTE = ("Graded by SI from brightened frames and the fan voltage history, blind to NASA's "
          "outcomes. Not a measurement by the tracker.")
T_FINDING_ID = "find-t-series-si-grades-vs-table-7-1"
T_CHECK_FINDING_ID = "find-t-series-person-check"
CHECKED_FILE = "t_series_checked.csv"
CHECK_NOTE = ("One team member checked the SI grades against video brightened x6, without "
              "looking at NASA's outcomes (they were hidden on the review page; the checker "
              "states this, the check was not supervised).")

FILE_KINDS = [
    (re.compile(r"_steps\.jpg$"), "image",
     "Four panels of one sampled frame: the frame, the brightness signal, the flame mask, and the "
     "outline with the two edge lines."),
    (re.compile(r"_stepsclip\.mp4$"), "clip",
     "Detection steps as a clip with the same timing as the overlay clip: three panels side by "
     "side, NASA's frame with the tracked outline, the brightness signal the tracker thresholds "
     "(relative, not a temperature) and the flame mask."),
    (re.compile(r"_readout\.csv$"), "table",
     "On-screen numbers read from the video: the field labelled FUEL (by elimination NASA's N2 flow "
     "rate in cm3/min; the report does not name the label), FAN (fan voltage x10), AIR (NASA's "
     "measured flow speed, cm/s, slow sensor), RAD (NASA's radiometer, uncalibrated, relative) and "
     "the clock; empty cell where unreadable."),
    (re.compile(r"_kymograph\.png$"), "image",
     "Kymograph: brightness along the spread axis against time, with the two tracked edges."),
    (re.compile(r"_still[123]\.jpg$"), "image",
     "Frame from the video with the tracked flame outline and edge lines drawn."),
    (re.compile(r"_curve\.csv$"), "table",
     "Leading edge, trailing edge, flame area (pixels), flame light (relative, uncalibrated) and "
     "stage against time over the lit range."),
    (re.compile(r"_review\.mp4$"), "clip",
     "T-series review clip: the video with the picture below row 90 brightened x6 (clipped at "
     "white) so the dim flame can be seen; NASA's on-screen numbers in the top rows are as "
     "recorded. A way to look, not a measurement."),
    (re.compile(r"_overlay\.mp4$"), "clip",
     "Short clip of the lit range with the tracked flame outline and edge lines drawn."),
]


# ---------------------------------------------------------------- small pure helpers

def natural_key(test_id):
    """Sort key so that PSI-25/B2 comes before PSI-25/B10."""
    return [int(p) if p.isdigit() else p for p in re.split(r"(\d+)", test_id)]


def slug(test_id):
    """File-name prefix of a test: the test ID with `_` in place of `/`."""
    return test_id.replace("/", "_")


def short_name(test_id):
    """`PSI-25/B1` -> `B1`."""
    return test_id.split("/", 1)[1]


def asset_names(test_id):
    """The six per-test file names, keyed by role."""
    s = slug(test_id)
    return {"kymograph": f"{s}_kymograph.png", "still1": f"{s}_still1.jpg",
            "still2": f"{s}_still2.jpg", "still3": f"{s}_still3.jpg",
            "curve": f"{s}_curve.csv", "clip": f"{s}_overlay.mp4",
            "readout": f"{s}_readout.csv", "steps": f"{s}_steps.jpg"}


def steps_clip_name(test_id):
    """File name of the detection-steps clip. Not in `asset_names`: evidence records do not list
    it, and a test may have none when no encoding fits the size limit."""
    return f"{slug(test_id)}_stepsclip.mp4"


def asset_list(test_id):
    return sorted(asset_names(test_id).values())


def merge_flags(*lists):
    """Sorted, de-duplicated flags; the placeholder flag `example` never survives."""
    out = {f for flags in lists for f in (flags or [])}
    out.discard("example")
    return sorted(out)


def _num(text):
    """A float from table text, or None."""
    try:
        value = float(str(text).strip())
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def _r(value, nd=3):
    return None if value is None else round(float(value), nd) + 0.0


def _blank(value):
    return "" if value is None else value


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


# ---------------------------------------------------------------- config

def parse_config(rows):
    """Config rows -> (usable rows, skipped). Read by column name; optional columns may be absent.

    Rows with an empty test_id are skipped and returned as not-measurable entries.
    """
    usable, skipped = [], []
    for raw in rows:
        file_name = (raw.get("file_name") or "").strip()
        test_id = (raw.get("test_id") or "").strip()
        if not test_id:
            skipped.append({"test_id": "", "file_name": file_name,
                            "reason": "test identity not resolved"})
            continue

        def box(key):
            text = (raw.get(key) or "").strip()
            return tuple(int(float(v)) for v in text.split(",")) if text else None

        usable.append({
            "file_name": file_name, "test_id": test_id,
            "axis": (raw.get("axis") or "x").strip() or "x",
            "direction": int(float(raw.get("direction") or 1)),
            "track_start_s": float(raw.get("track_start_s") or 0),
            "pre_start_s": float(raw.get("pre_ignition_start_s") or 0),
            "pre_end_s": float(raw.get("pre_ignition_end_s") or 0),
            "igniter_box": box("igniter_box"), "roi": box("roi"),
            "track_end_s": (float(raw["track_end_s"]) if (raw.get("track_end_s") or "").strip()
                            else None),
            "eye_quality": (raw.get("eye_quality") or "").strip(),
            "viewed_by": (raw.get("viewed_by") or "").strip(),
            "notes": (raw.get("notes") or "").strip(),
        })
    return usable, skipped


def unresolved_reason(manifest_row):
    """Reason text for a config row with no test ID; names the table row the sample and day fit."""
    reason = "test identity not resolved"
    notes = (manifest_row or {}).get("match_notes") or ""
    table = re.search(r"agree with table row (B\d+)", notes)
    named = (manifest_row or {}).get("test")
    if table and named:
        reason += f" (file named {named}, sample and day of {table.group(1)})"
    return reason


def conditions_from_manifest(row):
    """Test conditions from a manifest row.

    `fan_display` and `air_display` keep NASA's table text: fan voltage x10 (or a pot setting, as
    the table gives it) and air in cm/s.
    """
    out = {}
    for key in ("material_text", "thickness_mm", "width_mm", "o2_initial_pct", "o2_final_pct",
                "fan_display", "air_display", "flow_restrictor"):
        text = (row.get(key) or "").strip()
        if not text:
            continue
        if key in ("thickness_mm", "width_mm", "o2_initial_pct", "o2_final_pct"):
            value = _num(text)
            out[key] = value if value is not None else text
        else:
            out[key] = text
    return out


# ---------------------------------------------------------------- records

def fan_summary(rows, ignition_s, extinction_s):
    """Fan read-out quantities of one test from its read-out rows (time_s, fan, air, clock_s).

    FAN is the fan voltage times ten (unit "V x10"); nothing here converts it to a speed. AIR is
    NASA's measured flow speed in cm/s. Returns None when no FAN reading exists. Changes are those
    from `overlay.fan_changes` at or after ignition. `drop_time` is the time the last sustained
    fall BEGAN and `settled_time` the time the reading settled at its new level (both from
    `overlay.fan_fall_times` over the whole read-out series).
    """
    times = [r["time_s"] for r in rows]
    fans = [r.get("fan") for r in rows]
    readings = [(t, f) for t, f in zip(times, fans) if f is not None]
    if not readings:
        return None
    after = sorted(f for t, f in readings if ignition_s <= t <= ignition_s + FAN_WINDOW_S)
    at_ign = None
    if len(after) >= FAN_MIN_READINGS:
        mid = len(after) // 2
        at_ign = float(after[mid]) if len(after) % 2 else (after[mid - 1] + after[mid]) / 2.0
    airs = sorted(r["air"] for r in rows if r.get("air") is not None
                  and ignition_s <= r["time_s"] <= ignition_s + FAN_WINDOW_S)
    air_ign = None
    if len(airs) >= FAN_MIN_READINGS:
        mid = len(airs) // 2
        air_ign = float(airs[mid]) if len(airs) % 2 else (airs[mid - 1] + airs[mid]) / 2.0
    n_air = len(airs)
    changes = [c for c in overlay.fan_changes(times, fans) if c[0] >= ignition_s]
    fall = overlay.fan_fall_times(times, fans)
    drop, settled = (None, None) if fall is None else (fall[0], fall[1])
    rate, n_clock = overlay.clock_rate(times, [r.get("clock_s") for r in rows])
    return {"n_fan": len(readings), "at_ignition": at_ign, "air_at_ignition": air_ign,
            "n_air": n_air, "changes": changes, "drop_time": drop, "settled_time": settled,
            "gone_minus_drop": (None if drop is None or extinction_s is None
                                else extinction_s - drop),
            "clock_rate": rate, "n_clock": n_clock}


def fan_changes_text(changes):
    """`39.01 s: 62 to 38; ...` or `none`."""
    if not changes:
        return "none"
    return "; ".join(f"{t:.2f} s: {a} to {b}" for t, a, b in changes)


def build_evidence(m):
    """Evidence records of one measured test.

    m: {test_id, file_name, direction, manifest_row, rows (track rows from ignition on or all
    rows), events, fit, n_samples}. Returns a list of records (no PUBLISHED ones).
    """
    test_id, ev, ft = m["test_id"], m["events"], m["fit"]
    short = short_name(test_id)
    ev_flags = ev.get("flags", [])
    base_flags = merge_flags(ev_flags)
    source = {"psi_id": PSI, "file": m["file_name"], "link": LINK}
    conditions = conditions_from_manifest(m.get("manifest_row") or {})
    if m.get("notes"):
        conditions["viewing_note"] = m["notes"]
    if m.get("viewed_by"):
        conditions["viewed_by"] = m["viewed_by"]
    eye_flags = EYE_FLAGS.get(m.get("eye_quality") or "", [])
    assets = asset_list(test_id)
    n_samples = max(1, int(m["n_samples"]))

    def rec(quantity, value, unit, n, flags, uncertainty=None, extra=None):
        r = {"id": f"ev-{short}-{quantity}", "module": MODULE, "test_id": test_id,
             "quantity": quantity, "value": value, "unit": unit}
        if uncertainty is not None:
            r["uncertainty"] = uncertainty
        r.update({"n": max(1, int(n)), "conditions": {**conditions, **(extra or {})},
                  "provenance": "VIDEO_MEASURED", "source": dict(source),
                  "assets": list(assets), "flags": flags})
        return r

    out = [rec("ignition_time", _r(ev["ignition_time_s"]), "s", n_samples, base_flags)]
    if not ev["censored"] and ev.get("extinction_time_s") is not None:
        out.append(rec("extinction_time", _r(ev["extinction_time_s"]), "s", n_samples, base_flags))
        out.append(rec("burn_duration", _r(ev["burn_duration_s"]), "s", n_samples, base_flags))
    outcome_flags = base_flags
    if ft.get("rate") is None:
        outcome_flags = merge_flags(base_flags, ft.get("flags"))
    out.append(rec("outcome", ev["outcome"], "", n_samples, outcome_flags))
    if ft.get("rate") is not None:
        fit_flags = merge_flags(ev_flags, ft.get("flags"), eye_flags)
        method = (f"{ft.get('ci_method') or 'interval'}; steady window "
                  f"{ft['window_start_s']:.2f} to {ft['window_end_s']:.2f} s, "
                  f"{ft['n_points']} points, seed {ft.get('seed', SEED)}")
        extra = ({"fit_intercept_px": _r(ft["intercept_px"])}
                 if ft.get("intercept_px") is not None else None)
        out.append(rec("spread_rate", _r(ft["rate"]), ft["unit"], ft["n_points"], fit_flags,
                       {"interval": [_r(ft["ci_low"]), _r(ft["ci_high"])], "method": method},
                       extra=extra))
        if ft.get("travel") is not None:
            out.append(rec("leading_edge_travel", _r(ft["travel"]), "px", ft["n_points"],
                           fit_flags))
    fl = m.get("faint")
    if fl is not None and fl.get("time_s") is not None:
        out.append(rec("last_faint_light_time", _r(fl["time_s"]), "s", fl["n_detected"],
                       merge_flags(["threshold_dependent"], fl.get("flags")),
                       extra={"basis": fl["basis"], "viewed_by": fl["viewed_by"],
                              "rule": faint.RULE_TEXT, "note": faint.LIMIT_TEXT}))
    st = m.get("stages")
    if st is not None:
        st_flags = merge_flags(ev_flags, st.get("flags"))
        for stage in st["stages"]:
            out.append(rec("stage_duration_" + stage["stage"].replace(" ", "_"),
                           _r(stage["end_s"] - stage["start_s"]), "s", st["n_samples"], st_flags,
                           extra={"stage_rule": stages.STAGE_RULE_TEXT,
                                  "stage_names_source": stages.STAGE_CITATION}))
        if st.get("peak") is not None:
            out.append(rec("peak_flame_light", round(st["peak"], 1), LIGHT_UNIT, st["n_samples"],
                           st_flags, extra={"note": LIGHT_NOTE}))
    fs = None
    if m.get("readout") is not None:
        fs = fan_summary(m["readout"], ev["ignition_time_s"],
                         None if ev["censored"] else ev.get("extinction_time_s"))
    if fs is not None:
        text = {"fan_changes": fan_changes_text(fs["changes"])}
        if fs["at_ignition"] is not None:
            out.append(rec("fan_setting_at_ignition", _r(fs["at_ignition"]), FAN_UNIT,
                           fs["n_fan"], base_flags))
        if fs["air_at_ignition"] is not None:
            out.append(rec("air_speed_at_ignition", _r(fs["air_at_ignition"]), AIR_UNIT,
                           fs["n_air"], base_flags, extra={"note": AIR_NOTE}))
        out.append(rec("fan_setting_changes", len(fs["changes"]), "changes", fs["n_fan"],
                       base_flags, extra=text))
        if fs["drop_time"] is not None:
            out.append(rec("fan_drop_time", _r(fs["drop_time"]), "s", fs["n_fan"], base_flags,
                           extra=text))
            out.append(rec("fan_settled_time", _r(fs["settled_time"]), "s", fs["n_fan"],
                           base_flags, extra=text))
            if fs["gone_minus_drop"] is not None:
                out.append(rec("flame_gone_minus_fan_drop", _r(fs["gone_minus_drop"]), "s",
                               fs["n_fan"], base_flags, extra=text))
        if fs["clock_rate"] is not None:
            out.append(rec("clock_rate", round(fs["clock_rate"], 4), "clock s per video s",
                           fs["n_clock"], base_flags))
    return out


def build_published(measured_test_ids, published_rows):
    """PUBLISHED records, only for measured tests and only rows tied to exactly one test.

    Rows that name several tests (a figure caption list) or none (group values) are left out.
    """
    measured = set(measured_test_ids)
    out = []
    for row in published_rows:
        ids = [t.strip() for t in (row.get("test_ids") or "").split(";") if t.strip()]
        if len(ids) != 1 or ids[0] not in measured:
            continue
        test_id = ids[0]
        value_text = (row.get("value") or "").strip()
        number = _num(value_text)
        if number is not None:
            quantity = "published_" + ("spread_rate" if row["quantity"] == "steady_spread_rate"
                                       else row["quantity"])
            value, unit = number, (row.get("unit") or "").strip()
        else:
            quantity = "published_outcome_note" if row["quantity"] == "outcome" \
                else "published_" + row["quantity"]
            value, unit = value_text, ""
        flags = ["match_inferred"] if (row.get("match") or "").strip() == "inferred" else []
        file_match = re.search(r"\(([^)]+\.pdf)\)", row.get("source_document") or "")
        conditions = {k: v for k, v in (
            ("page_printed", _num(row.get("page_printed")) if _num(row.get("page_printed"))
             is not None else row.get("page_printed")),
            ("table_or_figure", row.get("table_or_figure")),
            ("published_row", row.get("row_id"))) if v not in (None, "")}
        if isinstance(conditions.get("page_printed"), float):
            conditions["page_printed"] = int(conditions["page_printed"])
        out.append({
            "id": f"ev-{short_name(test_id)}-{row['row_id']}", "module": MODULE,
            "test_id": test_id, "quantity": quantity, "value": value, "unit": unit, "n": 1,
            "conditions": conditions, "provenance": "PUBLISHED",
            "source": {"psi_id": PSI, "file": file_match.group(1) if file_match else REPORT_FILE,
                       "link": LINK},
            "flags": flags})
    return out


def _t_graded(rows):
    return [r for r in rows if (r.get("grade") or "").strip()]


def build_t_evidence(grade_rows):
    """(graded records, NASA published-outcome records) from t_series_grades.csv rows.

    The graded records are SI_EXTRACTED: an SI grader's label, not a tracker measurement.
    """
    graded, published = [], []
    for r in grade_rows:
        tid = r["test_id"]
        if (r.get("grade") or "").strip():
            flags = ["si_graded"] + (["low_confidence"] if r["confidence"].strip() == "low" else [])
            graded.append({
                "id": f"ev-{short_name(tid)}-si-grade", "module": MODULE, "test_id": tid,
                "quantity": "outcome_graded_by_si", "value": r["grade"].strip(), "unit": "", "n": 1,
                "conditions": {"confidence": r["confidence"], "reason": r["reason"],
                               "fan_history": r["fan_history"],
                               "flame_seen_from_s": r["flame_seen_from_s"],
                               "flame_gone_s": r["flame_gone_s"], "graded_by": r["graded_by"],
                               "note": T_NOTE},
                "provenance": "SI_EXTRACTED",
                "source": {"psi_id": PSI, "file": r["file_name"], "link": LINK},
                "flags": flags})
        if (r.get("nasa_outcome") or "").strip():
            row_id, _, page = r["nasa_source"].partition(", ")
            published.append({
                "id": f"ev-{short_name(tid)}-{row_id}", "module": MODULE, "test_id": tid,
                "quantity": "published_outcome", "value": r["nasa_outcome"].strip(), "unit": "",
                "n": 1, "conditions": {"published_row": row_id, "table_or_page": page},
                "provenance": "PUBLISHED",
                "source": {"psi_id": PSI, "file": REPORT_FILE, "link": LINK}, "flags": []})
    return graded, published


def t_series_check(grade_rows, graded_records):
    """The one check on the SI grades, counted from the rows; None when nothing was graded."""
    graded = _t_graded(grade_rows)
    if not graded:
        return None
    a = sum(1 for r in graded if r["match"] == "yes")
    c = sum(1 for r in graded if r["match"] == "undecided")
    d = sum(1 for r in graded if r["match"] == "no")
    b = len(graded)
    return {"id": T_FINDING_ID, "module": MODULE, "kind": "check",
            "text": (f"A blind SI grader matched NASA's published outcome in {a} of the {b} "
                     f"T-series tests that have a plain video; {c} could not be decided and {d} "
                     f"contradicted NASA's table. The fan voltage history carries much of the "
                     f"answer."),
            "value": a, "unit": "tests", "n": b, "provenance": "SI_EXTRACTED",
            "source": {"psi_id": PSI, "file": REPORT_FILE, "link": LINK},
            "evidence_ids": sorted((r["id"] for r in graded_records),
                                   key=natural_key),
            "passed": d == 0 and a >= 1}


def build_t_checked_evidence(checked, clips, readouts):
    """Evidence records of the person's check: one grade record per checked test, plus the flame
    times the person gave. HAND_MEASURED, one person, from brightened video."""
    out = []
    for c in checked:
        short = c["test"]
        source = {"psi_id": PSI, "file": c["file_name"], "link": LINK}
        cond = {"checked_by": c["by"], "checked_date": c["date"], "checked_note": c["note"],
                "saw_nasa_outcome_before_grading": "no, as stated by the checker"}
        assets = sorted(n for n in (clips.get(short), readouts.get(short)) if n)
        rec = {"id": f"ev-{short}-checked-grade", "module": MODULE, "test_id": c["test_id"],
               "quantity": "outcome_checked_by_person", "value": c["grade"], "unit": "", "n": 1,
               "conditions": dict(cond, si_grade=c["si_grade"], agrees_with_si=c["agrees_with_si"]),
               "provenance": "HAND_MEASURED", "source": source,
               "flags": ["person_viewed", "one_person"]}
        if assets:
            rec["assets"] = assets
        out.append(rec)
        for key, qty, suffix in (("flame_seen_from_s", "flame_seen_time_checked", "seen"),
                                 ("flame_gone_s", "flame_gone_time_checked", "gone")):
            if c[key] is not None:
                out.append({"id": f"ev-{short}-checked-{suffix}", "module": MODULE,
                            "test_id": c["test_id"], "quantity": qty, "value": c[key],
                            "unit": "s", "n": 1, "conditions": dict(cond),
                            "provenance": "HAND_MEASURED", "source": dict(source),
                            "flags": ["person_viewed", "one_person", "approximate"]})
    return out


def t_series_person_check(checked, records):
    """The finding on the person's check, counted from the rows; None when nothing was checked."""
    if not checked:
        return None
    n = len(checked)
    agreed = sum(1 for c in checked if c["agrees_with_si"] == "yes")
    changed = sum(1 for c in checked if c["agrees_with_si"] == "no")
    decided = [c for c in checked if c["agrees_with_si"] == "decided"]
    matches = sum(1 for c in checked if c["match"] == "yes")
    contradicts = sum(1 for c in checked if c["match"] == "no")
    if decided:
        parts = ", ".join(f"{c['test']} as {c['grade'].replace('_', ' ')}" for c in decided)
        decided_text = f"decided {parts}, where SI could not tell"
    else:
        decided_text = "decided none, because SI left none undecided"
    return {"id": T_CHECK_FINDING_ID, "module": MODULE, "kind": "check",
            "text": (f"One team member checked {n} of the SI grades of T-series tests against "
                     f"video brightened x6, without looking at NASA's outcomes (hidden on the review "
                     f"page; the checker states this, not supervised): agreed with {agreed}, "
                     f"{decided_text}, changed {changed}. The checked grade matches NASA's "
                     f"Table 7.1 in {matches} of {n} tests."),
            "value": matches, "unit": "tests", "n": n, "provenance": "HAND_MEASURED",
            "source": {"psi_id": PSI, "file": REPORT_FILE, "link": LINK},
            "evidence_ids": sorted((r["id"] for r in records
                                    if r["quantity"] == "outcome_checked_by_person"),
                                   key=natural_key),
            "passed": contradicts == 0}


def write_t_review(grade_rows, videos_dir, out_dir, clipper, reader):
    """Review clip and read-out of every T test whose video file exists.

    Returns ({test: clip dict}, {test: read-out file name}). The read-out is cut to the clip's
    range; when the reader finds no number at all (T13) no file is written and no entry is made.
    """
    clips, readouts = {}, {}
    for r in grade_rows:
        if not (r.get("file_name") or "").strip():
            continue
        video = Path(videos_dir) / r["file_name"]
        if not video.is_file():
            continue
        short = r["test"].strip()
        clip = clipper(video, Path(out_dir) / f"{slug(r['test_id'])}_review.mp4", short)
        clips[short] = clip
        rows = [x for x in reader(video, None)
                if clip["start_s"] <= x["time_s"] <= clip["end_s"]]
        if any(x.get(k) is not None for x in rows for k in ("fuel", "fan", "air", "rad")):
            name = f"{slug(r['test_id'])}_readout.csv"
            write_csv(Path(out_dir) / name, READOUT_COLUMNS, readout_rows(rows))
            readouts[short] = name
    return clips, readouts


def build_t_index(grade_rows, graded_records, published_records, checked=None, clips=None,
                  readouts=None):
    """The index.json block for the T-series, in test-number order, T20 included."""
    checked_by_test = {c["test"]: c for c in (checked or [])}
    clips, readouts = clips or {}, readouts or {}
    g = {r["test_id"]: r["id"] for r in graded_records}
    p = {r["test_id"]: r["id"] for r in published_records}
    tests = []
    for r in sorted(grade_rows, key=lambda r: natural_key(r["test_id"])):
        graded = bool((r.get("grade") or "").strip())
        tests.append({
            "test_id": r["test_id"], "label": short_name(r["test_id"]),
            "video_file": r["file_name"] or None, "nasa_outcome": r["nasa_outcome"] or None,
            "si_grade": r["grade"].strip() if graded else None,
            "confidence": r["confidence"] if graded else None,
            "match": r["match"], "reason": r["reason"],
            "fan_history": r["fan_history"] if graded else None,
            "evidence_id": g.get(r["test_id"]), "published_evidence_id": p.get(r["test_id"]),
            "si_times": {k: grades.leading_number(r.get(k))
                         for k in ("wire_glow_s", "flame_seen_from_s", "flame_gone_s")},
            "checked": _checked_entry(checked_by_test.get(short_name(r["test_id"]))),
            "clip": clips.get(short_name(r["test_id"])),
            "readout": readouts.get(short_name(r["test_id"]))})
    return {"note": ("The T-series (fabric strips with dim blue flames) cannot be followed by the "
                     "tracker. These outcomes were graded by SI from brightened frames and the "
                     "fan voltage history, blind to NASA's outcomes, and compared afterwards "
                     "with NASA's Table 7.1."),
            "graded_by": next((r["graded_by"] for r in grade_rows if r.get("graded_by")), ""),
            "checked_by": (f"{checked[0]['by']}, viewing brightened video, {checked[0]['date']}"
                           if checked else None),
            "check_note": CHECK_NOTE,
            "tests": tests}


def _checked_entry(c):
    if c is None:
        return None
    return {"by": c["by"], "date": c["date"], "grade": c["grade"],
            "flame_seen_from_s": c["flame_seen_from_s"], "flame_gone_s": c["flame_gone_s"],
            "note": c["note"], "agrees_with_si": c["agrees_with_si"], "match": c["match"],
            "evidence_id": f"ev-{c['test']}-checked-grade"}


def sort_evidence(records):
    return sorted(records, key=lambda r: (natural_key(r["test_id"]), r["provenance"] != "VIDEO_MEASURED",
                                          r["quantity"], r["id"]))


def check_unique(records):
    """Raise when two records share test + segment + quantity (the contract's rule)."""
    seen = set()
    for r in records:
        key = (r["test_id"], r.get("segment"), r["quantity"])
        if key in seen:
            raise ValueError(f"duplicate evidence key {key}")
        seen.add(key)


def build_results_row(m):
    """One results.csv row (a dict with exactly RESULTS_COLUMNS) for a measured test."""
    ev, ft = m["events"], m["fit"]
    man = m.get("manifest_row") or {}
    has_rate = ft.get("rate") is not None
    censored = ev["censored"]
    return {
        "test_id": m["test_id"], "segment": "whole", "sample": man.get("sample", ""),
        "material": man.get("material_text", ""), "thickness_mm": man.get("thickness_mm", ""),
        "width_mm": man.get("width_mm", ""),
        "flow_direction": ("+" if m["direction"] > 0 else "-") + m.get("axis", "x"),
        "o2_before": man.get("o2_initial_pct", ""), "o2_after": man.get("o2_final_pct", ""),
        "ignition_time_s": _blank(_r(ev["ignition_time_s"])),
        "extinction_time_s": "" if censored else _blank(_r(ev["extinction_time_s"])),
        "outcome": ev["outcome"],
        "rate": _blank(_r(ft["rate"])) if has_rate else "",
        "rate_unit": ft["unit"] if has_rate else "",
        "rate_ci_low": _blank(_r(ft["ci_low"])) if has_rate else "",
        "rate_ci_high": _blank(_r(ft["ci_high"])) if has_rate else "",
        "window_start_s": _blank(_r(ft["window_start_s"])) if has_rate else "",
        "window_end_s": _blank(_r(ft["window_end_s"])) if has_rate else "",
        "flags": ";".join(merge_flags(ev.get("flags"), ft.get("flags"),
                                      EYE_FLAGS.get(m.get("eye_quality") or "", []))),
        "pixel_scale_px_per_mm": "", "published_value": "", "signed_error": "",
        "provenance": "VIDEO_MEASURED", "psi_file": m["file_name"],
    }


def fan_headline(evidence, table_source, n):
    """Headline on how the flame leaving the video lines up with the fan voltage falling.

    Counted from the `flame_gone_minus_fan_drop` records (extinction time minus the time the
    fan voltage began to fall). Wording claims no cause.
    """
    gone = [r for r in evidence if r["quantity"] == "flame_gone_minus_fan_drop"]
    near = sorted(r["value"] for r in gone if 0 <= r["value"] <= FALL_WINDOW_S)
    before = sum(1 for r in gone if r["value"] < 0)
    later = sum(1 for r in gone if r["value"] > FALL_WINDOW_S)
    span = f" ({near[0]:.1f} to {near[-1]:.1f} s)" if near else ""
    text = (f"In {len(near)} of the {len(gone)} tests whose fan voltage was turned down at the end, "
            f"the flame left the video within {FALL_WINDOW_S:g} s after the voltage began to "
            f"fall{span}. In {before} it had already gone before the fall began.")
    if later:
        text += (f" In {later} the flame was still in the video more than {FALL_WINDOW_S:g} s "
                 f"after the fall began.")
    return {"id": "find-flame-gone-vs-fan-drop", "module": MODULE, "kind": "headline",
            "text": text, "value": len(near), "unit": "tests", "n": max(1, len(gone)),
            "provenance": "VIDEO_MEASURED", "source": dict(table_source),
            "evidence_ids": sorted((r["id"] for r in gone), key=natural_key)}


def b1_report_check(evidence):
    """B1 against NASA's report: the flame extinguished within 2 s of the flow being cut off.

    Only when B1 has a record of the flame-gone-minus-fall-start difference. The report's "first
    test" is matched to B1 by its table note (published.csv PUB-01 and PUB-12, `inferred`).
    """
    rec = next((r for r in evidence if r["test_id"] == f"{PSI}/B1" and r["provenance"] == "VIDEO_MEASURED"
                and r["quantity"] == "flame_gone_minus_fan_drop"), None)
    if rec is None:
        return None
    x = rec["value"]
    if x >= 0:
        what = f"the flame left the video {x:.1f} s after the fan voltage began to fall."
    else:
        what = f"the flame left the video {abs(x):.1f} s before the fan voltage began to fall."
    return {"id": "find-b1-fall-vs-report", "module": MODULE, "kind": "check",
            "text": (f"B1: {what} NASA's report says the flame extinguished within "
                     f"{B1_REPORT_WINDOW_S:g} s of the flow being cut off (the report's first test, "
                     f"matched to B1 by its table note)."),
            "value": x, "unit": "s", "n": 1, "provenance": "VIDEO_MEASURED",
            "source": dict(rec["source"]), "evidence_ids": [rec["id"]],
            "passed": 0 <= x <= B1_REPORT_WINDOW_S + B1_REPORT_TOLERANCE_S}


def clock_check(evidence, measured, table_source):
    """Check that the on-screen clock runs at video speed; None when no clock was read."""
    rates = [r for r in evidence if r["quantity"] == "clock_rate"]
    if not rates:
        return None
    values = [r["value"] for r in rates]
    lo, hi = min(values), max(values)
    inside = sum(1 for v in values if CLOCK_BAND[0] <= v <= CLOCK_BAND[1])
    n_videos = len(measured)
    passed = inside == len(values) == n_videos
    if passed:
        text = (f"Video time is real time: the on-screen clock advances {lo:.3f} to {hi:.3f} s "
                f"per second of video in all {n_videos} measured videos.")
    else:
        text = (f"Video time is real time is not confirmed: the on-screen clock advances "
                f"{lo:.3f} to {hi:.3f} s per second of video, and {inside} of the {n_videos} "
                f"measured videos lie within {CLOCK_BAND[0]} to {CLOCK_BAND[1]}.")
    return {"id": "find-clock-is-real-time", "module": MODULE, "kind": "check", "text": text,
            "value": lo, "unit": "clock s per video s", "n": max(1, len(values)),
            "provenance": "VIDEO_MEASURED", "source": dict(table_source),
            "evidence_ids": sorted((r["id"] for r in rates), key=natural_key), "passed": passed}


def outcome_check(rows):
    """Check on outcome labels against NASA's Table 7.1 from outcome_check.csv rows."""
    agree = sum(1 for r in rows if (r.get("agreement") or "").strip() == "yes")
    judged = agree + sum(1 for r in rows if (r.get("agreement") or "").strip() == "no")
    unjudged = sum(1 for r in rows if (r.get("agreement") or "").strip() == "cannot_tell")
    src = next(((r.get("published_source") or "").strip() for r in rows
                if (r.get("published_source") or "").strip()), REPORT_FILE)
    match = re.search(r"\(([^)]+\.pdf)\)", src)
    return {"id": "find-outcome-labels-vs-table-7-1", "module": MODULE, "kind": "check",
            "text": (f"Outcome labels agree with NASA's Summary Report Table 7.1 in {agree} of the "
                     f"{judged} T-series tests that could be judged; {unjudged} could not be judged."),
            "value": agree, "unit": "tests", "n": max(1, judged), "provenance": "VIDEO_MEASURED",
            "source": {"psi_id": PSI, "file": match.group(1) if match else src, "link": LINK},
            "passed": agree == judged and judged > 0}


def build_findings(measured, b_total, evidence, outcome_rows=None, t_check=None,
                   t_person_check=None):
    """Two headlines and the hand-measurement check (never passed: no hand measurement yet)."""
    n = len(measured)
    went_out = sum(1 for m in measured if not m["events"]["censored"])
    still_burning = n - went_out
    by_key = {(r["test_id"], r["quantity"]): r["id"] for r in evidence}
    outcome_ids = sorted((by_key[(m["test_id"], "outcome")] for m in measured), key=natural_key)
    table_source = {"psi_id": PSI, "file": TABLE_FILE, "link": LINK}
    unflagged = sorted((r for r in evidence if r["quantity"] == "spread_rate"
                        and r["provenance"] == "VIDEO_MEASURED"
                        and set(r["flags"]) <= {"no_scale"}), key=lambda r: natural_key(r["test_id"]))
    fan_part = [fan_headline(evidence, table_source, n)] \
        if any(r["quantity"] == "fan_setting_changes" for r in evidence) else []
    extra_checks = []
    b1 = b1_report_check(evidence)
    if b1 is not None:
        extra_checks.append(b1)
    clock = clock_check(evidence, measured, table_source)
    if clock is not None:
        extra_checks.append(clock)
    if outcome_rows is not None:
        extra_checks.append(outcome_check(outcome_rows))
    if t_check is not None:
        extra_checks.append(t_check)
    if t_person_check is not None:
        extra_checks.append(t_person_check)
    findings = [
        {"id": "find-tests-measured", "module": MODULE, "kind": "headline",
         "text": (f"{n} of the {b_total} B-series tests in the PSI-25 table are measured from "
                  f"video (the count covers PSI-25 videos only)."),
         "value": n, "unit": "tests", "n": max(1, n), "provenance": "VIDEO_MEASURED",
         "source": dict(table_source), "evidence_ids": outcome_ids},
        {"id": "find-ended-before-video-end", "module": MODULE, "kind": "headline",
         "text": (f"Of the {n} measured tests, {went_out} went out before the video ended and "
                  f"{still_burning} were still burning at the end."),
         "value": went_out, "unit": "tests", "n": max(1, n), "provenance": "VIDEO_MEASURED",
         "source": dict(table_source), "evidence_ids": outcome_ids},
        {"id": "find-unflagged-spread", "module": MODULE, "kind": "headline",
         "text": (f"{len(unflagged)} of the {n} measured tests show a steady spread with no "
                  f"warning flag; the rest are kept with their flags."),
         "value": len(unflagged), "unit": "tests", "n": max(1, n), "provenance": "VIDEO_MEASURED",
         "source": dict(table_source), "evidence_ids": [r["id"] for r in unflagged]},
        {"id": HAND_CHECK_ID, "module": MODULE, "kind": "check",
         "text": ("Tracker against hand measurement: no hand measurement has been made yet, so "
                  "zero comparisons have been run (zero hand measurements exist)."),
         "value": 0, "unit": "comparisons", "n": 1, "provenance": "HAND_MEASURED",
         "source": dict(table_source), "passed": False},
    ]
    at = next(i for i, f in enumerate(findings) if f["id"] == "find-unflagged-spread") + 1
    return findings[:at] + fan_part + findings[at:] + extra_checks


def b_series_tests(manifest_rows, table_rows=None):
    """Names of the B-series tests in the PSI-25 table (the manifest's tests when no table)."""
    names = set()
    if table_rows:
        for row in table_rows:
            key = next((k for k in row if k.strip().lstrip("﻿") == "Test #"), None)
            if key and re.fullmatch(r"B\d+", (row[key] or "").strip()):
                names.add(row[key].strip())
    else:
        for row in manifest_rows:
            if re.fullmatch(r"PSI-25/B\d+", row.get("test_id") or ""):
                names.add(short_name(row["test_id"]))
    return sorted(names, key=natural_key)


def build_not_measurable(skipped, failed, configured_ids, manifest_rows, video_rows, b_tests,
                         only=None):
    """Every B-series test or config row that has no measured record, with the reason."""
    out = list(skipped) + list(failed)
    readable = {r["file_name"]: (r.get("readable") or "").strip().lower() != "no"
                for r in video_rows}
    notes = {r["file_name"]: (r.get("notes") or "").strip() for r in video_rows}
    failed_ids = {f["test_id"] for f in failed}
    for name in b_tests:
        test_id = f"{PSI}/{name}"
        if test_id in configured_ids or test_id in failed_ids:
            continue
        if only is not None and name not in only:
            continue
        mains = [r for r in manifest_rows if r.get("test_id") == test_id
                 and r.get("view") == "main" and r.get("is_still_sequence") != "true"]
        if not mains:
            out.append({"test_id": test_id, "file_name": "",
                        "reason": "no main video in the manifest"})
            continue
        bad = [r for r in mains if not readable.get(r["file_name"], True)]
        if len(bad) == len(mains):
            detail = notes.get(bad[0]["file_name"], "")
            out.append({"test_id": test_id, "file_name": bad[0]["file_name"],
                        "reason": "main video does not open" + (f" ({detail})" if detail else "")})
        else:
            good = next(r for r in mains if readable.get(r["file_name"], True))
            out.append({"test_id": test_id, "file_name": good["file_name"],
                        "reason": "not configured yet (no row in config.csv)"})
    return sorted(out, key=lambda r: (natural_key(r["test_id"]) if r["test_id"] else [""],
                                      r["file_name"], r["reason"]))


def build_module_json(n_measured, b_total, file_names):
    descriptions = {
        "results.csv": ("table", "One row per measured test with events, spread rate in pixels per "
                        "second, flags and provenance."),
        "not_measurable.csv": ("table", "B-series tests and config rows with no measurement, each "
                               "with the reason."),
        "validation.json": ("validation", "Comparison statistics of the tracker against hand and "
                            "published values; pending, no comparison has been run."),
        INDEX_FILE: ("index", "One entry per measured test for the Spread page: conditions, events, "
                     "rate with its fitted line, fan read-out, stages, clip timing, files and "
                     "evidence ids."),
        "README.md": ("doc", "File shapes, provenance tags, test ID rule and per-test file naming."),
    }
    files = []
    for name in sorted(file_names):
        if name in descriptions:
            kind, desc = descriptions[name]
        else:
            kind, desc = next(((k, d) for rx, k, d in FILE_KINDS if rx.search(name)),
                              ("file", "Per-test file."))
        files.append({"name": name, "kind": kind, "description": desc})
    summary = (f"An offline engine follows the flame in NASA BASS-II videos (PSI-25) and turns "
               f"each test into numbers, measured in pixels because no scale is visible: when the "
               f"flame ignited, when it went out, whether it was still burning at the end, how "
               f"the test ended, and how fast it spread. {n_measured} of the {b_total} B-series "
               f"tests are measured so far. The same data also speaks to the question "
               f"\"Does cutting the air put the fire out?\", because some tests stop the fan. The fan voltage printed on the video (times ten) is read "
               f"as a number, not an air speed. The T-series outcomes (fabric strips with dim "
               f"flames) were graded by SI from brightened frames and the fan voltage history, "
               f"not measured by the tracker.")
    return {"id": MODULE, "title": "Video to data", "stage": "spread", "psi_ids": [PSI],
            "question": "Will it spread?", "summary": summary, "cannot_tell": list(CANNOT_TELL),
            "status": "built", "files": files}


# ---------------------------------------------------------------- index.json (the Spread page)

INDEX_EVIDENCE = ("air_speed_at_ignition", "fan_settled_time", "ignition_time", "extinction_time", "burn_duration", "spread_rate",
                  "leading_edge_travel", "fan_setting_at_ignition", "fan_drop_time",
                  "flame_gone_minus_fan_drop", "peak_flame_light", "last_faint_light_time")


def build_index(measured, evidence, not_measurable, t_series=None):
    """The index.json object: one entry per measured test, unflagged spread first."""
    ids = {(r["test_id"], r["quantity"]): r for r in evidence}
    entries = []
    for m in measured:
        tid, ev, ft = m["test_id"], m["events"], m["fit"]
        names = asset_names(tid)
        spread = ids.get((tid, "spread_rate"))
        flags = list(spread["flags"]) if spread else merge_flags(ev.get("flags"), ft.get("flags"))
        rate = None
        if ft.get("rate") is not None:
            rate = {"value": _r(ft["rate"]), "unit": ft["unit"], "ci_low": _r(ft["ci_low"]),
                    "ci_high": _r(ft["ci_high"]), "window_start_s": _r(ft["window_start_s"]),
                    "window_end_s": _r(ft["window_end_s"]),
                    "intercept_px": _r(ft["intercept_px"]) if ft.get("intercept_px") is not None
                    else None}
        fs = (fan_summary(m["readout"], ev["ignition_time_s"],
                          None if ev["censored"] else ev.get("extinction_time_s"))
              if m.get("readout") is not None else None)
        fan = {"at_ignition": None, "unit": FAN_UNIT, "changes": [], "drop_time_s": None,
               "settled_time_s": None, "flame_gone_minus_fan_drop_s": None}
        air = {"at_ignition": None, "unit": AIR_UNIT, "note": AIR_NOTE}
        if fs is not None:
            fan = {"at_ignition": _r(fs["at_ignition"]), "unit": FAN_UNIT,
                   "changes": [{"time_s": _r(t), "from": a, "to": b} for t, a, b in fs["changes"]],
                   "drop_time_s": _r(fs["drop_time"]), "settled_time_s": _r(fs["settled_time"]),
                   "flame_gone_minus_fan_drop_s": _r(fs["gone_minus_drop"])}
            air["at_ignition"] = _r(fs["air_at_ignition"])
        st = m.get("stages") or {"stages": []}
        entries.append({
            "test_id": tid, "label": short_name(tid), "video_file": m["file_name"],
            "conditions": conditions_from_manifest(m.get("manifest_row") or {}),
            "viewing": {"quality": m.get("eye_quality") or "", "note": m.get("notes") or "",
                        "viewed_by": m.get("viewed_by") or ""},
            "flags": flags,
            "events": {"ignition_time_s": _r(ev["ignition_time_s"]),
                       "extinction_time_s": None if ev["censored"] else _r(ev.get("extinction_time_s")),
                       "censored": bool(ev["censored"]), "outcome": ev["outcome"],
                       "last_faint_light_s": (_r((m.get("faint") or {}).get("time_s"))
                                              if (m.get("faint") or {}).get("time_s") is not None
                                              else None)},
            "rate": rate, "fan": fan, "air": air,
            "stages": [{"stage": x["stage"], "start_s": _r(x["start_s"]), "end_s": _r(x["end_s"])}
                       for x in st["stages"]],
            "clip": {k: v for k, v in m["clip"].items() if k != "steps_clip"}
            if m.get("clip") else m.get("clip"),
            "files": {"kymograph": names["kymograph"], "steps": names["steps"],
                      "stills": [names["still1"], names["still2"], names["still3"]],
                      "curve": names["curve"], "readout": names["readout"],
                      **({"steps_clip": m["clip"]["steps_clip"]}
                         if (m.get("clip") or {}).get("steps_clip") else {})},
            "evidence_ids": {q: ids[(tid, q)]["id"] for q in INDEX_EVIDENCE if (tid, q) in ids},
        })

    def order(e):
        return (0 if set(e["flags"]) <= {"no_scale"} and e["rate"] is not None else 1,
                natural_key(e["test_id"]))
    entries.sort(key=order)
    block = {"t_series": t_series} if t_series is not None else {}
    return {"module": MODULE,
            "units": {"position": "px", "time": "s", "rate": "px/s", "light": LIGHT_UNIT},
            "stage_source": {"citation": stages.STAGE_CITATION, "link": stages.STAGE_LINK,
                             "note": "Stage names from NIST; the limits between stages are our own rule."},
            "tests": entries,
            "not_measurable": [{"test_id": r["test_id"], "file_name": r["file_name"],
                                "reason": r["reason"]} for r in not_measurable],
            **block}


# ---------------------------------------------------------------- writing

def dumps_json(obj):
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def write_csv(path, columns, rows):
    with open(path, "w", newline="", encoding="utf-8") as handle:
        w = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
        w.writeheader()
        for row in rows:
            w.writerow(row)


def curve_rows(rows, direction, stage_list=None):
    """Curve table rows: leading and trailing edge in pixels, area, flame light and stage.

    flame_light = area_px * signal: relative and uncalibrated (see stages.py).
    """
    lead, trail = ("edge_max_px", "edge_min_px") if direction > 0 else ("edge_min_px", "edge_max_px")

    def f(v):
        return "" if v is None else f"{v:.2f}"
    return [{"time_s": f"{r['time_s']:.3f}", "leading_edge_px": f(r[lead]),
             "trailing_edge_px": f(r[trail]), "area_px": int(r["area_px"]),
             "flame_light": f"{stages.flame_light(r['area_px'], r.get('signal') or 0.0):.1f}",
             "stage": stages.stage_at(stage_list or [], r["time_s"])} for r in rows]


# ---------------------------------------------------------------- measuring one video

def fit_window_rows(rows, ignition_s, extinction_s):
    """Rows between ignition and extinction (to the end when extinction is None)."""
    end = math.inf if extinction_s is None else extinction_s
    return [r for r in rows if ignition_s <= r["time_s"] <= end]


def within_track_range(t, start_s, end_s=None):
    """True when time t lies in [start_s, end_s] (no upper limit when end_s is None)."""
    return t >= start_s and (end_s is None or t <= end_s)


def read_overlay(video, track_end_s=None):
    """Read the on-screen numbers and clock at FPS samples per second.

    Rows are cut at `track_end_s` when it is set. Each row: time_s, fuel, fan, air, rad, clock_s
    (None where unreadable). `fuel` is the field labelled FUEL (by elimination NASA's N2 flow rate
    in cm3/min; the report does not name the label); `fan` is the fan voltage x10; `air` is NASA's
    measured flow speed in cm/s; `rad` is NASA's uncalibrated radiometer read-out.
    """
    out = []
    for r in overlay.read_video(str(video), FPS):
        if within_track_range(r["time_s"], 0.0, track_end_s):
            out.append({"time_s": r["time_s"], "fuel": r["fuel"], "fan": r["fan"], "air": r["air"],
                        "rad": r["rad"], "clock_s": r["clock"]})
    return out


def readout_rows(rows):
    """Read-out CSV rows: an empty cell where a value could not be read."""
    def f(v):
        return "" if v is None else v
    return [{"time_s": f"{r['time_s']:.3f}", "fuel": f(r.get("fuel")), "fan": f(r.get("fan")),
             "air": f(r.get("air")),
             "rad": f(r.get("rad")), "clock_s": f(r.get("clock_s"))} for r in rows]


def measure_video(video, cfg, scratch):
    """Track, detect events, fit. Returns the measurement dict (or raises ValueError)."""
    p = track.Params(axis=cfg["axis"], igniter_box=cfg["igniter_box"], roi=cfg["roi"])
    src_fps, _, _, _ = track.video_info(video)
    start = cfg["track_start_s"]

    background = None
    if BACKGROUND_SUBTRACTION:
        pre = [s for idx, s, _ in track.iter_sampled(video, FPS)
               if cfg["pre_start_s"] <= idx / src_fps <= cfg["pre_end_s"]]
        if not pre:
            raise ValueError("no sampled frame inside the pre-ignition range")
        background = track.background_median(pre)

    rows, profiles, valid = [], [], None
    for idx, s, _ in track.iter_sampled(video, FPS):
        t = idx / src_fps
        if not within_track_range(t, start, cfg.get("track_end_s")):
            continue
        if valid is None:
            valid = track.make_valid_mask(s.shape, p.mask_top, p.igniter_box, p.roi)
        r, _, prof = track.track_signals([s], p, background, valid)
        rows.append({"frame": idx, "time_s": t, **r[0]})
        profiles.append(prof[0])
    if not rows:
        raise ValueError("no frames decoded between track_start_s and track_end_s")

    times = [r["time_s"] for r in rows]
    ev = events.detect_events(times, [r["area_px"] for r in rows],
                              (cfg["pre_start_s"], cfg["pre_end_s"]))
    result = {"cfg": cfg, "rows": rows, "profiles": profiles, "valid": valid, "params": p,
              "background": background, "events": ev, "src_fps": src_fps,
              "n_samples": len(rows), "fit": None}
    if ev["ignition_time_s"] is None:
        return result
    window = fit_window_rows(rows, ev["ignition_time_s"], ev["extinction_time_s"])
    t, y = fit.leading_edge(window, cfg["direction"])
    ft = fit.fit_spread_rate(t, y, seed=SEED)
    ft["intercept_px"] = None
    if ft["rate"] is not None:
        sel = (t >= ft["window_start_s"] - 1e-9) & (t <= ft["window_end_s"] + 1e-9)
        _, intercept = fit.theil_sen(t[sel], y[sel])
        # advance coordinate = direction * leading edge, so the line is a curve-coordinate line
        # (position = intercept + rate * time) only for direction +1
        if cfg["direction"] == 1:
            ft["intercept_px"] = intercept
    result["fit"] = ft
    result["lit_rows"] = window
    result["stages"] = stages.find_stages(
        [r["time_s"] for r in window],
        [stages.flame_light(r["area_px"], r["signal"]) for r in window],
        ev["ignition_time_s"], None if ev["censored"] else ev["extinction_time_s"])
    return result


def steps_row(lit, ft):
    """The sampled row in the middle of the fitted window (of the lit range without a window)."""
    if ft and ft.get("window_start_s") is not None:
        a, b = ft["window_start_s"], ft["window_end_s"]
    else:
        a, b = lit[0]["time_s"], lit[-1]["time_s"]
    mid = (a + b) / 2.0
    return min(lit, key=lambda r: (abs(r["time_s"] - mid), r["time_s"]))


def render_steps(rgb, sub, valid, mask, row, p, label):
    """One image, four labelled panels made with the tracker's own pieces.

    1 the frame, 2 the brightness signal the tracker thresholds (pixels outside its valid area
    are black), 3 the flame mask, 4 the outline and the two edge lines.
    """
    import cv2
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    grey = np.where(valid, np.clip(np.asarray(sub, dtype=np.float32), 0, 255), 0).astype(np.uint8)
    panels = [("1 frame", bgr),
              ("2 brightness", cv2.cvtColor(grey, cv2.COLOR_GRAY2BGR)),
              ("3 flame mask", cv2.cvtColor((mask.astype(np.uint8) * 255), cv2.COLOR_GRAY2BGR)),
              ("4 outline and edges", track.render_overlay(rgb, mask, row, p, ""))]
    out = []
    for title, img in panels:
        img = cv2.resize(img, STEPS_PANEL, interpolation=cv2.INTER_AREA)
        cv2.rectangle(img, (0, 0), (STEPS_PANEL[0], 20), (0, 0, 0), -1)
        cv2.putText(img, f"{title}   {label}", (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                    (0, 255, 255), 1)
        out.append(img)
    return np.vstack([np.hstack(out[:2]), np.hstack(out[2:])])


def render_steps_clip_frame(rgb, sub, valid, mask, row, p):
    """One frame of the detection-steps clip: three panels of STEPS_PANEL size side by side.

    1 NASA's frame with the tracked outline and edge lines (as in the overlay clip), 2 the
    brightness the tracker thresholds (pixels outside its valid area black), 3 the flame mask
    (0 or 255 only). Each panel carries a small white label on black at its top left.
    """
    import cv2
    grey = np.where(valid, np.clip(np.asarray(sub, dtype=np.float32), 0, 255), 0).astype(np.uint8)
    panels = [track.render_overlay(rgb, mask, row, p, ""),
              cv2.cvtColor(grey, cv2.COLOR_GRAY2BGR),
              cv2.cvtColor(np.where(mask, 255, 0).astype(np.uint8), cv2.COLOR_GRAY2BGR)]
    out = []
    for i, (label, img) in enumerate(zip(STEPS_CLIP_LABELS, panels)):
        # the mask is resized without blending so it stays 0 or 255
        img = cv2.resize(img, STEPS_PANEL, interpolation=cv2.INTER_NEAREST if i == 2
                         else cv2.INTER_AREA)
        (w, h), base = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
        cv2.rectangle(img, (0, 0), (w + 8, h + base + 6), (0, 0, 0), -1)
        cv2.putText(img, label, (4, h + 3), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1,
                    cv2.LINE_8)
        if i == 2:  # keep the mask panel strictly 0 or 255, label text included
            img = np.where(img > 127, 255, 0).astype(np.uint8)
        out.append(img)
    return np.hstack(out)


def clip_sampling(lit):
    """(indices into `lit`, output fps, speed) of the overlay clip; the steps clip uses the same."""
    n = len(lit)
    stride = max(1, math.ceil(n / (MAX_CLIP_S * CLIP_MAX_FPS)))
    clip_idx = list(range(0, n, stride))
    out_fps = int(min(CLIP_MAX_FPS, max(10, math.ceil(len(clip_idx) / MAX_CLIP_S))))
    return clip_idx, out_fps, out_fps * stride / FPS


def encode_steps_clip(frames_bgr, fps, path, max_bytes=STEPS_CLIP_MAX_BYTES):
    """h264 yuv420p of the three-panel frames, kept at STEPS_PANEL x 3 by STEPS_PANEL height.

    Lowers the quality first, then the frame rate (the same frames' span and speed). Returns True
    when a file under `max_bytes` was written, False (and no file) when none fits.
    """
    if not frames_bgr:
        raise ValueError("no frames for the clip")
    h, w = frames_bgr[0].shape[:2]
    raw = b"".join(f.tobytes() for f in frames_bgr)
    for div in STEPS_CLIP_FPS_DIVISORS:
        for crf in STEPS_CLIP_CRFS:
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
                   "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
                   "-vf", f"select='not(mod(n,{div}))',setpts=N/({fps}/{div})/TB",
                   "-r", f"{fps / div:g}", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                   "-preset", "medium", "-crf", str(crf), "-threads", "1",
                   "-x264-params", "threads=1:lookahead-threads=1:sliced-threads=0",
                   "-fflags", "+bitexact", "-flags:v", "+bitexact", "-map_metadata", "-1",
                   "-movflags", "+faststart", str(path)]
            proc = subprocess.run(cmd, input=raw, capture_output=True, timeout=600)
            if proc.returncode != 0:
                raise RuntimeError("ffmpeg failed: " + proc.stderr.decode("utf-8", "replace"))
            if os.path.getsize(path) <= max_bytes:
                return True
    os.remove(path)
    return False


def write_images_and_clip(video, meas, test_id, outdir, clip_encoder=None, steps_only=False):
    """Kymograph, three overlay stills, the curve CSV, the overlay clip and the detection-steps
    clip of one test. `steps_only` writes only the steps clip. Returns the `clip` dict, with
    `steps_clip` (the file name, or None when no encoding fits the size limit)."""
    names = asset_names(test_id)
    cfg, p, rows = meas["cfg"], meas["params"], meas["rows"]
    lit = meas["lit_rows"]
    import cv2

    if not steps_only:
        ky = track.render_kymograph(meas["profiles"], [r["time_s"] for r in rows], rows, p.axis)
        cv2.imwrite(str(outdir / names["kymograph"]), ky)
        write_csv(outdir / names["curve"], CURVE_COLUMNS,
                  curve_rows(lit, cfg["direction"], meas["stages"]["stages"]))

    n = len(lit)
    clip_idx, out_fps, speed = clip_sampling(lit)
    pick = {"still1": lit[0]["frame"], "still2": lit[n // 2]["frame"], "still3": lit[-1]["frame"]}
    steps_frame = steps_row(lit, meas["fit"])["frame"]
    wanted = {lit[i]["frame"] for i in clip_idx}
    if not steps_only:
        wanted |= set(pick.values()) | {steps_frame}
    by_frame = {r["frame"]: r for r in lit}
    clip_frames = {lit[i]["frame"] for i in clip_idx}
    bg = meas["background"]
    frames_out, steps_out = [], []
    for idx, s, rgb in track.iter_sampled(video, FPS, want=wanted):
        if rgb is None or idx not in by_frame:
            continue
        row = by_frame[idx]
        sub = s.astype(np.float32) - (bg if bg is not None else 0)
        mask = track.flame_mask(sub, meas["valid"], p)
        label = f"{short_name(test_id)} t={row['time_s']:.2f}s"
        if idx in clip_frames:
            steps_out.append(render_steps_clip_frame(rgb, sub, meas["valid"], mask, row, p))
            if not steps_only:
                frames_out.append(track.render_overlay(
                    rgb, mask, row, p, label + (f" x{speed:g}" if speed != 1 else "")))
        if steps_only:
            continue
        for which, frame in pick.items():
            if frame == idx:
                track.save_jpeg(str(outdir / names[which]),
                                track.render_overlay(rgb, mask, row, p, label))
        if idx == steps_frame:
            track.save_jpeg(str(outdir / names["steps"]),
                            render_steps(rgb, sub, meas["valid"], mask, row, p, label),
                            max_bytes=STEPS_MAX_BYTES)
    if not steps_only:
        (clip_encoder or encode_clip)(frames_out, out_fps, outdir / names["clip"])
    steps_ok = (clip_encoder or encode_steps_clip)(steps_out, out_fps, outdir / steps_clip_name(test_id))
    return {"file": names["clip"], "start_s": _r(lit[clip_idx[0]]["time_s"]),
            "end_s": _r(lit[clip_idx[-1]]["time_s"]), "speed": round(speed, 6),
            "steps_clip": steps_clip_name(test_id) if steps_ok is not False else None}


def encode_clip(frames_bgr, fps, path):
    """h264, yuv420p, single-threaded and bit-exact, under MAX_CLIP_BYTES (raises otherwise)."""
    if not frames_bgr:
        raise ValueError("no frames for the clip")
    import cv2
    img = frames_bgr
    for _ in range(4):
        h, w = img[0].shape[:2]
        for crf in (28, 32, 36, 40):
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
                   "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
                   "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                   "-preset", "medium", "-crf", str(crf), "-threads", "1",
                   "-x264-params", "threads=1:lookahead-threads=1:sliced-threads=0",
                   "-fflags", "+bitexact", "-flags:v", "+bitexact", "-map_metadata", "-1",
                   "-movflags", "+faststart", str(path)]
            proc = subprocess.run(cmd, input=b"".join(f.tobytes() for f in img),
                                  capture_output=True, timeout=600)
            if proc.returncode != 0:
                raise RuntimeError("ffmpeg failed: " + proc.stderr.decode("utf-8", "replace"))
            if os.path.getsize(path) < MAX_CLIP_BYTES:
                return
        img = [cv2.resize(f, (f.shape[1] * 3 // 4 // 2 * 2, f.shape[0] * 3 // 4 // 2 * 2),
                          interpolation=cv2.INTER_AREA) for f in img]
    raise RuntimeError("could not make the overlay clip small enough")


# ---------------------------------------------------------------- the whole job

def run(videos_dir, out_dir, config_path=None, manifest_path=None, published_path=None,
        videos_csv_path=None, table_path=None, only=None, log=print, clip_encoder=None,
        overlay_reader=None, outcome_check_path=None, grades_path=None, faint_path=None,
        checked_path=None, review_clipper=None):
    """Run the engine. Returns a summary dict with the measured table."""
    videos_dir, out_dir = Path(videos_dir), Path(out_dir)
    config_path = Path(config_path or ENGINE_DIR / "config.csv")
    manifest_rows = read_csv(manifest_path or ENGINE_DIR / "manifest.csv")
    published_rows = read_csv(published_path or ENGINE_DIR / "published.csv")
    video_rows = read_csv(videos_csv_path or ENGINE_DIR / "videos.csv")
    table_path = Path(table_path or ROOT / "data" / "raw" / "tables" / TABLE_FILE)
    table_rows = read_csv(table_path) if table_path.exists() else None
    b_tests = b_series_tests(manifest_rows, table_rows)
    manifest_by_file = {r["file_name"]: r for r in manifest_rows}

    faint_file = Path(faint_path or ENGINE_DIR / FAINT_FILE)
    faint_rows = {r["test_id"].strip(): r for r in read_csv(faint_file)} \
        if faint_file.is_file() else {}
    configs, skipped = parse_config(read_csv(config_path))
    for item in skipped:
        item["reason"] = unresolved_reason(manifest_by_file.get(item["file_name"]))
    configs = sorted(configs, key=lambda c: natural_key(c["test_id"]))
    if only is not None:
        configs = [c for c in configs if short_name(c["test_id"]) in only]
        skipped = [] if only else skipped
    measured, failed, evidence = [], [], []
    summary = []
    with tempfile.TemporaryDirectory() as tmp:
        build = Path(tmp)
        for cfg in configs:
            test_id = cfg["test_id"]
            video = videos_dir / cfg["file_name"]
            if not video.is_file():
                failed.append({"test_id": test_id, "file_name": cfg["file_name"],
                               "reason": f"video file not found in {videos_dir.name}"})
                continue
            log(f"{test_id}: tracking {cfg['file_name']}")
            try:
                meas = measure_video(video, cfg, build)
            except ValueError as err:
                failed.append({"test_id": test_id, "file_name": cfg["file_name"],
                               "reason": f"video did not open or could not be read: {err}"})
                continue
            if meas["events"]["ignition_time_s"] is None:
                failed.append({"test_id": test_id, "file_name": cfg["file_name"],
                               "reason": "no ignition found"})
                continue
            clip = write_images_and_clip(video, meas, test_id, build, clip_encoder)
            readout = (overlay_reader or read_overlay)(video, cfg.get("track_end_s"))
            write_csv(build / asset_names(test_id)["readout"], READOUT_COLUMNS,
                      readout_rows(readout))
            m = {"test_id": test_id, "file_name": cfg["file_name"], "direction": cfg["direction"],
                 "axis": cfg["axis"], "eye_quality": cfg["eye_quality"],
                 "viewed_by": cfg["viewed_by"], "notes": cfg["notes"], "manifest_row": manifest_by_file.get(cfg["file_name"], {}),
                 "events": meas["events"], "fit": meas["fit"], "n_samples": meas["n_samples"],
                 "readout": readout, "stages": meas["stages"], "clip": clip}
            if test_id in faint_rows:
                src_fps = meas["src_fps"]
                fr = faint_rows[test_id]
                m["faint"] = faint.last_faint_light(
                    lambda: ((idx / src_fps, sig) for idx, sig, _ in track.iter_sampled(video, FPS)
                             if within_track_range(idx / src_fps, cfg["track_start_s"],
                                                   cfg.get("track_end_s"))),
                    (cfg["pre_start_s"], cfg["pre_end_s"]), cfg["igniter_box"], cfg["roi"])
                m["faint"].update(basis=fr["basis"].strip(), viewed_by=fr["viewed_by"].strip())
                log(f"{test_id}: last faint light {m['faint']['time_s']} "
                    f"(area {m['faint']['area_px']}, {m['faint']['reason']})")
            measured.append(m)
            evidence += build_evidence(m)
            ev, ft = m["events"], m["fit"]
            summary.append({"test_id": test_id, "ignition_s": ev["ignition_time_s"],
                            "extinction_s": ev["extinction_time_s"], "censored": ev["censored"],
                            "outcome": ev["outcome"], "rate": ft.get("rate"),
                            "ci": [ft.get("ci_low"), ft.get("ci_high")],
                            "flags": merge_flags(ev["flags"], ft.get("flags"),
                                                 EYE_FLAGS.get(cfg["eye_quality"], [])),
                            "travel": ft.get("travel")})
        measured_ids = [m["test_id"] for m in measured]
        evidence = sort_evidence(evidence + build_published(measured_ids, published_rows))
        grade_rows = read_csv(grades_path or ENGINE_DIR / "t_series_grades.csv") \
            if (grades_path or (ENGINE_DIR / "t_series_grades.csv").is_file()) else []
        t_graded, t_published = build_t_evidence(grade_rows)
        checked_file = Path(checked_path or ENGINE_DIR / CHECKED_FILE)
        checked = grades.build_checked(read_csv(checked_file), grade_rows) \
            if checked_file.is_file() and grade_rows else []
        t_clips, t_readouts = write_t_review(grade_rows, videos_dir, build,
                                             review_clipper or review_clip.make_review_clip,
                                             overlay_reader or read_overlay) if checked else ({}, {})
        t_checked = build_t_checked_evidence(checked, {k: v["file"] for k, v in t_clips.items()},
                                             t_readouts)
        evidence = sort_evidence(evidence + t_graded + t_published + t_checked)
        check_unique(evidence)
        oc_path = Path(outcome_check_path or ENGINE_DIR / "outcome_check.csv")
        findings = build_findings(measured, len(b_tests), evidence,
                                  read_csv(oc_path) if USE_OUTCOME_CHECK and oc_path.is_file()
                                  else None, t_series_check(grade_rows, t_graded),
                                  t_series_person_check(checked, t_checked))
        not_meas = build_not_measurable(skipped, failed, {c["test_id"] for c in configs},
                                        manifest_rows, video_rows, b_tests, only)
        results = [build_results_row(m) for m in sorted(measured, key=lambda m: natural_key(m["test_id"]))]

        (build / "evidence.json").write_text(dumps_json(evidence), encoding="utf-8")
        (build / "findings.json").write_text(dumps_json(findings), encoding="utf-8")
        # validation.json belongs to the validation step (validate.py): keep what it wrote and
        # only write the "pending" stub when no such file exists yet.
        prior_validation = Path(out_dir) / "validation.json"
        (build / "validation.json").write_text(
            prior_validation.read_text(encoding="utf-8") if prior_validation.is_file()
            else dumps_json({"status": "pending", "comparisons": []}), encoding="utf-8")
        write_csv(build / "results.csv", RESULTS_COLUMNS, results)
        write_csv(build / "not_measurable.csv", NOT_MEASURABLE_COLUMNS, not_meas)
        (build / INDEX_FILE).write_text(dumps_json(build_index(
            measured, evidence, not_meas,
            build_t_index(grade_rows, t_graded, t_published, checked, t_clips, t_readouts)
            if grade_rows else None)),
                                        encoding="utf-8")

        out_dir.mkdir(parents=True, exist_ok=True)
        # remove what an earlier run wrote (per-test files of tests no longer measured too)
        keep = {"README.md"}
        for old in out_dir.iterdir():
            if old.is_file() and old.name not in keep:
                old.unlink()
        for new in sorted(build.iterdir()):
            shutil.copyfile(new, out_dir / new.name)
        names = sorted(p.name for p in out_dir.iterdir() if p.is_file()
                       and p.name not in {"module.json", "evidence.json", "findings.json"})
        (out_dir / "module.json").write_text(
            dumps_json(build_module_json(len(measured), len(b_tests), names)), encoding="utf-8")
    return {"summary": summary, "measured": len(measured), "not_measurable": len(not_meas),
            "b_total": len(b_tests)}


def _steps_only_job(args):
    """Worker of the steps-clips-only mode: track one test and write only its steps clip."""
    video, cfg, out_dir = args
    with tempfile.TemporaryDirectory() as tmp:
        meas = measure_video(video, cfg, Path(tmp))
        clip = write_images_and_clip(video, meas, cfg["test_id"], Path(out_dir), steps_only=True)
    return cfg["test_id"], clip


def add_steps_clips_to_module(out_dir, results):
    """Add `files.steps_clip` to index.json and the clip files to module.json, in place.

    `results` maps test_id to the clip dict made by `write_images_and_clip`. Everything else in
    both files stays as it was; the clips' timing must equal the overlay clip's.
    """
    out_dir = Path(out_dir)
    index = json.loads((out_dir / INDEX_FILE).read_text(encoding="utf-8"))
    for entry in index["tests"]:
        got = results.get(entry["test_id"])
        if got is None:
            continue
        old = entry["clip"]
        if (old["start_s"], old["end_s"], old["speed"]) != (got["start_s"], got["end_s"],
                                                           got["speed"]):
            raise ValueError(f"{entry['test_id']}: steps clip timing differs from the overlay clip")
        entry["files"].pop("steps_clip", None)
        if got.get("steps_clip"):
            entry["files"]["steps_clip"] = got["steps_clip"]
    (out_dir / INDEX_FILE).write_text(dumps_json(index), encoding="utf-8")
    module = json.loads((out_dir / "module.json").read_text(encoding="utf-8"))
    names = {f["name"] for f in module["files"]}
    for r in results.values():
        name = r.get("steps_clip")
        if name and name not in names:
            kind, desc = next((k, d) for rx, k, d in FILE_KINDS if rx.search(name))
            module["files"].append({"name": name, "kind": kind, "description": desc})
    module["files"].sort(key=lambda f: f["name"])
    (out_dir / "module.json").write_text(dumps_json(module), encoding="utf-8")


def run_steps_clips_only(videos_dir, out_dir, config_path=None, only=None, workers=4,
                         log=print):
    """Make only the detection-steps clips of the measured B tests listed in index.json.

    Every other file in the module folder stays byte-identical; index.json and module.json only
    gain the new entries. Returns {test_id: clip dict}.
    """
    from concurrent.futures import ProcessPoolExecutor
    videos_dir, out_dir = Path(videos_dir), Path(out_dir)
    index = json.loads((out_dir / INDEX_FILE).read_text(encoding="utf-8"))
    wanted = {e["test_id"] for e in index["tests"]}
    configs, _ = parse_config(read_csv(Path(config_path or ENGINE_DIR / "config.csv")))
    jobs = [(videos_dir / c["file_name"], c, str(out_dir)) for c in
            sorted(configs, key=lambda c: natural_key(c["test_id"]))
            if c["test_id"] in wanted and (only is None or short_name(c["test_id"]) in only)]
    missing = [str(j[0]) for j in jobs if not j[0].is_file()]
    if missing:
        raise FileNotFoundError("video file not found: " + ", ".join(missing))
    results = {}
    with ProcessPoolExecutor(max_workers=max(1, workers)) as pool:
        for test_id, clip in pool.map(_steps_only_job, jobs):
            log(f"{test_id}: steps clip {clip['steps_clip']}")
            results[test_id] = clip
    add_steps_clips_to_module(out_dir, results)
    return results


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m pipeline.video_to_data.run",
                                 description="Videos to the video-to-data hand-over folder.")
    ap.add_argument("--videos", default=str(ROOT / "data" / "raw" / "files" / "PSI-25"))
    ap.add_argument("--out", default=str(ROOT / "data" / "modules" / "video-to-data"))
    ap.add_argument("--only", default=None, help="comma list of test names, for example B1,B4")
    ap.add_argument("--config", default=None)
    ap.add_argument("--manifest", default=None)
    ap.add_argument("--steps-clips-only", action="store_true",
                    help="make only the detection-steps clips and add them to index.json and "
                         "module.json; every other file stays as it is")
    ap.add_argument("--workers", type=int, default=4, help="processes for --steps-clips-only")
    a = ap.parse_args(argv)
    only = {s.strip() for s in a.only.split(",") if s.strip()} if a.only else None
    if a.steps_clips_only:
        res = run_steps_clips_only(a.videos, a.out, config_path=a.config, only=only,
                                   workers=a.workers)
        print(f"steps clips: {sum(1 for c in res.values() if c['steps_clip'])} of {len(res)} tests")
        return 0
    res = run(a.videos, a.out, config_path=a.config, manifest_path=a.manifest, only=only)
    for s in res["summary"]:
        print(json.dumps(s))
    print(f"measured {res['measured']} of {res['b_total']} B-series tests; "
          f"{res['not_measurable']} rows in not_measurable.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
