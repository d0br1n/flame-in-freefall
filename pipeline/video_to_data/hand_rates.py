# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Hand-measured spread rates and how far two people agree (Linear DOB-43, feeds DOB-42).

Two people each mark the flame's leading edge on the same videos, alone, without seeing the
pipeline's numbers. Each person saves one CSV per video in `pipeline/video_to_data/hand/`:

    <TEST>_<INITIALS>.csv      for example  B1_DG.csv

with `time_s` and at least one position column:
  time_s       the video's own time in seconds (frame number divided by 29.97 frames per second)
  position_px  distance of the flame's leading edge from the igniter end, in video pixels,
               growing as the flame advances. Always available: this is the unit the pipeline
               reports (px/s), because the PSI-25 videos show no known length to calibrate on.
  position_mm  the same distance in millimetres. Only when the person could calibrate on a
               length visible in the video.

This module turns those files into rates with the SAME fitting code as the pipeline
(`fit.fit_spread_rate`), so only the edge marking differs. It never reads the pipeline's
output (`results.csv`, `findings.json`): the comparison with the pipeline is a separate step,
done once both people have finished.

Pixel positions are fitted with no scale, so the rate is in px/s and carries the flag `no_scale`.
Millimetre positions are fitted with a scale of 1 px per mm: a unit convention, not a measured
scale. The real calibration uncertainty of a hand measurement is not known and is left out of
the interval; every millimetre result says so in its flags.

Run:  python -m pipeline.video_to_data.hand_rates          (writes hand/hand_rates.csv)
"""
from __future__ import annotations

import csv
import math
import re
import statistics
import sys
from pathlib import Path

from pipeline.video_to_data import fit

HAND_DIR = Path(__file__).resolve().parent / "hand"
OUT_CSV = HAND_DIR / "hand_rates.csv"

PSI_ID = "PSI-25"
PROVENANCE = "HAND_MEASURED"
# Files named <TEST>_SI.csv come from the automated pixel detector (si_draft.py), not from a person.
SI_INITIALS = "SI"
PROVENANCE_SI = "SI_EXTRACTED"
HAND_CHECKED_FLAG = "hand_checked_by_team_member"   # a person watched the review videos and approved the SI markings
MIN_POINTS = 10
FILE_RE = re.compile(r"^(?P<test>[A-Z]+\d+)_(?P<who>[A-Za-z]{2,4})\.csv$")
TIME_COLUMN = "time_s"
POSITION_COLUMNS = ("position_px", "position_mm")
# Added to every millimetre rate: the interval leaves out the calibration of the person's own scale.
MM_FLAGS = ["hand_calibration_uncertainty_not_included"]
# Two people "agree" when their rates differ by less than this share of the larger rate.
AGREE_REL = 0.25
UNITS = {"px/s": "rate_px_s", "mm/s": "rate_mm_s"}


class HandFileError(ValueError):
    """A hand-measurement file is missing something, so no rate is computed from it."""


def parse_name(path: Path) -> tuple[str, str]:
    """Return (test, initials) from `B1_DG.csv`. Anything else is an error."""
    match = FILE_RE.match(path.name)
    if not match:
        raise HandFileError(f"{path.name}: expected <TEST>_<INITIALS>.csv, for example B1_DG.csv")
    return match["test"], match["who"].upper()


def read_hand_file(path: Path) -> dict:
    """Read time_s and the position column(s). Returns {"times", "px", "mm"}; px or mm may be None.

    Rejects a missing time column, no position column, empty cells, bad numbers and time going
    backwards, and says which line is wrong.
    """
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        names = reader.fieldnames or []
        present = [c for c in POSITION_COLUMNS if c in names]
        if TIME_COLUMN not in names or not present:
            raise HandFileError(
                f"{path.name}: missing column(s); need {TIME_COLUMN} and at least one of {list(POSITION_COLUMNS)}"
            )
        data = {c: [] for c in present}
        times = []
        for number, row in enumerate(reader, start=2):
            try:
                t = float(row[TIME_COLUMN])
                values = {c: float(row[c]) for c in present}
            except (TypeError, ValueError):
                raise HandFileError(f"{path.name} line {number}: {TIME_COLUMN} and position must be numbers") from None
            if not (math.isfinite(t) and all(math.isfinite(v) for v in values.values())):
                raise HandFileError(f"{path.name} line {number}: values must be finite")
            times.append(t)
            for c, v in values.items():
                data[c].append(v)
    if any(b <= a for a, b in zip(times, times[1:])):
        raise HandFileError(f"{path.name}: {TIME_COLUMN} must strictly increase from row to row")
    return {"times": times, "px": data.get("position_px"), "mm": data.get("position_mm")}


def rate_for_file(path: Path, *, n_boot: int = 1000) -> dict:
    """One person, one video: the spread rate from the pipeline's own fitting code.

    `rate_px_s` / `rate_mm_s` are None when that column is not in the file. The interval,
    window and flags are those of the millimetre fit when there is one, otherwise of the pixel fit.
    """
    test, who = parse_name(path)
    series = read_hand_file(path)
    times = series["times"]
    px_fit = fit.fit_spread_rate(times, series["px"], scale_px_per_mm=None, n_boot=n_boot) if series["px"] else None
    mm_fit = fit.fit_spread_rate(times, series["mm"], scale_px_per_mm=1.0, n_boot=n_boot) if series["mm"] else None
    main = mm_fit or px_fit
    flags = list(main["flags"]) + (MM_FLAGS if mm_fit else [])
    if len(times) < MIN_POINTS:
        flags.append("fewer_than_10_points")
    if who == SI_INITIALS:
        flags.append(HAND_CHECKED_FLAG)
    return {
        "test_id": f"{PSI_ID}/{test}",
        "test": test,
        "who": who,
        "file": path.name,
        "provenance": PROVENANCE_SI if who == SI_INITIALS else PROVENANCE,
        "n_marked": len(times),
        "rate_px_s": px_fit["rate"] if px_fit else None,
        "px_ci_low": px_fit["ci_low"] if px_fit else None,
        "px_ci_high": px_fit["ci_high"] if px_fit else None,
        "rate_mm_s": mm_fit["rate"] if mm_fit else None,
        "ci_low": mm_fit["ci_low"] if mm_fit else None,
        "ci_high": mm_fit["ci_high"] if mm_fit else None,
        "window_start_s": main["window_start_s"],
        "window_end_s": main["window_end_s"],
        "flags": flags,
    }


def rates_in(folder: Path = HAND_DIR, *, n_boot: int = 1000) -> list[dict]:
    """Every `<TEST>_<INITIALS>.csv` in the folder (hand_rates.csv itself is skipped)."""
    files = sorted(p for p in folder.glob("*.csv") if p.name != OUT_CSV.name and FILE_RE.match(p.name))
    return [rate_for_file(p, n_boot=n_boot) for p in files]


def agreement(rates: list[dict], agree_rel: float = AGREE_REL, quantity: str = "rate_mm_s") -> dict:
    """Human against human, for every video measured by at least two people.

    `quantity` is `rate_mm_s` or `rate_px_s`; a person with no value in that unit is left out.
    For three or more people on one video, the first two by initials are compared and the
    others are listed under `extra_people`. Pairs where either rate is missing are counted
    but not scored.
    """
    by_test: dict[str, list[dict]] = {}
    for rate in rates:
        if rate.get("provenance", PROVENANCE) != PROVENANCE:
            continue  # the SI draft is not a person: it never counts in person-against-person agreement
        by_test.setdefault(rate["test"], []).append(rate)
    pairs, skipped = [], 0
    for test in sorted(by_test):
        people = sorted((r for r in by_test[test] if r.get(quantity) is not None), key=lambda r: r["who"])
        if len(people) < 2:
            continue
        first, second = people[0], people[1]
        a, b = first[quantity], second[quantity]
        if max(abs(a), abs(b)) == 0:
            skipped += 1
            continue
        diff = a - b
        rel = abs(diff) / max(abs(a), abs(b))
        pairs.append({
            "test_id": first["test_id"], "people": [first["who"], second["who"]],
            "rates": [a, b], "difference": diff, "relative_difference": rel,
            "agree": rel <= agree_rel, "extra_people": [p["who"] for p in people[2:]],
        })
    one_person = sum(1 for v in by_test.values() if sum(r.get(quantity) is not None for r in v) == 1)
    summary = {"quantity": quantity, "pairs": len(pairs), "pairs_not_scored": skipped,
               "agree_threshold": agree_rel, "videos_with_one_person": one_person}
    if pairs:
        summary["agreeing"] = sum(p["agree"] for p in pairs)
        summary["median_relative_difference"] = statistics.median(p["relative_difference"] for p in pairs)
        summary["mean_signed_difference"] = statistics.fmean(p["difference"] for p in pairs)
    # Kept under the old key names too, so earlier callers keep working.
    for p in pairs:
        p["rates_mm_s" if quantity == "rate_mm_s" else "rates_px_s"] = p["rates"]
        p["difference_mm_s" if quantity == "rate_mm_s" else "difference_px_s"] = p["difference"]
    return {"summary": summary, "pairs": pairs}


def write_rates(rates: list[dict], out: Path = OUT_CSV) -> None:
    fields = ["test_id", "who", "provenance", "n_marked", "rate_px_s", "px_ci_low", "px_ci_high",
              "rate_mm_s", "ci_low", "ci_high", "window_start_s", "window_end_s", "flags", "file"]
    with open(out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for r in rates:
            row = {k: r[k] for k in fields}
            row["flags"] = ";".join(r["flags"])
            writer.writerow(row)


def main(argv: list[str] | None = None) -> int:
    rates = rates_in()
    if not rates:
        print(f"No hand files in {HAND_DIR}. See PROTOCOL.md there.", file=sys.stderr)
        return 1
    write_rates(rates)
    for r in rates:
        parts = []
        if r["rate_px_s"] is not None:
            parts.append(f"{r['rate_px_s']:.2f} px/s")
        if r["rate_mm_s"] is not None:
            parts.append(f"{r['rate_mm_s']:.2f} mm/s")
        print(f"{r['test_id']:12s} {r['who']:4s} {' | '.join(parts) or 'none':>24s}  n={r['n_marked']:3d}  {';'.join(r['flags'])}")
    for quantity in UNITS.values():
        result = agreement(rates, quantity=quantity)
        if result["summary"]["pairs"] or result["summary"]["videos_with_one_person"]:
            print(result["summary"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
