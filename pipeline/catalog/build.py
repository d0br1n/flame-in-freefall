"""Build the catalog database from the raw PSI files (Linear DOB-60).

    python3 pipeline/catalog/build.py                       # data/raw -> data/build/catalog.sqlite
    python3 pipeline/catalog/build.py --raw <dir> --out <file>

Reads, and changes nothing in:
    <raw>/json/PSI-<n>.json        the PSI detail record of each of the 24 investigations
                                   (download: .claude/skills/psi-api/psi_client.py list ...)
    <raw>/tables/PSI-<n>_Experimental table_*.csv   the 22 experimental tables (DOB-67, DOB-69;
                                   download: psi_client.py tables), read by tables.py
    pipeline/catalog/curation/investigations.yaml   our tags and plain summaries (DOB-61)

Writes one SQLite file, rebuilt from scratch every run, with the same bytes for the same
input (no timestamps, rows in a fixed order). Every row keeps the PSI ID it came from.

What is copied from PSI, unchanged: the metadata text, the file lists (current files only:
`experimentalTable` and `added`, never `removed`), the publications, and the people's names,
affiliations and roles. Email, phone and address are not copied. PSI's `totalFileSize` is
kept but not trusted (FLEX registers 924 GB and exposes one 25 KB file), so the catalog also
stores the size of the files PSI actually lists.

The build stops, naming the PSI ID, when a record is missing, when the curation file fails its
own checks, or when the two disagree on the set of investigations.
Standard library only. Code generated with SI assistance (Claude Code), reviewed by the team.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from pipeline.catalog import tables as tables_mod  # noqa: E402
from pipeline.catalog.curation import validate as curation  # noqa: E402

SCHEMA_VERSION = 2
DEFAULT_RAW = REPO / "data" / "raw"
DEFAULT_OUT = REPO / "data" / "build" / "catalog.sqlite"

SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE investigations (
    psi_id TEXT PRIMARY KEY,
    sort_key INTEGER NOT NULL,
    acronym TEXT NOT NULL,
    title TEXT NOT NULL,
    research_area TEXT NOT NULL,
    sub_area TEXT NOT NULL,
    project_type TEXT NOT NULL,
    flight_program TEXT NOT NULL,
    hardware TEXT NOT NULL,
    hardware_link TEXT NOT NULL,           -- as PSI writes it (one or more URLs, comma-separated)
    related_glds TEXT NOT NULL,            -- PSI's related investigations, as written
    managing_center TEXT NOT NULL,
    start_date TEXT NOT NULL,              -- as PSI writes it (MM-DD-YYYY), '' when absent
    end_date TEXT NOT NULL,
    release_date TEXT NOT NULL,
    psi_modified TEXT NOT NULL,
    doi TEXT NOT NULL,
    license_id TEXT NOT NULL,
    license_name TEXT NOT NULL,
    license_link TEXT NOT NULL,
    objective TEXT NOT NULL,
    approach TEXT NOT NULL,
    hypothesis TEXT NOT NULL,
    research_impacts TEXT NOT NULL,
    psi_total_file_size REAL,              -- PSI's own figure: often far larger than what is listed
    -- curation (pipeline/catalog/curation/investigations.yaml), each tag with its source
    ground_investigation INTEGER NOT NULL,
    pillar TEXT NOT NULL, pillar_source TEXT NOT NULL,
    stage TEXT,                            -- spread | detect | suppress | NULL
    fuel_phase TEXT NOT NULL, fuel_phase_source TEXT NOT NULL,
    hardware_group TEXT NOT NULL, hardware_group_source TEXT NOT NULL,
    measurements TEXT NOT NULL,            -- JSON list of strings
    measurements_source TEXT NOT NULL,
    summary_plain TEXT NOT NULL, summary_written_by TEXT NOT NULL, summary_source TEXT NOT NULL,
    cannot_tell TEXT NOT NULL,
    review_note TEXT NOT NULL
);

CREATE TABLE files (
    psi_id TEXT NOT NULL REFERENCES investigations(psi_id),
    position INTEGER NOT NULL,             -- order in the PSI record, within its kind
    file_name TEXT NOT NULL,
    kind TEXT NOT NULL,                    -- experimental_table | data_file
    category TEXT NOT NULL,                -- PSI folder ("Raw Data", "Reports", ...); "Other" if none
    subcategory TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    version INTEGER,
    PRIMARY KEY (psi_id, kind, file_name)
);
CREATE INDEX files_by_investigation ON files (psi_id, kind, position);

CREATE TABLE publications (
    psi_id TEXT NOT NULL REFERENCES investigations(psi_id),
    position INTEGER NOT NULL,             -- order in the PSI record
    title TEXT NOT NULL,
    authors TEXT NOT NULL,
    doi TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (psi_id, position)
);

CREATE TABLE tests (                    -- one row per data row of the 22 experimental tables
    test_id TEXT PRIMARY KEY,              -- docs/ARCHITECTURE.md, 'The test ID rule'
    sort_key INTEGER NOT NULL,             -- order: PSI number, file, row
    psi_id TEXT NOT NULL REFERENCES investigations(psi_id),
    table_name TEXT NOT NULL,
    test_number TEXT,                      -- as the table writes it, NULL if it has no such column
    source_file TEXT NOT NULL,
    source_row INTEGER NOT NULL,           -- 1 = first row under the header
    raw TEXT NOT NULL,                     -- JSON: the original row, header names as keys
    is_note INTEGER NOT NULL,              -- a note line kept from the table, not a test
    fuel TEXT, fuel_phase TEXT,
    o2_mole_fraction REAL, pressure_kpa REAL, flow_cm_s REAL,
    diluent TEXT, outcome TEXT,
    comparable INTEGER NOT NULL,           -- states both oxygen and pressure
    original TEXT NOT NULL,                -- JSON: {field: {text, unit, column}}
    flags TEXT NOT NULL                    -- JSON list
);
CREATE INDEX tests_by_investigation ON tests (psi_id, sort_key);

CREATE TABLE experimental_tables (
    source_file TEXT PRIMARY KEY,
    psi_id TEXT NOT NULL REFERENCES investigations(psi_id),
    table_name TEXT NOT NULL,
    rows INTEGER NOT NULL,
    note TEXT NOT NULL                     -- what this table cannot give
);

CREATE TABLE people (
    psi_id TEXT NOT NULL REFERENCES investigations(psi_id),
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    affiliation TEXT NOT NULL,
    roles TEXT NOT NULL,                   -- JSON list of strings
    PRIMARY KEY (psi_id, position)
);
"""


class BuildError(Exception):
    """The input cannot make a trustworthy catalog. The message names what to fix."""


def sort_key(psi_id: str) -> int:
    return int(psi_id.split("-", 1)[1])


def _s(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _size(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def load_records(raw: Path, ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """The PSI detail record of every investigation in ids, or BuildError naming the missing ones."""
    folder = raw / "json"
    records, missing = {}, []
    for pid in ids:
        path = folder / f"{pid}.json"
        if not path.is_file():
            missing.append(pid)
            continue
        record = json.loads(path.read_text(encoding="utf-8"))
        if record.get("accession") != pid:
            raise BuildError(f"{path}: holds {record.get('accession')!r}, expected {pid}")
        records[pid] = record
    if missing:
        raise BuildError(
            f"missing PSI record(s) in {folder}: {', '.join(missing)}. Download them with: "
            f"python3 .claude/skills/psi-api/psi_client.py list --area \"Combustion Science\"")
    return records


def load_curation(path: Path = curation.CURATION) -> Dict[str, Dict[str, Any]]:
    entries = curation.load(path)
    problems = curation.validate(entries)
    if problems:
        raise BuildError("curation file fails its checks:\n  " + "\n  ".join(problems))
    return entries


def investigation_row(pid: str, r: Dict[str, Any], c: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "psi_id": pid, "sort_key": sort_key(pid),
        "acronym": _s(r.get("investigationAcronym")),   # empty for the 5 ground investigations
        "title": _s(r.get("title")),
        "research_area": _s(r.get("researchArea")), "sub_area": _s(r.get("subResearchArea")),
        "project_type": _s(r.get("projectType")), "flight_program": _s(r.get("flightProgram")),
        "hardware": _s(r.get("experimentHardware")),
        "hardware_link": _s(r.get("experimentHardwareLink")),
        "related_glds": _s(r.get("related_glds")),
        "managing_center": _s(r.get("managingNasaCenter")),
        "start_date": _s(r.get("investigationStartDate")), "end_date": _s(r.get("investigationEndDate")),
        "release_date": _s(r.get("releaseDate")), "psi_modified": _s(r.get("modifiedDate")),
        "doi": _s(r.get("doi")),
        "license_id": _s(r.get("licenseIdentifier")), "license_name": _s(r.get("licenseName")),
        "license_link": _s(r.get("licenseLink")),
        "objective": _s(r.get("objective")), "approach": _s(r.get("approach")),
        "hypothesis": _s(r.get("hypothesis")), "research_impacts": _s(r.get("researchImpacts")),
        "psi_total_file_size": r.get("totalFileSize"),
        "ground_investigation": 1 if _s(r.get("projectType")) == "Ground Investigation" else 0,
        "pillar": c["pillar"]["value"], "pillar_source": c["pillar"]["source"],
        "stage": c.get("stage"),
        "fuel_phase": c["fuel_phase"]["value"], "fuel_phase_source": c["fuel_phase"]["source"],
        "hardware_group": c["hardware_group"]["value"], "hardware_group_source": c["hardware_group"]["source"],
        "measurements": json.dumps(list(c["measurements"]["value"])),
        "measurements_source": c["measurements"]["source"],
        "summary_plain": c["summary_plain"]["text"], "summary_written_by": c["summary_plain"]["written_by"],
        "summary_source": c["summary_plain"]["source"],
        "cannot_tell": c["cannot_tell"], "review_note": _s(c.get("review_note")),
    }


def category_of(f: Dict[str, Any]) -> str:
    """The PSI folder of a file: '/Home/psi-data/PSI-25/Raw Data/...' gives 'Raw Data'."""
    parts = _s(f.get("remote_path")).split("/")
    return parts[4] if len(parts) > 4 and parts[4] else "Other"


def file_rows(pid: str, r: Dict[str, Any]) -> List[tuple]:
    """Current files only, in PSI's order. A name listed twice in one kind keeps its first entry."""
    rows, seen = [], set()
    for kind, key in (("experimental_table", "experimentalTable"), ("data_file", "added")):
        position = 0
        for f in r.get(key) or []:
            name = _s(f.get("file_name"))
            if not name or (kind, name) in seen or f.get("visible") is False:
                continue
            seen.add((kind, name))
            version = f.get("version")
            rows.append((pid, position, name, kind, category_of(f), _s(f.get("subcategory")),
                         _size(f.get("file_size")), int(version) if isinstance(version, (int, float)) else None))
            position += 1
    return rows


def publication_rows(pid: str, r: Dict[str, Any]) -> List[tuple]:
    rows = []
    for i, p in enumerate(r.get("publications") or []):
        status = p.get("status") or {}
        rows.append((pid, i, _s(p.get("title")), _s(p.get("authorList")), _s(p.get("doi")),
                     _s(status.get("annotationValue") if isinstance(status, dict) else status)))
    return rows


def people_rows(pid: str, r: Dict[str, Any]) -> List[tuple]:
    rows = []
    for i, p in enumerate(r.get("contacts") or []):
        name = " ".join(x for x in (_s(p.get("firstName")), _s(p.get("midInitials")), _s(p.get("lastName"))) if x)
        roles = [_s(x.get("annotationValue")) for x in p.get("roles") or [] if _s(x.get("annotationValue"))]
        rows.append((pid, i, name, _s(p.get("affiliation")), json.dumps(roles)))
    return rows


def build(raw: Path = DEFAULT_RAW, out: Path = DEFAULT_OUT,
          curation_path: Path = curation.CURATION) -> Dict[str, int]:
    """Write the catalog database. Returns the row counts."""
    entries = load_curation(curation_path)
    ids = sorted(entries, key=sort_key)
    records = load_records(Path(raw), ids)
    try:
        tests = tables_mod.load_tests(Path(raw) / "tables")
    except tables_mod.TableError as exc:
        raise BuildError(str(exc)) from None
    unknown = sorted({t.psi_id for t in tests} - set(ids))
    if unknown:
        raise BuildError(f"tables for investigations outside the catalog: {', '.join(unknown)}")

    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".tmp")
    if tmp.exists():
        tmp.unlink()
    db = sqlite3.connect(tmp)
    try:
        db.executescript(SCHEMA)
        counts = {"investigations": 0, "files": 0, "experimental_tables": 0, "publications": 0, "people": 0}
        for pid in ids:
            row = investigation_row(pid, records[pid], entries[pid])
            cols = ", ".join(row)
            db.execute(f"INSERT INTO investigations ({cols}) VALUES ({', '.join('?' * len(row))})",
                       list(row.values()))
            files = file_rows(pid, records[pid])
            db.executemany("INSERT INTO files VALUES (?, ?, ?, ?, ?, ?, ?, ?)", files)
            pubs = publication_rows(pid, records[pid])
            db.executemany("INSERT INTO publications VALUES (?, ?, ?, ?, ?, ?)", pubs)
            people = people_rows(pid, records[pid])
            db.executemany("INSERT INTO people VALUES (?, ?, ?, ?, ?)", people)
            counts["investigations"] += 1
            counts["files"] += len(files)
            counts["experimental_tables"] += sum(1 for f in files if f[3] == "experimental_table")
            counts["publications"] += len(pubs)
            counts["people"] += len(people)
        tests.sort(key=lambda t: (sort_key(t.psi_id), t.source_file, t.source_row))
        per_table: Dict[str, int] = {}
        for k, t in enumerate(tests):
            sh = t.shared
            db.execute("INSERT INTO tests VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
                t.test_id, k, t.psi_id, t.table_name, t.test_number, t.source_file, t.source_row,
                json.dumps(t.raw, ensure_ascii=False), int(sh["is_note"])   # raw keeps the table's column order
               , sh["fuel"], sh["fuel_phase"],
                sh["o2_mole_fraction"], sh["pressure_kpa"], sh["flow_cm_s"], sh["diluent"], sh["outcome"],
                int(bool(sh.get("comparable"))), tables_mod.dumps(sh["original"]), tables_mod.dumps(sh["flags"])))
            per_table[t.source_file] = per_table.get(t.source_file, 0) + 1
        for name, info in sorted(tables_mod.table_notes().items()):
            db.execute("INSERT INTO experimental_tables VALUES (?, ?, ?, ?, ?)",
                       (name, tables_mod.psi_id_of(name), info["table"], per_table.get(name, 0), info["note"]))
        counts["tests"] = len(tests)
        cov = tables_mod.coverage(tests)
        meta = {
            "table_rows": json.dumps(per_table, sort_keys=True),
            "coverage": json.dumps(cov, sort_keys=True),
            "schema_version": str(SCHEMA_VERSION),
            "source": "NASA Physical Sciences Informatics (PSI), psi.nasa.gov, research area Combustion Science",
            "curation_status": _s(json.loads(Path(curation_path).read_text(encoding="utf-8"))
                                  .get("_meta", {}).get("status")),
            "psi_last_modified": max((_s(r.get("modifiedDate")) for r in records.values()), default=""),
            "counts": json.dumps(counts, sort_keys=True),
        }
        db.executemany("INSERT INTO meta VALUES (?, ?)", sorted(meta.items()))
        db.commit()
    finally:
        db.close()
    tmp.replace(out)
    return counts


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--raw", type=Path, default=DEFAULT_RAW, help="raw PSI folder (default data/raw)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="database to write")
    args = parser.parse_args(argv)
    try:
        counts = build(args.raw, args.out)
    except BuildError as exc:
        print(f"catalog build failed: {exc}", file=sys.stderr)
        return 1
    print(f"wrote {args.out}: " + ", ".join(f"{v} {k}" for k, v in counts.items()))
    db = sqlite3.connect(args.out)
    try:
        cov = json.loads(db.execute("SELECT value FROM meta WHERE key='coverage'").fetchone()[0])
    finally:
        db.close()
    print()
    print("Shared columns per investigation (test rows that state each field):")
    print(tables_mod.coverage_text(cov))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
