"""Checks on the detection-steps clip (three panels) and its entries in index.json/module.json.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.video_to_data import run  # noqa: E402

W, H = run.STEPS_PANEL


def synthetic():
    rgb = np.full((48, 72, 3), 90, np.uint8)
    sub = np.zeros((48, 72), np.float32)
    sub[10:30, 20:40] = 200.0
    sub[0:5, :] = 300.0   # over 255: clipped
    valid = np.ones((48, 72), bool)
    valid[:, 60:] = False  # outside the valid area: black in panel 2
    mask = np.zeros((48, 72), bool)
    mask[12:28, 22:38] = True
    return rgb, sub, valid, mask


def fake_overlay(rgb, mask, row, p, label):
    return np.full(rgb.shape, 120, np.uint8)  # stands for the outline picture


class TestFrame(unittest.TestCase):
    def frame(self):
        rgb, sub, valid, mask = synthetic()
        with mock.patch.object(run.track, "render_overlay", fake_overlay):
            return run.render_steps_clip_frame(rgb, sub, valid, mask, {}, None)

    def test_size_is_three_panels_side_by_side(self):
        f = self.frame()
        self.assertEqual(f.shape, (H, 3 * W, 3))
        self.assertEqual(f.dtype, np.uint8)

    def test_panel_order_outline_brightness_mask(self):
        f = self.frame()
        p1, p2, p3 = f[:, :W], f[:, W:2 * W], f[:, 2 * W:]
        self.assertEqual(int(p1[H - 5, W // 2, 0]), 120)       # panel 1: the outline picture
        self.assertEqual(int(p2[H - 5, W // 2, 0]), 0)         # panel 2: brightness, dark here
        self.assertEqual(int(p3[H - 5, W // 2, 0]), 0)         # panel 3: mask, black here
        self.assertEqual(int(p2[H // 2, int(W * 30 / 72), 0]), 200)  # bright block only in 2
        self.assertEqual(int(p1[H // 2, int(W * 30 / 72), 0]), 120)

    def test_brightness_panel_is_grey_clipped_and_black_outside_valid(self):
        p2 = self.frame()[:, W:2 * W]
        self.assertTrue((p2[..., 0] == p2[..., 1]).all() and (p2[..., 1] == p2[..., 2]).all())
        self.assertEqual(int(p2[H // 2, int(W * 66 / 72), 0]), 0)    # outside the valid area
        self.assertEqual(int(p2[int(H * 3 / 48), int(W * 30 / 72), 0]), 255)  # 300 clipped

    def test_mask_panel_is_only_0_or_255_and_white_where_the_mask_is(self):
        p3 = self.frame()[:, 2 * W:]
        self.assertEqual(set(np.unique(p3).tolist()), {0, 255})
        self.assertEqual(int(p3[H // 2, W // 2, 0]), 255)
        self.assertEqual(int(p3[H - 10, 10, 0]), 0)

    def test_labels_are_burned_at_the_top_left_of_each_panel(self):
        f = self.frame()
        for i in range(3):
            self.assertEqual(int(f[0:14, i * W:i * W + 150, 0].max()), 255)  # white text
        self.assertEqual(run.STEPS_CLIP_LABELS, ("1 NASA's frame + outline", "2 Brightness",
                                                 "3 Flame mask"))


class TestSamplingAndEncoder(unittest.TestCase):
    def test_sampling_is_the_overlay_clips(self):
        lit = [{"time_s": i / run.FPS} for i in range(100)]
        idx, fps, speed = run.clip_sampling(lit)
        self.assertEqual(idx, list(range(100)))
        self.assertEqual(fps, 10)
        self.assertEqual(speed, 2.0)

    def run_encoder(self, sizes):
        frames = [np.zeros((H, 3 * W, 3), np.uint8)] * 3
        calls = []

        def fake_run(cmd, input=None, capture_output=None, timeout=None):
            calls.append(cmd)
            Path(cmd[-1]).write_bytes(b"x" * sizes[len(calls) - 1])
            return mock.Mock(returncode=0, stderr=b"")
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(run.subprocess, "run", fake_run):
            path = Path(tmp) / "c.mp4"
            ok = run.encode_steps_clip(frames, 10, path)
            return ok, calls, path.exists()

    def test_first_quality_that_fits_is_kept_at_full_size_and_rate(self):
        ok, calls, exists = self.run_encoder([2_000_000, 900_000])
        self.assertTrue(ok and exists)
        self.assertEqual(len(calls), 2)
        c = calls[1]
        self.assertEqual(c[c.index("-crf") + 1], "32")
        self.assertEqual(c[c.index("-s") + 1], f"{3 * W}x{H}")
        self.assertIn("yuv420p", c)
        self.assertEqual(c[c.index("-r", c.index("-vf")) + 1], "10")

    def test_frame_rate_is_lowered_only_after_every_quality(self):
        n = len(run.STEPS_CLIP_CRFS)
        ok, calls, _ = self.run_encoder([2_000_000] * n + [500_000])
        self.assertTrue(ok)
        self.assertEqual(len(calls), n + 1)
        c = calls[-1]
        self.assertEqual(c[c.index("-r", c.index("-vf")) + 1], "5")
        self.assertEqual(c[c.index("-crf") + 1], str(run.STEPS_CLIP_CRFS[0]))

    def test_nothing_fits_gives_false_and_no_file(self):
        total = len(run.STEPS_CLIP_CRFS) * len(run.STEPS_CLIP_FPS_DIVISORS)
        ok, calls, exists = self.run_encoder([2_000_000] * total)
        self.assertFalse(ok)
        self.assertFalse(exists)
        self.assertEqual(len(calls), total)


class TestEntries(unittest.TestCase):
    def test_file_name_is_not_an_evidence_asset(self):
        self.assertEqual(run.steps_clip_name("PSI-25/B1"), "PSI-25_B1_stepsclip.mp4")
        self.assertNotIn("PSI-25_B1_stepsclip.mp4", run.asset_list("PSI-25/B1"))
        self.assertTrue(any(rx.search("PSI-25_B1_stepsclip.mp4") for rx, _, _ in run.FILE_KINDS))

    def test_index_entry_gets_files_steps_clip_and_clip_keeps_its_keys(self):
        clip = {"file": "PSI-25_B1_overlay.mp4", "start_s": 1.0, "end_s": 5.0, "speed": 2.0,
                "steps_clip": "PSI-25_B1_stepsclip.mp4"}
        from tests.video_to_data.test_run import measurement, fit_dict  # noqa: E402
        m = measurement(test_id="PSI-25/B1", fit=fit_dict())
        m["clip"] = clip
        m["stages"] = {"stages": [], "flags": [], "plateau": None, "peak": None,
                       "peak_time_s": None, "n_samples": 1}
        with mock.patch.object(run, "fan_summary", return_value=None):
            entry = run.build_index([m], [], [])["tests"][0]
        self.assertEqual(entry["files"]["steps_clip"], "PSI-25_B1_stepsclip.mp4")
        self.assertEqual(entry["clip"], {k: v for k, v in clip.items() if k != "steps_clip"})
        m["clip"] = dict(clip, steps_clip=None)
        with mock.patch.object(run, "fan_summary", return_value=None):
            entry = run.build_index([m], [], [])["tests"][0]
        self.assertNotIn("steps_clip", entry["files"])

    def make_folder(self, tmp):
        index = {"module": "m", "tests": [
            {"test_id": "PSI-25/B1", "clip": {"file": "a.mp4", "start_s": 1.0, "end_s": 5.0,
                                              "speed": 2.0}, "files": {"readout": "r.csv"}},
            {"test_id": "PSI-25/B2", "clip": {"file": "b.mp4", "start_s": 1.0, "end_s": 5.0,
                                              "speed": 2.0}, "files": {"readout": "r2.csv"}}]}
        (tmp / "index.json").write_text(run.dumps_json(index), encoding="utf-8")
        mod = {"id": "m", "files": [{"name": "z.csv", "kind": "table", "description": "z"},
                                    {"name": "a.csv", "kind": "table", "description": "a"}]}
        (tmp / "module.json").write_text(run.dumps_json(mod), encoding="utf-8")

    def test_adds_only_the_new_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            self.make_folder(tmp)
            clip = {"file": "a.mp4", "start_s": 1.0, "end_s": 5.0, "speed": 2.0,
                    "steps_clip": "PSI-25_B1_stepsclip.mp4"}
            run.add_steps_clips_to_module(tmp, {"PSI-25/B1": clip,
                                                "PSI-25/B2": dict(clip, steps_clip=None)})
            idx = json.loads((tmp / "index.json").read_text())
            self.assertEqual(idx["tests"][0]["files"],
                             {"readout": "r.csv", "steps_clip": "PSI-25_B1_stepsclip.mp4"})
            self.assertEqual(idx["tests"][1]["files"], {"readout": "r2.csv"})
            self.assertEqual(idx["tests"][0]["clip"]["file"], "a.mp4")
            self.assertNotIn("steps_clip", idx["tests"][0]["clip"])
            mod = json.loads((tmp / "module.json").read_text())
            self.assertEqual([f["name"] for f in mod["files"]],
                             ["PSI-25_B1_stepsclip.mp4", "a.csv", "z.csv"])
            self.assertEqual(mod["files"][0]["kind"], "clip")
            run.add_steps_clips_to_module(tmp, {"PSI-25/B1": clip})  # twice: no duplicate
            mod = json.loads((tmp / "module.json").read_text())
            self.assertEqual(len(mod["files"]), 3)

    def test_timing_that_differs_from_the_overlay_clip_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            self.make_folder(tmp)
            clip = {"file": "a.mp4", "start_s": 1.0, "end_s": 6.0, "speed": 2.0,
                    "steps_clip": "PSI-25_B1_stepsclip.mp4"}
            with self.assertRaises(ValueError):
                run.add_steps_clips_to_module(tmp, {"PSI-25/B1": clip})


if __name__ == "__main__":
    unittest.main()
