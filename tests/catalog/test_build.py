"""Tests for pipeline/catalog/build.py, the catalog database (Linear DOB-60).

Uses a fake raw folder (tests/catalog/raw_fixture.py), so it runs on a clean checkout, plus one
check of the committed data/build/catalog.sqlite against the PSI verification report.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from pipeline.catalog import build
from pipeline.catalog.curation import validate as curation
from tests.catalog.raw_fixture import write_raw


def rows(db_path, sql, *args):
    db = sqlite3.connect(db_path)
    try:
        return db.execute(sql, args).fetchall()
    finally:
        db.close()


class BuildTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.raw = write_raw(self.tmp / "raw")
        self.out = self.tmp / "build" / "catalog.sqlite"

    def tearDown(self):
        self._tmp.cleanup()

    def test_builds_the_24_investigations_with_files_publications_people(self):
        counts = build.build(self.raw, self.out)
        self.assertEqual(counts["investigations"], 24)
        ids = [r[0] for r in rows(self.out, "SELECT psi_id FROM investigations ORDER BY sort_key")]
        self.assertEqual(ids, sorted(curation.EXPECTED_IDS, key=build.sort_key))
        self.assertEqual(counts["publications"], 24)
        self.assertEqual(counts["people"], 24)

    def test_keeps_current_files_only_once_each(self):
        build.build(self.raw, self.out)
        got = rows(self.out, "SELECT file_name, category, size_bytes FROM files "
                             "WHERE psi_id='PSI-10' AND kind='data_file' ORDER BY position")
        # PSI's order kept; duplicate, hidden and removed files left out; a size given as text
        # becomes a number; a file with no PSI folder is in "Other"
        self.assertEqual(got, [("b.csv", "Raw Data", 300), ("a.mp4", "Raw Data", 100), ("report.pdf", "Reports", 50)])

    def test_acronym_and_ground_flag_come_from_psi(self):
        build.build(self.raw, self.out)
        got = rows(self.out, "SELECT acronym, ground_investigation FROM investigations WHERE psi_id IN ('PSI-60', 'PSI-69') ORDER BY sort_key")
        self.assertEqual(got, [("", 1), ("FAKE69", 0)])

    def test_never_stores_email_phone_or_address(self):
        build.build(self.raw, self.out)
        data = self.out.read_bytes()
        for secret in (b"ada@example.org", b"Street 1"):
            self.assertNotIn(secret, data)
        name, roles = rows(self.out, "SELECT name, roles FROM people WHERE psi_id='PSI-69'")[0]
        self.assertEqual(name, "Ada B Cole")
        self.assertEqual(json.loads(roles), ["Principal Investigator (PI)"])

    def test_every_curated_tag_keeps_its_source(self):
        build.build(self.raw, self.out)
        r = rows(self.out, "SELECT pillar, pillar_source, stage, cannot_tell FROM investigations WHERE psi_id='PSI-69'")[0]
        entry = curation.load()["PSI-69"]
        self.assertEqual(r, (entry["pillar"]["value"], entry["pillar"]["source"], entry["stage"], entry["cannot_tell"]))

    def test_same_input_gives_the_same_bytes(self):
        build.build(self.raw, self.out)
        first = hashlib.sha256(self.out.read_bytes()).hexdigest()
        build.build(self.raw, self.out)
        self.assertEqual(hashlib.sha256(self.out.read_bytes()).hexdigest(), first)

    def test_missing_record_stops_the_build_and_names_it(self):
        (self.raw / "json" / "PSI-25.json").unlink()
        with self.assertRaises(build.BuildError) as cm:
            build.build(self.raw, self.out)
        self.assertIn("PSI-25", str(cm.exception))
        self.assertFalse(self.out.exists())

    def test_record_under_the_wrong_name_stops_the_build(self):
        path = self.raw / "json" / "PSI-25.json"
        record = json.loads(path.read_text())
        record["accession"] = "PSI-26"
        path.write_text(json.dumps(record))
        with self.assertRaises(build.BuildError):
            build.build(self.raw, self.out)

    def test_invalid_curation_stops_the_build(self):
        bad = json.loads(curation.CURATION.read_text(encoding="utf-8"))
        del bad["investigations"]["PSI-69"]
        path = self.tmp / "bad.yaml"
        path.write_text(json.dumps(bad), encoding="utf-8")
        with self.assertRaises(build.BuildError) as cm:
            build.build(self.raw, self.out, curation_path=path)
        self.assertIn("PSI-69", str(cm.exception))

    def test_command_line_reports_failure_with_exit_code_1(self):
        self.assertEqual(build.main(["--raw", str(self.tmp / "nowhere"), "--out", str(self.out)]), 1)
        self.assertEqual(build.main(["--raw", str(self.raw), "--out", str(self.out)]), 0)


class CommittedCatalogTest(unittest.TestCase):
    """The database in the repo matches what docs/PSI_VERIFICATION_REPORT.md measured."""

    def test_committed_database(self):
        self.assertTrue(build.DEFAULT_OUT.is_file(), "run: python3 pipeline/catalog/build.py")
        self.assertEqual(rows(build.DEFAULT_OUT, "SELECT count(*) FROM investigations")[0][0], 24)
        tables = rows(build.DEFAULT_OUT, "SELECT count(*) FROM files WHERE kind='experimental_table'")[0][0]
        self.assertEqual(tables, 22)
        self.assertEqual(rows(build.DEFAULT_OUT, "SELECT value FROM meta WHERE key='schema_version'")[0][0],
                         str(build.SCHEMA_VERSION))


if __name__ == "__main__":
    unittest.main()
