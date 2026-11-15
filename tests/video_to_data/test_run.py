"""Checks on pipeline/video_to_data/run.py: assembly of the hand-over folder (Linear DOB-41).

The assembly functions take already measured values, so almost every test here needs no video.
One end-to-end test writes a tiny synthetic video with OpenCV, runs the whole command on it
into a temporary folder with a temporary config and manifest, and validates the result with
contracts/validate.py. The overlay clip encoder (ffmpeg) is replaced there by a stub; its command
line is checked separately with a stand-in for subprocess.run.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from contracts import validate  # noqa: E402
from pipeline.video_to_data import run  # noqa: E402

BANNED = ("recovered", "discover", "prove", "first", "missing")
MANIFEST_ROW = {
    "file_name": "v_B1.mp4", "test_id": "PSI-25/B1", "sample": "147", "view": "main",
    "is_still_sequence": "false", "material_text": "100 micron PMMA film 2 cm wide",
    "thickness_mm": "0.1", "width_mm": "20", "o2_initial_pct": "22.2", "o2_final_pct": "22.2",
    "fan_display": "62", "air_display": "5", "flow_restrictor": "2",
}


def events_dict(ignition=10.0, extinction=30.0, censored=False, flags=None, outcome=None):
    return {"ignition_time_s": ignition,
            "extinction_time_s": None if censored else extinction,
            "burn_duration_s": None if censored else extinction - ignition,
            "censored": censored, "outcome": outcome or ("censored" if censored else "unclassified"),
            "flags": list(flags or [])}


def fit_dict(rate=5.0, flags=None):
    if rate is None:
        return {"rate": None, "unit": "px/s", "flags": ["no_scale", "insufficient_data"]}
    return {"rate": rate, "unit": "px/s", "ci_low": rate - 0.1, "ci_high": rate + 0.1,
            "ci_method": "moving-block bootstrap", "window_start_s": 12.0, "window_end_s": 28.0,
            "n_points": 80, "travel": 80.0, "seed": 0, "flags": ["no_scale"] + list(flags or [])}


def measurement(test_id="PSI-25/B1", file_name="v_B1.mp4", **kw):
    return {"test_id": test_id, "file_name": file_name, "direction": 1, "axis": "x",
            "manifest_row": dict(MANIFEST_ROW, test_id=test_id, file_name=file_name),
            "events": kw.get("events", events_dict()), "fit": kw.get("fit", fit_dict()),
            "n_samples": 200}


def by_quantity(records):
    return {r["quantity"]: r for r in records}


class TestEvidence(unittest.TestCase):
    def test_normal_test_has_every_quantity_and_the_contract_fields(self):
        recs = by_quantity(run.build_evidence(measurement()))
        self.assertEqual(set(recs), {"ignition_time", "extinction_time", "burn_duration",
                                     "outcome", "spread_rate", "leading_edge_travel"})
        for rec in recs.values():
            self.assertEqual(rec["test_id"], "PSI-25/B1")
            self.assertEqual(rec["module"], "video-to-data")
            self.assertEqual(rec["provenance"], "VIDEO_MEASURED")
            self.assertEqual(rec["source"], {"psi_id": "PSI-25", "file": "v_B1.mp4",
                                             "link": "https://psi.nasa.gov"})
            self.assertEqual(rec["n"], 200 if rec["quantity"] in
                             {"ignition_time", "extinction_time", "burn_duration", "outcome"} else 80)
            self.assertEqual(rec["assets"], run.asset_list("PSI-25/B1"))
            self.assertNotIn("example", rec["flags"])
        self.assertEqual(recs["outcome"]["value"], "unclassified")
        self.assertEqual(recs["outcome"]["unit"], "")
        rate = recs["spread_rate"]
        self.assertEqual((rate["value"], rate["unit"]), (5.0, "px/s"))
        self.assertIn("no_scale", rate["flags"])
        self.assertEqual(rate["uncertainty"]["interval"], [4.9, 5.1])
        self.assertIn("steady window 12.00 to 28.00 s", rate["uncertainty"]["method"])
        self.assertEqual(recs["leading_edge_travel"]["unit"], "px")

    def test_conditions_keep_the_tables_text_for_fan_and_air(self):
        cond = run.build_evidence(measurement())[0]["conditions"]
        self.assertEqual(cond["fan_display"], "62")
        self.assertEqual(cond["air_display"], "5")
        self.assertEqual(cond["flow_restrictor"], "2")
        self.assertEqual(cond["thickness_mm"], 0.1)
        self.assertEqual(cond["material_text"], "100 micron PMMA film 2 cm wide")

    def test_censored_test_has_no_extinction_or_burn_duration(self):
        recs = by_quantity(run.build_evidence(measurement(events=events_dict(censored=True))))
        self.assertNotIn("extinction_time", recs)
        self.assertNotIn("burn_duration", recs)
        self.assertEqual(recs["outcome"]["value"], "censored")
        self.assertIn("ignition_time", recs)

    def test_event_and_fit_flags_are_kept_and_example_never_appears(self):
        m = measurement(events=events_dict(flags=["reignition", "example"]),
                        fit=fit_dict(flags=["short_window"]))
        recs = by_quantity(run.build_evidence(m))
        self.assertEqual(recs["spread_rate"]["flags"], ["no_scale", "reignition", "short_window"])
        self.assertEqual(recs["ignition_time"]["flags"], ["reignition"])
        for rec in recs.values():
            self.assertNotIn("example", rec["flags"])

    def test_no_rate_leaves_out_rate_and_travel_and_flags_the_outcome(self):
        recs = by_quantity(run.build_evidence(measurement(fit=fit_dict(rate=None))))
        self.assertNotIn("spread_rate", recs)
        self.assertNotIn("leading_edge_travel", recs)
        self.assertIn("insufficient_data", recs["outcome"]["flags"])

    def test_evidence_records_have_no_extra_keys(self):
        allowed = {"id", "module", "test_id", "segment", "quantity", "value", "unit",
                   "uncertainty", "n", "conditions", "provenance", "source", "reference",
                   "assets", "flags"}
        for rec in run.build_evidence(measurement()):
            self.assertLessEqual(set(rec), allowed)


class TestPublished(unittest.TestCase):
    ROWS = [
        {"row_id": "PUB-01", "test_ids": "PSI-25/B1", "quantity": "steady_spread_rate",
         "value": "2.2", "unit": "mm/s", "match": "inferred", "page_printed": "13",
         "table_or_figure": "text, Section 2.1.2.1",
         "source_document": "NASA/TM (PSI-25_Reports_BASS-II Summary Report.pdf)"},
        {"row_id": "PUB-12", "test_ids": "PSI-25/B1", "quantity": "outcome",
         "value": "ignited, extinguished very quickly", "unit": "", "match": "named in report",
         "page_printed": "103", "table_or_figure": "Table A.1",
         "source_document": "NASA/TM (PSI-25_Reports_BASS-II Summary Report.pdf)"},
        {"row_id": "PUB-02", "test_ids": "", "quantity": "highest_spread_rate", "value": "2.2",
         "unit": "mm/s", "match": "group", "page_printed": "40", "table_or_figure": "",
         "source_document": "x (PSI-25_Reports_BASS-II Summary Report.pdf)"},
        {"row_id": "PUB-13", "test_ids": "PSI-25/B4", "quantity": "outcome", "value": "note",
         "unit": "", "match": "named in report", "page_printed": "104", "table_or_figure": "",
         "source_document": "x (PSI-25_Reports_BASS-II Summary Report.pdf)"},
        {"row_id": "PUB-16", "test_ids": "PSI-25/B1;PSI-25/B3", "quantity": "figure_caption_tests",
         "value": "caption", "unit": "", "match": "", "page_printed": "", "table_or_figure": "",
         "source_document": "x (PSI-25_Reports_BASS-II Summary Report.pdf)"},
    ]

    def test_only_rows_tied_to_one_measured_test(self):
        recs = run.build_published(["PSI-25/B1"], self.ROWS)
        self.assertEqual({r["id"] for r in recs}, {"ev-B1-PUB-01", "ev-B1-PUB-12"})

    def test_number_text_and_flags(self):
        recs = {r["quantity"]: r for r in run.build_published(["PSI-25/B1"], self.ROWS)}
        rate = recs["published_spread_rate"]
        self.assertEqual((rate["value"], rate["unit"], rate["provenance"]), (2.2, "mm/s", "PUBLISHED"))
        self.assertEqual(rate["flags"], ["match_inferred"])
        self.assertEqual(rate["source"]["file"], "PSI-25_Reports_BASS-II Summary Report.pdf")
        self.assertEqual(rate["conditions"]["page_printed"], 13)
        note = recs["published_outcome_note"]
        self.assertEqual((note["value"], note["unit"], note["flags"]),
                         ("ignited, extinguished very quickly", "", []))

    def test_no_measured_test_gives_no_published_record(self):
        self.assertEqual(run.build_published([], self.ROWS), [])

    def test_quantity_names_differ_from_measured_ones_and_keys_are_unique(self):
        evidence = run.build_evidence(measurement()) + run.build_published(["PSI-25/B1"], self.ROWS)
        run.check_unique(evidence)
        measured = {r["quantity"] for r in evidence if r["provenance"] == "VIDEO_MEASURED"}
        published = {r["quantity"] for r in evidence if r["provenance"] == "PUBLISHED"}
        self.assertFalse(measured & published)

    def test_duplicate_key_is_refused(self):
        recs = run.build_evidence(measurement())
        with self.assertRaises(ValueError):
            run.check_unique(recs + [dict(recs[0], id="other")])


class TestOrderingAndTables(unittest.TestCase):
    def test_evidence_sorts_tests_naturally_and_is_stable(self):
        recs = []
        for tid in ("PSI-25/B10", "PSI-25/B2", "PSI-25/B1"):
            recs += run.build_evidence(measurement(test_id=tid))
        recs += run.build_published(["PSI-25/B1"], TestPublished.ROWS)
        a = run.sort_evidence(recs)
        b = run.sort_evidence(list(reversed(recs)))
        self.assertEqual(a, b)
        self.assertEqual([r["test_id"] for r in a if r["quantity"] == "outcome"],
                         ["PSI-25/B1", "PSI-25/B2", "PSI-25/B10"])
        self.assertEqual(run.dumps_json(a), run.dumps_json(b))

    def test_results_row_has_exactly_the_scaffold_columns(self):
        row = run.build_results_row(measurement())
        self.assertEqual(list(row), run.RESULTS_COLUMNS)
        self.assertEqual(row["segment"], "whole")
        self.assertEqual(row["rate_unit"], "px/s")
        self.assertEqual((row["published_value"], row["signed_error"], row["pixel_scale_px_per_mm"]),
                         ("", "", ""))
        self.assertEqual(row["flow_direction"], "+x")
        self.assertEqual(row["flags"], "no_scale")

    def test_results_row_of_a_censored_test_has_no_extinction(self):
        row = run.build_results_row(measurement(events=events_dict(censored=True)))
        self.assertEqual(row["extinction_time_s"], "")
        self.assertEqual(row["outcome"], "censored")

    def test_curve_rows_use_leading_edge_for_the_direction(self):
        rows = [{"time_s": 1.0, "edge_min_px": 10.0, "edge_max_px": 50.0, "area_px": 7},
                {"time_s": 1.2, "edge_min_px": None, "edge_max_px": None, "area_px": 0}]
        plus = run.curve_rows(rows, 1)
        minus = run.curve_rows(rows, -1)
        self.assertEqual(plus[0]["leading_edge_px"], "50.00")
        self.assertEqual(minus[0]["leading_edge_px"], "10.00")
        self.assertEqual(plus[1]["leading_edge_px"], "")

    def test_asset_names_use_underscore_for_slash(self):
        names = run.asset_names("PSI-25/B1")
        self.assertEqual(names["kymograph"], "PSI-25_B1_kymograph.png")
        self.assertEqual(names["clip"], "PSI-25_B1_overlay.mp4")
        self.assertEqual(len(run.asset_list("PSI-25/B1")), 8)
        self.assertEqual(names["steps"], "PSI-25_B1_steps.jpg")
        self.assertEqual(names["readout"], "PSI-25_B1_readout.csv")


class TestFindings(unittest.TestCase):
    def setUp(self):
        self.ms = [measurement("PSI-25/B1"), measurement("PSI-25/B2", events=events_dict(censored=True)),
                   measurement("PSI-25/B3")]
        self.evidence = [r for m in self.ms for r in run.build_evidence(m)]
        self.findings = {f["id"]: f for f in run.build_findings(self.ms, 22, self.evidence)}

    def test_counts(self):
        head = self.findings["find-tests-measured"]
        self.assertEqual((head["value"], head["kind"]), (3, "headline"))
        self.assertIn("3 of the 22 B-series tests", head["text"])
        self.assertIn("PSI-25 videos only", head["text"])
        second = self.findings["find-ended-before-video-end"]
        self.assertEqual(second["value"], 2)
        self.assertIn("2 went out before the video ended and 1 were still burning", second["text"])

    def test_hand_check_is_never_passed_and_is_hand_measured(self):
        check = self.findings["find-example-tracker-vs-hand"]
        self.assertEqual((check["kind"], check["passed"], check["provenance"]),
                         ("check", False, "HAND_MEASURED"))
        self.assertIn("tracker against hand measurement", check["text"].lower())
        self.assertIn("no hand measurement has been made yet", check["text"])
        self.assertIn("zero hand measurements exist", check["text"])
        self.assertEqual((check["value"], check["n"]), (0, 1))
        self.assertEqual(sum(1 for f in self.findings.values() if f["kind"] == "check"), 1)

    def test_evidence_ids_exist(self):
        ids = {r["id"] for r in self.evidence}
        for f in self.findings.values():
            for ev_id in f.get("evidence_ids", []):
                self.assertIn(ev_id, ids)

    def test_no_banned_wording(self):
        for f in self.findings.values():
            for word in BANNED:
                self.assertNotIn(word, f["text"].lower().replace("provenance", ""))


class TestConfigAndNotMeasurable(unittest.TestCase):
    def test_config_by_column_name_with_old_short_header(self):
        rows = [{"file_name": "a.mp4", "test_id": "PSI-25/B1", "axis": "x", "direction": "1",
                 "track_start_s": "11", "pre_ignition_start_s": "11", "pre_ignition_end_s": "21",
                 "igniter_box": "", "roi": "", "viewed_by": "x", "notes": "y"},
                {"file_name": "b.mp4", "test_id": "", "axis": "x"},
                {"file_name": "c.mp4", "test_id": "PSI-25/B2", "igniter_box": "1,2,3,4"}]
        usable, skipped = run.parse_config(rows)
        self.assertEqual([c["test_id"] for c in usable], ["PSI-25/B1", "PSI-25/B2"])
        self.assertEqual(usable[0]["track_start_s"], 11.0)
        self.assertEqual(usable[0]["pre_end_s"], 21.0)
        self.assertEqual(usable[1]["igniter_box"], (1, 2, 3, 4))
        self.assertEqual(usable[1]["direction"], 1)
        self.assertEqual(skipped, [{"test_id": "", "file_name": "b.mp4",
                                    "reason": "test identity not resolved"}])

    def test_not_measurable_lists_every_reason(self):
        def man(test, name, **kw):
            return dict({"test_id": test, "file_name": name, "view": "main",
                         "is_still_sequence": "false"}, **kw)
        manifest = [man("PSI-25/B1", "b1.mp4"), man("PSI-25/B2", "b2.mp4"),
                    man("PSI-25/B3", "b3.mp4"), man("PSI-25/B4", "b4.mp4"),
                    man("PSI-25/B4", "b4_still.mp4", is_still_sequence="true")]
        videos = [{"file_name": "b3.mp4", "readable": "no", "notes": "moov atom not found"}]
        skipped = [{"test_id": "", "file_name": "x.mp4", "reason": "test identity not resolved"}]
        failed = [{"test_id": "PSI-25/B1", "file_name": "b1.mp4", "reason": "no ignition found"}]
        out = run.build_not_measurable(skipped, failed, {"PSI-25/B1"}, manifest, videos,
                                       ["B1", "B2", "B3", "B4", "B17"])
        reasons = {(r["test_id"], r["reason"].split(" (")[0]) for r in out}
        self.assertEqual(reasons, {
            ("", "test identity not resolved"), ("PSI-25/B1", "no ignition found"),
            ("PSI-25/B2", "not configured yet"), ("PSI-25/B3", "main video does not open"),
            ("PSI-25/B4", "not configured yet"), ("PSI-25/B17", "no main video in the manifest")})
        b3 = next(r for r in out if r["test_id"] == "PSI-25/B3")
        self.assertIn("moov atom not found", b3["reason"])
        b4 = next(r for r in out if r["test_id"] == "PSI-25/B4")
        self.assertEqual(b4["file_name"], "b4.mp4")

    def test_b_series_names_from_table_or_manifest(self):
        table = [{"﻿Test #": "B2"}, {"﻿Test #": "B10"}, {"﻿Test #": "T1"},
                 {"﻿Test #": "B1"}]
        self.assertEqual(run.b_series_tests([], table), ["B1", "B2", "B10"])
        self.assertEqual(run.b_series_tests([{"test_id": "PSI-25/B3"}, {"test_id": "PSI-25/T1"}]),
                         ["B3"])

    def test_module_json_lists_files_and_says_pixels(self):
        mod = run.build_module_json(6, 22, ["README.md", "results.csv", "PSI-25_B1_overlay.mp4"])
        self.assertEqual(mod["status"], "built")
        self.assertEqual([f["name"] for f in mod["files"]],
                         ["PSI-25_B1_overlay.mp4", "README.md", "results.csv"])
        self.assertIn("pixels", mod["summary"])
        self.assertIn("Does cutting the air put the fire out?", mod["summary"])
        self.assertIn("6 of the 22", mod["summary"])
        self.assertEqual(len(mod["cannot_tell"]), 14)
        self.assertTrue(any("igniter spark included" in c for c in mod["cannot_tell"]))
        for word in BANNED:
            self.assertNotIn(word, mod["summary"].lower())


class TestEyeQualityAndEnd(unittest.TestCase):
    def meas(self, quality, test_id="PSI-25/B1", **kw):
        m = measurement(test_id=test_id, **kw)
        m.update({"eye_quality": quality, "viewed_by": "SI (Claude) on contact sheets",
                  "notes": "Dark from the start."})
        return m

    def test_each_eye_quality_gives_the_right_flags_and_keeps_every_record(self):
        expect = {"spreading": [], "doubtful": ["eye_doubtful"], "no_spread": ["eye_no_spread"],
                  "": []}
        counts = set()
        for quality, extra in expect.items():
            recs = by_quantity(run.build_evidence(self.meas(quality)))
            counts.add(len(recs))
            for q in ("spread_rate", "leading_edge_travel"):
                self.assertEqual(recs[q]["flags"], sorted(["no_scale"] + extra))
            for q in ("ignition_time", "extinction_time", "outcome"):
                self.assertEqual(recs[q]["flags"], [])
            row = run.build_results_row(self.meas(quality))
            self.assertEqual(row["flags"], ";".join(sorted(["no_scale"] + extra)))
            self.assertEqual(row["rate"], 5.0)
        self.assertEqual(counts, {6})

    def test_viewing_note_and_viewer_land_in_conditions(self):
        for rec in run.build_evidence(self.meas("doubtful")):
            self.assertEqual(rec["conditions"]["viewing_note"], "Dark from the start.")
            self.assertEqual(rec["conditions"]["viewed_by"], "SI (Claude) on contact sheets")

    def test_unflagged_headline_counts_records_not_eye_quality(self):
        ms = [self.meas("spreading", "PSI-25/B1"),
              self.meas("doubtful", "PSI-25/B2"),
              self.meas("spreading", "PSI-25/B3", fit=fit_dict(flags=["short_window"])),
              self.meas("", "PSI-25/B4", fit=fit_dict(rate=None))]
        evidence = [r for m in ms for r in run.build_evidence(m)]
        f = {x["id"]: x for x in run.build_findings(ms, 22, evidence)}["find-unflagged-spread"]
        self.assertEqual(f["value"], 1)
        self.assertEqual(f["evidence_ids"], ["ev-B1-spread_rate"])
        self.assertIn("1 of the 4 measured tests show a steady spread with no warning flag", f["text"])
        self.assertIn("the rest are kept with their flags", f["text"])

    def test_config_reads_the_new_columns_and_tolerates_their_absence(self):
        row = {"file_name": "a.mp4", "test_id": "PSI-25/B1", "track_end_s": "50",
               "eye_quality": "doubtful", "viewed_by": "SI", "notes": "n"}
        usable, _ = run.parse_config([row, {"file_name": "b.mp4", "test_id": "PSI-25/B2"}])
        self.assertEqual((usable[0]["track_end_s"], usable[0]["eye_quality"]), (50.0, "doubtful"))
        self.assertEqual((usable[1]["track_end_s"], usable[1]["eye_quality"]), (None, ""))

    def test_unresolved_reason_names_file_and_table_row(self):
        row = {"test": "B15", "match_notes": "x; sample and GMT agree with table row B17"}
        self.assertEqual(run.unresolved_reason(row),
                         "test identity not resolved (file named B15, sample and day of B17)")
        self.assertEqual(run.unresolved_reason({}), "test identity not resolved")

    def test_end_cut_turns_a_censored_series_into_an_extinction(self):
        # Lit 3 to 11 s, dark 11 to 15 s, then a bright playback screen from 15 s on.
        times = [k / 5 for k in range(100)]
        areas = [0 if (t < 3 or 11 <= t < 15) else 500 for t in times]
        pre = (0.0, 2.5)
        from pipeline.video_to_data import events
        whole = events.detect_events(times, areas, pre)
        self.assertTrue(whole["censored"] or whole["extinction_time_s"] is None
                        or whole["extinction_time_s"] > 11)
        kept = [(t, a) for t, a in zip(times, areas) if run.within_track_range(t, 0.0, 14.9)]
        cut = events.detect_events([t for t, _ in kept], [a for _, a in kept], pre)
        self.assertFalse(cut["censored"])
        self.assertAlmostEqual(cut["extinction_time_s"], 11.0, delta=0.3)
        self.assertEqual(len(kept), 75)


def readout(fans, clock_per_s=1.0, step=0.2):
    return [{"time_s": round(k * step, 3), "fuel": -2, "fan": f, "air": 5, "rad": 0.1,
             "clock_s": None if f is None else 1000 + k * step * clock_per_s}
            for k, f in enumerate(fans)]


def fans_with_drop(drop_at, n=300, hi=62, lo=38):
    return [hi if k * 0.2 < drop_at else lo for k in range(n)]


class TestFanReadout(unittest.TestCase):
    def quantities(self, fans, ignition=10.0, extinction=30.0, clock_per_s=1.0, censored=False):
        m = measurement(events=events_dict(ignition=ignition, extinction=extinction,
                                           censored=censored))
        m["readout"] = readout(fans, clock_per_s)
        return by_quantity(run.build_evidence(m))

    def test_fan_records_with_a_fall(self):
        q = self.quantities(fans_with_drop(29.0))
        self.assertEqual(q["fan_setting_at_ignition"]["value"], 62)
        self.assertEqual(q["fan_setting_at_ignition"]["unit"], "V x10")
        self.assertEqual((q["air_speed_at_ignition"]["value"], q["air_speed_at_ignition"]["unit"]), (5, "cm/s"))
        self.assertEqual(q["air_speed_at_ignition"]["conditions"]["note"],
                         "NASA's duct flow sensor, slow to respond (about 1 min)")
        self.assertAlmostEqual(q["fan_settled_time"]["value"], 29.0, places=2)
        self.assertEqual(q["fan_setting_changes"]["value"], 1)
        self.assertEqual(q["fan_setting_changes"]["unit"], "changes")
        self.assertEqual(q["fan_setting_changes"]["conditions"]["fan_changes"], "29.00 s: 62 to 38")
        self.assertAlmostEqual(q["fan_drop_time"]["value"], 29.0, places=2)
        self.assertAlmostEqual(q["flame_gone_minus_fan_drop"]["value"], 1.0, places=2)
        self.assertEqual(q["clock_rate"]["unit"], "clock s per video s")
        for name in ("fan_setting_at_ignition", "fan_setting_changes", "fan_drop_time",
                     "flame_gone_minus_fan_drop", "clock_rate"):
            self.assertEqual(q[name]["provenance"], "VIDEO_MEASURED")
            self.assertEqual(q[name]["source"]["file"], "v_B1.mp4")
            self.assertIn("PSI-25_B1_readout.csv", q[name]["assets"])
        self.assertEqual(q["fan_drop_time"]["n"], 300)

    def test_no_fall_means_no_drop_records(self):
        q = self.quantities([40 + (k // 100) * 10 for k in range(300)])  # only rises
        self.assertNotIn("fan_drop_time", q)
        self.assertNotIn("flame_gone_minus_fan_drop", q)
        self.assertEqual(q["fan_setting_changes"]["value"], 2)

    def test_censored_test_has_no_flame_gone_difference(self):
        q = self.quantities(fans_with_drop(29.0), censored=True)
        self.assertIn("fan_drop_time", q)
        self.assertNotIn("flame_gone_minus_fan_drop", q)

    def test_fewer_than_three_readings_after_ignition_omits_the_setting(self):
        fans = [None] * 300
        fans[50], fans[51] = 62, 62  # t = 10.0 and 10.2 only
        q = self.quantities(fans)
        self.assertNotIn("fan_setting_at_ignition", q)

    def test_no_reading_at_all_gives_no_fan_records(self):
        q = self.quantities([None] * 300)
        self.assertFalse({"fan_setting_changes", "fan_drop_time", "clock_rate"} & set(q))

    def test_without_a_readout_no_fan_records(self):
        self.assertNotIn("fan_setting_changes", by_quantity(run.build_evidence(measurement())))

    def test_changes_before_ignition_are_not_counted(self):
        fans = [62 if k * 0.2 < 5 else 50 for k in range(300)]  # change at 5 s, ignition 10 s
        self.assertEqual(self.quantities(fans)["fan_setting_changes"]["value"], 0)

    def test_readout_file_rows_leave_unreadable_cells_empty(self):
        rows = run.readout_rows([{"time_s": 1.0, "fan": None, "air": 5, "rad": 0.13, "clock_s": 7}])
        self.assertEqual(rows, [{"time_s": "1.000", "fuel": "", "fan": "", "air": 5, "rad": 0.13,
                                 "clock_s": 7}])
        self.assertEqual(run.READOUT_COLUMNS, ["time_s", "fuel", "fan", "air", "rad", "clock_s"])

    def test_readout_file_is_listed_in_module_files(self):
        mod = run.build_module_json(1, 22, ["PSI-25_B1_readout.csv"])
        self.assertEqual(mod["files"][0]["kind"], "table")
        desc = mod["files"][0]["description"]
        self.assertIn("fan voltage x10", desc)
        self.assertIn("by elimination NASA's N2 flow rate in cm3/min", desc)
        self.assertNotIn("dial", desc)


class TestFanFindings(unittest.TestCase):
    def build(self, drops_and_gone, rates=None, outcome_rows=None):
        ms, evidence = [], []
        for i, (drop, gone) in enumerate(drops_and_gone, start=1):
            m = measurement(test_id=f"PSI-25/B{i}", events=events_dict(ignition=2.0, extinction=gone))
            fans = fans_with_drop(drop) if drop is not None else [50] * 300
            m["readout"] = readout(fans, 1.0 if rates is None else rates[i - 1])
            ms.append(m)
            evidence += run.build_evidence(m)
        return ms, evidence, {f["id"]: f for f in run.build_findings(ms, 22, evidence, outcome_rows)}

    def test_headline_counts_within_before_and_later(self):
        # Retires test_headline_counts_before_after_and_earlier: the headline now counts from the
        # time the fan voltage began to fall, not from the time it settled (the old count was wrong).
        # drop start, gone: before (-0.6), within (+1.0), before (-30), no fall, later (+5)
        ms, ev, f = self.build([(20.0, 19.4), (20.0, 21.0), (50.0, 20.0), (None, 20.0), (20.0, 25.0)])
        h = f["find-flame-gone-vs-fan-drop"]
        self.assertEqual(h["kind"], "headline")
        self.assertEqual(h["text"],
                         "In 1 of the 4 tests whose fan voltage was turned down at the end, the flame "
                         "left the video within 3 s after the voltage began to fall (1.0 to 1.0 s). "
                         "In 2 it had already gone before the fall began. In 1 the flame was still in "
                         "the video more than 3 s after the fall began.")
        self.assertEqual((h["value"], h["n"]), (1, 4))
        self.assertEqual(run.FALL_WINDOW_S, 3.0)

    def test_headline_without_later_cases_and_with_a_range(self):
        # Retires test_headline_without_later_cases_uses_the_plain_wording: same reason, new wording.
        ms, ev, f = self.build([(20.0, 21.0), (20.0, 22.5), (50.0, 20.0)])
        text = f["find-flame-gone-vs-fan-drop"]["text"]
        self.assertTrue(text.startswith("In 2 of the 3 tests whose fan voltage was turned down at the end"))
        self.assertIn("(1.0 to 2.5 s)", text)
        self.assertTrue(text.endswith("In 1 it had already gone before the fall began."))
        for word in ("because", "put out", "caused", "led to", "dial"):
            self.assertNotIn(word, text)

    def test_headline_with_nothing_inside_the_window_has_no_range(self):
        ms, ev, f = self.build([(50.0, 20.0)])
        self.assertEqual(f["find-flame-gone-vs-fan-drop"]["text"],
                         "In 0 of the 1 tests whose fan voltage was turned down at the end, the flame "
                         "left the video within 3 s after the voltage began to fall. In 1 it had "
                         "already gone before the fall began.")

    def test_b1_check_passes_at_1_6_and_fails_at_5_and_minus_1(self):
        for gone, passed in ((21.6, True), (25.0, False), (19.0, False), (22.5, True), (22.6, False)):
            ms, ev, f = self.build([(20.0, gone)])
            c = f["find-b1-fall-vs-report"]
            self.assertEqual((c["kind"], c["passed"], c["n"], c["unit"]), ("check", passed, 1, "s"))
            self.assertAlmostEqual(c["value"], gone - 20.0, places=2)
            self.assertEqual(c["provenance"], "VIDEO_MEASURED")
            self.assertEqual(c["source"]["file"], "v_B1.mp4")
            self.assertEqual(c["evidence_ids"], ["ev-B1-flame_gone_minus_fan_drop"])
        ms, ev, f = self.build([(20.0, 21.6)])
        self.assertEqual(f["find-b1-fall-vs-report"]["text"],
                         "B1: the flame left the video 1.6 s after the fan voltage began to fall. "
                         "NASA's report says the flame extinguished within 2 s of the flow being cut "
                         "off (the report's first test, matched to B1 by its table note).")
        ms, ev, f = self.build([(20.0, 19.0)])
        self.assertIn("1.0 s before the fan voltage began to fall", f["find-b1-fall-vs-report"]["text"])

    def test_b1_check_needs_both_a_fall_start_and_an_extinction_time(self):
        ms, ev, f = self.build([(None, 20.0)])           # no fall
        self.assertNotIn("find-b1-fall-vs-report", f)
        m = measurement(test_id="PSI-25/B1", events=events_dict(censored=True))
        m["readout"] = readout(fans_with_drop(20.0))
        f = {x["id"] for x in run.build_findings([m], 22, run.build_evidence(m))}
        self.assertNotIn("find-b1-fall-vs-report", f)
        ms, ev, f = self.build([(20.0, 21.0)])
        ev = [r for r in ev if r["test_id"] != "PSI-25/B1"]
        self.assertNotIn("find-b1-fall-vs-report", {x["id"] for x in run.build_findings([], 22, ev)})

    def test_no_fan_headline_without_fan_records(self):
        ms = [measurement()]
        f = {x["id"] for x in run.build_findings(ms, 22, run.build_evidence(ms[0]))}
        self.assertNotIn("find-flame-gone-vs-fan-drop", f)
        self.assertNotIn("find-clock-is-real-time", f)

    def test_clock_check_passes_when_every_video_is_in_band(self):
        ms, ev, f = self.build([(20.0, 19.4), (20.0, 21.0)], rates=[1.0, 0.9995])
        c = f["find-clock-is-real-time"]
        self.assertTrue(c["passed"])
        self.assertEqual((c["kind"], c["provenance"], c["n"]), ("check", "VIDEO_MEASURED", 2))
        self.assertEqual(c["text"], "Video time is real time: the on-screen clock advances 1.000 "
                                    "to 1.000 s per second of video in all 2 measured videos.".replace(
                                        "1.000 to 1.000", "1.000 to 1.000"))

    def test_clock_check_fails_when_one_video_is_at_0_6(self):
        ms, ev, f = self.build([(20.0, 19.4), (20.0, 21.0)], rates=[1.0, 0.6])
        c = f["find-clock-is-real-time"]
        self.assertFalse(c["passed"])
        self.assertAlmostEqual(c["value"], 0.6, places=2)
        self.assertIn("1 of the 2 measured videos", c["text"])

    def test_outcome_check_only_with_the_csv_rows(self):
        rows = [{"agreement": "yes", "published_source": "x (PSI-25_Reports_BASS-II Summary Report.pdf)"},
                {"agreement": "yes", "published_source": ""}, {"agreement": "cannot_tell"}]
        ms, ev, f = self.build([(20.0, 19.4)], outcome_rows=rows)
        c = f["find-outcome-labels-vs-table-7-1"]
        self.assertEqual(c["text"], "Outcome labels agree with NASA's Summary Report Table 7.1 in 2 of "
                                    "the 2 T-series tests that could be judged; 1 could not be judged.")
        self.assertTrue(c["passed"])
        self.assertEqual(c["source"]["file"], "PSI-25_Reports_BASS-II Summary Report.pdf")
        rows.append({"agreement": "no"})
        self.assertFalse(run.build_findings([], 22, [], rows)[-1]["passed"])
        ms, ev, f = self.build([(20.0, 19.4)])
        self.assertNotIn("find-outcome-labels-vs-table-7-1", f)

    def test_outcome_check_with_nothing_judged_does_not_pass(self):
        self.assertFalse(run.outcome_check([{"agreement": "cannot_tell"}])["passed"])

    def test_outcome_csv_is_read_only_when_it_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "outcome_check.csv"
            self.assertFalse(path.is_file())
            path.write_text("test_id,published_outcome,published_source,measured_outcome,agreement,"
                            "reason,file_name\nPSI-25/T4,quenched,x,unclassified,yes,r,f\n",
                            encoding="utf-8")
            rows = run.read_csv(path)
            self.assertEqual(run.outcome_check(rows)["value"], 1)


class TestClipCommand(unittest.TestCase):
    def test_encoder_asks_ffmpeg_for_h264_yuv420p_single_threaded(self):
        frames = [np.zeros((48, 64, 3), dtype=np.uint8) for _ in range(3)]
        calls = []

        def fake_run(cmd, input=None, capture_output=None, timeout=None):
            calls.append(cmd)
            Path(cmd[-1]).write_bytes(b"x" * 100)
            return mock.Mock(returncode=0, stderr=b"")
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(run.subprocess, "run", fake_run):
            run.encode_clip(frames, 10, Path(tmp) / "c.mp4")
        cmd = calls[0]
        self.assertIn("libx264", cmd)
        self.assertEqual(cmd[cmd.index("-pix_fmt", cmd.index("libx264")) + 1], "yuv420p")
        self.assertEqual(cmd[cmd.index("-threads") + 1], "1")


def _write_avi(path, w=320, h=160, fps=10.0):
    """Dark noise, a bright text bar in the top rows, a red bar growing to the right 3 s to 11 s."""
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (w, h))
    assert writer.isOpened()
    for k in range(160):
        rng = np.random.default_rng(k)
        frame = rng.integers(0, 12, size=(h, w, 3)).astype(np.uint8)
        frame[2:14, 10:300] = 255
        t = k / fps
        if 3.0 <= t < 11.0:
            frame[110:130, 20:20 + int(30 + 28 * (t - 3.0))] = (250, 40, 80)
        writer.write(cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
    writer.release()


CLIP_LOG = []


def _stub_encoder(frames, fps, path):
    CLIP_LOG.append((len(frames), fps))
    Path(path).write_bytes(f"{len(frames)} frames at {fps} fps".encode())


def _stub_overlay(video, track_end_s=None):
    """Built read-out: FAN 62 until 9 s then 38, clock at video speed, 0.2 s steps."""
    rows = [{"time_s": round(k * 0.2, 3), "fan": 62 if k * 0.2 < 9.0 else 38, "air": 5,
             "rad": 0.13, "clock_s": 36000 + k * 0.2 // 1} for k in range(80)]
    return [r for r in rows if run.within_track_range(r["time_s"], 0.0, track_end_s)]


class TestIndexAndStages(unittest.TestCase):
    STAGES = {"stages": [{"stage": "growth", "start_s": 10.0, "end_s": 14.0},
                         {"stage": "fully developed", "start_s": 14.0, "end_s": 25.0},
                         {"stage": "decay", "start_s": 25.0, "end_s": 30.0}],
              "flags": [], "plateau": 900.0, "peak": 1234.56, "peak_time_s": 15.0, "n_samples": 100}

    def meas(self, test_id, flags=None, rate=5.0, stages=None, quality="spreading"):
        m = measurement(test_id=test_id, fit=fit_dict(rate=rate, flags=flags))
        m.update({"eye_quality": quality, "viewed_by": "SI", "notes": "dark start",
                  "stages": stages if stages is not None else self.STAGES,
                  "readout": readout(fans_with_drop(29.0)),
                  "clip": {"file": run.asset_names(test_id)["clip"], "start_s": 10.0,
                           "end_s": 30.0, "speed": 2.0}})
        if m["fit"].get("rate") is not None:
            m["fit"]["intercept_px"] = 12.5
        return m

    def test_stage_and_peak_records(self):
        recs = by_quantity(run.build_evidence(self.meas("PSI-25/B1")))
        self.assertEqual(recs["stage_duration_growth"]["value"], 4.0)
        self.assertEqual(recs["stage_duration_fully_developed"]["value"], 11.0)
        self.assertEqual(recs["stage_duration_decay"]["value"], 5.0)
        for q in ("stage_duration_growth", "stage_duration_fully_developed", "stage_duration_decay"):
            self.assertEqual(recs[q]["unit"], "s")
            self.assertEqual(recs[q]["provenance"], "VIDEO_MEASURED")
            self.assertEqual(recs[q]["n"], 100)
            self.assertEqual(recs[q]["conditions"]["stage_names_source"],
                             "NIST, Fire Dynamics (Fire Research Division), created 17 November 2010, "
                             "updated 9 September 2025")
            self.assertIn("team's own rule", recs[q]["conditions"]["stage_rule"])
        peak = recs["peak_flame_light"]
        self.assertEqual((peak["value"], peak["unit"]), (1234.6, "relative units, uncalibrated"))
        self.assertIn("is not a temperature", peak["conditions"]["note"])
        self.assertEqual(recs["spread_rate"]["conditions"]["fit_intercept_px"], 12.5)

    def test_missing_stage_means_no_record_and_no_plateau_is_flagged(self):
        two = {"stages": self.STAGES["stages"][::2], "flags": ["no_plateau"], "peak": 5.0,
               "plateau": 1.0, "peak_time_s": 1.0, "n_samples": 20}
        recs = by_quantity(run.build_evidence(self.meas("PSI-25/B1", stages=two)))
        self.assertNotIn("stage_duration_fully_developed", recs)
        self.assertIn("no_plateau", recs["stage_duration_growth"]["flags"])
        none = {"stages": [], "flags": ["too_short"], "peak": None, "plateau": None,
                "peak_time_s": None, "n_samples": 3}
        recs = by_quantity(run.build_evidence(self.meas("PSI-25/B1", stages=none)))
        self.assertFalse([q for q in recs if q.startswith("stage_") or q == "peak_flame_light"])

    def test_curve_columns_and_stage_labels(self):
        rows = [{"time_s": 10.0, "edge_min_px": 1.0, "edge_max_px": 9.0, "area_px": 100, "signal": 200.0},
                {"time_s": 20.0, "edge_min_px": 1.0, "edge_max_px": 19.0, "area_px": 50, "signal": 100.5},
                {"time_s": 31.0, "edge_min_px": None, "edge_max_px": None, "area_px": 0, "signal": 0.0}]
        out = run.curve_rows(rows, 1, self.STAGES["stages"])
        self.assertEqual(list(out[0]), ["time_s", "leading_edge_px", "trailing_edge_px", "area_px",
                                        "flame_light", "stage"])
        self.assertEqual((out[0]["flame_light"], out[0]["stage"]), ("20000.0", "growth"))
        self.assertEqual((out[1]["flame_light"], out[1]["stage"]), ("5025.0", "fully developed"))
        self.assertEqual(out[2]["stage"], "")

    def test_index_shape(self):
        ms = [self.meas("PSI-25/B1")]
        ev = [r for m in ms for r in run.build_evidence(m)]
        idx = run.build_index(ms, ev, [{"test_id": "PSI-25/B14", "file_name": "f.mp4", "reason": "r"}])
        self.assertEqual(list(idx), ["module", "units", "stage_source", "tests", "not_measurable"])
        self.assertEqual(idx["units"], {"position": "px", "time": "s", "rate": "px/s",
                                        "light": "relative units, uncalibrated"})
        self.assertEqual(idx["stage_source"]["link"], run.stages.STAGE_LINK)
        self.assertEqual(idx["stage_source"]["note"],
                         "Stage names from NIST; the limits between stages are our own rule.")
        t = idx["tests"][0]
        self.assertEqual(list(t), ["test_id", "label", "video_file", "conditions", "viewing", "flags",
                                   "events", "rate", "fan", "air", "stages", "clip", "files", "evidence_ids"])
        self.assertEqual(t["label"], "B1")
        self.assertEqual(t["viewing"], {"quality": "spreading", "note": "dark start", "viewed_by": "SI"})
        self.assertEqual(t["flags"], ["no_scale"])
        self.assertEqual(t["events"], {"ignition_time_s": 10.0, "extinction_time_s": 30.0,
                                       "censored": False, "outcome": "unclassified",
                                       "last_faint_light_s": None})
        self.assertEqual(list(t["rate"]), ["value", "unit", "ci_low", "ci_high", "window_start_s",
                                           "window_end_s", "intercept_px"])
        self.assertEqual(t["rate"]["intercept_px"], 12.5)
        self.assertEqual(list(t["fan"]), ["at_ignition", "unit", "changes", "drop_time_s",
                                          "settled_time_s", "flame_gone_minus_fan_drop_s"])
        self.assertEqual(t["fan"]["unit"], "V x10")
        self.assertAlmostEqual(t["fan"]["drop_time_s"], 29.0, places=2)
        self.assertEqual(t["air"], {"at_ignition": 5.0, "unit": "cm/s",
                                    "note": "NASA's duct flow sensor, slow to respond (about 1 min)"})
        self.assertEqual(t["evidence_ids"]["air_speed_at_ignition"], "ev-B1-air_speed_at_ignition")
        self.assertEqual(t["evidence_ids"]["fan_settled_time"], "ev-B1-fan_settled_time")
        self.assertEqual(t["fan"]["changes"][0]["from"], 62)
        self.assertEqual([s["stage"] for s in t["stages"]], ["growth", "fully developed", "decay"])
        self.assertEqual(list(t["files"]), ["kymograph", "steps", "stills", "curve", "readout"])
        self.assertEqual(len(t["files"]["stills"]), 3)
        self.assertEqual(t["evidence_ids"]["spread_rate"], "ev-B1-spread_rate")
        self.assertEqual(t["evidence_ids"]["peak_flame_light"], "ev-B1-peak_flame_light")
        self.assertNotIn("extinction_time_not_a_key", t["evidence_ids"])
        self.assertEqual(idx["not_measurable"], [{"test_id": "PSI-25/B14", "file_name": "f.mp4",
                                                  "reason": "r"}])
        json.dumps(idx)

    def test_index_order_unflagged_first_then_by_test_number(self):
        ms = [self.meas("PSI-25/B10"), self.meas("PSI-25/B2", flags=["short_window"]),
              self.meas("PSI-25/B3"), self.meas("PSI-25/B1", quality="doubtful"),
              self.meas("PSI-25/B4", rate=None)]
        ev = [r for m in ms for r in run.build_evidence(m)]
        order = [t["label"] for t in run.build_index(ms, ev, [])["tests"]]
        # B1's eye flag lands on its records only when eye_quality is set on the record; here the
        # records carry it, so B1 is flagged
        self.assertEqual(order, ["B3", "B10", "B1", "B2", "B4"])

    def test_censored_test_has_null_extinction_and_no_rate_is_null(self):
        m = self.meas("PSI-25/B1", rate=None)
        m["events"] = events_dict(censored=True)
        ev = run.build_evidence(m)
        t = run.build_index([m], ev, [])["tests"][0]
        self.assertIsNone(t["events"]["extinction_time_s"])
        self.assertTrue(t["events"]["censored"])
        self.assertIsNone(t["rate"])

    def test_intercept_is_only_given_where_the_line_is_in_curve_coordinates(self):
        # direction -1 advance coordinate is the negative leading edge: no intercept in the index
        m = self.meas("PSI-25/B1")
        m["fit"]["intercept_px"] = None
        t = run.build_index([m], run.build_evidence(m), [])["tests"][0]
        self.assertIsNone(t["rate"]["intercept_px"])

    def test_wording_has_no_temperature_outside_the_not_a_temperature_sentences(self):
        texts = list(run.CANNOT_TELL) + [run.LIGHT_NOTE, run.stages.STAGE_RULE_TEXT,
                                         run.stages.__doc__.split("Flame light is")[0]]
        for text in texts:
            self.assertEqual(text.lower().replace("is not a temperature", "").count("temperature"), 0,
                             text)
        self.assertEqual(sum("is not a temperature" in c for c in run.CANNOT_TELL), 1)

    def test_no_dial_wording_and_the_new_cannot_tell_lines(self):
        texts = list(run.CANNOT_TELL) + [run.AIR_NOTE, run.FAN_UNIT, run.AIR_UNIT,
                                         run.build_module_json(1, 2, [])["summary"],
                                         run.fan_summary.__doc__, run.read_overlay.__doc__]
        for text in texts:
            self.assertNotIn("dial", text.lower())
        joined = " ".join(run.CANNOT_TELL)
        self.assertIn("The FAN read-out is the fan voltage times ten, not an air speed.", joined)
        self.assertIn("The AIR read-out is NASA's measured flow speed in cm/s, but the sensor takes "
                      "about a minute to respond, so it lags behind any change.", joined)
        self.assertIn("good to about half a second", joined)
        self.assertNotIn("1.5 s", joined)


def t_rows(matches=("yes", "yes", "yes"), with_t20=True):
    rows = []
    for i, m in enumerate(matches):
        n = 4 + i
        rows.append({"test": f"T{n}", "test_id": f"PSI-25/T{n}", "file_name": f"v_T{n}.mp4",
                     "grade": "" if m == "not_graded" else ("cannot_tell" if m == "undecided" else "quenched"),
                     "confidence": "low" if i == 0 else "medium", "wire_glow_s": "",
                     "flame_seen_from_s": "5.5", "flame_gone_s": "~13", "fan_history": "80 to 46",
                     "rad_note": "", "reason": "dim crescent", "graded_by": "SI grader",
                     "nasa_outcome": "quenched", "nasa_source": f"PUB-{17 + i}, Summary Report Table 7.1, PDF page 104",
                     "match": m})
    if with_t20:
        rows.append({"test": "T20", "test_id": "PSI-25/T20", "file_name": "", "grade": "",
                     "confidence": "", "wire_glow_s": "", "flame_seen_from_s": "",
                     "flame_gone_s": "", "fan_history": "", "rad_note": "",
                     "reason": "no plain main video on PSI", "graded_by": "",
                     "nasa_outcome": "quenched", "nasa_source": "PUB-21, Summary Report Table 7.1, PDF page 104",
                     "match": "not_graded"})
    return rows


class TestTSeries(unittest.TestCase):
    def test_graded_records_are_si_extracted_with_flags(self):
        graded, published = run.build_t_evidence(t_rows())
        self.assertEqual(len(graded), 3)
        self.assertEqual(len(published), 4)  # T20 has a NASA outcome too
        for rec in graded:
            self.assertEqual(rec["provenance"], "SI_EXTRACTED")
            self.assertEqual(rec["quantity"], "outcome_graded_by_si")
            self.assertEqual(rec["unit"], "")
            self.assertIn("si_graded", rec["flags"])
            self.assertIn("Not a measurement by the tracker", rec["conditions"]["note"])
            self.assertEqual(rec["source"]["psi_id"], "PSI-25")
        self.assertIn("low_confidence", graded[0]["flags"])
        self.assertNotIn("low_confidence", graded[1]["flags"])
        self.assertTrue(all(r["provenance"] == "PUBLISHED" and r["quantity"] == "published_outcome"
                            for r in published))
        self.assertEqual(published[0]["conditions"]["published_row"], "PUB-17")
        run.check_unique(graded + published)

    def test_check_counts_when_all_match(self):
        rows = t_rows()
        graded, _ = run.build_t_evidence(rows)
        f = run.t_series_check(rows, graded)
        self.assertEqual((f["value"], f["n"], f["passed"], f["provenance"]), (3, 3, True, "SI_EXTRACTED"))
        self.assertIn("matched NASA's published outcome in 3 of the 3 T-series tests", f["text"])
        self.assertEqual(f["evidence_ids"], [r["id"] for r in graded])

    def test_one_contradiction_fails_and_one_undecided_is_counted(self):
        rows = t_rows(("yes", "no", "undecided"))
        graded, _ = run.build_t_evidence(rows)
        f = run.t_series_check(rows, graded)
        self.assertFalse(f["passed"])
        self.assertEqual(f["value"], 1)
        self.assertIn("1 could not be decided and 1 contradicted", f["text"])

    def test_undecided_without_contradiction_still_passes(self):
        rows = t_rows(("yes", "undecided", "yes"))
        graded, _ = run.build_t_evidence(rows)
        self.assertTrue(run.t_series_check(rows, graded)["passed"])

    def test_none_graded_gives_no_finding(self):
        rows = t_rows(("not_graded",), with_t20=False)
        graded, _ = run.build_t_evidence(rows)
        self.assertEqual(graded, [])
        self.assertIsNone(run.t_series_check(rows, graded))
        ids = {f["id"] for f in run.build_findings([], 22, [], None, None)}
        self.assertNotIn(run.T_FINDING_ID, ids)

    def test_finding_is_added_to_the_findings_and_headlines_stay_b_series(self):
        rows = t_rows()
        graded, _ = run.build_t_evidence(rows)
        finds = run.build_findings([], 22, [], None, run.t_series_check(rows, graded))
        self.assertIn(run.T_FINDING_ID, {f["id"] for f in finds})
        for f in finds:
            if f["kind"] == "headline":
                self.assertFalse([e for e in f.get("evidence_ids", []) if e.startswith("ev-T")])

    def test_index_block_in_order_with_t20_not_graded_and_tests_untouched(self):
        rows = t_rows()
        graded, published = run.build_t_evidence(rows)
        block = run.build_t_index(rows, graded, published)
        self.assertEqual([t["label"] for t in block["tests"]], ["T4", "T5", "T6", "T20"])
        t20 = block["tests"][-1]
        self.assertIsNone(t20["si_grade"])
        self.assertEqual(t20["match"], "not_graded")
        self.assertEqual(t20["published_evidence_id"], "ev-T20-PUB-21")
        self.assertIsNone(t20["evidence_id"])
        idx = run.build_index([], [], [], block)
        self.assertEqual(idx["tests"], [])
        self.assertEqual(idx["not_measurable"], [])
        self.assertIn("t_series", idx)
        self.assertNotIn("t_series", run.build_index([], [], []))

    def test_module_json_says_the_tracker_did_not_measure_them(self):
        mod = run.build_module_json(1, 18, [])
        self.assertTrue(any("graded by SI" in c and "not measured by the tracker" in c
                            for c in mod["cannot_tell"]))
        self.assertIn("graded by SI", mod["summary"])


class TestFaintLightRecords(unittest.TestCase):
    FAINT = {"time_s": 49.6, "area_px": 166, "n_detected": 140, "flags": ["faint_small_region"],
             "reason": None, "basis": "SI viewer saw a flame", "viewed_by": "SI viewer"}

    def test_record_only_for_a_test_with_a_faint_result(self):
        plain = by_quantity(run.build_evidence(measurement()))
        self.assertNotIn("last_faint_light_time", plain)
        m = measurement()
        m["faint"] = dict(self.FAINT)
        rec = by_quantity(run.build_evidence(m))["last_faint_light_time"]
        self.assertEqual((rec["value"], rec["unit"], rec["n"], rec["provenance"]),
                         (49.6, "s", 140, "VIDEO_MEASURED"))
        self.assertEqual(rec["flags"], ["faint_small_region", "threshold_dependent"])
        self.assertEqual(rec["source"]["file"], "v_B1.mp4")
        self.assertEqual(rec["conditions"]["rule"],
                         "8 brightness units above the dark frames, region of at least 150 px")
        self.assertEqual(rec["conditions"]["basis"], "SI viewer saw a flame")
        self.assertIn("not the time the flame went out", rec["conditions"]["note"])

    def test_flag_small_region_absent_for_a_large_one(self):
        m = measurement()
        m["faint"] = dict(self.FAINT, flags=[])
        rec = by_quantity(run.build_evidence(m))["last_faint_light_time"]
        self.assertEqual(rec["flags"], ["threshold_dependent"])

    def test_no_time_gives_no_record(self):
        m = measurement()
        m["faint"] = dict(self.FAINT, time_s=None, reason="dark lead-in too short")
        self.assertNotIn("last_faint_light_time", by_quantity(run.build_evidence(m)))

    def test_cannot_tell_has_the_exact_line(self):
        line = ("Last faint light is the time after which the tracker sees no light above a low "
                "fixed threshold (8 brightness units above the dark frames, in a region of at "
                "least 150 pixels). It depends on that threshold and can follow an ember or a "
                "glowing sample holder; it is not the time the flame went out. It is given only "
                "for tests where a viewer saw a flame at that time.")
        self.assertIn(line, run.build_module_json(1, 18, [])["cannot_tell"])

    def test_committed_input_lists_only_b3_and_b11(self):
        rows = run.read_csv(run.ENGINE_DIR / "faint_light.csv")
        self.assertEqual([r["test_id"] for r in rows], ["PSI-25/B3", "PSI-25/B11"])
        self.assertTrue(all(r["viewed_by"] and r["basis"] for r in rows))

    def test_whole_run_main_values_identical_with_and_without_a_row(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            vids = tmp / "v"
            vids.mkdir()
            _write_avi(vids / "syn_B1.avi")
            (tmp / "c.csv").write_text("file_name,test_id,pre_ignition_start_s,pre_ignition_end_s\n"
                                       "syn_B1.avi,PSI-25/B1,0,2.5\n", encoding="utf-8")
            (tmp / "m.csv").write_text("file_name,test_id\n", encoding="utf-8")
            (tmp / "p.csv").write_text("row_id,test_ids,quantity,value,unit\n", encoding="utf-8")
            (tmp / "v.csv").write_text("file_name,readable,notes\n", encoding="utf-8")
            (tmp / "g.csv").write_text("", encoding="utf-8")
            (tmp / "f_none.csv").write_text("test_id,basis,viewed_by\n", encoding="utf-8")
            (tmp / "f_b1.csv").write_text("test_id,basis,viewed_by\nPSI-25/B1,seen,SI viewer\n",
                                          encoding="utf-8")
            got = {}
            for name in ("none", "b1"):
                out = tmp / name / "video-to-data"
                run.run(vids, out, config_path=tmp / "c.csv", manifest_path=tmp / "m.csv",
                        published_path=tmp / "p.csv", videos_csv_path=tmp / "v.csv",
                        table_path=tmp / "none.csv", log=lambda *_: None,
                        clip_encoder=_stub_encoder, overlay_reader=_stub_overlay,
                        outcome_check_path=tmp / "o.csv", grades_path=tmp / "g.csv",
                        faint_path=tmp / f"f_{name}.csv")
                self.assertEqual(validate.validate_folder(str(out)).errors, [])
                got[name] = (json.loads((out / "evidence.json").read_text()),
                             json.loads((out / "index.json").read_text()))
        ev_none, idx_none = got["none"]
        ev_b1, idx_b1 = got["b1"]
        self.assertNotIn("last_faint_light_time", {r["quantity"] for r in ev_none})
        self.assertIsNone(idx_none["tests"][0]["events"]["last_faint_light_s"])
        self.assertNotIn("last_faint_light_time", idx_none["tests"][0]["evidence_ids"])
        extra = [r for r in ev_b1 if r["quantity"] == "last_faint_light_time"]
        self.assertEqual(len(extra), 1)
        self.assertEqual([r for r in ev_b1 if r["quantity"] != "last_faint_light_time"], ev_none)
        e_none, e_b1 = idx_none["tests"][0], idx_b1["tests"][0]
        self.assertAlmostEqual(e_b1["events"]["last_faint_light_s"], 11.0, delta=1.0)
        self.assertEqual(e_b1["evidence_ids"]["last_faint_light_time"], extra[0]["id"])
        for key in ("ignition_time_s", "extinction_time_s", "censored", "outcome"):
            self.assertEqual(e_none["events"][key], e_b1["events"][key])
        for key in ("rate", "fan", "stages", "flags"):
            self.assertEqual(e_none[key], e_b1[key])


class TestEndToEnd(unittest.TestCase):
    def test_outcome_check_stays_off_even_when_the_csv_exists(self):
        self.assertFalse(run.USE_OUTCOME_CHECK)
        rows = [{"agreement": "yes", "published_source": "x"}]
        self.assertIn("find-outcome-labels-vs-table-7-1",
                      {f["id"] for f in run.build_findings([], 22, [], rows)})
        with mock.patch.object(run, "USE_OUTCOME_CHECK", False):
            self.assertFalse(run.USE_OUTCOME_CHECK)

    def test_intercept_from_a_synthetic_video(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "syn.avi"
            _write_avi(video)
            cfg = {"axis": "x", "direction": 1, "track_start_s": 0.0, "pre_start_s": 0.0,
                   "pre_end_s": 2.5, "igniter_box": None, "roi": None, "track_end_s": None}
            meas = run.measure_video(video, cfg, tmp)
        ft = meas["fit"]
        self.assertAlmostEqual(ft["intercept_px"] + ft["rate"] * 6.0,
                               [r for r in meas["lit_rows"] if abs(r["time_s"] - 6.0) < 0.11][0]["edge_max_px"],
                               delta=4.0)
        self.assertTrue(meas["stages"]["stages"])
        row = run.steps_row(meas["lit_rows"], ft)
        mid = (ft["window_start_s"] + ft["window_end_s"]) / 2
        self.assertLessEqual(abs(row["time_s"] - mid), 0.2)

    def test_outcome_flag_switch_in_a_whole_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            vids = tmp / "v"
            vids.mkdir()
            _write_avi(vids / "syn_B1.avi")
            (tmp / "c.csv").write_text("file_name,test_id,pre_ignition_start_s,pre_ignition_end_s\n"
                                       "syn_B1.avi,PSI-25/B1,0,2.5\n", encoding="utf-8")
            (tmp / "m.csv").write_text("file_name,test_id\n", encoding="utf-8")
            (tmp / "p.csv").write_text("row_id,test_ids,quantity,value,unit\n", encoding="utf-8")
            (tmp / "v.csv").write_text("file_name,readable,notes\n", encoding="utf-8")
            (tmp / "o.csv").write_text("test_id,published_outcome,published_source,measured_outcome,"
                                       "agreement,reason,file_name\nPSI-25/T4,q,x,q,yes,r,f\n",
                                       encoding="utf-8")
            for flag in (False, True):
                out = tmp / f"out{flag}"
                with mock.patch.object(run, "USE_OUTCOME_CHECK", flag):
                    run.run(vids, out, config_path=tmp / "c.csv", manifest_path=tmp / "m.csv",
                            published_path=tmp / "p.csv", videos_csv_path=tmp / "v.csv",
                            table_path=tmp / "none.csv", log=lambda *_: None,
                            clip_encoder=_stub_encoder, overlay_reader=_stub_overlay,
                            outcome_check_path=tmp / "o.csv")
                ids = {f["id"] for f in json.loads((out / "findings.json").read_text())}
                self.assertEqual("find-outcome-labels-vs-table-7-1" in ids, flag)
    def test_track_end_cut_on_a_synthetic_video(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "syn.avi"
            _write_avi(video)
            base = {"axis": "x", "direction": 1, "track_start_s": 0.0, "pre_start_s": 0.0,
                    "pre_end_s": 2.5, "igniter_box": None, "roi": None}
            full = run.measure_video(video, dict(base, track_end_s=None), tmp)
            cut = run.measure_video(video, dict(base, track_end_s=8.0), tmp)
        self.assertFalse(full["events"]["censored"])
        self.assertTrue(cut["events"]["censored"])
        self.assertLess(cut["n_samples"], full["n_samples"])
        self.assertLessEqual(max(r["time_s"] for r in cut["rows"]), 8.0)
        self.assertLessEqual(max(r["time_s"] for r in cut["lit_rows"]), 8.0)

    def test_synthetic_video_through_the_whole_command_validates(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            vids = tmp / "videos"
            vids.mkdir()
            _write_avi(vids / "syn_B1.avi")
            cfg = tmp / "config.csv"
            cfg.write_text(
                "file_name,test_id,axis,direction,track_start_s,pre_ignition_start_s,"
                "pre_ignition_end_s,igniter_box,roi\n"
                "syn_B1.avi,PSI-25/B1,x,1,0,0,2.5,,\n"
                "syn_other.avi,,x,1,0,0,2.5,,\n", encoding="utf-8")
            man = tmp / "manifest.csv"
            with man.open("w", newline="", encoding="utf-8") as handle:
                w = csv.DictWriter(handle, fieldnames=list(MANIFEST_ROW))
                w.writeheader()
                w.writerow(dict(MANIFEST_ROW, file_name="syn_B1.avi"))
            pub = tmp / "published.csv"
            pub.write_text("row_id,test_ids,quantity,value,unit,source_document,page_printed,"
                           "table_or_figure,match\n"
                           "PUB-01,PSI-25/B1,steady_spread_rate,2.2,mm/s,"
                           "\"x (PSI-25_Reports_BASS-II Summary Report.pdf)\",13,text,inferred\n"
                           "PUB-02,PSI-25/B4,outcome,note,,"
                           "\"x (PSI-25_Reports_BASS-II Summary Report.pdf)\",1,text,\n",
                           encoding="utf-8")
            vcsv = tmp / "videos.csv"
            vcsv.write_text("file_name,readable,notes\n", encoding="utf-8")
            out = tmp / "modules" / "video-to-data"
            out.mkdir(parents=True)
            (out / "PSI-25_B9_curve.csv").write_text("stale", encoding="utf-8")
            (out / "README.md").write_text("# test", encoding="utf-8")

            def go():
                return run.run(vids, out, config_path=cfg, manifest_path=man, published_path=pub,
                               videos_csv_path=vcsv, table_path=tmp / "none.csv",
                               log=lambda *_: None, clip_encoder=_stub_encoder,
                               overlay_reader=_stub_overlay,
                               outcome_check_path=tmp / "outcome_none.csv")
            res = go()
            self.assertEqual(res["measured"], 1)
            first = {p.name: p.read_bytes() for p in out.iterdir()}
            go()
            second = {p.name: p.read_bytes() for p in out.iterdir()}
            self.assertEqual(first, second, "two runs must give byte-identical files")
            self.assertNotIn("PSI-25_B9_curve.csv", first)

            result = validate.validate_folder(str(out))
            self.assertEqual(result.errors, [], result.errors)
            evidence = json.loads(first["evidence.json"])
            measured = {r["quantity"]: r for r in evidence if r["provenance"] == "VIDEO_MEASURED"}
            self.assertAlmostEqual(measured["ignition_time"]["value"], 3.0, delta=1.0)
            self.assertAlmostEqual(measured["extinction_time"]["value"], 11.0, delta=1.0)
            self.assertGreater(measured["spread_rate"]["value"], 0)
            self.assertEqual(measured["spread_rate"]["unit"], "px/s")
            self.assertEqual({r["quantity"] for r in evidence if r["provenance"] == "PUBLISHED"},
                             {"published_spread_rate", "published_outcome"})
            module = json.loads(first["module.json"])
            self.assertEqual({f["name"] for f in module["files"]},
                             set(first) - {"module.json", "evidence.json", "findings.json"})
            self.assertIn("test identity not resolved", first["not_measurable.csv"].decode())
            for name in run.asset_list("PSI-25/B1"):
                self.assertIn(name, first)
            for name in ("PSI-25_B1_still1.jpg", "PSI-25_B1_still2.jpg", "PSI-25_B1_still3.jpg"):
                self.assertLess(len(first[name]), 150_000)
            index = json.loads(first["index.json"])
            self.assertEqual(index["module"], "video-to-data")
            entry = index["tests"][0]
            self.assertEqual(entry["test_id"], "PSI-25/B1")
            self.assertIn("index.json", {f["name"] for f in module["files"]})
            self.assertIn("PSI-25_B1_steps.jpg", {f["name"] for f in module["files"]})
            self.assertIn("PSI-25_B1_steps.jpg", entry["files"]["steps"])
            steps = cv2.imdecode(np.frombuffer(first["PSI-25_B1_steps.jpg"], np.uint8), cv2.IMREAD_COLOR)
            self.assertEqual(steps.shape[:2], (2 * run.STEPS_PANEL[1], 2 * run.STEPS_PANEL[0]))
            self.assertLess(len(first["PSI-25_B1_steps.jpg"]), 200_000)
            n_frames, out_fps = CLIP_LOG[-1]
            clip = entry["clip"]
            self.assertEqual(clip["file"], "PSI-25_B1_overlay.mp4")
            # clip duration times speed equals end minus start within one sampled frame
            self.assertLessEqual(abs(n_frames / out_fps * clip["speed"] - (clip["end_s"] - clip["start_s"])),
                                 1.0 / run.FPS + 1e-6)
            self.assertGreaterEqual(clip["start_s"], entry["events"]["ignition_time_s"] - 1e-6)
            curve = list(csv.DictReader(first["PSI-25_B1_curve.csv"].decode().splitlines()))
            self.assertEqual(list(curve[0]), run.CURVE_COLUMNS)
            self.assertEqual({r["stage"] for r in curve} - {""},
                             {s["stage"] for s in entry["stages"]})
            self.assertGreater(float(curve[len(curve) // 2]["flame_light"]), 0)
            self.assertIsNotNone(entry["rate"]["intercept_px"])
            lead = {round(float(r["time_s"]), 3): float(r["leading_edge_px"]) for r in curve if r["leading_edge_px"]}
            mid = (entry["rate"]["window_start_s"] + entry["rate"]["window_end_s"]) / 2
            near = min(lead, key=lambda x: abs(x - mid))
            line = entry["rate"]["intercept_px"] + entry["rate"]["value"] * near
            self.assertAlmostEqual(line, lead[near], delta=4.0)
            quantities = {r["quantity"] for r in evidence}
            self.assertIn("peak_flame_light", quantities)
            self.assertTrue(any(q.startswith("stage_duration_") for q in quantities))
            self.assertIn("fan_setting_at_ignition", quantities)
            self.assertIn("fan_drop_time", quantities)
            self.assertIn("flame_gone_minus_fan_drop", quantities)
            self.assertIn("PSI-25_B1_readout.csv", {f["name"] for f in module["files"]})
            self.assertTrue(first["PSI-25_B1_readout.csv"].startswith(b"time_s,fuel,fan,air,rad,clock_s"))
            finds = {f["id"] for f in json.loads(first["findings.json"])}
            self.assertIn("find-flame-gone-vs-fan-drop", finds)
            self.assertIn("find-clock-is-real-time", finds)
            self.assertNotIn("find-outcome-labels-vs-table-7-1", finds)
            self.assertIn(run.T_FINDING_ID, finds)
            self.assertEqual(len(index["t_series"]["tests"]), 12)
            self.assertEqual([t["test_id"] for t in index["tests"]], ["PSI-25/B1"])
            self.assertEqual(sum(1 for r in evidence if r["provenance"] == "SI_EXTRACTED"), 11)
            self.assertEqual(json.loads(first["validation.json"]),
                             {"status": "pending", "comparisons": []})
            # A validation.json written by the validation step survives a new run unchanged.
            kept = '{"status": "built", "comparisons": [{"id": "val-kept", "n": 5}]}\n'
            (out / "validation.json").write_text(kept, encoding="utf-8")
            go()
            self.assertEqual((out / "validation.json").read_text(encoding="utf-8"), kept)


if __name__ == "__main__":
    unittest.main()
