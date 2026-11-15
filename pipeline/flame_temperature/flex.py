"""PSI-69 (FLEX) loader for the flame temperature engine.

Builds on the shared reading rules in pipeline/common/flex_table.py and adds only what this
engine needs: atmospheres, rescaled gas fractions, the gas label, the share of fuel burned,
and the engine's own ``dropped`` and ``incomplete`` flags. Written with SI assistance.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parent.parent.parent
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from pipeline.common.flex_table import CO_ASSUMPTION, load_flex_table  # noqa: E402

MMHG_PER_ATM = 760.0
GAS_FRACTIONS = ["x_o2", "x_n2", "x_co2", "x_he"]
GAS_SUM_RANGE = (0.98, 1.01)  # the four fractions add up to a value in this range before rescaling
# Gas label rule (from the 14 Nov spike): helium wins above this fraction, then carbon dioxide.
ADDED_GAS_THRESHOLD = 0.01
LABEL_N2, LABEL_CO2, LABEL_HE = "nitrogen only", "with carbon dioxide", "with helium"

# Counts the file must have; the loader asserts them (Linear DOB-52).
EXPECTED = {
    "rows": 274, "columns": 15, "methanol": 157, "heptane": 117, "test_days": 80,
    "test_end": {"Extinction": 186, "Disruption": 61, "Completion": 27},
}


def gas_label(x_co2: float, x_he: float) -> str:
    if x_he > ADDED_GAS_THRESHOLD:
        return LABEL_HE
    if x_co2 > ADDED_GAS_THRESHOLD:
        return LABEL_CO2
    return LABEL_N2


def load() -> pd.DataFrame:
    """The FLEX tests with the engine's columns. Every row of the table is kept."""
    df = load_flex_table()

    # The table must be the file we know.
    assert len(df) == EXPECTED["rows"], len(df)
    assert df["fuel"].eq("Methanol").sum() == EXPECTED["methanol"]
    assert df["fuel"].eq("Heptane").sum() == EXPECTED["heptane"]
    assert df["test_date"].nunique() == EXPECTED["test_days"], df["test_date"].nunique()
    assert df["test_end"].value_counts().to_dict() == EXPECTED["test_end"]

    df["pressure_atm"] = df["pressure_mmhg"] / MMHG_PER_ATM

    # Test 114 (pressure 0) is kept but dropped from every calculation.
    df["dropped"] = df["suspect"]
    df["dropped_reason"] = df["suspect_reason"]

    # Rescale the four gas fractions to add up to 1. Their raw sum must be 0.98 to 1.01.
    raw_sum = df[GAS_FRACTIONS].sum(axis=1)
    ok = raw_sum.between(*GAS_SUM_RANGE)
    bad = df.loc[~ok & ~df["dropped"], "flex_test"].tolist()
    assert not bad, f"gas fractions outside {GAS_SUM_RANGE} for tests {bad}"
    for col in GAS_FRACTIONS:
        df[col + "_scaled"] = df[col] / raw_sum
    df["gas_label"] = [gas_label(c, h) for c, h in zip(df["x_co2_scaled"], df["x_he_scaled"])]

    # Share of fuel burned = 1 - (diameter at flame-out / diameter at start)^3.
    complete = df["d0_mm"].notna() & df["d_end_mm"].notna() & (df["d0_mm"] > 0)
    df["incomplete"] = ~complete & ~df["dropped"]
    df["share_burned"] = np.where(complete, 1.0 - (df["d_end_mm"] / df["d0_mm"]) ** 3, np.nan)
    df.loc[df["dropped"], "share_burned"] = np.nan
    # Test 129 (heptane) lists a flame-out diameter of 3.34 mm against a start of 3.33 mm, a
    # measurement-noise case that gives -0.009. Values are clipped to [0, 1] and flagged.
    raw_share = df["share_burned"]
    df["share_burned"] = raw_share.clip(0.0, 1.0)
    df["share_clipped"] = raw_share.notna() & (raw_share != df["share_burned"])
    assert df["share_burned"].dropna().between(0.0, 1.0).all()
    return df


# Gas label counts: the research note says 123 with carbon dioxide and 50 with helium. The
# table has 123 and 50 rows above the threshold, but test 114 (dropped) is one of the 123, so
# the usable counts are 122 and 50, with 101 nitrogen only. Total usable 273.


def summary(df: pd.DataFrame) -> dict:
    """Counts the build prints and the later files quote."""
    usable = df[~df["dropped"]]
    done = usable[usable["share_burned"].notna()]
    return {
        "rows": len(df),
        "usable": len(usable),
        "complete": len(done),
        "incomplete": int(df["incomplete"].sum()),
        "dropped": df.loc[df["dropped"], "flex_test"].tolist(),
        "per_gas_label": usable["gas_label"].value_counts().to_dict(),
        "share_clipped_tests": df.loc[df["share_clipped"], "flex_test"].tolist(),
        "share_burned_min": float(done["share_burned"].min()),
        "share_burned_max": float(done["share_burned"].max()),
        "co_assumption": CO_ASSUMPTION,
        "added_gas_threshold": ADDED_GAS_THRESHOLD,
    }


# ---------------------------------------------------------------------------------------
# flex_tests.json (DOB-54)
# ---------------------------------------------------------------------------------------
def _num(x, digits):
    """A float rounded for JSON, or None for a missing value."""
    return None if x is None or pd.isna(x) else round(float(x), digits)


def tests_rows(df: pd.DataFrame) -> list[dict]:
    """One row per FLEX test with both computed numbers. Dropped tests hold neither."""
    import physics

    rows = []
    for r in df.itertuples(index=False):
        T = alpha = None
        if not r.dropped:
            T = physics.ceiling_temperature(r.fuel, r.x_o2_scaled, r.x_n2_scaled, r.x_co2_scaled,
                                            r.x_he_scaled, r.pressure_atm)
            alpha = physics.heat_spreading_speed(r.x_o2_scaled, r.x_n2_scaled, r.x_co2_scaled,
                                                 r.x_he_scaled, r.pressure_atm)
        rows.append({
            "test_id": r.test_id,
            "flex_test": int(r.flex_test),
            "psi_id": "PSI-69",
            "test_date": r.test_date,
            "fuel": r.fuel,
            "pressure_atm": _num(r.pressure_atm, 4),
            "x_o2": _num(r.x_o2_scaled, 4),
            "x_n2": _num(r.x_n2_scaled, 4),
            "x_co2": _num(r.x_co2_scaled, 4),
            "x_he": _num(r.x_he_scaled, 4),
            "gas_label": r.gas_label,
            "d0_mm": _num(r.d0_mm, 3),
            "ceiling_temperature_k": _num(T, 1),
            "heat_spreading_m2_s": None if alpha is None else float(f"{alpha:.4e}"),
            "share_burned": _num(r.share_burned, 4),
            "burning_rate_mm2_s": _num(r.burning_rate_mm2_s, 3),
            "burn_time_s": _num(r.burn_time_s, 2),
            "test_end": r.test_end,
            "flags": {"dropped": bool(r.dropped), "incomplete": bool(r.incomplete),
                      "share_clipped": bool(r.share_clipped)},
            "dropped_reason": r.dropped_reason or None,
        })
    return rows


# Coldest mixture that still gave a recorded test, per fuel and gas label, from the 14 Nov
# spike (research/user-research-2026-11-14/ideas-1-2-3-validation.md). Checked within 2 K.
SPIKE_COLDEST_K = {
    ("Methanol", LABEL_N2): 1674, ("Methanol", LABEL_CO2): 1627, ("Methanol", LABEL_HE): 1916,
    ("Heptane", LABEL_N2): 1771, ("Heptane", LABEL_CO2): 1764, ("Heptane", LABEL_HE): 2092,
}


def coldest(rows: list[dict]) -> dict:
    out = {}
    for row in rows:
        t = row["ceiling_temperature_k"]
        if t is None:
            continue
        key = (row["fuel"], row["gas_label"])
        out[key] = min(out.get(key, t), t)
    return out
