"""Grid lookup rules and the committed engine output (no data/raw needed)."""

import json
import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline/flame_temperature"))

import grid  # noqa: E402

OUT = ROOT / "data/modules/flame-temperature"


def tiny_tests():
    rows = [(1, 2000.0, -3.7, 2.0), (2, 2100.0, -3.7, 2.0), (3, 2600.0, -3.7, 2.0)]
    df = pd.DataFrame(rows, columns=["flex_test", "ceiling_temperature_k", "log_heat_spreading", "d0_mm"])
    return {"Methanol": df}


class GridTest(unittest.TestCase):
    def test_exact_conditions_list_that_test_first_with_zero_distance(self):
        near = grid.nearest(tiny_tests(), "Methanol", 2100.0, -3.7, 2.0)
        self.assertEqual(near[0][0], 2)
        self.assertEqual(near[0][1], 0.0)

    def test_nearest_is_sorted_and_capped(self):
        near = grid.nearest(tiny_tests(), "Methanol", 2000.0, -3.7, 2.0, k=2)
        self.assertEqual([n[0] for n in near], [1, 2])

    def test_positions_leave_out_oxygen_plus_gas_above_one(self):
        pos = grid.positions([2.0])
        self.assertTrue(all(o2 + x <= 1.0 + 1e-9 for _, o2, _, x, _, _ in pos))
        self.assertEqual(len(pos), grid.expected_count([2.0]))
        self.assertFalse(any(g == "carbon dioxide" and x == 0.70 and o2 > 0.30 for _, o2, g, x, _, _ in pos))

    def test_ranges_stay_inside_the_tested_ranges(self):
        pos = grid.positions([2.0])
        self.assertEqual((min(p[1] for p in pos), max(p[1] for p in pos)), (0.12, 0.34))
        self.assertLessEqual(max(p[3] for p in pos if p[2] == "carbon dioxide"), 0.70)
        self.assertLessEqual(max(p[3] for p in pos if p[2] == "helium"), 0.45)
        self.assertEqual({p[4] for p in pos}, {0.7, 1.0})


class CommittedOutputTest(unittest.TestCase):
    def load(self, name):
        return json.loads((OUT / name).read_text(encoding="utf-8"))

    def test_tests_file_has_274_rows_273_with_numbers_and_114_dropped(self):
        rows = self.load("flex_tests.json")["tests"]
        self.assertEqual(len(rows), 274)
        with_numbers = [r for r in rows if r["ceiling_temperature_k"] is not None]
        self.assertEqual(len(with_numbers), 273)
        dropped = [r for r in rows if r["flags"]["dropped"]]
        self.assertEqual([r["flex_test"] for r in dropped], [114])

    def test_seven_checks_all_passed(self):
        doc = self.load("flex_checks.json")
        self.assertEqual(len(doc["checks"]), 7)
        self.assertTrue(doc["all_passed"])

    def test_grid_flags_have_no_prediction_and_file_is_small(self):
        rows = self.load("flex_grid.json")["rows"]
        cols = self.load("flex_grid.json")["header"]["columns"]
        pred, flag = cols.index("share_burned_pred"), cols.index("no_test_near")
        self.assertTrue(all(r[pred] is None for r in rows if r[flag]))
        self.assertLess((OUT / "flex_grid.json").stat().st_size, 3 * 1024 * 1024)

    def test_evidence_flags_are_lists_and_ids_unique(self):
        ev = self.load("evidence.json")
        self.assertEqual(len(ev), 742)
        self.assertTrue(all(isinstance(r["flags"], list) for r in ev))
        self.assertEqual(len({r["id"] for r in ev}), len(ev))
        self.assertTrue(all(r["test_id"].startswith("PSI-69/") for r in ev))

    def test_findings_have_seven_checks_and_no_reference_field(self):
        fi = self.load("findings.json")
        engine = {f"flame-temperature/check/{c['id']}" for c in self.load("flex_checks.json")["checks"]}
        doe = {f"flame-temperature/check/{c['id']}" for c in self.load("flex_doe.json")["checks"]}
        self.assertEqual(len(engine), 7)
        # The design-of-experiments checks (flex_doe.json) are listed after the engine's seven.
        self.assertEqual({f["id"] for f in fi if f["kind"] == "check"}, engine | doe)
        self.assertTrue(all("reference" not in f for f in fi))


if __name__ == "__main__":
    unittest.main()
