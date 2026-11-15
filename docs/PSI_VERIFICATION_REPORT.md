# PSI data verification report: Flame in Freefall

**Date:** 2026-11-12. **Checked against:** the live NASA PSI API (`psi.nasa.gov/geode-py/ws`).
**Subject:** an early team research note on the PSI data ("the note" below). The note was removed from `docs/` on 2026-11-14, when the official challenge resources (`docs/00-challenge-description.md` to `docs/10-spinoff-fire-attire.md`) replaced it; it is still in git history.

Every number below was measured directly from NASA's API or from files downloaded from it, unless a row says otherwise.
No other team's code or data was used.

## TL;DR

- The note is **accurate about the API and the metadata.** Every ID, total size, file count and file size it claims to have checked matches.
- **The download route the note could not test works.** It answers with a 302 redirect to a temporary signed Amazon S3 link (valid about 1 hour), and all 68 files we fetched match their API sizes to the byte.
- The **second-hand claims about file contents** are mostly right, with three important corrections:
  - SAME-R telemetry has **68,699 rows, not 6.25 M**, and covers only **45 of the 108 tests**.
  - **Saffire-II's table contains flame-spread rates**, which the note missed. It is the only tabulated solid-fuel spread data.
  - **2 of the 4** Saffire-I spreadsheets return 404, not all 4.
- The FLEX table question is settled: **274 rows, 15 columns, pressure in mmHg**, and the outcome column is Extinction 186 / Disruption 61 / Completion 27.
- Tier 1 really is small: **98 MB** for all the useful tabular data, plus 21 MB of metadata JSON.

## 1. How the API works

No key or login is needed. NASA doesn't document this API, so it could change without notice.

| What it does | Endpoint | Returns |
|---|---|---|
| List all investigations | `GET /repo/search?source=psi&type=investigation&size=200&from=0` | JSON: `hits.total`, `hits.hits[]._source` (Accession, Acronym, Research Area, SubResearch Area, ...) |
| Search by term | add `&term=<text>` | Same shape |
| One investigation | `GET /repo/investigations/PSI-<n>` | JSON with `added[]` (current files), `removed[]` (retired files), `experimentalTable[]`, `totalFileSize`, licence, objectives, publications, ... |
| Download one file | `GET /studies/PSI-<n>/download?file=<url-encoded file_name>` | **302** → `https://psi-repo-prod.s3.amazonaws.com/...` signed link, **expires after 1 hour** |
| Get the signed link only | add `&redirect=false` | 200, body is the S3 link as plain text (the response is mislabelled `text/html`) |

Practical notes:

- `curl -L` and Python `requests` / `urllib` follow the redirect automatically.
- Signed links expire after an hour, so **request a fresh one per file.** Never store them: they embed temporary AWS credentials.
- Each file record has `file_name`, `file_size`, `subcategory` (e.g. `Reduced Gravity/ Bhattacharjee/B1`, present on 685 of 694 BASS-II files), `s3_path`, `remote_url` and `psi_legacy`.
- **Read files from `added` only.** `removed` lists retired files; PSI-23 alone has 6,814 of them.
- Experimental tables are listed in `experimentalTable`. For PSI-20, PSI-21 and PSI-106, the same table also appears in `added`.
- Speed in practice: detail JSONs take 0.8–11 s each (PSI-23's is 8.1 MB). Downloads were not rate-limited at one request every 1–2 s.

## 2. Claims vs findings

Status: **confirmed**, **wrong**, **partly** (partly right), or **could not check**.

### API and metadata

| Claim | Note says | Found | Status |
|---|---|---|---|
| Total investigations | 133 | 133 | confirmed |
| Combustion Science | 24: PSI-10, 20, 21, 22, 23, 25, 26, 39, 47, 60, 62, 68, 69, 98, 99, 100, 101, 102, 106, 107, 115, 117, 142, 159 | Same 24 (filtering locally and searching by term both give 24) | confirmed |
| Download route | Untested | Works: 302 → S3 → 200, byte-exact | confirmed |
| `redirect=false` | Returns the signed link as text | Yes | confirmed |
| Experimental tables | 22 tables, 211 KB | 22 tables, 211,116 B | confirmed |
| FLEX (PSI-69) | 923.83 GB, `added` empty, table 24,776 B | Same | confirmed |
| Saffire-II (PSI-99) | 16.93 GB, `added` empty, table 1,973 B | Same | confirmed |
| FLEX-2, BRE, CLD, E-FIELD, SLICE | Only the table is downloadable | FLEX-2 and E-FIELD have empty `added`; BRE, CLD and SLICE list only a copy of their table | confirmed |
| `totalFileSize` | PSI-10 2180.4, PSI-159 2085.6, PSI-25 274.63, PSI-26 163.55, PSI-100 35.21, PSI-101 6.31 GB | Same | confirmed |
| CFI, s-Flame | About 719 and 782 GB | 718.89 and 782.17 GB | confirmed |
| Grand total | 13,496.77 GB, 16,354 files | 13,496.77 GB, 16,354 entries in `added` | confirmed |
| PSI-10 biggest archive | 32.9 GB | `PSI-10_Raw Data_21301J4_ACME_Converted.zip`, 32.91 GB | confirmed |
| Saffire-III | 85 files; telemetry is 6.9 MB CSV + 73.5 MB XLSX | 85 files; 6.89 MB + 73.46 MB | confirmed |
| SAME-R HKPData | 44 CSVs, 27,682,319 B | Same | confirmed |
| SAME-R analysed `.xls` | 77 files, about 0.48 GB | 77 files, 0.475 GB | confirmed |
| BASS-II MP4s | 296 files, 17.7 GB | 296 files, 17.71 GB | confirmed |
| BASS MP4s | 114, named by day, not by test | 114, named by date/time plus an ISS photo ID; median size 209 MB | confirmed |
| ACME `_data.csv` | About 1.25 + 1.47 GB; 1.9–17 MB each | 317 files (1.25 GB) + 338 files (1.46 GB); PSI-10 files reach 41 MB | partly |
| PSI-117 cool-flame data | 9 CSV + XLSX, about 0.07 GB | Files exist, but the data is **about 0.28 MB**; the 0.07 GB is PDFs | wrong (cheaper) |
| PSI-60, PSI-62 | Metadata ZIP only | Yes | confirmed |
| PSI-115 | `.dat` simulation grids | 44 `.dat` files, 2 PDFs, 1 ZIP | confirmed |
| Saffire-I XLSX | All return 404 | **2 of 4 return 404** ("Good Process Version", "Sample 1 Sensor Data"); "Sample 2 Sensor Data" and "MergeResult-jpeg" download | partly |
| SoFIE | One search hit, BASS-II | 1 hit: PSI-25 | confirmed |
| Sub-labels | FLEX and FLEX-2 = "Spacecraft Fire Safety"; Saffire-II = "Surface Combustion" | Same | confirmed |
| Licence | CC0 | CC0-1.0 on 23 of 24; **PSI-10's licence field is empty** | partly |

### File contents (all second-hand in the note)

| Claim | Note says | Found | Status |
|---|---|---|---|
| FLEX rows | 274 | 274 | confirmed |
| FLEX columns and pressure unit | 15 or 16; atm or mmHg | **15 columns; mmHg** | settled |
| FLEX outcome | Extinction / Disruption / Completion | 186 / 61 / 27 | confirmed |
| FLEX "CO" = CO₂ | Claimed | Header literally reads `CO`, but `O` and `N` also lost their subscripts and values reach 0.70, so CO₂ is very likely. The file doesn't say. | could not check |
| FLEX burning-rate unit | Ambiguous `mm` | Ambiguous; values 0.05–1.06 (consistent with mm²/s) | confirmed |
| BASS-II matrix | About 129 tests: material, flow, O₂/CO₂/CO; no spread rate | 129 tests across 6 PI sheets, 16 columns; no spread rate or extinction column | confirmed |
| BASS / BASS-II tables have no spread or outcome column | Claimed | Confirmed. BASS's table has only 6 columns. | confirmed |
| ACME Flame Design rows | 207 / 120 | 207 / 120 | confirmed |
| CFI-G rows | 179 / 154 | 179 / 154 | confirmed |
| Messy values | `RAMP`, `LOW O2`, `#DIV/0!`, ... | Present, plus `-`, `none`, `OR`, `n/a`, `#VALUE!` | confirmed |
| CFI-G `Cool flame?` blank | 171 of 179 | 171 of 179 | confirmed |
| Saffire-III telemetry | 47 columns; exports of 3,972 / 11,449 / 73,462 rows | CSVs have **47 columns**, 3,972 and 11,450 data rows. No export with 73,462 rows found; the Cygnus sheets have 58,305. | partly |
| Saffire-III: two samples burned | Claimed | Two samples, both SIBAL fabric, 30 cm/s. **Only S1 (concurrent flow) clearly burned:** sample thermocouples peak at 1,088 °C. S2 (opposed flow) shows no sample-temperature rise and plume temperatures only reach 48 °C. | partly |
| SAME-R rows after parsing | About 6.25 M | **68,699 rows × 98 columns** (about 6.7 M cells) | wrong |
| SAME-R: 44 runs of telemetry | 44 runs | 44 files covering **45 test numbers (58–108)** of the 108 in the table; 63 tests have no telemetry | wrong |
| Other teams' ML results, mirror site, large-request email process, `s3://nasa-psi` | Second-hand | Out of scope (NASA sources only) | could not check |

## 3. What the downloaded files contain

Everything is under `data/raw/` (git-ignored):

- `data/raw/json/`: the search result and 24 detail JSONs, 21 MB.
- `data/raw/tables/`: 22 experimental tables, 268 KB.
- `data/raw/files/PSI-<n>/`: 68 tier 1 files, 98 MB.

| Data set | Shape | Useful for |
|---|---|---|
| **FLEX** table (PSI-69) | 274 droplet tests × 15 columns. Methanol 157, heptane 117; 80 test days. Columns: O₂/N₂/CO₂/He mole fractions, pressure in mmHg, initial and extinction diameter, burning rate, burn time, outcome. | **Best labelled set**: extinction/suppression model with CO₂ and He diluents |
| **ACME Flame Design** (PSI-10) | 207 normal + 120 inverse flames. Normal flames: ethylene 187, propane 20; inverse flames: ethylene. PSI's objective text names ethylene and methane, but the tables hold no methane test. X_O2, pressure in atm, Z_st, T_ad. | Extinction map in O₂–pressure space |
| **ACME CFI-G** (PSI-159) | 179 normal + 154 inverse flames. Self-extinguished vs. flow-terminated label (SE/FT); burn time; hot-ignition flag. | Second labelled set |
| **SPICE** table (PSI-107) | 469 tests × 9 columns: fuel, nozzle, fuel and air rates. Plus `SmokePointReview-0g-3.xlsx` (117 rows × 66 columns: smoke-point length, Re, T_ad, residence times) and a 12-test flame-length sheet. | **Smoke-point / soot**: supporting fundamentals in the official pillar mapping (`docs/01-psi-data-repository.md`); the note doesn't mention it |
| **Saffire-II** table (PSI-99) | 9 test rows plus notes. Material, O₂, flow, and **microgravity and 1 g burn length and spread rate** (e.g. 1.2, 2.1 and 2.6 mm/s; "Acceleratory"). | **Only tabulated solid-fuel spread rates** |
| **Saffire-I** table (PSI-98) | 2 samples (SIBAL, 20 cm/s); burn time 420 s (concurrent) vs. 70 s (opposed) | Comparing concurrent and opposed flow |
| **Saffire-III** (PSI-100) | `Sample 1/2 Sensors.xlsx`: about 30 Hz, 65 columns with a units row (O₂ %, CO₂ %, pressure in psia, 4 radiometers, 6 plume and 6 sample thermocouples, anemometers, igniter). S1: 690 s; S2: 160 s. 1 Hz telemetry: 47–50 columns. Cygnus cabin sheets: 58k rows (smoke-detector obscuration and scatter, cabin pressure). | Fire-timeline panel; smoke-detector response to a real fire |
| **SAME-R** (PSI-101) | 44 CSVs at 1 Hz, 98 columns: ISS smoke-detector obscuration and scatter, ion detectors, P-Trak, DustTrak, plume temperature, flows. Table: 108 tests over Kapton 29, Silicone 22, Lampwick 20, Pyrell 20, Teflon 18. | Detector response by material |
| **BASS** matrices (PSI-26) | As-run: 131 rows × 30 columns, including **ISS O₂ fraction (0.159–0.227), pressure (0.97–1.01 atm) and CO₂** for 123 tests; 33 materials; free-text comments ("extinguished", "spread", "blow-off"). Planned matrix: 64 rows. | Test conditions; outcomes only as text |
| **BASS-II** matrix (PSI-25) | 129 tests across 6 PI sheets: material, restrictor, fan/air display, O₂/CO₂/CO before and after. Separate fan calibration sheet. | Test conditions; no spread target |
| **PSI-117** | 9 small CSVs: cool-flame extinction diameter vs. pressure, burning constant K, oscillatory and three-stage cool-flame histories, each with model and experiment | Cheap, clean validation curves |
| **PSI-142** | Princeton summary workbook, 8 data sets: cool and hot diffusion-flame extinction limits, ozone PLIF and temperature profiles | Cheap extinction-limit curves |

## 4. Pitfalls in the files (each costs time if found late)

1. **FLEX is Windows-1252 encoded**, so reading it as UTF-8 fails (byte `0x96`). Read it with `encoding="cp1252"`.
2. **FLEX test 114 has a pressure of 0 mmHg**, almost certainly a data-entry error. Missing values in FLEX are plain blanks (78 cells, mostly extinction diameter).
3. **The CFI-G Inverse table has 861 empty lines at the end** (1,016 lines for 154 rows). Drop blank rows before counting.
4. **Text inside numeric columns:**
   - CFI-G uses `-` for missing.
   - ACME Flame Design writes `RAMP` in 342 + 51 cells.
   - BASS-II puts lists like `"89,62,50,41"` in its fan and air columns, because flow was stepped during a test.
5. **Saffire-III telemetry uses placeholder values**, not blanks, when a sensor is off: radiometers read about −4002, igniters −7.378 V / −3.05 A, and the fan tachometer 77938. Telemetry rows also have negative and garbage relative times, e.g. −6.36e13 in the last rows. Filter on the timestamp before using it.
6. **SAME-R**: `HKPData_gmt251_4.csv` has a second header line at line 6. Each file holds 1–3 test numbers, plus test 0 (idle).
7. **Saffire-II headers lost the "µ"** (`?-g Burn Length`), and spread values are text (`~ 0`, `Complete`, `Note 4`, `n/a (Nomex)`), so they need hand-parsing.
8. **Units differ between investigations:** mole fraction vs. %, mmHg vs. atm vs. bar vs. psia. Never concatenate tables across investigations.
9. **PSI's sub-labels are not a fire-safety filter** (FLEX = "Spacecraft Fire Safety", Saffire-II = "Surface Combustion"). Build our own tagging.

## 5. Not checked

- **Large files**: SAME-R analysed `.xls` (0.48 GB), ACME per-test CSVs (2.7 GB), videos and ZIPs. These need explicit approval.
- **Saffire-III `MergeResult-jpeg`**: the frame list was downloaded but not profiled.
- **Anything sourced from other teams' repos or third-party mirrors**, e.g. their ML scores, the 73,462-row export, the HackAthlone mirror, and the large-request email process. These are out of scope because only NASA sources are allowed.

## 6. Recommendations

1. **Tier 1 is done and it is enough.** It amounts to 21 MB of JSON plus 98 MB of tables and telemetry. Base the dashboard's investigation explorer on the 24 JSONs.
2. **Predictive panel:** start with FLEX (classifier for Extinction / Disruption / Completion, regression for burning rate). ACME CFI-G (SE vs. FT) is a second option.
3. **Solid-fuel flammability:** use Saffire-II's spread rates and Saffire-I's burn times as data points. Treat the BASS/BASS-II conditions plus their free-text comments as qualitative evidence. Video-derived spread rates are optional and risky.
4. **Detection:** SAME-R (45 tests with telemetry) plus the Saffire-III Cygnus smoke-detector channels.
5. **Download script requirements:**
   - fetch one file at a time, with a fresh signed link per file;
   - skip a file when it already exists with the size the API reports;
   - write to `*.part` and rename at the end.
   The working version used here: `urllib.request.urlopen(f"{BASE}/studies/{id}/download?file={quote(name)}")`.
6. **Laptop safety:** XLSX files of 20 MB and up can take several GB of RAM when opened with `pandas.read_excel` or a normal `openpyxl` load. Stream them with `openpyxl.load_workbook(read_only=True)` instead; that peaked at 750 MB here. Alternatively, convert them once to CSV or Parquet.
