# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Validation statistics for the video engine (Linear DOB-42): pipeline against references.

Compares the pipeline's spread rates (`results.csv`) with
  * the values NASA published (`published.csv`, DOB-30), and
  * the hand measurements of two people (`hand/`, DOB-43),
and compares the two people with each other. Each comparison reports its count `n`, the mean
signed error (bias), the mean absolute error, the mean absolute percentage error and the
Bland-Altman limits of agreement (bias +/- 1.96 standard deviations of the differences).

What it does not do
* It never invents a value. A comparison with no pairs has n = 0 and no statistics.
* With fewer than 2 pairs there are no limits of agreement; the comparison says so in its flags.
* The threshold sweep (move the tracker threshold 30% each way) needs the tracker, not these
  tables, and is not here.
* Rows of the example module (test ID containing EXAMPLE, or flag `example`) are ignored.

Pairing rules (a pair that does not meet them is listed under `skipped`, with the reason)
* Rates are only compared in the same unit. The pipeline reports px/s (no scale is visible in the
  PSI-25 videos), so the hand check is made in px/s; mm/s comparisons (published values, hand files
  with a position_mm column) are kept for when a scale exists.
* A published value is used only when `quantity` is `steady_spread_rate`, it names exactly one
  test, its unit is mm/s and its `match` is `named in report` or `inferred`. Group values and
  context values are not test values. An `inferred` match is flagged.
* The pipeline must have exactly one mm/s rate row for the test; with several segments the pair
  is skipped as ambiguous rather than picking one.

The pass rule of a check is a proposal, not a finding: the mean absolute percentage error is at
most `PASS_MAPE` (25%, the same limit hand_rates uses for two people to "agree").

Run:  python -m pipeline.video_to_data.validate     (writes validation.json only if there is data)
"""
from __future__ import annotations

import csv
import json
import math
import statistics
import sys
from pathlib import Path

from pipeline.video_to_data import hand_rates

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
MODULE_DIR = REPO / "data/modules/video-to-data"
RESULTS_CSV = MODULE_DIR / "results.csv"
PUBLISHED_CSV = HERE / "published.csv"
VALIDATION_JSON = MODULE_DIR / "validation.json"
FINDINGS_JSON = MODULE_DIR / "findings.json"

MODULE_ID = "video-to-data"
PSI_ID = "PSI-25"
PSI_LINK = "https://psi.nasa.gov"
Z_95 = 1.96
PASS_MAPE = hand_rates.AGREE_REL
PUBLISHED_MATCHES = ("named in report", "inferred")


def _is_example(row: dict) -> bool:
    return "EXAMPLE" in (row.get("test_id") or "").upper() or "example" in (row.get("flags") or "").lower()


def _number(text) -> float | None:
    try:
        value = float(text)
    except (TypeError, ValueError):
        return None
    return value if math.isfinite(value) else None


def pipeline_rates(results_csv: Path = RESULTS_CSV, unit: str = "mm/s") -> tuple[dict[str, float], list[dict]]:
    """Test ID -> the pipeline's one rate in `unit` (mm/s or px/s); plus tests skipped, each with a reason."""
    by_test: dict[str, list[float]] = {}
    skipped: list[dict] = []
    with open(results_csv, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if _is_example(row):
                continue
            rate = _number(row.get("rate"))
            if rate is None:
                continue
            if (row.get("rate_unit") or "").strip() != unit:
                if unit == "mm/s":  # a px/s row cannot be compared in mm/s; say so once per row
                    skipped.append({"test_id": row["test_id"], "reason": "rate has no scale (not in mm/s)"})
                continue
            by_test.setdefault(row["test_id"], []).append(rate)
    rates: dict[str, float] = {}
    for test_id, values in by_test.items():
        if len(values) == 1:
            rates[test_id] = values[0]
        else:
            skipped.append({"test_id": test_id, "reason": f"ambiguous: {len(values)} {unit} rate rows"})
    return rates, skipped


def published_rates(published_csv: Path = PUBLISHED_CSV) -> dict[str, dict]:
    """Test ID -> {value, match, row_id, page} for published steady spread rates of one test."""
    out: dict[str, dict] = {}
    with open(published_csv, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            ids = [t for t in (row["test_ids"] or "").split(";") if t]
            value = _number(row["value"])
            if (row["quantity"] != "steady_spread_rate" or len(ids) != 1 or value is None
                    or row["unit"] != "mm/s" or row["match"] not in PUBLISHED_MATCHES):
                continue
            out[ids[0]] = {"value": value, "match": row["match"], "row_id": row["row_id"],
                           "page_printed": row["page_printed"]}
    return out


def hand_mean_rates(hand_dir: Path = hand_rates.HAND_DIR, n_boot: int = 200,
                    quantity: str = "rate_mm_s") -> tuple[dict[str, dict], list[dict]]:
    """Test ID -> {rate (mean over people), people}; and every person's rate list.

    `quantity` is `rate_mm_s` or `rate_px_s`; a person with no value in that unit is left out.
    """
    people = hand_rates.rates_in(hand_dir, n_boot=n_boot)
    by_test: dict[str, list[dict]] = {}
    for rate in people:
        if rate[quantity] is not None and rate["provenance"] == hand_rates.PROVENANCE:  # people only, not the SI draft
            by_test.setdefault(rate["test_id"], []).append(rate)
    means = {t: {"rate": statistics.fmean(r[quantity] for r in rs), "people": sorted(r["who"] for r in rs)}
             for t, rs in by_test.items()}
    return means, people


def statistics_for(pairs: list[tuple[str, float, float]]) -> dict:
    """Statistics for (test_id, measured, reference) pairs. Difference = measured - reference."""
    n = len(pairs)
    out: dict = {"n": n, "mean_signed_error": None, "mean_abs_error": None,
                 "mean_abs_percent_error": None, "limits_of_agreement": None, "flags": []}
    if n == 0:
        out["flags"].append("no_pairs")
        return out
    diffs = [m - r for _, m, r in pairs]
    out["mean_signed_error"] = statistics.fmean(diffs)
    out["mean_abs_error"] = statistics.fmean(abs(d) for d in diffs)
    percents = [abs(m - r) / abs(r) for _, m, r in pairs if r != 0]
    if percents:
        out["mean_abs_percent_error"] = statistics.fmean(percents)
    if n >= 2:
        sd = statistics.stdev(diffs)
        out["limits_of_agreement"] = [out["mean_signed_error"] - Z_95 * sd, out["mean_signed_error"] + Z_95 * sd]
    else:
        out["flags"].append("n_below_2_no_limits_of_agreement")
    return out


def comparison(comparison_id: str, name: str, pairs: list[tuple[str, float, float]], *, flags=(),
               provenance: str, reference: str, unit: str = "mm/s") -> dict:
    stats = statistics_for(pairs)
    stats["flags"] = list(flags) + stats["flags"]
    return {"id": comparison_id, "name": name, "quantity": "spread_rate", "unit": unit,
            "provenance": provenance, "reference": reference,
            "pairs": [{"test_id": t, "measured": m, "reference": r} for t, m, r in pairs], **stats}


def build_validation(results_csv: Path = RESULTS_CSV, published_csv: Path = PUBLISHED_CSV,
                     hand_dir: Path = hand_rates.HAND_DIR) -> dict:
    pipeline, skipped = pipeline_rates(results_csv)
    published = published_rates(published_csv)
    hand, people = hand_mean_rates(hand_dir)
    comparisons = []

    pairs = [(t, pipeline[t], p["value"]) for t, p in sorted(published.items()) if t in pipeline]
    flags = ["inferred_match"] if any(published[t]["match"] == "inferred" for t, _, _ in pairs) else []
    comparisons.append(comparison("val-published", "Tracker against published value", pairs, flags=flags,
                                  provenance="PUBLISHED", reference="NASA/TM-20210011385 (published.csv)"))
    pairs = [(t, pipeline[t], h["rate"]) for t, h in sorted(hand.items()) if t in pipeline]
    comparisons.append(comparison("val-hand", "Tracker against hand measurement (mean of the people)", pairs,
                                  provenance="HAND_MEASURED", reference="hand/ (DOB-43)"))
    agree = hand_rates.agreement(people)
    pairs = [(p["test_id"], p["rates"][0], p["rates"][1]) for p in agree["pairs"]]
    comparisons.append(comparison("val-human-human", "Hand measurement, person against person", pairs,
                                  provenance="HAND_MEASURED", reference="hand/ (DOB-43)"))
    # Pixel comparisons: the pipeline reports px/s (no scale is visible in the PSI-25 videos), so the
    # hand check is made in px/s too. No published value is in px/s, so there is no published pixel row.
    pipeline_px, _ = pipeline_rates(results_csv, unit="px/s")
    hand_px, _ = hand_mean_rates(hand_dir, quantity="rate_px_s")
    pairs = [(t, pipeline_px[t], h["rate"]) for t, h in sorted(hand_px.items()) if t in pipeline_px]
    comparisons.append(comparison("val-hand-px", "Tracker against hand measurement, in pixels per second (mean of the people)",
                                  pairs, flags=["no_scale"], provenance="HAND_MEASURED",
                                  reference="hand/ (DOB-43)", unit="px/s"))
    agree_px = hand_rates.agreement(people, quantity="rate_px_s")
    pairs = [(p["test_id"], p["rates"][0], p["rates"][1]) for p in agree_px["pairs"]]
    comparisons.append(comparison("val-human-human-px", "Hand measurement in pixels per second, person against person",
                                  pairs, flags=["no_scale"], provenance="HAND_MEASURED",
                                  reference="hand/ (DOB-43)", unit="px/s"))
    # The SI draft (automated pixel detector, accepted on review by a team member) against the pipeline.
    si = {r["test_id"]: r["rate_px_s"] for r in people
          if r["provenance"] == hand_rates.PROVENANCE_SI and r["rate_px_s"] is not None}
    pairs = [(t, pipeline_px[t], v) for t, v in sorted(si.items()) if t in pipeline_px]
    comparisons.append(comparison("val-si-px", "Tracker against the SI markings, hand checked by a team member, in pixels per second", pairs,
                                  flags=["no_scale", hand_rates.HAND_CHECKED_FLAG, "si_draft_not_an_independent_human_measurement"],
                                  provenance="SI_EXTRACTED", reference="hand/<TEST>_SI.csv (si_draft.py)", unit="px/s"))
    has_data = any(c["n"] > 0 for c in comparisons)
    return {"status": "built" if has_data else "no_data", "comparisons": comparisons, "skipped": skipped,
            "pass_rule": f"mean absolute percentage error at most {PASS_MAPE:.0%} (a proposal, not a finding)"}


def findings_checks(validation: dict) -> list[dict]:
    """One `check` finding per comparison that has pairs, in the shape of findings.schema.json."""
    out = []
    for c in validation["comparisons"]:
        if c["n"] == 0 or c["mean_abs_percent_error"] is None:
            continue
        percent = c["mean_abs_percent_error"]
        out.append({
            "id": f"find-{c['id']}", "module": MODULE_ID, "kind": "check",
            "text": (f"{c['name']}: mean absolute error {c['mean_abs_error']:.2f} {c['unit']} "
                     f"({percent:.0%}) over {c['n']} test{'s' if c['n'] != 1 else ''}."),
            "value": round(c["mean_abs_error"], 3), "unit": c["unit"], "n": c["n"],
            "provenance": c["provenance"],
            "source": {"psi_id": PSI_ID, "file": "results.csv", "link": PSI_LINK},
            "passed": percent <= PASS_MAPE,
        })
    return out


def main(argv: list[str] | None = None) -> int:
    validation = build_validation()
    for c in validation["comparisons"]:
        mae = "-" if c["mean_abs_error"] is None else f"{c['mean_abs_error']:.2f} {c['unit']}"
        print(f"{c['id']:18s} n={c['n']:2d}  mean abs error {mae}  {';'.join(c['flags'])}")
    if validation["status"] == "no_data":
        print("No pairs yet (results.csv holds no real rows or no hand files). Nothing written.", file=sys.stderr)
        return 1
    VALIDATION_JSON.write_text(json.dumps(validation, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {VALIDATION_JSON.relative_to(REPO)}; {len(findings_checks(validation))} check finding(s) "
          "ready to add to findings.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
