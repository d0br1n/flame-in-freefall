"""Tests for the 24-investigation curation file (Linear DOB-61)."""

import copy
import unittest

from pipeline.catalog.curation import validate as v


class CurationTest(unittest.TestCase):
    def setUp(self):
        self.entries = v.load()

    def test_file_is_valid(self):
        self.assertEqual(v.validate(self.entries), [])

    def test_24_entries(self):
        self.assertEqual(len(self.entries), 24)

    def test_summaries_are_short_and_marked_as_si(self):
        for pid, e in self.entries.items():
            with self.subTest(pid=pid):
                text = e["summary_plain"]["text"]
                self.assertLessEqual(text.count(". ") + 1, 3, "more than three sentences")
                self.assertTrue(e["summary_plain"]["written_by"])

    def test_missing_entry_is_named(self):
        broken = copy.deepcopy(self.entries)
        del broken["PSI-69"]
        errors = v.validate(broken)
        self.assertIn("PSI-69: missing entry", errors)

    def test_bad_pillar_and_empty_source_are_caught(self):
        broken = copy.deepcopy(self.entries)
        broken["PSI-25"]["pillar"]["value"] = "fundamentals"
        broken["PSI-26"]["fuel_phase"]["source"] = ""
        errors = v.validate(broken)
        self.assertTrue(any(e.startswith("PSI-25") and "challenge page" in e for e in errors))
        self.assertTrue(any(e.startswith("PSI-26") and "no source" in e for e in errors))

    def test_stage_follows_pillar(self):
        self.assertEqual(self.entries["PSI-101"]["stage"], "detect")
        self.assertEqual(self.entries["PSI-69"]["stage"], "suppress")
        self.assertEqual(self.entries["PSI-25"]["stage"], "spread")
        self.assertIsNone(self.entries["PSI-107"]["stage"])


if __name__ == "__main__":
    unittest.main()
