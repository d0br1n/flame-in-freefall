"""Tests for the backend logic (apps/api/app/store.py): the "done when" list of DOB-58.

The routes in apps/api/app/main.py only forward to Store, so these tests cover what the API
answers without needing FastAPI. HTTP-level tests that need FastAPI are in apps/api/tests/.
Standard library only. Run from the repo root: python3 -m unittest discover -s tests -t .
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from apps.api.app import store as store_mod
from contracts import validate

MOCK = validate.MODULES / "_mock"


class StoreTestCase(unittest.TestCase):
    """A modules folder holding the mock engine and a valid copy of it called demo-engine."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name) / "modules"
        shutil.copytree(MOCK, self.root / "_mock")
        demo = self.root / "demo-engine"
        shutil.copytree(MOCK, demo)
        for name in ("module.json", "evidence.json", "findings.json"):
            (demo / name).write_text((demo / name).read_text().replace('"_mock"', '"demo-engine"'))

    def tearDown(self):
        self._tmp.cleanup()

    def load(self, dev=True):
        return store_mod.Store(self.root, dev).load()


class TestServing(StoreTestCase):
    def test_health_lists_found_and_served_engines(self):
        h = self.load().health()
        self.assertEqual(h["status"], "ok")
        self.assertEqual(set(h["engines_found"]), {"_mock", "demo-engine"})
        self.assertEqual(set(h["engines_served"]), {"_mock", "demo-engine"})
        self.assertEqual(h["engines_not_built"], [])

    def test_summaries_carry_counts_for_built_engines(self):
        rows = {r["id"]: r for r in self.load().summaries()}
        self.assertEqual(rows["_mock"]["status"], "example")
        self.assertEqual(rows["_mock"]["evidence_count"], 4)
        self.assertEqual(rows["_mock"]["findings_count"], 2)
        self.assertEqual(rows["_mock"]["stage"], "spread")

    def test_served_records_are_schema_valid(self):
        engine = self.load().engine("_mock")
        self.assertEqual(validate.check_schema("module.schema.json", engine.result.module), [])
        self.assertEqual(validate.check_schema("evidence.schema.json", engine.result.evidence), [])
        self.assertEqual(validate.check_schema("findings.schema.json", engine.result.findings), [])

    def test_evidence_filters(self):
        records = self.load().engine("_mock").result.evidence
        self.assertEqual({r["id"] for r in store_mod.filter_evidence(records, test_id="PSI-0/MOCK-2")},
                         {"mock-ev-3", "mock-ev-4"})
        self.assertEqual([r["id"] for r in store_mod.filter_evidence(records, "PSI-0/MOCK-2", "test_end")],
                         ["mock-ev-4"])
        self.assertEqual(len(store_mod.filter_evidence(records)), 4)

    def test_listed_file_is_found(self):
        path = self.load().file("_mock", "mock_table.csv")
        self.assertIn("PSI-0/MOCK-1", path.read_text())


class TestRefusals(StoreTestCase):
    def test_unknown_engine_gives_clear_message(self):
        with self.assertRaisesRegex(store_mod.NotFound, "No engine 'nope'"):
            self.load().engine("nope")

    def test_unknown_file_gives_clear_message(self):
        with self.assertRaisesRegex(store_mod.NotFound, "Only files listed in its module.json are served"):
            self.load().file("_mock", "missing.png")

    def test_file_not_in_module_json_is_refused(self):
        (self.root / "_mock" / "secret.txt").write_text("not listed")
        s = self.load()
        for name in ("secret.txt", "module.json", "../../CLAUDE.md", "../demo-engine/mock_table.csv", "/etc/passwd"):
            with self.subTest(name=name), self.assertRaises(store_mod.NotFound):
                s.file("_mock", name)

    def test_listed_symlink_out_of_the_folder_is_refused(self):
        outside = Path(self._tmp.name) / "outside.txt"
        outside.write_text("outside")
        (self.root / "_mock" / "mock_table.csv").unlink()
        (self.root / "_mock" / "mock_table.csv").symlink_to(outside)
        with self.assertRaises(store_mod.NotFound):
            self.load().file("_mock", "mock_table.csv")

    def test_mock_hidden_without_dev_flag(self):
        s = self.load(dev=False)
        self.assertEqual([r["id"] for r in s.summaries()], ["demo-engine"])
        self.assertIn("_mock", s.health()["engines_found"])
        with self.assertRaises(store_mod.NotFound):
            s.engine("_mock")


class TestBrokenEngines(StoreTestCase):
    def test_broken_evidence_is_not_built_and_others_still_served(self):
        (self.root / "demo-engine" / "evidence.json").write_text("[{ broken")
        s = self.load()
        rows = {r["id"]: r for r in s.summaries()}
        # no numbers at all: only the id, the status and how many contract problems were found
        self.assertEqual(set(rows["demo-engine"]), {"id", "status", "problems"})
        self.assertEqual(rows["demo-engine"]["status"], "not_built")
        self.assertGreaterEqual(rows["demo-engine"]["problems"], 1)
        self.assertEqual(rows["_mock"]["status"], "example")
        self.assertEqual(s.health()["engines_not_built"], ["demo-engine"])
        with self.assertRaisesRegex(store_mod.NotFound, "is not built"):
            s.engine("demo-engine")

    def test_empty_folder_is_not_built(self):
        (self.root / "empty-engine").mkdir()
        rows = {r["id"]: r for r in self.load().summaries()}
        self.assertEqual(rows["empty-engine"]["status"], "not_built")
        self.assertEqual(rows["empty-engine"]["problems"], 3)

    def test_validator_crash_is_contained(self):
        real = validate.validate_folder

        def boom(folder):
            if Path(folder).name == "demo-engine":
                raise RuntimeError("simulated bug")
            return real(folder)

        with mock.patch.object(validate, "validate_folder", boom), self.assertLogs("fif.api.store", "WARNING"):
            rows = {r["id"]: r for r in self.load().summaries()}
        self.assertEqual(rows["demo-engine"]["status"], "not_built")
        self.assertEqual(rows["_mock"]["status"], "example")

    def test_missing_modules_folder_serves_nothing(self):
        s = store_mod.Store(Path(self._tmp.name) / "nowhere", dev=True).load()
        self.assertEqual(s.summaries(), [])
        self.assertEqual(s.health()["engines_found"], [])


if __name__ == "__main__":
    unittest.main()
