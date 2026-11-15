"""Tests for contracts/validate.py: the "done when" list of DOB-82, plus the cross-file checks.

Each test copies the mock engine (data/modules/_mock/, committed) into a temporary folder, breaks
one thing, and checks that the validator names the file, the record and the problem.
Standard library only. Run from the repo root: python3 -m unittest discover -s tests -t .
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import contextlib
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from contracts import validate

MOCK = validate.MODULES / "_mock"


class ContractTestCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.engine = Path(self._tmp.name) / "_mock"
        shutil.copytree(MOCK, self.engine)

    def tearDown(self):
        self._tmp.cleanup()

    def edit(self, file, change):
        path = self.engine / file
        data = json.loads(path.read_text())
        change(data)
        path.write_text(json.dumps(data))

    def errors(self):
        res = validate.validate_folder(self.engine)
        self.assertFalse(res.ok, "expected the validator to fail")
        return "\n".join(res.errors)


class TestDoneWhen(ContractTestCase):
    """The four failures and the one pass that DOB-82 lists under 'Done when'."""

    def test_mock_engine_passes(self):
        res = validate.validate_folder(MOCK)
        self.assertTrue(res.ok, res.errors)
        self.assertEqual(res.module["status"], "example")
        self.assertGreaterEqual(len(res.evidence), 3)
        self.assertGreaterEqual(len(res.findings), 1)

    def test_record_with_no_source_fails(self):
        self.edit("evidence.json", lambda d: d[0].pop("source"))
        self.assertIn("_mock/evidence.json : mock-ev-1 : source : 'source' is a required property", self.errors())

    def test_unknown_provenance_fails(self):
        self.edit("evidence.json", lambda d: d[2].update(provenance="GUESSED"))
        self.assertIn("mock-ev-3 : provenance : 'GUESSED' is not one of", self.errors())

    def test_missing_test_id_fails(self):
        self.edit("evidence.json", lambda d: d[1].pop("test_id"))
        self.assertIn("mock-ev-2 : test_id : 'test_id' is a required property", self.errors())

    def test_duplicate_test_segment_quantity_fails(self):
        self.edit("evidence.json", lambda d: d.append(dict(d[0], id="mock-ev-twin")))
        self.assertIn("mock-ev-1, mock-ev-twin : test_id+segment+quantity : 2 records for the same "
                      "test PSI-0/MOCK-1, quantity spread_rate", self.errors())


class TestSchemaRules(ContractTestCase):
    def test_source_without_psi_id_or_file_fails(self):
        def change(d):
            d[0]["source"].pop("psi_id")
            d[1]["source"].pop("file")
        self.edit("evidence.json", change)
        out = self.errors()
        self.assertIn("mock-ev-1 : source.psi_id : 'psi_id' is a required property", out)
        self.assertIn("mock-ev-2 : source.file : 'file' is a required property", out)

    def test_badly_formed_test_id_fails(self):
        self.edit("evidence.json", lambda d: d[0].update(test_id="114"))
        self.assertIn("mock-ev-1 : test_id : '114' does not match", self.errors())

    def test_flags_must_be_a_list_of_strings(self):
        self.edit("evidence.json", lambda d: d[0].update(flags={"incomplete": False}))
        self.assertIn("mock-ev-1 : flags : {'incomplete': False} is not of type 'array'", self.errors())

    def test_unknown_field_fails(self):
        self.edit("findings.json", lambda d: d[0].update(reference={"value": 1, "citation": "x"}))
        self.assertIn("mock-headline : - : Additional properties are not allowed ('reference' was unexpected)", self.errors())

    def test_check_needs_passed_and_headline_must_not_have_it(self):
        def change(d):
            d[0]["passed"] = True
            d[1].pop("passed")
        self.edit("findings.json", change)
        out = self.errors()
        self.assertIn("findings.json : mock-headline : passed : 'passed' is not allowed here", out)
        self.assertIn("findings.json : mock-check : passed : 'passed' is a required property", out)

    def test_boolean_is_not_a_count(self):
        self.edit("evidence.json", lambda d: d[0].update(n=True))
        self.assertIn("mock-ev-1 : n : True is not of type 'integer'", self.errors())

    def test_stage_and_status_are_enums(self):
        self.edit("module.json", lambda d: d.update(stage="ignite", status="done"))
        out = self.errors()
        self.assertIn("module.json : module : stage : 'ignite' is not one of", out)
        self.assertIn("module.json : module : status : 'done' is not one of", out)

    def test_schemas_use_only_supported_keywords(self):
        self.assertEqual(validate.unsupported_keywords(), [])


class TestCrossFileRules(ContractTestCase):
    def test_same_test_and_quantity_in_different_segments_passes(self):
        # mock-ev-1 and mock-ev-2 share test and quantity but differ in segment
        self.assertTrue(validate.validate_folder(self.engine).ok)

    def test_duplicate_record_id_fails(self):
        self.edit("evidence.json", lambda d: d[1].update(id="mock-ev-1"))
        self.assertIn("evidence.json : mock-ev-1 : id : used by 2 records", self.errors())

    def test_test_id_must_match_source_psi_id(self):
        self.edit("evidence.json", lambda d: d[0].update(test_id="PSI-69/114"))
        self.assertIn("mock-ev-1 : test_id : PSI-69/114 does not start with its source PSI-0/", self.errors())

    def test_psi_id_must_be_declared_in_module(self):
        self.edit("module.json", lambda d: d.update(psi_ids=["PSI-1"]))
        self.assertIn("mock-ev-1 : source.psi_id : PSI-0 is not in module.json psi_ids", self.errors())

    def test_module_id_must_match_folder(self):
        self.edit("module.json", lambda d: d.update(id="smoke-detection"))
        self.assertIn("module.json : module : id : is 'smoke-detection' but the folder is '_mock'", self.errors())

    def test_listed_file_must_exist(self):
        (self.engine / "mock_table.csv").unlink()
        self.assertIn("lists mock_table.csv but the file is not in the folder", self.errors())

    def test_listed_file_cannot_escape_folder(self):
        self.edit("module.json", lambda d: d["files"].append({"name": "../../CLAUDE.md", "kind": "x", "description": "x"}))
        self.assertIn("module.json : module : files.1.name : '../../CLAUDE.md' does not match", self.errors())

    def test_asset_must_be_listed(self):
        self.edit("evidence.json", lambda d: d[0].update(assets=["not_listed.png"]))
        self.assertIn("mock-ev-1 : assets : not_listed.png is not listed in module.json files", self.errors())

    def test_finding_must_point_at_existing_evidence(self):
        self.edit("findings.json", lambda d: d[0].update(evidence_ids=["nope"]))
        self.assertIn("findings.json : mock-headline : evidence_ids : nope is not an id in evidence.json", self.errors())

    def test_missing_and_broken_files_are_reported_not_raised(self):
        (self.engine / "findings.json").unlink()
        (self.engine / "evidence.json").write_text("{ not json")
        out = self.errors()
        self.assertIn("_mock/findings.json : - : - : file is missing", out)
        self.assertIn("_mock/evidence.json : - : - : not valid JSON", out)

    def test_folder_that_is_not_a_list_is_reported(self):
        (self.engine / "evidence.json").write_text('{"id": "x"}')
        self.assertIn("_mock/evidence.json : - : - : {'id': 'x'} is not of type 'array'", self.errors())


class TestCommandLine(ContractTestCase):
    def run_main(self, args):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(io.StringIO()):
            code = validate.main(args)
        return code, buf.getvalue()

    def test_exit_codes(self):
        code, out = self.run_main([str(MOCK)])
        self.assertEqual(code, 0)
        self.assertIn("OK   _mock: 4 evidence records, 2 findings", out)
        self.edit("evidence.json", lambda d: d[0].pop("source"))
        code, out = self.run_main([str(self.engine)])
        self.assertEqual(code, 1)
        self.assertIn("FAIL _mock", out)

    def test_recount_finds_repeated_test_numbers(self):
        table = Path(self._tmp.name) / "t.csv"
        table.write_text("SAME Test #,x\n56,a\n57,b\n57,c\n58,d\n")
        code, out = self.run_main(["--recount", str(table), "--column", "SAME Test #", "--psi", "PSI-101"])
        self.assertEqual(code, 0)
        self.assertIn("4 rows, 3 distinct", out)
        self.assertIn("use PSI-101/57#2, PSI-101/57#3", out)

    def test_recount_reads_windows_1252_tables(self):
        table = Path(self._tmp.name) / "flex.csv"
        table.write_bytes(b"FLEX Test #,Note\n1,a \x96 b\n2,c\n")   # 0x96 is an en dash in Windows-1252, invalid UTF-8
        code, out = self.run_main(["--recount", str(table), "--column", "FLEX Test #", "--psi", "PSI-69"])
        self.assertEqual(code, 0)
        self.assertIn("2 rows, 2 distinct", out)


if __name__ == "__main__":
    unittest.main()
