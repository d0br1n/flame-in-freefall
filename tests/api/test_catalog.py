"""Tests for the catalog logic behind /api/v1/catalog/* (apps/api/app/catalog.py, Linear DOB-66).

Two parts: the rules, on a fake catalog (tests/catalog/raw_fixture.py), and the agreement with
the site: for the committed database, the answers equal the committed web fixtures
(apps/web/fixtures/api/v1/catalog/) field for field. Standard library only. The HTTP routes
are tested in apps/api/tests/test_catalog_routes.py.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import json
import tempfile
import unittest
from pathlib import Path

from apps.api.app import catalog as cat
from pipeline.catalog import build
from pipeline.catalog.curation import validate as curation
from tests.catalog.raw_fixture import write_raw

FIXTURES = build.REPO / "apps" / "web" / "fixtures" / "api" / "v1" / "catalog"


class CatalogTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        tmp = Path(cls._tmp.name)
        cls.db = tmp / "catalog.sqlite"
        build.build(write_raw(tmp / "raw"), cls.db)
        cls.catalog = cat.Catalog(cls.db).load()
        cls.curated = curation.load()

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def row(self, pid):
        return next(r for r in self.catalog.list()["items"] if r["psi_id"] == pid)


class ListTest(CatalogTestCase):
    def test_lists_all_24_in_psi_order_with_the_agreed_fields(self):
        out = self.catalog.list()
        self.assertEqual(out["count"], 24)
        self.assertEqual([r["psi_id"] for r in out["items"]], sorted(curation.EXPECTED_IDS, key=build.sort_key))
        for r in out["items"]:
            self.assertEqual(tuple(r), cat.SUMMARY_KEYS)

    def test_summary_values(self):
        r = self.row("PSI-25")
        self.assertEqual(r["pillar"], self.curated["PSI-25"]["pillar"]["value"])
        self.assertEqual((r["table_count"], r["files_count"], r["files_bytes"]), (1, 3, 450))
        self.assertEqual(r["data_kinds"], ["table", "data_files", "video", "documents"])
        self.assertEqual(r["listed_bytes"], 923832535657)
        self.assertIsInstance(r["listed_bytes"], int)
        self.assertEqual(r["psi_url"], "https://doi.org/10.0000/fake-25")
        self.assertEqual(r["hardware_group_label"], cat.HARDWARE_LABELS[r["hardware_group"]])

    def test_ground_investigation_has_no_acronym(self):
        r = self.row("PSI-60")
        self.assertIsNone(r["acronym"])
        self.assertTrue(r["ground_investigation"])

    def test_filter_by_pillar_matches_the_curation(self):
        out = self.catalog.list(pillar="prevention")
        want = {p for p, e in self.curated.items() if e["pillar"]["value"] == "prevention"}
        self.assertEqual({r["psi_id"] for r in out["items"]}, want)
        self.assertEqual(out["filters"], {"pillar": "prevention"})

    def test_filters_combine_and_ignore_case(self):
        out = self.catalog.list(pillar="PREVENTION", fuel_phase="solid")
        self.assertTrue(out["items"])
        for r in out["items"]:
            self.assertEqual((r["pillar"], r["fuel_phase"]), ("prevention", "solid"))

    def test_facet_counts_skip_their_own_filter(self):
        out = self.catalog.list(pillar="prevention")
        self.assertEqual(sum(out["facets"]["pillar"].values()), 24)
        self.assertEqual(sum(out["facets"]["fuel_phase"].values()), out["count"])
        self.assertEqual(set(out["facets"]["stage"]), {"spread"})

    def test_no_stage_is_the_facet_and_filter_value_none(self):
        no_stage = {p for p, e in self.curated.items() if e["stage"] is None}
        self.assertEqual(self.catalog.list()["facets"]["stage"]["none"], len(no_stage))
        self.assertEqual({r["psi_id"] for r in self.catalog.list(stage="none")["items"]}, no_stage)

    def test_text_search_needs_every_word(self):
        self.assertEqual(self.catalog.list(q="psi-69")["count"], 1)
        self.assertEqual(self.catalog.list(q="candle wax")["count"], 24)
        self.assertEqual(self.catalog.list(q="candle zzz")["count"], 0)

    def test_has_table(self):
        with_table = self.catalog.list(has_table=True)["count"]
        without = self.catalog.list(has_table=False)["count"]
        self.assertEqual(with_table + without, 24)
        self.assertGreater(without, 0)


class DetailTest(CatalogTestCase):
    def test_detail_accepts_any_spelling_of_the_id(self):
        for spelling in ("PSI-69", "psi-69", "69", " 69 "):
            self.assertEqual(self.catalog.detail(spelling)["psi_id"], "PSI-69")

    def test_detail_starts_with_the_summary(self):
        d = self.catalog.detail("PSI-25")
        self.assertEqual({k: d[k] for k in cat.SUMMARY_KEYS}, self.row("PSI-25"))

    def test_every_tag_comes_with_its_source(self):
        d = self.catalog.detail("PSI-69")
        for key in ("pillar", "fuel_phase", "hardware_group", "measurements"):
            self.assertEqual(d["tags"][key], self.curated["PSI-69"][key])
        self.assertEqual(d["summary_written_by"], self.curated["PSI-69"]["summary_plain"]["written_by"])
        self.assertEqual(d["cannot_tell"], [self.curated["PSI-69"]["cannot_tell"]])

    def test_files_by_category_largest_first(self):
        files = self.catalog.detail("PSI-25")["files"]
        self.assertEqual(files["by_category"], [{"category": "Raw Data", "count": 2, "bytes": 400},
                                                {"category": "Reports", "count": 1, "bytes": 50}])
        self.assertEqual(files["tables"], [{"file_name": "PSI-25_Experimental table_Fake.csv", "bytes": 2000}])

    def test_related_and_empty_texts(self):
        d = self.catalog.detail("PSI-25")
        self.assertEqual(d["related"], ["PSI-26", "PSI-25"])
        self.assertIsNone(d["psi_text"]["hypothesis"])          # empty in PSI becomes null
        self.assertEqual(d["publications"], [{"title": "Paper one", "authors": "A Author, B Author", "doi": None}])

    def test_engines_that_use_the_investigation(self):
        engines = [{"id": "video-to-data", "title": "Video to data", "stage": "spread", "status": "example",
                    "psi_ids": ["PSI-25"], "summary": "not shown"}]
        self.assertEqual(self.catalog.detail("PSI-25", engines)["engines"],
                         [{"id": "video-to-data", "title": "Video to data", "stage": "spread", "status": "example"}])
        self.assertEqual(self.catalog.detail("PSI-69", engines)["engines"], [])

    def test_no_contact_details_anywhere(self):
        self.assertNotIn("ada@example.org", json.dumps(self.catalog.detail("PSI-25")))

    def test_unknown_id_names_the_list_route(self):
        with self.assertRaises(cat.UnknownInvestigation) as cm:
            self.catalog.detail("PSI-9999")
        self.assertIn("/api/v1/catalog/investigations", str(cm.exception))


class FilesTest(CatalogTestCase):
    def test_paging_tables_first(self):
        page = self.catalog.files_of("PSI-25", limit=2, offset=0)
        self.assertEqual(page["total"], 4)
        self.assertEqual([f["kind"] for f in page["items"]], ["experimental_table", "data_file"])
        self.assertEqual(len(self.catalog.files_of("PSI-25", limit=2, offset=2)["items"]), 2)

    def test_filters_and_download_link(self):
        self.assertEqual(self.catalog.files_of("PSI-25", kind="experimental_table")["total"], 1)
        self.assertEqual(self.catalog.files_of("PSI-25", category="Raw Data")["total"], 2)
        item = self.catalog.files_of("PSI-25", q="REPORT")["items"][0]
        self.assertEqual(item["download_url"], f"{cat.PSI_API}/studies/PSI-25/download?file=report.pdf")

    def test_bad_query(self):
        for kwargs in ({"kind": "video"}, {"limit": 0}, {"limit": 501}, {"offset": -1}):
            with self.assertRaises(cat.BadQuery):
                self.catalog.files_of("PSI-25", **kwargs)


class MissingDatabaseTest(unittest.TestCase):
    def test_missing_database_is_reported_not_raised_at_load(self):
        c = cat.Catalog(Path(tempfile.gettempdir()) / "no-such-catalog.sqlite").load()
        self.assertFalse(c.ok)
        self.assertEqual(c.health()["status"], "missing")
        self.assertIn("pipeline/catalog/build.py", c.health()["error"])
        with self.assertRaises(cat.CatalogUnavailable):
            c.list()
        with self.assertRaises(cat.CatalogUnavailable):
            c.detail("PSI-69")

    def test_garbage_file_is_unreadable_not_a_crash(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "catalog.sqlite"
            path.write_bytes(b"not a database")
            c = cat.Catalog(path).load()
            self.assertFalse(c.ok)
            self.assertIn("unreadable", c.health()["error"])


class AgreesWithTheSiteTest(unittest.TestCase):
    """The committed database answers exactly what the site was built against (DOB-66 'done when')."""

    @classmethod
    def setUpClass(cls):
        cls.catalog = cat.Catalog(build.DEFAULT_OUT).load()

    def test_list_equals_the_fixture(self):
        want = json.loads((FIXTURES / "investigations.json").read_text(encoding="utf-8"))
        got = self.catalog.list()
        self.assertEqual({"count": got["count"], "items": got["items"]}, want)

    def test_every_detail_equals_its_fixture(self):
        files = sorted((FIXTURES / "investigations").glob("PSI-*.json"))
        self.assertEqual(len(files), 24)
        for path in files:
            want = json.loads(path.read_text(encoding="utf-8"))
            with self.subTest(psi_id=path.stem):
                engines = [{**e, "psi_ids": [path.stem]} for e in want["engines"]]
                self.assertEqual(self.catalog.detail(path.stem, engines), want)


class TestsQueryTest(unittest.TestCase):
    """GET /catalog/tests on the committed database (DOB-72 'done when')."""

    @classmethod
    def setUpClass(cls):
        cls.catalog = cat.Catalog(build.DEFAULT_OUT).load()

    def query(self, **kw):
        return self.catalog.query_tests(cat.TestQuery(**kw))

    def test_flex_extinction_is_186(self):
        out = self.query(psi_id=["PSI-69"], outcome=["Extinction"])
        self.assertEqual(out["total"], 186)
        self.assertEqual(self.query(psi_id=["69,PSI-69"], outcome=["extinction"])["total"], 186)

    def test_oxygen_range_returns_only_rows_inside(self):
        out = self.query(o2_min=0.3, o2_max=0.4, limit=500)
        self.assertGreater(out["total"], 0)
        for row in out["items"]:
            self.assertTrue(0.3 <= row["o2_mole_fraction"] <= 0.4, row["test_id"])
        stated = sum(1 for t in self.catalog.tests if t["o2_mole_fraction"] is not None and not t["is_note"])
        inside = sum(1 for t in self.catalog.tests if t["o2_mole_fraction"] is not None and not t["is_note"]
                     and 0.3 <= t["o2_mole_fraction"] <= 0.4)
        self.assertEqual(out["total"], inside)
        self.assertEqual(out["excluded"]["o2"], 2001 - stated)

    def test_pages_do_not_overlap(self):
        one = [r["test_id"] for r in self.query(limit=50)["items"]]
        two = [r["test_id"] for r in self.query(limit=50, offset=50)["items"]]
        self.assertEqual(len(one), 50)
        self.assertFalse(set(one) & set(two))

    def test_inverse_flames_come_after_every_other_row(self):
        """DOB-125: the first pages no longer hold only rows whose oxygen is left out."""
        flag = cat.LAST_FLAG
        rows = [t for t in self.catalog.tests if not t["is_note"]]          # PSI number, file, row
        plain = [t["test_id"] for t in rows if flag not in t["flags"]]
        inverse = [t["test_id"] for t in rows if flag in t["flags"]]
        self.assertEqual((len(plain), len(inverse)), (1727, 274))
        self.assertTrue(flag in self.catalog.tests[0]["flags"])            # the database order puts them first
        paged = []
        for offset in range(0, 2001, 500):
            paged += [r["test_id"] for r in self.query(limit=500, offset=offset)["items"]]
        self.assertEqual(paged, plain + inverse)                           # stable inside each group
        self.assertFalse(any(flag in r["flags"] for r in self.query()["items"]))
        one = [flag in r["flags"] for r in self.query(psi_id=["PSI-10"], limit=500)["items"]]
        self.assertEqual((one, sum(one)), (sorted(one), 120))              # also under a filter
        out = self.query(include=["points"])                               # totals, facets, points unchanged
        self.assertEqual(out["total"], 2001)
        self.assertEqual(sum(f["count"] for f in out["facets"]["psi_id"]), 2001)
        self.assertEqual([p[0] for p in out["points"]["items"]],
                         [t["test_id"] for t in rows if t["comparable"]])
        self.assertEqual(out["points"]["not_plotted"], 2001 - len(out["points"]["items"]))

    def test_injection_shaped_value_matches_nothing(self):
        self.assertEqual(self.query(fuel=["x' OR 1=1 --"])["total"], 0)

    def test_facets_and_points(self):
        out = self.query(psi_id=["PSI-69"], include=["points"])
        outcomes = {f["value"]: f["count"] for f in out["facets"]["outcome"]}
        self.assertEqual(outcomes, {"Extinction": 186, "Disruption": 61, "Completion": 27})
        self.assertEqual(sum(f["count"] for f in out["facets"]["psi_id"]), 2001)   # own filter skipped
        self.assertEqual(next(f for f in out["facets"]["psi_id"] if f["value"] == "PSI-69")["label"], "FLEX")
        self.assertEqual((len(out["points"]["items"]), out["points"]["not_plotted"]), (274, 0))

    def test_notes_only_on_request(self):
        self.assertEqual(self.query()["total"], 2001)
        self.assertEqual(self.query(notes=True)["total"], 2009)

    def test_raw_and_evidence_on_request(self):
        row = self.query(psi_id=["PSI-69"], limit=1)["items"][0]
        self.assertNotIn("raw", row)
        evidence = {"PSI-69/1": [{"id": "e1"}]}
        row = self.catalog.query_tests(cat.TestQuery(psi_id=["PSI-69"], limit=1, include=["raw", "evidence"]),
                                       evidence)["items"][0]
        self.assertEqual(row["test_id"], "PSI-69/1")
        self.assertEqual(row["raw"]["FLEX Test #"], "1")
        self.assertEqual(row["evidence"], [{"id": "e1"}])

    def test_pick_tests_by_id(self):
        out = self.query(test_id=["PSI-69/114", "PSI-25/B1", "PSI-69/9999"], include=["raw", "points"])
        self.assertEqual([r["test_id"] for r in out["items"]], ["PSI-25/B1", "PSI-69/114"])
        self.assertEqual(out["items"][1]["raw"]["FLEX Test #"], "114")
        self.assertEqual([p[0] for p in out["points"]["items"]], ["PSI-69/114"])     # B1 states no pressure
        self.assertEqual(sum(f["count"] for f in out["facets"]["psi_id"]), 2001)     # facets ignore test_id
        self.assertEqual(self.query(test_id=["PSI-69/114"], outcome=["Completion"])["total"], 0)

    def test_one_test(self):
        t = self.catalog.test("PSI-69/114")
        self.assertEqual((t["pressure_kpa"], t["source_row"]), (0.0, 114))
        with self.assertRaises(cat.UnknownInvestigation):
            self.catalog.test("PSI-69/9999")

    def test_bad_parameters(self):
        for kw in ({"limit": 0}, {"limit": 501}, {"offset": -1}, {"include": ["everything"]},
                   {"o2_min": 21}, {"o2_min": 0.3, "o2_max": 0.2}):
            with self.subTest(**{k: str(v) for k, v in kw.items()}):
                with self.assertRaises(cat.BadQuery):
                    self.query(**kw)


if __name__ == "__main__":
    unittest.main()
