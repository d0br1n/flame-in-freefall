"""FLEX table reading rules (pipeline/common/flex_table.py) on a three-row fixture."""

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "pipeline/flame_temperature"))

from pipeline.common.flex_table import load_flex_table  # noqa: E402
import flex  # noqa: E402


class FlexTableTest(unittest.TestCase):
    def setUp(self):
        self.df = load_flex_table(HERE / "flex_fixture.csv")

    def test_cp1252_dash_is_a_missing_value(self):
        row = self.df[self.df["flex_test"] == 2].iloc[0]
        self.assertTrue(row["d_end_mm"] != row["d_end_mm"])  # NaN

    def test_shared_test_id(self):
        self.assertEqual(list(self.df["test_id"]), ["PSI-69/1", "PSI-69/2", "PSI-69/114"])

    def test_pressure_zero_is_kept_and_flagged_suspect(self):
        row = self.df[self.df["flex_test"] == 114].iloc[0]
        self.assertTrue(row["suspect"])
        self.assertEqual(row["suspect_reason"], "pressure listed as 0 mmHg")
        self.assertEqual(int(self.df["suspect"].sum()), 1)

    def test_co_column_is_read_as_carbon_dioxide(self):
        self.assertAlmostEqual(self.df[self.df["flex_test"] == 2].iloc[0]["x_co2"], 0.30)


class GasLabelTest(unittest.TestCase):
    def test_helium_wins_then_carbon_dioxide_then_nitrogen_only(self):
        self.assertEqual(flex.gas_label(0.2, 0.2), flex.LABEL_HE)
        self.assertEqual(flex.gas_label(0.2, 0.0), flex.LABEL_CO2)
        self.assertEqual(flex.gas_label(0.0, 0.0), flex.LABEL_N2)

    def test_threshold_is_exclusive(self):
        self.assertEqual(flex.gas_label(0.01, 0.01), flex.LABEL_N2)


if __name__ == "__main__":
    unittest.main()
