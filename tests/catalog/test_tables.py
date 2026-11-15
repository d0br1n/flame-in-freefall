"""Tests for pipeline/catalog/tables.py: raw rows (DOB-67) and shared columns (DOB-69).

The counts are checked on the committed data/build/catalog.sqlite against
docs/PSI_VERIFICATION_REPORT.md, so they run on a clean checkout. The reader and the adapters
are checked on small files written here and on cells copied by hand from the PSI tables.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from pipeline.catalog import build, tables
from tests.catalog.raw_fixture import write_tables

FLEX = "PSI-69_Experimental table_FLEX.csv"


def adapt(file_name, raw):
    return tables.adapt(tables.ADAPTERS[file_name], raw)


class NumberTest(unittest.TestCase):
    def test_one_number_with_or_without_unit(self):
        self.assertEqual(tables.parse_number("757.7"), (757.7, None, []))
        self.assertEqual(tables.parse_number("1 atm ", "atm"), (1.0, "atm", []))
        self.assertEqual(tables.parse_number("30 cm/s"), (30.0, "cm/s", []))
        self.assertEqual(tables.parse_number(".33"), (0.33, None, []))
        self.assertEqual(tables.parse_number("~ 21.5"), (21.5, None, ["approximate"]))

    def test_non_numbers_stay_empty_and_flagged(self):
        for text in ("RAMP", "RAMPED", "-", "#DIV/0!", "n/a", "LOW O2", "Complete", "none", "#VALUE!"):
            with self.subTest(text=text):
                value, _, flags = tables.parse_number(text)
                self.assertIsNone(value)
                self.assertEqual(flags, ["not_a_number"])
        for text in ("21.5 - 21.7", "89,62,50,41", "0.17; 0.21;0.25; 0.3", "22.1 to 22.0", "0.1 - 5"):
            with self.subTest(text=text):
                self.assertEqual(tables.parse_number(text), (None, None, ["range_or_list"]))
        self.assertEqual(tables.parse_number("  "), (None, None, []))

    def test_exact_conversions(self):
        self.assertAlmostEqual(760 * tables.KPA_PER_MMHG, 101.325, places=12)
        self.assertEqual(tables.KPA_PER_ATM, 101.325)
        self.assertEqual(tables.KPA_PER_BAR, 100.0)
        self.assertAlmostEqual(14.6959488 * tables.KPA_PER_PSI, 101.325, places=5)


class ReaderTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_blank_lines_are_dropped_row_numbers_kept(self):
        path = self.dir / "t.csv"
        path.write_text("A,B\n1,2\n,\n\n3,4\n" + ",\n" * 50, encoding="utf-8")
        headers, rows = tables.read_table(path)
        self.assertEqual(headers, ["A", "B"])
        self.assertEqual(rows, [(1, {"A": "1", "B": "2"}), (4, {"A": "3", "B": "4"})])

    def test_short_long_and_repeated_columns_keep_every_cell(self):
        path = self.dir / "t.csv"
        path.write_text("A,A,\n1\n1,2,3,4\n", encoding="utf-8")
        _, rows = tables.read_table(path)
        self.assertEqual(rows[0][1], {"A": "1", "A (2)": "", "column 3": ""})
        self.assertEqual(rows[1][1], {"A": "1", "A (2)": "2", "column 3": "3", "column 4": "4"})

    def test_flex_read_as_utf8_stops_with_a_clear_error(self):
        write_tables(self.dir)
        path = self.dir / "tables" / FLEX
        with self.assertRaises(tables.TableError) as cm:
            tables.read_table(path, "utf-8")
        self.assertIn(FLEX, str(cm.exception))
        _, rows = tables.read_table(path, "cp1252")
        self.assertEqual(rows[0][1]["Fuel"], "Fuel – A")

    def test_missing_or_unknown_table_stops(self):
        write_tables(self.dir)
        (self.dir / "tables" / FLEX).unlink()
        with self.assertRaises(tables.TableError) as cm:
            tables.load_tests(self.dir / "tables")
        self.assertIn("FLEX", str(cm.exception))
        write_tables(self.dir)
        (self.dir / "tables" / "PSI-999_Experimental table_New.csv").write_text("A\n1\n")
        with self.assertRaises(tables.TableError):
            tables.load_tests(self.dir / "tables")

    def test_test_id_rule(self):
        write_tables(self.dir)
        path = self.dir / "tables" / "PSI-39_Experimental table_CFI.csv"
        lines = path.read_bytes().split(b"\r\n")
        path.write_bytes(b"\r\n".join([lines[0], lines[1], lines[1]]) + b"\r\n")         # repeat the row
        ids = {r.test_id for r in tables.load_tests(self.dir / "tables") if r.psi_id in ("PSI-39", "PSI-107")}
        number = next(i.split("/")[1].split("#")[0] for i in ids if i.startswith("PSI-39/"))
        self.assertEqual(ids, {f"PSI-39/{number}#1", f"PSI-39/{number}#2", "PSI-107/#1"})


class AdapterTest(unittest.TestCase):
    """One hand-checked row per kind of adapter; cells copied from the PSI tables."""

    def test_flex_test_114(self):
        raw = {"FLEX Test #": "114", "Fuel": "Methanol", "Ambient pressure; mmHg": "0",
               "O initial ambient composition; mole fraction": "0.2",
               "N initial ambient composition; mole fraction": "0.45",
               "CO initial ambient composition; mole fraction": "0.35",
               "He initial ambient composition; mole fraction": "0", "Test end": "Extinction"}
        s = adapt(FLEX, raw)
        self.assertEqual((s["fuel"], s["fuel_phase"], s["o2_mole_fraction"], s["pressure_kpa"]),
                         ("Methanol", "liquid", 0.2, 0.0))
        self.assertEqual((s["diluent"], s["outcome"], s["flow_cm_s"]), ("N2+CO2", "Extinction", None))
        self.assertIn("suspect_pressure", s["flags"])         # kept, not corrected
        self.assertIn("co_header_assumed_co2", s["flags"])
        self.assertEqual(s["original"]["pressure_kpa"],
                         {"text": "0", "unit": "mmHg", "column": "Ambient pressure; mmHg"})
        self.assertTrue(s["comparable"])

    def test_flex_760_mmhg_is_one_atmosphere(self):
        s = adapt(FLEX, {"Ambient pressure; mmHg": "760", "O initial ambient composition; mole fraction": "0.21"})
        self.assertAlmostEqual(s["pressure_kpa"], 101.325, places=12)
        self.assertEqual(s["flags"], [])

    def test_cfig_bar_and_outcome_labels(self):
        name = "PSI-159_Experimental table_CFI-G_Normal Flames.csv"
        s = adapt(name, {"Fuel": "ethane", " XO2 before test": "0.3939", "approx p (bar)": "0.9443956",
                         "Self-ext or flow term": "SE"})
        self.assertAlmostEqual(s["pressure_kpa"], 94.43956)
        self.assertEqual((s["o2_mole_fraction"], s["outcome"]), (0.3939, "Self-extinguished"))
        self.assertIsNone(adapt(name, {"Self-ext or flow term": "-"})["outcome"])

    def test_inverse_flames_have_no_ambient_oxygen(self):
        s = adapt("PSI-10_Experimental table_Flame Design_Inverse Flame.csv",
                  {"XO2": "0.37082819", "pmean (atm)": "1.00401873"})
        self.assertIsNone(s["o2_mole_fraction"])
        self.assertAlmostEqual(s["pressure_kpa"], 1.00401873 * 101.325)
        self.assertIn("oxygen_is_burner_stream", s["flags"])
        self.assertFalse(s["comparable"])

    def test_ramped_flame_design_cell_stays_empty(self):
        s = adapt("PSI-10_Experimental table_Flame Design_Normal Flame.csv",
                  {"Fuel": "C2H4", "XO2 (init)": "0.206169206", "pmean (atm)": "RAMPED"})
        self.assertIsNone(s["pressure_kpa"])
        self.assertIn("pressure_kpa:not_a_number", s["flags"])
        self.assertEqual(s["original"]["pressure_kpa"]["text"], "RAMPED")

    def test_cfi_pressure_with_unit_and_helium(self):
        s = adapt("PSI-39_Experimental table_CFI.csv",
                  {"Pressure": "1.25 atm", "Oxygen": "0.21", "Nitrogen": "0.5", "Helium": "0.29", "Fuel ": "C12H26"})
        self.assertAlmostEqual(s["pressure_kpa"], 126.65625)
        self.assertEqual(s["diluent"], "N2+He")

    def test_percent_oxygen_and_approximate(self):
        s = adapt("PSI-25_Experimental table_BASS-II.csv", {"Calibrated  initial O2 % by vol ": "22.2"})
        self.assertAlmostEqual(s["o2_mole_fraction"], 0.222)
        s = adapt("PSI-99_Experimental table_SAFFIRE-2.csv",
                  {"Sample Number": "2-2", "Material": "Silicone", "Air Flow (cm/s)": "20 cm/s", "Percent O2 (Note 1)": "~ 22.1"})
        self.assertAlmostEqual(s["o2_mole_fraction"], 0.221)
        self.assertEqual(s["flow_cm_s"], 20.0)
        self.assertIn("o2_mole_fraction:approximate", s["flags"])

    def test_oxygen_outside_0_to_1_is_not_guessed(self):
        s = adapt("PSI-20_Experimental table_ACME BRE.csv", {"Oxygen Conc (percent)": "3400%"})
        self.assertIsNone(s["o2_mole_fraction"])
        self.assertIn("o2_mole_fraction:out_of_range", s["flags"])
        self.assertEqual(s["original"]["o2_mole_fraction"]["text"], "3400%")

    def test_note_rows_kept_and_flagged(self):
        s = adapt("PSI-99_Experimental table_SAFFIRE-2.csv", {"Sample Number": "Note 1 Derived from me"})
        self.assertTrue(s["is_note"])
        self.assertEqual(s["flags"], ["note"])
        self.assertIsNone(s["fuel"])

    def test_every_adapter_names_real_columns_and_a_note(self):
        for name, a in tables.ADAPTERS.items():
            with self.subTest(table=name):
                self.assertTrue(a.note)
                self.assertEqual(tables.psi_id_of(name).split("-")[0], "PSI")


def q(sql, *args):
    db = sqlite3.connect(build.DEFAULT_OUT)
    try:
        return db.execute(sql, args).fetchall()
    finally:
        db.close()


class CommittedTestsTableTest(unittest.TestCase):
    """The committed database against docs/PSI_VERIFICATION_REPORT.md (DOB-67, DOB-69 'done when')."""

    def test_measured_row_counts(self):
        counts = dict(q("SELECT source_file, count(*) FROM tests GROUP BY source_file"))
        self.assertEqual(sum(counts.values()), 2009)
        self.assertEqual(len(counts), 22)
        expect = {FLEX: 274, "PSI-10_Experimental table_Flame Design_Normal Flame.csv": 207,
                  "PSI-10_Experimental table_Flame Design_Inverse Flame.csv": 120,
                  "PSI-159_Experimental table_CFI-G_Normal Flames.csv": 179,
                  "PSI-159_Experimental table_CFI-G_Inverse Flames.csv": 154,
                  "PSI-107_Experimental table_Spice.csv": 469, "PSI-25_Experimental table_BASS-II.csv": 129}
        for name, n in expect.items():
            self.assertEqual(counts[name], n, name)

    def test_flex_outcomes_and_fuels(self):
        self.assertEqual(dict(q("SELECT outcome, count(*) FROM tests WHERE psi_id='PSI-69' GROUP BY 1")),
                         {"Extinction": 186, "Disruption": 61, "Completion": 27})
        self.assertEqual(dict(q("SELECT fuel, count(*) FROM tests WHERE psi_id='PSI-69' GROUP BY 1")),
                         {"Methanol": 157, "Heptane": 117})

    def test_sampled_raw_rows_equal_the_csv_cells(self):
        raw = json.loads(q("SELECT raw FROM tests WHERE test_id='PSI-69/114'")[0][0])
        self.assertEqual(list(raw.items())[:6], [
            ("FLEX Test #", "114"), ("FLEX Identifier", "C11M201"), ("Test Date", "9/6/2010"),
            ("Test GMT", "19:14:22"), ("Fuel", "Methanol"), ("Ambient pressure; mmHg", "0")])
        raw = json.loads(q("SELECT raw FROM tests WHERE test_id='PSI-159/21088A1'")[0][0])
        self.assertEqual((raw["Fuel"], raw[" XO2 before test"], raw["Self-ext or flow term"]), ("ethane", "0.3939", "SE"))
        raw = json.loads(q("SELECT raw FROM tests WHERE test_id='PSI-99/2-2'")[0][0])
        self.assertEqual((raw["Material"], raw["Percent O2 (Note 1)"], raw["1-g Spread Rate"]),
                         ("Silicone", "~ 22.1", "1.2 mm/s"))

    def test_test_114_kept_and_flagged(self):
        pressure, flags = q("SELECT pressure_kpa, flags FROM tests WHERE test_id='PSI-69/114'")[0]
        self.assertEqual(pressure, 0.0)
        self.assertIn("suspect_pressure", json.loads(flags))

    def test_no_shared_numeric_field_holds_text(self):
        for col in ("o2_mole_fraction", "pressure_kpa", "flow_cm_s"):
            kinds = {k for (k,) in q(f"SELECT DISTINCT typeof({col}) FROM tests")}
            self.assertLessEqual(kinds, {"real", "null"}, col)
        self.assertEqual(q("SELECT count(*) FROM tests WHERE o2_mole_fraction < 0 OR o2_mole_fraction > 1")[0][0], 0)

    def test_notes_kept(self):
        self.assertEqual(q("SELECT count(*) FROM tests WHERE is_note=1 AND psi_id IN ('PSI-98','PSI-99')")[0][0], 8)

    def test_coverage_is_stored(self):
        cov = json.loads(q("SELECT value FROM meta WHERE key='coverage'")[0][0])
        self.assertEqual(cov["PSI-69"]["outcome"], 274)
        self.assertEqual(cov["PSI-69"]["comparable"], 274)


if __name__ == "__main__":
    unittest.main()
