"""Tests for pipeline/video_to_data/validate.py (Linear DOB-42): validation statistics.

All inputs are synthetic and written to a temporary folder. No test is skipped or expected to fail.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import csv
import tempfile
import unittest
from pathlib import Path

import numpy as np

from pipeline.video_to_data import validate

RESULT_FIELDS = ["test_id", "segment", "rate", "rate_unit", "flags"]
PUB_FIELDS = ["row_id", "test_ids", "quantity", "value", "unit", "match", "page_printed"]


def write_csv(path: Path, fields, rows):
    with open(path, "w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({f: row.get(f, "") for f in fields})
    return path


def hand_file(folder: Path, name: str, speed: float, seed: int):
    rng = np.random.default_rng(seed)
    t = np.arange(0.0, 30.0, 1.0)
    x = 5.0 + speed * t + rng.normal(0, 0.15, size=t.size)
    (folder / name).write_text("time_s,position_mm\n" + "\n".join(f"{a:.2f},{b:.3f}" for a, b in zip(t, x)) + "\n")


def px_hand_file(folder: Path, name: str, speed_px: float, seed: int):
    rng = np.random.default_rng(seed)
    t = np.arange(0.0, 30.0, 1.0)
    x = 40.0 + speed_px * t + rng.normal(0, 0.5, size=t.size)
    (folder / name).write_text("time_s,position_px\n" + "\n".join(f"{a:.2f},{b:.2f}" for a, b in zip(t, x)) + "\n")


class Statistics(unittest.TestCase):
    def test_hand_computed_values(self):
        # differences measured - reference: +0.2, -0.1, +0.3
        pairs = [("a", 2.2, 2.0), ("b", 1.9, 2.0), ("c", 3.3, 3.0)]
        s = validate.statistics_for(pairs)
        self.assertEqual(s["n"], 3)
        self.assertAlmostEqual(s["mean_signed_error"], 0.4 / 3)
        self.assertAlmostEqual(s["mean_abs_error"], 0.6 / 3)
        self.assertAlmostEqual(s["mean_abs_percent_error"], (0.1 + 0.05 + 0.1) / 3)
        sd = np.std([0.2, -0.1, 0.3], ddof=1)
        low, high = s["limits_of_agreement"]
        self.assertAlmostEqual(low, 0.4 / 3 - 1.96 * sd)
        self.assertAlmostEqual(high, 0.4 / 3 + 1.96 * sd)

    def test_no_pairs_gives_no_statistics_and_says_so(self):
        s = validate.statistics_for([])
        self.assertEqual(s["n"], 0)
        self.assertIsNone(s["mean_signed_error"])
        self.assertIn("no_pairs", s["flags"])

    def test_one_pair_has_no_limits_of_agreement(self):
        s = validate.statistics_for([("a", 2.0, 2.2)])
        self.assertEqual(s["n"], 1)
        self.assertIsNone(s["limits_of_agreement"])
        self.assertIn("n_below_2_no_limits_of_agreement", s["flags"])
        self.assertAlmostEqual(s["mean_signed_error"], -0.2)


class Inputs(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_example_rows_and_px_rates_and_ambiguous_tests_are_not_compared(self):
        results = write_csv(self.dir / "results.csv", RESULT_FIELDS, [
            {"test_id": "PSI-25/EXAMPLE1", "segment": "x", "rate": "9.99", "rate_unit": "mm/s", "flags": "example"},
            {"test_id": "PSI-25/B1", "segment": "steady", "rate": "2.0", "rate_unit": "mm/s"},
            {"test_id": "PSI-25/B3", "segment": "steady", "rate": "40", "rate_unit": "px/s"},
            {"test_id": "PSI-25/B4", "segment": "a", "rate": "1.0", "rate_unit": "mm/s"},
            {"test_id": "PSI-25/B4", "segment": "b", "rate": "1.2", "rate_unit": "mm/s"},
        ])
        rates, skipped = validate.pipeline_rates(results)
        self.assertEqual(rates, {"PSI-25/B1": 2.0})
        reasons = {s["test_id"]: s["reason"] for s in skipped}
        self.assertIn("no scale", reasons["PSI-25/B3"])
        self.assertIn("ambiguous", reasons["PSI-25/B4"])

    def test_only_single_test_steady_spread_rates_in_mm_s_count_as_published(self):
        published = write_csv(self.dir / "published.csv", PUB_FIELDS, [
            {"row_id": "P1", "test_ids": "PSI-25/B1", "quantity": "steady_spread_rate", "value": "2.2", "unit": "mm/s", "match": "inferred"},
            {"row_id": "P2", "test_ids": "", "quantity": "highest_spread_rate", "value": "2.2", "unit": "mm/s", "match": "group"},
            {"row_id": "P3", "test_ids": "PSI-25/B2", "quantity": "steady_spread_rate", "value": "3", "unit": "mm/s", "match": "context"},
            {"row_id": "P4", "test_ids": "PSI-25/B3;PSI-25/B4", "quantity": "steady_spread_rate", "value": "2", "unit": "mm/s", "match": "named in report"},
            {"row_id": "P5", "test_ids": "PSI-25/B5", "quantity": "steady_spread_rate", "value": "20", "unit": "cm/s", "match": "named in report"},
            {"row_id": "P6", "test_ids": "PSI-25/B6", "quantity": "steady_spread_rate", "value": "n/a", "unit": "mm/s", "match": "named in report"},
        ])
        self.assertEqual(list(validate.published_rates(published)), ["PSI-25/B1"])

    def test_built_validation_from_all_three_sources(self):
        results = write_csv(self.dir / "results.csv", RESULT_FIELDS, [
            {"test_id": "PSI-25/B1", "segment": "steady", "rate": "2.0", "rate_unit": "mm/s"},
            {"test_id": "PSI-25/B3", "segment": "steady", "rate": "2.4", "rate_unit": "mm/s"},
        ])
        published = write_csv(self.dir / "published.csv", PUB_FIELDS, [
            {"row_id": "P1", "test_ids": "PSI-25/B1", "quantity": "steady_spread_rate", "value": "2.2", "unit": "mm/s", "match": "inferred"},
        ])
        hand = self.dir / "hand"
        hand.mkdir()
        hand_file(hand, "B1_AB.csv", 2.1, 1)
        hand_file(hand, "B1_DG.csv", 2.3, 2)
        hand_file(hand, "B3_AB.csv", 2.5, 3)
        hand_file(hand, "B3_DG.csv", 2.3, 4)
        v = validate.build_validation(results, published, hand)
        self.assertEqual(v["status"], "built")
        by_id = {c["id"]: c for c in v["comparisons"]}
        self.assertEqual(by_id["val-published"]["n"], 1)
        self.assertIn("inferred_match", by_id["val-published"]["flags"])
        self.assertEqual(by_id["val-hand"]["n"], 2)
        self.assertEqual(by_id["val-human-human"]["n"], 2)
        for c in v["comparisons"]:
            self.assertEqual(c["unit"], "px/s" if c["id"].endswith("-px") else "mm/s")
            self.assertEqual(c["n"], len(c["pairs"]))
        self.assertEqual(by_id["val-hand-px"]["n"], 0)  # the pipeline rows here are in mm/s

    def test_pipeline_px_rates_are_compared_with_the_hand_px_rates(self):
        results = write_csv(self.dir / "results.csv", RESULT_FIELDS, [
            {"test_id": "PSI-25/B1", "segment": "steady", "rate": "22.0", "rate_unit": "px/s", "flags": "no_scale"},
            {"test_id": "PSI-25/B3", "segment": "steady", "rate": "30.0", "rate_unit": "px/s", "flags": "no_scale"},
        ])
        published = write_csv(self.dir / "published.csv", PUB_FIELDS, [])
        hand = self.dir / "hand"
        hand.mkdir()
        px_hand_file(hand, "B1_AB.csv", 21.0, 1)
        px_hand_file(hand, "B1_DG.csv", 23.0, 2)
        px_hand_file(hand, "B3_AB.csv", 27.0, 3)
        px_hand_file(hand, "B3_DG.csv", 29.0, 4)
        v = validate.build_validation(results, published, hand)
        by_id = {c["id"]: c for c in v["comparisons"]}
        self.assertEqual(v["status"], "built")
        self.assertEqual(by_id["val-hand-px"]["n"], 2)
        self.assertEqual(by_id["val-hand-px"]["unit"], "px/s")
        self.assertIn("no_scale", by_id["val-hand-px"]["flags"])
        self.assertEqual(by_id["val-human-human-px"]["n"], 2)
        self.assertEqual(by_id["val-hand"]["n"], 0)  # no mm anywhere: nothing is compared in mm/s
        self.assertEqual(by_id["val-published"]["n"], 0)
        (check,) = [f for f in validate.findings_checks(v) if f["id"] == "find-val-hand-px"]
        self.assertEqual(check["unit"], "px/s")
        self.assertEqual(check["n"], 2)
        self.assertIn("px/s", check["text"])

    def test_the_si_draft_is_compared_separately_and_is_not_a_person(self):
        results = write_csv(self.dir / "results.csv", RESULT_FIELDS, [
            {"test_id": "PSI-25/B1", "segment": "steady", "rate": "22.0", "rate_unit": "px/s", "flags": "no_scale"},
        ])
        published = write_csv(self.dir / "published.csv", PUB_FIELDS, [])
        hand = self.dir / "hand"
        hand.mkdir()
        px_hand_file(hand, "B1_SI.csv", 21.0, 1)
        v = validate.build_validation(results, published, hand)
        by_id = {c["id"]: c for c in v["comparisons"]}
        self.assertEqual(by_id["val-si-px"]["n"], 1)
        self.assertEqual(by_id["val-si-px"]["provenance"], "SI_EXTRACTED")
        self.assertIn("si_draft_not_an_independent_human_measurement", by_id["val-si-px"]["flags"])
        self.assertEqual(by_id["val-hand-px"]["n"], 0)   # no person measured anything
        self.assertEqual(by_id["val-human-human-px"]["n"], 0)

    def test_pipeline_rates_can_be_read_in_either_unit(self):
        results = write_csv(self.dir / "results.csv", RESULT_FIELDS, [
            {"test_id": "PSI-25/B1", "segment": "steady", "rate": "2.0", "rate_unit": "mm/s"},
            {"test_id": "PSI-25/B3", "segment": "steady", "rate": "30", "rate_unit": "px/s"},
        ])
        self.assertEqual(validate.pipeline_rates(results, "mm/s")[0], {"PSI-25/B1": 2.0})
        self.assertEqual(validate.pipeline_rates(results, "px/s")[0], {"PSI-25/B3": 30.0})

    def test_example_only_results_give_no_data(self):
        results = write_csv(self.dir / "results.csv", RESULT_FIELDS, [
            {"test_id": "PSI-25/EXAMPLE1", "segment": "x", "rate": "9.99", "rate_unit": "mm/s", "flags": "example"},
        ])
        published = write_csv(self.dir / "published.csv", PUB_FIELDS, [])
        hand = self.dir / "hand"
        hand.mkdir()
        v = validate.build_validation(results, published, hand)
        self.assertEqual(v["status"], "no_data")
        self.assertEqual(validate.findings_checks(v), [])


class Findings(unittest.TestCase):
    REQUIRED = {"id", "module", "kind", "text", "value", "unit", "n", "provenance", "source", "passed"}

    def make(self, pairs):
        c = validate.comparison("val-x", "Tracker against hand", pairs, provenance="HAND_MEASURED", reference="hand/")
        return validate.findings_checks({"comparisons": [c]})

    def test_check_finding_has_the_contract_fields_and_the_count(self):
        (f,) = self.make([("a", 2.0, 2.0), ("b", 2.2, 2.0), ("c", 1.8, 2.0)])
        self.assertTrue(self.REQUIRED <= set(f))
        self.assertEqual(f["kind"], "check")
        self.assertEqual(f["n"], 3)
        self.assertEqual(f["source"]["psi_id"], "PSI-25")
        self.assertIn("3 tests", f["text"])
        self.assertTrue(f["passed"])

    def test_a_large_error_does_not_pass(self):
        (f,) = self.make([("a", 1.0, 2.0), ("b", 3.0, 2.0)])
        self.assertFalse(f["passed"])

    def test_a_comparison_with_no_pairs_makes_no_finding(self):
        self.assertEqual(self.make([]), [])


if __name__ == "__main__":
    unittest.main()
