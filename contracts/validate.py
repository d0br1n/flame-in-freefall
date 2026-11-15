#!/usr/bin/env python3
"""Check that engine folders under data/modules/ follow the hand-over contract.

    python3 contracts/validate.py                      check every folder in data/modules/
    python3 contracts/validate.py data/modules/_mock   check only the folders given
    python3 contracts/validate.py --recount <table.csv> --column "FLEX Test #" --psi PSI-69
                                                       count test numbers in a raw PSI table

Every engine folder holds module.json, evidence.json and findings.json in the shapes fixed by
the *.schema.json files next to this script. On top of the schemas this checks what one file
cannot say about another: record ids are unique, no two evidence records share the same test,
segment and quantity, every test ID starts with its source's PSI ID, every PSI ID is declared in
module.json, every listed file exists, and findings point at evidence that exists.

Errors read "<folder>/<file> : <record id> : <field> : <message>". Exit code 1 on any error.
The backend (apps/api/) imports validate_folder() so it never defines the shapes a second time.

Standard library only, Python 3.9 or newer: engine teams run it with nothing to install. The
schemas are JSON Schema (draft 2020-12) restricted to the keywords in SUPPORTED below; a schema
that uses any other keyword is refused, so nothing is ever silently left unchecked.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

CONTRACTS = Path(__file__).resolve().parent
REPO = CONTRACTS.parent
MODULES = REPO / "data" / "modules"
CONTRACT_FILES = ("module.json", "evidence.json", "findings.json")
SCHEMA_FOR = {
    "module.json": "module.schema.json",
    "evidence.json": "evidence.schema.json",
    "findings.json": "findings.schema.json",
}


# ------------------------------------------------------------------ schemas
def load_schema(name: str) -> Dict[str, Any]:
    """Return one schema from contracts/, for example load_schema("evidence.schema.json")."""
    return json.loads((CONTRACTS / name).read_text(encoding="utf-8"))


SUPPORTED = {
    # validation keywords this checker implements
    "$ref", "type", "enum", "const", "required", "properties", "additionalProperties",
    "items", "minItems", "maxItems", "uniqueItems", "minLength", "pattern", "minimum",
    "if", "then", "else", "not",
    # annotations, no effect on validity
    "$schema", "$id", "$defs", "title", "description",
}
_TYPES = {
    "object": lambda v: isinstance(v, dict),
    "array": lambda v: isinstance(v, list),
    "string": lambda v: isinstance(v, str),
    "boolean": lambda v: isinstance(v, bool),
    "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "null": lambda v: v is None,
}
SchemaError = Tuple[List[Any], str]   # (path inside the document, message)


@lru_cache(maxsize=None)
def _schemas() -> Dict[str, Dict[str, Any]]:
    """Every *.schema.json in contracts/, keyed by its $id."""
    docs = {}
    for path in sorted(CONTRACTS.glob("*.schema.json")):
        schema = json.loads(path.read_text(encoding="utf-8"))
        docs[schema["$id"]] = schema
    return docs


def unsupported_keywords() -> List[str]:
    """Keywords used in the schemas that this checker does not implement (must stay empty)."""
    found = []

    def walk(node: Any, where: str) -> None:
        if isinstance(node, dict):
            for key, sub in node.items():
                if key not in SUPPORTED:
                    found.append(f"{where}: {key}")
                if key in ("properties", "$defs"):
                    for name, child in sub.items():
                        walk(child, f"{where}/{key}/{name}")
                elif key in ("enum", "const", "required", "title", "description", "$schema", "$id"):
                    continue
                else:
                    walk(sub, f"{where}/{key}")

    for doc_id, doc in _schemas().items():
        walk(doc, doc_id)
    return found


def _resolve(ref: str, base: str) -> Tuple[Dict[str, Any], str]:
    doc_id, _, pointer = ref.partition("#")
    doc_id = doc_id or base
    node = _schemas()[doc_id]
    for part in [p for p in pointer.split("/") if p]:
        node = node[part]
    return node, doc_id


def _valid(schema: Dict[str, Any], data: Any, base: str) -> bool:
    out: List[SchemaError] = []
    _check(schema, data, [], base, out)
    return not out


def _check(schema: Dict[str, Any], data: Any, path: List[Any], base: str, out: List[SchemaError]) -> None:
    if "$ref" in schema:
        target, target_base = _resolve(schema["$ref"], base)
        _check(target, data, path, target_base, out)

    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_TYPES[t](data) for t in types):
            out.append((path, f"{data!r} is not of type {', '.join(repr(t) for t in types)}"))
            return
    if "enum" in schema and data not in schema["enum"]:
        out.append((path, f"{data!r} is not one of {schema['enum']!r}"))
    if "const" in schema and data != schema["const"]:
        out.append((path, f"{schema['const']!r} was expected"))

    if isinstance(data, str):
        if "minLength" in schema and len(data) < schema["minLength"]:
            out.append((path, f"{data!r} is too short"))
        if "pattern" in schema and not re.search(schema["pattern"], data):
            out.append((path, f"{data!r} does not match {schema['pattern']!r}"))
    if _TYPES["number"](data) and "minimum" in schema and data < schema["minimum"]:
        out.append((path, f"{data!r} is less than the minimum of {schema['minimum']!r}"))

    if isinstance(data, list):
        if "minItems" in schema and len(data) < schema["minItems"]:
            out.append((path, f"{data!r} should have at least {schema['minItems']} item(s)"))
        if "maxItems" in schema and len(data) > schema["maxItems"]:
            out.append((path, f"{data!r} should have at most {schema['maxItems']} item(s)"))
        if schema.get("uniqueItems"):
            seen = [json.dumps(v, sort_keys=True) for v in data]
            if len(seen) != len(set(seen)):
                out.append((path, f"{data!r} has non-unique elements"))
        if "items" in schema:
            for i, item in enumerate(data):
                _check(schema["items"], item, path + [i], base, out)

    if isinstance(data, dict):
        for name in schema.get("required", []):
            if name not in data:
                out.append((path + [name], f"{name!r} is a required property"))
        props = schema.get("properties", {})
        for name, sub in props.items():
            if name in data:
                _check(sub, data[name], path + [name], base, out)
        if schema.get("additionalProperties") is False:
            extra = [k for k in data if k not in props]
            if extra:
                names = ", ".join(repr(k) for k in extra)
                out.append((path, f"Additional properties are not allowed ({names} {'was' if len(extra) == 1 else 'were'} unexpected)"))

    if "if" in schema:
        branch = "then" if _valid(schema["if"], data, base) else "else"
        if branch in schema:
            _check(schema[branch], data, path, base, out)
    if "not" in schema and _valid(schema["not"], data, base):
        banned = schema["not"].get("required")
        if banned:
            for name in banned:
                out.append((path + [name], f"{name!r} is not allowed here"))
        else:
            out.append((path, f"{data!r} must not match {schema['not']!r}"))


def check_schema(schema_name: str, data: Any) -> List[SchemaError]:
    """Validate data against one contract schema. Returns (path, message) pairs, empty when valid."""
    bad = unsupported_keywords()
    if bad:
        raise ValueError(f"the schemas use keywords this checker does not implement: {bad}")
    doc = _schemas()[schema_name]
    out: List[SchemaError] = []
    _check(doc, data, [], doc["$id"], out)
    return sorted(out, key=lambda e: [str(p) for p in e[0]])


# ------------------------------------------------------------------ result
@dataclass
class FolderResult:
    folder: Path
    module: Optional[Dict[str, Any]] = None
    evidence: List[Dict[str, Any]] = field(default_factory=list)
    findings: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    @property
    def id(self) -> str:
        return self.folder.name

    def err(self, file: str, record: str, fld: str, msg: str) -> None:
        self.errors.append(f"{self.folder.name}/{file} : {record} : {fld} : {msg}")


def _record_label(data: Any, index: Any) -> str:
    if isinstance(data, list) and isinstance(index, int) and index < len(data):
        rec = data[index]
        if isinstance(rec, dict) and isinstance(rec.get("id"), str):
            return rec["id"]
        return f"#{index}"
    return "-"


def _schema_errors(res: FolderResult, file: str, data: Any) -> bool:
    """Add one line per schema error. Returns True when the file matched its schema."""
    errors = check_schema(SCHEMA_FOR[file], data)
    for path, message in errors:
        if file == "module.json":
            record, rest = "module", path
        else:
            record, rest = (_record_label(data, path[0]), path[1:]) if path else ("-", [])
        fld = ".".join(str(p) for p in rest)
        res.err(file, record, fld or "-", message)
    return not errors


def _read_json(res: FolderResult, file: str) -> Any:
    path = res.folder / file
    if not path.is_file():
        res.err(file, "-", "-", "file is missing")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        res.err(file, "-", "-", f"not valid JSON: {exc}")
        return None


# ------------------------------------------------------------------ checks
def validate_folder(folder: Path | str) -> FolderResult:
    """Validate one engine folder. Never raises on bad content; problems go to .errors."""
    res = FolderResult(Path(folder))
    if not res.folder.is_dir():
        res.err("-", "-", "-", "folder does not exist")
        return res

    data = {f: _read_json(res, f) for f in CONTRACT_FILES}
    good = {f: data[f] is not None and _schema_errors(res, f, data[f]) for f in CONTRACT_FILES}

    module = data["module.json"] if isinstance(data["module.json"], dict) else {}
    evidence = data["evidence.json"] if isinstance(data["evidence.json"], list) else []
    findings = data["findings.json"] if isinstance(data["findings.json"], list) else []
    evidence = [r for r in evidence if isinstance(r, dict)]
    findings = [r for r in findings if isinstance(r, dict)]

    # module.json against the folder and the disk
    if module:
        if module.get("id") != res.id:
            res.err("module.json", "module", "id", f"is {module.get('id')!r} but the folder is {res.id!r}")
        for entry in module.get("files") or []:
            name = entry.get("name") if isinstance(entry, dict) else None
            if not isinstance(name, str):
                continue
            if name in CONTRACT_FILES:
                res.err("module.json", "module", "files", f"{name} is a contract file, do not list it")
            elif not (res.folder / name).is_file():
                res.err("module.json", "module", "files", f"lists {name} but the file is not in the folder")
    declared_psi = set(module.get("psi_ids") or [])
    listed_files = {e.get("name") for e in module.get("files") or [] if isinstance(e, dict)}

    for file, records in (("evidence.json", evidence), ("findings.json", findings)):
        for rid, count in Counter(r.get("id") for r in records).items():
            if count > 1:
                res.err(file, str(rid), "id", f"used by {count} records, ids must be unique")
        for rec in records:
            rid = str(rec.get("id", "-"))
            if rec.get("module") not in (None, res.id):
                res.err(file, rid, "module", f"is {rec.get('module')!r} but the folder is {res.id!r}")
            source = rec.get("source") if isinstance(rec.get("source"), dict) else {}
            psi = source.get("psi_id")
            if module and isinstance(psi, str) and psi not in declared_psi:
                res.err(file, rid, "source.psi_id", f"{psi} is not in module.json psi_ids")
            test_id = rec.get("test_id")
            if isinstance(test_id, str) and isinstance(psi, str) and not test_id.startswith(psi + "/"):
                res.err(file, rid, "test_id", f"{test_id} does not start with its source {psi}/")

    # one value per test, segment and quantity
    seen: Dict[tuple, List[str]] = defaultdict(list)
    for rec in evidence:
        seen[(rec.get("test_id"), rec.get("segment"), rec.get("quantity"))].append(str(rec.get("id", "-")))
    for (test_id, segment, quantity), ids in seen.items():
        if len(ids) > 1:
            where = f"test {test_id}" + (f", segment {segment}" if segment else "") + f", quantity {quantity}"
            res.err("evidence.json", ", ".join(ids), "test_id+segment+quantity",
                    f"{len(ids)} records for the same {where}: keep one, or tell them apart with segment")

    # assets and findings point at things that exist
    for rec in evidence:
        for asset in rec.get("assets") or []:
            if asset not in listed_files:
                res.err("evidence.json", str(rec.get("id", "-")), "assets", f"{asset} is not listed in module.json files")
    evidence_ids = {r.get("id") for r in evidence}
    for rec in findings:
        for eid in rec.get("evidence_ids") or []:
            if eid not in evidence_ids:
                res.err("findings.json", str(rec.get("id", "-")), "evidence_ids", f"{eid} is not an id in evidence.json")

    if all(good.values()):
        res.module, res.evidence, res.findings = module, evidence, findings
    return res


def engine_folders(root: Path = MODULES) -> List[Path]:
    """Every engine folder under data/modules/, hidden folders left out."""
    if not root.is_dir():
        return []
    return sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith("."))


# ------------------------------------------------------------------ recount
def recount(table: Path, column: str, psi: str) -> int:
    """Count test numbers in a raw PSI table and print the test IDs the contract expects."""
    raw = table.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")   # some PSI tables (FLEX) are saved in Windows-1252
    reader = csv.DictReader(io.StringIO(text, newline=""))
    if column not in (reader.fieldnames or []):
        print(f"recount: column {column!r} not in {table.name}. Columns: {reader.fieldnames}", file=sys.stderr)
        return 1
    values = [(row_no, (row[column] or "").strip()) for row_no, row in enumerate(reader, start=1)]
    rows: Dict[str, List[int]] = defaultdict(list)
    for row_no, value in values:
        rows[value].append(row_no)
    print(f"{table.name}: {len(values)} rows, {len(rows)} distinct values in {column!r}")
    if "" in rows:
        print(f"  empty test number on rows {rows['']}")
    for value, row_nos in rows.items():
        if value and len(row_nos) > 1:
            ids = ", ".join(f"{psi}/{value}#{r}" for r in row_nos)
            print(f"  {psi}/{value} appears {len(row_nos)} times (data rows {row_nos}): use {ids}")
    return 0


# ------------------------------------------------------------------ CLI
def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("folders", nargs="*", type=Path, help="engine folders (default: every folder in data/modules/)")
    ap.add_argument("--recount", type=Path, metavar="CSV", help="count test numbers in a raw PSI table")
    ap.add_argument("--column", help="test number column, for --recount")
    ap.add_argument("--psi", help="PSI ID of the table, for --recount")
    args = ap.parse_args(argv)

    if args.recount:
        if not (args.column and args.psi):
            ap.error("--recount needs --column and --psi")
        return recount(args.recount, args.column, args.psi)

    folders = args.folders or engine_folders()
    if not folders:
        print(f"validate: no engine folders in {MODULES}", file=sys.stderr)
        return 1
    failed = 0
    for folder in folders:
        res = validate_folder(folder)
        if res.ok:
            print(f"OK   {res.id}: {len(res.evidence)} evidence records, {len(res.findings)} findings")
        else:
            failed += 1
            print(f"FAIL {res.id}: {len(res.errors)} problem(s)")
            for line in res.errors:
                print(f"     {line}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
