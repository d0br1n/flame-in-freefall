"""The catalog behind /api/v1/catalog/* (Linear DOB-66): the 24 PSI investigations.

The shapes are the ones the site reads, agreed in apps/web/fixtures/README.md (types in
apps/web/lib/types.ts). tests/api/test_catalog.py checks that, for the committed database,
these answers equal the committed fixtures field for field.

Reads data/build/catalog.sqlite (built by pipeline/catalog/build.py, DOB-60) once, at start,
into memory: it is small and read-only, so a request never touches the file. Standard library
only; main.py maps it to routes. A missing or unreadable database does not stop the app:
health says so and the catalog routes answer 503 with the command that builds it.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import quote

PSI_API = "https://psi.nasa.gov/geode-py/ws"
PSI_HOME = "https://psi.nasa.gov/physci/repo"
BUILD_COMMAND = "python3 pipeline/catalog/build.py"
FACETS = ("pillar", "stage", "fuel_phase", "hardware_group", "psi_sub_area")

HARDWARE_LABELS = {
    "acme_cir": "ACME hardware in the Combustion Integrated Rack",
    "mdca_cir": "Droplet apparatus (MDCA) in the Combustion Integrated Rack",
    "msg_flow_duct": "Flow duct in the Microgravity Science Glovebox",
    "saffire_cygnus": "Saffire enclosure in a Cygnus spacecraft",
    "smoke_diagnostics": "Smoke and aerosol instruments",
    "ground": "Ground investigation (re-uses PSI data)",
}
KIND_BY_EXTENSION = {
    ".csv": "data_files", ".txt": "data_files", ".dat": "data_files", ".xls": "data_files",
    ".xlsx": "data_files", ".asc": "data_files",
    ".mp4": "video", ".avi": "video",
    ".jpg": "images", ".png": "images", ".tif": "images", ".nef": "images",
    ".pdf": "documents", ".pptx": "documents", ".ppt": "documents", ".docx": "documents",
    ".doc": "documents", ".rtf": "documents",
    ".zip": "archives",
}
KIND_ORDER = ("table", "data_files", "video", "images", "documents", "archives")
SUMMARY_KEYS = (
    "psi_id", "acronym", "title", "ground_investigation", "pillar", "stage", "fuel_phase",
    "hardware_group", "hardware_group_label", "psi_sub_area", "summary_plain", "data_kinds",
    "table_count", "files_count", "files_bytes", "listed_bytes", "publications_count", "psi_url",
)


class CatalogUnavailable(Exception):
    """The database is missing or unreadable."""


class UnknownInvestigation(Exception):
    """No investigation with that PSI ID."""


class BadQuery(Exception):
    """A filter value or paging number the catalog cannot use."""


def normalize_psi_id(value: str) -> str:
    """'PSI-69', 'psi-69' and '69' all mean PSI-69."""
    v = value.strip().upper()
    return f"PSI-{v}" if v.isdigit() else v


def download_url(psi_id: str, file_name: str) -> str:
    """PSI's public download route: no login, answers with a redirect to the file."""
    return f"{PSI_API}/studies/{psi_id}/download?file={quote(file_name)}"


def text(value: Any) -> Optional[str]:
    """A non-empty trimmed string, or None."""
    return value.strip() if isinstance(value, str) and value.strip() else None


def number(value: Any) -> Optional[float]:
    """PSI's sizes are floats that hold whole numbers: send them as integers when they are."""
    if value is None:
        return None
    return int(value) if float(value).is_integer() else value


def extension(name: str) -> str:
    return name[name.rindex("."):].lower() if "." in name else ""


@dataclass
class Catalog:
    path: Path
    investigations: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    files: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)
    publications: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)
    meta: Dict[str, str] = field(default_factory=dict)
    tests: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    _summaries: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    _tests_by_id: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    # ------------------------------------------------------------------ loading
    def load(self) -> "Catalog":
        for d in (self.investigations, self.files, self.publications, self.meta, self._summaries,
                  self.tests, self._tests_by_id):
            d.clear()
        self.error = None
        if not self.path.is_file():
            self.error = f"no catalog database at {self.path}. Build it with: {BUILD_COMMAND}"
            return self
        try:
            db = sqlite3.connect(f"file:{self.path.as_posix()}?mode=ro", uri=True)
            db.row_factory = sqlite3.Row
            try:
                self.meta = {r["key"]: r["value"] for r in db.execute("SELECT key, value FROM meta")}
                for r in db.execute("SELECT * FROM investigations ORDER BY sort_key"):
                    self.investigations[r["psi_id"]] = dict(r)
                for r in db.execute("SELECT * FROM files ORDER BY psi_id, kind DESC, position"):
                    self.files.setdefault(r["psi_id"], []).append(dict(r))   # tables first, then data files
                for r in db.execute("SELECT * FROM publications ORDER BY psi_id, position"):
                    self.publications.setdefault(r["psi_id"], []).append(dict(r))
                for r in db.execute("SELECT * FROM tests ORDER BY sort_key"):
                    t = dict(r)
                    for k in ("raw", "original", "flags"):
                        t[k] = json.loads(t[k])
                    t["comparable"], t["is_note"] = bool(t["comparable"]), bool(t["is_note"])
                    self.tests.append(t)
                    self._tests_by_id[t["test_id"]] = t
            finally:
                db.close()
        except sqlite3.Error as exc:
            self.investigations.clear()
            self.error = f"catalog database {self.path} is unreadable ({exc}). Rebuild it with: {BUILD_COMMAND}"
            return self
        self._summaries = {pid: self._summary(pid) for pid in self.investigations}
        return self

    @property
    def ok(self) -> bool:
        return self.error is None and bool(self.investigations)

    def _need(self) -> None:
        if not self.ok:
            raise CatalogUnavailable(self.error or f"the catalog is empty. Rebuild it with: {BUILD_COMMAND}")

    def _pid(self, psi_id: str) -> str:
        self._need()
        pid = normalize_psi_id(psi_id)
        if pid not in self.investigations:
            raise UnknownInvestigation(
                f"No investigation '{psi_id}'. The catalog holds the 24 PSI combustion investigations: "
                f"GET /api/v1/catalog/investigations lists them.")
        return pid

    def health(self) -> Dict[str, Any]:
        if not self.ok:
            return {"status": "missing", "error": self.error}
        return {"status": "ok", "investigations": len(self.investigations),
                "schema_version": int(self.meta.get("schema_version", "0")),
                "counts": json.loads(self.meta.get("counts", "{}"))}

    # ------------------------------------------------------------------ shapes
    def _tables(self, pid: str) -> List[Dict[str, Any]]:
        return [f for f in self.files.get(pid, []) if f["kind"] == "experimental_table"]

    def _data_files(self, pid: str) -> List[Dict[str, Any]]:
        return [f for f in self.files.get(pid, []) if f["kind"] == "data_file"]

    def _summary(self, pid: str) -> Dict[str, Any]:
        i = self.investigations[pid]
        added = self._data_files(pid)
        kinds = {"table"} if self._tables(pid) else set()
        kinds.update(KIND_BY_EXTENSION[e] for e in (extension(f["file_name"]) for f in added) if e in KIND_BY_EXTENSION)
        doi = text(i["doi"])
        return {
            "psi_id": pid,
            "acronym": text(i["acronym"]),
            "title": text(i["title"]) or pid,
            "ground_investigation": bool(i["ground_investigation"]),
            "pillar": i["pillar"],
            "stage": i["stage"],
            "fuel_phase": i["fuel_phase"],
            "hardware_group": i["hardware_group"],
            "hardware_group_label": HARDWARE_LABELS.get(i["hardware_group"], i["hardware_group"]),
            "psi_sub_area": text(i["sub_area"]),
            "summary_plain": text(i["summary_plain"]),
            "data_kinds": [k for k in KIND_ORDER if k in kinds],
            "table_count": len(self._tables(pid)),
            "files_count": len(added),
            "files_bytes": sum(f["size_bytes"] for f in added),
            "listed_bytes": number(i["psi_total_file_size"]),
            "publications_count": len(self.publications.get(pid, [])),
            # The DOI resolves to the record on psi.nasa.gov; without one the repository home is the honest link.
            "psi_url": f"https://doi.org/{doi}" if doi else PSI_HOME,
        }

    def detail(self, psi_id: str, engines: Iterable[Dict[str, Any]] = ()) -> Dict[str, Any]:
        """Everything the investigation page shows. engines: the built engines' module.json."""
        pid = self._pid(psi_id)
        i = self.investigations[pid]
        s = self._summaries[pid]
        by_cat: Dict[str, Dict[str, Any]] = {}
        for f in self._data_files(pid):
            g = by_cat.setdefault(f["category"], {"category": f["category"], "count": 0, "bytes": 0})
            g["count"] += 1
            g["bytes"] += f["size_bytes"]
        return {
            **s,
            "psi_text": {"objective": text(i["objective"]), "approach": text(i["approach"]),
                         "hypothesis": text(i["hypothesis"]), "research_impacts": text(i["research_impacts"])},
            "summary_written_by": text(i["summary_written_by"]),
            "tags": {
                "pillar": {"value": i["pillar"], "source": i["pillar_source"]},
                "fuel_phase": {"value": i["fuel_phase"], "source": i["fuel_phase_source"]},
                "hardware_group": {"value": i["hardware_group"], "source": i["hardware_group_source"]},
                "measurements": {"value": json.loads(i["measurements"]), "source": i["measurements_source"]},
            },
            "cannot_tell": [i["cannot_tell"]] if text(i["cannot_tell"]) else [],
            "conditions": {
                "hardware": text(i["hardware"]), "hardware_link": text(i["hardware_link"]),
                "flight_program": text(i["flight_program"]), "managing_center": text(i["managing_center"]),
                "start_date": text(i["start_date"]), "end_date": text(i["end_date"]),
                "release_date": text(i["release_date"]),
            },
            "licence": {"id": text(i["license_id"]), "name": text(i["license_name"]), "link": text(i["license_link"])},
            "doi": text(i["doi"]),
            "files": {
                "count": s["files_count"], "bytes": s["files_bytes"], "listed_bytes": s["listed_bytes"],
                "by_category": sorted(by_cat.values(), key=lambda g: -g["bytes"]),   # stable: PSI order on ties
                "tables": [{"file_name": f["file_name"], "bytes": f["size_bytes"]} for f in self._tables(pid)],
            },
            "publications": [{"title": text(p["title"]) or "(untitled)", "authors": text(p["authors"]),
                              "doi": text(p["doi"])} for p in self.publications.get(pid, [])],
            "related": [x for x in i["related_glds"].replace(",", " ").replace(";", " ").split()
                        if x.startswith("PSI-") and x[4:].isdigit()],
            "engines": [{"id": m["id"], "title": m["title"], "stage": m["stage"], "status": m["status"]}
                        for m in engines if pid in m.get("psi_ids", [])],
        }

    # ------------------------------------------------------------------ queries
    def list(self, pillar: Optional[str] = None, stage: Optional[str] = None,
             fuel_phase: Optional[str] = None, hardware_group: Optional[str] = None,
             psi_sub_area: Optional[str] = None, has_table: Optional[bool] = None,
             q: Optional[str] = None) -> Dict[str, Any]:
        """{count, items} as the site reads it, plus total, filters and facets for other clients.

        Every filter is optional (the site filters the 24 rows itself). A facet's counts apply
        all the other filters but not its own. A missing value (no fire stage, no sub-area) is
        counted, and filtered, as "none".
        """
        self._need()
        filters = {"pillar": pillar, "stage": stage, "fuel_phase": fuel_phase,
                   "hardware_group": hardware_group, "psi_sub_area": psi_sub_area}
        filters = {k: v.strip().lower() for k, v in filters.items() if v and v.strip()}
        words = (q or "").lower().split()
        rows = list(self._summaries.values())

        def haystack(pid: str) -> str:
            i = self.investigations[pid]
            return " ".join((pid, i["acronym"], i["title"], i["sub_area"], i["summary_plain"],
                             i["objective"], i["measurements"])).lower()

        def keep(r: Dict[str, Any], skip: Optional[str] = None) -> bool:
            if any(k != skip and (r[k] or "none").lower() != v for k, v in filters.items()):
                return False
            if has_table is not None and (r["table_count"] > 0) != has_table:
                return False
            return not words or all(w in haystack(r["psi_id"]) for w in words)

        items = [r for r in rows if keep(r)]
        facets = {}
        for f in FACETS:
            counts: Dict[str, int] = {}
            for r in rows:
                if keep(r, skip=f):
                    counts[r[f] or "none"] = counts.get(r[f] or "none", 0) + 1
            facets[f] = dict(sorted(counts.items()))
        applied: Dict[str, Any] = dict(filters)
        if has_table is not None:
            applied["has_table"] = has_table
        if words:
            applied["q"] = q
        return {"count": len(items), "items": items, "total": len(rows), "filters": applied, "facets": facets}

    def files_of(self, psi_id: str, kind: Optional[str] = None, category: Optional[str] = None,
                 q: Optional[str] = None, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """One page of an investigation's PSI file list (some list thousands), with download links."""
        pid = self._pid(psi_id)
        if kind not in (None, "", "experimental_table", "data_file"):
            raise BadQuery("kind must be experimental_table or data_file")
        if not 1 <= limit <= 500 or offset < 0:
            raise BadQuery("limit must be 1 to 500 and offset 0 or more")
        needle = (q or "").lower()
        rows = [f for f in self.files.get(pid, [])
                if (not kind or f["kind"] == kind)
                and (category is None or f["category"] == category)
                and (not needle or needle in f["file_name"].lower())]
        return {"psi_id": pid, "total": len(rows), "limit": limit, "offset": offset,
                "items": [{"file_name": f["file_name"], "kind": f["kind"], "category": f["category"],
                           "subcategory": f["subcategory"], "bytes": f["size_bytes"],
                           "download_url": download_url(pid, f["file_name"])}
                          for f in rows[offset:offset + limit]]}

    # ------------------------------------------------------------------ compare (DOB-75)
    def compare(self, ids: Iterable[str]) -> Dict[str, Any]:
        """Two to four investigations in aligned rows, every value from the database.

        Each row has one cell per investigation, in the order asked. A cell whose `value` is
        None means the source does not state it: the site prints "not stated". Tested ranges
        come from that investigation's own table rows and are never merged across
        investigations. `same` says whether every column holds the same value.
        """
        self._need()
        pids: List[str] = []
        for raw in _split(ids):
            pid = self._pid(raw)
            if pid not in pids:
                pids.append(pid)
        if not COMPARE_MIN <= len(pids) <= COMPARE_MAX:
            raise BadQuery(f"compare takes {COMPARE_MIN} to {COMPARE_MAX} different investigations, "
                           f"e.g. ids=PSI-69,PSI-68 (got {len(pids)})")
        tests = {pid: [t for t in self.tests if t["psi_id"] == pid and not t["is_note"]] for pid in pids}

        rows: List[Dict[str, Any]] = []

        def add(key: str, label: str, cells: List[Dict[str, Any]], unit: Optional[str] = None) -> None:
            # Same means the whole cell matches; only the citation may differ.
            values = [json.dumps({k: v for k, v in c.items() if k != "source"}, sort_keys=True) for c in cells]
            row: Dict[str, Any] = {"key": key, "label": label, "cells": cells,
                                   "same": all(c["value"] is not None for c in cells) and len(set(values)) == 1}
            if unit:
                row["unit"] = unit
            rows.append(row)

        inv = {pid: self.investigations[pid] for pid in pids}
        summ = {pid: self._summaries[pid] for pid in pids}
        add("pillar", "Fire safety pillar",
            [{"value": inv[p]["pillar"], "source": inv[p]["pillar_source"]} for p in pids])
        add("stage", "Fire stage", [{"value": inv[p]["stage"]} for p in pids])
        add("fuel_phase", "Fuel phase",
            [{"value": inv[p]["fuel_phase"], "source": inv[p]["fuel_phase_source"]} for p in pids])
        add("fuels", "Fuels in the PSI table", [_counted(tests[p], "fuel") for p in pids])
        add("hardware", "Hardware",
            [{"value": text(inv[p]["hardware"]), "group": summ[p]["hardware_group_label"],
              "source": inv[p]["hardware_group_source"]} for p in pids])
        add("flight_program", "Flight program", [{"value": text(inv[p]["flight_program"])} for p in pids])
        add("tests", "Test rows in PSI tables",
            [{"value": len(tests[p]) or None, "tables": [f["file_name"] for f in self._tables(p)]} for p in pids])
        for name, (col, label, unit) in COMPARE_RANGES.items():
            add(name, label, [_tested_range(tests[p], col) for p in pids], unit=unit)
        add("diluents", "Inert gas in the atmosphere", [_counted(tests[p], "diluent") for p in pids])
        add("outcomes", "Outcomes recorded", [_counted(tests[p], "outcome") for p in pids])
        add("measurements", "Measurements",
            [{"value": json.loads(inv[p]["measurements"]) or None, "source": inv[p]["measurements_source"]}
             for p in pids])
        add("downloadable", "Downloadable from PSI",
            [{"value": summ[p]["data_kinds"] or None, "tables": summ[p]["table_count"],
              "files": summ[p]["files_count"], "listed_bytes": summ[p]["listed_bytes"]} for p in pids])
        add("publications", "Publications listed",
            [{"value": summ[p]["publications_count"] or None} for p in pids])
        add("cannot_tell", "What it cannot tell", [{"value": text(inv[p]["cannot_tell"])} for p in pids])

        return {
            "ids": pids,
            "investigations": [{k: summ[p][k] for k in ("psi_id", "acronym", "title", "ground_investigation",
                                                         "psi_url")} for p in pids],
            "rows": rows,
            "not_stated": "not stated",
            "note": "Each range comes from that investigation's own PSI table rows; ranges are never merged. "
                    "A range is what was tested, not what the hardware could do.",
        }

    # ------------------------------------------------------------------ tests (DOB-72)
    def query_tests(self, q: "TestQuery",
                    evidence_by_test: Optional[Dict[str, List[Dict[str, Any]]]] = None) -> Dict[str, Any]:
        """The tests matching q: one page, facet counts, and what each range filter dropped.

        One function for the explorer, the ranking and the assistant. The order is fixed, so
        pages never overlap: PSI number, file, row, with the inverse flames (flag
        `oxygen_is_burner_stream`) after every other row. A range filter drops the rows whose
        value the source does not state; `excluded` says how many, per range.
        """
        self._need()
        q.normalize()
        ids = set(q.test_id)                 # picks tests by ID; like the web stub, not applied to facets
        matched = [t for t in self.tests if (not ids or t["test_id"] in ids) and q.matches(t)]
        # Inverse flames last (DOB-125): PSI-10's inverse-flame table sorts first, so the first
        # pages would hold only rows whose oxygen is left out. Stable: each group keeps its order.
        matched.sort(key=lambda t: LAST_FLAG in t["flags"])

        facets: Dict[str, List[Dict[str, Any]]] = {}
        for name in TEST_FACETS:
            counts: Dict[str, int] = {}
            for t in self.tests:
                if q.matches(t, skip=name):
                    counts[t[name] or "none"] = counts.get(t[name] or "none", 0) + 1
            rows = []
            for value, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
                row: Dict[str, Any] = {"value": value, "count": n}
                if name == "psi_id":
                    row["label"] = text(self.investigations.get(value, {}).get("acronym")) or value
                rows.append(row)
            facets[name] = rows

        excluded = {name: (sum(1 for t in self.tests if t[col] is None and q.matches(t, skip=name))
                           if q.range_active(name) else 0)
                    for name, col in RANGES.items()}
        out: Dict[str, Any] = {
            "total": len(matched), "limit": q.limit, "offset": q.offset,
            "items": [self._test_row(t, q.include, evidence_by_test) for t in matched[q.offset:q.offset + q.limit]],
            "facets": facets, "excluded": excluded,
        }
        if "points" in q.include:
            pts = [[t["test_id"], t["psi_id"], t["o2_mole_fraction"], t["pressure_kpa"]]
                   for t in matched if t["o2_mole_fraction"] is not None and t["pressure_kpa"] is not None]
            out["points"] = {"items": pts, "not_plotted": len(matched) - len(pts)}
        return out

    def test(self, test_id: str, evidence_by_test: Optional[Dict[str, List[Dict[str, Any]]]] = None) -> Dict[str, Any]:
        """One test with its raw row and its evidence (the evidence panel's source link)."""
        self._need()
        t = self._tests_by_id.get(test_id.strip())
        if t is None:
            raise UnknownInvestigation(f"No test '{test_id}'. Test IDs look like PSI-69/114; "
                                       f"GET /api/v1/catalog/tests lists them.")
        return self._test_row(t, ["raw", "evidence"], evidence_by_test)

    def _test_row(self, t: Dict[str, Any], include: Iterable[str],
                  evidence_by_test: Optional[Dict[str, List[Dict[str, Any]]]]) -> Dict[str, Any]:
        row = {
            "test_id": t["test_id"], "psi_id": t["psi_id"],
            "acronym": text(self.investigations.get(t["psi_id"], {}).get("acronym")),
            "table_name": t["table_name"], "test_number": t["test_number"],
            "fuel": t["fuel"], "fuel_phase": t["fuel_phase"],
            "o2_mole_fraction": t["o2_mole_fraction"], "pressure_kpa": t["pressure_kpa"],
            "flow_cm_s": t["flow_cm_s"], "diluent": t["diluent"], "outcome": t["outcome"],
            "comparable": t["comparable"], "original": t["original"], "flags": t["flags"],
            "source_file": t["source_file"], "source_row": t["source_row"],
        }
        if "raw" in include:
            row["raw"] = t["raw"]
        if "evidence" in include:
            row["evidence"] = (evidence_by_test or {}).get(t["test_id"], [])
        return row


COMPARE_MIN, COMPARE_MAX = 2, 4
COMPARE_RANGES = {
    "oxygen": ("o2_mole_fraction", "Oxygen tested (mole fraction)", "mole fraction"),
    "pressure": ("pressure_kpa", "Pressure tested", "kPa"),
    "flow": ("flow_cm_s", "Airflow tested", "cm/s"),
}
# Row flags that keep a stated value out of the tested range: the value is in the file but known wrong.
RANGE_EXCLUDED = {"pressure_kpa": {"suspect_pressure"}}
# Row flags that change what a stated value means: reported next to the range, never hidden.
RANGE_CAVEATS = {"o2_mole_fraction": {"oxygen_is_burner_stream", "o2_mole_fraction:approximate"}}


def _counted(tests: List[Dict[str, Any]], column: str) -> Dict[str, Any]:
    """{value: [{name, count}, ...] by count, or None when no row states it}."""
    counts: Dict[str, int] = {}
    for t in tests:
        if t[column]:
            counts[t[column]] = counts.get(t[column], 0) + 1
    items = [{"name": k, "count": n} for k, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]
    return {"value": items or None, "rows_not_stated": sum(1 for t in tests if not t[column])}


def _tested_range(tests: List[Dict[str, Any]], column: str) -> Dict[str, Any]:
    """The min and max one investigation's rows state for a column, with what was left out and why.

    value None: no row states a single number. Rows that give a range or a list (a test plan,
    not a test) are counted, and their text kept as written, but never turned into numbers.
    """
    excluded_flags = RANGE_EXCLUDED.get(column, set())
    values, excluded, as_written = [], [], []
    caveats: Dict[str, int] = {}
    for t in tests:
        flags = set(t["flags"])
        if t[column] is not None and flags & excluded_flags:
            excluded.append(t["test_id"])
        elif t[column] is not None:
            values.append(t[column])
            for f in sorted(flags & RANGE_CAVEATS.get(column, set())):
                caveats[f] = caveats.get(f, 0) + 1
        elif f"{column}:range_or_list" in flags:
            written = (t["original"].get(column) or {}).get("text")
            if written and written not in as_written:
                as_written.append(written)
    cell: Dict[str, Any] = {
        "value": {"min": round(min(values), 6), "max": round(max(values), 6)} if values else None,
        "rows_stated": len(values),
        "rows_not_stated": len(tests) - len(values) - len(excluded),
    }
    if excluded:
        cell["excluded"] = {"test_ids": excluded, "reason": "value flagged suspect in the source; kept, not used"}
    if caveats:
        cell["caveats"] = caveats
    if as_written:
        cell["as_written"] = as_written          # e.g. FLEX-2's planned "0.17; 0.21;0.25; 0.3"
        cell["as_written_note"] = "The PSI table gives a range or list here, not one value per test."
    return cell


TEST_LIMIT_MAX = 500
# Rows with this flag come after all others in /catalog/tests: their oxygen column is empty by design.
LAST_FLAG = "oxygen_is_burner_stream"
TEST_FACETS = ("psi_id", "fuel", "fuel_phase", "outcome", "diluent")
RANGES = {"o2": "o2_mole_fraction", "pressure": "pressure_kpa", "flow": "flow_cm_s"}
INCLUDES = ("raw", "evidence", "points")


def _split(values: Iterable[str]) -> List[str]:
    """['a,b', 'c'] -> ['a', 'b', 'c']: a filter may repeat or hold a comma list."""
    return [v.strip() for value in values for v in str(value).split(",") if v.strip()]


@dataclass
class TestQuery:
    """GET /api/v1/catalog/tests parameters. A list means "any of"; ranges include their ends.

    Units: o2 as a mole fraction (0.21 for 21%), pressure in kPa, flow in cm/s. `notes=True`
    also returns the note lines some tables carry (flagged `note`); they are left out by default.
    """
    psi_id: List[str] = field(default_factory=list)
    fuel: List[str] = field(default_factory=list)
    fuel_phase: List[str] = field(default_factory=list)
    outcome: List[str] = field(default_factory=list)
    diluent: List[str] = field(default_factory=list)
    test_id: List[str] = field(default_factory=list)   # repeatable, e.g. PSI-69/114; never split on commas
    o2_min: Optional[float] = None
    o2_max: Optional[float] = None
    pressure_min: Optional[float] = None
    pressure_max: Optional[float] = None
    flow_min: Optional[float] = None
    flow_max: Optional[float] = None
    comparable: Optional[bool] = None
    notes: bool = False
    limit: int = 50
    offset: int = 0
    include: List[str] = field(default_factory=list)

    def normalize(self) -> None:
        self.psi_id = [normalize_psi_id(x) for x in _split(self.psi_id)]
        self.test_id = [x.strip() for x in self.test_id if x and x.strip()]
        for name in ("fuel", "fuel_phase", "outcome", "diluent", "include"):
            setattr(self, name, _split(getattr(self, name)))
        if not 1 <= self.limit <= TEST_LIMIT_MAX:
            raise BadQuery(f"limit must be 1 to {TEST_LIMIT_MAX}")
        if self.offset < 0:
            raise BadQuery("offset must be 0 or more")
        bad = [x for x in self.include if x not in INCLUDES]
        if bad:
            raise BadQuery(f"include takes raw, evidence or points, not {', '.join(bad)}")
        for name in RANGES:
            lo, hi = getattr(self, f"{name}_min"), getattr(self, f"{name}_max")
            if lo is not None and hi is not None and lo > hi:
                raise BadQuery(f"{name}_min is larger than {name}_max")
        for v in (self.o2_min, self.o2_max):
            if v is not None and not 0 <= v <= 1:
                raise BadQuery("o2_min and o2_max are mole fractions from 0 to 1 (21% oxygen is 0.21)")

    def range_active(self, name: str) -> bool:
        return getattr(self, f"{name}_min") is not None or getattr(self, f"{name}_max") is not None

    def matches(self, t: Dict[str, Any], skip: Optional[str] = None) -> bool:
        """Does test row t pass every filter except the one named skip (for facet counts)?"""
        if t["is_note"] and not self.notes:
            return False
        for name in TEST_FACETS:
            wanted = getattr(self, name)
            if name != skip and wanted and (t[name] or "none").lower() not in {w.lower() for w in wanted}:
                return False
        if self.comparable is not None and t["comparable"] != self.comparable:
            return False
        for name, col in RANGES.items():
            if name == skip or not self.range_active(name):
                continue
            lo, hi, v = getattr(self, f"{name}_min"), getattr(self, f"{name}_max"), t[col]
            if v is None or (lo is not None and v < lo) or (hi is not None and v > hi):
                return False
        return True
