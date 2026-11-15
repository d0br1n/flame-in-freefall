# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Tests for the outcome rule (outcomes.py) and the committed outcome_check.csv (DOB-44).

The rule tests use built inputs only (no video, no data/raw). The CSV tests read the committed
file next to the pipeline code.
"""
import csv
import unittest
from pathlib import Path

from pipeline.video_to_data.outcomes import LABELS, classify_outcome

CSV_PATH = Path(__file__).resolve().parents[2] / "pipeline" / "video_to_data" / "outcome_check.csv"

HEADER = [
    "test_id", "published_outcome", "published_source", "measured_outcome", "agreement", "reason",
    "file_name", "ignition_time_s", "extinction_time_s", "censored", "fan_changes", "viewed_by",
    "eye_note",
]

# published word -> label of the rule that counts as the same result
MAPPING = {
    "quenched": "quench",
    "blow-off": "blow_off",
    "no blowoff": "no_blow_off",
    "no ignition": "no_ignition",
}


def label(*args, **kw):
    out = classify_outcome(*args, **kw)
    assert out.label in LABELS
    assert out.reason
    return out.label


class NoIgnition(unittest.TestCase):
    def test_no_flame_in_long_video(self):
        self.assertEqual(label(None, None, False, 60.0, []), "no_ignition")

    def test_watch_time_edge(self):
        self.assertEqual(label(None, None, False, 20.0, []), "no_ignition")
        self.assertEqual(label(None, None, False, 19.9, []), "cannot_tell")

    def test_flash_shorter_than_min_flame(self):
        self.assertEqual(label(5.0, 6.9, False, 60.0, [(5.5, 80, 50)]), "no_ignition")

    def test_flame_of_exactly_min_flame_counts(self):
        self.assertEqual(label(5.0, 7.0, False, 60.0, [(6.0, 80, 50)]), "quench")

    def test_custom_min_flame(self):
        self.assertEqual(label(5.0, 9.0, False, 60.0, [(6.0, 80, 50)], min_flame_s=5.0), "no_ignition")

    def test_flame_found_just_before_the_end_is_not_no_ignition(self):
        self.assertEqual(label(59.5, None, True, 60.0, []), "cannot_tell")


class Quench(unittest.TestCase):
    def test_last_change_down(self):
        self.assertEqual(label(5.0, 50.0, False, 60.0, [(30.0, 80, 50)]), "quench")

    def test_gap_edge(self):
        self.assertEqual(label(5.0, 90.0, False, 100.0, [(30.0, 80, 50)]), "quench")
        self.assertEqual(label(5.0, 90.1, False, 100.0, [(30.0, 80, 50)]), "cannot_tell")

    def test_custom_gap(self):
        self.assertEqual(label(5.0, 50.0, False, 60.0, [(30.0, 80, 50)], max_gap_s=10.0), "cannot_tell")

    def test_later_change_decides(self):
        ch = [(20.0, 50, 80), (40.0, 80, 60)]
        self.assertEqual(label(5.0, 45.0, False, 60.0, ch), "quench")


class BlowOff(unittest.TestCase):
    def test_last_change_up(self):
        self.assertEqual(label(5.0, 33.0, False, 60.0, [(30.0, 50, 122)]), "blow_off")

    def test_later_change_decides(self):
        ch = [(20.0, 80, 50), (40.0, 50, 122)]
        self.assertEqual(label(5.0, 45.0, False, 60.0, ch), "blow_off")


class NoBlowOff(unittest.TestCase):
    def test_censored_after_rise(self):
        self.assertEqual(label(5.0, None, True, 60.0, [(30.0, 80, 122)]), "no_blow_off")

    def test_rise_before_ignition_does_not_count(self):
        self.assertEqual(label(5.0, None, True, 60.0, [(2.0, 80, 122)]), "cannot_tell")

    def test_censored_after_fall_only(self):
        self.assertEqual(label(5.0, None, True, 60.0, [(30.0, 80, 50)]), "cannot_tell")

    def test_censored_without_fan_change(self):
        self.assertEqual(label(5.0, None, True, 60.0, []), "cannot_tell")


class CannotTell(unittest.TestCase):
    def test_end_unknown(self):
        self.assertEqual(label(5.0, 50.0, False, None, [(30.0, 80, 50)]), "cannot_tell")

    def test_ignition_after_end(self):
        self.assertEqual(label(70.0, None, True, 60.0, []), "cannot_tell")

    def test_neither_extinction_nor_censored(self):
        self.assertEqual(label(5.0, None, False, 60.0, [(30.0, 80, 50)]), "cannot_tell")

    def test_extinction_without_fan_change(self):
        self.assertEqual(label(5.0, 50.0, False, 60.0, []), "cannot_tell")

    def test_fan_change_before_ignition_is_ignored(self):
        self.assertEqual(label(5.0, 50.0, False, 60.0, [(2.0, 80, 50)]), "cannot_tell")

    def test_fan_change_after_extinction_is_ignored(self):
        self.assertEqual(label(5.0, 50.0, False, 60.0, [(55.0, 50, 122)]), "cannot_tell")

    def test_extinction_close_to_end(self):
        ch = [(30.0, 80, 50)]
        self.assertEqual(label(5.0, 59.5, False, 60.0, ch), "cannot_tell")
        self.assertEqual(label(5.0, 59.0, False, 60.0, ch), "quench")

    def test_small_fan_change_ignored(self):
        self.assertEqual(label(5.0, 50.0, False, 60.0, [(30.0, 80, 79.5)]), "cannot_tell")
        self.assertEqual(label(5.0, 50.0, False, 60.0, [(30.0, 80, 79.0)]), "quench")

    def test_reason_is_always_given(self):
        out = classify_outcome(None, None, False, None, [])
        self.assertTrue(out.reason.strip())


class OutcomeCheckCsv(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(CSV_PATH, newline="", encoding="utf-8") as fh:
            reader = csv.reader(fh)
            cls.header = next(reader)
        with open(CSV_PATH, newline="", encoding="utf-8") as fh:
            cls.rows = list(csv.DictReader(fh))

    def test_exact_header(self):
        self.assertEqual(self.header, HEADER)

    def test_one_row_per_published_test(self):
        ids = [r["test_id"] for r in self.rows]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(ids), 12)

    def test_ids_look_right(self):
        for r in self.rows:
            self.assertRegex(r["test_id"], r"^PSI-25/T[0-9]+$")

    def test_values_are_in_the_allowed_sets(self):
        for r in self.rows:
            self.assertIn(r["agreement"], ("yes", "no", "cannot_tell"), r["test_id"])
            self.assertIn(r["measured_outcome"], LABELS, r["test_id"])
            self.assertIn(r["published_outcome"], MAPPING, r["test_id"])
            self.assertIn("Table 7.1", r["published_source"], r["test_id"])
            self.assertIn(r["censored"], ("yes", "no", ""), r["test_id"])

    def test_agreement_matches_the_labels(self):
        for r in self.rows:
            measured = r["measured_outcome"]
            if measured == "cannot_tell":
                want = "cannot_tell"
            elif MAPPING[r["published_outcome"]] == measured:
                want = "yes"
            else:
                want = "no"
            self.assertEqual(r["agreement"], want, r["test_id"])

    def test_every_row_has_a_reason_and_a_viewer(self):
        for r in self.rows:
            self.assertTrue(r["reason"].strip(), r["test_id"])
            self.assertTrue(r["viewed_by"].startswith("SI (Claude Sonnet)"), r["test_id"])

    def test_published_words_match_published_csv(self):
        pub = Path(CSV_PATH).with_name("published.csv")
        with open(pub, newline="", encoding="utf-8") as fh:
            known = {
                r["test_ids"]: r["value"]
                for r in csv.DictReader(fh)
                if r["quantity"] == "outcome" and r["test_ids"].startswith("PSI-25/T")
            }
        self.assertEqual({r["test_id"]: r["published_outcome"] for r in self.rows}, known)

    def test_no_word_a_judge_should_not_read(self):
        text = CSV_PATH.read_text(encoding="utf-8").lower()
        for word in ("recovered", "discover", "prove", "missing"):
            self.assertNotIn(word, text)


if __name__ == "__main__":
    unittest.main()
