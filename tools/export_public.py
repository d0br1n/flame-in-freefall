#!/usr/bin/env python3
"""Build the public copy of this repository in a new folder.

    python3 tools/export_public.py <out-dir> [--ref origin/main] [--url https://github.com/<owner>/<repo>]

The team's working repository stays private. The public copy is the tracked tree of <ref>
without the working notes and the SI session setup:

  left out   research/, CLAUDE.md, .claude/ (except the PSI client, which the pipeline needs)
  kept       everything else: apps/, pipeline/, data/, contracts/, tests/, tools/, docs/,
             submission/, design/, modal/, .github/, README.md, LICENSE

It then fixes the text that pointed at what was left out (README layout, source link, a note
at the top of the two ledgers) and checks the result: nothing left of the removed folders,
no third-party email address, no broken relative link in README, docs/ and submission/.
It never touches git history, never commits and never pushes: the out-dir is a plain folder.

Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import argparse
import io
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_URL = "https://github.com/d0br1n/flame-in-freefall"
DROP = ("research", "CLAUDE.md")
KEEP_IN_CLAUDE = Path(".claude/skills/psi-api")
NOTE = ("> This is the public copy of the repository. Paths under `research/` and `.claude/` (other\n"
        "> than `.claude/skills/psi-api/`) refer to the team's private working repository: working\n"
        "> notes and the setup of the SI coding sessions, which are not published.\n")
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}")
EMAIL_OK = re.compile(r"noreply@|example\.|git@github", re.I)
LINK = re.compile(r"\]\(([^)#\s]+)(#[^)]*)?\)")
TEXT = {".md", ".txt", ".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".yaml", ".yml", ".sh", ".html", ".csv"}


def replace_once(path: Path, old: str, new: str, problems: list) -> None:
    text = path.read_text()
    if old not in text:
        problems.append(f"{path.name}: expected text not found: {old[:60]!r}")
        return
    path.write_text(text.replace(old, new, 1))


def add_note(path: Path) -> None:
    lines = path.read_text().split("\n")
    lines[1:1] = ["", NOTE.rstrip("\n")]          # under the title line
    path.write_text("\n".join(lines))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("out")
    ap.add_argument("--ref", default="origin/main")
    ap.add_argument("--url", default="", help="address of the public repository, if it exists already")
    args = ap.parse_args()

    out = Path(args.out).resolve()
    if out.exists() and any(out.iterdir()):
        print(f"export: {out} exists and is not empty, choose a new folder", file=sys.stderr)
        return 2
    out.mkdir(parents=True, exist_ok=True)

    archive = subprocess.run(["git", "-C", str(ROOT), "archive", "--format=tar", args.ref],
                             check=True, capture_output=True).stdout
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(out, filter="data")

    # 1. leave out the working notes and the SI session setup, keep the PSI client
    for name in DROP:
        target = out / name
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()
    claude = out / ".claude"
    keep = out / KEEP_IN_CLAUDE
    if claude.is_dir():
        for path in sorted(claude.rglob("*"), reverse=True):
            if path == keep or keep in path.parents or path in keep.parents:
                continue
            path.unlink() if (path.is_file() or path.is_symlink()) else path.rmdir()

    # 2. fix the text that pointed at what was left out
    problems: list = []
    readme = out / "README.md"
    replace_once(readme,
                 "| `research/` | Working notes from the weekend: user research, video measurement experiments, "
                 "the three ideas we weighed. Names, addresses and quoted replies are redacted |\n", "", problems)
    replace_once(readme,
                 "| `.claude/`, `CLAUDE.md` | Setup and rules for the SI coding sessions that worked on this repo |",
                 "| `.claude/skills/psi-api/` | The PSI API client the pipeline downloads the raw files with |", problems)
    replace_once(readme, "## Docs\n",
                 "The team's working notes (`research/`) and the setup of the SI coding sessions are kept in "
                 "the private working repository and are not part of this public copy.\n\n## Docs\n", problems)
    for ledger in ("submission/SI_USAGE.md", "submission/REFERENCES.md"):
        add_note(out / ledger)
    if args.url:
        for path in out.rglob("*"):
            if path.is_file() and path.suffix in TEXT and OLD_URL in path.read_text(errors="ignore"):
                path.write_text(path.read_text().replace(OLD_URL, args.url.rstrip("/")))

    # 3. check the result
    for name in DROP:
        if (out / name).exists():
            problems.append(f"{name} is still there")
    left = [p for p in claude.rglob("*") if p.is_file() and keep not in p.parents] if claude.is_dir() else []
    if left:
        problems.append(f".claude still holds {len(left)} file(s) outside {KEEP_IN_CLAUDE}")
    if not (keep / "psi_client.py").is_file():
        problems.append(f"{KEEP_IN_CLAUDE}/psi_client.py is missing: the pipeline cannot download PSI data")
    for path in out.rglob("*"):
        if path.is_file() and path.suffix in TEXT and "node_modules" not in path.parts and "data" not in path.parts:
            for match in EMAIL.finditer(path.read_text(errors="ignore")):
                if not EMAIL_OK.search(match.group(0)):
                    problems.append(f"email address in {path.relative_to(out)}")
                    break
    docs = [readme, *sorted((out / "docs").glob("*.md")), *sorted((out / "submission").glob("*.md")),
            *sorted(out.glob("apps/*/README.md")), *sorted(out.glob("pipeline/*/README.md"))]
    for doc in docs:
        for match in LINK.finditer(doc.read_text()):
            target = match.group(1)
            if not re.match(r"^[a-z]+:", target) and not (doc.parent / target).exists():
                problems.append(f"broken link in {doc.relative_to(out)}: {target}")
    if not args.url:
        print(f"export: note, no --url given: README and the project page still name {OLD_URL}")

    files = sum(1 for p in out.rglob("*") if p.is_file())
    print(f"export: {files} files in {out} from {args.ref}")
    for line in problems:
        print("export: PROBLEM", line)
    if problems:
        return 1
    print("export: checks passed. Next: git init, one commit that keeps the Co-Authored-By trailer, push to the public repository.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
