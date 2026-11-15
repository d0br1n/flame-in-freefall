"""Checks on pipeline/video_to_data/config.csv (against manifest.csv) and its loader.

Runs on a clean checkout: it reads only the committed CSV files, never data/raw.
Stdlib only: python3 -m unittest tests.video_to_data.test_config
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import csv
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.video_to_data import config  # noqa: E402

PKG = ROOT / "pipeline" / "video_to_data"
CONFIG = PKG / "config.csv"
MANIFEST = PKG / "manifest.csv"

HEADER = ("file_name,test_id,axis,direction,track_start_s,track_end_s,pre_ignition_start_s,"
          "pre_ignition_end_s,igniter_box,roi,eye_spark_s,eye_ignition_s,eye_gone_s,"
          "eye_censored,eye_quality,viewed_by,notes")


def _read(path):
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


class CommittedConfig(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = _read(CONFIG)
        cls.rows = config.load_config(CONFIG)
        cls.manifest = {r["file_name"]: r for r in _read(MANIFEST)}

    def test_exact_header(self):
        with open(CONFIG, encoding="utf-8") as handle:
            self.assertEqual(handle.readline().rstrip("\n"), HEADER)

    def test_has_rows(self):
        self.assertGreaterEqual(len(self.rows), 19)

    def test_files_are_main_view_in_manifest(self):
        for r in self.rows:
            m = self.manifest.get(r.file_name)
            self.assertIsNotNone(m, r.file_name)
            self.assertEqual(m["view"], "main", r.file_name)
            self.assertEqual(m["is_still_sequence"], "false", r.file_name)

    def test_test_id_matches_manifest(self):
        for r in self.rows:
            if r.test_id is not None:
                self.assertEqual(r.test_id, self.manifest[r.file_name]["test_id"], r.file_name)

    def test_no_file_twice(self):
        names = [r.file_name for r in self.rows]
        self.assertEqual(len(names), len(set(names)))

    def test_axis_and_direction(self):
        for r in self.rows:
            self.assertIn(r.axis, ("x", "y"), r.file_name)
            self.assertIn(r.direction, (1, -1), r.file_name)

    def test_pre_ignition_range(self):
        for r in self.rows:
            self.assertLessEqual(r.track_start_s, r.pre_ignition_start_s, r.file_name)
            self.assertLess(r.pre_ignition_start_s, r.pre_ignition_end_s, r.file_name)
            if r.eye_spark_s is not None:
                self.assertLess(r.pre_ignition_end_s, r.eye_spark_s, r.file_name)

    def test_track_end(self):
        for r in self.rows:
            if r.track_end_s is not None:
                self.assertGreater(r.track_end_s, r.pre_ignition_end_s, r.file_name)
                if r.eye_gone_s is not None:
                    self.assertGreater(r.track_end_s, r.eye_gone_s, r.file_name)

    def test_eye_quality_values(self):
        for r in self.rows:
            self.assertIn(r.eye_quality, ("spreading", "doubtful", "no_spread"), r.file_name)

    def test_censored_matches_gone(self):
        for r in self.rows:
            self.assertEqual(r.eye_gone_s is None, r.eye_censored, r.file_name)

    def test_boxes(self):
        for r in self.rows:
            for box in (r.igniter_box, r.roi):
                if box is not None:
                    x0, y0, x1, y1 = box
                    self.assertLess(x0, x1, r.file_name)
                    self.assertLess(y0, y1, r.file_name)

    def test_viewed_by_and_notes(self):
        for r in self.rows:
            self.assertTrue(r.viewed_by, r.file_name)
            self.assertNotIn("hand", r.viewed_by.lower(), r.file_name)
            self.assertTrue(r.notes, r.file_name)

    def test_no_provisional(self):
        for raw in self.raw:
            for value in raw.values():
                self.assertNotIn("PROVISIONAL", value.upper(), raw["file_name"])


class LoaderOnTinyFile(unittest.TestCase):
    def _write(self, tmp, lines):
        path = Path(tmp) / "c.csv"
        path.write_text("\n".join([HEADER] + lines) + "\n", encoding="utf-8")
        return path

    def test_types_and_empty_cells(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(tmp, [
                'a.mp4,PSI-25/B1,x,-1,1.5,50,2,9.5,"1,2,30,40",,10.25,10.75,38.5,no,doubtful,"SI, viewed",note',
                "b.mp4,,y,1,0,,0,2,,,,,,yes,no_spread,SI,other",
            ])
            a, b = config.load_config(path)
        self.assertEqual((a.file_name, a.test_id, a.axis, a.direction), ("a.mp4", "PSI-25/B1", "x", -1))
        self.assertEqual((a.track_start_s, a.pre_ignition_start_s, a.pre_ignition_end_s), (1.5, 2.0, 9.5))
        self.assertEqual(a.igniter_box, (1, 2, 30, 40))
        self.assertIsNone(a.roi)
        self.assertEqual((a.eye_spark_s, a.eye_ignition_s, a.eye_gone_s), (10.25, 10.75, 38.5))
        self.assertFalse(a.eye_censored)
        self.assertEqual(a.viewed_by, "SI, viewed")
        self.assertEqual(a.track_end_s, 50.0)
        self.assertIsInstance(a.track_end_s, float)
        self.assertEqual(a.eye_quality, "doubtful")
        self.assertIsInstance(a.eye_quality, str)
        self.assertIsNone(b.track_end_s)
        self.assertEqual(b.eye_quality, "no_spread")
        self.assertIsNone(b.test_id)
        self.assertIsNone(b.eye_spark_s)
        self.assertIsNone(b.eye_gone_s)
        self.assertTrue(b.eye_censored)

    def test_bad_header_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "c.csv"
            path.write_text("file_name,test_id\na.mp4,x\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                config.load_config(path)

    def test_bad_box_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(tmp, ['a.mp4,,x,1,0,,0,2,"1,2,3",,,,,no,spreading,SI,n'])
            with self.assertRaises(ValueError):
                config.load_config(path)

    def test_bad_censored_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._write(tmp, ["a.mp4,,x,1,0,,0,2,,,,,5,maybe,spreading,SI,n"])
            with self.assertRaises(ValueError):
                config.load_config(path)


if __name__ == "__main__":
    unittest.main()
