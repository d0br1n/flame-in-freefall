"""Fitted link between the two physical numbers and what happened in the real tests.

A small gradient-boosted-trees model predicts the share of fuel burned from four inputs:
ceiling temperature, log of heat-spreading speed, starting droplet diameter and fuel. It is
scored on tests it has not seen (5-fold cross-validation grouped by test day), next to a
straight-line version and a model that sees only the oxygen level.

Written with SI assistance (Claude Code).
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold

SEED = 0
N_SPLITS = 5
MAX_PRESSURE_ATM = 1.5  # the 9 tests above this are left out of the fit

LINK_FEATURES = ["ceiling_temperature_k", "log_heat_spreading", "d0_mm", "fuel_heptane"]
BOTH_NUMBERS = ["ceiling_temperature_k", "log_heat_spreading"]
OXYGEN_ONLY = ["x_o2"]

# "Near-identical" tests for the repeatability check: same fuel and gas label, and all of
# these within the tolerance. Written into flex_checks.json as well.
NEAR_IDENTICAL = {
    "same": ["fuel", "gas_label"],
    "x_o2_within": 0.005, "x_co2_within": 0.005, "x_he_within": 0.005,
    "pressure_atm_within": 0.02, "d0_mm_within": 0.1,
}


def model() -> GradientBoostingRegressor:
    """Small fixed model for about 190 rows: 100 trees of depth 3, learning rate 0.1 (the
    scikit-learn defaults, written out so a library update cannot change them). Depth 2 and
    lower rates were tried and scored lower on the same grouped folds."""
    return GradientBoostingRegressor(n_estimators=100, max_depth=3, learning_rate=0.1,
                                     subsample=1.0, random_state=SEED)


def frame(rows: list[dict]) -> pd.DataFrame:
    """The tests as a table for modelling (dropped tests removed, derived inputs added)."""
    df = pd.DataFrame(rows)
    df["dropped"] = df["flags"].map(lambda f: f["dropped"])
    df["incomplete"] = df["flags"].map(lambda f: f["incomplete"])
    df = df[~df["dropped"]].copy()
    df["log_heat_spreading"] = np.log10(df["heat_spreading_m2_s"])
    df["fuel_heptane"] = (df["fuel"] == "Heptane").astype(int)
    return df.reset_index(drop=True)


def eligible_for_link(df: pd.DataFrame) -> pd.DataFrame:
    """Complete tests at pressures up to 1.5 atm."""
    return df[(~df["incomplete"]) & df["share_burned"].notna()
              & (df["pressure_atm"] <= MAX_PRESSURE_ATM)].reset_index(drop=True)


def _cv_predict(make, X: pd.DataFrame, y: pd.Series, groups: pd.Series) -> np.ndarray:
    pred = np.full(len(y), np.nan)
    for train, test in GroupKFold(n_splits=N_SPLITS).split(X, y, groups):
        m = make()
        m.fit(X.iloc[train], y.iloc[train])
        pred[test] = m.predict(X.iloc[test])
    return pred


def _score(y, pred) -> dict:
    return {"r2": round(float(r2_score(y, pred)), 3),
            "mean_abs_error_points": round(float(mean_absolute_error(y, pred)) * 100, 1)}


def fitted_link(df: pd.DataFrame) -> dict:
    """Check: the fitted link against the straight line and the oxygen-only model."""
    d = eligible_for_link(df)
    y, groups = d["share_burned"], d["test_date"]
    link = _score(y, _cv_predict(model, d[LINK_FEATURES], y, groups))
    line = _score(y, _cv_predict(LinearRegression, d[LINK_FEATURES], y, groups))
    oxy = _score(y, _cv_predict(model, d[OXYGEN_ONLY], y, groups))
    return {
        "id": "fitted_link", "n": len(d),
        "method": f"{N_SPLITS}-fold cross-validation grouped by test day; seed {SEED}; "
                  f"tests above {MAX_PRESSURE_ATM} atm, incomplete and dropped tests left out",
        "result": {"fitted_link": link, "straight_line": line, "oxygen_only": oxy},
        "test_days": int(d["test_date"].nunique()),
        "passed": link["r2"] > oxy["r2"],
        "pass_rule": "fitted link scores above the oxygen-only model on unseen tests",
    }


def _holdout(train: pd.DataFrame, test: pd.DataFrame, features: list[str], target: str,
             make=LinearRegression) -> dict:
    m = make()
    m.fit(train[features], train[target])
    return _score(test[target], m.predict(test[features]))


# The carry-over checks ask a model to work on a gas it never saw. They use a straight line:
# trees predict a constant outside the range they were trained on, and about 100 rows are too
# few to trust them there. The same checks with the trees are stored next to the line, so the
# choice can be judged (see "gradient_boosted_trees" in each result).


def carry_over_nitrogen_to_co2(df: pd.DataFrame) -> dict:
    """Train on nitrogen-only tests, predict the carbon dioxide tests (burning rate)."""
    d = df[df["burning_rate_mm2_s"].notna() & (df["pressure_atm"] <= MAX_PRESSURE_ATM)]
    train = d[d["gas_label"] == "nitrogen only"]
    test = d[d["gas_label"] == "with carbon dioxide"]
    kw = dict(target="burning_rate_mm2_s")
    temp = _holdout(train, test, ["ceiling_temperature_k", "fuel_heptane"], **kw)
    oxy = _holdout(train, test, ["x_o2", "fuel_heptane"], **kw)
    trees = {"temperature": _holdout(train, test, ["ceiling_temperature_k", "fuel_heptane"], make=model, **kw),
             "oxygen": _holdout(train, test, ["x_o2", "fuel_heptane"], make=model, **kw)}
    return {
        "id": "carry_over_nitrogen_to_co2", "n_train": len(train), "n_test": len(test),
        "method": "straight line trained on nitrogen-only tests, predicting carbon dioxide tests; "
                  "target burning rate; inputs are one number plus fuel",
        "result": {"temperature": temp, "oxygen": oxy, "gradient_boosted_trees": trees},
        "passed": temp["r2"] > oxy["r2"],
        "pass_rule": "ceiling temperature predicts carbon dioxide tests better than oxygen level",
    }


def carry_over_helium(df: pd.DataFrame) -> dict:
    """Train with no helium test, predict the methanol helium tests (share of fuel burned)."""
    d = eligible_for_link(df)
    train = d[d["gas_label"] != "with helium"]
    test = d[(d["gas_label"] == "with helium") & (d["fuel"] == "Methanol")]
    kw = dict(target="share_burned")
    temp = _holdout(train, test, ["ceiling_temperature_k", "fuel_heptane"], **kw)
    both = _holdout(train, test, BOTH_NUMBERS + ["fuel_heptane"], **kw)
    trees = {"temperature_only": _holdout(train, test, ["ceiling_temperature_k", "fuel_heptane"], make=model, **kw),
             "both_numbers": _holdout(train, test, BOTH_NUMBERS + ["fuel_heptane"], make=model, **kw)}
    return {
        "id": "carry_over_helium", "n_train": len(train), "n_test": len(test),
        "method": "straight line trained on tests without helium, predicting methanol tests with "
                  "helium; target share of fuel burned; ceiling temperature alone against both "
                  "numbers (plus fuel)",
        "result": {"temperature_only": temp, "both_numbers": both, "gradient_boosted_trees": trees},
        "passed": both["r2"] > temp["r2"],
        "pass_rule": "both numbers predict the helium tests better than temperature alone "
                     "(a negative score for temperature alone means helium does not sit on the same curve)",
    }


def near_identical_gaps(df: pd.DataFrame) -> list[float]:
    """For every pair of near-identical tests (NEAR_IDENTICAL): how far apart their shares of
    fuel burned are, in points."""
    d = df[df["share_burned"].notna()].reset_index(drop=True)
    n = NEAR_IDENTICAL
    diffs = []
    for i in range(len(d)):
        a = d.iloc[i]
        for j in range(i + 1, len(d)):
            b = d.iloc[j]
            if (a["fuel"] == b["fuel"] and a["gas_label"] == b["gas_label"]
                    and abs(a["x_o2"] - b["x_o2"]) <= n["x_o2_within"]
                    and abs(a["x_co2"] - b["x_co2"]) <= n["x_co2_within"]
                    and abs(a["x_he"] - b["x_he"]) <= n["x_he_within"]
                    and abs(a["pressure_atm"] - b["pressure_atm"]) <= n["pressure_atm_within"]
                    and abs(a["d0_mm"] - b["d0_mm"]) <= n["d0_mm_within"]):
                diffs.append(abs(a["share_burned"] - b["share_burned"]) * 100)
    return diffs


def repeatability(df: pd.DataFrame) -> dict:
    """How far apart near-identical tests land: the noise floor for any model."""
    diffs = near_identical_gaps(df)
    median = float(np.median(diffs)) if diffs else float("nan")
    return {
        "id": "repeatability", "n_pairs": len(diffs),
        "definition_of_near_identical": NEAR_IDENTICAL,
        "result": {"median_points_apart": round(median, 1)},
        "note": "This is the noise floor: no model can do much better than the spread between "
                "near-identical tests.",
        "passed": len(diffs) >= 10,
        "pass_rule": "at least 10 near-identical pairs found, so the number means something",
    }
