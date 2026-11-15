"""Checks on the person's check of the T-series grades and the brightened review clips.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.video_to_data import grades, review_clip, run  # noqa: E402
from tests.video_to_data.test_run import t_rows  # noqa: E402

CHECKED = ROOT / "pipeline" / "video_to_data" / "t_series_checked.csv"


def crow(test, grade, seen="", gone="", note=""):
    return {"test": test, "checked_by": "P", "checked_date": "2026-11-15", "checked_grade": grade,
            "checked_flame_seen_from_s": seen, "checked_flame_gone_s": gone, "checked_note": note}


class TestBrighten(unittest.TestCase):
    def test_rows_above_90_unchanged_and_below_times_six_clipped(self):
        f = np.zeros((100, 4, 3), np.uint8)
        f[:] = 10
        f[95, 0] = 50
        out = review_clip.brighten(f)
        self.assertTrue((out[:90] == 10).all())
        self.assertTrue((out[90:95] == 60).all())
        self.assertTrue((out[95, 0] == 255).all())
        self.assertEqual(f[95, 0, 0], 50)  # input not changed

    def test_label_and_speed_text(self):
        self.assertEqual(review_clip.label_text("T4"), "NASA PSI-25 T4, brightened x6")
        self.assertIn("x4 speed", review_clip.label_text("T4", 4.0))

    def test_attempts_lower_quality_before_speed(self):
        a = review_clip.attempts()
        first_fast = next(i for i, x in enumerate(a) if x[2] != 1.0)
        self.assertTrue(all(x[2] == 1.0 for x in a[:first_fast]))
        self.assertEqual(a[0], (1.0, 26, 1.0))

    def test_clip_range_cuts_only_interlaced_video(self):
        self.assertEqual(review_clip.clip_range(664.58, True), (0.0, 135.0))
        self.assertEqual(review_clip.clip_range(63.76, False), (0.0, 63.76))
        self.assertEqual(review_clip.clip_range(100.0, True), (0.0, 100.0))

    def test_label_is_drawn_below_row_90(self):
        f = np.zeros((200, 700, 3), np.uint8)
        out = review_clip.draw_label(f, "x", 90)
        self.assertEqual(int(out[:90].sum()), 0)


class TestChecked(unittest.TestCase):
    def rows(self):
        return t_rows(("yes", "undecided", "yes"), with_t20=False)  # T4, T5, T6

    def test_agreement_rules(self):
        self.assertEqual(grades.agrees_with_si("quenched", "quenched"), "yes")
        self.assertEqual(grades.agrees_with_si("quenched", "blow_off"), "no")
        self.assertEqual(grades.agrees_with_si("cannot_tell", "no_ignition"), "decided")

    def test_leading_number(self):
        self.assertEqual(grades.leading_number("~13"), 13.0)
        self.assertEqual(grades.leading_number("2-5"), 2.0)
        self.assertEqual(grades.leading_number("5.5"), 5.5)
        self.assertIsNone(grades.leading_number(""))

    def test_build_checked_joins_and_compares(self):
        got = grades.build_checked([crow("T5", "quenched", "6", "20"), crow("T4", "quenched"),
                                    crow("T99", "quenched")], self.rows())
        self.assertEqual([r["test"] for r in got], ["T4", "T5"])
        self.assertEqual(got[1]["agrees_with_si"], "decided")
        self.assertEqual(got[1]["match"], "yes")
        self.assertEqual(got[1]["flame_seen_from_s"], 6.0)
        self.assertIsNone(got[0]["flame_gone_s"])

    def test_unknown_checked_grade_is_an_error(self):
        with self.assertRaises(ValueError):
            grades.build_checked([crow("T4", "burned")], self.rows())

    def test_evidence_records(self):
        chk = grades.build_checked([crow("T4", "quenched", "5.5", "15", "n"),
                                    crow("T5", "no_ignition")], self.rows())
        recs = run.build_t_checked_evidence(chk, {"T4": "PSI-25_T4_review.mp4"},
                                            {"T4": "PSI-25_T4_readout.csv"})
        q = [(r["id"], r["quantity"]) for r in recs]
        self.assertEqual(q, [("ev-T4-checked-grade", "outcome_checked_by_person"),
                             ("ev-T4-checked-seen", "flame_seen_time_checked"),
                             ("ev-T4-checked-gone", "flame_gone_time_checked"),
                             ("ev-T5-checked-grade", "outcome_checked_by_person")])
        g = recs[0]
        self.assertEqual((g["provenance"], g["value"], g["unit"], g["n"]),
                         ("HAND_MEASURED", "quenched", "", 1))
        self.assertEqual(g["flags"], ["person_viewed", "one_person"])
        self.assertEqual(g["assets"], ["PSI-25_T4_readout.csv", "PSI-25_T4_review.mp4"])
        self.assertEqual(g["conditions"]["agrees_with_si"], "yes")
        self.assertEqual(g["conditions"]["saw_nasa_outcome_before_grading"],
                         "no, as stated by the checker")
        self.assertEqual(g["conditions"]["si_grade"], "quenched")
        self.assertEqual(recs[1]["unit"], "s")
        self.assertEqual(recs[1]["flags"], ["person_viewed", "one_person", "approximate"])
        self.assertNotIn("assets", recs[3])
        run.check_unique(recs)

    def test_finding_counts_from_the_rows(self):
        rows = self.rows()
        chk = grades.build_checked([crow("T4", "quenched"), crow("T5", "no_ignition"),
                                    crow("T6", "blow_off")], rows)
        recs = run.build_t_checked_evidence(chk, {}, {})
        f = run.t_series_person_check(chk, recs)
        self.assertEqual(f["id"], "find-t-series-person-check")
        self.assertEqual((f["value"], f["n"], f["kind"], f["provenance"]),
                         (1, 3, "check", "HAND_MEASURED"))
        self.assertFalse(f["passed"])  # T6 blow_off contradicts NASA's quenched
        self.assertIn("3 of the SI grades", f["text"])
        self.assertIn("One team member", f["text"])
        self.assertIn("brightened x6", f["text"])
        self.assertIn("without looking at NASA's outcomes", f["text"])
        self.assertIn("not supervised", f["text"])
        self.assertNotIn("blind", f["text"])
        self.assertIn("T5 as no ignition", f["text"])
        self.assertIsNone(run.t_series_person_check([], []))

    def test_committed_checks_give_the_expected_counts(self):
        grade_rows = grades.read_csv(run.ENGINE_DIR / "t_series_grades.csv")
        chk = grades.build_checked(grades.read_csv(CHECKED), grade_rows)
        self.assertEqual(len(chk), 11)
        self.assertEqual(sum(r["agrees_with_si"] == "yes" for r in chk), 10)
        self.assertEqual([r["test"] for r in chk if r["agrees_with_si"] == "decided"], ["T12"])
        self.assertEqual(sum(r["agrees_with_si"] == "no" for r in chk), 0)
        self.assertEqual(sum(r["match"] == "yes" for r in chk), 11)
        self.assertTrue(all(r["by"] == "Dobrin Alexandru" and r["date"] == "2026-11-15"
                            for r in chk))
        f = run.t_series_person_check(chk, run.build_t_checked_evidence(chk, {}, {}))
        self.assertTrue(f["passed"])
        self.assertEqual((f["value"], f["n"]), (11, 11))

    def test_index_block_gains_the_contract_keys(self):
        rows = t_rows()  # T4, T5, T6, T20
        graded, published = run.build_t_evidence(rows)
        chk = grades.build_checked([crow("T4", "quenched", "5.5", "15")], rows)
        clips = {"T4": {"file": "PSI-25_T4_review.mp4", "start_s": 0.0, "end_s": 9.0,
                        "speed": 1.0, "gain": 6}}
        block = run.build_t_index(rows, graded, published, chk, clips, {"T4": "PSI-25_T4_readout.csv"})
        self.assertEqual(block["checked_by"], "P, viewing brightened video, 2026-11-15")
        self.assertIn("not supervised", block["check_note"])
        self.assertIn("without looking at NASA's outcomes", block["check_note"])
        self.assertNotIn("blind", block["check_note"])
        t4, t5, t20 = block["tests"][0], block["tests"][1], block["tests"][3]
        self.assertEqual(t4["si_times"], {"wire_glow_s": None, "flame_seen_from_s": 5.5,
                                          "flame_gone_s": 13.0})
        self.assertEqual(t4["checked"]["evidence_id"], "ev-T4-checked-grade")
        self.assertEqual(t4["checked"]["match"], "yes")
        self.assertEqual(t4["checked"]["agrees_with_si"], "yes")
        self.assertEqual(t4["clip"], clips["T4"])
        self.assertEqual(t4["readout"], "PSI-25_T4_readout.csv")
        self.assertIsNone(t5["checked"])
        self.assertIsNone(t5["clip"])
        self.assertIsNone(t5["readout"])
        self.assertIsNone(t20["checked"])
        old = run.build_t_index(rows, graded, published)
        self.assertIsNone(old["checked_by"])
        self.assertEqual(old["tests"][0]["si_grade"], "quenched")


class TestRunPieces(unittest.TestCase):
    def test_t_review_assets_without_the_video_give_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            clips, readouts = run.write_t_review(t_rows(), Path(tmp) / "none", Path(tmp),
                                                 lambda *a, **k: self.fail("no video"),
                                                 lambda *a: self.fail("no video"))
        self.assertEqual((clips, readouts), ({}, {}))

    def test_t_review_assets_with_stubs_and_an_unreadable_readout(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            vids = tmp / "v"
            vids.mkdir()
            rows = t_rows(("yes", "yes"), with_t20=False)  # T4, T5
            for r in rows:
                (vids / r["file_name"]).write_bytes(b"x")

            def clipper(video, path, test):
                Path(path).write_bytes(b"clip")
                return {"file": Path(path).name, "start_s": 1.0, "end_s": 2.0, "speed": 1.0,
                        "gain": 6}

            def reader(video, end):
                if "T5" in str(video):
                    return [{"time_s": 1.0, "fuel": None, "fan": None, "air": None,
                             "rad": None, "clock_s": None}]
                return [{"time_s": t, "fuel": 1, "fan": 80, "air": 5, "rad": 0.1, "clock_s": t}
                        for t in (0.0, 1.0, 1.5, 3.0)]
            clips, readouts = run.write_t_review(rows, vids, tmp, clipper, reader)
            self.assertEqual(sorted(clips), ["T4", "T5"])
            self.assertEqual(readouts, {"T4": "PSI-25_T4_readout.csv"})  # T5 unreadable: none
            text = (tmp / "PSI-25_T4_readout.csv").read_text().splitlines()
            self.assertEqual(text[0], "time_s,fuel,fan,air,rad,clock_s")
            self.assertEqual(len(text), 3)  # only the rows from 1.0 to 2.0 s
            self.assertFalse((tmp / "PSI-25_T5_readout.csv").exists())


if __name__ == "__main__":
    unittest.main()
