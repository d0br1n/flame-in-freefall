# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Fetch the PSI-25 videos listed in manifest.csv and keep downloads.csv in step with the disk.

One file at a time, a pause between files, three tries with a growing wait, stop when less
than 6 GB of disk is free, skip a file already on disk with the manifest size, ffprobe check
after each file. The download goes through .claude/skills/psi-api/psi_client.py.
Stdlib only. The raw videos are not in git (data/raw is ignored).

Run: python -m pipeline.video_to_data.fetch [--dry-run] [--only main|all] [--register-only]
"""
import argparse
import csv
import datetime
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "manifest.csv"
DOWNLOADS = HERE / "downloads.csv"
DEST = ROOT / "data" / "raw" / "files" / "PSI-25"
CLIENT = ROOT / ".claude" / "skills" / "psi-api" / "psi_client.py"

PSI_ID = "PSI-25"
COLUMNS = ["file_name", "bytes", "psi_id", "subcategory", "kind", "local_path", "date_fetched"]
INVESTIGATOR_ORDER = {"T'ien": 0, "Ferkul": 1, "Olson": 2, "Fernandez-Pello": 3, "Miller": 4,
                      "Bhattacharjee": 5}
MIN_FREE_BYTES = 6e9
PAUSE_S = 1.0
RETRY_WAIT_S = 20


def read_csv(path):
    with Path(path).open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def is_plain_main(row):
    return row["view"] == "main" and row["is_still_sequence"] == "false"


def _key(row):
    return (0 if is_plain_main(row) else 1, INVESTIGATOR_ORDER.get(row["investigator"], 9),
            float(row["bytes"]))


def on_disk(row, dest_dir):
    """True when the file is on disk with exactly the size the manifest gives."""
    path = Path(dest_dir) / row["file_name"]
    return path.is_file() and path.stat().st_size == int(float(row["bytes"]))


def todo(manifest_rows, dest_dir):
    """Rows still to fetch: plain main-view videos first, then investigator order, then size."""
    return [r for r in sorted(manifest_rows, key=_key) if not on_disk(r, dest_dir)]


def downloads_rows(manifest_rows, dest_dir, today, previous_rows):
    """One row per manifest video that is on disk with the manifest size, sorted by file name."""
    old = {r["file_name"]: r.get("date_fetched", "") for r in previous_rows}
    out = []
    for r in manifest_rows:
        if not on_disk(r, dest_dir):
            continue
        name = r["file_name"]
        out.append({
            "file_name": name, "bytes": str(int(float(r["bytes"]))), "psi_id": PSI_ID,
            "subcategory": r["subcategory"], "kind": "video",
            "local_path": "data/raw/files/%s/%s" % (PSI_ID, name),
            "date_fetched": old.get(name) or today,
        })
    return sorted(out, key=lambda x: x["file_name"])


def register(manifest_rows, dest_dir, out_path, today):
    """Rewrite downloads.csv: manifest videos found on disk, plus the old rows that are not manifest videos (documents, the table)."""
    out_path = Path(out_path)
    previous = read_csv(out_path) if out_path.exists() else []
    names = {r["file_name"] for r in manifest_rows}
    keep = [{c: r.get(c, "") for c in COLUMNS} for r in previous
            if r["file_name"] not in names]
    found = downloads_rows(manifest_rows, dest_dir, today, previous)
    if not found and any(r["file_name"] in names for r in previous):
        raise RuntimeError("no manifest video found in %s: refusing to rewrite %s"
                           % (dest_dir, out_path.name))
    rows = sorted(found + keep, key=lambda x: x["file_name"])
    tmp_path = out_path.with_name(out_path.name + ".tmp")
    with tmp_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(tmp_path, out_path)
    return rows


def fetch_one(row, dest_dir):
    """Download one file with up to three tries. True when it is there with the right size."""
    path = Path(dest_dir) / row["file_name"]
    for attempt in (1, 2, 3):
        run = subprocess.run([sys.executable, str(CLIENT), "get", PSI_ID, row["file_name"]],
                             capture_output=True, text=True, cwd=ROOT)
        if run.returncode == 0 and on_disk(row, dest_dir):
            return True
        time.sleep(RETRY_WAIT_S * attempt)
    return path.is_file() and on_disk(row, dest_dir)


def opens(path):
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return probe.returncode == 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="print what would be fetched")
    ap.add_argument("--only", choices=("main", "all"), default="all",
                    help="main: plain main-view videos only")
    ap.add_argument("--register-only", action="store_true",
                    help="fetch nothing, rewrite downloads.csv from the disk")
    args = ap.parse_args(argv)

    manifest_rows = read_csv(MANIFEST)
    today = datetime.date.today().isoformat()
    if args.register_only:
        rows = register(manifest_rows, DEST, DOWNLOADS, today)
        print("registered %d rows in %s" % (len(rows), DOWNLOADS.relative_to(ROOT)))
        return 0

    pending = todo(manifest_rows, DEST)
    if args.only == "main":
        pending = [r for r in pending if is_plain_main(r)]
    print("to fetch: %d files, %.2f GB" % (len(pending), sum(float(r["bytes"]) for r in pending) / 1e9),
          flush=True)
    if args.dry_run:
        return 0

    DEST.mkdir(parents=True, exist_ok=True)
    done = bad = 0
    got = 0.0
    try:
        for i, r in enumerate(pending, 1):
            if shutil.disk_usage(ROOT).free < MIN_FREE_BYTES:
                print("STOP: less than 6 GB free on disk", flush=True)
                break
            ok = fetch_one(r, DEST)
            can_open = ok and opens(DEST / r["file_name"])
            done += ok
            bad += not ok
            got += float(r["bytes"]) if ok else 0
            print("%s %3d/%d %s %-15s %7.1f MB opens=%s total=%.2f GB | %s" % (
                time.strftime("%H:%M:%S"), i, len(pending), "OK " if ok else "BAD", r["investigator"],
                float(r["bytes"]) / 1e6, can_open, got / 1e9, r["file_name"]), flush=True)
            time.sleep(PAUSE_S)
        print("FINISHED ok=%d bad=%d %.2f GB" % (done, bad, got / 1e9), flush=True)
    finally:
        rows = register(manifest_rows, DEST, DOWNLOADS, today)
    print("registered %d rows in %s" % (len(rows), DOWNLOADS.relative_to(ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
