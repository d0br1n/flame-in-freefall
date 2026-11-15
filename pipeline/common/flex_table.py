"""Shared reading rules for the PSI-69 (FLEX) experimental table.

One place for the rules that belong to the file itself, so the catalog and the flame
temperature engine read it the same way. Written with SI assistance (Claude Code).

Rules:
  * the file is Windows-1252 (cp1252);
  * blanks and dashes are missing values;
  * the column headed ``CO`` is treated as carbon dioxide (ASSUMPTION, not stated in the
    file; the human check is Linear issue DOB-51);
  * test 114 lists pressure 0, which is impossible: the row is kept and flagged ``suspect``.

Rows come back as read, in the table's own units, each with the shared test ID
``PSI-69/<FLEX Test #>``.
"""

from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parent.parent.parent
FLEX_CSV = REPO / "data/raw/tables/PSI-69_Experimental table_FLEX.csv"

PSI_ID = "PSI-69"
MISSING = ["", " ", "-", "–", "—", "−"]  # blank, hyphen, en dash, em dash, minus

CO_ASSUMPTION = (
    "The column headed 'CO initial ambient composition' is treated as carbon dioxide (CO2). "
    "The PSI file does not say so; this is an assumption, to be confirmed by a chemist (DOB-51)."
)

# Exact header text in the file -> short name. Units stay in the table's own units.
COLUMNS = {
    "FLEX Test #": "flex_test",
    "FLEX Identifier": "identifier",
    "Test Date": "test_date",
    "Test GMT": "test_gmt",
    "Fuel": "fuel",
    "Ambient pressure; mmHg": "pressure_mmhg",
    "O initial ambient composition; mole fraction": "x_o2",
    "N initial ambient composition; mole fraction": "x_n2",
    "CO initial ambient composition; mole fraction": "x_co2",
    "He initial ambient composition; mole fraction": "x_he",
    "Droplet initial diameter; mm": "d0_mm",
    "Visible flame extinction diameter; mm": "d_end_mm",
    "Burning rate; mm": "burning_rate_mm2_s",  # header says "mm"; the unit is mm^2/s in the PSI record
    "Burn time; s": "burn_time_s",
    "Test end": "test_end",
}
NUMERIC = [
    "pressure_mmhg", "x_o2", "x_n2", "x_co2", "x_he", "d0_mm", "d_end_mm",
    "burning_rate_mm2_s", "burn_time_s",
]


def load_flex_table(path: Path = FLEX_CSV) -> pd.DataFrame:
    """Return the FLEX rows as read: 274 rows, short column names, plus ``test_id`` and ``suspect``."""
    raw = pd.read_csv(path, encoding="cp1252", na_values=MISSING, keep_default_na=False)
    missing = [c for c in COLUMNS if c not in raw.columns]
    if missing:
        raise ValueError(f"PSI-69 table has changed, headers not found: {missing}")
    df = raw[list(COLUMNS)].rename(columns=COLUMNS)
    for col in NUMERIC:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["flex_test"] = df["flex_test"].astype(int)
    df["fuel"] = df["fuel"].str.strip()
    df["test_end"] = df["test_end"].str.strip()
    df["test_id"] = PSI_ID + "/" + df["flex_test"].astype(str)
    df["suspect"] = df["pressure_mmhg"].fillna(0) <= 0
    df["suspect_reason"] = df["suspect"].map({True: "pressure listed as 0 mmHg", False: ""})
    return df
