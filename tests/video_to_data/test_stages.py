"""Checks on pipeline/video_to_data/stages.py with built flame-light curves (no video).

Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.video_to_data import stages  # noqa: E402


def trapezoid(step=0.2):
    """Ignition at 2 s: ramp 2 to 8 s, plateau 8 to 20 s at 1000, ramp down 20 to 26 s."""
    times, light = [], []
    for k in range(int(30 / step)):
        t = round(k * step, 6)
        if t < 2:
            v = 0.0
        elif t < 8:
            v = 1000 * (t - 2) / 6
        elif t < 20:
            v = 1000.0
        elif t < 26:
            v = 1000 * (26 - t) / 6
        else:
            v = 0.0
        times.append(t)
        light.append(v)
    return times, light


def names(result):
    return [s["stage"] for s in result["stages"]]


class TestConstants(unittest.TestCase):
    def test_names_and_source(self):
        self.assertEqual(stages.STAGE_NAMES, ("growth", "fully developed", "decay"))
        self.assertIn("NIST, Fire Dynamics (Fire Research Division)", stages.STAGE_CITATION)
        self.assertIn("created 17 November 2010, updated 9 September 2025", stages.STAGE_CITATION)
        self.assertEqual(stages.STAGE_LINK, "https://www.nist.gov/el/fire-research-division-73300/"
                                            "firegov-fire-service/fire-dynamics")

    def test_docstring_says_names_are_nist_and_limits_ours(self):
        doc = stages.__doc__
        self.assertIn("NAMES", doc)
        self.assertIn("team's own rule", doc)
        self.assertIn("not a hazard", doc)

    def test_flame_light_is_area_times_signal(self):
        self.assertEqual(stages.flame_light(100, 200.5), 20050.0)


class TestTrapezoid(unittest.TestCase):
    def test_three_stages_at_the_right_times(self):
        t, v = trapezoid()
        r = stages.find_stages(t, v, ignition_s=2.0, extinction_s=26.0)
        self.assertEqual(names(r), ["growth", "fully developed", "decay"])
        g, f, d = r["stages"]
        self.assertEqual(g["start_s"], 2.0)
        self.assertAlmostEqual(g["end_s"], 6.8, delta=0.5)    # 80% of 1000 is reached at 6.8 s
        self.assertAlmostEqual(f["end_s"], 21.2, delta=0.5)   # falls below 80% at 21.2 s
        self.assertEqual(d["end_s"], 26.0)
        self.assertEqual(g["end_s"], f["start_s"])
        self.assertEqual(f["end_s"], d["start_s"])
        self.assertEqual(r["flags"], [])
        self.assertAlmostEqual(r["plateau"], 1000.0, delta=1.0)
        self.assertAlmostEqual(r["peak"], 1000.0, delta=1.0)

    def test_irregular_sampling_gives_the_same_stages(self):
        t, v = trapezoid()
        keep = [i for i in range(len(t)) if i % 3 != 1]  # drop a third of the samples
        r = stages.find_stages([t[i] for i in keep], [v[i] for i in keep], 2.0, 26.0)
        self.assertEqual(names(r), ["growth", "fully developed", "decay"])
        self.assertAlmostEqual(r["stages"][0]["end_s"], 6.8, delta=0.8)

    def test_a_single_noisy_sample_does_not_break_the_plateau(self):
        t, v = trapezoid()
        v = list(v)
        v[70] = 0.0  # one dropped sample inside the plateau (median filter removes it)
        r = stages.find_stages(t, v, 2.0, 26.0)
        self.assertEqual(len(r["stages"]), 3)
        self.assertAlmostEqual(r["stages"][1]["end_s"], 21.2, delta=0.5)


class TestOtherShapes(unittest.TestCase):
    def test_triangle_has_no_plateau(self):
        t = [k * 0.2 for k in range(11)]
        v = [100 * min(k, 10 - k) for k in range(11)]  # a sharp triangle, peak at 1.0 s
        r = stages.find_stages(t, v, 0.0, t[-1])
        self.assertIn("no_plateau", r["flags"])
        self.assertEqual(names(r), ["growth", "decay"])
        peak = r["stages"][0]["end_s"]
        self.assertEqual(r["stages"][1]["start_s"], peak)
        self.assertAlmostEqual(peak, 1.0, delta=0.25)
        self.assertEqual(r["peak_time_s"], peak)

    def test_censored_curve_ends_in_the_stage_it_is_in(self):
        t, v = trapezoid()
        cut = [i for i, x in enumerate(t) if x <= 15.0]
        r = stages.find_stages([t[i] for i in cut], [v[i] for i in cut], 2.0, None)
        self.assertEqual(names(r), ["growth", "fully developed"])
        self.assertEqual(r["stages"][-1]["end_s"], 15.0)

    def test_censored_curve_that_has_started_to_fall_ends_in_decay(self):
        t, v = trapezoid()
        cut = [i for i, x in enumerate(t) if x <= 24.0]
        r = stages.find_stages([t[i] for i in cut], [v[i] for i in cut], 2.0, None)
        self.assertEqual(names(r), ["growth", "fully developed", "decay"])
        self.assertEqual(r["stages"][-1]["end_s"], 24.0)

    def test_empty_or_too_short_input_returns_no_stages(self):
        for t, v in (([], []), ([1.0, 1.2, 1.4, 1.6], [5, 6, 7, 8])):
            r = stages.find_stages(t, v, 0.0, 10.0)
            self.assertEqual(r["stages"], [])
            self.assertIn("too_short", r["flags"])

    def test_samples_outside_ignition_and_extinction_are_ignored(self):
        t, v = trapezoid()
        r = stages.find_stages(t, v, 5.0, 22.0)
        self.assertEqual(r["stages"][0]["start_s"], 5.0)
        self.assertEqual(r["stages"][-1]["end_s"], 22.0)

    def test_parameters_are_named_and_change_the_result(self):
        t, v = trapezoid()
        strict = stages.find_stages(t, v, 2.0, 26.0, hold_frac=0.95)
        loose = stages.find_stages(t, v, 2.0, 26.0, hold_frac=0.5)
        self.assertGreater(strict["stages"][0]["end_s"], loose["stages"][0]["end_s"])

    def test_bad_input_is_refused(self):
        with self.assertRaises(ValueError):
            stages.find_stages([0, 1], [1], 0, 1)
        with self.assertRaises(ValueError):
            stages.median_smooth([1, 2, 3], 4)
        with self.assertRaises(ValueError):
            stages.find_stages([0, 2, 1, 3, 4, 5], [1] * 6, 0, 5)

    def test_percentile_interpolates(self):
        self.assertEqual(stages.percentile([0, 10], 50), 5.0)
        self.assertEqual(stages.percentile([1, 2, 3, 4, 5], 90), 4.6)


class TestStageAt(unittest.TestCase):
    def test_labels_each_time(self):
        st = [{"stage": "growth", "start_s": 0, "end_s": 2},
              {"stage": "decay", "start_s": 2, "end_s": 5}]
        self.assertEqual(stages.stage_at(st, 0), "growth")
        self.assertEqual(stages.stage_at(st, 2), "decay")
        self.assertEqual(stages.stage_at(st, 5), "decay")
        self.assertEqual(stages.stage_at(st, 6), "")
        self.assertEqual(stages.stage_at([], 1), "")


if __name__ == "__main__":
    unittest.main()
