"""Tests for pipeline/video_to_data/fit.py (Linear DOB-40): spread rate with an honest interval.

All series are synthetic and generated here with fixed seeds, so nothing needs data/raw.
No test is skipped or expected to fail.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import csv
import json
import math
import unittest
from pathlib import Path

import numpy as np

from pipeline.video_to_data import fit

N_BOOT = 200  # fewer resamples than the default, to keep the file fast


def synth(speed_mm, scale=10.0, dur=60.0, hz=4.0, noise=0.5, seed=1, irregular=False, phi=0.5,
          x0=100.0):
    """Edge position (px) moving at speed_mm (mm/s) with AR(1) pixel noise (sd = noise px)."""
    rng = np.random.default_rng(seed)
    if irregular:
        t = np.cumsum(rng.uniform(0.5 / hz, 1.4 / hz, size=int(dur * hz * 2)))
        t = t[t <= dur]
    else:
        t = np.arange(0, dur, 1.0 / hz)
    e = rng.normal(0, noise, t.size)
    x = np.zeros(t.size)
    for i in range(t.size):
        x[i] = (phi * x[i - 1] if i else 0.0) + e[i] * math.sqrt(1 - phi ** 2)
    return t, x0 + speed_mm * scale * t + x


def fit_it(t, y, scale=10.0, unc=None, seed=0, **kw):
    kw.setdefault("n_boot", N_BOOT)
    return fit.fit_spread_rate(t, y, scale, unc, seed, **kw)


def inside(res, truth):
    return res["ci_low"] <= truth <= res["ci_high"]


class TestHelpers(unittest.TestCase):
    def test_theil_sen_exact_line_and_outlier_robust(self):
        t = np.arange(0, 20, 0.5)
        y = 3.0 * t + 7.0
        s, b = fit.theil_sen(t, y)
        self.assertAlmostEqual(s, 3.0)
        self.assertAlmostEqual(b, 7.0)
        y2 = y.copy()
        y2[::5] += 500.0  # 20% gross outliers
        self.assertAlmostEqual(fit.theil_sen(t, y2)[0], 3.0, places=6)
        self.assertGreater(abs(fit.ols(t, y2)[0] - 3.0), 0.5)  # OLS is dragged away

    def test_leading_edge_direction_and_empty_rows(self):
        rows = [
            {"time_s": "0.0", "edge_min_px": "10", "edge_max_px": "40"},
            {"time_s": "0.5", "edge_min_px": "", "edge_max_px": ""},  # no flame
            {"time_s": "1.0", "edge_min_px": "8", "edge_max_px": "50"},
        ]
        t, p = fit.leading_edge(rows, +1)
        self.assertEqual(list(t), [0.0, 1.0])
        self.assertEqual(list(p), [40.0, 50.0])
        t, p = fit.leading_edge(rows, -1)
        self.assertEqual(list(p), [-10.0, -8.0])  # grows when the edge advances
        with self.assertRaises(ValueError):
            fit.leading_edge(rows, 0)

    def test_theil_sen_needs_two_points(self):
        with self.assertRaises(ValueError):
            fit.theil_sen([1.0], [2.0])


class TestKnownSpeed(unittest.TestCase):
    """True speed inside the interval, in px/s and in mm/s, across the range."""

    CASES = {  # name: (speed mm/s, px per mm, duration s, noise px)
        "slow": (0.05, 20.0, 120.0, 0.3),
        "mid": (2.0, 10.0, 60.0, 0.5),
        "fast": (8.0, 5.0, 40.0, 0.5),
    }

    def test_truth_inside_interval_px_and_mm(self):
        for name, (v, sc, dur, nz) in self.CASES.items():
            with self.subTest(case=name):
                t, y = synth(v, sc, dur, noise=nz, seed=3)
                mm = fit_it(t, y, sc)
                self.assertEqual(mm["unit"], "mm/s")
                self.assertTrue(inside(mm, v), (name, mm["rate"], mm["ci_low"], mm["ci_high"]))
                self.assertLess(abs(mm["rate"] - v) / v, 0.05)
                px = fit_it(t, y, None)
                self.assertEqual(px["unit"], "px/s")
                self.assertTrue(inside(px, v * sc), (name, px["rate"], px["ci_low"], px["ci_high"]))

    def test_calibration_over_seeded_runs(self):
        # The interval must be wide enough: most seeded runs contain the truth.
        # Threshold is deliberately loose (nominal 95%); the measured fraction is reported in DOB-40.
        v, sc, dur, nz = self.CASES["mid"]
        hits = 0
        runs = 40
        for s in range(runs):
            t, y = synth(v, sc, dur, noise=nz, seed=100 + s)
            hits += inside(fit_it(t, y, sc), v)
        self.assertGreaterEqual(hits / runs, 0.8)

    def test_gross_outliers_theil_sen_within_10_percent(self):
        for name, (v, sc, dur, nz) in self.CASES.items():
            with self.subTest(case=name):
                t, y = synth(v, sc, dur, noise=nz, seed=5)
                rng = np.random.default_rng(9)
                bad = rng.choice(t.size, size=t.size // 10, replace=False)
                bad = np.union1d(bad, [0, t.size - 1])  # the first and last frames are among the bad ones
                y = y.copy()
                y[bad] = -200.0  # the tracker jumped to the igniter, far behind the edge
                res = fit_it(t, y, sc)
                self.assertLess(abs(res["rate"] - v) / v, 0.10, (name, res["rate"]))
                # outliers must not break up the steady window either
                self.assertGreaterEqual(res["window_end_s"] - res["window_start_s"], 0.8 * dur)

    def test_irregular_sampling_same_rate_within_interval(self):
        v, sc, dur, nz = self.CASES["mid"]
        t0, y0 = synth(v, sc, dur, noise=nz, seed=11)
        t1, y1 = synth(v, sc, dur, noise=nz, seed=11, irregular=True)
        self.assertGreater(np.std(np.diff(t1)), 0.01)
        a, b = fit_it(t0, y0, sc), fit_it(t1, y1, sc)
        self.assertTrue(inside(b, v))
        self.assertTrue(inside(b, a["rate"]) or inside(a, b["rate"]))

    def test_direction_minus_one_mirrors_plus_one(self):
        t, y = synth(2.0, 10.0, 60.0, seed=4)
        plus = [{"time_s": ti, "edge_min_px": yi - 30, "edge_max_px": yi} for ti, yi in zip(t, y)]
        minus = [{"time_s": ti, "edge_min_px": 800.0 - yi, "edge_max_px": 830.0 - yi}
                 for ti, yi in zip(t, y)]
        a = fit_it(*fit.leading_edge(plus, +1))
        b = fit_it(*fit.leading_edge(minus, -1))
        self.assertGreater(b["rate"], 0)
        self.assertAlmostEqual(a["rate"], b["rate"], places=9)
        self.assertAlmostEqual(a["ci_low"], b["ci_low"], places=9)
        self.assertEqual(a["flags"], b["flags"])


class TestSteadyWindow(unittest.TestCase):
    def test_transient_steady_stall(self):
        v, sc = 2.0, 10.0  # mm/s, px/mm
        rng = np.random.default_rng(8)
        t = np.arange(0, 80, 0.25)
        speed = np.where(t < 15, 3 * v, np.where(t < 55, v, 0.0)) * sc  # px/s
        y = 100 + np.concatenate([[0], np.cumsum(speed[:-1] * np.diff(t))]) + rng.normal(0, 0.4, t.size)
        res = fit_it(t, y, sc)
        self.assertLessEqual(abs(res["window_start_s"] - 15), 2.0, res["window_start_s"])
        self.assertLessEqual(abs(res["window_end_s"] - 55), 2.0, res["window_end_s"])
        self.assertLess(abs(res["rate"] - v) / v, 0.03)
        self.assertTrue(inside(res, v))

    def test_window_function_reports_times(self):
        t, y = synth(2.0, 10.0, 40.0, seed=2)
        a, b, info = fit.steady_window(t, y)
        self.assertTrue(info["found"])
        self.assertLess(a, 1.0)
        self.assertGreater(b, 39.0)

    def test_short_series_falls_back_with_flag(self):
        t, y = synth(2.0, 10.0, 3.0, seed=2)  # shorter than the 5 s sliding width
        res = fit_it(t, y, 10.0)
        self.assertIn("no_steady_window", res["flags"])
        self.assertIsNotNone(res["rate"])


class TestIntervalBehaviour(unittest.TestCase):
    def test_same_seed_identical_output(self):
        t, y = synth(2.0, 10.0, 60.0, seed=6)
        self.assertEqual(json.dumps(fit_it(t, y, 10.0, 0.05, seed=7)),
                         json.dumps(fit_it(t, y, 10.0, 0.05, seed=7)))

    def test_different_seeds_overlap(self):
        t, y = synth(2.0, 10.0, 60.0, seed=6)
        a, b = fit_it(t, y, 10.0, seed=1), fit_it(t, y, 10.0, seed=2)
        self.assertEqual(a["rate"], b["rate"])  # the point estimate does not depend on the seed
        self.assertLess(max(a["ci_low"], b["ci_low"]), min(a["ci_high"], b["ci_high"]))
        self.assertNotEqual((a["ci_low"], a["ci_high"]), (b["ci_low"], b["ci_high"]))

    def test_scale_uncertainty_widens_interval(self):
        t, y = synth(2.0, 10.0, 60.0, seed=6)
        a = fit_it(t, y, 10.0, None)
        b = fit_it(t, y, 10.0, 0.05)
        self.assertEqual(a["rate"], b["rate"])
        self.assertLess(b["ci_low"], a["ci_low"])
        self.assertGreater(b["ci_high"], a["ci_high"])
        self.assertIn("quadrature", b["ci_method"])
        self.assertNotIn("quadrature", a["ci_method"])
        # quadrature: half-width^2 = stat^2 + (rate * unc)^2
        half = b["ci_high"] - b["rate"]
        stat = a["ci_high"] - a["rate"]
        self.assertAlmostEqual(half ** 2, stat ** 2 + (b["rate"] * 0.05) ** 2, places=9)

    def test_interval_is_not_the_naive_one(self):
        # With correlated noise the block bootstrap interval is wider than an iid one.
        t, y = synth(2.0, 10.0, 60.0, seed=6, phi=0.8, noise=1.0)
        blocked = fit.block_bootstrap_ci(t, y, block_s=2.0, n_boot=N_BOOT, seed=0)
        iid = fit.block_bootstrap_ci(t, y, block_s=0.01, n_boot=N_BOOT, seed=0)  # blocks of 1 sample
        self.assertGreater(blocked[1] - blocked[0], 1.3 * (iid[1] - iid[0]))


class TestFlags(unittest.TestCase):
    def clean(self):
        t, y = synth(2.0, 10.0, 60.0, seed=1)
        return fit_it(t, y, 10.0)

    def test_clean_series_has_no_flags(self):
        res = self.clean()
        self.assertEqual(res["flags"], [], res)
        self.assertLess(res["rel_diff"], 0.05)

    def test_no_scale_flag_and_never_invented_scale(self):
        t, y = synth(2.0, 10.0, 60.0, seed=1)
        res = fit_it(t, y, None)
        self.assertIn("no_scale", res["flags"])
        self.assertEqual(res["unit"], "px/s")
        self.assertNotIn("no_scale", self.clean()["flags"])

    def test_steady_under_20s_and_short_window(self):
        t, y = synth(2.0, 10.0, 15.0, seed=1)
        res = fit_it(t, y, 10.0)
        self.assertIn("steady_under_20s", res["flags"])
        self.assertNotIn("short_window", res["flags"])
        t, y = synth(2.0, 10.0, 8.0, seed=1)
        res = fit_it(t, y, 10.0)
        self.assertIn("steady_under_20s", res["flags"])
        self.assertIn("short_window", res["flags"])
        self.assertNotIn("short_window", self.clean()["flags"])
        self.assertNotIn("steady_under_20s", self.clean()["flags"])

    def test_negative_rate(self):
        t, y = synth(2.0, 10.0, 60.0, seed=1)
        res = fit_it(t, 2 * y[0] - y, 10.0)
        self.assertIn("negative_rate", res["flags"])
        self.assertLess(res["rate"], 0)
        self.assertNotIn("negative_rate", self.clean()["flags"])

    def test_rate_out_of_range(self):
        t, y = synth(0.001, 10.0, 200.0, noise=0.0005, seed=1)
        self.assertIn("rate_out_of_range", fit_it(t, y, 10.0)["flags"])
        t, y = synth(20.0, 5.0, 30.0, noise=0.2, seed=1)
        self.assertIn("rate_out_of_range", fit_it(t, y, 5.0)["flags"])
        self.assertNotIn("rate_out_of_range", self.clean()["flags"])
        # in px/s the mm/s range does not apply
        t, y = synth(20.0, 5.0, 30.0, noise=0.2, seed=1)
        self.assertNotIn("rate_out_of_range", fit_it(t, y, None)["flags"])

    def test_short_travel(self):
        t, y = synth(0.1, 10.0, 30.0, noise=0.05, seed=1)  # 3 mm in 30 s
        res = fit_it(t, y, 10.0)
        self.assertIn("short_travel", res["flags"])
        self.assertNotIn("rate_out_of_range", res["flags"])
        # without a scale the pixel parameter is used (default 20 px)
        t, y = synth(0.1, 10.0, 30.0, noise=0.05, seed=1)  # 30 px
        self.assertNotIn("short_travel", fit_it(t, y, None)["flags"])
        self.assertIn("short_travel", fit_it(t, y, None, min_travel_px=40.0)["flags"])
        self.assertNotIn("short_travel", self.clean()["flags"])

    def test_few_points(self):
        t, y = synth(2.0, 10.0, 6.0, hz=1.0, noise=0.2, seed=1)  # 6 samples, 1 per second
        res = fit_it(t, y, 10.0)
        self.assertIn("few_points", res["flags"])
        self.assertIsNotNone(res["rate"])  # flagged, not dropped
        self.assertNotIn("few_points", self.clean()["flags"])

    def test_estimates_disagree(self):
        t, y = synth(2.0, 10.0, 60.0, noise=0.5, seed=1)
        y = y.copy()
        y[-24:] += 1500.0  # the last 10% of frames jump ahead: a robust and a least-squares fit differ
        res = fit_it(t, y, 10.0, width_s=5.0, rel_tol=10.0)  # wide tolerance keeps the whole series
        self.assertIn("estimates_disagree", res["flags"], res["rel_diff"])
        self.assertGreater(res["rel_diff"], 0.25)
        self.assertNotIn("estimates_disagree", self.clean()["flags"])

    def test_insufficient_data_is_flagged_not_raised(self):
        res = fit.fit_spread_rate([0.0, 1.0], [1.0, 2.0], 10.0)
        self.assertIn("insufficient_data", res["flags"])
        self.assertIsNone(res["rate"])


class TestSteppedFlow(unittest.TestCase):
    def build(self):
        rng = np.random.default_rng(12)
        sc = 10.0
        t = np.arange(0, 100, 0.25)
        speed = np.where(t < 50, 1.0, 3.0) * sc  # mm/s * px/mm
        y = 100 + np.concatenate([[0], np.cumsum(speed[:-1] * np.diff(t))]) + rng.normal(0, 0.4, t.size)
        return t, y, sc

    def test_known_step_gives_one_rate_per_segment(self):
        t, y, sc = self.build()
        segs = fit.fit_segments(t, y, [50.0], sc, None, 0, n_boot=N_BOOT)
        self.assertEqual(len(segs), 2)
        for seg, truth in zip(segs, (1.0, 3.0)):
            self.assertLess(abs(seg["rate"] - truth) / truth, 0.03, seg["rate"])
            self.assertTrue(inside(seg, truth), (seg["ci_low"], seg["ci_high"], truth))
            self.assertNotIn("flow_steps_not_resolved", seg["flags"])
        self.assertLess(segs[0]["segment_end_s"], 50.0)
        self.assertGreaterEqual(segs[1]["segment_start_s"], 50.0)

    def test_unknown_steps_give_one_rate_with_flag(self):
        t, y, sc = self.build()
        for steps in (None, []):
            segs = fit.fit_segments(t, y, steps, sc, None, 0, n_boot=N_BOOT)
            self.assertEqual(len(segs), 1)
            self.assertIn("flow_steps_not_resolved", segs[0]["flags"])
            self.assertIsNotNone(segs[0]["rate"])


class TestCli(unittest.TestCase):
    def test_main_prints_json(self):
        import contextlib
        import io
        import tempfile
        t, y = synth(2.0, 10.0, 30.0, seed=1)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "track.csv"
            with open(p, "w", newline="") as f:
                w = csv.writer(f)
                w.writerow(["frame", "time_s", "area_px", "edge_min_px", "edge_max_px", "signal"])
                for i, (ti, yi) in enumerate(zip(t, y)):
                    w.writerow([i, ti, 100, yi - 30, yi, 1.0])
                w.writerow([len(t), t[-1] + 0.25, 0, "", "", 0.0])  # a frame with no flame
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                fit.main([str(p), "--direction", "1", "--scale-px-per-mm", "10", "--seed", "3"])
        out = json.loads(buf.getvalue())
        self.assertEqual(out["unit"], "mm/s")
        self.assertLess(abs(out["rate"] - 2.0), 0.1)


if __name__ == "__main__":
    unittest.main()
