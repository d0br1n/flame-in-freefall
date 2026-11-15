"""Tests for pipeline/video_to_data/si_draft.py (Linear DOB-43): the SI draft edge detector.

All frames are synthetic and drawn here, so nothing needs data/raw. No test is skipped or expected to fail.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import unittest

import cv2
import numpy as np

from pipeline.video_to_data import si_draft

H, W = 480, 720


def black():
    return np.zeros((H, W, 3), np.uint8)


def blob(frame, x0, x1, bgr, y=300, half_h=8):
    """A filled ellipse spanning columns x0..x1 at row y."""
    cv2.ellipse(frame, ((x0 + x1) // 2, y), ((x1 - x0) // 2, half_h), 0, 0, 360, bgr, -1)
    return frame


PINK = (120, 60, 255)    # bright pink-red (BGR): the flame colour
FAINT = (40, 18, 70)     # a faint pink: too dim for the strict rule


class Strict(unittest.TestCase):
    def test_finds_the_right_tip_of_a_red_blob(self):
        edge = si_draft.strict_edge(blob(black(), 150, 300, PINK))
        self.assertAlmostEqual(edge, 300, delta=6)

    def test_the_edge_follows_a_blob_that_moves_right(self):
        a = si_draft.strict_edge(blob(black(), 150, 300, PINK))
        b = si_draft.strict_edge(blob(black(), 150, 380, PINK))
        self.assertGreater(b, a + 60)

    def test_a_black_frame_has_no_edge(self):
        self.assertIsNone(si_draft.strict_edge(black()))

    def test_a_gray_lit_scene_is_not_flame(self):
        gray = np.full((H, W, 3), 95, np.uint8)
        self.assertIsNone(si_draft.strict_edge(gray))

    def test_a_white_igniter_glow_alone_is_not_flame(self):
        self.assertIsNone(si_draft.strict_edge(blob(black(), 40, 120, (255, 255, 255), half_h=30)))

    def test_a_tiny_speck_is_ignored(self):
        frame = black()
        cv2.circle(frame, (400, 300), 3, PINK, -1)
        self.assertIsNone(si_draft.strict_edge(frame))

    def test_flame_outside_the_band_of_rows_is_ignored(self):
        self.assertIsNone(si_draft.strict_edge(blob(black(), 150, 300, PINK, y=100)))

    def test_the_text_overlay_rows_are_ignored(self):
        frame = black()
        cv2.putText(frame, "FUEL AIR FAN", (150, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
        self.assertIsNone(si_draft.strict_edge(frame))


class Dim(unittest.TestCase):
    def test_the_dim_rule_sees_a_faint_flame_the_strict_rule_misses(self):
        frame = blob(black(), 200, 330, FAINT)
        self.assertIsNone(si_draft.strict_edge(frame))
        self.assertAlmostEqual(si_draft.dim_edge(frame), 330, delta=6)

    def test_the_dim_rule_ignores_pure_noise(self):
        rng = np.random.default_rng(0)
        noise = rng.integers(0, 12, size=(H, W, 3)).astype(np.uint8)
        self.assertIsNone(si_draft.dim_edge(noise))


class Rows(unittest.TestCase):
    def test_one_row_per_30_frames_where_an_edge_exists(self):
        edges = [None] * 30 + [100] * 30 + [None] * 30 + [150] * 30
        modes = [None] * 30 + ["strict"] * 30 + [None] * 30 + ["dim"] * 30
        rows = si_draft.saved_rows(edges, modes)
        self.assertEqual([r[2] for r in rows], ["strict", "dim"])
        self.assertEqual([r[1] for r in rows], ["100.0", "150.0"])
        self.assertAlmostEqual(float(rows[0][0]), 30 / si_draft.FPS, places=3)

    def test_times_increase_and_use_the_29_97_fps_time_base(self):
        rows = si_draft.saved_rows([10] * 300, ["strict"] * 300)
        times = [float(r[0]) for r in rows]
        self.assertEqual(len(times), 10)
        self.assertAlmostEqual(times[1] - times[0], 30 * 1001 / 30000, places=3)

    def test_unknown_test_names_are_refused(self):
        self.assertEqual(si_draft.main(["B99"]), 1)


if __name__ == "__main__":
    unittest.main()
