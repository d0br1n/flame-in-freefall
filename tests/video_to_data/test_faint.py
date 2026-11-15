"""Checks on pipeline/video_to_data/faint.py (last faint light) on synthetic signal images.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.video_to_data import events, faint, track  # noqa: E402

H, W = 140, 200
PRE = (0.0, 2.8)


def frame_with(region=None, level=0):
    img = np.zeros((H, W), dtype=np.int16)
    if region is not None:
        y0, y1, x0, x1 = region
        img[y0:y1, x0:x1] = level
    return img


def series(spec, end_s=24.0):
    """spec: list of (t_from, t_to, region, level); 5 samples per second, later entries win."""
    out = []
    for k in range(int(end_s * 5)):
        t = round(k * 0.2, 3)
        img = frame_with()
        for t0, t1, region, level in spec:
            if t0 <= t < t1:
                img = frame_with(region, level)
        out.append((t, img))
    return out


def factory(samples):
    return lambda: iter(samples)


BIG = (100, 130, 50, 80)      # 900 px
SPECK = (100, 110, 150, 160)  # 100 px
PATCH = (100, 112, 50, 65)    # 180 px


def dimming_flame():
    return series([(3.0, 10.0, BIG, 250), (10.0, 14.0, BIG, 30)])


class TestFaintLight(unittest.TestCase):
    def test_main_pass_ends_at_the_dimming_and_the_faint_pass_at_the_dark(self):
        samples = dimming_flame()
        p = track.Params(axis="x")
        valid = track.make_valid_mask((H, W), p.mask_top)
        rows, _, _ = track.track_signals([s for _, s in samples], p, None, valid)
        main = events.detect_events([t for t, _ in samples], [r["area_px"] for r in rows], PRE)
        res = faint.last_faint_light(factory(samples), PRE)
        self.assertAlmostEqual(main["extinction_time_s"], 10.0, delta=0.5)
        self.assertAlmostEqual(res["time_s"], 14.0, delta=0.5)
        self.assertEqual(res["area_px"], 900)
        self.assertEqual(res["flags"], [])
        self.assertGreater(res["n_detected"], 30)

    def test_a_speck_after_the_flame_does_not_extend_the_time(self):
        samples = series([(3.0, 10.0, BIG, 250), (10.0, 14.0, BIG, 30), (16.0, 20.0, SPECK, 60)])
        res = faint.last_faint_light(factory(samples), PRE)
        self.assertAlmostEqual(res["time_s"], 14.0, delta=0.5)

    def test_a_small_patch_gives_the_time_with_the_flag(self):
        samples = series([(3.0, 14.0, PATCH, 30)])
        res = faint.last_faint_light(factory(samples), PRE)
        self.assertAlmostEqual(res["time_s"], 14.0, delta=0.5)
        self.assertEqual(res["area_px"], 180)
        self.assertEqual(res["flags"], ["faint_small_region"])

    def test_too_short_a_dark_lead_in_gives_no_time_and_the_reason(self):
        res = faint.last_faint_light(factory(dimming_flame()), (0.0, 0.8))
        self.assertIsNone(res["time_s"])
        self.assertEqual(res["reason"], "dark lead-in too short")

    def test_text_rows_are_masked(self):
        samples = series([(3.0, 14.0, (10, 40, 50, 80), 200)])  # above row 90: not used
        res = faint.last_faint_light(factory(samples), PRE)
        self.assertIsNone(res["time_s"])

    def test_still_lit_at_the_end_gives_no_time(self):
        samples = series([(3.0, 30.0, BIG, 30)], end_s=24.0)
        res = faint.last_faint_light(factory(samples), PRE)
        self.assertIsNone(res["time_s"])
        self.assertIn("still lit", res["reason"])


if __name__ == "__main__":
    unittest.main()
