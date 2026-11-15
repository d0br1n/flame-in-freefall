"""Tests for pipeline/video_to_data/inventory.py (DOB-29).

Stdlib only. They use the committed fixtures and pure functions, never data/raw or ffmpeg.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import csv
import json
import random
import unittest
from pathlib import Path

from pipeline.video_to_data import inventory

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
B1_STILL = "PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1_Still_Sequence.mp4"


def slideshow(gaps, noise=0.04, jump=1.5, seed=1):
    """Differences of a slideshow: one jump after each gap of held frames."""
    rng = random.Random(seed)
    out = []
    for g in gaps:
        out += [noise + rng.random() * 0.03 for _ in range(g - 1)]
        out.append(jump)
    return out


def real_time(n, seed=2):
    """Differences of a smoothly moving real-time clip: no spikes."""
    rng = random.Random(seed)
    return [1.0 + rng.random() * 0.4 for _ in range(n)]


def load_diffs(key):
    return json.loads((FIXTURES / "frame_diffs.json").read_text())[key]


class ParseTest(unittest.TestCase):
    def test_name_variants(self):
        names = {
            "PSI-25_Raw Data_BASS_GMT188_SAMPLE_153_TESTB6_Still_Sequence.mp4": "B6",
            "PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4": "B1",
            B1_STILL: "B1",
            "PSI-25_Raw Data_BASS_GMT190_SAMPLE_133_TEST_T23_Still_Sequence.mp4": "T23",
            "PSI-25_Raw Data_T13-post-burn-picture-camera-monitor.mp4": "T13",
        }
        for name, want in names.items():
            self.assertEqual(inventory.parse_test(name), want, name)

    def test_no_test_id(self):
        self.assertEqual(inventory.parse_test("PSI-25_Reports_BASS-II Summary Report.pdf"), "")


class InventoryRowTest(unittest.TestCase):
    def setUp(self):
        probe = json.loads((FIXTURES / "ffprobe_B1_still_sequence.json").read_text())
        self.row = inventory.inventory_row(probe, B1_STILL)

    def test_measured_values(self):
        r = self.row
        self.assertEqual((r["width"], r["height"]), (720, 480))
        self.assertEqual(r["fps"], 29.97)
        self.assertEqual(r["frame_count"], 1129)
        self.assertEqual(r["duration_s"], 37.671)
        self.assertEqual((r["codec"], r["field_order"]), ("h264", "progressive"))

    def test_name_columns(self):
        self.assertEqual(self.row["test"], "B1")
        self.assertEqual(self.row["is_still_sequence_name"], "yes")

    def test_name_taken_from_format_when_not_given(self):
        probe = json.loads((FIXTURES / "ffprobe_B1_still_sequence.json").read_text())
        self.assertEqual(inventory.inventory_row(probe)["file_name"], B1_STILL)

    def test_plain_name_is_not_still_sequence(self):
        probe = {"streams": [{"codec_type": "video", "width": 720, "height": 480,
                              "avg_frame_rate": "30000/1001", "nb_frames": "10",
                              "codec_name": "h264"}], "format": {"duration": "0.3"}}
        row = inventory.inventory_row(probe, "PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4")
        self.assertEqual(row["is_still_sequence_name"], "no")
        self.assertEqual(row["field_order"], "")  # unknown stays empty

    def test_missing_frame_count_stays_empty(self):
        probe = {"streams": [{"codec_type": "video", "avg_frame_rate": "0/0",
                              "r_frame_rate": "25/1"}], "format": {}}
        row = inventory.inventory_row(probe, "x_TEST_B1.mp4")
        self.assertEqual(row["frame_count"], "")
        self.assertEqual(row["fps"], 25.0)
        self.assertEqual(row["duration_s"], "")

    def test_no_video_stream_raises(self):
        with self.assertRaises(ValueError):
            inventory.inventory_row({"streams": [{"codec_type": "audio"}]}, "a.mp4")


class ClassifyTimeBaseTest(unittest.TestCase):
    def test_constant_hold_slideshow(self):
        tb = inventory.classify_time_base(slideshow([10] * 20))
        self.assertEqual(tb["kind"], "held_stills")
        self.assertEqual(tb["frames_per_still"], 10)
        self.assertEqual(tb["distinct_images"], 21)
        self.assertTrue(tb["constant"])

    def test_alternating_hold_is_not_constant(self):
        tb = inventory.classify_time_base(slideshow([18, 19] * 12))
        self.assertEqual(tb["kind"], "held_stills")
        self.assertAlmostEqual(tb["frames_per_still"], 18.5, delta=0.1)
        self.assertEqual((tb["gap_min"], tb["gap_max"]), (18, 19))
        self.assertFalse(tb["constant"])
        self.assertEqual(tb["distinct_images"], 25)

    def test_real_time_sequence(self):
        tb = inventory.classify_time_base(real_time(300))
        self.assertEqual(tb["kind"], "real_time")
        self.assertEqual(tb["frames_per_still"], 1)

    def test_one_duplicated_frame_is_still_real_time(self):
        diffs = real_time(300)
        diffs[150] = 0.0
        tb = inventory.classify_time_base(diffs)
        self.assertEqual(tb["kind"], "real_time")
        self.assertEqual(tb["distinct_images"], 300)  # 301 frames, one repeats

    def test_one_flash_in_real_time_is_not_a_slideshow(self):
        diffs = real_time(300)
        diffs[120] = 30.0
        self.assertEqual(inventory.classify_time_base(diffs)["kind"], "real_time")

    def test_irregular_spikes_are_not_a_slideshow(self):
        diffs = [0.05] * 400
        for i in (30, 90, 100, 230, 260, 390):
            diffs[i] = 2.0
        self.assertEqual(inventory.classify_time_base(diffs)["kind"], "real_time")

    def test_missed_small_change_is_counted(self):
        # a still that differs too little from the next one to show as a jump
        diffs = slideshow([18] * 10)
        diffs[8 * 18 + 17] = 0.05
        tb = inventory.classify_time_base(diffs)
        self.assertEqual(tb["kind"], "held_stills")
        self.assertEqual(tb["distinct_images"], 11)

    def test_long_final_hold_is_not_many_images(self):
        diffs = slideshow([18] * 10) + [0.05] * 100
        tb = inventory.classify_time_base(diffs)
        self.assertEqual(tb["distinct_images"], 11)

    def test_split_jump_is_one_change(self):
        diffs = slideshow([18] * 10)
        diffs[17 + 18 * 3 + 1] = 1.0  # the change smears over two frames
        self.assertEqual(inventory.classify_time_base(diffs)["distinct_images"], 11)

    def test_empty_and_tiny_input(self):
        self.assertEqual(inventory.classify_time_base([])["distinct_images"], 0)
        self.assertEqual(inventory.classify_time_base([0.5, 0.6])["kind"], "real_time")

    def test_real_measurements(self):
        b6 = inventory.classify_time_base(load_diffs("B6_still_head"))
        self.assertEqual(b6["kind"], "held_stills")
        self.assertAlmostEqual(b6["frames_per_still"], 18.5, delta=0.2)
        t23 = inventory.classify_time_base(load_diffs("T23_still_all"))
        self.assertEqual((t23["kind"], t23["distinct_images"]), ("held_stills", 3))
        plain = inventory.classify_time_base(load_diffs("B1_plain_head"))
        self.assertEqual(plain["kind"], "real_time")


class BuildRowsKeepTest(unittest.TestCase):
    def test_kept_rows_are_copied_and_follow_the_download_order(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            dl = Path(tmp) / "downloads.csv"
            dl.write_text("file_name,bytes,psi_id,subcategory,kind,local_path,date_fetched\n"
                          "b_TEST_B2.mp4,1,PSI-25,,video,x/b.mp4,2026-11-15\n"
                          "t.csv,1,PSI-25,,table,x/t.csv,2026-11-15\n"
                          "a_TEST_B1.mp4,1,PSI-25,,video,x/a.mp4,2026-11-15\n")
            keep = {"a_TEST_B1.mp4": {"file_name": "a_TEST_B1.mp4", "notes": "mine", "extra": "z"},
                    "b_TEST_B2.mp4": {"file_name": "b_TEST_B2.mp4", "width": "720"}}
            lines = []
            rows = inventory.build_rows(Path(tmp), dl, keep, log=lines.append)
        self.assertEqual([r["file_name"] for r in rows], ["b_TEST_B2.mp4", "a_TEST_B1.mp4"])
        self.assertEqual(rows[1]["notes"], "mine")
        self.assertEqual(list(rows[0]), inventory.COLUMNS)
        self.assertEqual(lines, [])  # nothing was measured


class CountTableTest(unittest.TestCase):
    def test_each_video_counted_once_first_match_wins(self):
        man = [{"file_name": n, "investigator": i, "view": v} for n, i, v in [
            ("a", "Olson", "main"), ("b", "Olson", "second"), ("c", "Olson", "second"),
            ("d", " Miller", "main"), ("e", "Miller", "main")]]
        vid = [{"file_name": "a", "readable": "yes", "is_still_sequence_name": "no"},
               {"file_name": "b", "readable": "yes", "is_still_sequence_name": "no"},
               {"file_name": "c", "readable": "yes", "is_still_sequence_name": "yes"},
               {"file_name": "d", "readable": "no", "is_still_sequence_name": "yes"},
               {"file_name": "e", "readable": "yes", "is_still_sequence_name": "yes"}]
        lines = inventory.count_table(vid, man).splitlines()
        self.assertIn("| Miller | 0 | 0 | 1 | 1 | 2 |", lines)
        self.assertIn("| Olson | 1 | 1 | 1 | 0 | 3 |", lines)
        self.assertEqual(lines[-1], "| all | 1 | 1 | 2 | 1 | 5 |")


class VideosCsvTest(unittest.TestCase):
    def setUp(self):
        with open(ROOT / "pipeline" / "video_to_data" / "videos.csv", newline="",
                  encoding="utf-8") as fh:
            self.rows = list(csv.DictReader(fh))
        with open(ROOT / "pipeline" / "video_to_data" / "downloads.csv", newline="",
                  encoding="utf-8") as fh:
            self.videos = [r for r in csv.DictReader(fh) if r["kind"] == "video"]

    def test_columns(self):
        self.assertEqual(list(self.rows[0].keys()), inventory.COLUMNS)

    # Retires test_every_inventory_row_is_a_listed_download_video: the inventory is rebuilt over
    # the full list, so the rule is strict again (one row per listed video, no extras).
    def test_every_download_video_has_exactly_one_inventory_row(self):
        names = [r["file_name"] for r in self.rows]
        self.assertEqual(len(names), len(set(names)))
        self.assertEqual(set(names), {v["file_name"] for v in self.videos})
        self.assertEqual(len(names), len(self.videos))

    def test_unreadable_files_are_listed_with_a_reason_and_no_measurement(self):
        # Some PSI-25 files do not open (ffprobe: moov atom not found). They stay in the list.
        for r in self.rows:
            self.assertIn(r["readable"], ("yes", "no"), r["file_name"])
            if r["readable"] == "no":
                self.assertTrue(r["notes"].startswith("Not readable"), r["file_name"])
                for col in ("width", "height", "fps", "frame_count", "duration_s",
                            "time_base_kind", "frames_per_still", "distinct_images"):
                    self.assertEqual(r[col], "", (r["file_name"], col))

    def test_unreadable_row_keeps_the_name_and_the_test(self):
        row = inventory.unreadable_row(
            "PSI-25_Raw Data_BASS_GMT183_SAMPLE_152_TESTB20.mp4", "moov atom not found\n")
        self.assertEqual(row["test"], "B20")
        self.assertEqual(row["readable"], "no")
        self.assertEqual(row["is_still_sequence_name"], "no")
        self.assertIn("moov atom not found", row["notes"])
        self.assertEqual(set(row) - set(inventory.COLUMNS), set())

    def test_rows_nobody_viewed_say_so(self):
        for r in self.rows:
            if r["readable"] == "yes" and r["file_name"] not in inventory.OBSERVATIONS:
                self.assertEqual(r["notes"], inventory.NOT_VIEWED, r["file_name"])
                self.assertEqual(r["flame_video"], "", r["file_name"])

    def test_fps_and_frames_positive(self):
        for r in self.rows:
            if r["readable"] == "no":
                continue
            self.assertGreater(float(r["fps"]), 0, r["file_name"])
            self.assertGreater(int(r["frame_count"]), 0, r["file_name"])
            self.assertGreater(float(r["duration_s"]), 0, r["file_name"])

    def test_test_and_flag_values(self):
        for r in self.rows:
            self.assertEqual(r["test"], inventory.parse_test(r["file_name"]))
            self.assertEqual(r["is_still_sequence_name"] == "yes",
                             "Still_Sequence" in r["file_name"])
            # Seen by eye for the files in OBSERVATIONS only; empty means nobody looked yet.
            looked = r["file_name"] in inventory.OBSERVATIONS
            for col in ("overlay_text", "scale_reference", "flame_video"):
                self.assertIn(r[col], ("yes", "no") if looked else ("yes", "no", ""),
                              r["file_name"])
            if r["readable"] == "yes":
                self.assertIn(r["time_base_kind"], ("real_time", "held_stills"))

    def test_still_sequence_names_are_slideshows(self):
        for r in self.rows:
            if r["flame_video"] == "yes" and r["is_still_sequence_name"] == "yes":
                self.assertEqual(r["time_base_kind"], "held_stills", r["file_name"])
                self.assertGreater(float(r["frames_per_still"]), 1)

    def test_b1_has_both_forms(self):
        kinds = {r["is_still_sequence_name"]: r["time_base_kind"]
                 for r in self.rows if r["test"] == "B1"}
        self.assertEqual(kinds, {"no": "real_time", "yes": "held_stills"})


if __name__ == "__main__":
    unittest.main()
