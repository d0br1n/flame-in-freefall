"""The designed batch of next tests (DOB-114): greedy maximin augmentation over the gap list.

No data/raw needed: the synthetic cases build their own rows, the last class reads the
committed flex_gaps.json. Written with SI assistance (Claude Code)."""

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline/flame_temperature"))

import gaps  # noqa: E402

OUT = ROOT / "data/modules/flame-temperature"
SPANS = {"x_o2": 0.22, "x_co2": 0.7, "x_he": 0.45, "pressure_atm": 0.3}


def ref(n, x_o2, x_co2=0.0, x_he=0.0, p=0.7):
    """A real per-test row, shaped like gaps.flex_rows gives them."""
    return {"test_id": f"PSI-69/{n}", "psi_id": "PSI-69", "number": n, "row": 0, "fuel": "Methanol",
            "x_o2": x_o2, "x_co2": x_co2, "x_he": x_he, "pressure_atm": p}


def point(gas, x, o2):
    return {"x_o2": o2, "x_co2": x if gas == "carbon dioxide" else 0.0,
            "x_he": x if gas == "helium" else 0.0, "pressure_atm": 0.7}


def gap_rows(conditions, refs, fuels=("Methanol", "Heptane")):
    """Rows shaped like flex_gaps.json's, one per fuel, ranked largest gap first."""
    rows = []
    for gas, x, o2 in conditions:
        d = min(gaps.distance(point(gas, x, o2), r, SPANS) for r in refs)
        for fuel in fuels:
            rows.append({"fuel": fuel, "added_gas": gas, "x_added": x, "x_o2": o2, "x_n2": round(1 - o2 - x, 4),
                         "pressure_atm": 0.7, "distance": round(d, 3), "nearest_test_id": "PSI-69/1",
                         "nearest_conditions": {}, "model_fails_here": gas == "helium", "note": f"note for {gas}"})
    rows.sort(key=lambda r: -r["distance"])
    return [{"rank": i, **r} for i, r in enumerate(rows, start=1)]


REFS = [ref(1, 0.30), ref(2, 0.34), ref(3, 0.20, x_co2=0.35), ref(4, 0.24, x_he=0.2)]
CONDITIONS = ([("none", 0.0, o2) for o2 in (0.30, 0.32, 0.34)]
              + [("carbon dioxide", x, o2) for x in (0.2, 0.4, 0.6) for o2 in (0.30, 0.32, 0.34)]
              + [("helium", x, o2) for x in (0.15, 0.30, 0.45) for o2 in (0.30, 0.32, 0.34)])


def build(n=6, refs=REFS, conditions=CONDITIONS):
    return gaps.campaign(gap_rows(conditions, refs), refs, SPANS, n=n)


def as_point(pick):
    return point(pick["added_gas"], pick["x_added"], pick["x_o2"])


class CampaignTest(unittest.TestCase):
    def test_first_pick_is_the_top_of_the_ranked_list(self):
        rows = gap_rows(CONDITIONS, REFS)
        first = build()["picks"][0]
        self.assertEqual((first["added_gas"], first["x_added"], first["x_o2"]),
                         (rows[0]["added_gas"], rows[0]["x_added"], rows[0]["x_o2"]))
        self.assertEqual(first["gap_when_picked"], rows[0]["distance"])

    def test_second_pick_is_not_next_to_the_first(self):
        picks = build()["picks"]
        self.assertGreater(gaps.distance(as_point(picks[0]), as_point(picks[1]), SPANS), 0.1)

    def test_every_pick_is_the_farthest_condition_left_at_that_step(self):
        picks = build(n=5)["picks"]
        flown = [dict(r) for r in REFS]
        for pick in picks:
            gap = {c: min(gaps.distance(point(*c), r, SPANS) for r in flown) for c in CONDITIONS}
            self.assertAlmostEqual(gap[(pick["added_gas"], pick["x_added"], pick["x_o2"])], max(gap.values()), places=9)
            flown.append(as_point(pick))

    def test_gap_left_never_goes_up_and_the_batch_is_never_worse_than_the_list(self):
        curve = build(n=8)["curve"]
        self.assertEqual([c["tests"] for c in curve], list(range(9)))
        self.assertEqual(curve[0]["designed_batch"], curve[0]["ranked_list"])
        for before, after in zip(curve, curve[1:]):
            self.assertLessEqual(after["designed_batch"], before["designed_batch"])
            self.assertLessEqual(after["ranked_list"], before["ranked_list"])
            self.assertLessEqual(after["designed_batch_mean"], before["designed_batch_mean"])
        for c in curve:
            self.assertLessEqual(c["designed_batch"], c["ranked_list"])

    def test_gap_after_a_pick_is_the_largest_gap_once_it_is_flown(self):
        picks = build(n=3)["picks"]
        flown = [dict(r) for r in REFS] + [as_point(p) for p in picks]
        worst = max(min(gaps.distance(point(*c), r, SPANS) for r in flown) for c in CONDITIONS)
        self.assertEqual(picks[-1]["largest_gap_after"], round(worst, 3))

    def test_same_input_gives_the_same_output(self):
        self.assertEqual(build(), build())

    def test_picks_are_distinct_gas_conditions_without_a_fuel(self):
        picks = build(n=6)["picks"]
        keys = [(p["added_gas"], p["x_added"], p["x_o2"]) for p in picks]
        self.assertEqual(len(set(keys)), 6)
        self.assertTrue(all("fuel" not in p for p in picks))
        self.assertEqual([p["pick"] for p in picks], [1, 2, 3, 4, 5, 6])
        self.assertTrue(all(p["model_fails_here"] == (p["added_gas"] == "helium") for p in picks))
        self.assertTrue(all(p["note"] == f"note for {p['added_gas']}" for p in picks))

    def test_it_stops_when_every_condition_is_at_a_test(self):
        doc = build(n=40)
        # 21 conditions, two of them (nitrogen only at 30 and 34% oxygen) already sit on a real test.
        self.assertEqual(len(doc["picks"]), 19)
        self.assertEqual(doc["curve"][-1]["designed_batch"], 0.0)
        self.assertEqual(doc["n_conditions"], 21)

    def test_differences_to_the_nearest_real_test_are_stated_per_axis(self):
        pick = build()["picks"][0]
        near = pick["nearest_conditions"]
        self.assertEqual(pick["nearest_test_id"].split("/")[0], "PSI-69")
        for axis in ("x_o2", "x_co2", "x_he", "pressure_atm"):
            self.assertAlmostEqual(pick["differs_by"][axis], as_point(pick)[axis] - near[axis], places=4)


class CommittedCampaignTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = json.loads((OUT / "flex_gaps.json").read_text(encoding="utf-8"))
        cls.campaign = cls.doc["header"]["campaign"]

    def test_block_is_in_the_header_and_the_rows_keep_their_ranking(self):
        rows = self.doc["rows"]
        self.assertEqual([r["rank"] for r in rows], list(range(1, len(rows) + 1)))
        self.assertEqual(len(self.campaign["picks"]), gaps.CAMPAIGN_PICKS)
        self.assertEqual(self.campaign["default_tests"], gaps.CAMPAIGN_DEFAULT_TESTS)
        self.assertEqual(self.campaign["curve"][0]["designed_batch"], rows[0]["distance"])
        self.assertIn("not a prediction", self.campaign["not_a_prediction"])

    def test_first_six_reach_both_added_gases_and_halve_the_ranked_lists_gap(self):
        six = self.campaign["picks"][:6]
        self.assertEqual({p["added_gas"] for p in six}, {"carbon dioxide", "helium"})
        at_six = self.campaign["curve"][6]
        self.assertLess(at_six["designed_batch"], 0.6 * at_six["ranked_list"])
        self.assertTrue(all(0.30 <= p["x_o2"] <= 0.34 and p["pressure_atm"] == 0.7 for p in six))

    def test_notes_are_the_gap_lists_own_sentences(self):
        notes = {(r["added_gas"], r["x_added"], r["x_o2"]): r["note"] for r in self.doc["rows"]}
        for p in self.campaign["picks"]:
            self.assertEqual(p["note"], notes[(p["added_gas"], p["x_added"], p["x_o2"])])

    def test_headline_finding_reads_its_numbers_from_the_block(self):
        findings = json.loads((OUT / "findings.json").read_text(encoding="utf-8"))
        f = next(f for f in findings if f["id"] == "flame-temperature/headline/designed_batch")
        at = self.campaign["curve"][self.campaign["default_tests"]]
        self.assertEqual(f["value"], at["designed_batch"])
        self.assertIn(f"{at['designed_batch']:.2f}", f["text"])
        self.assertIn(f"{at['ranked_list']:.2f}", f["text"])
        self.assertIn(f"{self.campaign['curve'][0]['designed_batch']:.2f}", f["text"])
        self.assertEqual((f["kind"], f["provenance"]), ("headline", "PSI_TABLE"))


if __name__ == "__main__":
    unittest.main()
