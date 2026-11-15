# PSI data pitfalls: a note for the PSI team (DRAFT, not sent)

Linear DOB-104. Draft by SI (Claude), from `docs/PSI_VERIFICATION_REPORT.md` section 4. **A human decides whether to send it and sends it from their own address.** The PSI help address is not recorded in this repository: find it on the PSI Users Group page before sending.

We are Team The Overfitters (Cluj-Napoca, NASA Space Apps 2026, "Flame in Freefall"). We read 24 combustion investigations in PSI and hit the points below. None is a complaint; each cost us time. Where the line says "reproduced", we re-ran it on the downloaded file on 15 Nov 2026. Where it says "12 Nov", it is from our first verification pass, not re-run.

| # | Investigation and file | What we found | How to see it |
|---|---|---|---|
| 1 | PSI-69 FLEX, `PSI-69_Experimental table_FLEX.csv` | The file is Windows-1252, not UTF-8; reading it as UTF-8 stops at byte `0x96`. Reproduced. | `open(f, encoding="utf-8").read()` raises `UnicodeDecodeError`; `encoding="cp1252"` reads 274 rows, 15 columns. |
| 2 | PSI-69 FLEX, same file | FLEX test 114 has `Ambient pressure; mmHg` = 0. It looks like a data-entry error. Blank cells are used for missing values (78 cells, mostly extinction diameter; 12 Nov). Reproduced for test 114. | Filter the pressure column for 0. |
| 3 | PSI-159 ACME CFI-G, Inverse table | 861 empty lines at the end (1,016 lines for 154 rows; 12 Nov). | Count non-blank rows. |
| 4 | PSI-159, PSI-10 ACME Flame Design, PSI-25 BASS-II | Text inside numeric columns: `-` for missing (CFI-G); `RAMP` in 342 + 51 cells (Flame Design); lists such as `"89,62,50,41"` in the BASS-II fan and air columns, because the flow was stepped during a test (12 Nov). | Try to cast each column to a number. |
| 5 | PSI-100 SAFFIRE-III, telemetry | Placeholder values instead of blanks when a sensor is off (radiometers about −4002, fan tachometer 77938, igniters −7.378 V and −3.05 A), and negative or garbage relative times in the last rows (for example −6.36e13) (12 Nov). | Filter on the timestamp before using a column. |
| 6 | PSI-101 SAME-R, `HKPData_gmt251_4.csv` | A second header line at line 6. Each file holds 1 to 3 test numbers plus test 0 (idle) (12 Nov). | Read the first 8 lines. |
| 7 | PSI-99 SAFFIRE-II, table | Headers lost the "µ" (`?-g Burn Length`), and spread values are text (`~ 0`, `Complete`, `Note 4`, `n/a (Nomex)`) (12 Nov). | Read the header row and the spread column. |
| 8 | Across investigations | Units differ: mole fraction against percent; mmHg, atm, bar and psia. Tables cannot be concatenated without converting. | Compare the unit text in each column header. |
| 9 | PSI sub-labels | The research sub-areas are not a fire-safety filter (FLEX is "Spacecraft Fire Safety", SAFFIRE-II is "Surface Combustion"), so we tagged the investigations ourselves. | Compare the labels of PSI-69 and PSI-99. |

## Requests for the next experiment (each needs its NASA source in `submission/REFERENCES.md` before it goes on the page)

* Publish the outcome of each BASS and BASS-II test (burned out, quenched, blown off) as a column in the experimental table. Today the outcomes are free text in notes.
* Say in each table header what the column unit is, and say what the FLEX column headed `CO` is (we read it as carbon dioxide; the file does not say).
* Test each extinguishing gas on its own instead of ranking by heat capacity. (Wording to confirm against a source, see DOB-51.)

## Not claimed

* "A fix for NASA's detector" and "the right extinguisher gas".
* A separate data licence on our derived tables: our code is under the MIT licence (`LICENSE`), and PSI records are CC0-1.0 (the licence field is empty for PSI-10).
* That the PSI team has read or accepted any of this.

Offer, not a fact: we would be glad to present these points to the PSI Users Group.
