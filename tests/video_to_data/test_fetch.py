"""Checks on pipeline/video_to_data/fetch.py. No network, no data/raw: files live in tmp_path.

Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import csv
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "video_to_data"))
import fetch  # noqa: E402


def row(name, size, investigator="Olson", view="main", still="false", subcategory="Sub/A"):
    return {"file_name": name, "bytes": str(size), "investigator": investigator, "view": view,
            "is_still_sequence": still, "subcategory": subcategory}


def write(folder, name, size):
    (Path(folder) / name).write_bytes(b"x" * size)


class Todo(unittest.TestCase):
    def test_order_is_main_first_then_investigator_then_size(self):
        rows = [
            row("still.mp4", 1, "T'ien", still="true"),
            row("olson_big.mp4", 50, "Olson"),
            row("olson_small.mp4", 5, "Olson"),
            row("tien.mp4", 99, "T'ien"),
            row("side.mp4", 2, "Ferkul", view="side"),
            row("unknown.mp4", 3, "Nobody"),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            names = [r["file_name"] for r in fetch.todo(rows, Path(tmp))]
        self.assertEqual(names, ["tien.mp4", "olson_small.mp4", "olson_big.mp4", "unknown.mp4",
                                 "still.mp4", "side.mp4"])

    def test_a_file_on_disk_with_the_manifest_size_is_skipped(self):
        rows = [row("a.mp4", 10), row("b.mp4", 20), row("c.mp4", 30)]
        with tempfile.TemporaryDirectory() as tmp:
            write(tmp, "a.mp4", 10)
            write(tmp, "b.mp4", 7)
            names = [r["file_name"] for r in fetch.todo(rows, Path(tmp))]
        self.assertEqual(sorted(names), ["b.mp4", "c.mp4"])


class DownloadsRows(unittest.TestCase):
    def test_columns_are_fixed(self):
        self.assertEqual(fetch.COLUMNS, ["file_name", "bytes", "psi_id", "subcategory", "kind",
                                         "local_path", "date_fetched"])

    def test_only_complete_files_are_listed_sorted_with_dates_kept(self):
        rows = [row("b.mp4", 10), row("a.mp4", 4), row("wrong.mp4", 9), row("gone.mp4", 3),
                row("part.mp4", 5)]
        previous = [{"file_name": "a.mp4", "date_fetched": "2026-11-14"}]
        with tempfile.TemporaryDirectory() as tmp:
            write(tmp, "a.mp4", 4)
            write(tmp, "b.mp4", 10)
            write(tmp, "wrong.mp4", 1)
            write(tmp, "part.mp4.part", 5)
            out = fetch.downloads_rows(rows, Path(tmp), "2026-11-15", previous)
        self.assertEqual([r["file_name"] for r in out], ["a.mp4", "b.mp4"])
        self.assertEqual([r["date_fetched"] for r in out], ["2026-11-14", "2026-11-15"])
        self.assertEqual(out[0], {
            "file_name": "a.mp4", "bytes": "4", "psi_id": "PSI-25", "subcategory": "Sub/A",
            "kind": "video", "local_path": "data/raw/files/PSI-25/a.mp4",
            "date_fetched": "2026-11-14"})


class RegisterOnly(unittest.TestCase):
    def test_keeps_non_video_rows_and_rewrites_the_file(self):
        manifest_rows = [row("v.mp4", 6)]
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "files"
            dest.mkdir()
            write(dest, "v.mp4", 6)
            write(dest, "t.csv", 2)
            out = Path(tmp) / "downloads.csv"
            with out.open("w", newline="", encoding="utf-8") as fh:
                w = csv.DictWriter(fh, fetch.COLUMNS)
                w.writeheader()
                w.writerow({"file_name": "t.csv", "bytes": "2", "psi_id": "PSI-25",
                            "subcategory": "", "kind": "table",
                            "local_path": "data/raw/files/PSI-25/t.csv",
                            "date_fetched": "2026-11-14"})
            fetch.register(manifest_rows, dest, out, "2026-11-15")
            with out.open(newline="", encoding="utf-8") as fh:
                got = list(csv.DictReader(fh))
        self.assertEqual([r["file_name"] for r in got], ["t.csv", "v.mp4"])
        self.assertEqual(got[0]["kind"], "table")
        self.assertEqual(got[1]["date_fetched"], "2026-11-15")

    def _list(self, tmp, names):
        out = Path(tmp) / "downloads.csv"
        with out.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fetch.COLUMNS)
            w.writeheader()
            for n in names:
                w.writerow({"file_name": n, "bytes": "6", "psi_id": "PSI-25", "subcategory": "",
                            "kind": "video", "local_path": "data/raw/files/PSI-25/" + n,
                            "date_fetched": "2026-11-14"})
        return out

    def test_refuses_to_rewrite_when_no_manifest_video_is_on_disk(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = self._list(tmp, ["v.mp4"])
            before = out.read_text(encoding="utf-8")
            for dest in (Path(tmp) / "missing", Path(tmp)):
                with self.assertRaises(RuntimeError):
                    fetch.register([row("v.mp4", 6)], dest, out, "2026-11-15")
            self.assertEqual(out.read_text(encoding="utf-8"), before)

    def test_a_failed_write_leaves_the_old_file_and_no_temp_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = self._list(tmp, ["v.mp4"])
            before = out.read_text(encoding="utf-8")
            write(tmp, "v.mp4", 6)
            with mock.patch.object(fetch.os, "replace", side_effect=OSError("boom")):
                with self.assertRaises(OSError):
                    fetch.register([row("v.mp4", 6)], Path(tmp), out, "2026-11-15")
            self.assertEqual(out.read_text(encoding="utf-8"), before)
            fetch.register([row("v.mp4", 6)], Path(tmp), out, "2026-11-15")
            self.assertEqual(sorted(p.name for p in Path(tmp).iterdir()),
                             ["downloads.csv", "v.mp4"])

    def test_an_interrupt_during_the_fetch_loop_still_registers(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "files"
            dest.mkdir()
            write(dest, "have.mp4", 6)
            man = Path(tmp) / "manifest.csv"
            with man.open("w", newline="", encoding="utf-8") as fh:
                w = csv.DictWriter(fh, list(row("x", 1)))
                w.writeheader()
                w.writerow(row("have.mp4", 6))
                w.writerow(row("want.mp4", 9))
            out = Path(tmp) / "downloads.csv"
            with mock.patch.multiple(fetch, MANIFEST=man, DEST=dest, DOWNLOADS=out, ROOT=Path(tmp)), \
                    mock.patch.object(fetch, "fetch_one", side_effect=KeyboardInterrupt), \
                    mock.patch.object(fetch.shutil, "disk_usage",
                                      return_value=mock.Mock(free=10e9)):
                with self.assertRaises(KeyboardInterrupt):
                    fetch.main([])
            with out.open(newline="", encoding="utf-8") as fh:
                got = [r["file_name"] for r in csv.DictReader(fh)]
        self.assertEqual(got, ["have.mp4"])


class Names(unittest.TestCase):
    def test_every_row_of_the_committed_download_list_is_a_manifest_video_or_a_non_video(self):
        with (ROOT / "pipeline" / "video_to_data" / "manifest.csv").open(
                newline="", encoding="utf-8") as fh:
            names = {r["file_name"] for r in csv.DictReader(fh)}
        with (ROOT / "pipeline" / "video_to_data" / "downloads.csv").open(
                newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        for r in rows:
            if r["kind"] == "video":
                self.assertIn(r["file_name"], names)


if __name__ == "__main__":
    unittest.main()
