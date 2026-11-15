# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Manifest of the BASS-II videos (PSI-25): which test is each video, under what conditions.

Reads data/raw/json/PSI-25.json (file records) and the experimental table
data/raw/tables/PSI-25_Experimental table_BASS-II.csv, and writes manifest.csv next to this file.
Stdlib only. The file name's test ID wins over PSI's subcategory; every disagreement is written
into match_notes. Nothing is guessed: a video with no table row has an empty test_id.

Run: python3 pipeline/video_to_data/manifest.py
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JSON_PATH = ROOT / "data" / "raw" / "json" / "PSI-25.json"
TABLE_PATH = ROOT / "data" / "raw" / "tables" / "PSI-25_Experimental table_BASS-II.csv"
OUT_PATH = Path(__file__).resolve().parent / "manifest.csv"

COLUMNS = [
    "file_name", "bytes", "investigator", "test_id", "test", "sample", "gmt", "view",
    "is_still_sequence", "part", "rerun", "subcategory", "subcategory_test", "material_text",
    "thickness_mm", "width_mm", "o2_initial_pct", "o2_final_pct", "fan_display", "air_display",
    "flow_restrictor", "total_frames_shot", "match", "match_notes",
]

# Test ID in a file name: "TEST_B1", "TESTB6", "test T13", "Test-O7", "test-T16-shifted".
_TEST_AFTER_WORD = re.compile(r"(?<![A-Za-z])test[_\s-]*([A-Za-z])(\d+)([ab])?(?![0-9])", re.I)
# Names that carry the test ID right after "Raw Data_": "M3-over-the-shoulder...", "O5a-all".
_TEST_LEADING = re.compile(r"^PSI-25_Raw Data_([A-Za-z])(\d+)([ab])?(?![0-9])")
_GMT = re.compile(r"GMT[_\s]*(\d+)", re.I)
_SAMPLE = re.compile(r"sample[_\s]*(\d+)", re.I)
_PART = re.compile(r"Part-(\d+)", re.I)
_STILL = re.compile(r"Still_Sequence(?:_(\d+))?", re.I)
_NOTE_WORDS = [
    (re.compile(r"LOS_Portion|LOS-portion|-LOS|LOS\.", re.I), "loss-of-signal portion"),
    (re.compile(r"First_Ignition_Attempt", re.I), "first ignition attempt"),
    (re.compile(r"Second_Ignition_Attempt", re.I), "second ignition attempt"),
    (re.compile(r"post-burn", re.I), "post-burn picture"),
    (re.compile(r"shifted-video", re.I), "shifted video"),
    (re.compile(r"vlc-record", re.I), "vlc recording"),
    (re.compile(r"camera-monitor|still-camera|lab-camera|over-the-shoulder|rack-video|experimentvideo", re.I),
     "other camera view"),
    (re.compile(r"Flame-Blowoff", re.I), "flame blowoff clip"),
    (re.compile(r"-all\.mp4$", re.I), "whole-test clip"),
]


def parse_video_name(file_name):
    """Read test, sample, GMT and the flags out of a PSI-25 video file name. Pure."""
    m = _TEST_AFTER_WORD.search(file_name) or _TEST_LEADING.match(file_name)
    test = (m.group(1).upper() + m.group(2)) if m else ""
    rerun = (m.group(3) or "").lower() if m else ""
    g = _GMT.search(file_name)
    s = _SAMPLE.search(file_name)
    still = _STILL.search(file_name)
    part = ""
    pm = _PART.search(file_name)
    if pm:
        part = pm.group(1)
    elif still and still.group(1):
        part = still.group(1)
    notes = [label for rx, label in _NOTE_WORDS if rx.search(file_name)]
    return {
        "test": test,
        "sample": s.group(1) if s else "",
        "gmt": g.group(1) if g else "",
        "is_still_sequence": bool(still),
        "is_second_view": "2ND_VIEW" in file_name.upper(),
        "part": part,
        "rerun": rerun,
        "notes": "; ".join(notes),
    }


def _clean(text):
    return re.sub(r"\s+", " ", (text or "")).strip()


_NUM = r"(\d+(?:\.\d+)?)"


def _fmt(x):
    return f"{x:.6g}"


def parse_material(text):
    """Material name when the text states one (PMMA, Nomex, SIBAL), else ''."""
    t = text or ""
    if re.search(r"pmma", t, re.I):
        return "PMMA"
    if re.search(r"nomex", t, re.I):
        return "Nomex"
    if re.search(r"sibal", t, re.I):
        return "SIBAL"
    return ""


def parse_thickness_mm(text):
    """Thickness in mm from '100 micron' or '0.2 mm'; '' when not stated."""
    t = text or ""
    m = re.search(_NUM + r"\s*micron", t, re.I)
    if m:
        return _fmt(float(m.group(1)) / 1000.0)
    m = re.search(_NUM + r"\s*mm\b", t, re.I)
    if m:
        return _fmt(float(m.group(1)))
    return ""


def parse_width_mm(text):
    """Width in mm from 'N cm wide' or 'N cm' directly before a thickness; '' otherwise.

    '4 cm spherical section', '2 cm thick' and a bare trailing '2 cm' are not widths."""
    t = text or ""
    m = re.search(_NUM + r"\s*cm\s+wide", t, re.I)
    if not m:
        m = re.search(_NUM + r"\s*cm\s+" + _NUM + r"\s*(?:mm|micron)", t, re.I)
    return _fmt(float(m.group(1)) * 10.0) if m else ""


def _digits(value):
    m = re.match(r"\s*(\d+)", value or "")
    return m.group(1) if m else ""


def _num(value):
    d = _digits(value)
    return str(int(d)) if d else ""


def _norm_header(name):
    return _clean(name).lower()


def load_table(path):
    """Table rows keyed by Test #, with whitespace-normalised header names."""
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rows = []
        for raw in csv.DictReader(fh):
            rows.append({_norm_header(k): _clean(v) for k, v in raw.items() if k is not None})
    return rows


def _investigator(subcategory):
    parts = [p.strip() for p in subcategory.split("/")]
    return parts[1] if len(parts) > 1 and parts[0] == "Reduced Gravity" else ""


def _subcat_test(subcategory):
    return subcategory.split("/")[-1].strip()


def match_video(record, table_by_test):
    """Join one file record {file_name, file_size, subcategory} to a table row. Pure.

    Returns the manifest row dict. Join key is the table's Test # (test + rerun letter);
    sample and GMT are cross-checked and a mismatch goes to match_notes."""
    name = record["file_name"]
    sub = record.get("subcategory", "")
    p = parse_video_name(name)
    notes = []
    row = None
    if p["test"]:
        full = p["test"] + p["rerun"]
        if full in table_by_test:
            row = table_by_test[full]
        elif p["rerun"] and p["test"] in table_by_test:
            row = table_by_test[p["test"]]
            notes.append(f"name has rerun letter {p['rerun']} but table has only {p['test']}")
        elif not p["rerun"]:
            lettered = sorted(k for k in table_by_test if k[:len(p["test"])] == p["test"]
                              and k[len(p["test"]):] in ("a", "b"))
            if lettered:
                notes.append("table has only " + ", ".join(lettered) + "; name gives no rerun letter")
            else:
                notes.append(f"no table row for test {p['test']}")
        else:
            notes.append(f"no table row for test {full}")
    else:
        notes.append("no test ID in file name")
    sub_test = _subcat_test(sub)
    if p["test"] and sub_test not in (p["test"], p["test"] + p["rerun"]):
        notes.append(f"subcategory says {sub_test}, file name says {p['test'] + p['rerun']}; name wins")
    if row is not None:
        s_bad = bool(p["sample"]) and _num(row.get("sample #", "")) != _num(p["sample"])
        g_bad = bool(p["gmt"]) and _num(row.get("gmt", "")) != _num(p["gmt"])
        if s_bad:
            notes.append(f"sample mismatch: name {p['sample']}, table {row.get('sample #', '')}")
        if g_bad:
            notes.append(f"GMT mismatch: name {p['gmt']}, table {row.get('gmt', '')}")
        if s_bad and g_bad:
            # Sample and GMT both contradict the named row: the name is likely mislabelled.
            # Do not guess: leave unmatched and point at the row that does agree, if any.
            twins = sorted(k for k, t in table_by_test.items()
                           if _num(t.get("sample #", "")) == _num(p["sample"])
                           and _num(t.get("gmt", "")) == _num(p["gmt"]))
            notes.append("not assigned; sample and GMT agree with table row "
                         + ", ".join(twins) if twins else "not assigned; no table row agrees")
            row = None
    material_text = row.get("fuel sample material", "") if row else ""
    out = {
        "file_name": name,
        "bytes": int(float(record.get("file_size", 0))),
        "investigator": _investigator(sub) or (row.get("pi", "") if row else ""),
        "test_id": f"PSI-25/{row['test #']}" if row else "",
        "test": p["test"],
        "sample": p["sample"],
        "gmt": p["gmt"],
        "view": "second" if p["is_second_view"] else "main",
        "is_still_sequence": "true" if p["is_still_sequence"] else "false",
        "part": p["part"],
        "rerun": p["rerun"],
        "subcategory": sub.strip(),
        "subcategory_test": sub_test,
        "material_text": material_text,
        "thickness_mm": parse_thickness_mm(material_text),
        "width_mm": parse_width_mm(material_text),
        "o2_initial_pct": row.get("calibrated initial o2 % by vol", "") if row else "",
        "o2_final_pct": row.get("calibrated final o2 % by vol", "") if row else "",
        "fan_display": row.get("fan display", "") if row else "",
        "air_display": row.get("air display", "") if row else "",
        "flow_restrictor": row.get("flow restrictor", "") if row else "",
        "total_frames_shot": row.get("total frames shot", "") if row else "",
        "match": "matched" if row else "unmatched",
        "match_notes": "; ".join(n for n in ([p["notes"]] if p["notes"] else []) + notes),
    }
    return out


def build_manifest(records, table_rows):
    """One manifest row per mp4 record, sorted by investigator, test number, file name."""
    by_test = {}
    for r in table_rows:
        if r.get("test #"):
            by_test.setdefault(r["test #"], r)
    rows = [match_video(rec, by_test) for rec in records
            if rec["file_name"].lower().endswith(".mp4")]

    def key(r):
        m = re.match(r"([A-Za-z]*)(\d*)", r["test"])
        return (r["investigator"], m.group(1), int(m.group(2) or 0), r["rerun"], r["file_name"])
    rows.sort(key=key)
    return rows


def summarize(rows, table_rows, investigator=None):
    """Counts: mp4 files, matched, unmatched by reason, table rows with no video."""
    sel = [r for r in rows if investigator is None or r["investigator"] == investigator]
    unmatched = [r for r in sel if r["match"] == "unmatched"]
    reasons = {}
    for r in unmatched:
        reasons.setdefault(r["match_notes"], []).append(r["file_name"])
    seen = {r["test_id"] for r in rows if r["test_id"]}
    trows = [t for t in table_rows if investigator is None or t.get("pi") == investigator]
    missing = [t["test #"] for t in trows if f"PSI-25/{t['test #']}" not in seen]
    return {"mp4": len(sel), "matched": len(sel) - len(unmatched), "unmatched": len(unmatched),
            "unmatched_reasons": reasons, "table_rows": len(trows), "table_rows_no_video": missing}


def main():
    meta = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    table = load_table(TABLE_PATH)
    rows = build_manifest(meta["added"], table)
    with open(OUT_PATH, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    for label, who in (("ALL", None), ("Bhattacharjee", "Bhattacharjee")):
        s = summarize(rows, table, who)
        print(f"[{label}] mp4={s['mp4']} matched={s['matched']} unmatched={s['unmatched']} "
              f"table_rows={s['table_rows']} table_rows_no_video={len(s['table_rows_no_video'])}")
        for reason, names in s["unmatched_reasons"].items():
            print(f"  unmatched ({len(names)}): {reason}")
            for n in names:
                print(f"    {n}")
        print(f"  table rows with no video: {', '.join(s['table_rows_no_video'])}")
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    sys.exit(main())
