"""Checks on pipeline/video_to_data/events.py with synthetic track tables.

Stdlib only: python3 -m unittest tests.video_to_data.test_events
The fixtures are made by fixtures/make_fixtures.py (deterministic, not NASA data).
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.video_to_data import events  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"
PRE = (0.0, 5.0)


def _gen():
    spec = importlib.util.spec_from_file_location("make_fixtures", FIX / "make_fixtures.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run(name, pre=PRE, **kw):
    rows = events.load_track(FIX / f"{name}.csv")
    times = [r["time_s"] for r in rows]
    edges = None
    if any(r["edge_max_px"] is not None for r in rows):
        edges = [(r["edge_min_px"], r["edge_max_px"]) for r in rows]
    res = events.detect_events(times, [r["area_px"] for r in rows], pre, edges=edges, **kw)
    step = max(b - a for a, b in zip(times, times[1:]))
    return res, step


class EventTests(unittest.TestCase):
    def assertNear(self, got, want, step):
        self.assertIsNotNone(got)
        self.assertLessEqual(abs(got - want), step + 1e-9, f"{got} vs {want}")

    def test_fixtures_match_generator(self):
        for name, rows in _gen().all_fixtures().items():
            text = (FIX / f"{name}.csv").read_text().splitlines()
            self.assertEqual(len(text), len(rows) + 1, name)
            for line, row in zip(text[1:], rows):
                self.assertEqual(line.split(",")[:3], [str(row[0]), str(row[1]), str(row[2])])

    def test_clean_burn(self):
        res, step = run("clean_burn")
        self.assertNear(res["ignition_time_s"], 8.0, step)
        self.assertNear(res["extinction_time_s"], 20.0, step)
        self.assertNear(res["burn_duration_s"], 12.0, 2 * step)
        self.assertFalse(res["censored"])
        self.assertEqual(res["outcome"], "unclassified")
        self.assertEqual(res["flags"], [])
        self.assertGreater(res["peak_area_px"], 500)
        t = res["thresholds"]
        self.assertGreater(t["high_px"], t["low_px"])
        self.assertGreaterEqual(t["high_px"] - t["level_px"], 40.0)

    def test_cut_while_burning_is_censored(self):
        res, step = run("cut_while_burning")
        self.assertNear(res["ignition_time_s"], 8.0, step)
        self.assertIsNone(res["extinction_time_s"])
        self.assertIsNone(res["burn_duration_s"])
        self.assertTrue(res["censored"])
        self.assertEqual(res["outcome"], "censored")

    def test_flicker_is_not_extinction(self):
        res, step = run("flicker")
        self.assertNear(res["ignition_time_s"], 8.0, step)
        self.assertNear(res["extinction_time_s"], 20.0, step)
        self.assertNotIn("reignition", res["flags"])

    def test_reignition_gives_final_extinction(self):
        res, step = run("reignition")
        self.assertNear(res["ignition_time_s"], 8.0, step)
        self.assertNear(res["extinction_time_s"], 22.0, step)
        self.assertIn("reignition", res["flags"])
        self.assertFalse(res["censored"])

    def test_igniter_spike_is_ignored(self):
        res, step = run("igniter_spike", pre=(0.0, 2.5))
        self.assertNear(res["ignition_time_s"], 8.0, step)
        self.assertNear(res["extinction_time_s"], 20.0, step)
        self.assertNotIn("reignition", res["flags"])

    def test_irregular_sampling_matches_regular(self):
        reg, reg_step = run("regular_ref")
        irr, irr_step = run("irregular")
        self.assertEqual(irr_step, 0.5)
        for key, want in (("ignition_time_s", 8.0), ("extinction_time_s", 20.0)):
            self.assertNear(irr[key], want, irr_step)
            self.assertNear(reg[key], want, reg_step)
            self.assertNear(irr[key], reg[key], irr_step)

    def test_no_flame(self):
        res, _ = run("no_flame")
        self.assertIsNone(res["ignition_time_s"])
        self.assertIsNone(res["extinction_time_s"])
        self.assertIsNone(res["peak_area_px"])
        self.assertFalse(res["censored"])
        self.assertEqual(res["outcome"], "no_flame")

    def test_noisy_pre_ignition_does_not_trigger(self):
        res, step = run("noisy_pre")
        self.assertNear(res["ignition_time_s"], 8.0, step)
        self.assertGreaterEqual(res["thresholds"]["spread_px"], 1.0)
        self.assertNotIn("flame_in_pre_ignition", res["flags"])
        # the same noise with no flame must stay quiet
        rows = events.load_track(FIX / "noisy_pre.csv")
        quiet = events.detect_events([r["time_s"] for r in rows],
                                     [r["area_px"] if r["time_s"] < 8 else 5 for r in rows], PRE)
        self.assertEqual(quiet["outcome"], "no_flame")

    def test_burnout_needs_context_and_edge_at_end(self):
        res, _ = run("burnout", sample_end_px=495.0, direction=1)
        self.assertEqual(res["outcome"], "burnout")
        self.assertFalse(res["censored"])
        res, _ = run("burnout")
        self.assertEqual(res["outcome"], "unclassified")
        res, _ = run("burnout", sample_end_px=495.0)
        self.assertEqual(res["outcome"], "unclassified")
        res, _ = run("burnout", direction=1)
        self.assertEqual(res["outcome"], "unclassified")
        res, _ = run("edge_short", sample_end_px=500.0, direction=1)
        self.assertEqual(res["outcome"], "unclassified")
        res, _ = run("clean_burn", sample_end_px=500.0, direction=1)  # no edge columns
        self.assertEqual(res["outcome"], "unclassified")
        self.assertIn("no_edge_data", res["flags"])

    def test_flow_history_labels_never_returned(self):
        seen = set()
        for name in ("clean_burn", "cut_while_burning", "flicker", "reignition",
                     "igniter_spike", "irregular", "no_flame", "noisy_pre", "burnout",
                     "edge_short"):
            for kw in ({}, {"sample_end_px": 500.0, "direction": 1},
                       {"sample_end_px": 100.0, "direction": -1}):
                seen.add(run(name, **kw)[0]["outcome"])
        self.assertTrue(seen <= {"no_flame", "censored", "burnout", "unclassified"}, seen)
        self.assertFalse(seen & {"quench", "blow_off", "fan_off"})

    def test_pre_ignition_flags(self):
        res, _ = run("clean_burn", pre=(0.0, 0.2))
        self.assertIn("short_pre_ignition", res["flags"])
        res, _ = run("clean_burn", pre=(9.0, 15.0))
        self.assertIn("flame_in_pre_ignition", res["flags"])

    def test_noise_free_series_uses_floors(self):
        times = [i * 0.2 for i in range(150)]
        areas = [0 if t < 8 or t >= 20 else 500 for t in times]
        res = events.detect_events(times, areas, PRE)
        t = res["thresholds"]
        self.assertEqual((t["spread_px"], t["high_px"], t["low_px"]), (0.0, 40.0, 15.0))
        self.assertAlmostEqual(res["ignition_time_s"], 8.0)
        self.assertAlmostEqual(res["extinction_time_s"], 20.0)

    def test_limits_and_bad_input(self):
        res, _ = run("clean_burn")
        self.assertEqual(res["limits"], events.LIMITS)
        self.assertTrue(any("vanish" in s for s in events.LIMITS))
        with self.assertRaises(ValueError):
            events.detect_events([0, 1], [0], PRE)
        with self.assertRaises(ValueError):
            events.detect_events([1, 0], [0, 0], PRE)
        with self.assertRaises(ValueError):
            events.detect_events([0, 1], [0, 0], PRE, direction=2)

    def test_load_track_types(self):
        rows = events.load_track(FIX / "burnout.csv")
        self.assertIsInstance(rows[0]["frame"], int)
        self.assertIsInstance(rows[0]["area_px"], int)
        self.assertIsNone(rows[0]["edge_max_px"])
        self.assertIsNotNone(rows[60]["edge_max_px"])

    def test_cli_prints_json(self):
        out = subprocess.run(
            [sys.executable, "-m", "pipeline.video_to_data.events", str(FIX / "clean_burn.csv"),
             "--pre-start", "0", "--pre-end", "5"],
            cwd=ROOT, capture_output=True, text=True, check=True).stdout
        self.assertAlmostEqual(json.loads(out)["ignition_time_s"], 8.0, delta=0.2)


if __name__ == "__main__":
    unittest.main()
