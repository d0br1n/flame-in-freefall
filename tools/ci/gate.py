#!/usr/bin/env python3
"""Integrity gate. One script, run by the pre-push hook and by the required CI check `gate`.

  gate.py               check every tracked file of this checkout
  gate.py --base REF    also look at the commits in REF..HEAD (SI trailer, edits to the gate)
  gate.py --self-test   prove the secret scanner fires on planted keys, then exit

Blocking: leaked credentials, key or .env files, files over 10 MB, merge conflict markers,
Python, JSON or shell files that do not parse, any FAIL from the judging checker
(.claude/skills/space-apps-judging/scripts/check.py), and the test rules below.

Tests: every tracked test_*.py, run with pytest from the repo root on a clean checkout (no
data/raw). The packages come from the change itself: every tracked requirements*.txt is
installed by uv before the run, so a pull request that adds a dependency is tested with it.
  - A red test fails the gate. So does a skipped or expected-failure test, and so does a
    run in which no test passes: a skip is not a pass.
  - With --base, the change itself is read too:
      * tamper block: a change may not delete a test or add a skip marker. A test that is
        really replaced needs `# Retires test_old_name: <why>` next to its successor.
      * tests required: a change to Python code must add or update a test file
        (test_*.py) in the same change. Exempt: tools/, .claude/, research/, modal/.
  - With --ci (set by the CI workflow): a missing tool is a failure, not a warning, and
    every package.json is installed with npm and its `test` script is run.

Stdlib only, Python 3.9 or newer. A credential is reported as path:line and never printed.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import argparse
import ast
import json
import os
import importlib.util
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECKER = ".claude/skills/space-apps-judging/scripts/check.py"
MAX_BYTES = 10 * 1024 * 1024
SCAN_BYTES = 5 * 1024 * 1024

# Judging gates that are known to be red for now. Delete an entry once it is green,
# so that it can never go red again unnoticed.
PENDING_JUDGING = {"G2 fields"}

# The files that define the gate. A change to them is allowed but always called out.
GATE_PATHS = (".github/workflows/", "tools/ci/", "tools/hooks/", "tools/land.sh", CHECKER)

SECRETS = [
    ("Anthropic API key", rb"sk-ant-[A-Za-z0-9_-]{24,}"),
    ("OpenAI API key", rb"sk-(?:proj|svcacct)-[A-Za-z0-9_-]{24,}"),
    ("GitHub token", rb"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}"),
    ("GitHub fine-grained token", rb"\bgithub_pat_[A-Za-z0-9_]{40,}"),
    ("Hugging Face token", rb"\bhf_[A-Za-z0-9]{30,}"),
    ("Linear API key", rb"\blin_api_[A-Za-z0-9]{30,}"),
    ("Modal token", rb"\b(?:ak|as)-[A-Za-z0-9]{20,}\b"),
    ("AWS access key", rb"\bAKIA[0-9A-Z]{16}\b"),
    ("Google API key", rb"\bAIza[0-9A-Za-z_-]{35}\b"),
    ("Slack token", rb"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    ("Slack webhook", rb"https://hooks\.slack\.com/services/[A-Za-z0-9/]{20,}"),
    ("private key", rb"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----"),
]
SECRETS = [(name, re.compile(rx)) for name, rx in SECRETS]

FORBIDDEN_NAME = re.compile(
    r"^(\.env(\..+)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?)$")
ALLOWED_NAME = {".env.example", ".env.sample", ".env.template"}
JSON_WITH_COMMENTS = re.compile(r"(^|/)(tsconfig.*\.json|jsconfig\.json|\.eslintrc\.json|"
                                r"devcontainer\.json|\.vscode/.*\.json)$")
CONFLICT = re.compile(rb"^(?:<{7}|>{7}) \S", re.M)
TEXT_EXT = {".md", ".txt", ".py", ".sh", ".json", ".yml", ".yaml", ".toml", ".js", ".jsx",
            ".ts", ".tsx", ".css", ".html", ".csv", ".ipynb", ".cfg", ".ini"}
SI_TRAILER = re.compile(r"^Co-Authored-By:", re.I | re.M)

# Test rules. Code under these prefixes does not need a test in the same change.
NO_TEST_NEEDED = ("tools/", ".claude/", "research/", "modal/", "docs/", "submission/", ".github/")
NOT_RUN_DIRS = ("research/", ".claude/")      # test_*.py here are neither run nor counted
REQUIREMENTS = re.compile(r"(^|/)requirements[^/]*\.txt$")
TEST_DEF = re.compile(r"^\s*(?:async\s+)?def (test_\w+)\s*\(")
RETIRES = re.compile(r"#\s*Retires\s+(test_\w+)\s*:\s*\S")
SKIP_MARK = re.compile(r"\bskipTest\b|\bSkipTest\b|@(?:unittest\.)?skip(?:If|Unless)?\b|"
                       r"\bunittest\.skip(?:If|Unless)?\b|\bexpectedFailure\b|"
                       r"\bpytest\.(?:mark\.)?(?:skip|skipif|xfail)\b|\bimportorskip\b")

results = []  # (status, rule, message)


def add(status, rule, msg):
    results.append((status, rule, msg))


def git(*args):
    return subprocess.run(["git", "-C", str(ROOT)] + list(args), capture_output=True,
                          text=True, timeout=60)


def tracked_files():
    out = subprocess.run(["git", "-C", str(ROOT), "ls-files", "-z"], capture_output=True,
                         timeout=60, check=True).stdout
    return [raw.decode("utf-8", "surrogateescape") for raw in out.split(b"\0") if raw]


def secret_hits(data):
    """Return (line, kind) for every credential-shaped string in data."""
    hits = []
    for name, rx in SECRETS:
        for match in rx.finditer(data):
            hits.append((data.count(b"\n", 0, match.start()) + 1, name))
    return sorted(hits)


def is_test_file(path):
    name = path.rsplit("/", 1)[-1]
    return (name.endswith(".py") and (name.startswith("test_") or name.endswith("_test.py"))
            and not path.startswith(NOT_RUN_DIRS))


def tamper_findings(changes):
    """changes: {path: (status, removed lines, added lines)}. Return the blocking messages."""
    added_names, retired, findings = set(), set(), []
    tests = {p: c for p, c in changes.items() if is_test_file(p)}
    for _, _, added in tests.values():
        for line in added:
            match = TEST_DEF.match(line)
            if match:
                added_names.add(match.group(1))
            match = RETIRES.search(line)
            if match:
                retired.add(match.group(1))
    for path, (_, removed, added) in sorted(tests.items()):
        for line in removed:
            match = TEST_DEF.match(line)
            if match and match.group(1) not in added_names and match.group(1) not in retired:
                findings.append("%s: %s was deleted. Restore it, or put '# Retires %s: <why>' "
                                "next to the test that replaces it" % (path, match.group(1), match.group(1)))
        for line in added:
            if SKIP_MARK.search(line) and not line.lstrip().startswith("#"):
                findings.append("%s adds a skip or expected-failure marker (%s). A skipped test is "
                                "not a pass: fix the test or what it needs" % (path, line.strip()[:60]))
    return findings


def code_without_tests(changes):
    """Return the changed Python code files if the change touches no test file, else []."""
    code = sorted(p for p, (status, _, _) in changes.items()
                  if status != "D" and not is_test_file(p) and not p.startswith(NO_TEST_NEEDED)
                  and not p.endswith("__init__.py"))
    tested = any(is_test_file(p) and status != "D" and added
                 for p, (status, _, added) in changes.items())
    return [] if tested else code


def self_test():
    old = ["    def test_old(self):", "        self.assertTrue(x)"]
    cases = [
        # (changes, tamper findings expected, code-without-tests expected)
        ({"tests/a/test_x.py": ("M", old, [])}, 1, 0),
        ({"tests/a/test_x.py": ("M", old, ["    def test_new(self):"])}, 1, 0),
        ({"tests/a/test_x.py": ("M", old, ["    def test_new(self):", "        # Retires test_old: merged into test_new"])}, 0, 0),
        ({"tests/a/test_x.py": ("D", old, []), "tests/b/test_y.py": ("A", [], old)}, 0, 0),
        ({"tests/a/test_x.py": ("M", [], ["    @unittest.skipUnless(HAVE_NUMPY, 'no numpy')"])}, 1, 0),
        ({"tests/a/test_x.py": ("M", [], ["    # we never skip here"])}, 0, 0),
        ({"pipeline/a/core.py": ("M", [], ["x = 1"])}, 0, 1),
        ({"pipeline/a/core.py": ("M", [], ["x = 1"]), "tests/a/test_core.py": ("M", [], ["    def test_x(self):"])}, 0, 0),
        ({"tools/ci/gate.py": ("M", [], ["x = 1"]), "research/spike.py": ("A", [], ["y = 2"])}, 0, 0),
    ]
    for changes, want_tamper, want_untested in cases:
        if len(tamper_findings(changes)) != want_tamper or len(code_without_tests(changes)) != want_untested:
            raise SystemExit("self-test: the test rules misjudged %r" % sorted(changes))

    planted = {
        "Anthropic API key": b"sk-" + b"ant-" + b"a" * 40,
        "OpenAI API key": b"sk-" + b"proj-" + b"b" * 40,
        "GitHub token": b"gh" + b"p_" + b"c" * 36,
        "GitHub fine-grained token": b"github_" + b"pat_" + b"d" * 60,
        "Hugging Face token": b"h" + b"f_" + b"e" * 34,
        "Linear API key": b"lin_" + b"api_" + b"f" * 40,
        "Modal token": b"a" + b"k-" + b"g" * 22,
        "AWS access key": b"AK" + b"IA" + b"A" * 16,
        "Google API key": b"AI" + b"za" + b"h" * 35,
        "Slack token": b"xo" + b"xb-" + b"1" * 20,
        "Slack webhook": b"https://hooks.slack" + b".com/services/" + b"T" * 24,
        "private key": b"-----BEGIN " + b"OPENSSH PRIVATE KEY-----",
    }
    for name, _ in SECRETS:
        kinds = [kind for _, kind in secret_hits(b"line one\n" + planted[name] + b"\n")]
        if name not in kinds:
            raise SystemExit("self-test: the scanner missed a planted %s" % name)
    for harmless in (b"export ANTHROPIC_API_KEY=sk-ant-...", b"token: ghp_<your token>",
                     b"as-is, ak-47 and hf_hub_download are words, not keys"):
        if secret_hits(harmless):
            raise SystemExit("self-test: the scanner flagged a placeholder: %r" % harmless)


def check_files():
    files = tracked_files()
    secrets = names = big = conflicts = broken = 0
    for rel in files:
        path = ROOT / rel
        if path.is_symlink() or not path.is_file():
            continue
        name = path.name
        if FORBIDDEN_NAME.match(name) and name not in ALLOWED_NAME:
            names += 1
            add("FAIL", "key files", "%s is a key or environment file and must not be in git" % rel)
        size = path.stat().st_size
        if size > MAX_BYTES:
            big += 1
            add("FAIL", "file size", "%s is %.0f MB (limit 10 MB): keep it out of git, use "
                "tools/send.sh" % (rel, size / 1048576))
        if size > SCAN_BYTES:
            continue
        data = path.read_bytes()
        for line, kind in secret_hits(data):
            secrets += 1
            add("FAIL", "secrets", "%s:%d looks like a %s. Remove it and revoke the key" % (rel, line, kind))
        ext = path.suffix.lower()
        if ext in TEXT_EXT and CONFLICT.search(data):
            conflicts += 1
            add("FAIL", "conflict markers", "%s still has merge conflict markers" % rel)
        problem = parse_problem(rel, path, ext, data)
        if problem:
            broken += 1
            add(*problem)
    if not secrets:
        add("PASS", "secrets", "no credential-shaped strings in %d tracked files" % len(files))
    if not names:
        add("PASS", "key files", "no key or .env files tracked")
    if not big:
        add("PASS", "file size", "no tracked file over 10 MB")
    if not conflicts:
        add("PASS", "conflict markers", "none")
    if not broken:
        add("PASS", "parse", "every Python, JSON and shell file parses")


def parse_problem(rel, path, ext, data):
    if ext == ".py":
        try:
            ast.parse(data, filename=rel)
        except SyntaxError as exc:
            # An old interpreter cannot judge newer syntax: warn there, fail on 3.10+.
            status = "FAIL" if sys.version_info >= (3, 10) else "WARN"
            return (status, "parse", "%s:%s Python syntax error: %s" % (rel, exc.lineno, exc.msg))
        except ValueError as exc:
            return ("FAIL", "parse", "%s cannot be parsed as Python: %s" % (rel, exc))
    elif ext in (".json", ".ipynb") and not JSON_WITH_COMMENTS.search(rel):
        try:
            json.loads(data.decode("utf-8-sig"))
        except (ValueError, UnicodeDecodeError) as exc:
            return ("FAIL", "parse", "%s is not valid JSON: %s" % (rel, exc))
    elif ext == ".sh":
        run = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True, timeout=30)
        if run.returncode != 0:
            lines = run.stderr.strip().splitlines()
            return ("FAIL", "parse", "%s shell syntax error: %s" % (rel, lines[-1] if lines else "unknown"))
    return None


def check_judging():
    script = ROOT / CHECKER
    if not script.exists():
        add("WARN", "judging", "%s is missing, judging gates not checked" % CHECKER)
        return
    run = subprocess.run([sys.executable, str(script)], capture_output=True, text=True,
                         timeout=120, cwd=str(ROOT))
    fails = pending = 0
    for line in run.stdout.splitlines():
        if not line.startswith("FAIL"):
            continue
        gate, msg = line[7:29].strip(), line[30:].strip()
        if gate in PENDING_JUDGING:
            pending += 1
            add("WARN", "judging", "%s still open (allowed for now): %s" % (gate, msg[:90]))
        else:
            fails += 1
            add("FAIL", "judging", "%s: %s" % (gate, msg))
    if run.returncode not in (0, 1) or (run.returncode == 1 and not fails and not pending):
        tail = run.stderr.strip().splitlines()
        add("FAIL", "judging", "the judging checker crashed: %s" % (tail[-1] if tail else "no output"))
    elif not fails:
        add("PASS", "judging", "no judging gate fails")


def run(cmd, cwd, extra_env=None, timeout=900):
    """Run a command, return (exit code, combined output). A timeout counts as a failure."""
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", **(extra_env or {}))
    try:
        done = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=str(cwd), env=env)
    except subprocess.TimeoutExpired:
        return 124, "timed out after %d s: %s" % (timeout, " ".join(cmd[:6]))
    return done.returncode, (done.stdout + done.stderr).strip()


def check_tests(ci):
    files = tracked_files()
    tests = sorted(f for f in files if is_test_file(f))
    if not tests:
        add("PASS", "tests", "no test files yet")
        return None
    reqs = sorted(f for f in files if REQUIREMENTS.search(f) and "node_modules/" not in f)
    pytest_args = ["-m", "pytest", "-q", "-rs", "-p", "no:cacheprovider", "--import-mode=importlib"] + tests
    uv = shutil.which("uv")
    if uv:
        cmd = [uv, "run", "--quiet", "--no-project", "--python", sys.executable, "--with", "pytest"]
        for req in reqs:
            cmd += ["--with-requirements", req]
        cmd += ["python"] + pytest_args
        how = "%d requirements file(s) installed by uv" % len(reqs)
    elif ci:
        add("FAIL", "tests", "uv is not installed on this runner, so the declared packages cannot be installed")
        return None
    elif importlib.util.find_spec("pytest"):
        cmd = [sys.executable] + pytest_args
        how = "this machine's own packages, uv not found"
    else:
        add("WARN", "tests", "%d test file(s) NOT run here: install uv (https://docs.astral.sh/uv/). "
            "CI runs them" % len(tests))
        return None

    code, output = run(cmd, ROOT)
    last = output.splitlines()[-1] if output else "no output"
    count = lambda word: sum(int(n) for n in re.findall(r"(\d+) %s\b" % word, last))
    passed, not_run = count("passed"), count("skipped") + count("xfailed") + count("xpassed")
    if code != 0:
        if not uv and re.search(r"ModuleNotFoundError|ImportError", output):
            add("WARN", "tests", "tests could not run here: a package is missing and uv is not installed. CI runs them")
            return None
        add("FAIL", "tests", "result: %s (full output below)" % last[:120])
        return output
    if passed == 0:
        add("FAIL", "tests", "no test passed. Zero tests is not a pass: %s" % last[:80])
        return output
    if not_run:
        add("FAIL", "tests", "%d test(s) were skipped or expected to fail, %d passed. A skip is not a pass" % (not_run, passed))
        return output
    add("PASS", "tests", "%d tests passed, none skipped (%d test files, %s)" % (passed, len(tests), how))
    return None


def check_js(ci):
    packages = sorted(f for f in tracked_files()
                      if f.rsplit("/", 1)[-1] == "package.json" and "node_modules/" not in f)
    if not packages:
        add("PASS", "javascript", "no package.json yet")
        return None
    if not ci:
        add("NOTE", "javascript", "%d package.json: installed and tested in CI, not in the local hook" % len(packages))
        return None
    npm = shutil.which("npm")
    if not npm:
        add("FAIL", "javascript", "npm is not installed on this runner")
        return None
    for package in packages:
        folder = (ROOT / package).parent
        where = str(folder.relative_to(ROOT)) or "."
        locked = (folder / "package-lock.json").exists()
        code, output = run([npm, "ci" if locked else "install", "--no-audit", "--no-fund"], folder, {"CI": "true"})
        if code != 0:
            add("FAIL", "javascript", "%s: the dependencies do not install (full output below)" % where)
            return output
        if not locked:
            add("WARN", "javascript", "%s has no package-lock.json: commit it so every install is the same" % where)
        try:
            scripts = json.loads((ROOT / package).read_text()).get("scripts", {})
        except ValueError:
            scripts = {}
        if "test" not in scripts:
            add("PASS", "javascript", "%s: dependencies install (it has no test script)" % where)
            continue
        code, output = run([npm, "test"], folder, {"CI": "true"})
        if code != 0:
            add("FAIL", "javascript", "%s: npm test is red (full output below)" % where)
            return output
        add("PASS", "javascript", "%s: dependencies install, npm test is green" % where)
    return None


def check_commits(base):
    if git("rev-parse", "--verify", "--quiet", base + "^{commit}").returncode != 0:
        add("WARN", "commits", "base %s not found, commit checks skipped" % base)
        return
    # --no-merges: on a pull request CI checks out GitHub's own merge commit, which has no trailer.
    log = git("log", "--no-merges", "--format=%h%x00%s%x00%b%x01", "%s..HEAD" % base).stdout
    missing = []
    for entry in log.split("\x01"):
        parts = entry.strip("\n").split("\x00")
        if len(parts) == 3 and not SI_TRAILER.search(parts[2]):
            missing.append("%s %s" % (parts[0], parts[1][:60]))
    if missing:
        add("WARN", "SI trailer", "%d commit(s) without a Co-Authored-By trailer. If SI helped, "
            "the rules need it: %s" % (len(missing), "; ".join(missing[:5])))
    changed = git("diff", "--name-only", "%s...HEAD" % base).stdout.splitlines()
    gate_edits = [f for f in changed if f.startswith(GATE_PATHS)]
    if gate_edits:
        add("WARN", "gate edited", "this change edits the gate itself, a human should read it: "
            + ", ".join(gate_edits[:8]))

    changes = python_changes(base)
    findings = tamper_findings(changes)
    for finding in findings:
        add("FAIL", "test tamper", finding)
    if not findings:
        add("PASS", "test tamper", "no test deleted, no skip added")
    untested = code_without_tests(changes)
    if untested:
        add("FAIL", "tests required", "Python code changed without a test in the same change: %s. "
            "Add or update a test_*.py next to the code or under tests/" % ", ".join(untested[:6]))
    else:
        add("PASS", "tests required", "every code change comes with a test change")


def python_changes(base):
    """{path: (status, removed lines, added lines)} for the Python files changed since base."""
    changes = {}
    rng = "%s...HEAD" % base
    for row in git("diff", "--no-renames", "--name-status", rng).stdout.splitlines():
        status, _, path = row.partition("\t")
        if not path.endswith(".py"):
            continue
        diff = git("diff", "--no-renames", "-U0", rng, "--", path).stdout.splitlines()
        removed = [l[1:] for l in diff if l.startswith("-") and not l.startswith("---")]
        added = [l[1:] for l in diff if l.startswith("+") and not l.startswith("+++")]
        changes[path] = (status[:1], removed, added)
    return changes


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base", help="git ref to compare with, for example origin/main")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--ci", action="store_true",
                        help="CI mode: missing tools fail, JavaScript packages are installed and tested")
    args = parser.parse_args()

    self_test()
    if args.self_test:
        print("self-test passed: secret patterns and test rules judge their planted cases correctly")
        return 0

    check_files()
    check_judging()
    ci = args.ci or os.environ.get("GITHUB_ACTIONS") == "true"
    outputs = [check_tests(ci), check_js(ci)]
    if args.base:
        check_commits(args.base)

    in_ci = os.environ.get("GITHUB_ACTIONS") == "true"
    for status, rule, msg in results:
        print("%-5s %-17s %s" % (status, rule, msg))
        if in_ci and status in ("FAIL", "WARN"):
            print("::%s title=%s::%s" % ("error" if status == "FAIL" else "warning", rule, msg))
    for output in outputs:
        if output:
            print("\n----- output -----\n%s\n------------------" % output[-6000:])
    fails = sum(1 for r in results if r[0] == "FAIL")
    print("gate: %s" % ("%d FAIL, push blocked" % fails if fails else "green"))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
