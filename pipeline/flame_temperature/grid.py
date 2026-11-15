"""flex_grid.json: the slider grid, computed ahead of time so the site only looks values up.

For each slider position: the two physical numbers, the predicted share of fuel burned from the
fitted link (trained once on all eligible tests), and the real FLEX tests nearest to it. Where no
real test is near, no prediction is stored and the position is flagged ``no_test_near``.

Written with SI assistance (Claude Code).
"""

import itertools

import numpy as np
import pandas as pd

import fit
import physics

# ---- Slider steps (written into the file header) --------------------------------------
FUELS = ["Methanol", "Heptane"]
OXYGEN = [round(0.12 + 0.01 * i, 2) for i in range(23)]  # 0.12 .. 0.34, step 0.01
CO2_STEPS = [round(0.05 * i, 2) for i in range(1, 15)]  # 0.05 .. 0.70, step 0.05
HE_STEPS = [round(0.05 * i, 2) for i in range(1, 10)]  # 0.05 .. 0.45, step 0.05
ADDED_GAS = [("none", 0.0)] + [("carbon dioxide", x) for x in CO2_STEPS] + [("helium", x) for x in HE_STEPS]
PRESSURES_ATM = [0.7, 1.0]
N_DIAMETERS = 6  # evenly spaced across the FLEX range of starting diameters

# ---- Nearest real tests --------------------------------------------------------------
NO_TEST_NEAR_K = 75.0  # proposal: no prediction if the nearest real test is further than this
N_NEAREST = 5
# Distance = sqrt of the sum of squares of the three differences, each divided by its scale.
SCALE = {"ceiling_temperature_k": 50.0, "log10_heat_spreading": 0.1, "d0_mm": 0.5}

COLUMNS = ["fuel", "x_o2", "added_gas", "x_added", "pressure_atm", "d0_mm", "ceiling_temperature_k",
           "heat_spreading_m2_s", "share_burned_pred", "no_test_near", "nearest"]


def diameters(tests: pd.DataFrame) -> list[float]:
    d0 = tests["d0_mm"].dropna()
    return [round(float(v), 2) for v in np.linspace(d0.min(), d0.max(), N_DIAMETERS)]


def positions(d0_values: list[float]) -> list[tuple]:
    """Every slider position, with oxygen plus added gas never above 1."""
    out = []
    for fuel, o2, (gas, x), p, d0 in itertools.product(FUELS, OXYGEN, ADDED_GAS, PRESSURES_ATM, d0_values):
        if o2 + x <= 1.0 + 1e-9:
            out.append((fuel, o2, gas, x, p, d0))
    return out


def expected_count(d0_values: list[float]) -> int:
    pairs = sum(1 for o2 in OXYGEN for _, x in ADDED_GAS if o2 + x <= 1.0 + 1e-9)
    return len(FUELS) * pairs * len(PRESSURES_ATM) * len(d0_values)


def _numbers(fuel, o2, gas, x, p, cache):
    """Ceiling temperature and heat-spreading speed, computed once per gas position."""
    x_co2 = x if gas == "carbon dioxide" else 0.0
    x_he = x if gas == "helium" else 0.0
    x_n2 = 1.0 - o2 - x_co2 - x_he
    key_t, key_a = (fuel, o2, x_co2, x_he, p), (o2, x_co2, x_he, p)
    if key_t not in cache["T"]:
        cache["T"][key_t] = physics.ceiling_temperature(fuel, o2, x_n2, x_co2, x_he, p)
    if key_a not in cache["a"]:
        cache["a"][key_a] = physics.heat_spreading_speed(o2, x_n2, x_co2, x_he, p)
    return cache["T"][key_t], cache["a"][key_a]


def nearest(tests_by_fuel: dict, fuel: str, T, log_a, d0, k=N_NEAREST):
    """The k real tests of the same fuel closest in the three scaled quantities."""
    t = tests_by_fuel[fuel]
    dist = np.sqrt(((t["ceiling_temperature_k"].values - T) / SCALE["ceiling_temperature_k"]) ** 2
                   + ((t["log_heat_spreading"].values - log_a) / SCALE["log10_heat_spreading"]) ** 2
                   + ((t["d0_mm"].values - d0) / SCALE["d0_mm"]) ** 2)
    order = np.argsort(dist, kind="stable")[:k]
    return [(int(t["flex_test"].values[i]), float(dist[i]), float(t["ceiling_temperature_k"].values[i]))
            for i in order]


def build_grid(test_rows: list[dict]) -> dict:
    df = fit.frame(test_rows)
    real = df[df["d0_mm"].notna()].reset_index(drop=True)  # real tests that can be matched
    tests_by_fuel = {f: real[real["fuel"] == f].reset_index(drop=True) for f in FUELS}
    d0_values = diameters(real)
    pos = positions(d0_values)
    assert len(pos) == expected_count(d0_values), (len(pos), expected_count(d0_values))

    # A position set exactly at a real test's conditions lists that test first.
    for r in real.itertuples(index=False):
        first = nearest(tests_by_fuel, r.fuel, r.ceiling_temperature_k, r.log_heat_spreading, r.d0_mm)[0]
        assert first[0] == r.flex_test or first[1] == 0.0, (r.flex_test, first)

    # The fitted link, trained once on all eligible tests.
    eligible = fit.eligible_for_link(df)
    link = fit.model().fit(eligible[fit.LINK_FEATURES], eligible["share_burned"])

    cache = {"T": {}, "a": {}}
    feats, meta = [], []
    for fuel, o2, gas, x, p, d0 in pos:
        T, a = _numbers(fuel, o2, gas, x, p, cache)
        feats.append([T, np.log10(a), d0, 1 if fuel == "Heptane" else 0])
        meta.append((fuel, o2, gas, x, p, d0, T, a))
    pred = np.clip(link.predict(pd.DataFrame(feats, columns=fit.LINK_FEATURES)), 0.0, 1.0)

    rows, n_no_near = [], 0
    for (fuel, o2, gas, x, p, d0, T, a), f, pr in zip(meta, feats, pred):
        near = nearest(tests_by_fuel, fuel, T, f[1], d0)
        far = abs(near[0][2] - T) > NO_TEST_NEAR_K
        n_no_near += far
        rows.append([fuel, o2, gas, x, p, d0, round(T, 1), float(f"{a:.4e}"),
                     None if far else round(float(pr), 3), bool(far),
                     [[n, round(dd, 3)] for n, dd, _ in near]])
    assert all(r[8] is None for r in rows if r[9]), "a flagged position has a prediction"
    assert all(o2 + x <= 1.0 + 1e-9 for _, o2, _, x, _, _ in pos)
    return {"columns": COLUMNS, "rows": rows, "n_no_test_near": int(n_no_near),
            "d0_values_mm": d0_values, "n_rows": len(rows)}
