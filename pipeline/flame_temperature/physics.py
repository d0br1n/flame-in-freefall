"""The two physical numbers for a gas mixture, computed with Cantera.

* Ceiling temperature (adiabatic flame temperature, K): fuel vapour mixed with the gas in the
  proportion that burns completely, started at 298.15 K and the given pressure, equilibrium at
  constant pressure and enthalpy (``equilibrate('HP')``).
* Heat-spreading speed (thermal diffusivity, m^2/s): thermal conductivity / (density x heat
  capacity) of the gas alone at 1000 K and the given pressure.

Written with SI assistance (Claude Code). The reference checks live in checks.py.
"""

from functools import lru_cache

import cantera as ct

ATM = 101325.0  # Pa
T_START = 298.15  # K, start temperature of the unburned mixture
T_SPREAD = 1000.0  # K, temperature at which heat-spreading speed is taken

# Species kept for the equilibrium: fuel, reactants, and the usual products.
PRODUCTS = ["O2", "N2", "CO2", "He", "H2O", "CO", "H2", "OH", "H", "O", "NO", "HO2"]
# Fuel -> (Cantera species name in nasa_gas.yaml, O2 per mole of fuel for complete burning).
FUELS = {
    "Methanol": ("CH3OH", 1.5),
    "Heptane": ("C7H16", 11.0),
    "Methane": ("CH4", 2.0),
    "C2H4": ("C2H4", 3.0),
    "C3H8": ("C3H8", 5.0),
}
TRANSPORT_FILE = "example_data/ammonia-CO-H2-Alzueta-2023.yaml"


@lru_cache(maxsize=None)
def _thermo_species() -> dict:
    """Species of nasa_gas.yaml by short name. Some are stored as 'C7H16,n-heptane': the text
    after the comma is dropped, and the first entry wins when two isomers share a formula."""
    out = {}
    for s in ct.Species.list_from_file("nasa_gas.yaml"):
        out.setdefault(s.name.split(",")[0], s)
    return out


def _full_name(short: str) -> str:
    """Cantera's own name for a species, for example 'C7H16,n-heptane' for 'C7H16'."""
    return _thermo_species()[short].name


@lru_cache(maxsize=None)
def _flame_gas(fuel_species: str) -> ct.Solution:
    sp = _thermo_species()
    names = [fuel_species] + [n for n in PRODUCTS if n != fuel_species]
    return ct.Solution(thermo="ideal-gas", species=[sp[n] for n in names])


@lru_cache(maxsize=1)
def _transport_gas() -> ct.Solution:
    return ct.Solution(TRANSPORT_FILE)


def ceiling_temperature(fuel: str, x_o2: float, x_n2: float, x_co2: float, x_he: float,
                        p_atm: float) -> float:
    """Ceiling temperature in kelvin. The gas fractions only enter through their ratios."""
    species, o2_per_fuel = FUELS[fuel]
    gas = _flame_gas(species)
    scale = o2_per_fuel / x_o2  # moles of ambient gas per mole of fuel at complete burning
    gas.TPX = T_START, p_atm * ATM, {
        _full_name(species): 1.0, "O2": o2_per_fuel, "N2": scale * x_n2, "CO2": scale * x_co2, "He": scale * x_he,
    }
    gas.equilibrate("HP")
    return float(gas.T)


def diffusion_flame_temperature(fuel: str, x_fuel: float, x_o2_ox: float, z_stoich: float,
                                p_atm: float) -> float:
    """Ceiling temperature of a PSI-10 (ACME) flame, to compare with NASA's ``Tad (K)``.

    Fuel stream: fuel at mole fraction ``x_fuel``, rest nitrogen. Oxidiser: ``x_o2_ox`` oxygen,
    rest nitrogen. Both start at 298.15 K and are mixed at the table's stoichiometric mixture
    fraction ``z_stoich`` (mass basis, the column ``mean Zst``).
    """
    species, _ = FUELS[fuel]
    gas = _flame_gas(species)
    p = p_atm * ATM
    gas.TPX = T_START, p, {_full_name(species): x_fuel, "N2": 1.0 - x_fuel}
    y_fuel = gas.Y.copy()
    gas.TPX = T_START, p, {"O2": x_o2_ox, "N2": 1.0 - x_o2_ox}
    y_ox = gas.Y.copy()
    gas.TPY = T_START, p, z_stoich * y_fuel + (1.0 - z_stoich) * y_ox
    gas.equilibrate("HP")
    return float(gas.T)


def heat_spreading_speed(x_o2: float, x_n2: float, x_co2: float, x_he: float, p_atm: float,
                         T: float = T_SPREAD) -> float:
    """Thermal diffusivity in m^2/s of the gas alone at ``T`` kelvin and ``p_atm``."""
    gas = _transport_gas()
    gas.TPX = T, p_atm * ATM, {"O2": x_o2, "N2": x_n2, "CO2": x_co2, "HE": x_he}
    return float(gas.thermal_conductivity / (gas.density * gas.cp))


def thermal_conductivity(species: str, T: float = 300.0, p_atm: float = 1.0) -> float:
    """Thermal conductivity in W/(m K) of one pure gas (``N2``, ``CO2`` or ``HE``)."""
    gas = _transport_gas()
    gas.TPX = T, p_atm * ATM, {species: 1.0}
    return float(gas.thermal_conductivity)
