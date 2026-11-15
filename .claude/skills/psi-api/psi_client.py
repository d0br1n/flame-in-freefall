#!/usr/bin/env python3
"""Client for NASA's PSI repository API (psi.nasa.gov). Standard library only.

Lists investigations, reads their metadata and downloads their files into the
team's data folder. It never fetches what is already there:

    data/raw/json/_search_all.json       search result (all investigations)
    data/raw/json/PSI-<n>.json           detail record of one investigation
    data/raw/tables/<file_name>          "Experimental table" files
    data/raw/files/PSI-<n>/<file_name>   every other file

Set PSI_DATA_DIR to use a folder other than data/raw.
Usage and rules: .claude/skills/psi-api/SKILL.md.

Written with SI assistance (Claude, Anthropic); see submission/SI_USAGE.md.
Checked on 2026-11-14 against the saved PSI records and a local stand-in for
the API. It was not run against the live API from the session that wrote it.
"""
import argparse
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = os.environ.get("PSI_API_BASE", "https://psi.nasa.gov/geode-py/ws").rstrip("/")
DATA = Path(os.environ.get("PSI_DATA_DIR") or Path(__file__).resolve().parents[3] / "data" / "raw")
PAUSE = float(os.environ.get("PSI_PAUSE", "1"))  # seconds between requests: be gentle with the API
SEARCH = "/repo/search?source=psi&type=investigation&size=200&from=0"

_last_request = 0.0


def _open(url, timeout=120):
    """One request at a time, with a pause since the previous one."""
    global _last_request
    wait = PAUSE - (time.monotonic() - _last_request)
    if _last_request and wait > 0:
        time.sleep(wait)
    try:
        return urllib.request.urlopen(url, timeout=timeout)
    finally:
        _last_request = time.monotonic()


def _cached_json(path, url, refresh=False):
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8"))
    with _open(url) as response:
        raw = response.read()
    data = json.loads(raw)  # fail here, before writing, if the answer is not JSON
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_name(path.name + ".part")
    part.write_bytes(raw)
    part.replace(path)
    return data


def psi_id(value):
    """'69', 'psi-69' and 'PSI-69' all become 'PSI-69'."""
    value = str(value).strip().upper()
    return value if value.startswith("PSI-") else "PSI-" + value


def list_investigations(area=None, refresh=False):
    """Search records (Title-Case keys such as 'Accession'), sorted by PSI number."""
    data = _cached_json(DATA / "json" / "_search_all.json", BASE + SEARCH, refresh)
    rows = [hit["_source"] for hit in data["hits"]["hits"]]
    if area:
        def in_area(row):
            value = row.get("Research Area") or ""
            values = value if isinstance(value, list) else [value]
            return area.lower() in [str(v).lower() for v in values]
        rows = [row for row in rows if in_area(row)]
    return sorted(rows, key=lambda row: int(row["Accession"].split("-")[1]))


def get_investigation(pid, refresh=False):
    """Detail record of one investigation (camelCase keys, file lists)."""
    pid = psi_id(pid)
    return _cached_json(DATA / "json" / (pid + ".json"), BASE + "/repo/investigations/" + pid, refresh)


def list_files(pid, refresh=False):
    """Current files of an investigation: experimental tables first, then `added`.

    `removed` (retracted files) is never read. A table that PSI lists in both
    places is returned once, as a table.
    """
    record = get_investigation(pid, refresh)
    files, seen = [], set()
    for key in ("experimentalTable", "added"):
        for entry in record.get(key) or []:
            name = entry["file_name"]
            if name in seen:
                continue
            seen.add(name)
            files.append({
                "file_name": name,
                "file_size": int(float(entry.get("file_size") or 0)),
                "subcategory": entry.get("subcategory") or "",
                "table": key == "experimentalTable",
            })
    return files


def local_path(pid, file_entry):
    if file_entry["table"]:
        return DATA / "tables" / file_entry["file_name"]
    return DATA / "files" / psi_id(pid) / file_entry["file_name"]


def download(pid, file_name, refresh=False):
    """Fetch one file. Returns (path, True if it was downloaded now, False if already there).

    A fresh signed link is requested for every file (they expire after an hour
    and must not be stored). The file is written to *.part and renamed at the end.
    """
    pid = psi_id(pid)
    entry = next((f for f in list_files(pid) if f["file_name"] == file_name), None)
    if entry is None:
        raise KeyError("%s has no current file named %r" % (pid, file_name))
    target = local_path(pid, entry)
    size = entry["file_size"]
    if target.exists() and not refresh and (not size or target.stat().st_size == size):
        return target, False
    url = "%s/studies/%s/download?file=%s" % (BASE, pid, urllib.parse.quote(file_name, safe=""))
    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_name(target.name + ".part")
    with _open(url, timeout=600) as response, open(part, "wb") as out:
        shutil.copyfileobj(response, out, 1 << 20)
    got = part.stat().st_size
    if size and got != size:
        part.unlink()
        raise IOError("%s: got %d bytes, PSI reports %d" % (file_name, got, size))
    part.replace(target)
    return target, True


def pull(pid, contains=None, ext=None, exclude=None, cap_mb=100.0):
    """Download the matching files of one investigation, smallest first, up to cap_mb.

    contains: every text must be in the name. ext: any of these endings.
    exclude: none of these texts. Files already on disk count towards the cap.
    Returns (paths, failures).
    """
    pid = psi_id(pid)
    contains = [c.lower() for c in contains or []]
    ext = tuple(e.lower() for e in ext or [])
    exclude = [x.lower() for x in exclude or []]

    def keep(name):
        low = name.lower()
        return (all(c in low for c in contains)
                and (not ext or low.endswith(ext))
                and not any(x in low for x in exclude))

    chosen = sorted((f for f in list_files(pid) if keep(f["file_name"])), key=lambda f: f["file_size"])
    return _fetch_all(pid, chosen, cap_mb)


def _fetch_all(pid, entries, cap_mb=None):
    paths, failures, used = [], [], 0
    for index, entry in enumerate(entries):
        if cap_mb is not None and used + entry["file_size"] > cap_mb * 1e6:
            print("cap of %g MB reached: %d file(s) left out" % (cap_mb, len(entries) - index), file=sys.stderr)
            break
        used += entry["file_size"]
        try:
            path, fresh = download(pid, entry["file_name"])
        except (urllib.error.URLError, IOError) as error:
            failures.append(entry["file_name"])
            print("FAILED  %s  (%s)" % (entry["file_name"], error), file=sys.stderr)
            continue
        paths.append(path)
        print("%s  %s" % ("fetched" if fresh else "have   ", path))
    return paths, failures


def _split(text):
    return [part.strip() for part in text.split(",") if part.strip()] if text else []


def main(argv=None):
    parser = argparse.ArgumentParser(description="NASA PSI repository client (data goes to %s)" % DATA)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("list", help="list investigations")
    p.add_argument("--area", help='research area, e.g. "Combustion Science"')
    p.add_argument("--refresh", action="store_true", help="ask the API again instead of using the saved search")

    p = sub.add_parser("files", help="current files of one investigation, with sizes")
    p.add_argument("id")
    p.add_argument("--refresh", action="store_true")

    p = sub.add_parser("get", help="download one file by its exact name")
    p.add_argument("id")
    p.add_argument("file_name")

    p = sub.add_parser("tables", help="download every experimental table of a research area")
    p.add_argument("--area", default="Combustion Science")

    p = sub.add_parser("pull", help="download the matching files of one investigation, smallest first")
    p.add_argument("id")
    p.add_argument("--contains", help="comma-separated texts that must all be in the file name")
    p.add_argument("--ext", help="comma-separated endings, e.g. .csv,.xlsx")
    p.add_argument("--exclude", help="comma-separated texts that must not be in the file name")
    p.add_argument("--cap-mb", type=float, default=100.0, help="stop before the total passes this size (default 100)")

    args = parser.parse_args(argv)
    failures = []

    if args.command == "list":
        for row in list_investigations(args.area, args.refresh):
            print("\t".join(str(row.get(key) or "") for key in ("Accession", "Acronym", "SubResearch Area", "Title")))
    elif args.command == "files":
        files = list_files(args.id, args.refresh)
        for f in files:
            print("%12d\t%s\t%s\t%s" % (f["file_size"], "table" if f["table"] else "file", f["subcategory"], f["file_name"]))
        print("%d files, %.1f MB" % (len(files), sum(f["file_size"] for f in files) / 1e6), file=sys.stderr)
    elif args.command == "get":
        entry = next((f for f in list_files(args.id) if f["file_name"] == args.file_name), None)
        if entry is None:
            parser.exit(2, "%s has no current file named %r (run `files` to see the names)\n" % (psi_id(args.id), args.file_name))
        failures = _fetch_all(psi_id(args.id), [entry])[1]
    elif args.command == "tables":
        for row in list_investigations(args.area):
            pid = row["Accession"]
            failures += _fetch_all(pid, [f for f in list_files(pid) if f["table"]])[1]
    elif args.command == "pull":
        failures = pull(args.id, _split(args.contains), _split(args.ext), _split(args.exclude), args.cap_mb)[1]
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
