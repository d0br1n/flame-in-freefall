"""Tests for the ranking behind /api/v1/catalog/rank (apps/api/app/rank.py, Linear DOB-73).

Run on the committed data/build/catalog.sqlite. Standard library only. The HTTP status codes are
tested in apps/api/tests/test_catalog_routes.py.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import unittest

from apps.api.app import air, rank
from apps.api.app import catalog as cat
from pipeline.catalog import build


def psi_number(pid):
    return int(pid.split("-")[1])


class RankTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = cat.Catalog(build.DEFAULT_OUT).load()
        cls.station = rank.rank(cls.catalog, "station")
        cls.exploration = rank.rank(cls.catalog, "exploration")

    def item(self, out, pid):
        return next(i for i in out["items"] if i["psi_id"] == pid)

    def test_shape(self):
        out = self.station
        self.assertEqual((out["air"], out["weights"], out["weights_are_default"], out["formula"]),
                         ("station", rank.DEFAULT_WEIGHTS, True, rank.FORMULA))
        self.assertEqual(len(out["items"]), 24)
        self.assertEqual(list(out["items"][0]), ["rank", "psi_id", "acronym", "pillar", "stage", "score", "parts", "reason"])
        self.assertEqual(set(out["items"][0]["parts"]), set(rank.PARTS))

    def test_ranks_scores_and_ties(self):
        items = self.station["items"]
        self.assertEqual([i["rank"] for i in items], list(range(1, 25)))
        for a, b in zip(items, items[1:]):
            self.assertGreaterEqual(a["score"], b["score"])
            if a["score"] == b["score"]:
                self.assertLess(psi_number(a["psi_id"]), psi_number(b["psi_id"]))

    def test_scores_and_reasons(self):
        for out in (self.station, self.exploration):
            for i in out["items"]:
                with self.subTest(air=out["air"], psi_id=i["psi_id"]):
                    self.assertTrue(0 <= i["score"] <= 1)
                    self.assertTrue(i["reason"].strip())
                    for name, part in i["parts"].items():
                        self.assertTrue(0 <= part["score"] <= 1, name)
                        self.assertTrue(part["reason"].strip(), name)
                    total = sum(rank.DEFAULT_WEIGHTS[p] * i["parts"][p]["score"] for p in rank.PARTS)
                    self.assertAlmostEqual(i["score"], total, places=4)

    def test_evidence_comes_from_air_coverage(self):
        flex = self.item(self.station, "PSI-69")["parts"]["evidence"]
        self.assertEqual((flex["inside"], flex["stated"]), (49, 274))
        self.assertAlmostEqual(flex["score"], round(49 / 274, 4))
        self.assertIn("49 of 274", flex["reason"])
        unstated = self.item(self.station, "PSI-25")["parts"]["evidence"]
        self.assertEqual((unstated["score"], unstated["stated"]), (0.0, 0))
        self.assertIn("states", unstated["reason"])

    def test_changing_air_changes_the_evidence_part(self):
        self.assertNotEqual(self.item(self.station, "PSI-69")["parts"]["evidence"]["score"],
                            self.item(self.exploration, "PSI-69")["parts"]["evidence"]["score"])
        self.assertEqual(self.item(self.exploration, "PSI-69")["parts"]["evidence"]["inside"], 0)
        self.assertEqual(self.item(self.exploration, "PSI-159")["parts"]["evidence"]["inside"], 20)

    def test_pillar_part_follows_the_challenge_page(self):
        self.assertEqual(self.item(self.station, "PSI-69")["parts"]["pillar"]["score"], 1.0)
        self.assertEqual(self.item(self.station, "PSI-10")["parts"]["pillar"]["score"], 0.0)   # fundamentals

    def test_unknown_air(self):
        with self.assertRaises(air.UnknownAir):
            rank.rank(self.catalog, "moon")

    def test_preset_answer_keeps_its_fields(self):
        self.assertEqual(list(self.station), ["air", "weights", "weights_are_default", "formula", "items"])

    def test_custom_air_at_the_station_point_ranks_like_the_station(self):
        custom_air = air.custom_air(self.catalog, 0.21, 14.7 * air.KPA_PER_PSI)
        out = rank.rank(self.catalog, custom_air)
        self.assertEqual(list(out), ["air", "window", "weights", "weights_are_default", "formula", "items"])
        self.assertEqual((out["air"], out["window"]), ("custom", air.preset("station")["window"]))
        self.assertEqual([i["psi_id"] for i in out["items"]], [i["psi_id"] for i in self.station["items"]])
        self.assertEqual([i["score"] for i in out["items"]], [i["score"] for i in self.station["items"]])
        flex = self.item(out, "PSI-69")["parts"]["evidence"]
        self.assertEqual((flex["inside"], flex["stated"]), (49, 274))
        self.assertIn("this custom air, 21% oxygen at 101.4 kPa (14.7 psi)", flex["reason"])


class WeightsTest(unittest.TestCase):
    def test_defaults(self):
        self.assertEqual(rank.weights_from(), (rank.DEFAULT_WEIGHTS, True))

    def test_weights_are_normalised(self):
        w, default = rank.weights_from(w_evidence=1, w_pillar=0, w_data=0, w_fuel=0)
        self.assertFalse(default)
        self.assertEqual(w, {"pillar": 0.0, "evidence": 1.0, "data": 0.0, "fuel": 0.0})
        w, _ = rank.weights_from(w_evidence=0.75)                 # others keep 0.25: total 1.5
        self.assertAlmostEqual(sum(w.values()), 1.0)
        self.assertAlmostEqual(w["evidence"], 0.5)

    def test_evidence_only_ranks_by_share_inside(self):
        catalog = cat.Catalog(build.DEFAULT_OUT).load()
        w, _ = rank.weights_from(w_pillar=0, w_evidence=1, w_data=0, w_fuel=0)
        out = rank.rank(catalog, "station", w, False)
        top = out["items"][0]
        self.assertEqual(top["score"], top["parts"]["evidence"]["score"])
        self.assertLessEqual(max(i["score"] for i in out["items"]), 1.0)

    def test_bad_weights(self):
        for kw in ({"w_pillar": -1}, {"w_pillar": 0, "w_evidence": 0, "w_data": 0, "w_fuel": 0}):
            with self.subTest(**kw):
                with self.assertRaises(cat.BadQuery):
                    rank.weights_from(**kw)


if __name__ == "__main__":
    unittest.main()
