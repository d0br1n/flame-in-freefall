# Architecture: how burnrate fits together

Read this first. It is the one page that says how the parts of the product connect, which
folder each part lives in, and what each part hands to the next. If an older design file
disagrees with this page, this page wins. burnrate is our product; "Flame in Freefall" is the
name of the NASA Space Apps challenge it answers.

Source: the Linear project "Flame in Freefall: one product" (P-DOB-8), 14 November 2026.
The layout and the eight decisions below were approved by one team member on 14 November;
the owners of the two engines confirm them on Linear issue DOB-81 (see "Sign-off" at the end).
Last checked against the code on `main`: 14 November 2026, evening.

## What we build

One public web app, with no login, built on NASA's Physical Science Informatics (PSI)
combustion data. A visitor picks the air inside a spacecraft cabin and sees what NASA's 24
combustion investigations say about a fire in it: will it spread, what puts it
out. Every number is one click from the PSI test it came from, and the page says what was
never tested.

## Scope (changed on 14 November, revised the same evening)

- **Core, in this order:** foundations (contract, layout, backend), the shell and the catalog,
  the **video-to-data engine** on BASS-II (PSI-25) with its Video to Data page (route `/spread`) and the evidence panel,
  the **flame temperature engine** on FLEX (PSI-69, checked against PSI-10) with its Suppression
  test bench page (route `/suppress`), the home page, the submission.
- **Dropped:** the smoke detection engine and its Detect page (Linear milestone 4 and
  DOB-88/90/91/92/98/111 cancelled after the talk with a judge). Smoke detection is reached
  only through the catalog: the detection filter of the Investigations page (SAME-R, DAFT).
  The separate Detection page was removed on 15 November (DOB-121).
- **Assistant back in scope (14 November, late):** "Ask burnrate" (Claude API, server side,
  tools over the backend, citations checked against tool results) is built and deployed;
  Linear DOB-80. It was cut earlier the same day and restored when the web lane finished it.

There are two engines, spread and suppress; detection has no engine. The backend lists only
the engine folders that exist under `data/modules/`, so a dropped engine simply does not
appear. A folder that exists but fails the contract is listed as `not_built`, with no numbers.

## The parts

| Part | Fire stage | PSI data | Code | Hands over | State on `main` |
|---|---|---|---|---|---|
| Catalog | all | The 24 investigations and their 22 tables | `pipeline/catalog/` | `data/build/catalog.sqlite` | built: 24 investigations, 2,009 table rows |
| Engine: video to data | spread | PSI-25 (BASS-II) | `pipeline/video_to_data/` | `data/modules/video-to-data/` | `built` |
| Engine: flame temperature | suppress | PSI-69 (FLEX), checked against PSI-10, PSI-39, PSI-68 | `pipeline/flame_temperature/` | `data/modules/flame-temperature/` | `built` |
| Shared readers | | Tables used by more than one part | `pipeline/common/` | | |
| Contract | | | `contracts/` | Schemas, validator, mock engine | frozen |
| Backend | | | `apps/api/` | One read-only FastAPI app (routes: `docs/ENGINE_API_CONTRACT.md`) | built; hosting files in `apps/api/deploy/` |
| Web app | | | `apps/web/` | The site, on Vercel; it forwards `/api/v1/*` to the backend | being built |

The smoke detection engine (PSI-101 SAME-R, PSI-47 DAFT) was dropped; those investigations
are reached through the catalog and the tests table only.

Each part owns its own folder. Claim it with the swarm before editing (`CLAUDE.md`).

## How data flows

```
 Raw PSI files (data/raw/, not in git; from psi.nasa.gov)
        |
        +--> pipeline/catalog/ ----------------> data/build/catalog.sqlite (committed)
        |      (+ pipeline/catalog/curation/investigations.yaml: our tags and summaries)
        |
        +--> pipeline/video_to_data/ ----------> data/modules/video-to-data/
        +--> pipeline/flame_temperature/ ------> data/modules/flame-temperature/
                 (all run offline; shared table readers in pipeline/common/)
                                   |
                                   v
                 contracts/validate.py checks every engine folder
                                   |
                                   v
              apps/api/  (one read-only FastAPI app: the catalog, the tests table, the
                          cabin air, the ranking, and the same routes for every engine)
                                   |
                                   v
              apps/web/  (the site the visitor and the judges open; Vercel forwards
                          /api/v1/* to the backend on the team's server)
```

## The eight decisions that merge the parts

1. **Engines hand over files.** Each engine runs offline and commits its output under
   `data/modules/<id>/`. No engine ships a router. The backend serves every engine folder
   through the same routes.
2. **One contract.** Every engine folder holds `module.json`, `evidence.json` and
   `findings.json` in the shapes fixed in `contracts/`, checked by one validator. Other files
   (grids, images, clips, tables) are free and are listed in `module.json`.
3. **One test ID.** `<PSI ID>/<the table's own test number>`. The catalog and every evidence
   record use it, so a number on a pillar page and a row in the tests explorer are the same test.
4. **One cabin air.** One control (oxygen, pressure, airflow), defined once in the backend
   (`GET /api/v1/air/presets`, five presets, each with its source) and kept in the URL. Every
   page reads it, and the tests, coverage and ranking routes take the same `air` parameter.
5. **Never tested is an answer.** Where a pillar has no test in the chosen air, the page says
   so. It never hides the pillar and never extrapolates.
6. **Measured and computed look different.** Every number shows its provenance tag as a
   badge, the same everywhere.
7. **One reader per PSI table.** A table used by two parts is read by one shared function in
   `pipeline/common/`.
8. **No engine feeds another.** Solid sheets, smoke and liquid droplets are different
   experiments. They meet in the store and on the page, never in a calculation.

## The test ID rule

A test ID is the PSI investigation ID, a slash, and the test number exactly as the PSI table
writes it. Where an investigation repeats a test number, append `#<row>` to tell the rows
apart (row 1 = the first row under the header). A table with no test-number column uses
`#<row>` alone.

| Used by | PSI table | Example |
|---|---|---|
| Flame temperature engine | PSI-69 (FLEX), column "FLEX Test #" | `PSI-69/114` |
| Video to data engine | PSI-25 (BASS-II), column "Test #" | `PSI-25/B1` |
| Catalog, repeated number | PSI-39 (CFI), column "Flex Number" | `PSI-39/1285#23` and `PSI-39/1285#80` |
| Catalog, no test-number column | PSI-107 (SPICE) | `PSI-107/#12` |

`contracts/validate.py` checks the format on every evidence record; `pipeline/catalog/tables.py`
builds the catalog's IDs and stops the build if two rows would share one.

## The web app in five lines

- **Shell:** navigation, the cabin-air control and the assistant on every page.
- **Home:** one question card per engine (spread, suppress), each with one number and its test count, then the 24 investigations ranked for the chosen air (`GET /api/v1/catalog/rank`).
- **Pillar page:** one template for both engines (the question, the answer with one number, a main view, the evidence table, how we checked it, what it cannot tell). Only the main view differs per engine.
- **Evidence panel:** any number anywhere opens the same panel: value, unit, uncertainty, provenance badge, PSI file, published reference.
- **Catalog:** the investigations list, one page per investigation, the tests explorer.
- **Saved copy** (lands with the web lane's restyle): the site build carries a saved copy of the
  backend's answers (`apps/web/scripts/snapshot.mjs`) and shows it, marked "saved copy", if the
  backend does not answer.

## What we must not claim

- Anything about Moon or Mars gravity. PSI has no partial-gravity data.
- That droplet results apply to solids or to a cabin fire, or that video results describe a 34% oxygen cabin.
- Alarm times in a real cabin, or anything about smoke detection beyond the catalog.
- That any of this is a discovery. We reproduce and quantify known science on open data.
- Any number outside the tested ranges.

## Older design files

These stay valid for the detail of their own part, except where they disagree with this page:

- `docs/superpowers/specs/2026-11-14-dashboard-design.md` (on branch `alex/dashboard`).
  Where it differs: engines are folders of files, not routers (its section 5.6); the folders
  are `apps/api/`, `apps/web/` and `pipeline/catalog/`, not `backend/` and `web/` (section 9);
  the tracker is the Linear project P-DOB-8 (section 10).
- `research/idea-1-virtual-smoke-detector.md`
- `research/idea-2-video-to-data.md`
- `research/idea-3-flame-temperature-yardstick.md`

Issue descriptions written before the merge may still say `backend/`, `web/`, `engines/` or
`pipeline/` without a subfolder. The folders in the parts table win.

## Sign-off (Linear DOB-81)

The layout and the eight decisions above are confirmed by the owners of the parts they bind.
Each owner adds their name and the date, or writes on the swarm what to change.

| Part | Owner | Confirmed |
|---|---|---|
| Catalog, contract, backend | Flavius | yes, 14 November 2026 |
| Video to data engine | d0br1n | built and on `main` since 15 November 2026 (`data/modules/video-to-data/`) |
| Flame temperature engine | (whoever owns DOB-112/113) | built and on `main` since 15 November 2026 (`data/modules/flame-temperature/`) |
| Web app | Alex (web lane) | yes, 14 November 2026 (checked against `apps/web` on `main`) |

*Written with SI assistance (Claude Code) from the team's Linear project page; see
`submission/SI_USAGE.md`.*
