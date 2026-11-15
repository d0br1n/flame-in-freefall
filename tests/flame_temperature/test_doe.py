"""Design-of-experiments checks on the fitted link (DOB-115 lack of fit, DOB-114 replay).

The synthetic cases need no data; the last class reads the committed flex_doe.json.
Written with SI assistance (Claude Code)."""

import json
import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline/flame_temperature"))

import doe  # noqa: E402
import fit  # noqa: E402

OUT = ROOT / "data/modules/flame-temperature"


def noise(sd, n, seed):
    return np.random.default_rng(seed).normal(0.0, sd, n)


def pair_gaps(sd, n, seed):
    """How far apart two repeats of one test land, when one test scatters by sd."""
    rng = np.random.default_rng(seed)
    return np.abs(rng.normal(0.0, sd, n) - rng.normal(0.0, sd, n))


class LackOfFitNumbersTest(unittest.TestCase):
    def test_a_perfect_model_on_known_noise_gives_a_ratio_near_one(self):
        out = doe.lack_of_fit_numbers(noise(8.0, 400, 1), pair_gaps(8.0, 200, 2))
        self.assertAlmostEqual(out["pure_error_sd_points"], 8.0, delta=1.0)
        self.assertAlmostEqual(out["ratio"], 1.0, delta=0.2)
        self.assertGreater(out["share_of_squared_error_that_is_scatter"], 0.7)

    def test_a_missing_factor_gives_a_ratio_well_above_one(self):
        residuals = noise(8.0, 400, 1) + noise(16.0, 400, 3)  # scatter plus what the model cannot see
        out = doe.lack_of_fit_numbers(residuals, pair_gaps(8.0, 200, 2))
        self.assertGreater(out["ratio"], 1.8)
        self.assertLess(out["share_of_squared_error_that_is_scatter"], 0.35)

    def test_both_scatter_estimates_agree_on_normal_noise(self):
        out = doe.lack_of_fit_numbers(noise(8.0, 400, 1), pair_gaps(8.0, 2000, 2))
        self.assertAlmostEqual(out["pure_error_sd_points"], out["pure_error_sd_from_median_points"], delta=0.6)

    def test_interval_brackets_the_ratio_and_the_same_seed_gives_the_same_interval(self):
        args = (noise(8.0, 200, 1) * 2, pair_gaps(8.0, 24, 2))
        a, b = doe.lack_of_fit_numbers(*args), doe.lack_of_fit_numbers(*args)
        lo, hi = a["ratio_interval_95"]
        self.assertLess(lo, a["ratio"])
        self.assertGreater(hi, a["ratio"])
        self.assertEqual(a, b)

    def test_fewer_pairs_give_a_wider_interval(self):
        res = noise(8.0, 200, 1) * 2
        wide = doe.lack_of_fit_numbers(res, pair_gaps(8.0, 12, 2))["ratio_interval_95"]
        narrow = doe.lack_of_fit_numbers(res, pair_gaps(8.0, 400, 2))["ratio_interval_95"]
        self.assertGreater(wide[1] - wide[0], narrow[1] - narrow[0])


def line_of_points(xs):
    """Points on one axis, already scaled (as doe.scaled_points returns them)."""
    return np.array([[x, 0.0, 0.0, 0.0] for x in xs])


class PickingOrderTest(unittest.TestCase):
    POINTS = line_of_points([0.0, 0.1, 1.0, 0.98, 0.96, 0.55, 0.3])
    BASE, CAND = [0, 1], [2, 3, 4, 5, 6]

    def test_ranked_order_is_farthest_first_each_scored_on_its_own(self):
        self.assertEqual(doe.ranked_order(self.POINTS, self.BASE, self.CAND), [2, 3, 4, 5, 6])

    def test_batch_order_spreads_instead_of_staying_in_the_far_corner(self):
        order = doe.batch_order(self.POINTS, self.BASE, self.CAND)
        self.assertEqual(order[0], 2)  # the farthest, as in the ranking
        self.assertEqual(order[1], 5)  # then the middle, not the far corner's neighbour
        self.assertEqual(sorted(order), sorted(self.CAND))

    def test_scaled_points_make_plain_distance_equal_to_the_gap_lists_distance(self):
        import gaps
        import pandas as pd

        spans = {"x_o2": 0.22, "x_co2": 0.7, "x_he": 0.45, "pressure_atm": 0.3}
        rows = [{"x_o2": 0.21, "x_co2": 0.0, "x_he": 0.0, "pressure_atm": 1.0},
                {"x_o2": 0.30, "x_co2": 0.35, "x_he": 0.1, "pressure_atm": 0.7}]
        p = doe.scaled_points(pd.DataFrame(rows), spans)
        self.assertAlmostEqual(float(np.sqrt(((p[0] - p[1]) ** 2).sum())), gaps.distance(rows[0], rows[1], spans))


class ReplayTest(unittest.TestCase):
    """A made-up case where the answer is known: the outcome has a bump in the middle of the
    unflown region, so tests from the far corner alone teach nothing."""

    @classmethod
    def setUpClass(cls):
        import pandas as pd

        rng = np.random.default_rng(5)
        x = np.concatenate([rng.uniform(0.0, 0.2, 40), rng.uniform(0.3, 1.0, 80)])
        cls.in_region = x >= 0.3
        cls.X = pd.DataFrame({"x": x})
        cls.y = pd.Series(((x > 0.5) & (x < 0.8)).astype(float))
        cls.groups = pd.Series([f"day{i % 20}" for i in range(len(x))])
        cls.points = line_of_points(x)
        cls.out = doe.replay(cls.X, cls.y, cls.groups, cls.points, cls.in_region, sizes=[0, 3, 6, 12],
                             random_sizes=[0, 6], draws=4)

    def test_no_tests_handed_back_is_the_same_for_every_way_of_picking(self):
        first = self.out["curve"][0]
        self.assertEqual(first["batch"], first["ranked_list"])
        self.assertEqual(first["batch"], first["random_mean"])
        self.assertEqual(self.out["summary"]["none_handed_back_points"], first["batch"])

    def test_the_batch_learns_the_bump_and_the_far_corner_does_not(self):
        at = {c["tests"]: c for c in self.out["curve"]}
        self.assertLess(at[6]["batch"], at[6]["ranked_list"] - 5.0)
        self.assertLess(at[12]["batch"], at[0]["batch"] - 10.0)
        self.assertTrue(self.out["summary"]["batch_ahead_of_ranked_list"])

    def test_counts_and_random_columns_are_only_where_they_were_scored(self):
        self.assertEqual((self.out["n_region"], self.out["n_start"]), (80, 40))
        self.assertEqual(sum(self.out["candidates_per_fold"]), 80 * 4)
        self.assertEqual([("random_mean" in c) for c in self.out["curve"]], [True, False, True, False])
        self.assertEqual(self.out["summary"]["sizes_compared"], 3)

    def test_a_scored_test_never_shares_a_day_with_a_test_handed_back(self):
        from sklearn.model_selection import GroupKFold

        region = np.flatnonzero(self.in_region)
        for tr, te in GroupKFold(n_splits=doe.REPLAY_FOLDS).split(region, None, self.groups.iloc[region]):
            self.assertFalse(set(self.groups.iloc[region[tr]]) & set(self.groups.iloc[region[te]]))

    def test_the_same_seed_gives_the_same_replay(self):
        again = doe.replay(self.X, self.y, self.groups, self.points, self.in_region, sizes=[0, 3, 6, 12],
                           random_sizes=[0, 6], draws=4)
        self.assertEqual(again, self.out)


class CommittedReplayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        doc = json.loads((OUT / "flex_doe.json").read_text(encoding="utf-8"))
        cls.check = next(c for c in doc["checks"] if c["id"] == "batch_replay")
        cls.findings = {f["id"]: f for f in json.loads((OUT / "findings.json").read_text(encoding="utf-8"))}

    def test_three_replays_cover_every_eligible_test_group_and_keep_the_counts(self):
        replays = self.check["result"]["replays"]
        self.assertEqual([r["id"] for r in replays], [r[0] for r in doe.REPLAY_REGIONS])
        for r in replays:
            self.assertEqual(r["n_region"] + r["n_start"], self.check["n_tests"])
            self.assertEqual([c["tests"] for c in r["curve"]], doe.REPLAY_SIZES)
            self.assertEqual(r["curve"][0]["batch"], r["curve"][0]["ranked_list"])

    def test_every_replay_is_reported_ahead_or_behind(self):
        r = self.check["result"]
        self.assertEqual(sorted(r["batch_ahead_in"] + r["batch_behind_in"]), sorted(x["id"] for x in r["replays"]))
        self.assertEqual(self.check["passed"], len(r["batch_ahead_in"]) > len(r["replays"]) / 2)

    def test_the_finding_reads_its_numbers_from_the_first_replay_and_names_the_ones_behind(self):
        f = self.findings["flame-temperature/check/batch_replay"]
        first = self.check["result"]["replays"][0]
        m = first["summary"]["mean_over_sizes"]
        for number in (f"{m['batch']:.1f}", f"{m['ranked_list']:.1f}", f"{first['all_candidates_points']:.1f}",
                       f"{first['summary']['none_handed_back_points']:.1f}"):
            self.assertIn(number, f["text"])
        names = {x["id"]: x["region"] for x in self.check["result"]["replays"]}
        for rid in self.check["result"]["batch_behind_in"]:
            self.assertIn(names[rid], f["text"])
        self.assertEqual((f["kind"], f["value"], f["passed"]), ("check", m["batch"], self.check["passed"]))


class CommittedLackOfFitTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = json.loads((OUT / "flex_doe.json").read_text(encoding="utf-8"))
        cls.checks = {c["id"]: c for c in json.loads((OUT / "flex_checks.json").read_text(encoding="utf-8"))["checks"]}
        cls.findings = {f["id"]: f for f in json.loads((OUT / "findings.json").read_text(encoding="utf-8"))}

    def test_it_stands_on_the_same_numbers_as_the_two_existing_checks(self):
        c = next(c for c in self.doc["checks"] if c["id"] == "lack_of_fit")
        self.assertEqual(c["n_pairs"], self.checks["repeatability"]["n_pairs"])
        self.assertEqual(c["n_tests"], self.checks["fitted_link"]["n"])
        self.assertEqual(c["result"]["model_mean_abs_error_points"],
                         self.checks["fitted_link"]["result"]["fitted_link"]["mean_abs_error_points"])
        self.assertEqual(c["result"]["median_points_apart"], self.checks["repeatability"]["result"]["median_points_apart"])
        self.assertEqual(c["definition_of_near_identical"], fit.NEAR_IDENTICAL)

    def test_the_finding_says_the_ratio_the_interval_and_the_count(self):
        c = next(c for c in self.doc["checks"] if c["id"] == "lack_of_fit")
        f = self.findings["flame-temperature/check/lack_of_fit"]
        r = c["result"]
        self.assertEqual((f["kind"], f["value"], f["n"]), ("check", r["ratio"], c["n_pairs"]))
        for number in (f"{r['ratio']:.1f}", f"{r['ratio_interval_95'][0]:.1f}", f"{r['ratio_interval_95'][1]:.1f}",
                       f"{c['n_pairs']} pairs"):
            self.assertIn(number, f["text"])

    def test_the_file_is_listed_and_marked_as_si_made(self):
        module = json.loads((OUT / "module.json").read_text(encoding="utf-8"))
        self.assertIn("flex_doe.json", [f["name"] for f in module["files"]])
        self.assertIn("SI assistance", self.doc["header"]["si_note"])
        self.assertIn("PSI-69", self.doc["header"]["psi_ids"])


if __name__ == "__main__":
    unittest.main()
