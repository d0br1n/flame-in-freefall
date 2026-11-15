"""Tests for the investigation compare view (apps/api/app/catalog.py, Linear DOB-75).

Done when: FLEX (PSI-69) and FLEX-2 (PSI-68) side by side show both columns with values from
the database. Those checks read the committed data/build/catalog.sqlite; the rules (2 to 4 IDs,
unknown IDs, never merging ranges) run on the fake catalog. The HTTP route is tested in
apps/api/tests/test_catalog_routes.py. Standard library only.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import sqlite3
import tempfile
import unittest
from pathlib import Path

from apps.api.app import catalog as cat
from pipeline.catalog import build
from tests.catalog.raw_fixture import write_raw

COMMITTED_DB = build.REPO / "data" / "build" / "catalog.sqlite"


def cells(out, key):
    return next(r for r in out["rows"] if r["key"] == key)["cells"]


class FlexAgainstFlex2(unittest.TestCase):
    """The issue's Done-when, on the real database."""

    @classmethod
    def setUpClass(cls):
        cls.catalog = cat.Catalog(COMMITTED_DB).load()
        cls.out = cls.catalog.compare(["PSI-69", "PSI-68"])
        cls.db = sqlite3.connect(f"file:{COMMITTED_DB.as_posix()}?mode=ro", uri=True)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_both_columns_in_the_order_asked(self):
        self.assertEqual(self.out["ids"], ["PSI-69", "PSI-68"])
        self.assertEqual([i["acronym"] for i in self.out["investigations"]], ["FLEX", "FLEX-2"])
        for row in self.out["rows"]:
            self.assertEqual(len(row["cells"]), 2, row["key"])

    def test_oxygen_range_is_flex_own_rows(self):
        lo, hi = self.db.execute("SELECT min(o2_mole_fraction), max(o2_mole_fraction) FROM tests "
                                 "WHERE psi_id='PSI-69' AND is_note=0").fetchone()
        flex, flex2 = cells(self.out, "oxygen")
        self.assertEqual(flex["value"], {"min": lo, "max": hi})
        self.assertIsNone(flex2["value"])                       # printed "not stated"
        self.assertIn("0.17; 0.21;0.25; 0.3", flex2["as_written"])   # FLEX-2's plan, kept as text

    def test_suspect_pressure_is_left_out_and_named(self):
        flex = cells(self.out, "pressure")[0]
        self.assertEqual(flex["excluded"]["test_ids"], ["PSI-69/114"])   # 0 mmHg in the file
        self.assertGreater(flex["value"]["min"], 0)
        lo = self.db.execute("SELECT min(pressure_kpa) FROM tests WHERE psi_id='PSI-69' AND is_note=0 "
                             "AND pressure_kpa > 0").fetchone()[0]
        self.assertEqual(flex["value"]["min"], round(lo, 6))

    def test_diluents_and_counts_match_the_table(self):
        n = self.db.execute("SELECT count(*) FROM tests WHERE psi_id='PSI-69' AND is_note=0").fetchone()[0]
        self.assertEqual(cells(self.out, "tests")[0]["value"], n)
        names = {d["name"] for d in cells(self.out, "diluents")[0]["value"]}
        self.assertEqual(names, {"N2", "N2+CO2", "N2+He"})
        self.assertIsNone(cells(self.out, "diluents")[1]["value"])

    def test_same_flags_similarities_and_differences(self):
        same = {r["key"]: r["same"] for r in self.out["rows"]}
        self.assertTrue(same["pillar"] and same["fuel_phase"] and same["flight_program"])
        self.assertFalse(same["fuels"] or same["oxygen"] or same["cannot_tell"])
        self.assertFalse(same["flow"])                          # both unstated is not "the same"

    def test_shareable_order_free_input(self):
        again = self.catalog.compare(["psi-69,68"])
        self.assertEqual(again["rows"], self.out["rows"])


class CompareRules(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        tmp = Path(cls._tmp.name)
        db = tmp / "catalog.sqlite"
        build.build(write_raw(tmp / "raw"), db)
        cls.catalog = cat.Catalog(db).load()

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_two_to_four_different_ids(self):
        for ids in (["PSI-69"], ["PSI-69", "psi-69"], ["PSI-69,PSI-39,PSI-25,PSI-10,PSI-68"], []):
            with self.assertRaises(cat.BadQuery, msg=ids):
                self.catalog.compare(ids)
        self.assertEqual(len(self.catalog.compare(["PSI-69,PSI-39,PSI-25,PSI-10"])["ids"]), 4)

    def test_unknown_id(self):
        with self.assertRaises(cat.UnknownInvestigation):
            self.catalog.compare(["PSI-69", "PSI-9999"])

    def test_ranges_stay_per_investigation(self):
        out = self.catalog.compare(["PSI-69", "PSI-39"])
        for c, pid in zip(cells(out, "oxygen"), out["ids"]):
            own = [t["o2_mole_fraction"] for t in self.catalog.tests
                   if t["psi_id"] == pid and not t["is_note"] and t["o2_mole_fraction"] is not None]
            self.assertEqual(c["value"], {"min": min(own), "max": max(own)} if own else None)

    def test_unavailable_catalog(self):
        with self.assertRaises(cat.CatalogUnavailable):
            cat.Catalog(Path(self._tmp.name) / "none.sqlite").load().compare(["PSI-69", "PSI-68"])


if __name__ == "__main__":
    unittest.main()
