"""Tests for the cabin-air presets, custom air and coverage (apps/api/app/air.py, Linear DOB-83).

Run on the committed data/build/catalog.sqlite, so the numbers are the ones the site shows.
Standard library only. HTTP status codes are tested in apps/api/tests/test_catalog_routes.py
and, for the custom air, in tests/api/test_air_routes.py.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import unittest

from apps.api.app import air
from apps.api.app import catalog as cat
from pipeline.catalog import build


class PresetsTest(unittest.TestCase):
    def test_every_preset_is_complete_and_sourced(self):
        out = air.presets()
        ids = [p["id"] for p in out["presets"]]
        self.assertEqual(ids, ["station", "exploration", "intermediate_26_5", "exploration_34", "high_oxygen"])
        self.assertIn(out["default"], ids)
        for p in out["presets"]:
            with self.subTest(preset=p["id"]):
                for key in ("label", "plain", "tolerance_plain", "source"):
                    self.assertTrue(p[key].strip())
                self.assertEqual(set(p["window"]), {"o2_min", "o2_max", "pressure_kpa_min", "pressure_kpa_max",
                                                    "flow_cm_s_min", "flow_cm_s_max"})

    def test_fixed_atmospheres_use_the_team_tolerance(self):
        w = air.preset("station")["window"]
        self.assertEqual((w["o2_min"], w["o2_max"]), (0.20, 0.22))
        kpa = 14.7 * air.KPA_PER_PSI
        self.assertAlmostEqual(w["pressure_kpa_min"], kpa * 0.95, places=2)
        self.assertAlmostEqual(w["pressure_kpa_max"], kpa * 1.05, places=2)
        w = air.preset("exploration_34")["window"]
        self.assertEqual((w["o2_min"], w["o2_max"]), (0.33, 0.35))

    def test_open_windows_are_exactly_the_source(self):
        w = air.preset("exploration")["window"]
        self.assertEqual((w["o2_min"], w["o2_max"], w["pressure_kpa_min"]), (0.30, None, None))
        self.assertEqual(w["pressure_kpa_max"], 70.33)               # 10.2 psi
        self.assertIn("10.2 psi", air.preset("exploration")["source"])
        self.assertIn("PSI-20", air.preset("intermediate_26_5")["source"])

    def test_unknown_air(self):
        with self.assertRaises(air.UnknownAir) as cm:
            air.preset("moon")
        self.assertIn("station", str(cm.exception))


class CoverageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = cat.Catalog(build.DEFAULT_OUT).load()

    def stage(self, air_id, stage):
        return air.coverage(self.catalog, air_id)["stages"][stage]

    def test_station_flex(self):
        s = self.stage("station", "suppress")
        self.assertEqual((s["status"], s["inside"], s["stated"]), ("tested", 49, 274))
        flex = next(i for i in s["investigations"] if i["psi_id"] == "PSI-69")
        self.assertEqual((flex["inside"], flex["stated"]), (49, 274))

    def test_exploration_suppression_never_tested(self):
        s = self.stage("exploration", "suppress")
        self.assertEqual((s["status"], s["inside"], s["stated"]), ("never_tested", 0, 274))
        self.assertEqual(self.stage("exploration", "other")["inside"], 20)   # CFI-G gas flames

    def test_not_stated_differs_from_never_tested(self):
        # BASS-II and Saffire state oxygen but no pressure: a pressure window cannot place them,
        # an oxygen-only window can.
        self.assertEqual(self.stage("station", "spread")["status"], "not_stated")
        self.assertIsNone(self.stage("station", "spread")["inside"])
        spread = self.stage("high_oxygen", "spread")
        self.assertEqual((spread["status"], spread["inside"]), ("never_tested", 0))
        self.assertGreater(spread["stated"], 0)

    def test_every_staged_investigation_is_listed_once(self):
        cov = air.coverage(self.catalog, "station")
        listed = [i["psi_id"] for s in cov["stages"].values() for i in s["investigations"]]
        self.assertEqual(sorted(listed), sorted(self.catalog.investigations))

    def test_coverage_agrees_with_the_tests_query(self):
        for p in air.PRESETS:
            cov = air.coverage(self.catalog, p["id"])
            for stage in cov["stages"].values():
                for inv in stage["investigations"]:
                    if inv["inside"] is None:
                        continue
                    q = cat.TestQuery(psi_id=[inv["psi_id"]])
                    air.apply_to_query(q, p["id"])
                    with self.subTest(air=p["id"], psi_id=inv["psi_id"]):
                        self.assertEqual(self.catalog.query_tests(q)["total"], inv["inside"])


class ApplyToQueryTest(unittest.TestCase):
    def test_air_sets_ranges_and_the_tighter_bound_wins(self):
        q = cat.TestQuery(o2_min=0.205)
        air.apply_to_query(q, "station")
        self.assertEqual((q.o2_min, q.o2_max), (0.205, 0.22))
        self.assertIsNotNone(q.pressure_min)
        q = cat.TestQuery()
        air.apply_to_query(q, None)
        self.assertIsNone(q.o2_min)


class CustomAirTest(unittest.TestCase):
    """A visitor's own point (the oxygen and pressure sliders): same tolerance, ranges from the data."""
    STATION = (0.21, 14.7 * air.KPA_PER_PSI)       # the station preset's own point

    @classmethod
    def setUpClass(cls):
        cls.catalog = cat.Catalog(build.DEFAULT_OUT).load()
        cls.ranges = air.custom_ranges(cls.catalog)

    def test_ranges_come_from_the_catalogued_tests(self):
        r = self.ranges
        self.assertEqual(r, {"o2_min": 0.12, "o2_max": 0.4, "o2_step": 0.005,
                             "pressure_kpa_min": 43.0, "pressure_kpa_max": 507.0, "pressure_kpa_step": 0.5})
        rows = [t for t in self.catalog.tests if not t["is_note"]]
        o2 = [t["o2_mole_fraction"] for t in rows if t["o2_mole_fraction"] is not None]
        kpa = [t["pressure_kpa"] for t in rows if t["pressure_kpa"] is not None and t["pressure_kpa"] > 0]
        # rounded outward, by less than one step
        self.assertTrue(0 <= min(o2) - r["o2_min"] < r["o2_step"])
        self.assertTrue(0 <= r["o2_max"] - max(o2) < r["o2_step"])
        self.assertTrue(0 <= min(kpa) - r["pressure_kpa_min"] < r["pressure_kpa_step"])
        self.assertTrue(0 <= r["pressure_kpa_max"] - max(kpa) < r["pressure_kpa_step"])

    def test_flex_114_zero_pressure_does_not_start_the_slider_at_zero(self):
        self.assertEqual(self.catalog._tests_by_id["PSI-69/114"]["pressure_kpa"], 0.0)
        self.assertGreater(self.ranges["pressure_kpa_min"], 0)

    def test_presets_carry_the_ranges_only_with_a_catalog(self):
        self.assertEqual(list(air.presets()), ["default", "presets"])              # unchanged without one
        out = air.presets(self.catalog)
        self.assertEqual(list(out), ["default", "presets", "custom", "custom_plain"])
        self.assertEqual(out["presets"], air.presets()["presets"])
        c = out["custom"]
        self.assertLess(c["o2_min"], c["o2_max"])
        self.assertLess(c["pressure_kpa_min"], c["pressure_kpa_max"])
        self.assertGreater(c["o2_step"], 0)
        self.assertGreater(c["pressure_kpa_step"], 0)
        self.assertIn("catalogued", out["custom_plain"])

    def test_ranges_contain_every_preset_point(self):
        r = self.ranges
        points = [(0.21, 14.7), (0.265, 10.2), (0.34, 8.2)]                       # the three PSI-20 atmospheres
        for o2, psi in points:
            with self.subTest(o2=o2, psi=psi):
                self.assertTrue(r["o2_min"] <= o2 <= r["o2_max"])
                self.assertTrue(r["pressure_kpa_min"] <= psi * air.KPA_PER_PSI <= r["pressure_kpa_max"])
        for p in air.PRESETS:                                     # and the stated bounds of the open windows
            for side in ("o2", "pressure_kpa"):
                for end in ("min", "max"):
                    v = p["window"][f"{side}_{end}"]
                    if v is not None and p["tolerance_plain"] == air.OPEN_PLAIN:
                        with self.subTest(preset=p["id"], bound=f"{side}_{end}"):
                            self.assertTrue(r[f"{side}_min"] <= v <= r[f"{side}_max"])

    def test_custom_window_is_the_point_preset_window(self):
        custom = air.custom_air(self.catalog, *self.STATION)
        station = air.preset("station")
        self.assertEqual(custom["window"], station["window"])
        self.assertEqual(custom["tolerance_plain"], station["tolerance_plain"])
        self.assertEqual(air.point_window(0.34, 8.2 * air.KPA_PER_PSI), air.preset("exploration_34")["window"])
        self.assertEqual(list(custom), ["id", "label", "plain", "tolerance_plain", "source", "window", "point"])
        self.assertEqual((custom["id"], custom["label"]), ("custom", "Custom air"))
        self.assertEqual(custom["plain"], "21% oxygen at 101.4 kPa (14.7 psi)")
        self.assertEqual(custom["source"], "Chosen by the visitor. Not a NASA atmosphere.")
        self.assertEqual(custom["point"], {"o2_mole_fraction": 0.21, "pressure_kpa": self.STATION[1]})

    def test_query_strings_are_parsed(self):
        custom = air.custom_air(self.catalog, "0.265", "70.5")
        self.assertEqual(custom["point"], {"o2_mole_fraction": 0.265, "pressure_kpa": 70.5})
        self.assertEqual(custom["plain"], "26.5% oxygen at 70.5 kPa (10.2 psi)")

    def test_custom_coverage_equals_the_station_preset(self):
        custom = air.coverage(self.catalog, air.custom_air(self.catalog, *self.STATION))
        station = air.coverage(self.catalog, "station")
        self.assertEqual(custom["air"], "custom")
        self.assertEqual(custom["window"], station["window"])
        self.assertEqual(custom["constrains"], station["constrains"])
        for stage in station["stages"]:
            with self.subTest(stage=stage):
                self.assertEqual(custom["stages"][stage], station["stages"][stage])

    def test_points_outside_the_range_are_refused_with_the_range(self):
        r = self.ranges
        bad = [(r["o2_min"] - 0.001, 100), (r["o2_max"] + 0.001, 100),
               (0.21, r["pressure_kpa_min"] - 0.1), (0.21, r["pressure_kpa_max"] + 0.1),
               (None, 100), (0.21, None), ("abc", 100), (0.21, ""), ("nan", 100), (0.21, "inf")]
        for o2, kpa in bad:
            with self.subTest(o2=o2, kpa=kpa):
                with self.assertRaises(air.BadAir) as cm:
                    air.custom_air(self.catalog, o2, kpa)
                self.assertIn("from 0.12 to 0.4", str(cm.exception))
                self.assertIn("from 43 to 507", str(cm.exception))
        # the bounds themselves are allowed
        air.custom_air(self.catalog, r["o2_min"], r["pressure_kpa_min"])
        air.custom_air(self.catalog, r["o2_max"], r["pressure_kpa_max"])

    def test_resolve_preset_or_custom(self):
        self.assertIs(air.resolve(self.catalog, "station"), air.preset("station"))
        custom = air.resolve(self.catalog, "exploration", *self.STATION)       # the point wins over air
        self.assertEqual((custom["id"], custom["window"]), ("custom", air.preset("station")["window"]))
        for one in ((0.21, None), (None, 100)):
            with self.subTest(given=one):
                with self.assertRaises(air.BadAir):
                    air.resolve(self.catalog, "station", *one)
        with self.assertRaises(air.UnknownAir):
            air.resolve(self.catalog, "moon")


if __name__ == "__main__":
    unittest.main()
