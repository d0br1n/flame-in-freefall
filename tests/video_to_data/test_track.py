"""Checks on pipeline/video_to_data/track.py with synthetic frames (no NASA data needed).

Run: pytest tests/video_to_data/test_track.py
Every scene is built here from small numpy arrays: dark sensor noise, a bright text bar in the
top rows, and a RED flame (like the real one: high red, low green and blue).
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import csv
import os
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.video_to_data import events, track  # noqa: E402

H, W = 120, 300
FLAME = (250, 40, 80)  # RGB, red like the real flame; blue minus half of red+green is negative
P = track.Params(mask_top=20)


def dark(seed=0):
    rng = np.random.default_rng(seed)
    return rng.integers(0, 12, size=(H, W, 3)).astype(np.uint8)


def add_text_bar(img, value=255):
    img[2:14, 10:290] = value
    return img


def add_rect(img, x0, x1, y0, y1, colour=FLAME):
    img[y0:y1, x0:x1] = colour
    return img


def run(frames, p=P, background=None):
    sigs = [track.signal_from_rgb(f) for f in frames]
    rows, masks, _ = track.track_signals(sigs, p, background)
    return rows


class TestNoFlame(unittest.TestCase):
    def test_dark_noise_and_text_bar_give_no_flame(self):
        frames = [add_text_bar(dark(i)) for i in range(6)]
        for r in run(frames):
            self.assertEqual(r["area_px"], 0)
            self.assertIsNone(r["edge_min_px"])
            self.assertIsNone(r["edge_max_px"])
            self.assertEqual(r["signal"], 0.0)

    def test_text_bar_brighter_than_flame_never_counts(self):
        frames = []
        for i in range(5):
            f = add_text_bar(dark(i), 255)
            add_rect(f, 120 + 10 * i, 160 + 10 * i, 60, 72, (200, 30, 60))
            frames.append(f)
        for i, r in enumerate(run(frames)):
            self.assertGreater(r["area_px"], 0)
            self.assertAlmostEqual(r["edge_min_px"], 120 + 10 * i, delta=2)
            self.assertAlmostEqual(r["edge_max_px"], 159 + 10 * i, delta=2)
            self.assertGreaterEqual(r["edge_min_px"], 100)  # the bar spans x 10..289


class TestEdges(unittest.TestCase):
    def test_moving_blob_edges_within_two_pixels_every_frame(self):
        frames, truth = [], []
        for k in range(12):
            x0 = 30 + 7 * k  # 7 px per sample
            frames.append(add_rect(dark(k), x0, x0 + 40, 60, 74))
            truth.append((x0, x0 + 39))
        for r, (lo, hi) in zip(run(frames), truth):
            self.assertAlmostEqual(r["edge_min_px"], lo, delta=2)
            self.assertAlmostEqual(r["edge_max_px"], hi, delta=2)
            self.assertEqual(r["area_px"], 40 * 14)

    def test_edges_are_percentiles_not_single_pixels(self):
        f = add_rect(dark(), 100, 160, 60, 74)
        f[66, 163:166] = FLAME  # a thin spur 3 px long, removed by the opening
        r = run([f])[0]
        self.assertAlmostEqual(r["edge_max_px"], 159, delta=2)

    def test_two_parallel_lobes_both_kept(self):
        f = dark()
        add_rect(f, 60, 140, 40, 48)
        add_rect(f, 80, 160, 66, 74)
        r = run([f])[0]
        self.assertEqual(r["area_px"], 80 * 8 + 80 * 8)
        self.assertAlmostEqual(r["edge_min_px"], 60, delta=2)
        self.assertAlmostEqual(r["edge_max_px"], 159, delta=2)

    def test_far_reflection_is_dropped(self):
        f = dark()
        add_rect(f, 60, 140, 60, 72)
        add_rect(f, 270, 278, 90, 98)  # 8x8 = 64 px, brighter than min_area, 130 px away
        r = run([f])[0]
        self.assertEqual(r["area_px"], 80 * 12)
        self.assertAlmostEqual(r["edge_max_px"], 139, delta=2)


class TestMasks(unittest.TestCase):
    def test_igniter_box_ignored_when_given_and_counted_when_not(self):
        f = add_rect(dark(), 20, 40, 70, 90)  # glowing igniter, no flame
        with_box = track.Params(mask_top=20, igniter_box=(10, 60, 50, 100))
        self.assertEqual(run([f], with_box)[0]["area_px"], 0)
        no_box = run([f], P)[0]
        self.assertEqual(no_box["area_px"], 20 * 20)

    def test_igniter_next_to_flame_moves_the_edge_unless_masked(self):
        f = add_rect(dark(), 100, 170, 60, 74)
        add_rect(f, 60, 76, 62, 76)  # igniter glow 24 px behind the flame
        counted = run([f], P)[0]
        masked = run([f], track.Params(mask_top=20, igniter_box=(50, 55, 90, 85)))[0]
        self.assertAlmostEqual(counted["edge_min_px"], 60, delta=2)
        self.assertAlmostEqual(masked["edge_min_px"], 100, delta=2)

    def test_roi_restricts_the_search(self):
        f = add_rect(dark(), 20, 60, 60, 74)
        add_rect(f, 200, 240, 60, 74)
        roi = track.Params(mask_top=20, roi=(150, 0, 300, 120))
        r = run([f], roi)[0]
        self.assertAlmostEqual(r["edge_min_px"], 200, delta=2)

    def test_mask_top_drops_rows_above(self):
        f = add_rect(dark(), 100, 160, 30, 44)
        self.assertEqual(run([f], track.Params(mask_top=60))[0]["area_px"], 0)
        self.assertGreater(run([f], track.Params(mask_top=20))[0]["area_px"], 0)


class TestAxisAndDeterminism(unittest.TestCase):
    def test_axis_y_matches_axis_x_on_transposed_scene(self):
        frames = [add_rect(dark(k), 40 + 6 * k, 80 + 6 * k, 60, 74) for k in range(8)]
        rows_x = run(frames, track.Params(mask_top=20, axis="x"))
        trans = [np.ascontiguousarray(f.transpose(1, 0, 2)) for f in frames]
        rows_y = run(trans, track.Params(mask_top=20, axis="y"))
        self.assertEqual(rows_x, rows_y)

    def test_same_input_twice_gives_identical_rows(self):
        frames = [add_rect(dark(k), 30 + 5 * k, 70 + 5 * k, 60, 74) for k in range(8)]
        self.assertEqual(run(frames), run(frames))

    def test_background_subtraction_removes_a_lit_room(self):
        room = np.full((H, W, 3), 140, dtype=np.uint8)  # grey room above the 90 threshold
        pre = [room.copy() for _ in range(4)]
        burn = add_rect(room.copy(), 100, 160, 60, 74)
        sigs = [track.signal_from_rgb(f) for f in pre + [burn]]
        bg = track.background_median(sigs[:4])
        low_thr = track.Params(mask_top=20, high=90, low=50)  # room (140) above the thresholds
        no_sub = run(pre + [burn], low_thr)
        sub = run(pre + [burn], low_thr, background=bg)
        self.assertGreater(no_sub[0]["area_px"], 10000)  # whole room counts without background
        self.assertEqual([r["area_px"] for r in sub[:4]], [0, 0, 0, 0])
        self.assertEqual(sub[4]["area_px"], 60 * 14)
        self.assertAlmostEqual(sub[4]["edge_min_px"], 100, delta=2)

    def test_default_thresholds_ignore_a_lit_room_without_background(self):
        room = np.full((H, W, 3), 140, dtype=np.uint8)  # lit room below the default `low`
        self.assertEqual(run([room])[0]["area_px"], 0)

    def test_noise_thresholds_scale_with_noise(self):
        quiet = [track.signal_from_rgb(dark(i)) for i in range(4)]
        bg = track.background_median(quiet)
        valid = track.make_valid_mask((H, W), 20)
        hi, lo = track.noise_thresholds(quiet, bg, valid)
        self.assertGreater(hi, lo)
        self.assertGreater(lo, 0)

    def test_hysteresis_keeps_low_pixels_only_when_tied_to_a_high_core(self):
        sig = np.zeros((40, 80), dtype=np.float32)
        sig[10:20, 10:40] = 60   # low-level region with a bright core
        sig[12:16, 12:16] = 120
        sig[10:20, 55:75] = 60   # low-level region with no core
        valid = np.ones_like(sig, dtype=bool)
        m = track.hysteresis_mask(sig, valid, 90, 50)
        self.assertTrue(m[11, 38])
        self.assertFalse(m[15, 60])


class TestSampling(unittest.TestCase):
    def test_sample_indices_follow_rate_and_time_base(self):
        gen = track.sample_indices(29.97, 5.0)
        idx = [next(gen) for _ in range(6)]
        self.assertEqual(idx, [0, 6, 12, 18, 24, 30])


class TestFilesAndVideo(unittest.TestCase):
    def _write_avi(self, path, fps=10.0, n=40):
        w = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (W, H))
        self.assertTrue(w.isOpened())
        for k in range(n):
            f = add_text_bar(dark(k))
            if k >= 10:  # dark for the first second, then a moving flame
                x0 = 30 + 4 * (k - 10)
                add_rect(f, x0, x0 + 50, 60, 80)
            w.write(cv2.cvtColor(f, cv2.COLOR_RGB2BGR))
        w.release()

    def test_csv_columns_and_load_track(self):
        rows = [{"area_px": 0, "edge_min_px": None, "edge_max_px": None, "signal": 0.0},
                {"area_px": 500, "edge_min_px": 12.5, "edge_max_px": 80.25, "signal": 201.5}]
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "t.csv")
            track.write_track_csv(path, [0, 6], [0.0, 0.2002], rows)
            with open(path, newline="") as fh:
                self.assertEqual(next(csv.reader(fh)),
                                 ["frame", "time_s", "area_px", "edge_min_px", "edge_max_px",
                                  "signal"])
            loaded = events.load_track(path)
        self.assertEqual(len(loaded), 2)
        self.assertIsNone(loaded[0]["edge_min_px"])
        self.assertEqual(loaded[1]["area_px"], 500)
        self.assertAlmostEqual(loaded[1]["edge_max_px"], 80.25)

    def test_end_to_end_video_cli_outputs_and_determinism(self):
        with tempfile.TemporaryDirectory() as d:
            avi = os.path.join(d, "synthetic.avi")
            self._write_avi(avi)
            out1, out2 = os.path.join(d, "o1"), os.path.join(d, "o2")
            args = [avi, "--fps", "5", "--mask-top", "20", "--name", "syn"]
            self.assertEqual(track.main(args + ["--out", out1]), 0)
            self.assertEqual(track.main(args + ["--out", out2]), 0)
            rows = events.load_track(os.path.join(out1, "syn_track.csv"))
            self.assertEqual(len(rows), 20)  # 4 s at 5 samples per second
            self.assertEqual(rows[0]["time_s"], 0.0)
            self.assertAlmostEqual(rows[1]["time_s"], 0.2, places=6)  # frame 2 at 10 fps
            self.assertTrue(all(r["area_px"] == 0 for r in rows[:5]))
            self.assertTrue(all(r["area_px"] > 0 for r in rows[6:]))
            lit = [r for r in rows if r["area_px"] > 0]
            self.assertLess(lit[0]["edge_min_px"], lit[-1]["edge_min_px"])  # moves right
            self.assertAlmostEqual(lit[0]["edge_min_px"], 30 + 4 * (lit[0]["frame"] - 10), delta=3)
            for name in ("start", "middle", "end"):
                p = os.path.join(out1, f"syn_overlay_{name}.jpg")
                self.assertTrue(os.path.exists(p))
                self.assertLess(os.path.getsize(p), 150_000)
            self.assertTrue(os.path.exists(os.path.join(out1, "syn_kymograph.png")))
            for fn in ("syn_track.csv", "syn_kymograph.png", "syn_overlay_start.jpg"):
                with open(os.path.join(out1, fn), "rb") as a, open(os.path.join(out2, fn), "rb") as b:
                    self.assertEqual(a.read(), b.read(), fn)

    def test_cli_accepts_axis_igniter_roi_and_pre_ignition(self):
        with tempfile.TemporaryDirectory() as d:
            avi = os.path.join(d, "synthetic.avi")
            self._write_avi(avi)
            out = os.path.join(d, "o")
            code = track.main([avi, "--out", out, "--mask-top", "20", "--axis", "x",
                               "--igniter-box", "0,100,20,120", "--roi", "0,0,300,120",
                               "--pre-ignition", "0,0.8", "--noise-relative", "--name", "q"])
            self.assertEqual(code, 0)
            rows = events.load_track(os.path.join(out, "q_track.csv"))
            self.assertGreater(sum(r["area_px"] > 0 for r in rows), 10)

    def test_unreadable_video_is_an_error(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                track.track_video(os.path.join(d, "missing.mp4"), os.path.join(d, "o"))


if __name__ == "__main__":
    unittest.main()
