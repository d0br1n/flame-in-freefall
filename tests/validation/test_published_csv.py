"""Guards for pipeline/video_to_data/published.csv (Linear DOB-30).

Every row must carry a page and a table, figure or text location, and a quote from the
NASA/TM-20210011385 report. A row without them would be a number nobody can check.
"""

import csv
import unittest
from pathlib import Path

CSV = Path(__file__).resolve().parents[2] / "pipeline/video_to_data/published.csv"
MATCH = {"named in report", "inferred", "group", "context"}


class PublishedCsvTest(unittest.TestCase):
    def setUp(self):
        with CSV.open(encoding="utf-8", newline="") as f:
            self.rows = list(csv.DictReader(f))

    def test_has_rows_with_unique_ids(self):
        ids = [r["row_id"] for r in self.rows]
        self.assertGreater(len(ids), 20)
        self.assertEqual(len(ids), len(set(ids)))

    def test_every_row_has_a_page_a_location_and_a_quote(self):
        for r in self.rows:
            with self.subTest(row=r["row_id"]):
                self.assertTrue(r["page_printed"].strip(), "no page")
                self.assertTrue(r["page_pdf"].strip(), "no pdf page")
                self.assertTrue(r["table_or_figure"].strip(), "no table or figure")
                self.assertTrue(r["quote"].strip(), "no quote")
                self.assertTrue(r["source_document"].startswith("NASA/TM-20210011385"))

    def test_match_label_is_known(self):
        for r in self.rows:
            with self.subTest(row=r["row_id"]):
                self.assertIn(r["match"], MATCH)

    def test_test_ids_use_the_shared_rule(self):
        for r in self.rows:
            for tid in filter(None, r["test_ids"].split(";")):
                with self.subTest(row=r["row_id"], test=tid):
                    self.assertRegex(tid, r"^PSI-25/[A-Z]\d+$")

    def test_inferred_rows_say_why(self):
        for r in self.rows:
            if r["match"] == "inferred":
                with self.subTest(row=r["row_id"]):
                    self.assertTrue(r["note"].strip())


if __name__ == "__main__":
    unittest.main()
