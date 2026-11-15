# The catalog and backend lane: how it was built

The record of one lane of burnrate (owner: Flavius), issue by issue: what each issue asked,
how it was built, the decisions and why, how it was checked, and the commits on `main`. Read
`docs/ARCHITECTURE.md` first for how the parts fit; the routes are listed in
`docs/ENGINE_API_CONTRACT.md`.

Written 14 November 2026. Built with Claude Code (SI); the decisions marked "decided by" were
made by the team, and every change was tested and landed through the CI gate.

## Technology used, and why

| Layer | Technology | Used for |
|---|---|---|
| Data source | NASA PSI public API (psi.nasa.gov) | The 24 investigation records (JSON) and 22 experimental tables (CSV) |
| Pipeline | Python 3.12, standard library only (`csv`, `json`, `sqlite3`) | Reading NASA's files, unit conversion, building the database; nothing to install |
| Storage | SQLite (`data/build/catalog.sqlite`, 6 MB, committed) | One file, no database server, identical bytes on every build |
| Contract | JSON Schema + our own validator (`contracts/validate.py`) | The shape every engine hands over, checked without installing anything |
| Backend | FastAPI, Uvicorn, Pydantic | The read-only API at `/api/v1/...`, with automatic docs at `/docs` |
| Website | TypeScript, React, Next.js, Tailwind CSS, hand-drawn SVG charts | The pages (web lane; DOB-87 is the Suppress view) |
| Tests | pytest/unittest (Python), Vitest (web unit), Playwright (real-browser) | About 170 Python, 138 web unit and 26 browser tests |
| Teamwork | Git + GitHub, CI gate (`tools/ci/gate.py`, `tools/land.sh`), the swarm | Every change is tested before it joins `main`; sessions claim files |
| Hosting | Oracle Cloud Linux server + systemd (backend), Vercel (website) | The backend restarts by itself and follows `main` every 5 minutes |
| SI | Claude Code (Anthropic) | Writing code, tests and docs; declared in headers, commits and `submission/SI_USAGE.md` |

A longer, plain-language explanation with a dictionary of terms and one NASA test traced from
the PSI website to the screen is kept by Flavius as a personal study guide.

## The rule behind every decision

No invented numbers. Every number traces to a NASA PSI investigation ID, file and row. If a
cell is not one clean number (`RAMP`, `n/a`, a range, a list, `3400%`), it stays empty and gets
a flag, with the original text kept beside it. "Never tested" is an answer, never a gap to fill.

## How a change was made (the same for every issue)

1. Claim the folders on the swarm (`swarm.sh claim ...`), so no other session edits them.
2. Work on a branch `flavius/<topic>`.
3. Write the code and the tests together. Python tests live in `tests/<area>/` and
   `apps/api/tests/`; web tests in `apps/web/tests/unit/` (vitest) and `apps/web/tests/e2e/`
   (Playwright, local only).
4. Run the tests locally, then `tools/land.sh --wait`: it rebases on `origin/main`, pushes, and
   the bot merges when the CI gate is green (secrets, file sizes, judging checks, every test,
   "a code change needs a test change").
5. Announce on the swarm only what changes someone else's work (a route, a shape, a file).
6. Keep the ledgers current: `submission/REFERENCES.md`, `submission/SI_USAGE.md`.

## Data flow

```
 NASA PSI API (psi.nasa.gov)  --psi_client.py-->  data/raw/json/ (24 records), data/raw/tables/ (22 CSV)
 pipeline/catalog/curation/investigations.yaml (tags + plain summaries, DOB-61)
        |
        v
 python3 pipeline/catalog/build.py  -->  data/build/catalog.sqlite  (6 MB, committed, same bytes every build)
        |
        v
 apps/api (FastAPI, read-only, loads everything into memory at start)  -->  /api/v1/...
        |
        v
 apps/web (Next.js on Vercel; forwards /api/v1/* to the backend)
```

The database is committed so the server and CI need no raw data and no network access to
NASA. Anyone can rebuild it with one command and get identical bytes.

## Milestone 1: foundations

### DOB-81: architecture page (`docs/ARCHITECTURE.md`)

- **Asked:** one page that says how the parts fit, who owns which folder, and the decisions
  that make the parts work together.
- **Built:** the parts table, the data flow, eight decisions (engines hand over files; one
  contract; one test ID; one cabin air; never tested is an answer; measured and computed look
  different; one reader per table; no engine feeds another), the test ID rule, and what we must
  not claim.
- **Updated at 19:38** to match what is on `main`: product name burnrate, two engines both
  built (smoke dropped), cabin air from `/air/presets`, the test ID rule for repeated numbers
  (`PSI-39/1285#23`) and tables with no test number (`PSI-107/#12`), checked against the database.
- **Sign-off table:** catalog/contract/backend (Flavius) yes; web (Alex) yes; video engine
  (d0br1n) and flame temperature engine pending.
- **Commits:** `aaef624`, `d05579e`, `8d9dc08`, `e476236`.

### DOB-82: hand-over contract (`contracts/`)

- **Asked:** fixed shapes for what every engine hands over, and one validator.
- **Built:** JSON Schemas for `module.json`, `evidence.json`, `findings.json` and shared parts,
  and `contracts/validate.py` (standard library only). It implements only the JSON Schema
  subset the schemas use and refuses any other keyword, so nothing is silently ignored.
- **Rules it enforces:** every number has `test_id`, `source.psi_id`, `source.file`; the test
  ID starts with its PSI ID; one value per test, segment and quantity; provenance is one of six
  tags; every listed file exists; `status: example` marks placeholders.
- **Why our own validator:** nothing to install on any engine's machine, and an unknown keyword
  fails loudly. A mock engine (`data/modules/_mock/`) let the web lane build before any engine existed.
- **Checked:** `tests/contracts/test_validate.py`. Today both engines pass (flame temperature:
  742 evidence records, 15 findings).
- **Commits:** `a021dc2`, `c7465f2`. Frozen and announced on the swarm.

### DOB-58: backend skeleton (`apps/api/`)

- **Asked:** one read-only API that serves every engine folder with no per-engine code.
- **Built:** FastAPI app; logic in `store.py` (standard library, tested without FastAPI),
  routes in `main.py`: `/health`, `/modules`, `/modules/{id}`, `/evidence`, `/findings`,
  `/files/{name}`.
- **Decisions:** a broken engine folder is listed as `not_built` and answers 404, never crashes
  the app; only files listed in `module.json` are served; pydantic models mirror the schemas and
  a test fails if they drift.
- **Commits:** `9c5ed76`, `c7465f2`.

## Milestone A/B: the catalog

### DOB-60: catalog database (`pipeline/catalog/build.py`)

- **Asked:** build the database of the 24 investigations, their files and publications.
- **Built:** tables `investigations`, `files`, `publications`, `people`, `meta` from the 24 PSI
  records plus the curation file.
- **Decisions and why:**
  - Current files only (`experimentalTable`, `added`), never `removed` (retracted).
  - People: name, affiliation, roles. Email, phone and address are not copied (a test checks the bytes).
  - PSI's `totalFileSize` is kept but not trusted (FLEX lists 924 GB, offers one 25 KB table);
    we also store the size of what PSI actually lists.
  - The build stops and names the PSI ID on a missing record, a record under the wrong ID, or a
    curation problem.
  - Deterministic (fixed order, no timestamps): two builds give identical bytes, tested by hash.
- **Numbers:** 24 investigations, 16,376 files (22 tables + 16,354 data files), 352
  publications, 86 people.
- **Commit:** `4ef0e3b`.

### DOB-66: catalog routes

- **Asked:** `GET /catalog/investigations` and `/catalog/investigations/{psi_id}`.
- **Built:** `apps/api/app/catalog.py`. The answers equal the web lane's generated fixtures
  (`apps/web/fixtures/api/v1/catalog/`) field for field, for all 24; a test enforces it. Extras:
  optional filters with facet counts, and `/files`, a paged file list with PSI download links.
- **Decisions:** loaded into memory at start; missing database means the app still starts,
  health says "missing", catalog routes answer 503 with the build command; `PSI-69`, `psi-69`
  and `69` all work.
- **Caught by the fixture test:** the first build filled the empty acronym of the 5 ground
  investigations from the curation file. PSI's own empty value is the honest one; fixed.
- **Commit:** `4ef0e3b`.

### DOB-67: every table row (`pipeline/catalog/tables.py`)

- **Asked:** every row of the 22 experimental tables, once, traceable to its file and row.
- **Built:** `read_table()` keeps each row's original cells (in the table's column order), its
  file and row number (1 = first row under the header). 2,009 rows.
- **Traps handled** (`docs/PSI_VERIFICATION_REPORT.md`): FLEX is Windows-1252 (read as UTF-8
  the build stops with a clear error, tested); CFI-G Inverse has 861 trailing empty lines;
  repeated or blank headers get unique names; Saffire note rows are kept and flagged `note`.
- **Commit:** `e8f3c05`.

### DOB-69: shared columns

- **Asked:** fuel, oxygen, pressure, airflow, outcome in one unit each, the original kept.
- **Built:** one adapter per table naming which column means what, in which unit. Oxygen as a
  mole fraction, pressure in kPa, flow in cm/s. Exact constants: 760 mmHg = 1 atm = 101.325 kPa,
  1 bar = 100 kPa, 1 psi = 6.894757 kPa. Each value keeps `original` = {text, unit, column}.
- **Decisions and why:**
  - Non-numbers stay empty with a flag; `~ 21.5` becomes 21.5 flagged approximate.
  - FLEX test 114 states 0 mmHg: kept, flagged `suspect_pressure`, not corrected.
  - FLEX's `CO` header is read as CO2 (subscripts lost), flagged `co_header_assumed_co2`.
  - Inverse flames burn in a fuel atmosphere: their XO2 is the burner stream, left out of oxygen.
  - ACME BRE writes "3400%": left empty, flagged out of range (a test caught it), not guessed as 34%.
  - `comparable` = the row states both oxygen and pressure.
- **Checked against the report:** FLEX 274 rows, outcomes 186 Extinction / 61 Disruption / 27
  Completion, fuels 157 methanol / 117 heptane, 2,009 rows over 22 tables.
- **Commit:** `e8f3c05`.

### DOB-72: tests query

- **Asked:** `GET /catalog/tests` with filters, paging and facet counts.
- **Built:** filters (repeatable, "any of"): `psi_id`, `fuel`, `fuel_phase`, `outcome`,
  `diluent`, `test_id`; ranges for oxygen, pressure, flow; `comparable`, `notes`, `air`;
  `include=raw,evidence,points`. Facets counted without their own filter; `excluded` says how
  many rows a range dropped because the source states no value. `/catalog/tests/{test_id}`
  gives one test with its raw row and engine evidence.
- **Decisions:** fixed order so pages never overlap; limit 1 to 500; bad parameters give 422;
  no SQL at request time (an injection-shaped value returns 0 rows, tested); the 8 note rows are
  hidden unless `notes=true` (2,001 tests + 8 notes).
- **Commits:** `e8f3c05`, `04cfccb` (the `test_id` filter the web lane asked for).

### DOB-83: cabin air (`apps/api/app/air.py`)

- **Asked:** `/air/presets` and `/air/coverage`.
- **Built:** five presets, each with its source: station 21% at 14.7 psi, 26.5% at 10.2 psi and
  34% at 8.2 psi (all three named in PSI-20's own record as NASA-considered atmospheres),
  exploration 30%+ at 10.2 psi or less (the challenge text, used exactly), high oxygen 40%+.
  Coverage per fire stage and investigation: `tested`, `never_tested` (stated, never inside) or
  `not_stated` (no table gives the values).
- **Decided by Flavius:** tolerance ±1 point of oxygen and ±5% of pressure (strict would give 34
  FLEX tests in station air, loose 56; this gives 49, the number the site already showed), and
  the five presets.
- **Results:** station 49 of 274 FLEX tests; exploration: no suppression test ever, 20 CFI-G
  gas flames; the two PSI-20 atmospheres never tested.
- **Commit:** `93b9091`.

### DOB-73: ranking (`apps/api/app/rank.py`)

- **Asked:** rank the 24 investigations for a chosen air, with a reason.
- **Built** (by a second agent at Flavius's request): score = sum of weight × part, each part
  0 to 1 with a sentence: pillar (named by the challenge 1, by our tagging 0.5), evidence
  (share of tests inside the air), data (0.5 table + 0.5 files), fuel (solid 1, liquid or gas
  0.5, aerosol 0). Default weights 0.25 each, adjustable.
- **Known weakness:** with default weights the top 5 do not change with the air (their tables
  state no pressure). The weights are a team decision.
- **Commit:** `807611f`.

### DOB-75: compare two to four investigations (`Catalog.compare` in `apps/api/app/catalog.py`)

- **Asked:** `GET /catalog/compare?ids=` and a Compare page with aligned rows. The challenge
  lists "similarities and differences between investigations". Done when FLEX (PSI-69) and
  FLEX-2 (PSI-68) show both columns from the database, on a link that can be shared.
- **Built:** the route only. 17 rows, one cell per ID in the order asked. A `null` value is
  "not stated". `same` is true only when every cell matches (the citation is ignored), and two
  unstated cells never count as the same. 2 to 4 different IDs, or 422; an unknown ID gives 404.
- **Decisions:** ranges are min/max over that investigation's own rows, never merged. A value
  flagged suspect is named under `excluded` and kept out of the range (FLEX test 114, 0 mmHg). A
  flag that changes meaning is counted under `caveats` (`oxygen_is_burner_stream` for the gas jet
  tables). A range or list as PSI wrote it goes under `as_written` and is never turned into numbers.
- **Results:** FLEX oxygen 0.12 to 0.34 (274 rows), pressure 70.2 to 309.3 kPa (273 rows),
  no airflow stated; inert gas N2+CO2 123, N2 101, N2+He 50. FLEX-2 has 8 rows, one per fuel
  sample, and every condition is a planned list ("0.17; 0.21;0.25; 0.3", "0.5 ... 3.0 atm"),
  so all its tested ranges are "not stated". Same for both: pillar, stage, liquid fuel, ISS.
- **Not done:** the page. `apps/web` belongs to Alex F.'s redesign; he places it there.
- **Commit:** `68d2ec5` (PR #67, landed from the server: the gate's shell parse check fails on
  Windows paths).

## Web lane, taken over

### DOB-87: Suppress page main view (`apps/web/components/suppress/`)

- **Asked:** the main view of the Suppress page ("What puts it out?") over the flame
  temperature engine's files.
- **Part 1, real data** (`fd5d75a`): the finding (no diluted droplet test above 25% oxygen in
  PSI's per-test tables); a plot of all 274 FLEX tests, oxygen against how each ended, colour
  and shape by added gas, with the 30 to 34% band; the highest oxygen per gas (nitrogen only
  34%, CO2 25%, helium 24%); the counts as a table; "next test to fly", 232 conditions ranked by
  distance to the nearest real test; the evidence table kept below.
- **Part 2, model** (`ca0d788`): sliders (fuel, oxygen, added gas and share, pressure, droplet
  size) over the engine's 13,152 grid positions: computed flame temperature, predicted share
  burned ±12.7 points with the 7.1-point noise floor (both read from the engine's files), the 5
  nearest real tests. No prediction where no test is near (3,099 positions), for helium (model
  fails), or for impossible mixtures.
- **Caught by Alex's tests:** the first version replaced the evidence table (742 computed
  numbers lost their badges); fixed by showing it under the bench.
- **Checked:** 18 unit and 3 browser tests of its own; all 138 unit and 26 browser tests pass.
- **Landed** at Flavius's request before the web lane's formal OK; Alex confirmed afterwards.

## Hosting (for DOB-71)

- **Built:** `apps/api/deploy/`: a systemd service runs the API on port 8000 from a separate
  clean copy (`/opt/burnrate-api`, with its own Python) on the team server, restarts by itself,
  and a timer follows `origin/main` every 5 minutes.
- **First install failed, and why:** the server runs SELinux in enforcing mode, which does not let
  systemd start programs stored in a home folder ("Permission denied" on
  `~/burnrate-api/.venv/bin/uvicorn`). Fix: install under `/opt` with Python inside it, restore
  the system labels, and start through system interpreters. SELinux stays on.
- **Install (one time, by a human, from a laptop):**
  `ssh nasa "git -C ~/burnrate-api pull -q && bash ~/burnrate-api/apps/api/deploy/setup.sh"`
  (`~/burnrate-api` is only used to fetch the script; the service runs from `/opt/burnrate-api`.)
- **Also needed:** TCP 8000 open in the Oracle Cloud security list (console access).
- **Status at 22:00:** not live yet; neither step is done.

## What the data cannot tell

- No PSI test was run in Moon or Mars gravity.
- No suppression test (FLEX) was run in the exploration atmosphere; FLEX's 30 to 34% oxygen
  tests are all nitrogen-only.
- BASS and BASS-II have no spread-rate or outcome column; BASS-II airflow is a fan setting.
- SAME, SAME-R and DAFT are smoke and dust tests, with no oxygen or pressure stated.
- Droplet results do not transfer to solid cabin materials.
- The catalog copies PSI's metadata; it does not open the large data files.
