"""Physics sanity checks (Cantera), as in the build's reference checks."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline/flame_temperature"))

import physics  # noqa: E402


class PhysicsTest(unittest.TestCase):
    def test_methanol_in_air_near_2220_k(self):
        t = physics.ceiling_temperature("Methanol", 0.21, 0.79, 0.0, 0.0, 1.0)
        self.assertAlmostEqual(t, 2220.0, delta=5.0)

    def test_heptane_in_air_near_2274_k(self):
        t = physics.ceiling_temperature("Heptane", 0.21, 0.79, 0.0, 0.0, 1.0)
        self.assertAlmostEqual(t, 2274.0, delta=5.0)

    def test_temperature_falls_as_carbon_dioxide_rises(self):
        temps = [physics.ceiling_temperature("Methanol", 0.21, 0.79 - x, x, 0.0, 1.0)
                 for x in (0.0, 0.1, 0.2, 0.3)]
        self.assertTrue(all(a > b for a, b in zip(temps, temps[1:])))

    def test_helium_conducts_heat_much_better_than_nitrogen(self):
        self.assertGreater(physics.thermal_conductivity("HE"), 4 * physics.thermal_conductivity("N2"))

    def test_heat_spreading_speed_is_positive_and_small(self):
        a = physics.heat_spreading_speed(0.21, 0.79, 0.0, 0.0, 1.0)
        self.assertTrue(1e-5 < a < 1e-3)


if __name__ == "__main__":
    unittest.main()
