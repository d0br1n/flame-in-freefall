"""Gap list, helium flag and coverage headline (DOB-113). No data/raw needed: the two small
tables are read from fixtures holding real rows copied from PSI-39 and PSI-68."""

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline/flame_temperature"))

import gaps  # noqa: E402
import handover  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = ROOT / "data/modules/flame-temperature"
GRID_COLUMNS = ["fuel", "x_o2", "added_gas", "x_added", "pressure_atm", "d0_mm", "ceiling_temperature_k",
                "heat_spreading_m2_s", "share_burned_pred", "no_test_near", "nearest"]
SPANS = {"x_o2": 0.22, "x_co2": 0.7, "x_he": 0.45, "pressure_atm": 0.3}


def fixture_cfi():
    return gaps.cfi_rows(gaps.read_table(HERE / "cfi_fixture.csv"))


def fixture_plan():
    return gaps.flex2_plan(gaps.read_table(HERE / "flex2_fixture.csv"))


def flex_row(n, x_o2, x_co2=0.0, x_he=0.0, p=0.70, fuel="Methanol", dropped=False):
    """One row shaped like flex_tests.json."""
    return {"test_id": f"PSI-69/{n}", "flex_test": n, "fuel": fuel, "x_o2": x_o2, "x_n2": round(1 - x_o2 - x_co2 - x_he, 4),
            "x_co2": x_co2, "x_he": x_he, "pressure_atm": 0.0 if dropped else p,
            "flags": {"dropped": dropped, "incomplete": False}, "dropped_reason": "pressure listed as 0 mmHg" if dropped else None}


def grid_doc(positions):
    """A tiny flex_grid.json with the real column order; positions are (fuel, o2, gas, x, p)."""
    rows = [[f, o2, g, x, p, 2.0, 2000.0, 1e-4, 0.5, False, [[1, 0.1]]] for f, o2, g, x, p in positions]
    return {"header": {"columns": list(GRID_COLUMNS)}, "rows": rows}


def checks_doc(t=-0.339, b=0.16):
    return {"checks": [{"id": "carry_over_helium", "n_test": 22,
                        "result": {"temperature_only": {"r2": t}, "both_numbers": {"r2": b}}}]}


SPAN_POSITIONS = [("Methanol", 0.12, "none", 0.0, 1.0), ("Methanol", 0.34, "carbon dioxide", 0.7, 0.7),
                  ("Methanol", 0.12, "helium", 0.45, 0.7)]


class ReadTablesTest(unittest.TestCase):
    def test_cfi_rows_ids_follow_the_catalog_rule_and_co2_is_zero(self):
        rows = fixture_cfi()
        self.assertEqual([r["test_id"] for r in rows],
                         ["PSI-39/1206", "PSI-39/1219", "PSI-39/1285#3", "PSI-39/1362", "PSI-39/1373", "PSI-39/1285#6"])
        self.assertTrue(all(r["x_co2"] == 0.0 for r in rows))
        self.assertEqual([r["pressure_atm"] for r in rows], [1.0, 1.0, 1.0, 1.0, 3.0, 1.0])

    def test_cfi_row_summing_to_097_is_incomplete(self):
        rows = {r["test_id"]: r for r in fixture_cfi()}
        self.assertFalse(rows["PSI-39/1219"]["complete"])
        self.assertEqual(rows["PSI-39/1219"]["composition_sum"], 0.97)
        self.assertTrue(all(r["complete"] for k, r in rows.items() if k != "PSI-39/1219"))

    def test_flex2_is_a_planned_range_with_helium_and_no_co2(self):
        plan = fixture_plan()
        self.assertFalse(plan["per_test_rows"])
        self.assertTrue(plan["helium"])
        self.assertFalse(plan["carbon_dioxide"])
        self.assertEqual(plan["oxygen_levels"], [0.17, 0.21, 0.25, 0.3])
        self.assertEqual(plan["pressures_atm"], [0.5, 1.0, 1.5, 2.0, 3.0])

    def test_threshold_and_sum_range_match_the_flex_loader(self):
        import flex

        self.assertEqual(gaps.ADDED_GAS_THRESHOLD, flex.ADDED_GAS_THRESHOLD)
        self.assertEqual(gaps.COMPOSITION_SUM_RANGE, flex.GAS_SUM_RANGE)


class DistanceTest(unittest.TestCase):
    def test_one_whole_slider_is_distance_one_on_every_axis(self):
        base = {"x_o2": 0.2, "x_co2": 0.0, "x_he": 0.0, "pressure_atm": 0.7}
        for axis, span in SPANS.items():
            moved = dict(base, **{axis: base[axis] + span})
            self.assertAlmostEqual(gaps.distance(base, moved, SPANS), 1.0)
        self.assertEqual(gaps.distance(base, base, SPANS), 0.0)

    def test_spans_are_read_from_the_grid(self):
        self.assertEqual(gaps.axis_spans(gaps.grid_cells(grid_doc(SPAN_POSITIONS))), SPANS)

    def test_ties_go_to_flex_then_the_lower_test_number(self):
        cell = {"x_o2": 0.21, "x_co2": 0.0, "x_he": 0.0, "pressure_atm": 1.0}
        refs = [dict(cell, psi_id="PSI-39", number=1, row=1, test_id="PSI-39/1"),
                dict(cell, psi_id="PSI-69", number=9, row=0, test_id="PSI-69/9"),
                dict(cell, psi_id="PSI-69", number=3, row=0, test_id="PSI-69/3")]
        self.assertEqual(gaps.nearest(cell, refs, SPANS)[0]["test_id"], "PSI-69/3")


class GapListTest(unittest.TestCase):
    def build(self, tests=None, extra_positions=()):
        tests = tests or [flex_row(1, 0.30), flex_row(2, 0.34, fuel="Heptane"), flex_row(3, 0.20, x_co2=0.35),
                          flex_row(4, 0.24, x_he=0.2), flex_row(5, 0.25, x_co2=0.15), flex_row(6, 0.2, x_co2=0.35, dropped=True)]
        positions = SPAN_POSITIONS + [
            ("Methanol", 0.30, "none", 0.0, 0.7), ("Methanol", 0.30, "carbon dioxide", 0.5, 0.7),
            ("Methanol", 0.30, "helium", 0.2, 0.7), ("Methanol", 0.32, "helium", 0.2, 0.7),
            ("Methanol", 0.30, "carbon dioxide", 0.5, 1.0), ("Methanol", 0.29, "helium", 0.2, 0.7),
            *extra_positions]
        return gaps.gaps_doc({"tests": tests}, grid_doc(positions), checks_doc(), fixture_cfi(), fixture_plan(),
                             date="2026-11-14", commit="test")

    def test_only_region_cells_ranked_largest_gap_first(self):
        rows = self.build()["rows"]
        self.assertEqual(len(rows), 5)  # the 0.7 atm cells at 30 to 34% oxygen (0.34 CO2 0.7 is one of them)
        self.assertTrue(all(0.30 <= r["x_o2"] <= 0.34 and r["pressure_atm"] == 0.7 for r in rows))
        self.assertEqual([r["rank"] for r in rows], [1, 2, 3, 4, 5])
        d = [r["distance"] for r in rows]
        self.assertEqual(d, sorted(d, reverse=True))
        self.assertEqual(rows[-1]["added_gas"], "none")
        self.assertEqual(rows[-1]["nearest_test_id"], "PSI-69/1")
        self.assertEqual(rows[-1]["distance"], 0.0)

    def test_notes_use_the_scoped_sentences(self):
        rows = self.build()["rows"]
        by = {(r["added_gas"], r["x_o2"]): r for r in rows}
        self.assertEqual(by[("carbon dioxide", 0.30)]["note"], gaps.NOTE_CO2)
        self.assertIn("never tested in PSI's droplet tables (FLEX PSI-69, FLEX-2 PSI-68, CFI PSI-39)", gaps.NOTE_CO2)
        self.assertEqual(by[("helium", 0.30)]["note"],
                         "Helium at 30% oxygen: may exist in FLEX-2 flight data that is not in PSI: "
                         "ask the FLEX-2 team before flying.")
        self.assertIn("stops at 30% oxygen", by[("helium", 0.32)]["note"])
        self.assertIn("30% and 34%", by[("none", 0.30)]["note"])
        for r in rows:
            self.assertNotIn("never tested in PSI.", r["note"])
            self.assertEqual(r["model_fails_here"], r["added_gas"] == "helium")

    def test_incomplete_cfi_rows_and_test_114_like_rows_are_left_out_and_said_so(self):
        doc = self.build()
        left = {e["test_id"]: e["reason"] for e in doc["header"]["left_out"]}
        self.assertTrue(left["PSI-39/1219"].startswith("composition incomplete"))
        self.assertIn("0.97", left["PSI-39/1219"])
        self.assertIn("PSI-69/6", left)
        nearest = {r["nearest_test_id"] for r in doc["rows"]}
        self.assertFalse(nearest & {"PSI-39/1219", "PSI-69/6"})
        self.assertEqual(doc["header"]["reference_rows"], {"PSI-69": 5, "PSI-39": 5})

    def test_headline_holds_on_the_fixtures_and_counts_diluted_rows(self):
        h = self.build()["header"]
        self.assertTrue(h["headline_holds"], h["headline_problems"])
        cov = h["coverage"]
        self.assertEqual(cov["max_x_o2_diluted_per_test"], 0.25)
        self.assertEqual(cov["flex"]["tests_at_max_x_o2_diluted"], ["PSI-69/5"])
        # FLEX: tests 3, 4, 5 and the dropped 6 are diluted; CFI fixture: 1362 and 1373 (helium).
        self.assertEqual(cov["diluted_rows_counted"], 6)
        self.assertEqual(cov["cfi"]["composition_incomplete"], ["PSI-39/1219"])

    def test_a_diluted_test_above_25_percent_oxygen_breaks_the_headline(self):
        tests = [flex_row(1, 0.30), flex_row(7, 0.26, x_he=0.2)]
        h = self.build(tests)["header"]
        self.assertFalse(h["headline_holds"])
        with self.assertRaises(ValueError):
            handover.coverage_headline({"header": h}, set())

    def test_co2_tested_at_30_percent_stops_the_build(self):
        tests = [flex_row(1, 0.30), flex_row(8, 0.30, x_co2=0.2)]
        with self.assertRaises(AssertionError):
            self.build(tests)


class HeliumFlagTest(unittest.TestCase):
    def test_text_reads_both_r2_values_from_the_check(self):
        flag = gaps.helium_flag(checks_doc())
        self.assertEqual(flag["label"], "model fails here")
        self.assertEqual(flag["text"], "Temperature alone does not explain helium (R2 -0.34). Outside reviewers "
                                       "point to transport. Our transport term reaches only R2 0.16.")
        self.assertIn("R2 -0.50", gaps.helium_flag(checks_doc(t=-0.5))["text"])

    def test_column_is_appended_without_moving_the_others_and_is_idempotent(self):
        doc = grid_doc(SPAN_POSITIONS)
        before = copy.deepcopy(doc["rows"])
        self.assertEqual(gaps.add_helium_flag(doc, checks_doc()), 1)
        self.assertEqual(doc["header"]["columns"], GRID_COLUMNS + ["model_fails_here"])
        self.assertEqual([r[:-1] for r in doc["rows"]], before)
        self.assertEqual([r[-1] for r in doc["rows"]], [False, False, True])
        once = copy.deepcopy(doc)
        gaps.add_helium_flag(doc, checks_doc())
        self.assertEqual(doc, once)


class CommittedGapOutputTest(unittest.TestCase):
    def load(self, name):
        return json.loads((OUT / name).read_text(encoding="utf-8"))

    def test_gap_file_is_listed_ranked_and_inside_the_region(self):
        self.assertIn("flex_gaps.json", [f["name"] for f in self.load("module.json")["files"]])
        doc = self.load("flex_gaps.json")
        rows = doc["rows"]
        self.assertEqual(len(rows), doc["header"]["n_rows"])
        d = [r["distance"] for r in rows]
        self.assertEqual(d, sorted(d, reverse=True))
        self.assertTrue(all(0.30 <= r["x_o2"] <= 0.34 and r["pressure_atm"] == 0.7 for r in rows))
        self.assertTrue(all(r["nearest_test_id"].split("/")[0] in ("PSI-69", "PSI-39") for r in rows))
        co2 = [r for r in rows if r["added_gas"] == "carbon dioxide"]
        self.assertTrue(co2 and all(r["note"] == gaps.NOTE_CO2 for r in co2))
        he30 = [r for r in rows if r["added_gas"] == "helium" and r["x_o2"] == 0.3]
        self.assertTrue(he30 and all(r["note"] == gaps.NOTE_HE_FLEX2 for r in he30))

    def test_gap_file_leaves_out_the_four_incomplete_cfi_rows(self):
        h = self.load("flex_gaps.json")["header"]
        incomplete = [e["test_id"] for e in h["left_out"] if e["reason"].startswith("composition incomplete")]
        self.assertEqual(incomplete, ["PSI-39/1219", "PSI-39/1220", "PSI-39/1221", "PSI-39/1222"])
        self.assertTrue(h["headline_holds"])
        self.assertIn("not a prediction", h["not_a_prediction"])

    def test_grid_keeps_its_columns_and_flags_exactly_the_helium_rows(self):
        g = self.load("flex_grid.json")
        cols = g["header"]["columns"]
        self.assertEqual(cols, GRID_COLUMNS + ["model_fails_here"])
        gas, flag = cols.index("added_gas"), cols.index("model_fails_here")
        self.assertTrue(all(len(r) == len(cols) and r[flag] == (r[gas] == "helium") for r in g["rows"]))
        checks = self.load("flex_checks.json")
        self.assertEqual(g["header"]["model_fails_here"]["text"], gaps.helium_flag(checks)["text"])

    def test_headline_finding_is_exact_and_rests_on_existing_evidence(self):
        fi = {f["id"]: f for f in self.load("findings.json")}
        f = fi["flame-temperature/headline/coverage_diluted_oxygen"]
        self.assertEqual(f["text"], gaps.HEADLINE_TEXT)
        self.assertEqual((f["value"], f["kind"], f["provenance"]), (0.25, "headline", "PSI_TABLE"))
        self.assertEqual(f["n"], self.load("flex_gaps.json")["header"]["coverage"]["diluted_rows_counted"])
        ev = {r["id"] for r in self.load("evidence.json")}
        self.assertTrue(f["evidence_ids"] and set(f["evidence_ids"]) <= ev)
        self.assertTrue({"PSI-39", "PSI-68"} <= set(self.load("module.json")["psi_ids"]))

    def test_no_reviewer_is_named_in_the_engine_output(self):
        for name in ("flex_gaps.json", "flex_grid.json", "findings.json", "module.json"):
            text = (OUT / name).read_text(encoding="utf-8")
            for word in ("Kaya", "Eyice", "Nakamura"):
                self.assertNotIn(word, text, name)


if __name__ == "__main__":
    unittest.main()
