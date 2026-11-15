"""Checks on pipeline/video_to_data/grades.py and the committed t_series_grades.csv.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.video_to_data import grades  # noqa: E402

CSV = ROOT / "pipeline" / "video_to_data" / "t_series_grades.csv"


class TestMatchLabel(unittest.TestCase):
    def test_every_mapping_matches(self):
        for si, nasa in (("quenched", "quenched"), ("blow_off", "blow-off"),
                         ("no_blow_off", "no blowoff"), ("no_ignition", "no ignition")):
            self.assertEqual(grades.match_label(si, nasa), "yes")

    def test_a_different_outcome_is_no(self):
        self.assertEqual(grades.match_label("quenched", "blow-off"), "no")
        self.assertEqual(grades.match_label("no_ignition", "no blowoff"), "no")

    def test_cannot_tell_is_undecided_and_empty_is_not_graded(self):
        self.assertEqual(grades.match_label("cannot_tell", "no ignition"), "undecided")
        self.assertEqual(grades.match_label("", "quenched"), "not_graded")

    def test_unknown_label_is_a_clear_error(self):
        with self.assertRaisesRegex(ValueError, "unknown SI grade label"):
            grades.match_label("burned", "quenched")
        with self.assertRaisesRegex(ValueError, "unknown NASA outcome label"):
            grades.match_label("quenched", "melted")


class TestBuildRows(unittest.TestCase):
    PUB = [{"row_id": "PUB-17", "test_ids": "PSI-25/T4", "quantity": "outcome", "value": "quenched"},
           {"row_id": "PUB-21", "test_ids": "PSI-25/T20", "quantity": "outcome", "value": "quenched"},
           {"row_id": "PUB-01", "test_ids": "PSI-25/B1", "quantity": "outcome", "value": "x"}]

    def test_ungraded_published_test_gets_a_row_with_the_reason(self):
        rows = grades.build_rows([{"test": "T4", "grade": "quenched"}], self.PUB)
        self.assertEqual([r["test_id"] for r in rows], ["PSI-25/T4", "PSI-25/T20"])
        self.assertEqual(rows[1]["match"], "not_graded")
        self.assertEqual(rows[1]["reason"], "no plain main video on PSI")
        self.assertEqual(rows[0]["nasa_source"], "PUB-17, Summary Report Table 7.1, PDF page 104")

    def test_grade_without_a_nasa_outcome_is_an_error(self):
        with self.assertRaises(ValueError):
            grades.build_rows([{"test": "T99", "grade": "quenched"}], self.PUB)


class TestCommittedFile(unittest.TestCase):
    def setUp(self):
        self.rows = grades.read_csv(CSV)

    def test_twelve_rows_with_the_columns(self):
        self.assertEqual(len(self.rows), 12)
        self.assertEqual(list(self.rows[0]), grades.COLUMNS)

    def test_match_column_equals_the_function_for_every_row(self):
        for r in self.rows:
            self.assertEqual(r["match"], grades.match_label(r["grade"], r["nasa_outcome"]),
                             r["test_id"])

    def test_test_ids_have_the_contract_shape(self):
        for r in self.rows:
            self.assertRegex(r["test_id"], r"^PSI-25/T[0-9]+$")

    def test_t20_is_not_graded(self):
        t20 = next(r for r in self.rows if r["test_id"] == "PSI-25/T20")
        self.assertEqual((t20["grade"], t20["match"]), ("", "not_graded"))


if __name__ == "__main__":
    unittest.main()
