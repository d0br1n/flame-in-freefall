# Shapes the site reads from the backend

This folder is the agreement between the web app (`apps/web/`) and the backend (`apps/api/`).
`api/v1/` mirrors the route paths: the file for `GET /api/v1/catalog/investigations/PSI-25` is
`api/v1/catalog/investigations/PSI-25.json`. A query string becomes a suffix with the
parameters sorted: `/catalog/tests?psi_id=PSI-69&outcome=Extinction` is
`catalog/tests__outcome=Extinction&psi_id=PSI-69.json` (one function: `lib/paths.mjs`).

- The TypeScript types are in `apps/web/lib/types.ts`. If a shape here and a type there
  disagree, that is a bug: fix both in the same change.
- **Every route the site reads is now real** (`apps/api/`, FastAPI; `docs/ENGINE_API_CONTRACT.md`).
  The browser tests (`npm run test:e2e`) run on that real backend, never on the stub.
- `scripts/stub-api.mjs` serves these files on `http://127.0.0.1:8787/api/v1/...` only so the
  UI can be worked on without Python. It is never deployed and it is not the source of truth:
  where it and the real backend differ, the real backend wins.
- Backend owner: when a route lands, say so on the swarm. If you need another shape, say which
  field; the site has one adapter to change (`lib/api.ts` and `lib/types.ts`).
- All routes are `GET`, return JSON, and answer `404` with `{"detail": "<sentence>"}` for an
  unknown ID, as the engine routes already do.

## Status

Every route below is real and on main. The fixture column says what the stub answers with.

| Route | Stub answer (development stand-in) | Real route |
|---|---|---|
| `/catalog/investigations` | real values, generated; equal to the backend's (checked by `tests/api/test_catalog.py`) | DOB-66 |
| `/catalog/investigations/{psi_id}` | real values, generated; equal to the backend's | DOB-66 |
| `/catalog/tests` | **stand-in, not the source of truth:** two tables only (FLEX and Flame Design, 481 rows in `fixtures/data/tests.json`); the real route serves every row of the 22 tables | DOB-72 |
| `/catalog/tests/{test_id}` | **stand-in:** the same 481 rows, with no evidence | DOB-72 |
| `/air/presets` | a copy of the backend's answer of 14 November 2026 | DOB-83 |
| `/air/coverage` | **stand-in, not the source of truth:** counts that only show the shape (no `other` stage) | DOB-83 |
| `/catalog/rank` | none: the home page needs the real backend | DOB-73 |
| `/modules`, `/modules/{id}`, `/evidence`, `/findings`, `/files/{name}` | answered from the repo's `data/modules/` folders (`scripts/stub-modules.mjs`, mock engine included) | DOB-58 |

The catalog fixtures are generated, not written by hand:
`node scripts/make-fixtures.mjs --raw <path to data/raw>`. Every value is copied or counted
from the PSI records (`data/raw/json/PSI-*.json`) and the curation file
(`pipeline/catalog/curation/investigations.yaml`, DOB-61). Checked on 14 November 2026: 24
investigations, 16,354 downloadable files in total, PSI-69 (FLEX) lists 923.83 GB and offers
0 files besides its table. These match `docs/PSI_VERIFICATION_REPORT.md`, and
`tests/unit/stub.test.ts` fails if they move.

## `GET /catalog/investigations`

```
{ "count": 24, "items": [ InvestigationSummary, ... ] }     // sorted by PSI number
```

The site filters the 24 rows in the browser, so query filters are optional for the web.

`InvestigationSummary`:

| Field | Type | Source |
|---|---|---|
| `psi_id` | string, `PSI-25` | PSI `accession` |
| `acronym` | string or null | PSI `investigationAcronym` (empty for the 5 ground investigations) |
| `title` | string | PSI `title` |
| `ground_investigation` | boolean | PSI `projectType` is "Ground Investigation" |
| `pillar` | `prevention`, `detection`, `suppression`, `related`, `fundamentals` | curation |
| `stage` | `spread`, `detect`, `suppress` or null | curation, derived from pillar |
| `fuel_phase` | `solid`, `liquid`, `gas`, `aerosol` | curation |
| `hardware_group` | string id, for example `msg_flow_duct` | curation |
| `hardware_group_label` | string, plain words for the id | backend |
| `psi_sub_area` | string or null | PSI `subResearchArea` |
| `summary_plain` | string or null | curation, SI-written |
| `data_kinds` | list of `table`, `data_files`, `video`, `images`, `documents`, `archives` | `table` if the record has an experimental table; the others from the file extensions in `added[]` |
| `table_count` | integer | PSI `experimentalTable[]` |
| `files_count`, `files_bytes` | integers | PSI `added[]` only, never `removed[]` |
| `listed_bytes` | number or null | PSI `totalFileSize` (what PSI lists, often more than it offers) |
| `publications_count` | integer | PSI `publications[]` |
| `psi_url` | string | `https://doi.org/<doi>`, which resolves to the record on psi.nasa.gov |

## `GET /catalog/investigations/{psi_id}`

Every field of `InvestigationSummary`, plus:

| Field | Type | Notes |
|---|---|---|
| `psi_text` | `{objective, approach, hypothesis, research_impacts}`, each string or null | PSI's own text, unchanged. Shown next to the SI-written summary |
| `summary_written_by` | string or null | the model name from the curation file |
| `tags` | `{pillar, fuel_phase, hardware_group, measurements}`, each `{value, source}` | the source sentence is shown under each tag |
| `cannot_tell` | list of strings | at least one honest limit |
| `conditions` | `{hardware, hardware_link, flight_program, managing_center, start_date, end_date, release_date}` | strings as PSI writes them, or null |
| `licence` | `{id, name, link}` | PSI-10 has an empty licence: all three null |
| `doi` | string or null | |
| `files` | `{count, bytes, listed_bytes, by_category: [{category, count, bytes}], tables: [{file_name, bytes}]}` | category is the PSI folder name ("Raw Data", "Analyzed Data", ...) |
| `publications` | list of `{title, authors, doi}` | authors and doi may be null |
| `related` | list of PSI IDs | PSI `related_glds` |
| `engines` | list of `{id, title, stage, status}` | engines whose `module.json` lists this PSI ID; never the mock engine |

## `GET /catalog/tests` (DOB-72)

Query: `psi_id`, `fuel`, `fuel_phase`, `outcome`, `diluent` (each may repeat for "any of"; an
empty cell is counted and filtered as `none`), `o2_min`, `o2_max` (mole fraction),
`pressure_min`, `pressure_max` (kPa), `flow_min`, `flow_max` (cm/s), `comparable` (`true`),
`notes` (`true`: also the note lines), `air` (a preset id, see below), `limit` (1 to 500,
default 50), `offset`, `include` (comma list of `raw`, `evidence`, `points`).

One test is fetched on its own route, `GET /catalog/tests/{test_id}` (for example
`/catalog/tests/PSI-69/114`): the row with its `raw` cells and its `evidence` (every analysis
record about the test, contract shape). The slash of the test ID stays a path separator; any
other character is percent-encoded (`PSI-20/#1` is `/catalog/tests/PSI-20/%231`). One function
builds that path: `testApiPath` in `lib/tests.ts`. There is no `test_id=` filter.

```
{
  "total": 186, "limit": 50, "offset": 0,
  "items": [ TestRow, ... ],
  "facets": {
    "psi_id":     [ {"value": "PSI-69", "label": "FLEX", "count": 186} ],
    "fuel":       [ {"value": "Methanol", "count": 120} ],
    "fuel_phase": [ ... ], "outcome": [ ... ], "diluent": [ ... ]
  },
  "excluded": { "o2": 0, "pressure": 0, "flow": 0 },
  "points": { "items": [ ["PSI-69/1", "PSI-69", 0.21, 101.0] ], "not_plotted": 0 }
}
```

- `facets`: counts for the current filter, each facet counted without its own filter applied,
  so a visitor can widen a choice.
- `excluded`: rows dropped by a range filter because that value is empty in the source.
- `points` (only with `include=points`): every matching test that states both oxygen and
  pressure, not paged, as `[test_id, psi_id, o2_mole_fraction, pressure_kpa]`;
  `not_plotted` is how many matching tests state no oxygen or no pressure.

`TestRow`:

```
{
  "test_id": "PSI-69/114", "psi_id": "PSI-69", "acronym": "FLEX", "table_name": "FLEX", "test_number": "114",
  "fuel": "Methanol", "fuel_phase": "liquid",
  "o2_mole_fraction": 0.2, "pressure_kpa": 0.0, "flow_cm_s": null,
  "diluent": "CO2", "outcome": "Extinction", "comparable": true,
  "original": {
    "o2_mole_fraction": {"text": "0.2", "unit": "mole fraction", "column": "O initial ambient composition; mole fraction"},
    "pressure_kpa":     {"text": "0", "unit": "mmHg", "column": "Ambient pressure; mmHg"}
  },
  "flags": ["suspect_pressure", "co_header_assumed_co2"],
  "source_file": "PSI-69_Experimental table_FLEX.csv", "source_row": 114,
  "raw": { "<column>": "<cell text>" },        // with include=raw, always on /catalog/tests/{test_id}
  "evidence": [ Evidence, ... ]                 // with include=evidence, always on /catalog/tests/{test_id}
}
```

`original` may also hold `outcome` and `diluent`, and its `unit` is null for a cell with no
unit. Flags the backend writes (`pipeline/catalog/tables.py`): `suspect_pressure`,
`co_header_assumed_co2`, `oxygen_is_burner_stream`, `note`, and `<field>:<kind>` for a value
that is not one number (`<field>` is `o2_mole_fraction`, `pressure_kpa` or `flow_cm_s`;
`<kind>` is `range_or_list`, `not_a_number`, `approximate`, `unknown_unit` or `out_of_range`).
Each has a label and a sentence in `lib/tests.ts`; an unknown flag is shown in readable words.
`comparable` is false when the test states no oxygen or no pressure; the table says why.

## `GET /air/presets` and `GET /air/coverage` (DOB-83)

```
// /air/presets
{
  "default": "station",
  "presets": [
    {
      "id": "exploration",
      "label": "Exploration atmosphere",
      "plain": "30% oxygen or more, at 10.2 psi or less",
      "tolerance_plain": "Used exactly as the source states it: no tolerance added.",
      "source": "One sentence naming where this atmosphere comes from.",
      "window": { "o2_min": 0.30, "o2_max": null, "pressure_kpa_min": null, "pressure_kpa_max": 70.3,
                  "flow_cm_s_min": null, "flow_cm_s_max": null }
    }
  ]
}

// /air/coverage?air=exploration
{
  "air": "exploration",
  "stages": {
    "spread":   { "status": "tested",       "inside": 3, "stated": 120, "investigations": [ {"psi_id": "PSI-26", "status": "tested", "inside": 3, "stated": 123} ] },
    "detect":   { "status": "not_stated",   "inside": null, "stated": 0, "investigations": [ ... ] },
    "suppress": { "status": "never_tested", "inside": 0, "stated": 274, "investigations": [ ... ] },
    "other":    { "status": "tested",       "inside": 20, "stated": 453, "investigations": [ ... ] }
  }
}
```

The coverage answer also carries `window` and `constrains` (the columns the window bounds).
`other` holds the investigations with no fire stage; a pillar never shows it. The site shows
each preset's `source` as the source note of the chosen air.

`status` is `tested`, `never_tested` (values stated, none inside the window) or `not_stated`
(the tables state no oxygen or pressure). The numbers above only show the shape: they are not
results. The site sends `air=<preset id>` on every air-dependent request and holds no window
numbers of its own. `/catalog/tests` and `/catalog/rank` accept the same `air` parameter.

## `GET /catalog/rank?air=<preset id>` (DOB-73)

```
{
  "air": "station",
  "weights": { "pillar": 0.25, "evidence": 0.25, "data": 0.25, "fuel": 0.25 },
  "weights_are_default": true,
  "formula": "score = sum of weight x part, each part from 0 to 1",
  "items": [
    {
      "rank": 1, "psi_id": "PSI-26", "acronym": "BASS", "pillar": "prevention", "stage": "spread",
      "score": 0.0,
      "parts": {
        "pillar":   { "score": 0.0, "reason": "Named by the challenge page for prevention." },
        "evidence": { "score": 0.0, "reason": "N of M tests ran inside this air.", "inside": 0, "stated": 0 },  // inside null when stated is 0
        "data":     { "score": 0.0, "reason": "..." },
        "fuel":     { "score": 0.0, "reason": "..." }
      },
      "reason": "One sentence a visitor reads."
    }
  ]
}
```

Zeros and letters stand for computed values.

*Written with SI assistance (Claude Code); see `submission/SI_USAGE.md`.*
