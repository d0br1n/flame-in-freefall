"""Checks on the hand-over folder of the video-to-data engine (data/modules/video-to-data/).

Stdlib only, so it runs anywhere: python3 -m unittest discover -s tests -t .
These are the engine's own invariants. The shared contract check is contracts/validate.py.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import csv
import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE_DIR = ROOT / "data" / "modules" / "video-to-data"

CONTRACT_FILES = {"module.json", "evidence.json", "findings.json"}
PROVENANCE = {"VIDEO_MEASURED", "PUBLISHED", "PSI_TABLE", "HAND_MEASURED", "SI_EXTRACTED", "MODEL"}
MODULE_KEYS = {"id", "title", "stage", "psi_ids", "question", "summary", "cannot_tell",
               "status", "files"}
RESULTS_COLUMNS = [
    "test_id", "segment", "sample", "material", "thickness_mm", "width_mm", "flow_direction",
    "o2_before", "o2_after", "ignition_time_s", "extinction_time_s", "outcome", "rate",
    "rate_unit", "rate_ci_low", "rate_ci_high", "window_start_s", "window_end_s", "flags",
    "pixel_scale_px_per_mm", "published_value", "signed_error", "provenance", "psi_file",
]
TEST_ID = re.compile(r"^PSI-25/[A-Za-z0-9]+$")
# Wording the team agreed never to use about this data (Linear DOB-100, DOB-109).
BANNED = re.compile(r"\b(recovered|discover(ed|y)?|proves?|proved|never wrote down)\b", re.I)


def load(name):
    return json.loads((MODULE_DIR / name).read_text(encoding="utf-8"))


class ModuleFile(unittest.TestCase):
    def setUp(self):
        self.module = load("module.json")

    def test_has_every_contract_field(self):
        self.assertEqual(MODULE_KEYS - set(self.module), set())

    def test_identity(self):
        self.assertEqual(self.module["id"], "video-to-data")
        self.assertEqual(self.module["stage"], "spread")
        self.assertEqual(self.module["psi_ids"], ["PSI-25"])
        self.assertIn(self.module["status"], {"example", "built"})

    def test_says_what_it_cannot_tell(self):
        self.assertGreaterEqual(len(self.module["cannot_tell"]), 3)

    def test_file_list_matches_the_folder(self):
        listed = {entry["name"] for entry in self.module["files"]}
        on_disk = {p.relative_to(MODULE_DIR).as_posix() for p in MODULE_DIR.rglob("*")
                   if p.is_file()} - CONTRACT_FILES
        self.assertEqual(listed, on_disk)


class EvidenceFile(unittest.TestCase):
    def setUp(self):
        self.records = load("evidence.json")
        self.status = load("module.json")["status"]

    def test_every_record_names_its_test_and_psi_file(self):
        for record in self.records:
            with self.subTest(record=record.get("id")):
                self.assertRegex(record["test_id"], TEST_ID)
                self.assertEqual(record["source"]["psi_id"], "PSI-25")
                self.assertTrue(record["source"]["file"])
                self.assertEqual(record["module"], "video-to-data")

    def test_provenance_is_a_known_tag(self):
        for record in self.records:
            with self.subTest(record=record.get("id")):
                self.assertIn(record["provenance"], PROVENANCE)

    def test_ids_and_values_are_unique(self):
        ids = [record["id"] for record in self.records]
        self.assertEqual(len(ids), len(set(ids)))
        keys = [(r["test_id"], r.get("segment"), r["quantity"]) for r in self.records]
        self.assertEqual(len(keys), len(set(keys)))

    def test_example_rows_are_flagged_until_the_engine_is_built(self):
        for record in self.records:
            with self.subTest(record=record.get("id")):
                if self.status == "example":
                    self.assertIn("example", record["flags"])
                else:
                    self.assertNotIn("example", record["flags"])

    def test_rates_in_pixels_carry_the_no_scale_flag(self):
        for record in self.records:
            if record["quantity"] == "spread_rate" and record["unit"] == "px/s":
                self.assertIn("no_scale", record["flags"], record["id"])


class FindingsFile(unittest.TestCase):
    def setUp(self):
        self.findings = load("findings.json")
        self.status = load("module.json")["status"]
        self.evidence_ids = {record["id"] for record in load("evidence.json")}

    def test_kinds_and_sources(self):
        for finding in self.findings:
            with self.subTest(finding=finding.get("id")):
                self.assertIn(finding["kind"], {"headline", "check"})
                self.assertIn(finding["provenance"], PROVENANCE)
                self.assertEqual(finding["source"]["psi_id"], "PSI-25")
                self.assertIn("n", finding)
                if finding["kind"] == "check":
                    self.assertIsInstance(finding["passed"], bool)

    def test_evidence_links_resolve(self):
        for finding in self.findings:
            for evidence_id in finding.get("evidence_ids", []):
                self.assertIn(evidence_id, self.evidence_ids, finding["id"])

    def test_hand_check_exists_and_cannot_pass_on_example_data(self):
        # The site shows a verdict on the airflow card only when this check has passed.
        hand_checks = [f for f in self.findings
                       if f["kind"] == "check" and f["provenance"] == "HAND_MEASURED"]
        self.assertTrue(hand_checks, "the tracker-against-hand check is gone")
        if self.status == "example":
            for finding in hand_checks:
                self.assertFalse(finding["passed"], finding["id"])


class ResultsTable(unittest.TestCase):
    def setUp(self):
        with (MODULE_DIR / "results.csv").open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            self.columns = reader.fieldnames
            self.rows = list(reader)

    def test_columns(self):
        self.assertEqual(self.columns, RESULTS_COLUMNS)

    def test_every_row_has_a_test_a_source_and_a_known_tag(self):
        for row in self.rows:
            with self.subTest(row=row["test_id"]):
                self.assertRegex(row["test_id"], TEST_ID)
                self.assertTrue(row["psi_file"])
                self.assertIn(row["provenance"], PROVENANCE)


class SharedContract(unittest.TestCase):
    def test_folder_passes_the_shared_contract_validator(self):
        run = subprocess.run(
            [sys.executable, str(ROOT / "contracts" / "validate.py"), str(MODULE_DIR)],
            capture_output=True, text=True, timeout=60, cwd=str(ROOT))
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)


class EngineFolder(unittest.TestCase):
    """pipeline/video_to_data/: pinned dependencies and the list of PSI files fetched."""

    ENGINE_DIR = ROOT / "pipeline" / "video_to_data"

    def test_every_dependency_is_pinned_to_one_version(self):
        lines = (self.ENGINE_DIR / "requirements.txt").read_text(encoding="utf-8").splitlines()
        lines = [line.strip() for line in lines if line.strip() and not line.startswith("#")]
        self.assertTrue(lines)
        for line in lines:
            self.assertRegex(line, r"^[A-Za-z0-9_.\-]+==[0-9][A-Za-z0-9.]*$")

    def test_download_list_names_only_psi_25_files_and_no_archives(self):
        with (self.ENGINE_DIR / "downloads.csv").open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        self.assertTrue(rows)
        names = [row["file_name"] for row in rows]
        self.assertEqual(len(names), len(set(names)))
        for row in rows:
            with self.subTest(file=row["file_name"]):
                self.assertEqual(row["psi_id"], "PSI-25")
                self.assertGreater(int(row["bytes"]), 0)
                self.assertIn(row["kind"], {"document", "video", "table"})
                self.assertRegex(row["date_fetched"], r"^\d{4}-\d{2}-\d{2}$")
                self.assertTrue(row["local_path"].startswith("data/raw/"))
                self.assertTrue(row["local_path"].endswith(row["file_name"]))
                self.assertFalse(row["file_name"].lower().endswith(".zip"))


class Wording(unittest.TestCase):
    def test_no_banned_wording_in_text_a_judge_reads(self):
        module = load("module.json")
        texts = [module["title"], module["question"], module["summary"]] + module["cannot_tell"]
        texts += [finding["text"] for finding in load("findings.json")]
        for text in texts:
            self.assertIsNone(BANNED.search(text), text)


if __name__ == "__main__":
    unittest.main()
