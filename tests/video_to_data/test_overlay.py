"""Checks on pipeline/video_to_data/overlay.py (the on-screen data reader).

Run: pytest tests/video_to_data/test_overlay.py
Needs no NASA data: the real overlay strips are small PNG files in
tests/video_to_data/fixtures/overlay/ (cut from PSI-25 Bhattacharjee videos), with the
expected text typed by a person after looking at each strip (expected.json). The series
tests (fan_changes, fan_drop_time, clock_rate) use numbers built in the test.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import csv
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.video_to_data import overlay  # noqa: E402

FIX = Path(__file__).parent / "fixtures" / "overlay"
EXPECTED = json.loads((FIX / "expected.json").read_text())["strips"]


def load_strip(name):
    g = cv2.imread(str(FIX / name), cv2.IMREAD_GRAYSCALE)
    assert g is not None, name
    return g


def read_strip(gray):
    res = overlay.read_cells(gray, origin=overlay.CROP[:2])
    fuel, air, fan, rad = overlay.parse_values(res.values)
    clk = overlay.parse_clock(res.clock)
    return {"fuel": fuel, "air": air, "fan": fan, "rad": rad, "clock": clk}, res


def clock_seconds(text):
    h, m, s = (int(x) for x in text.split(":"))
    return h * 3600 + m * 60 + s


class TestFixtures(unittest.TestCase):
    def test_fixture_set_covers_the_cases_asked_for(self):
        vids = {e["video"] for e in EXPECTED.values()}
        fans = {e["fan"] for e in EXPECTED.values()}
        self.assertGreaterEqual(len(EXPECTED), 10)
        self.assertGreaterEqual(len(vids), 4)
        self.assertIn(38, fans)
        self.assertTrue({46, 47} & fans)
        self.assertTrue({59, 60, 61, 62} & fans)
        self.assertGreaterEqual(sum(e["lit_room"] for e in EXPECTED.values()), 2)
        self.assertTrue(any(e["fan"] >= 100 for e in EXPECTED.values()), "a 3-digit FAN")
        self.assertTrue(any(e["air"] >= 10 for e in EXPECTED.values()), "a 2-digit AIR")

    def test_fixture_files_are_small(self):
        for name in EXPECTED:
            self.assertLess((FIX / name).stat().st_size, 20_000, name)

    def test_each_strip_reads_to_the_expected_numbers(self):
        """FUEL, AIR, FAN and the clock read exactly. Where the expected file lists a field in
        reader_none, the reader must return None for it (an ambiguous 8/9 or 4/6 at that pixel
        phase), never another number."""
        for name, e in EXPECTED.items():
            got, res = read_strip(load_strip(name))
            none_ok = set(e.get("reader_none", []))
            self.assertGreater(res.label_score, overlay.MIN_LABEL_SCORE, name)
            for field in ("fuel", "air", "fan"):
                if field in none_ok:
                    self.assertIsNone(got[field], f"{name} {field} should be unreadable")
                else:
                    self.assertEqual(got[field], e[field], f"{name} {field}: {res.values!r}")
            if "clock" in none_ok:
                self.assertIsNone(got["clock"], f"{name} clock should be unreadable")
            else:
                self.assertEqual(got["clock"], (e["date"], clock_seconds(e["clock"])), f"{name}: {res.clock!r}")

    def test_rad_reads_to_the_visible_value_or_none(self):
        """RAD: the last character is cut by the frame edge. The reader gives the shown value
        or None, and on these strips it gives the value."""
        for name, e in EXPECTED.items():
            got, res = read_strip(load_strip(name))
            self.assertIn(got["rad"], (e["rad"], None), f"{name}: {res.values!r}")
            self.assertEqual(got["rad"], e["rad"], f"{name}: {res.values!r}")

    def test_full_frame_gives_the_same_reading_as_the_strip(self):
        name = "B3_t7_0.png"
        strip = load_strip(name)
        frame = np.zeros((overlay.FRAME_H, overlay.FRAME_W), dtype=np.uint8)
        x0, y0, x1, y1 = overlay.CROP
        frame[y0:y1, x0:x1] = strip
        a = overlay.read_cells(frame)
        b = overlay.read_cells(strip, origin=(x0, y0))
        self.assertEqual((a.values, a.clock), (b.values, b.clock))
        bgr = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
        c = overlay.read_cells(bgr)
        self.assertEqual((a.values, a.clock), (c.values, c.clock))

    def test_corrupted_fan_digit_reads_or_gives_none_never_a_wrong_number(self):
        """Overwrite the FAN units digit cell with noise of growing strength. The reader must
        return the true FAN or None; and at full noise it must return None."""
        name = "B3_t7_0.png"
        e = EXPECTED[name]
        strip = load_strip(name)
        _, res = read_strip(strip)
        # find the cell by fitting the grid on the strip itself
        canvas = np.zeros((overlay.FRAME_H, overlay.FRAME_W), dtype=np.uint8)
        x0, y0, x1, y1 = overlay.CROP
        canvas[y0:y1, x0:x1] = strip
        dy, X, P, _ = overlay._fit_grid(canvas)
        col = 13  # FAN units digit
        cx = int(round(X + col * P)) - x0
        cy = overlay.ROW_Y[1] + dy - y0
        results = []
        for seed in range(12):
            for strength in (0.15, 0.35, 0.6, 1.0):
                rng = np.random.default_rng(seed)
                s = strip.copy()
                cell = s[cy : cy + overlay.GLYPH_H, cx : cx + overlay.GLYPH_W].astype(np.float32)
                noise = rng.uniform(0, 255, cell.shape).astype(np.float32)
                s[cy : cy + overlay.GLYPH_H, cx : cx + overlay.GLYPH_W] = (
                    (1 - strength) * cell + strength * noise
                ).astype(np.uint8)
                got, _ = read_strip(s)
                self.assertIn(got["fan"], (e["fan"], None), f"seed {seed} strength {strength}")
                self.assertEqual(got["air"], e["air"])  # other cells are untouched
                if strength == 1.0:
                    results.append(got["fan"])
        self.assertTrue(all(r is None for r in results), results)

    def test_a_cell_replaced_by_a_different_real_glyph_is_not_read_as_the_old_one(self):
        """Paste the FAN tens digit '4' of B3 over the units digit cell: the reading changes to the
        pasted digit or None, but is never the old digit."""
        name = "B3_t7_0.png"
        strip = load_strip(name)
        canvas = np.zeros((overlay.FRAME_H, overlay.FRAME_W), dtype=np.uint8)
        x0, y0, x1, y1 = overlay.CROP
        canvas[y0:y1, x0:x1] = strip
        dy, X, P, _ = overlay._fit_grid(canvas)
        cy = overlay.ROW_Y[1] + dy - y0
        c12 = int(round(X + 12 * P)) - x0
        c13 = int(round(X + 13 * P)) - x0
        s = strip.copy()
        w = overlay.GLYPH_W
        s[cy : cy + overlay.GLYPH_H, c13 : c13 + w] = strip[cy : cy + overlay.GLYPH_H, c12 : c12 + w]
        got, _ = read_strip(s)
        self.assertNotEqual(got["fan"], 47)
        self.assertIn(got["fan"], (44, None))

    def test_blank_strips_return_none_for_every_value(self):
        blanks = {
            "black": np.zeros((56, 570), dtype=np.uint8),
            "grey": np.full((56, 570), 90, dtype=np.uint8),
            "noise": np.random.default_rng(1).integers(0, 255, (56, 570)).astype(np.uint8),
        }
        for label, g in blanks.items():
            got, res = read_strip(g)
            for k in ("fuel", "air", "fan", "rad", "clock"):
                self.assertIsNone(got[k], f"{label} {k}")
            self.assertEqual(set(res.values), {"?"})

    def test_a_frame_without_the_label_line_is_not_read(self):
        """The camera playback screen (no overlay) must give None, even if it has other text."""
        strip = load_strip("B1_t13_89.png").copy()
        x0, y0, _, _ = overlay.CROP
        top = overlay.ROW_Y[0] - 2 - y0
        strip[top : top + overlay.GLYPH_H + 4, :] = 0  # wipe the label line only
        got, _ = read_strip(strip)
        for k in ("fuel", "air", "fan", "rad", "clock"):
            self.assertIsNone(got[k], k)


class TestGlyphFile(unittest.TestCase):
    def test_glyph_file_has_every_character_and_clean_bitmaps(self):
        data = json.loads(overlay.GLYPH_FILE.read_text())
        self.assertIn("PSI-25", data["note"])
        glyphs = data["glyphs"]
        for ch in "0123456789-./:FUELAIRND":
            self.assertIn(ch, glyphs, ch)
            self.assertGreaterEqual(len(glyphs[ch]), 1)
        for ch, variants in glyphs.items():
            for rows in variants:
                self.assertEqual(len(rows), data["cell"]["height"])
                for r in rows:
                    self.assertEqual(len(r), data["cell"]["width"])
                    self.assertLessEqual(set(r), {"0", "1"})
        self.assertLess(overlay.GLYPH_FILE.stat().st_size, 100_000)


class TestParse(unittest.TestCase):
    def test_parse_values(self):
        self.assertEqual(overlay.parse_values("  -2    5   62  1.17"), (-2, 5, 62, 1.17))
        self.assertEqual(overlay.parse_values("  -2   19  122  0.50"), (-2, 19, 122, 0.5))

    def test_unreadable_character_makes_that_field_none_only(self):
        self.assertEqual(overlay.parse_values("  -2    5   6?  1.17"), (-2, 5, None, 1.17))
        self.assertEqual(overlay.parse_values("  -2    5   62  1.1?"), (-2, 5, 62, None))
        self.assertEqual(overlay.parse_values(" ? -2    5   62  1.17")[0], None)

    def test_blank_field_is_none(self):
        self.assertEqual(overlay.parse_values(" " * 20), (None, None, None, None))

    def test_odd_shapes_are_none(self):
        self.assertIsNone(overlay.parse_values("  -2    5   6 2  1.17")[2])
        self.assertIsNone(overlay.parse_values("  -2    5   62  1..7")[3])

    def test_parse_clock(self):
        self.assertEqual(overlay.parse_clock("02/20/14 10:09:55"), ("02/20/14", 36595))
        self.assertIsNone(overlay.parse_clock("02/20/14 10:0?:55"))
        self.assertIsNone(overlay.parse_clock("02/20/14 25:09:55"))
        self.assertIsNone(overlay.parse_clock("02/20/14 10:69:55"))
        self.assertIsNone(overlay.parse_clock(""))


def series(levels, dt=0.2):
    """levels: list of (duration_s, value); returns (times, values) at 5 Hz."""
    t, v, now = [], [], 0.0
    for dur, val in levels:
        for _ in range(int(round(dur / dt))):
            t.append(round(now, 3))
            v.append(val)
            now += dt
    return t, v


class TestFanChanges(unittest.TestCase):
    def test_flicker_between_61_and_62_is_not_a_change(self):
        t, _ = series([(20, 0)])
        v = [61 if i % 3 else 62 for i in range(len(t))]
        self.assertEqual(overlay.fan_changes(t, v), [])
        self.assertIsNone(overlay.fan_drop_time(t, v))

    def test_drop_61_to_46_to_38_gives_the_right_times(self):
        t, v = series([(10, 61), (6, 46), (4, 38)])
        ch = overlay.fan_changes(t, v)
        self.assertEqual(ch, [(10.0, 61, 46), (16.0, 46, 38)])
        # the fall began with the first step
        self.assertEqual(overlay.fan_drop_time(t, v), 10.0)

    def test_drop_with_flicker_on_both_levels(self):
        t, _ = series([(30, 0)])
        v = [(61 if i % 2 else 62) if x < 15 else (46 if i % 2 else 47) for i, x in enumerate(t)]
        ch = overlay.fan_changes(t, v)
        self.assertEqual(len(ch), 1)
        self.assertAlmostEqual(ch[0][0], 15.0, places=3)
        self.assertEqual(ch[0][2] < ch[0][1], True)

    def test_one_sample_glitch_is_ignored(self):
        t, v = series([(10, 61), (10, 61)])
        v[25] = 12  # one wrong reading
        v[60] = 99
        self.assertEqual(overlay.fan_changes(t, v), [])
        self.assertIsNone(overlay.fan_drop_time(t, v))

    def test_a_short_blip_is_not_held_long_enough(self):
        t, v = series([(10, 61), (0.6, 40), (10, 61)])
        self.assertEqual(overlay.fan_changes(t, v), [])
        # but with a lower hold time it counts
        self.assertEqual(len(overlay.fan_changes(t, v, min_hold_s=0.4)), 2)

    def test_slow_ramp_up_is_a_staircase_one_change_per_min_step(self):
        """Documented choice: +1 every 2 s is reported as one change each time the reading is
        min_step (2) units away from where the previous level began, so every 4 s here."""
        t, v = series([(2, 50), (2, 51), (2, 52), (2, 53), (2, 54), (2, 55), (2, 56), (2, 57), (2, 58)])
        ch = overlay.fan_changes(t, v)
        self.assertGreaterEqual(len(ch), 3)
        self.assertTrue(all(b > a for _, a, b in ch), ch)
        self.assertEqual(ch[0][0], 4.0)  # 50 -> 52 at the first reading of 52
        gaps = [b[0] - a[0] for a, b in zip(ch, ch[1:])]
        self.assertTrue(all(abs(g - 4.0) < 1e-6 for g in gaps), gaps)
        self.assertIsNone(overlay.fan_drop_time(t, v), "a ramp up is not a fall")
        # with min_step 1 the same ramp is one change per unit
        self.assertEqual(len(overlay.fan_changes(t, v, min_step=1)), 8)

    def test_unreadable_samples_are_ignored(self):
        t, v = series([(10, 61), (10, 46)])
        v = [None if i % 4 == 0 else x for i, x in enumerate(v)]
        ch = overlay.fan_changes(t, v)
        self.assertEqual(len(ch), 1)
        self.assertEqual((ch[0][1], ch[0][2]), (61, 46))
        self.assertAlmostEqual(ch[0][0], 10.0, delta=0.25)

    def test_empty_and_constant_series(self):
        self.assertEqual(overlay.fan_changes([], []), [])
        self.assertEqual(overlay.fan_changes([0.0, 0.2], [None, None]), [])
        self.assertIsNone(overlay.fan_drop_time([], []))
        t, v = series([(10, 55)])
        self.assertEqual(overlay.fan_changes(t, v), [])

    def test_last_fall_is_chosen_when_there_are_two(self):
        t, v = series([(10, 61), (10, 50), (30, 50), (10, 40)])
        self.assertEqual(overlay.fan_drop_time(t, v), 50.0)
        t2, v2 = series([(10, 61), (10, 50), (10, 70)])
        self.assertEqual(overlay.fan_drop_time(t2, v2), 10.0)


B1_READOUT = [(35.6, 62), (35.8, 62), (36.0, 59), (36.2, 58), (36.4, 57), (36.6, 55), (36.8, 54),
              (37.0, 54), (37.2, 50), (37.4, 51), (37.6, 49), (37.8, 47), (38.0, None), (38.2, 43),
              (38.4, 43), (38.6, 41), (38.8, 41), (39.0, 39), (39.2, 39)]


def b1_series():
    """FAN of B1 as read: 62 until 35.8 s, a ramp from 36.0 s, 38 from 39.4 s (to 45 s)."""
    t = [round(0.2 * k, 3) for k in range(0, 179)]  # 0 to 35.6 s
    v = [62] * len(t)
    for tt, f in B1_READOUT[1:]:
        t.append(tt)
        v.append(f)
    k = 39.4
    while k <= 45.0:
        t.append(round(k, 3))
        v.append(38)
        k += 0.2
    return t, v


class TestFanFallTimes(unittest.TestCase):
    def test_b1_ramp_starts_at_36_and_settles_near_39_4(self):
        t, v = b1_series()
        start, settled, before, after = overlay.fan_fall_times(t, v)
        self.assertEqual(start, 36.0)
        self.assertAlmostEqual(settled, 39.4, delta=0.5)
        self.assertEqual((before, after), (62, 38))
        self.assertEqual(overlay.fan_drop_time(t, v), 36.0)
        # the old behaviour (the settling time) would put the fall at about 39 s, not 36 s
        self.assertGreater(settled - start, 2.5)

    def test_a_step_without_a_ramp_starts_where_it_settles(self):
        t, v = series([(10, 61), (10, 46)])
        start, settled, before, after = overlay.fan_fall_times(t, v)
        self.assertAlmostEqual(start, settled, delta=0.2)
        self.assertEqual((before, after), (61, 46))

    def test_flicker_before_the_fall_does_not_move_the_start_earlier(self):
        t, v = b1_series()
        v = [61 if (i % 4 == 1 and x < 30) else f for i, (x, f) in enumerate(zip(t, v))]
        self.assertEqual(overlay.fan_fall_times(t, v)[0], 36.0)

    def test_a_brief_dip_that_recovers_is_not_the_start(self):
        t, v = b1_series()
        v = [50 if 20.0 <= x < 20.4 else f for x, f in zip(t, v)]
        self.assertEqual(overlay.fan_fall_times(t, v)[0], 36.0)

    def test_unreadable_samples_inside_the_ramp_are_skipped(self):
        t, v = b1_series()
        v = [None if 36.0 < x < 38.0 and i % 2 else f for i, (x, f) in enumerate(zip(t, v))]
        self.assertAlmostEqual(overlay.fan_fall_times(t, v)[0], 36.0, delta=0.2)
        t, v = b1_series()
        v = [None if x == 36.0 else f for x, f in zip(t, v)]
        self.assertAlmostEqual(overlay.fan_fall_times(t, v)[0], 36.2, delta=0.01)

    def test_no_fall_gives_none(self):
        t, v = series([(10, 50), (10, 60)])
        self.assertIsNone(overlay.fan_fall_times(t, v))
        self.assertIsNone(overlay.fan_fall_times([], []))
        self.assertIsNone(overlay.fan_fall_times([0.0, 0.2], [None, None]))

    def test_a_chain_of_steps_starts_at_the_first_step(self):
        t, v = series([(10, 61), (6, 46), (4, 38)])
        start, settled, before, after = overlay.fan_fall_times(t, v)
        self.assertEqual((start, settled, before, after), (10.0, 16.0, 61, 38))


class TestClockRate(unittest.TestCase):
    def test_real_time_series_gives_one(self):
        t = [i * 0.2 for i in range(300)]
        c = [36000 + int(x) for x in t]
        rate, n = overlay.clock_rate(t, c)
        self.assertAlmostEqual(rate, 1.0, delta=0.02)
        self.assertEqual(n, 300)

    def test_slowed_series_gives_point_six(self):
        t = [i * 0.2 for i in range(300)]
        c = [36000 + int(0.6 * x) for x in t]
        rate, _ = overlay.clock_rate(t, c)
        self.assertAlmostEqual(rate, 0.6, delta=0.02)

    def test_missing_readings_and_a_misread_are_ignored(self):
        t = [i * 0.2 for i in range(300)]
        c = [36000 + int(x) for x in t]
        c2 = list(c)
        for i in range(0, 300, 3):
            c2[i] = None
        c2[100] = 36999  # one misread
        c2[200] = 100
        rate, n = overlay.clock_rate(t, c2)
        self.assertAlmostEqual(rate, 1.0, delta=0.02)
        self.assertEqual(n, 300 - 100)

    def test_midnight_and_short_series(self):
        t = [float(i) for i in range(60)]
        c = [(86400 - 30 + i) % 86400 for i in range(60)]
        rate, _ = overlay.clock_rate(t, c)
        self.assertAlmostEqual(rate, 1.0, delta=0.05)
        self.assertEqual(overlay.clock_rate([0.0], [5]), (None, 1))
        self.assertEqual(overlay.clock_rate([], []), (None, 0))
        self.assertEqual(overlay.clock_rate([0.0, 0.5], [5, 5]), (None, 2))


class TestCsvAndMain(unittest.TestCase):
    def test_csv_has_exactly_the_agreed_columns(self):
        self.assertEqual(overlay.CSV_COLUMNS, ["time_s", "frame", "fuel", "air", "fan", "rad", "clock", "score"])
        rows = [
            {"time_s": 0.0, "frame": 0, "fuel": -2, "air": 5, "fan": 62, "rad": 1.17, "clock": 36595, "score": 0.9, "date": "x"},
            {"time_s": 0.2, "frame": 6, "fuel": None, "air": None, "fan": None, "rad": None, "clock": None, "score": 0.0},
        ]
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.csv")
            overlay.write_csv(rows, p)
            with open(p) as fh:
                got = list(csv.reader(fh))
        self.assertEqual(got[0], ["time_s", "frame", "fuel", "air", "fan", "rad", "clock", "score"])
        self.assertEqual(got[1], ["0.0", "0", "-2", "5", "62", "1.17", "36595", "0.9"])
        self.assertEqual(got[2], ["0.2", "6", "", "", "", "", "", "0.0"])
        self.assertTrue(all(len(r) == 8 for r in got))

    def test_main_reads_a_video_and_writes_the_csv(self):
        strip = load_strip("B1_t13_89.png")
        frame = np.zeros((overlay.FRAME_H, overlay.FRAME_W, 3), dtype=np.uint8)
        x0, y0, x1, y1 = overlay.CROP
        frame[y0:y1, x0:x1] = strip[:, :, None]
        with tempfile.TemporaryDirectory() as d:
            vp = os.path.join(d, "v.avi")
            w = cv2.VideoWriter(vp, cv2.VideoWriter_fourcc(*"MJPG"), 29.97, (overlay.FRAME_W, overlay.FRAME_H))
            self.assertTrue(w.isOpened())
            for _ in range(36):
                w.write(frame)
            w.release()
            out = os.path.join(d, "o.csv")
            rc = overlay.main([vp, "--out", out, "--fps", "5"])
            self.assertEqual(rc, 0)
            with open(out) as fh:
                rows = list(csv.DictReader(fh))
        self.assertEqual(list(rows[0].keys()), overlay.CSV_COLUMNS)
        self.assertGreaterEqual(len(rows), 6)
        self.assertEqual([r["frame"] for r in rows[:3]], ["0", "6", "12"])
        reads = [r["fan"] for r in rows]
        self.assertTrue(all(x in ("62", "") for x in reads), reads)
        self.assertGreaterEqual(reads.count("62"), len(rows) - 1)

    def test_main_rejects_a_missing_video(self):
        with self.assertRaises(SystemExit):
            overlay.main(["/nonexistent/video.mp4", "--out", "/tmp/never.csv"])


if __name__ == "__main__":
    unittest.main()
