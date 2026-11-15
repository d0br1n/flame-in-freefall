"""Checks on pipeline/video_to_data/manifest.py and the committed manifest.csv.

Uses only committed fixtures (tests/video_to_data/fixtures/) and the committed manifest.csv,
so it runs on a clean checkout without data/raw. Stdlib only.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import csv
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "video_to_data"))
import manifest  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"
MANIFEST = ROOT / "pipeline" / "video_to_data" / "manifest.csv"
PFX = "PSI-25_Raw Data_BASS_"


def records():
    return json.loads((FIX / "psi25_records.json").read_text(encoding="utf-8"))["added"]


def built():
    table = manifest.load_table(FIX / "psi25_table.csv")
    rows = manifest.build_manifest(records(), table)
    return {r["file_name"]: r for r in rows}, table


def row(suffix):
    rows, _ = built()
    return rows[PFX + suffix]


class ParseName(unittest.TestCase):
    def test_three_spellings_of_the_test_id(self):
        self.assertEqual(manifest.parse_video_name(PFX + "GMT50_SAMPLE_147_TEST_B1.mp4")["test"], "B1")
        self.assertEqual(manifest.parse_video_name(PFX + "GMT188_SAMPLE_153_TESTB6.mp4")["test"], "B6")
        p = manifest.parse_video_name(PFX + "GMT190_SAMPLE_133_TEST_T23.mp4")
        self.assertEqual((p["test"], p["sample"], p["gmt"]), ("T23", "133", "190"))

    def test_lowercase_and_gmt_with_underscore(self):
        p = manifest.parse_video_name("PSI-25_Raw Data_BASS_GMT_100_sample137_test T13.mp4")
        self.assertEqual((p["test"], p["sample"], p["gmt"]), ("T13", "137", "100"))

    def test_second_view_still_sequence_part_rerun_in_own_fields(self):
        p = manifest.parse_video_name(PFX + "GMT188_SAMPLE_153_TESTB6_2ND_VIEW.mp4")
        self.assertTrue(p["is_second_view"])
        self.assertFalse(p["is_still_sequence"])
        self.assertEqual(p["test"], "B6")
        p = manifest.parse_video_name(PFX + "GMT188_SAMPLE_153_TESTB6_Still_Sequence.mp4")
        self.assertTrue(p["is_still_sequence"])
        self.assertFalse(p["is_second_view"])
        p = manifest.parse_video_name(PFX + "GMT202_SAMPLE_220_TEST_O5a_Part-1.mp4")
        self.assertEqual((p["test"], p["rerun"], p["part"]), ("O5", "a", "1"))
        p = manifest.parse_video_name(PFX + "GMT51_SAMPLE_167_TEST_M5_Still_Sequence_2.mp4")
        self.assertEqual((p["test"], p["part"], p["is_still_sequence"]), ("M5", "2", True))

    def test_odd_names_still_give_their_test(self):
        self.assertEqual(manifest.parse_video_name(
            "PSI-25_Raw Data_T13-post-burn-picture-camera-monitor.mp4")["test"], "T13")
        p = manifest.parse_video_name(
            "PSI-25_Raw Data_vlc-record-2014-12-05-17h06m58s-BASS_GMT190_SAMPLE_145_TEST_T21.ts-.mp4")
        self.assertEqual((p["test"], p["sample"], p["gmt"]), ("T21", "145", "190"))
        self.assertEqual(manifest.parse_video_name("PSI-25_Raw Data_O5a-all.mp4")["rerun"], "a")

    def test_unparseable_name_gives_empty_test(self):
        self.assertEqual(manifest.parse_video_name("PSI-25_Raw Data_something.mp4")["test"], "")


class MaterialText(unittest.TestCase):
    def test_micron_and_width(self):
        t = "100 micron PMMA film 2 cm wide"
        self.assertEqual(manifest.parse_material(t), "PMMA")
        self.assertEqual(manifest.parse_thickness_mm(t), "0.1")
        self.assertEqual(manifest.parse_width_mm(t), "20")

    def test_mm_forms(self):
        self.assertEqual(manifest.parse_thickness_mm("2 cm 0.2 mm PMMA film"), "0.2")
        self.assertEqual(manifest.parse_width_mm("2 cm 0.2 mm PMMA film"), "20")
        self.assertEqual(manifest.parse_width_mm("1 cm wide PMMA 3 mm thick"), "10")

    def test_nothing_is_guessed(self):
        for text in ('1/4" clear rod', "2 cm SIBAL", "4 cm spherical section", ""):
            self.assertEqual(manifest.parse_thickness_mm(text), "", text)
            self.assertEqual(manifest.parse_width_mm(text), "", text)
        self.assertEqual(manifest.parse_material("100 micron film 2 cm wide"), "")
        self.assertEqual(manifest.parse_width_mm("3 mm thick PMMA 2 sided 2 cm thick"), "")


class Join(unittest.TestCase):
    def test_plain_match_carries_conditions(self):
        r = row("GMT50_SAMPLE_147_TEST_B1.mp4")
        self.assertEqual((r["match"], r["test_id"], r["investigator"]), ("matched", "PSI-25/B1", "Bhattacharjee"))
        self.assertEqual((r["thickness_mm"], r["width_mm"], r["total_frames_shot"]), ("0.1", "20", "57"))
        self.assertEqual((r["fan_display"], r["air_display"], r["view"]), ("62", "5", "main"))

    def test_b3_file_filed_under_b1_is_b3_with_a_note(self):
        r = row("GMT50_SAMPLE_148_TEST_B3.mp4")
        self.assertEqual((r["test"], r["test_id"], r["subcategory_test"]), ("B3", "PSI-25/B3", "B1"))
        self.assertIn("subcategory says B1, file name says B3", r["match_notes"])

    def test_flow_lists_stay_text(self):
        r = row("GMT188_SAMPLE_153_TESTB6.mp4")
        self.assertEqual(r["fan_display"], "0.9 1.3 2.75")
        self.assertEqual(r["air_display"], "3 5 approaching 10")

    def test_views_and_still_do_not_leak_into_test_id(self):
        for suffix, view, still in (("GMT188_SAMPLE_153_TESTB6_2ND_VIEW.mp4", "second", "false"),
                                    ("GMT188_SAMPLE_153_TESTB6_Still_Sequence.mp4", "main", "true")):
            r = row(suffix)
            self.assertEqual((r["test_id"], r["view"], r["is_still_sequence"]), ("PSI-25/B6", view, still))

    def test_rerun_letter_and_part_have_own_columns(self):
        r = row("GMT202_SAMPLE_220_TEST_O5a_Part-2.mp4")
        self.assertEqual((r["test"], r["rerun"], r["part"], r["test_id"]), ("O5", "a", "2", "PSI-25/O5a"))
        r = row("GMT167_SAMPLE_215_TEST_P3b.mp4")
        self.assertEqual((r["rerun"], r["test_id"]), ("b", "PSI-25/P3b"))

    def test_leading_zero_sample_is_not_a_mismatch(self):
        r = row("GMT175_SAMPLE_039_TEST_F4.mp4")
        self.assertEqual(r["match"], "matched")
        self.assertNotIn("mismatch", r["match_notes"])

    def test_gmt_mismatch_is_noted_but_still_matched(self):
        table = manifest.load_table(FIX / "psi25_table.csv")
        rec = {"file_name": PFX + "GMT99_SAMPLE_147_TEST_B1.mp4", "file_size": "1",
               "subcategory": "Reduced Gravity/ Bhattacharjee/B1"}
        r = manifest.build_manifest([rec], table)[0]
        self.assertEqual((r["match"], r["test_id"]), ("matched", "PSI-25/B1"))
        self.assertIn("GMT mismatch: name 99, table 50", r["match_notes"])

    def test_mislabelled_b15_with_b17_sample_and_gmt_is_not_assigned(self):
        for suffix in ("GMT183_SAMPLE_175_TESTB15.mp4", "GMT183_SAMPLE_175_TESTB15_2ND_VIEW.mp4"):
            r = row(suffix)
            self.assertEqual((r["match"], r["test_id"]), ("unmatched", ""))
            self.assertIn("table row B17", r["match_notes"])
        r = row("GMT188_SAMPLE_149_TESTB15.mp4")
        self.assertEqual((r["match"], r["test_id"]), ("matched", "PSI-25/B15"))

    def test_video_with_no_table_row_is_unmatched_with_empty_test_id(self):
        table = manifest.load_table(FIX / "psi25_table.csv")
        rec = {"file_name": PFX + "GMT1_SAMPLE_1_TEST_P99.mp4", "file_size": "5",
               "subcategory": "Reduced Gravity/Fernandez-Pello/P99"}
        r = manifest.build_manifest([rec], table)[0]
        self.assertEqual((r["match"], r["test_id"], r["material_text"]), ("unmatched", "", ""))
        self.assertIn("no table row for test P99", r["match_notes"])

    def test_missing_rerun_letter_is_not_guessed(self):
        table = manifest.load_table(FIX / "psi25_table.csv")
        rec = {"file_name": PFX + "GMT202_SAMPLE_220_TEST_O5.mp4", "file_size": "5",
               "subcategory": "Reduced Gravity/Olson/O5"}
        r = manifest.build_manifest([rec], table)[0]
        self.assertEqual((r["match"], r["test_id"]), ("unmatched", ""))

    def test_non_mp4_records_are_skipped(self):
        table = manifest.load_table(FIX / "psi25_table.csv")
        rec = {"file_name": "x_TEST_B1.zip", "file_size": "5", "subcategory": "Reduced Gravity/ Bhattacharjee/B1"}
        self.assertEqual(manifest.build_manifest([rec], table), [])

    def test_summary_counts(self):
        rows, table = built()
        s = manifest.summarize(list(rows.values()), table)
        self.assertEqual(s["mp4"], len(rows))
        self.assertEqual(s["matched"] + s["unmatched"], s["mp4"])
        self.assertIn("B17", s["table_rows_no_video"])


class CommittedManifest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(MANIFEST, encoding="utf-8", newline="") as fh:
            cls.rows = list(csv.DictReader(fh))

    def test_columns_are_the_agreed_ones(self):
        self.assertEqual(list(self.rows[0].keys()), manifest.COLUMNS)

    def test_test_ids_have_the_shared_shape(self):
        for r in self.rows:
            if r["test_id"]:
                self.assertRegex(r["test_id"], r"^PSI-25/[A-Za-z0-9]+$")

    def test_no_file_name_twice_and_all_mp4(self):
        names = [r["file_name"] for r in self.rows]
        self.assertEqual(len(names), len(set(names)))
        self.assertTrue(all(n.lower().endswith(".mp4") for n in names))

    def test_match_column_agrees_with_test_id(self):
        for r in self.rows:
            self.assertEqual(r["match"] == "matched", bool(r["test_id"]), r["file_name"])
            self.assertIn(r["match"], ("matched", "unmatched"))
            self.assertIn(r["view"], ("main", "second"))

    def test_rerun_and_part_never_inside_test(self):
        for r in self.rows:
            self.assertRegex(r["test"], r"^([A-Z]\d+)?$")

    def test_b3_file_is_b3_in_the_committed_file(self):
        r = [x for x in self.rows if x["file_name"].endswith("SAMPLE_148_TEST_B3.mp4")]
        self.assertEqual(len(r), 1)
        self.assertEqual((r[0]["test_id"], r[0]["subcategory_test"]), ("PSI-25/B3", "B1"))

    def test_bhattacharjee_series_is_covered(self):
        b = {r["test_id"] for r in self.rows if r["investigator"] == "Bhattacharjee" and r["test_id"]}
        self.assertGreaterEqual(len(b), 20)
        self.assertTrue(re.fullmatch(r"PSI-25/B\d+", next(iter(b))))


if __name__ == "__main__":
    unittest.main()
