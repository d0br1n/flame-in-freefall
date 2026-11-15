# Engine API contract

How the web app reads the engines, and where engine code and output live. Linear DOB-58.
The file shapes are in `contracts/README.md`; the big picture is in `docs/ARCHITECTURE.md`.

## Where things live

| What | Where |
|---|---|
| Engine code (runs offline) | `pipeline/<engine>/`, for example `pipeline/flame_temperature/` |
| Engine output (committed) | `data/modules/<id>/`: `module.json`, `evidence.json`, `findings.json`, plus the files listed in `module.json` |
| The shapes and the validator | `contracts/` (`python3 contracts/validate.py`) |
| The backend | `apps/api/`: one read-only FastAPI app |
| Mock engine for page building | `data/modules/_mock/`, served only with `FIF_DEV=1` |

Engines do not ship a router. An engine is ready when its folder passes
`python3 contracts/validate.py data/modules/<id>`; the backend then serves it through the
routes below with no code change.

## Base URL

Local: `http://localhost:8000/api/v1`. Hosted: the live site forwards `/api/v1/*` to the backend (see [deploy.md](deploy.md)).
Interactive docs: `/docs`. Machine-readable: `/openapi.json`.

## Routes

All routes are `GET`, need no login, and return JSON unless stated.

| Route | Returns |
|---|---|
| `/api/v1/health` | `status`, the engine folders found, which are served and which are not built |
| `/api/v1/modules` | One row per engine folder: `id`, `status` (`built`, `example` or `not_built`), and for a valid folder `title`, `stage`, `question`, `evidence_count`, `findings_count`. A `not_built` row carries no numbers, only `problems` (how many contract errors) |
| `/api/v1/modules/{id}` | The engine's `module.json` |
| `/api/v1/modules/{id}/evidence` | Its evidence records. Optional filters: `?test_id=PSI-69/114`, `?quantity=extinction_diameter` |
| `/api/v1/modules/{id}/findings` | Its findings (headlines and checks) |
| `/api/v1/modules/{id}/files/{name}` | A file the engine lists in `module.json` (grid, image, clip, table), served as is. Nothing outside that list is served |

Errors: an unknown engine, an engine that is not built, or a file that is not listed answers
`404` with a `detail` sentence saying which and why. Records are served exactly as written in
the engine's files (optional fields that are absent stay absent).

## Behaviour the web app can rely on

- **One broken engine never takes the site down.** A folder with a missing file, broken JSON or
  a contract error is listed as `not_built`. Show it as "not built yet", never as an error page.
- **`status: example`** means placeholder values (the mock engine). Never present them as results.
- **Every evidence record and finding carries `provenance` and `source.psi_id`,** so every
  number on a page can show its badge and its PSI file.
- The backend reads the folders once at start-up. After an engine commits new output, restart it.

## Run it

```
uv venv -p 3.12 .venv && uv pip install --python .venv/bin/python -r apps/api/requirements.txt
.venv/bin/uvicorn --app-dir apps/api app.main:app --port 8000            # real engines only
FIF_DEV=1 .venv/bin/uvicorn --app-dir apps/api app.main:app --port 8000  # plus the mock engine
python3 -m unittest discover -s tests -t .                                # tests the gate runs (no install)
.venv/bin/python -m pytest apps/api/tests                                 # HTTP-level tests (need FastAPI)
```

The logic is in `apps/api/app/store.py` (standard library only, tested in `tests/api/`);
`apps/api/app/main.py` only maps it to routes.

Settings (environment): `FIF_DEV=1` serves the mock engine; `FIF_MODULES_DIR` points at
another modules folder; `FIF_CORS_ORIGINS` is a comma-separated list of web app origins
(default `http://localhost:3000`).

## Catalog routes (DOB-66)

The 24 PSI combustion investigations, from `data/build/catalog.sqlite` (built by
`python3 pipeline/catalog/build.py` from `data/raw/json/` and the curation file, DOB-60; the
database is committed, so the backend needs no raw data). The exact field list is the
agreement with the site in `apps/web/fixtures/README.md`; `tests/api/test_catalog.py` fails if
an answer and its fixture differ.

| Route | Returns |
|---|---|
| `/api/v1/catalog/investigations` | `{count, items}`: one summary row per investigation, in PSI order. Also `total`, `filters` and `facets` (counts per `pillar`, `stage`, `fuel_phase`, `hardware_group`, `psi_sub_area`, each counted without its own filter). Optional filters: `pillar`, `stage`, `fuel_phase`, `hardware_group`, `psi_sub_area` (a missing value is `none`), `has_table=true/false`, `q` (every word must appear) |
| `/api/v1/catalog/investigations/{psi_id}` | The summary plus PSI's own text, the curated tags each with its source, `cannot_tell`, conditions, licence, files by PSI folder, the experimental tables, publications, related PSI IDs and the engines whose `module.json` lists it. `PSI-69`, `psi-69` and `69` all work |
| `/api/v1/catalog/investigations/{psi_id}/files` | One page of PSI's file list with a public download link per file. Optional: `kind` (`experimental_table` or `data_file`), `category` (PSI folder, e.g. `Raw Data`), `q`, `limit` (1 to 500, default 100), `offset` |
| `/api/v1/catalog/compare?ids=PSI-69,PSI-68` | Two to four investigations side by side (DOB-75): `{ids, investigations, rows, not_stated, note}`. Each row `{key, label, unit?, same, cells}` has one cell per ID in the order asked; a cell's `value` is `null` when the source does not state it (print `not_stated`). Rows: pillar, stage, fuel phase, fuels, hardware, flight program, test rows, oxygen, pressure and airflow tested, diluents, outcomes, measurements, downloadable, publications, what it cannot tell. Ranges are `{min, max}` from that investigation's own table rows, never merged; a range cell also gives `rows_stated`, `rows_not_stated`, `excluded` (values flagged suspect, e.g. FLEX test 114 at 0 mmHg), `caveats` (flag counts that change the meaning, e.g. `oxygen_is_burner_stream`) and `as_written` (a range or list as PSI wrote it, e.g. FLEX-2's planned `0.17; 0.21;0.25; 0.3`). `same` is true only when every cell matches, ignoring its citation. `ids` may repeat or hold a comma list |

Errors: unknown PSI ID `404`, bad `kind`/`limit`/`offset` or not 2 to 4 different `ids` `422`, no catalog database `503`
(the sentence names the build command). `/api/v1/health` has a `catalog` block saying whether
the database loaded.

What the catalog cannot tell: it copies PSI's metadata and file lists, it does not open the
files. File sizes are what PSI lists; `listed_bytes` is PSI's own total, often far larger than
what PSI offers (FLEX lists 924 GB and offers its 25 KB table). The pillar, fuel phase and
hardware tags and the plain summaries are ours (SI-drafted, `summary_written_by`), each with its source.

## Tests routes (DOB-67, DOB-69, DOB-72)

Every data row of the 22 PSI experimental tables (2,009 rows, 2,001 tests plus 8 note lines),
built by `pipeline/catalog/tables.py`: one adapter per table says which columns state fuel,
oxygen, pressure, airflow, diluent and outcome. Shared units: oxygen as a mole fraction,
pressure in kPa (exact constants: 760 mmHg = 1 atm = 101.325 kPa, 1 bar = 100 kPa), flow in
cm/s. Each value keeps `original` `{text, unit, column}`. A cell that is not one number
(`RAMP`, `-`, `n/a`, a range, a list, `3400%`) stays `null` and is named in `flags`. Nothing
is guessed. Test IDs follow `docs/ARCHITECTURE.md` (a table with no test number: `PSI-107/#12`).

| Route | Returns |
|---|---|
| `/api/v1/catalog/tests` | `{total, limit, offset, items, facets, excluded}` plus `points` with `include=points` (all matching rows, not paged). `test_id` (repeatable, e.g. `PSI-69/114`) picks tests by ID; it is not applied to the facet counts. Filters (each may repeat or hold a comma list, "any of"): `psi_id`, `fuel`, `fuel_phase`, `outcome`, `diluent`; ranges `o2_min`/`o2_max` (0 to 1), `pressure_min`/`pressure_max` (kPa), `flow_min`/`flow_max` (cm/s); `comparable=true` (states both oxygen and pressure); `notes=true` (also the note lines); `limit` (1 to 500, default 50), `offset`; `include=raw,evidence,points`. Order, fixed for every query: PSI number, source file, row, with the inverse flames (flag `oxygen_is_burner_stream`) after every other row |
| `/api/v1/catalog/tests/{test_id}` | One test, e.g. `/catalog/tests/PSI-69/114`, with its `raw` row and every engine evidence record about it |

Row: `test_id`, `psi_id`, `acronym`, `table_name`, `test_number`, `fuel`, `fuel_phase`,
`o2_mole_fraction`, `pressure_kpa`, `flow_cm_s`, `diluent`, `outcome`, `comparable`,
`original`, `flags`, `source_file`, `source_row` (1 = first row under the header).
`facets` are counted without their own filter; `excluded` says how many rows each active range
filter dropped because the source states no value. Bad parameters answer `422`.

What the tests table cannot tell: inverse flames (Flame Design, CFI-G) burn in a fuel
atmosphere, so their burner XO2 is not ambient oxygen and is left out of the shared column.
BASS-II airflow is a fan display setting, not cm/s. FLEX test 114 states 0 mmHg (kept, flagged
`suspect_pressure`). FLEX's `CO` column is read as CO2 (flag `co_header_assumed_co2`): the file
does not say. Never pool numbers across investigations: units and methods differ.

## Cabin air routes (DOB-83)

| Route | Returns |
|---|---|
| `/api/v1/air/presets` | `{default, presets, custom, custom_plain}`; each preset: `id`, `label`, `plain`, `window` (`o2_min/max` mole fraction, `pressure_kpa_min/max`, `flow_cm_s_min/max`, `null` = no bound), `tolerance_plain`, `source`. `custom` = the slider ranges for a custom air `{o2_min, o2_max, o2_step, pressure_kpa_min, pressure_kpa_max, pressure_kpa_step}`; `custom_plain` says the sliders cover the range of the catalogued tests |
| `/api/v1/air/window?o2=<mole fraction>&pressure_kpa=<kPa>` | A custom air, shaped like a preset: `{id: "custom", label: "Custom air", plain, tolerance_plain, source, window, point: {o2_mole_fraction, pressure_kpa}}`; `plain` reads "21% oxygen at 101.4 kPa (14.7 psi)", `source` "Chosen by the visitor. Not a NASA atmosphere." |
| `/api/v1/air/coverage?air=<id>` | `{air, window, constrains, stages}`; `stages` has `spread`, `detect`, `suppress` and `other` (investigations with no fire stage), each `{status, inside, stated, investigations: [{psi_id, status, inside, stated}]}` |
| `/api/v1/air/coverage?o2=<x>&pressure_kpa=<y>` | The same for a custom air: `air` is `"custom"`, `window` is the one `/air/window` gives |

`/api/v1/catalog/tests?air=<id>` applies the same window (with explicit ranges, the tighter
bound wins); for a custom air, pass the `window` of `/air/window` as `o2_min`/`o2_max`/
`pressure_min`/`pressure_max`. An unknown `air` answers `422`.

**Custom air (sliders).** `o2` and `pressure_kpa` choose any point instead of a preset on
`/air/window`, `/air/coverage` and `/catalog/rank`. When both are given they win over `air`.
The window is built by the same function as the fixed presets, so it gets the same tolerance
(plus or minus 1 point of oxygen and 5% of the pressure): the point 0.21 at 14.7 psi gives
exactly the `station` window. A missing value (one of the two alone, or neither on
`/air/window`), a value that is not a number, or one outside `custom` answers `422` with a
`detail` sentence naming both ranges. Without a catalog database, `/air/presets` answers `503`
like the other catalog routes (the ranges come from the catalog).

How `custom` is derived (`apps/api/app/air.py`, `custom_ranges`): from the test rows coverage
counts (every row of the 22 tables, no note lines), the smallest and largest stated oxygen mole
fraction and pressure, rounded outward to the step (oxygen 0.005, pressure 0.5 kPa). Pressure
counts only values above 0 kPa, so FLEX test 114's published 0 mmHg (flagged
`suspect_pressure`) does not start the slider at zero; the minimum is at least one step. On the
committed catalog: oxygen 0.12 (FLEX, PSI-69) to 0.40 (ACME Flame Design, PSI-10), pressure
43 kPa (PSI-10) to 507 kPa (CFI, PSI-39). What a custom air cannot tell: a point inside the ranges is not a point PSI
tested; its coverage says how many tests ran within the tolerance of it, often none.

Presets and their sources: `station` 21% at 14.7 psi and `intermediate_26_5` 26.5% at 10.2 psi
and `exploration_34` 34% at 8.2 psi (all three named in PSI-20's own record as NASA-considered
atmospheres); `exploration` 30% or more at 10.2 psi or less (the challenge page, used exactly);
`high_oxygen` 40% or more (the ISS hardware envelope, a stress case). Tolerance for the fixed
atmospheres, a team decision of 14 November 2026: plus or minus 1 point of oxygen and 5% of the
pressure. `stated` counts tests that state every quantity the window bounds; `status` is
`tested`, `never_tested` (stated, none inside) or `not_stated` (no table states them).

## Ranking route (DOB-73)

| Route | Returns |
|---|---|
| `/api/v1/catalog/rank?air=<id>` | `{air, weights, weights_are_default, formula, items}`; each item `{rank, psi_id, acronym, pillar, stage, score, parts, reason}`, `parts` = `pillar`, `evidence` (also `inside`, `stated`), `data`, `fuel`, each `{score, reason}` |
| `/api/v1/catalog/rank?o2=<x>&pressure_kpa=<y>` | The same for a custom air (see Cabin air routes): `air` is `"custom"` and a `window` field (the one `/air/window` gives) follows it. A preset answer has no `window` and is unchanged |

`score = sum of weight x part`, each part from 0 to 1, all from the catalog:
`pillar` 1 if the challenge page names the investigation for its pillar, 0.5 if our curation
puts it in a fire-safety pillar, 0 otherwise; `evidence` the share of its tests inside the air,
out of the tests that state what the air bounds (0 when none state it, said in the reason);
`data` 0.5 for an experimental table plus 0.5 for downloadable files; `fuel` 1 solid, 0.5
liquid or gas, 0 aerosol. Ties keep PSI number order. Weights default to 0.25 each (a team
decision, Linear ALE-57); `w_pillar`, `w_evidence`, `w_data`, `w_fuel` change them (0 or more,
normalised, `weights_are_default` becomes false). Unknown `air` or all-zero or negative weights
answer `422`. `air` defaults to `station`.

What the ranking cannot tell: it orders how well PSI's data covers a question, not how
dangerous a material is. Investigations whose tables state no pressure (BASS, BASS-II, Saffire)
get 0 evidence for every air, whatever they burned.
