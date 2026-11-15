---
name: psi-api
description: How to access NASA's Physical Sciences Informatics (PSI) repository API (psi.nasa.gov) to list investigations, read metadata and download data files. Use for any task touching PSI data, PSI-N IDs (e.g. PSI-69), the "Flame in Freefall" Space Apps challenge, combustion datasets (FLEX, ACME, BASS, Saffire, SAME-R), or building the dashboard/data pipeline on top of them.
---

# NASA PSI API (Flame in Freefall)

The PSI web UI (`https://psi.nasa.gov/physci/repo`) is a JavaScript app; scraping its HTML gives nothing.
Behind it is a **public JSON API: no key, no login, but undocumented by NASA**. Everything below
was checked against the live API on **2026-11-12** unless marked otherwise.

Official context (the 24 investigations and their fire-safety pillars): `docs/01-psi-data-repository.md`.
Measured file contents and pitfalls: `docs/PSI_VERIFICATION_REPORT.md`.

Helper script (stdlib only, caches everything): `.claude/skills/psi-api/psi_client.py`.
Prefer it over writing new request code.

## Rules for every session

1. **Check the cache first.** The team's tier 1 data is already in `data/raw/` (git-ignored; if you lack it,
   get it with `tools/get.sh`): metadata in `data/raw/json/`, experimental tables in `data/raw/tables/`, other
   files in `data/raw/files/<PSI-id>/` (override the root with the `PSI_DATA_DIR` env var). The helper skips a
   file that is already there with the size PSI reports. Never re-download what's already there.
2. **Stay small.** The useful data for this project is ~0.1–0.6 GB. Never pull ZIPs or video
   without the user explicitly asking and setting a size cap. Always run `files` first and check sizes.
3. **Use `experimentalTable` + `added`, never `removed`** (removed = retracted files).
4. **`totalFileSize` lies about what is downloadable.** FLEX registers 923.8 GB but exposes one 24.8 KB CSV.
5. **Don't store presigned S3 URLs**; they expire. Always re-request them.
6. If the network from your shell is blocked (sandboxed sessions), say so and ask the user to run
   the command locally; don't try workarounds.

## Endpoints

Base: `https://psi.nasa.gov/geode-py/ws`

| Purpose | Route | Status |
|---|---|---|
| List all investigations | `GET /repo/search?source=psi&type=investigation&size=200&from=0` | verified (133 hits, ~1 MB) |
| Keyword search | same + `&term=<text>` (e.g. `term=%22Combustion%20Science%22`) | verified |
| One investigation (metadata + file lists) | `GET /repo/investigations/PSI-<n>` | verified |
| Download link for a file | `GET /studies/PSI-<n>/download?file=<url-encoded file_name>&redirect=false` | verified: returns a presigned S3 URL as plain text |
| Direct download | same without `&redirect=false` | 302 redirect to S3; use `curl -L` |
| Thumbnail | `GET /investigations/PSI-<n>/image` | seen in search results, not tested |

File names contain spaces; URL-encode them (`%20`). Files live in S3 bucket `psi-repo-prod` under
`psi-data/PSI-<n>/<category>/<file_name>` (the public `s3://nasa-psi` bucket and OSDR do **not**
contain this combustion data).

```bash
curl -s "$BASE/repo/investigations/PSI-69" -o PSI-69.json
jq -r '.experimentalTable[], .added[] | [.file_size, .subcategory, .file_name] | @tsv' PSI-69.json
url=$(curl -s "$BASE/studies/PSI-69/download?file=PSI-69_Experimental%20table_FLEX.csv&redirect=false")
curl -L -o FLEX.csv "$url"
```

## JSON shapes

**Search** → `hits.total` (133) and `hits.hits[]._source` with **Title-Case keys containing spaces**:
`"Accession"` (the PSI id, e.g. `"PSI-69"`; `_id` is an Elasticsearch id, not the PSI id), `"Acronym"`,
`"Title"`, `"Research Area"`, `"SubResearch Area"`, `"Keywords"`, `"Project Type"`, `"Flight Platform"`,
`"Related Investigations"`, `"Objectives"`, `"Approach"`, `"Publication Title"`.
Filter locally on `"Research Area" == "Combustion Science"` → 24 investigations.

**Detail** → **camelCase keys**: `accession`, `investigationAcronym`, `title`, `researchArea`,
`subResearchArea`, `objective`, `approach`, `hypothesis`, `description`, `experimentHardware`,
`publications`, `totalFileSize` (bytes, float), `licenseIdentifier` (e.g. `CC0-1.0`),
`experimentalTable[]`, `added[]`, `removed[]`.

Each file object: `file_name`, `file_size` (bytes; may be int or string, so cast with `float()`),
`subcategory` (path like `Reduced Gravity/Fernandez-Pello/P21`, useful for linking files to tests),
`s3_path`, `remote_url`, `visible`, `restricted`, `version`.

## Helper script usage

```bash
S=.claude/skills/psi-api/psi_client.py
python3 $S list --area "Combustion Science"          # 24 rows: id, acronym, sub-area, title
python3 $S files PSI-25                              # every current file with size + subcategory
python3 $S get PSI-69 "PSI-69_Experimental table_FLEX.csv"
python3 $S tables                                    # all Experimental tables, Combustion Science (~0.2 MB)
python3 $S pull PSI-101 --contains HKPData --ext .csv --cap-mb 50
python3 $S pull PSI-100 --ext .csv,.xlsx --cap-mb 100
python3 $S pull PSI-25 --ext .mp4 --exclude 2ND_VIEW,Still_Sequence --cap-mb 5000   # only if asked
```

`list` and `files` read the saved JSON; add `--refresh` to ask the API again. `pull` takes the smallest files
first and stops at `--cap-mb` (default 100). A failed file is reported as `FAILED` and the exit code is 1.
The helper was checked on 2026-11-14 against the saved records and a local stand-in for the API, not yet
against the live API: run `get PSI-69 "PSI-69_Experimental table_FLEX.csv"` in an empty `PSI_DATA_DIR` once to confirm.

In Python: `from psi_client import list_investigations, get_investigation, list_files, download, pull`
(add the skill folder to `sys.path`).

## The 24 Combustion Science IDs

PSI-10, 20, 21, 22, 23, 25, 26, 39, 47, 60, 62, 68, 69, 98, 99, 100, 101, 102, 106, 107, 115, 117, 142, 159.

## What to download (tier 1 ≈ 0.12–0.15 GB)

| ID | Name | Take | Notes |
|---|---|---|---|
| all 24 | metadata | detail JSON (~10–15 MB total) | feeds the dashboard explorer |
| all | Experimental tables | `experimentalTable` files (22 tables, 211 KB total) | |
| PSI-69 | FLEX | `PSI-69_Experimental table_FLEX.csv` (24,776 B) | **best ML table**: 274 droplet tests, 15 columns, pressure in mmHg, outcome Extinction 186 / Disruption 61 / Completion 27 |
| PSI-10 / PSI-159 | ACME Flame Design / CFI-G | experimental tables | extinction maps in O2–pressure space; dirty values |
| PSI-25 | BASS-II | `PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx`, `PSI-25_Reference Data_Fan calibration data.xlsx` | ~129 tests, **no spread-rate column** |
| PSI-26 | BASS | `..._As Run_Test Matrix.xlsx`, `..._Planned_Test Matrix.xlsx` | |
| PSI-100 | Saffire-III | 2 CSV + 6 XLSX telemetry (~80 MB) | only 2 burned samples; visualisation, not supervised ML |
| PSI-101 | SAME-R | 44 × `PSI-101_Raw Data_HKPData_gmt###_n.csv` (27.7 MB) | smoke detection |

Tier 2 (still tabular, total < 0.7 GB): SAME-R `.xls` results (~0.48 GB, need `xlrd`), PSI-117 cool-flame CFD CSVs,
small SPICE sheets (PSI-107). **Skip**: ZIP image archives and raw video of PSI-10, 159, 25, 26, 39, 23;
PSI-60, 62 (metadata ZIP only); PSI-115 (`.dat` grids);
the 2 of 4 PSI-98 Saffire-I spreadsheets that return 404. **Do not skip PSI-47 (DAFT / DAFT-2):** it measured dust,
not flames, but with the SAME smoke instrument, so the challenge counts it under detection; keep its metadata and table. **SoFIE is not in PSI**; IDs like `PSI-SOFIE-GEL-412` are invented.

## Data traps

- Tables can't be concatenated across investigations: units differ (mole fraction vs %, atm vs mmHg vs psi),
  missing values appear as blank, `-`, `n/a`, `OR`, `-999`, `RAMP`, `LOW O2`, `#DIV/0!`. Parse per table.
- FLEX: 15 columns, pressure in mmHg, Windows-1252 encoded (read with `encoding="cp1252"`). The `CO` header is
  very likely CO2 (the subscripts were lost), but the file does not say.
- Empty cell ≠ "no" (e.g. CFI-G `Cool flame?` is blank in most rows).
- PSI sub-area labels mislead (FLEX = "Spacecraft Fire Safety", Saffire-II = "Surface Combustion");
  build your own fire-safety filter.
- **No partial-gravity (Moon/Mars) data exists in PSI.** Flag the gap; never extrapolate to 1/6 g.
- Small data (tens–hundreds of tests): regularised regression, gradient boosting, Gaussian processes,
  with **grouped** CV (by test day / sample / test, never by frame or row). No deep learning from scratch.
- PSI data is CC0 on the records checked. The Team AFAQ GitHub repo has no licence, so use it as a reference only.
