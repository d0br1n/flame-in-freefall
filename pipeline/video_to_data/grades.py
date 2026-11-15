# Code generated with SI assistance (Claude Code), reviewed by the team.
"""T-series outcome grades: the SI grader's label set against NASA's Table 7.1, stdlib only.

`match_label(si_grade, nasa_outcome)` compares the two labels. `build_rows` and `write_csv`
produce `t_series_grades.csv`, so the `match` column is always computed from the two label
columns and cannot drift from them.
"""
import csv
import re
from pathlib import Path

# SI grade label -> NASA's words in Table 7.1
GRADE_TO_NASA = {
    "quenched": "quenched",
    "blow_off": "blow-off",
    "no_blow_off": "no blowoff",
    "no_ignition": "no ignition",
}
UNDECIDED_GRADE = "cannot_tell"
NASA_SOURCE_TEXT = "Summary Report Table 7.1, PDF page 104"
NO_VIDEO_REASON = "no plain main video on PSI"

RESEARCH_COLUMNS = ["test", "file_name", "grade", "confidence", "wire_glow_s",
                    "flame_seen_from_s", "flame_gone_s", "fan_history", "rad_note", "reason",
                    "graded_by"]
COLUMNS = RESEARCH_COLUMNS + ["test_id", "nasa_outcome", "nasa_source", "match"]


def match_label(si_grade, nasa_outcome):
    """'yes', 'no', 'undecided' (grade cannot_tell) or 'not_graded' (empty grade)."""
    grade = (si_grade or "").strip()
    if not grade:
        return "not_graded"
    if grade == UNDECIDED_GRADE:
        return "undecided"
    if grade not in GRADE_TO_NASA:
        raise ValueError(f"unknown SI grade label {grade!r}; known: "
                         f"{sorted(GRADE_TO_NASA) + [UNDECIDED_GRADE]}")
    known = set(GRADE_TO_NASA.values())
    nasa = (nasa_outcome or "").strip().lower()
    if nasa not in known:
        raise ValueError(f"unknown NASA outcome label {nasa_outcome!r}; known: {sorted(known)}")
    return "yes" if GRADE_TO_NASA[grade] == nasa else "no"


def build_rows(grade_rows, published_rows):
    """Research grade rows plus NASA's outcome from published.csv rows (quantity 'outcome').

    A published test with no grade row (T20) gets an empty-grade row with the reason.
    """
    nasa = {}
    for r in published_rows:
        ids = [t.strip() for t in (r.get("test_ids") or "").split(";") if t.strip()]
        if (r.get("quantity") or "").strip() == "outcome" and len(ids) == 1 \
                and "/T" in ids[0]:
            nasa[ids[0]] = r
    out, seen = [], set()
    for g in grade_rows:
        tid = "PSI-25/" + g["test"].strip()
        if tid not in nasa:
            raise ValueError(f"{tid} has no NASA outcome in published.csv")
        row = {c: g.get(c, "") for c in RESEARCH_COLUMNS}
        out.append(_complete(row, tid, nasa[tid]))
        seen.add(tid)
    for tid, pub in nasa.items():
        if tid not in seen:
            row = {c: "" for c in RESEARCH_COLUMNS}
            row.update({"test": tid.split("/")[1], "reason": NO_VIDEO_REASON})
            out.append(_complete(row, tid, pub))
    return sorted(out, key=lambda r: int(r["test"][1:]))


def _complete(row, test_id, pub):
    row["test_id"] = test_id
    row["nasa_outcome"] = pub["value"].strip()
    row["nasa_source"] = f"{pub['row_id']}, {NASA_SOURCE_TEXT}"
    row["match"] = match_label(row["grade"], row["nasa_outcome"])
    return row


CHECKED_COLUMNS = ["test", "checked_by", "checked_date", "checked_grade",
                   "checked_flame_seen_from_s", "checked_flame_gone_s", "checked_note"]


def leading_number(text):
    """The first number in a grader's text ('~13' gives 13.0, '2-5' gives 2.0), None if none."""
    m = re.search(r"\d+(?:\.\d+)?", text or "")
    return float(m.group()) if m else None


def _number_or_none(text):
    text = (text or "").strip()
    return float(text) if text else None


def agrees_with_si(si_grade, checked_grade):
    """'yes' (same label), 'no', or 'decided' (SI could not tell and the person gave a grade)."""
    si = (si_grade or "").strip()
    chk = (checked_grade or "").strip()
    if si == UNDECIDED_GRADE:
        return "decided" if chk else "no"
    return "yes" if si == chk else "no"


def build_checked(checked_rows, grade_rows):
    """One dict per person-checked test that has an SI grade row, in test-number order.

    Adds the SI grade, whether the person agreed with it, and whether the checked grade matches
    NASA's outcome (same rule as the SI match). A checked grade must be a known label.
    """
    by_test = {r["test"].strip(): r for r in grade_rows}
    out = []
    for c in checked_rows:
        test = c["test"].strip()
        g = by_test.get(test)
        if g is None:
            continue
        grade = c["checked_grade"].strip()
        if grade not in GRADE_TO_NASA:
            raise ValueError(f"{test}: unknown checked grade {grade!r}")
        out.append({
            "test": test, "test_id": g["test_id"], "file_name": g["file_name"],
            "by": c["checked_by"].strip(), "date": c["checked_date"].strip(), "grade": grade,
            "flame_seen_from_s": _number_or_none(c["checked_flame_seen_from_s"]),
            "flame_gone_s": _number_or_none(c["checked_flame_gone_s"]),
            "note": c["checked_note"].strip(), "si_grade": g["grade"].strip(),
            "agrees_with_si": agrees_with_si(g["grade"], grade),
            "nasa_outcome": g["nasa_outcome"],
            "match": match_label(grade, g["nasa_outcome"])})
    return sorted(out, key=lambda r: int(r["test"][1:]))


def write_csv(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as handle:
        w = csv.DictWriter(handle, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


if __name__ == "__main__":
    import sys
    here = Path(__file__).resolve().parent
    src = Path(sys.argv[1])
    write_csv(here / "t_series_grades.csv", build_rows(read_csv(src), read_csv(here / "published.csv")))
