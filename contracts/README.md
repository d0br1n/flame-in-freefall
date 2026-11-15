# The hand-over contract

**Status: frozen (14 November 2026, Linear DOB-82).** Change a schema only by agreement on the
swarm, because the backend, the web app and all three engines are built against these shapes.

Every engine hands over one folder, `data/modules/<id>/`, holding three files in fixed shapes,
plus any other files it lists (grids, images, clips, tables). See `docs/ARCHITECTURE.md` for why.

| File | Schema | What it holds |
|---|---|---|
| `module.json` | `module.schema.json` | What the engine is: fire stage, PSI IDs, the question, what it cannot tell, its other files |
| `evidence.json` | `evidence.schema.json` | One record per value per test, each with its PSI source |
| `findings.json` | `findings.schema.json` | The numbers a pillar page puts into words: headlines and checks |
| | `common.schema.json` | Shared parts: test ID, provenance tags, source, file names |

## Check a folder

```
python3 contracts/validate.py                        # every folder in data/modules/
python3 contracts/validate.py data/modules/my-engine # one folder
python3 -m unittest discover -s tests -t .           # the validator's own tests (tests/contracts/)
```

Nothing to install: the validator uses only the Python standard library (3.9 or newer). It
implements the subset of JSON Schema the schemas use and refuses a schema that uses anything
else, so a new keyword cannot be ignored silently. To check from your own code:
`from contracts import validate; validate.validate_folder("data/modules/<id>").errors`.

It prints `OK` per valid folder, or one line per problem in the form
`<folder>/<file> : <record id> : <field> : <message>`, and exits 1 if anything fails.

## The rules in short

- **Required on every evidence record:** `test_id`, `source.psi_id`, `source.file`. No number without a PSI source.
- **Test ID:** `<PSI ID>/<the table's own test number>`, for example `PSI-69/114`, `PSI-25/B1`,
  `PSI-101/61`. Where one table repeats a test number, append `#<data row>` (1 = the first row
  under the header). The test ID must start with the record's `source.psi_id`.
- **One value per test, segment and quantity.** Two records for the same test and quantity
  must differ in `segment` (for example a flow step).
- **Provenance** is one of `VIDEO_MEASURED`, `PUBLISHED`, `PSI_TABLE`, `HAND_MEASURED`,
  `SI_EXTRACTED`, `MODEL`. The site shows it as a badge on every number.
- Every `source.psi_id` must be in `module.json` `psi_ids`. The `module` field of every record
  must equal the folder name.
- Every file listed in `module.json` `files` must exist in the folder. The backend serves
  only those. Evidence `assets` must be listed there too.
- Findings of kind `check` carry `passed`; headlines do not. `evidence_ids` must exist.
- `status: example` means placeholder values that are never shown as real.

## Count test numbers in a raw PSI table

```
python3 contracts/validate.py --recount "data/raw/tables/PSI-69_Experimental table_FLEX.csv" \
    --column "FLEX Test #" --psi PSI-69
```

Measured on 14 November: FLEX (PSI-69) has 274 rows and 274 distinct test numbers. The BASS-II
(PSI-25) and SAME-R (PSI-101) tables were not on the team server when this was written; run the
recount on them before relying on the counts in the Linear issue (129 distinct; 109 rows with
test 57 twice).

## Examples

`module.json`:

```json
{
  "id": "flame-temperature",
  "title": "Flame temperature",
  "stage": "suppress",
  "psi_ids": ["PSI-69", "PSI-10"],
  "question": "What puts a fire out in this cabin air?",
  "summary": "One sentence on what the engine computes and from which PSI data.",
  "cannot_tell": ["Droplet results do not describe a solid fire."],
  "status": "built",
  "files": [{"name": "flex_grid.json", "kind": "grid", "description": "One line."}]
}
```

One record of `evidence.json` (the file is a list of these):

```json
{
  "id": "ft-114-ext-dia",
  "module": "flame-temperature",
  "test_id": "PSI-69/114",
  "quantity": "extinction_diameter",
  "value": 1.68,
  "unit": "mm",
  "n": 1,
  "conditions": {"fuel": "Methanol", "oxygen_mole_fraction": 0.2, "nitrogen_mole_fraction": 0.45},
  "provenance": "PSI_TABLE",
  "source": {"psi_id": "PSI-69", "file": "PSI-69_Experimental table_FLEX.csv", "link": "https://psi.nasa.gov/"},
  "flags": []
}
```

Optional on evidence: `segment`, `uncertainty` (`interval` [low, high], `method`),
`reference` (`value`, `citation`), `assets`. The evidence record above uses FLEX test 114 as
printed in the PSI-69 table (visible flame extinction diameter 1.68 mm); the `module.json` and
`findings.json` examples show the shape only, their text and numbers are placeholders.

One record of `findings.json` (the file is a list of these):

```json
{
  "id": "ft-headline",
  "module": "flame-temperature",
  "kind": "headline",
  "text": "One sentence a visitor reads on the pillar page.",
  "value": 1.0,
  "unit": "1",
  "n": 12,
  "provenance": "MODEL",
  "source": {"psi_id": "PSI-69", "file": "PSI-69_Experimental table_FLEX.csv"},
  "evidence_ids": ["ft-114-ext-dia"]
}
```

A full working folder with fake values is in `data/modules/_mock/`.
