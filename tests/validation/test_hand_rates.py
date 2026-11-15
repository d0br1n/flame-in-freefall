"""Tests for pipeline/video_to_data/hand_rates.py (Linear DOB-43): hand-measured rates.

All series are synthetic and written to a temporary folder, so nothing needs data/raw or
the pipeline's output. No test is skipped or expected to fail.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import tempfile
import unittest
from pathlib import Path

import numpy as np

from pipeline.video_to_data import hand_rates

N_BOOT = 100  # fewer resamples than the default, to keep the file fast


def write_series(folder: Path, name: str, speed_mm_s: float, *, seconds=30, step=1.0, noise=0.2,
                 seed=1, x0=5.0, header="time_s,position_mm") -> Path:
    rng = np.random.default_rng(seed)
    t = np.arange(0.0, seconds, step)
    x = x0 + speed_mm_s * t + rng.normal(0, noise, size=t.size)
    path = folder / name
    path.write_text(header + "\n" + "\n".join(f"{a:.3f},{b:.3f}" for a, b in zip(t, x)) + "\n")
    return path


def write_px(folder: Path, name: str, speed_px: float, *, seconds=30, step=1.0, noise=0.5, seed=1, ppm=None) -> Path:
    """A pixel file (position_px), plus position_mm when a real scale `ppm` (px per mm) is given."""
    rng = np.random.default_rng(seed)
    t = np.arange(0.0, seconds, step)
    x = 40.0 + speed_px * t + rng.normal(0, noise, size=t.size)
    header = "time_s,position_px" + (",position_mm" if ppm else "")
    rows = [f"{a:.3f},{b:.2f}" + (f",{b / ppm:.3f}" if ppm else "") for a, b in zip(t, x)]
    path = folder / name
    path.write_text(header + "\n" + "\n".join(rows) + "\n")
    return path


class HandRates(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_rate_close_to_the_true_speed_and_labelled_hand_measured(self):
        path = write_series(self.dir, "B1_DG.csv", 2.2)
        r = hand_rates.rate_for_file(path, n_boot=N_BOOT)
        self.assertEqual(r["test_id"], "PSI-25/B1")
        self.assertEqual(r["who"], "DG")
        self.assertEqual(r["provenance"], "HAND_MEASURED")
        self.assertAlmostEqual(r["rate_mm_s"], 2.2, delta=0.1)
        self.assertLessEqual(r["ci_low"], r["rate_mm_s"])
        self.assertGreaterEqual(r["ci_high"], r["rate_mm_s"])
        self.assertIn("hand_calibration_uncertainty_not_included", r["flags"])
        self.assertNotIn("no_scale", r["flags"])

    def test_file_name_must_carry_test_and_initials(self):
        for bad in ("B1.csv", "rates.csv", "B1_D.csv", "b1_DG.csv", "B1_DG_extra.csv"):
            with self.assertRaises(hand_rates.HandFileError, msg=bad):
                hand_rates.parse_name(Path(bad))

    def test_missing_column_is_rejected(self):
        path = write_series(self.dir, "B1_DG.csv", 2.0, header="time_s,pos")
        with self.assertRaisesRegex(hand_rates.HandFileError, "missing column"):
            hand_rates.read_hand_file(path)

    def test_non_numbers_and_empty_cells_are_rejected(self):
        path = self.dir / "B1_DG.csv"
        path.write_text("time_s,position_mm\n0,1\n1,\n2,3\n")
        with self.assertRaisesRegex(hand_rates.HandFileError, "line 3"):
            hand_rates.read_hand_file(path)

    def test_time_going_backwards_is_rejected(self):
        path = self.dir / "B1_DG.csv"
        path.write_text("time_s,position_mm\n0,1\n2,3\n1,4\n")
        with self.assertRaisesRegex(hand_rates.HandFileError, "increase"):
            hand_rates.read_hand_file(path)

    def test_too_few_points_are_flagged_and_never_dropped(self):
        path = write_series(self.dir, "B3_AB.csv", 2.0, seconds=5)
        r = hand_rates.rate_for_file(path, n_boot=N_BOOT)
        self.assertIn("fewer_than_10_points", r["flags"])
        self.assertEqual(r["n_marked"], 5)

    def test_two_people_who_agree(self):
        write_series(self.dir, "B1_AB.csv", 2.2, seed=1)
        write_series(self.dir, "B1_DG.csv", 2.3, seed=2)
        result = hand_rates.agreement(hand_rates.rates_in(self.dir, n_boot=N_BOOT))
        self.assertEqual(result["summary"]["pairs"], 1)
        self.assertEqual(result["summary"]["agreeing"], 1)
        pair = result["pairs"][0]
        self.assertEqual(pair["people"], ["AB", "DG"])
        self.assertLess(pair["relative_difference"], 0.15)

    def test_two_people_who_disagree_are_reported_not_hidden(self):
        write_series(self.dir, "B4_AB.csv", 1.0, seed=1)
        write_series(self.dir, "B4_DG.csv", 2.0, seed=2)
        result = hand_rates.agreement(hand_rates.rates_in(self.dir, n_boot=N_BOOT))
        self.assertEqual(result["summary"]["agreeing"], 0)
        self.assertFalse(result["pairs"][0]["agree"])
        self.assertGreater(result["pairs"][0]["relative_difference"], 0.4)

    def test_a_video_with_one_person_is_counted_but_not_scored(self):
        write_series(self.dir, "B1_AB.csv", 2.2)
        write_series(self.dir, "B3_AB.csv", 2.1)
        write_series(self.dir, "B3_DG.csv", 2.1, seed=3)
        result = hand_rates.agreement(hand_rates.rates_in(self.dir, n_boot=N_BOOT))
        self.assertEqual(result["summary"]["pairs"], 1)
        self.assertEqual(result["summary"]["videos_with_one_person"], 1)

    def test_summary_file_and_unrelated_csv_are_skipped(self):
        write_series(self.dir, "B1_AB.csv", 2.2)
        (self.dir / "hand_rates.csv").write_text("test_id\n")
        (self.dir / "notes.csv").write_text("a,b\n")
        rates = hand_rates.rates_in(self.dir, n_boot=N_BOOT)
        self.assertEqual([r["file"] for r in rates], ["B1_AB.csv"])

    def test_pixel_only_file_gives_a_px_rate_and_no_mm_rate(self):
        r = hand_rates.rate_for_file(write_px(self.dir, "B1_DG.csv", 22.0), n_boot=N_BOOT)
        self.assertAlmostEqual(r["rate_px_s"], 22.0, delta=0.6)
        self.assertIsNone(r["rate_mm_s"])
        self.assertIn("no_scale", r["flags"])
        self.assertNotIn("hand_calibration_uncertainty_not_included", r["flags"])
        self.assertEqual(r["provenance"], "HAND_MEASURED")

    def test_file_with_both_columns_gives_both_rates(self):
        r = hand_rates.rate_for_file(write_px(self.dir, "B1_DG.csv", 22.0, ppm=10.0), n_boot=N_BOOT)
        self.assertAlmostEqual(r["rate_px_s"], 22.0, delta=0.6)
        self.assertAlmostEqual(r["rate_mm_s"], 2.2, delta=0.06)
        self.assertIn("hand_calibration_uncertainty_not_included", r["flags"])
        self.assertNotIn("no_scale", r["flags"])

    def test_millimetre_only_file_has_no_px_rate(self):
        r = hand_rates.rate_for_file(write_series(self.dir, "B1_DG.csv", 2.2), n_boot=N_BOOT)
        self.assertIsNone(r["rate_px_s"])
        self.assertAlmostEqual(r["rate_mm_s"], 2.2, delta=0.1)

    def test_a_file_with_no_position_column_is_rejected(self):
        path = write_series(self.dir, "B1_DG.csv", 2.0, header="time_s,x")
        with self.assertRaisesRegex(hand_rates.HandFileError, "missing column"):
            hand_rates.read_hand_file(path)

    def test_pixel_agreement_between_two_people(self):
        write_px(self.dir, "B1_AB.csv", 22.0, seed=1)
        write_px(self.dir, "B1_DG.csv", 24.0, seed=2)
        rates = hand_rates.rates_in(self.dir, n_boot=N_BOOT)
        px = hand_rates.agreement(rates, quantity="rate_px_s")
        self.assertEqual(px["summary"]["pairs"], 1)
        self.assertEqual(px["summary"]["agreeing"], 1)
        self.assertEqual(px["summary"]["quantity"], "rate_px_s")
        self.assertEqual(hand_rates.agreement(rates)["summary"]["pairs"], 0)  # nobody has mm

    def test_mixed_files_agree_in_px_but_not_in_mm(self):
        write_px(self.dir, "B3_AB.csv", 22.0, seed=1, ppm=10.0)  # has both columns
        write_px(self.dir, "B3_DG.csv", 23.0, seed=2)  # pixels only
        rates = hand_rates.rates_in(self.dir, n_boot=N_BOOT)
        self.assertEqual(hand_rates.agreement(rates, quantity="rate_px_s")["summary"]["pairs"], 1)
        mm = hand_rates.agreement(rates, quantity="rate_mm_s")["summary"]
        self.assertEqual(mm["pairs"], 0)
        self.assertEqual(mm["videos_with_one_person"], 1)

    def test_si_draft_files_are_labelled_si_extracted_and_never_agree_with_people(self):
        write_px(self.dir, "B1_SI.csv", 22.0, seed=1)
        write_px(self.dir, "B1_DG.csv", 22.5, seed=2)
        rates = {r["who"]: r for r in hand_rates.rates_in(self.dir, n_boot=N_BOOT)}
        self.assertEqual(rates["SI"]["provenance"], "SI_EXTRACTED")
        self.assertEqual(rates["DG"]["provenance"], "HAND_MEASURED")
        px = hand_rates.agreement(list(rates.values()), quantity="rate_px_s")["summary"]
        self.assertEqual(px["pairs"], 0)          # one person plus the SI draft is not two people
        self.assertEqual(px["videos_with_one_person"], 1)

    def test_the_module_does_not_read_the_pipeline_output(self):
        source = Path(hand_rates.__file__).read_text()
        code = "\n".join(l for l in source.splitlines() if not l.lstrip().startswith("#"))
        # Only the docstring and comments may mention the output files; the code must not open them.
        self.assertNotIn("data/modules", code.split('"""', 2)[-1])
        self.assertNotIn("results.csv", code.split('"""', 2)[-1])
        self.assertNotIn("findings.json", code.split('"""', 2)[-1])


if __name__ == "__main__":
    unittest.main()


class HandChecked(unittest.TestCase):
    def test_si_rows_carry_the_hand_checked_flag_and_people_rows_do_not(self):
        import tempfile, pathlib
        rows = "time_s,position_px\n" + "\n".join(f"{t},{100 + 5 * t}" for t in range(12)) + "\n"
        with tempfile.TemporaryDirectory() as d:
            si, person = pathlib.Path(d, "B1_SI.csv"), pathlib.Path(d, "B1_AB.csv")
            si.write_text(rows); person.write_text(rows)
            self.assertIn(hand_rates.HAND_CHECKED_FLAG, hand_rates.rate_for_file(si, n_boot=20)["flags"])
            self.assertNotIn(hand_rates.HAND_CHECKED_FLAG, hand_rates.rate_for_file(person, n_boot=20)["flags"])
