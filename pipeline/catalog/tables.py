"""The 22 PSI experimental tables as test rows (Linear DOB-67 raw rows, DOB-69 shared columns).

Two layers, kept apart:

1. read_table(): every non-empty data row of a table, exactly as written, with its file and
   row number (row 1 = the first row under the header). Nothing dropped, nothing changed.
2. ADAPTERS: per table, which columns state fuel, fuel phase, oxygen, pressure, airflow,
   diluent and outcome, and in which unit. adapt() turns a raw row into shared columns:
   oxygen as a mole fraction, pressure in kPa, flow in cm/s. Every shared value keeps the
   original text, unit and column next to it. A value the table does not state stays None.
   A cell that is not one number (RAMP, -, n/a, a range, a list) stays None and is flagged:
   nothing is guessed, averaged or filled in from papers.

Pitfalls handled (docs/PSI_VERIFICATION_REPORT.md, section 4): FLEX is Windows-1252; CFI-G
Inverse has 861 empty trailing lines; text inside numeric columns; Saffire-II note rows are
kept and flagged; FLEX test 114 states 0 mmHg and is kept, flagged suspect, not corrected.
Standard library only. Code generated with SI assistance (Claude Code), reviewed by the team.
"""
from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

# Exact conversion constants (kPa).
KPA_PER_ATM = 101.325
KPA_PER_MMHG = 101.325 / 760          # 760 mmHg = 1 standard atmosphere, by definition
KPA_PER_BAR = 100.0
KPA_PER_PSI = 6.894757293168361       # 1 lbf/in²
TO_KPA = {"atm": KPA_PER_ATM, "mmHg": KPA_PER_MMHG, "bar": KPA_PER_BAR, "psia": KPA_PER_PSI, "kPa": 1.0}

FIELDS = ("o2_mole_fraction", "pressure_kpa", "flow_cm_s")
NUMBER = re.compile(r"^(~\s*)?([-+]?(?:\d+\.?\d*|\.\d+))\s*([A-Za-z/%]+)?$")


class TableError(Exception):
    """A table cannot be read as PSI publishes it. The message names the file."""


# ------------------------------------------------------------------ reading
def decode(path: Path, encoding: str) -> str:
    data = path.read_bytes()
    try:
        return data.decode(encoding)
    except UnicodeDecodeError as exc:
        raise TableError(f"{path.name}: cannot be read as {encoding} ({exc}). "
                         f"Set the encoding in pipeline/catalog/tables.py ADAPTERS.") from None


def unique_headers(header: List[str]) -> List[str]:
    """Header names as written; a repeated or blank name gets ' (2)' or 'column N' to stay a key."""
    out, seen = [], {}
    for i, h in enumerate(header):
        name = h if h.strip() else f"column {i + 1}"
        if name in seen:
            seen[name] += 1
            name = f"{name} ({seen[name]})"
        else:
            seen[name] = 1
        out.append(name)
    return out


def read_table(path: Path, encoding: str = "utf-8-sig") -> Tuple[List[str], List[Tuple[int, Dict[str, str]]]]:
    """(headers, [(row number, {header: cell})]) for every non-empty data row."""
    rows = list(csv.reader(io.StringIO(decode(path, encoding), newline="")))
    if not rows:
        raise TableError(f"{path.name}: empty file")
    headers = unique_headers(rows[0])
    out = []
    for n, cells in enumerate(rows[1:], start=1):
        if not any(c.strip() for c in cells):
            continue                                   # blank line (CFI-G Inverse has 861 at the end)
        if len(cells) > len(headers):
            extra = [f"column {i + 1}" for i in range(len(headers), len(cells))]
            raw = dict(zip(headers + extra, cells))
        else:
            raw = dict(zip(headers, cells + [""] * (len(headers) - len(cells))))
        out.append((n, raw))
    return headers, out


# ------------------------------------------------------------------ numbers
def parse_number(text: str, default_unit: Optional[str] = None) -> Tuple[Optional[float], Optional[str], List[str]]:
    """(value, unit, flags) of a cell that states one number. Anything else gives (None, None, [flag]).

    '~ 21.5' is 21.5 flagged approximate; '30 cm/s' and '1 atm ' carry their unit. Ranges,
    lists, words and spreadsheet errors are not numbers.
    """
    t = (text or "").strip()
    if not t:
        return None, None, []
    m = NUMBER.match(t)
    if not m:
        if re.search(r"\d\s*(-|to|;|,|or)\s*\.?\d", t):
            return None, None, ["range_or_list"]
        return None, None, ["not_a_number"]
    value = float(m.group(2))
    unit = m.group(3) or default_unit
    return value, unit, (["approximate"] if m.group(1) else [])


# ------------------------------------------------------------------ adapters
@dataclass
class Adapter:
    """How one table maps to the shared columns. Column names are exactly the table's."""
    table: str                                   # short name shown in the product
    encoding: str = "utf-8-sig"
    test: Optional[str] = None                   # the test-number column, if the table has one
    fuel: Optional[str] = None
    fuel_phase: Optional[str] = None             # solid | liquid | gas | aerosol, from the curation file
    o2: Optional[Tuple[str, str]] = None         # (column, "fraction" or "percent")
    pressure: Optional[Tuple[str, str]] = None   # (column, unit when the cell gives none)
    flow: Optional[Tuple[str, str]] = None       # (column, "cm/s")
    outcome: Optional[Tuple[str, Dict[str, Optional[str]]]] = None   # (column, cell -> label)
    diluent: Optional[Callable[[Dict[str, str]], Tuple[Optional[str], Dict[str, Any]]]] = None
    is_note: Optional[Callable[[Dict[str, str]], bool]] = None
    row_flags: Optional[Callable[[Dict[str, str]], List[str]]] = None
    note: str = ""                               # what this table cannot give, said once


def _inert_gases(columns: Dict[str, str], labels: Dict[str, str]):
    """Diluent = the inert gases with a non-zero mole fraction, e.g. 'N2+CO2'."""
    def pick(raw: Dict[str, str]):
        present, unparsed = [], False
        for col, label in labels.items():
            value, _, flags = parse_number(raw.get(col, ""))
            if value is None:
                unparsed = unparsed or bool(raw.get(col, "").strip())
            elif value > 0:
                present.append(label)
        if not present:
            return None, {}
        text = "; ".join(f"{labels[c]} {raw.get(c, '').strip()}" for c in labels)
        return "+".join(present), {"text": text, "unit": "mole fraction",
                                   "column": ", ".join(columns[c] for c in labels)}
    return pick


FLEX_GASES = {
    "N initial ambient composition; mole fraction": "N2",
    "CO initial ambient composition; mole fraction": "CO2",
    "He initial ambient composition; mole fraction": "He",
}
CFI_GASES = {"Nitrogen": "N2", "Helium": "He"}
CFIG_OUTCOME = {"SE": "Self-extinguished", "FT": "Flow terminated", "-": None}


def _flex_flags(raw: Dict[str, str]) -> List[str]:
    flags = []
    p, _, _ = parse_number(raw.get("Ambient pressure; mmHg", ""))
    if p == 0:
        flags.append("suspect_pressure")          # test 114: 0 mmHg, a data-entry error; kept, not corrected
    co, _, _ = parse_number(raw.get("CO initial ambient composition; mole fraction", ""))
    if co:
        flags.append("co_header_assumed_co2")     # the header reads 'CO': subscripts lost; the file does not say
    return flags


def _saffire2_note(raw: Dict[str, str]) -> bool:
    return not re.fullmatch(r"2-\d+", raw.get("Sample Number", "").strip())


def _saffire1_note(raw: Dict[str, str]) -> bool:
    """Saffire-I lists two pre-test flow-visualisation runs (F1C1/F1C2, F2C1/F2C2) after its two samples."""
    return not re.fullmatch(r"S\d+", raw.get("Sample Number ", "").strip())


ADAPTERS: Dict[str, Adapter] = {
    "PSI-69_Experimental table_FLEX.csv": Adapter(
        "FLEX", encoding="cp1252", test="FLEX Test #", fuel="Fuel", fuel_phase="liquid",
        o2=("O initial ambient composition; mole fraction", "fraction"),
        pressure=("Ambient pressure; mmHg", "mmHg"),
        outcome=("Test end", {"Extinction": "Extinction", "Disruption": "Disruption", "Completion": "Completion"}),
        diluent=_inert_gases({c: c for c in FLEX_GASES}, FLEX_GASES), row_flags=_flex_flags,
        note="Quiescent droplets: no airflow column."),
    "PSI-68_Experimental table_Flex2.csv": Adapter(
        "FLEX-2 test matrix", fuel="Sample (Fuel Type)", fuel_phase="liquid",
        o2=("Oxygen Mole Fraction", "fraction"), pressure=("Ambient Pressure (atm)", "atm"),
        flow=("Flow Velocity (cm/s)", "cm/s"),
        note="A matrix of planned ranges per fuel, not one row per test."),
    "PSI-39_Experimental table_CFI.csv": Adapter(
        "CFI", test="Flex Number", fuel="Fuel ", fuel_phase="liquid",
        o2=("Oxygen", "fraction"), pressure=("Pressure", "atm"),
        diluent=_inert_gases({c: c for c in CFI_GASES}, CFI_GASES),
        note="No outcome column."),
    "PSI-10_Experimental table_Flame Design_Normal Flame.csv": Adapter(
        "Flame Design, normal flames", test="Test", fuel="Fuel", fuel_phase="gas",
        o2=("XO2 (init)", "fraction"), pressure=("pmean (atm)", "atm"),
        note="No outcome column. Oxygen is the ambient mole fraction at the start of the test."),
    "PSI-10_Experimental table_Flame Design_Inverse Flame.csv": Adapter(
        "Flame Design, inverse flames", test="Test", fuel_phase="gas", pressure=("pmean (atm)", "atm"),
        row_flags=lambda raw: ["oxygen_is_burner_stream"],
        note="Inverse flames: oxygen flows from the burner into a fuel atmosphere, so XO2 is not "
             "the ambient oxygen and is left out of the shared column (it stays in the raw row)."),
    "PSI-159_Experimental table_CFI-G_Normal Flames.csv": Adapter(
        "CFI-G, normal flames", test="Test", fuel="Fuel", fuel_phase="gas",
        o2=(" XO2 before test", "fraction"), pressure=("approx p (bar)", "bar"),
        outcome=("Self-ext or flow term", CFIG_OUTCOME),
        note="Pressure is written as approximate by the source."),
    "PSI-159_Experimental table_CFI-G_Inverse Flames.csv": Adapter(
        "CFI-G, inverse flames", test="Test", fuel="Fuel", fuel_phase="gas",
        pressure=("approx p (bar)", "bar"), outcome=("Self -ext or flow term", CFIG_OUTCOME),
        row_flags=lambda raw: ["oxygen_is_burner_stream"],
        note="Inverse flames: XO2 is the burner stream, not the ambient oxygen; left out of the shared column."),
    "PSI-20_Experimental table_ACME BRE.csv": Adapter(
        "ACME BRE", fuel="Fuel Bottle", fuel_phase="gas", o2=("Oxygen Conc (percent)", "percent"),
        note="One row per test day; oxygen is a list of the levels run that day."),
    "PSI-21_Experimental table_CLD Flame.csv": Adapter("ACME CLD", fuel="Fuel Bottle", fuel_phase="gas",
                                                       note="One row per test day; no oxygen or pressure column."),
    "PSI-22_Experimental table_ACME E-FIELD Flames.csv": Adapter("ACME E-FIELD", fuel="Fuel Bottle", fuel_phase="gas",
                                                                 note="One row per test day; no oxygen or pressure column."),
    "PSI-23_Experimental table_ACME s-Flame.csv": Adapter("ACME s-Flame", fuel="Fuel Bottle", fuel_phase="gas",
                                                          note="One row per test day; atmosphere written as text."),
    "PSI-106_Experimental table_Slice.csv": Adapter("SLICE", fuel="Fuel Type", fuel_phase="gas",
                                                    note="Test days and fuel only."),
    "PSI-107_Experimental table_Spice.csv": Adapter(
        "SPICE", fuel="Fuel", fuel_phase="gas", flow=("Air Rate (cm/s)", "cm/s"),
        note="No test number, oxygen, pressure or outcome column."),
    "PSI-25_Experimental table_BASS-II.csv": Adapter(
        "BASS-II", test="Test #", fuel="Fuel Sample Material", fuel_phase="solid",
        o2=("Calibrated  initial O2 % by vol ", "percent"),
        note="Flow is given as fan and air display settings, not cm/s, so it stays in the raw row. "
             "No pressure, spread-rate or outcome column."),
    "PSI-26_Experimental table_BASS.csv": Adapter(
        "BASS", test="As Run Test #", fuel="Fuel Sample Material", fuel_phase="solid",
        note="Test numbers and materials only."),
    "PSI-98_Experimental table_SAFFIRE-1.csv": Adapter(
        "Saffire-I", test="Sample Number ", fuel="Material", fuel_phase="solid",
        o2=("Percent O2", "percent"), flow=("Air Flow (cm/s)", "cm/s"), is_note=_saffire1_note,
        note="No pressure or outcome column. The two flow-visualisation rows are kept and flagged."),
    "PSI-99_Experimental table_SAFFIRE-2.csv": Adapter(
        "Saffire-II", test="Sample Number", fuel="Material", fuel_phase="solid",
        o2=("Percent O2 (Note 1)", "percent"), flow=("Air Flow (cm/s)", "cm/s"), is_note=_saffire2_note,
        note="Spread lengths and rates are text (~ 0, Complete, Acceleratory) and stay in the raw row. "
             "Rows that are notes or flow-visualisation runs are kept and flagged."),
    "PSI-100_Experimental table_SAFFIRE-3.csv": Adapter(
        "Saffire-III", test="Sample Number ", fuel="Material", fuel_phase="solid", flow=("Air Flow ", "cm/s"),
        note="No oxygen, pressure or outcome column."),
    "PSI-101_Experimental table_SAME-R.csv": Adapter(
        "SAME-R", test="SAME Test #", fuel="Sample Type", fuel_phase="solid",
        flow=("Inlet velocity (cm/s)", "cm/s"), note="Heated samples that smoke; not flames."),
    "PSI-102_Experimental table_SAME.csv": Adapter(
        "SAME", test="Sample #", fuel="Sample Material  ", fuel_phase="solid", flow=("Air Flow (cm/s)", "cm/s"),
        note="Heated samples that smoke; not flames."),
    "PSI-47_Experimental table_DAFT.csv": Adapter(
        "DAFT", test="Session Name", fuel="Sample Material", fuel_phase="aerosol", note="Dust sessions, not fires."),
    "PSI-142_Experimental table_Data Summary Table.csv": Adapter(
        "Data summary", test="Data ID", note="A list of data sets and their papers, not tests."),
}


def psi_id_of(file_name: str) -> str:
    return file_name.split("_", 1)[0]


# ------------------------------------------------------------------ shared columns
def _original(raw: Dict[str, str], column: str, unit: Optional[str]) -> Dict[str, Any]:
    return {"text": raw.get(column, "").strip(), "unit": unit, "column": column}


def adapt(adapter: Adapter, raw: Dict[str, str]) -> Dict[str, Any]:
    """The shared columns of one raw row: values, originals, flags and is_note."""
    note = bool(adapter.is_note and adapter.is_note(raw))
    out: Dict[str, Any] = {"fuel": None, "fuel_phase": None, "o2_mole_fraction": None, "pressure_kpa": None,
                           "flow_cm_s": None, "diluent": None, "outcome": None, "original": {},
                           "flags": ["note"] if note else [], "is_note": note}
    if note:
        return out
    if adapter.fuel:
        out["fuel"] = raw.get(adapter.fuel, "").strip() or None
    out["fuel_phase"] = adapter.fuel_phase

    def number(field_name: str, column: str, unit: Optional[str], convert: Callable[[float, str], Optional[float]]):
        text = raw.get(column, "")
        value, found_unit, flags = parse_number(text, unit)
        if text.strip():
            out["original"][field_name] = _original(raw, column, found_unit or unit)
        out["flags"].extend(f"{field_name}:{f}" for f in flags)
        if value is not None:
            converted = convert(value, found_unit or unit)
            if converted is None:
                out["flags"].append(f"{field_name}:unknown_unit")
            elif field_name == "o2_mole_fraction" and not 0 <= converted <= 1:
                converted = None                       # e.g. ACME BRE writes '3400%': not guessed to mean 34%
                out["flags"].append(f"{field_name}:out_of_range")
            out[field_name] = converted

    if adapter.o2:
        col, kind = adapter.o2
        number("o2_mole_fraction", col, "mole fraction" if kind == "fraction" else "%",
               lambda v, u: v / 100.0 if kind == "percent" else v)
    if adapter.pressure:
        col, unit = adapter.pressure
        number("pressure_kpa", col, unit,
               lambda v, u: v * TO_KPA[u] if u in TO_KPA else None)
    if adapter.flow:
        col, unit = adapter.flow
        number("flow_cm_s", col, unit, lambda v, u: v if u == "cm/s" else None)
    if adapter.outcome:
        col, mapping = adapter.outcome
        text = raw.get(col, "").strip()
        if text:
            out["original"]["outcome"] = _original(raw, col, None)
            out["outcome"] = mapping.get(text, text)
    if adapter.diluent:
        value, original = adapter.diluent(raw)
        out["diluent"] = value
        if original:
            out["original"]["diluent"] = original
    if adapter.row_flags:
        out["flags"].extend(adapter.row_flags(raw))
    out["comparable"] = out["o2_mole_fraction"] is not None and out["pressure_kpa"] is not None
    return out


@dataclass
class TestRow:
    test_id: str
    psi_id: str
    table_name: str
    test_number: Optional[str]
    source_file: str
    source_row: int
    raw: Dict[str, str]
    shared: Dict[str, Any] = field(default_factory=dict)


def load_tests(tables_dir: Path) -> List[TestRow]:
    """Every row of every table that has an adapter, with a unique test ID (docs/ARCHITECTURE.md).

    Test ID: '<PSI ID>/<test number as written>'. A number repeated within an investigation
    gets '#<row>'. A table with no test-number column uses '<PSI ID>/#<row>'.
    """
    files = sorted(p.name for p in Path(tables_dir).glob("PSI-*"))
    unknown = [f for f in files if f not in ADAPTERS]
    missing = [f for f in ADAPTERS if f not in files]
    if unknown:
        raise TableError(f"no adapter for {', '.join(unknown)}: add one to pipeline/catalog/tables.py")
    if missing:
        raise TableError(f"missing table(s) in {tables_dir}: {', '.join(missing)}. Download them with: "
                         f"python3 .claude/skills/psi-api/psi_client.py tables")
    rows: List[TestRow] = []
    for name in files:
        adapter = ADAPTERS[name]
        _, data = read_table(Path(tables_dir) / name, adapter.encoding)
        for n, raw in data:
            number = raw.get(adapter.test, "").strip() if adapter.test else ""
            rows.append(TestRow("", psi_id_of(name), adapter.table, number or None, name, n, raw, adapt(adapter, raw)))
    counts: Dict[Tuple[str, str], int] = {}
    for r in rows:
        if r.test_number:
            counts[(r.psi_id, r.test_number)] = counts.get((r.psi_id, r.test_number), 0) + 1
    for r in rows:
        if not r.test_number:
            r.test_id = f"{r.psi_id}/#{r.source_row}"
        elif counts[(r.psi_id, r.test_number)] > 1:
            r.test_id = f"{r.psi_id}/{r.test_number}#{r.source_row}"
        else:
            r.test_id = f"{r.psi_id}/{r.test_number}"
    seen: Dict[str, str] = {}
    for r in rows:
        if r.test_id in seen:
            raise TableError(f"test ID {r.test_id} is not unique ({seen[r.test_id]} and {r.source_file})")
        seen[r.test_id] = r.source_file
    return rows


def coverage(rows: List[TestRow]) -> Dict[str, Dict[str, int]]:
    """Per investigation: how many test rows state each shared field."""
    out: Dict[str, Dict[str, int]] = {}
    for r in rows:
        if r.shared["is_note"]:
            continue
        c = out.setdefault(r.psi_id, {"rows": 0, "fuel": 0, "o2_mole_fraction": 0, "pressure_kpa": 0,
                                      "flow_cm_s": 0, "diluent": 0, "outcome": 0, "comparable": 0})
        c["rows"] += 1
        for k in ("fuel", "o2_mole_fraction", "pressure_kpa", "flow_cm_s", "diluent", "outcome"):
            c[k] += r.shared[k] is not None
        c["comparable"] += bool(r.shared["comparable"])
    return out


def coverage_text(cov: Dict[str, Dict[str, int]]) -> str:
    cols = ("rows", "fuel", "o2_mole_fraction", "pressure_kpa", "flow_cm_s", "diluent", "outcome", "comparable")
    lines = ["psi_id   " + " ".join(f"{c[:10]:>10}" for c in cols)]
    for pid in sorted(cov, key=lambda p: int(p.split("-")[1])):
        lines.append(f"{pid:<8} " + " ".join(f"{cov[pid][c]:>10}" for c in cols))
    return "\n".join(lines)


def table_notes() -> Dict[str, Dict[str, str]]:
    """Per table file: its short name and what it cannot give (shown by the product)."""
    return {f: {"table": a.table, "note": a.note} for f, a in ADAPTERS.items()}


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)
