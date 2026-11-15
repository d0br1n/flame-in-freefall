# Flame temperature engine (suppress)

Question it answers: **what puts a flame out?** It computes two physical numbers for every
FLEX test and checks how well they explain what happened in the real tests.
Written with SI assistance (Claude Code); logged in `submission/SI_USAGE.md`.

## Run

From the repo root:

```
uv run --python 3.12 --with-requirements pipeline/flame_temperature/requirements.txt \
    python pipeline/flame_temperature/build.py
```

The command prints the Cantera version, checks that the four tables and the two Cantera data
files exist, loads the FLEX table, prints the counts and exits with code 0. If something is missing it says what and exits 1.
The server has Python 3.9; `uv` fetches Python 3.12.

## Inputs

| File in `data/raw/tables/` | PSI ID | Used for |
|---|---|---|
| `PSI-69_Experimental table_FLEX.csv` | PSI-69 (FLEX) | The 274 droplet tests |
| `PSI-10_Experimental table_Flame Design_Normal Flame.csv` | PSI-10 (ACME Flame Design) | NASA's own `Tad (K)` column, to check our temperature |
| `PSI-39_Experimental table_CFI.csv` | PSI-39 (CFI) | 87 per-test rows (oxygen, nitrogen, helium, pressure): real tests for the gap list |
| `PSI-68_Experimental table_Flex2.csv` | PSI-68 (FLEX-2) | 8 rows of planned ranges, no per-test rows: only for the gap list's notes and the headline |

`data/raw/` is git-ignored on `main`. Restore a table from the training branch:

```
git show "origin/alex/modal-train:data/raw/tables/PSI-69_Experimental table_FLEX.csv" \
    > "data/raw/tables/PSI-69_Experimental table_FLEX.csv"
```

Cantera data files needed: `nasa_gas.yaml` (thermodynamics) and
`example_data/ammonia-CO-H2-Alzueta-2023.yaml` (transport data for O2, N2, CO2, He).

## Outputs (`data/modules/flame-temperature/`)

Shapes are fixed here so the site can be built in parallel. Units are in the field names.

`flex_tests.json` (DOB-54), one row per FLEX test:

```json
{"test_id": "PSI-69/1", "flex_test": 1, "fuel": "Methanol", "pressure_atm": 0.997,
 "x_o2": 0.21, "x_n2": 0.79, "x_co2": 0.0, "x_he": 0.0, "gas_label": "nitrogen only",
 "d0_mm": 1.69, "ceiling_temperature_k": 2220.0, "heat_spreading_m2_s": 0.00012,
 "share_burned": 0.85, "burning_rate_mm2_s": 0.52, "burn_time_s": 4.3,
 "flags": {"dropped": false, "incomplete": false}}
```

`flex_grid.json` (DOB-56), one row per slider position:

```json
{"fuel": "Methanol", "x_o2": 0.21, "x_added": 0.0, "added_gas": "none", "pressure_atm": 1.0,
 "d0_mm": 1.5, "ceiling_temperature_k": 2220.0, "heat_spreading_m2_s": 0.00012,
 "share_burned_pred": 0.8, "no_test_near": false,
 "nearest": [{"flex_test": 1, "distance": 0.1}]}
```

`flex_checks.json` (DOB-55), seven checks:

```json
{"id": "tad_vs_psi10", "result": 2.4, "unit": "K mean offset", "n": 127, "passed": true,
 "trial_run": 2.6}
```

All three files start with a header block: PSI IDs and links, script commit, date, Cantera
version, the `CO` column assumption and the SI note. The numbers are always the script's.

In the file itself the grid rows are positional arrays in the order of `header.columns`.
DOB-113 appended one column at the end, so the first 11 positions did not move:

| Position | Column | Meaning |
|---|---|---|
| 11 | `model_fails_here` | `true` for every row whose `added_gas` is `helium`. Label, text and the two R2 values are in `header.model_fails_here` |

The flag text is "Temperature alone does not explain helium (R2 -0.34). Outside reviewers point
to transport. Our transport term reaches only R2 0.16." Both numbers are read from the check
`carry_over_helium` in `flex_checks.json` (straight line: `temperature_only` -0.339,
`both_numbers` 0.16; the transport term is the heat-spreading speed), never typed by hand.
No reviewer is named.

## Next test to fly: `flex_gaps.json` (DOB-113, `gaps.py`)

What it is: every grid cell in the Moon-base-like region (30 to 34% oxygen at the grid's
0.7 atm step, per the challenge text "likely 30% oxygen or more at 10.2 psi or less"; not a
NASA spec), one row per fuel, added gas and level, ranked by distance to the nearest real
per-test row in FLEX (PSI-69) or CFI (PSI-39), largest gap first. No ensemble and no
"disagreement" score.

Distance, in one function (`gaps.distance`): the square root of the sum, over oxygen, carbon
dioxide and helium mole fraction and pressure in atm, of ((cell - test) / span)^2. Each span
is the width of the bench's slider range on that axis, read from `flex_grid.json` (oxygen 0.22,
carbon dioxide 0.70, helium 0.45, pressure 0.3 atm), so 1.0 is as far as one whole slider.
Fuel and droplet size are not part of it; the closest FLEX test of the same fuel is listed
beside it (`nearest_same_fuel_test_id`, `distance_same_fuel`).

```json
{"rank": 1, "fuel": "Methanol", "added_gas": "carbon dioxide", "x_added": 0.65, "x_o2": 0.34,
 "x_n2": 0.01, "pressure_atm": 0.7, "distance": 0.757, "nearest_test_id": "PSI-69/118",
 "nearest_conditions": {"fuel": "Heptane", "x_o2": 0.202, "x_co2": 0.3535, "x_he": 0.0, "pressure_atm": 0.7011},
 "distance_same_fuel": 0.759, "nearest_same_fuel_test_id": "PSI-69/183",
 "model_fails_here": false, "note": "Carbon dioxide at 30 to 34% oxygen: never tested in PSI's droplet tables (FLEX PSI-69, FLEX-2 PSI-68, CFI PSI-39)."}
```

The header holds the PSI links, script, commit, date, the region, the distance and spans, the
rows left out with the reason (CFI 1219 to 1222: oxygen 0.21, nitrogen 0.76, helium 0 add up
to 0.97, "composition incomplete"; FLEX 114: pressure 0), the scope sentence, and `coverage`:
the counts behind the coverage headline, measured from the tables on every run. If a table
contradicts the headline, `gaps.py` stops and nothing is written (build exit code 4).

Notes per cell: carbon dioxide cells say "never tested in PSI's droplet tables (FLEX PSI-69,
FLEX-2 PSI-68, CFI PSI-39)"; helium at exactly 30% says it "may exist in FLEX-2 flight data
that is not in PSI: ask the FLEX-2 team before flying"; helium at 31 to 34% says FLEX-2's
planned range stops at 30%; nitrogen-only cells name the oxygen levels FLEX tested there.
Each note is checked against the tables before it is written.

What it cannot tell: the distance is not a prediction of what a flame would do. Only PSI's
droplet tables were checked; the ACME gas-flame tables were not. FLEX-2 lists a planned range
(O2/N2 or O2/He, oxygen up to 0.3, pressure 0.5 to 3 atm; 0.7 atm is not one of its listed
steps), so PSI cannot say which FLEX-2 conditions flew. CFI has no carbon dioxide column,
so its carbon dioxide is taken as 0.

Run it alone (standard library, no Cantera), after the build has written the other files:

```
python3 pipeline/flame_temperature/gaps.py
```

It reads `flex_tests.json`, `flex_grid.json`, `flex_checks.json` and the two tables, writes
`flex_gaps.json`, adds the grid column (running it twice changes nothing) and rewrites
`module.json`, `evidence.json` and `findings.json`. `build.py` calls the same function after
the grid. The outputs on main were made this way, from the committed files of the 14 Nov
build, without re-running Cantera.

## Next tests as one designed batch (DOB-114, `gaps.campaign`)

The ranked list scores every cell on its own, so its top rows are near-copies of one corner
(rows 1 to 10 are five carbon dioxide conditions at 60 to 65%). `gaps.campaign` picks the next
tests as a set instead: greedy maximin design augmentation (Johnson, Moore and Ylvisaker 1990).
Take the gas condition farthest from every real test, count it as flown, take the condition
farthest from the real tests and the earlier picks, and repeat. Same `gaps.distance`, same spans,
same reference rows (FLEX and complete CFI rows). No model, no prediction. It works on the 116
distinct gas conditions of the 232 rows (fuel is not part of the distance); a tie goes to the
condition ranked higher in the list.

The block is `header.campaign` in `flex_gaps.json`; `rows` and `rank` are unchanged:

```json
{"method": "...", "why": "...", "fuel": "...", "not_a_prediction": "...", "n_conditions": 116,
 "default_tests": 6,
 "picks": [{"pick": 1, "added_gas": "carbon dioxide", "x_added": 0.65, "x_o2": 0.34, "x_n2": 0.01,
            "pressure_atm": 0.7, "gap_when_picked": 0.757, "largest_gap_after": 0.669,
            "mean_gap_after": 0.287, "nearest_test_id": "PSI-69/118", "nearest_conditions": {},
            "differs_by": {"x_o2": 0.138, "x_co2": 0.2965, "x_he": 0.0, "pressure_atm": -0.0011},
            "model_fails_here": false, "note": "..."}],
 "curve": [{"tests": 0, "designed_batch": 0.757, "ranked_list": 0.757,
            "designed_batch_mean": 0.383, "ranked_list_mean": 0.383}]}
```

Twelve picks are written; the first k are the batch of k tests. `curve` gives, for 0 to 12
tests flown, the largest and the mean distance from a region condition to its nearest test,
for the batch and for the first conditions of the ranked list. Measured on this build: the
largest gap is 0.757 today; after 6 tests it is 0.24 for the batch and
0.445 for the ranked list. One headline in `findings.json`
(`headline/designed_batch`) says this, reading the numbers from the block.

What it cannot tell: it is coverage of gas conditions, not a prediction and not a claim about
which test would find a limit. Which fuel to burn at a pick is left open.

## Design-of-experiments checks: `flex_doe.json` (DOB-115, DOB-114, `doe.py`)

Two checks on the fitted link, computed from `flex_tests.json` alone. They need pandas, numpy
and scikit-learn at the pinned versions, not Cantera:

```
uv run --python 3.12 --with-requirements pipeline/flame_temperature/requirements.txt \
    python pipeline/flame_temperature/doe.py
```

`build.py` calls the same function after the gap list. The replay fits a few thousand small
models and takes about five minutes.

**`lack_of_fit`.** The model's error on unseen test days (same folds as `fitted_link`) against
the scatter between repeated tests (the pairs of `repeatability`). Pure-error SD =
sqrt(mean(gap squared) / 2). Measured: model RMSE 16.6 points, pure-error SD
8.8 points, ratio 1.89 (bootstrap 95% interval 1.26 to 3.3). A
ratio of 1 would mean the model is as good as the data allows. The pairs can share a test, so
the interval is optimistic.

**`batch_replay`.** Does picking tests as a batch teach the model faster than the top of a
one-by-one ranking? One group of FLEX tests is treated as never flown; the fitted link starts
from all other eligible tests; tests of the group are handed back k at a time (k = 0 to 30),
picked as a designed batch, as the top k of a ranking by distance to the starting tests, or at
random (20 draws, seed 0); the error is read on tests of the group from other test days (5
folds grouped by test day). The three groups were fixed before the numbers were read.

| Group treated as never flown | Tests | None handed back | Batch, mean over 1 to 30 | Ranking, mean over 1 to 30 | All handed back | Sizes with the batch ahead |
|---|---|---|---|---|---|---|
| tests with carbon dioxide | 94 | 18.0 | 15.1 | 17.1 | 12.8 | 28 of 30 |
| tests with helium | 38 | 19.3 | 16.4 | 15.7 | 16.3 | 9 of 30 |
| tests at 21% oxygen or more | 69 | 18.1 | 12.0 | 13.0 | 9.2 | 25 of 30 |

Errors are in points of fuel burned. The batch is behind for helium, where the model fails
anyway (`carry_over_helium`). The curves are noisy: read the trend, not one size. A replay
says how the method did on tests that exist; it does not say what a flame would do in an
untested gas.

The two checks are also records of kind `check` in `findings.json`
(`check/lack_of_fit`, `check/batch_replay`), after the engine's seven.

## Status

| Issue | Part | State |
|---|---|---|
| DOB-50 | Scaffold | this folder |
| DOB-52 | Loader (`flex.py`, shared rules in `pipeline/common/flex_table.py`) | done |
| DOB-53 | Physics (`physics.py`) and the three reference checks plus the CO2 trend check (`checks.py`) | done |
| DOB-54 | `flex_tests.json` | done |
| DOB-55 | Fitted link (`fit.py`) and `flex_checks.json` | done |
| DOB-56 | `flex_grid.json` (`grid.py`) | done |
| DOB-57 | `module.json`, `evidence.json`, `findings.json` (`handover.py`) | written; `contracts/validate.py` did not exist yet, so not validated by it |
| DOB-113 | Gap list `flex_gaps.json`, helium flag in `flex_grid.json`, coverage headline in `findings.json` (`gaps.py`) | done; `contracts/validate.py` passes |
| DOB-114 | Next tests as one designed batch: `header.campaign` in `flex_gaps.json` (`gaps.campaign`), and its replay on flown tests in `flex_doe.json` (`doe.batch_replay`) | done; `contracts/validate.py` passes |
| DOB-115 | Lack of fit: model error against the scatter of repeated tests, in `flex_doe.json` (`doe.lack_of_fit`) | done |

## Design document and trial run

`research/idea-3-flame-temperature-technical-overview.md` (named in DOB-50) was not available
when this was scaffolded; the teammate who planned the project holds it. The earlier idea
note is `research/idea-3-flame-temperature-yardstick.md`. The 14 Nov trial script is
`research/user-research-2026-11-14/spike_flex_flame_temperature.py` (already in the repo).
