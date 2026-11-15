# Content inventory of the burnrate web app (before the redesign)

Taken on 15 November 2026 from branch `redesign`, which starts at `origin/main` 46623ce plus the
two pillar-page design commits (tag `snapshot/site-redesign-2026-11-15`; the public version is tag
`snapshot/site-main-2026-11-15`). Every item below must still be reachable and working after the
redesign. The last column says where each item lives after the redesign; ✓ means a browser check found it working (see the end of this file).

Numbers are not copied here on purpose: every number on the site is read from the API or from the
engine folders (`data/modules/`). The redesign changes how they are shown, never what they are.

## Site-wide shell

| # | Item | Where it was | Now lives at |
|---|---|---|---|
| S1 | Wordmark `burnrate` and brand mark (ball between brackets) | Sidebar top | |
| S2 | Navigation: Overview, Spread, Detection, Suppression (stages); Investigations, Tests (data); Assistant (tools); About the data (footer); a count beside Spread, Detection, Suppression, Investigations, Tests, read from the API | Sidebar | |
| S3 | Mobile menu (open/close) | Top bar burger, sidebar drawer | |
| S4 | Page title (h1 = section name) | Top bar | |
| S5 | Cabin-air pill: preset name, oxygen %, pressure kPa; opens the cabin-air chooser; kept in the URL (`?air=`) and read by every page | Top bar | |
| S6 | Search tests and investigations (`/` shortcut, results list) | Top bar | |
| S7 | Ask button: opens the assistant dock | Top bar | |
| S8 | Assistant dock (side panel, all pages) | Right edge | |
| S9 | Day / night mode toggle (stored, follows system by default) | Sidebar footer | |
| S10 | Footer text: data from NASA Physical Sciences Informatics (link), built by The Overfitters, Cluj-Napoca; link "About the data" | Sidebar footer | |
| S11 | Evidence panel: any analysis number opens it (value, unit, uncertainty, provenance badge, quantity, part of the test, test, conditions, NASA source, published value, check, tests or samples, flags, how it was obtained) | Overlay, all pages | |
| S12 | Saved-copy note when the live data service does not answer; loading skeletons; error state with "Try again" | All data pages | |
| S13 | Example-data banner and markers (when an analysis is a placeholder) | Pillar pages | |
| S14 | Not-found page ("This page does not exist" / "Nothing at this address") | `/anything` | |

## Overview (`/`)

| # | Item | Where it was | Now lives at |
|---|---|---|---|
| O1 | Cabin air card: oxygen and pressure sliders (custom air), preset badge, slider note (range of catalogued tests), five preset chips (Station cabin, Exploration atmosphere, 26.5% oxygen at 10.2 psi, 34% oxygen at 8.2 psi, High oxygen), plain description + tolerance sentence, "Why this window" disclosure with the preset's source | Overview, top left | |
| O2 | "In this air": N of M tests inside the window, rows per investigation (PSI chip, acronym, n of m, bar), note on what is counted; "Open tests" button | Overview, top right | |
| O3 | Three stage cards (Spread, Detection, Suppression): status pill (Tested / Not stated / Never tested), headline number with evidence link, sentence, n, PSI chip and provenance badge, coverage line with bar; Detection lists its investigations (PSI-47, PSI-101, PSI-102, PSI-115) | Overview, middle | |
| O4 | Flame map: every test that states oxygen and pressure, cabin air drawn as a window; segmented filter All / Gas flames / Droplets; legend per investigation with counts; note on tests not drawn; "Show every pressure" / "Show the usual pressure range"; click a dot to open its test | Overview | |
| O5 | Ranked for this air: top 5 with rank, PSI chip, acronym, reason, score bar; "Full ranking" link | Overview, bottom left | |
| O6 | What this data cannot tell: four lines, each with its source (`CANNOT_TELL`) | Overview, bottom right | |

## Spread (`/spread`) and Suppression (`/suppress`): the pillar template

| # | Item | Where it was | Now lives at |
|---|---|---|---|
| P1 | Question card: the analysis's question, summary (first sentence leads), source note; Spread shows the engine's still of test B1 with caption and file link; fact strip (PSI IDs read, evidence records and tests, answers and checks passed) | Top of both pages | |
| P2 | The answer: one card per headline finding (value opens the evidence panel, share bar for counts of tests, n, sentence, provenance badge, source file) | Both pages | |
| P3 | The evidence, test by test: the analysis's main view (Spread) or the generic evidence table with "Show 50 more" / "Show all" (Suppression) | Both pages | |
| P4 | In your cabin air: meter (inside of stated), chosen air sentence, coverage sentence, tolerance, source and "Why this window" | Both pages | |
| P5 | How we checked this: one row per check (verdict passed / failed / being measured, text, source, value, n) | Both pages | |
| P6 | What this cannot tell: the analysis's own `cannot_tell` list | Both pages | |
| P7 | Where the data comes from: the PSI investigations read (links to the investigation page and to psi.nasa.gov) and the analysis's other files (file, kind, what it holds) | Both pages | |

### Spread main view (video to data, PSI-25)

| # | Item | Where it was | Now lives at |
|---|---|---|---|
| SP1 | Measured tests: intro, filters (what was seen in the frames: spreading / doubtful / no spread with counts; material thickness select; no warning flag), "Clear filters", count "N of 18 measured tests" | Spread evidence | |
| SP2 | Measured tests table: Test (button), seen in the frames, thickness, spread rate with interval, burn duration, warnings | Spread evidence | |
| SP3 | Test detail (per selected test): title and conditions; "The footage and what was measured from it" (synced clip player, edge chart with fitted window, area and light chart, read-out chart of fan, air and radiometer) | Spread evidence | |
| SP4 | "How the engine sees a frame": steps image and stills | Spread evidence | |
| SP5 | "The numbers": every evidence value of the test (opens the evidence panel) | Spread evidence | |
| SP6 | Warnings of the test | Spread evidence | |
| SP7 | Not measurable: the tests the engine could not measure and why | Spread evidence | |

### Suppression bench (flame temperature, PSI-69, PSI-10, PSI-39, PSI-68)

| # | Item | Where it was | Now lives at |
|---|---|---|---|
| SU0 | What works (DOB-140): four sentences (lower the oxygen, add carbon dioxide, add helium, never tested) and one mark per FLEX test by oxygen band and added gas, hollow when the flame went out with fuel left; source and limit notes; buttons to the sliders and to every test | New, 15 Nov (mentor feedback) | `/suppress#what-works`, the first section, `components/suppress/WhatWorks.tsx` |
| SU1 | Try a mixture (computed badge): fuel, oxygen slider, gas added (none / carbon dioxide / helium) with share slider, pressure, droplet size; readouts ceiling temperature and predicted share burned with error range and scale; error and noise sentence; "model fails here" state for helium; "no test near" state; "No such mixture" state; nearest real FLEX tests with distances; source | Suppression, first bench card | |
| SU1b | What would put it out sooner here (DOB-141, computed): for the sliders' mixture, the predicted share burned along two levers (add carbon dioxide, lower the oxygen), each with one sentence, a curve with the model's error band, the sliders' position marked, and a button to the lowest point; "no clear difference" inside the model's error; no curve with helium or where no real test is near | New, 15 Nov (Alex) | `/suppress#mixture`, under the sliders, `components/suppress/PutOutHere.tsx` |
| SU1c | Animated droplet flame (DOB-142, illustration driven by the model): the droplet ignites, burns and shrinks, the flame goes out at the predicted share burned and the droplet left stays; live share and state word, scale bar, pause button, still picture for reduced motion; no flame with helium, where no real test is near, or for no such mixture; look matched by eye to NASA video of CFI test FLEX-1393 (PSI-39): igniter glow, white-hot flash, faint blue-grey sphere, camera specks, and a backlit droplet view in the corner with a scale bar (DOB-145); caption: the look follows that video (another fuel), time and flame size are not measured | New, 15 Nov (Iustin's demo brief, Alex) | `/suppress#mixture`, above the readouts, `components/suppress/FlameSim.tsx` |
| SU2 | How each FLEX test ended: outcome plot (oxygen across, outcome down, shape and colour by added gas, 30 to 34% band, hover tooltip, click opens the test), legend with counts, outcome definitions, left-out note | Suppression, bench | |
| SU3 | Table: highest oxygen each added gas reached (tests, highest oxygen, tests at that oxygen with links) | Suppression, bench | |
| SU4 | Table: the plot as a table (tests per outcome and added gas, totals) and its source note (the "CO" column read as carbon dioxide) | Suppression, bench | |
| SU5 | What was never tested: engine headline, source, scope | Suppression, bench | |
| SU6 | Next test to fly: region sentence, not-a-prediction sentence, one tile per added gas (conditions, notes, "model fails here"), ranked table (rank, fuel, added gas, oxygen, pressure, distance, nearest real test), "Show all 232" / "Show the first 10", distance formula note | Suppression, bench | |
| SU7 | Every computed number, test by test: the evidence table (742 records) | Suppression, evidence card | |

## Detection (`/detection`)

| # | Item | Where it was | Now lives at |
|---|---|---|---|
| D1 | "Catalogued here, not analysed" notice | Detection | |
| D2 | The detection investigations listed with their catalog rows (PSI chip, title, tags, files) and links to their pages | Detection | |

## Investigations (`/investigations`)

| # | Item | Where it was | Now lives at |
|---|---|---|---|
| I1 | Views switch: All investigations / Ranked for this air; "This page does not change with the cabin air" note | Top | |
| I2 | Intro text | Top | |
| I3 | Filters with counts: fire safety pillar, what burned (fuel phase), hardware, kind of data; "N of 24 investigations"; empty state "No investigation matches these filters" | Left rail | |
| I4 | Investigation rows: PSI chip, title, acronym, pillar, fuel phase, hardware, SI-written summary, files and size, kinds of data | List | |
| I5 | Ranked for this air: all 24 with rank, score, parts (pillar, evidence, data, fuel) and their reasons, weights note | Ranked view | |

## Investigation page (`/investigations/[psiId]`)

| # | Item | Where it was | Now lives at |
|---|---|---|---|
| IV1 | Header: PSI chip, acronym, title, flight or ground investigation, PSI research area; curated tags (pillar, what burned, hardware) each with its source; "Open this record on psi.nasa.gov" | Top | |
| IV2 | What this data cannot tell (the record's own line) | Under header | |
| IV3 | In plain words (SI-written summary with its model note) | Body | |
| IV4 | In NASA PSI's own words: objective, approach, hypothesis, research impacts, each with "Show more" and source | Body | |
| IV5 | What was measured (curated measurements with source) | Body | |
| IV6 | What this record holds: files by PSI folder, sizes, experimental tables, download links | Body | |
| IV7 | Conditions and record details: hardware, hardware link, flight program, managing center, dates, licence, DOI | Body | |
| IV8 | Publications | Body | |
| IV9 | Related investigations | Body | |
| IV10 | Analyses on this site that use this record | Body | |
| IV11 | Error states: "No investigation with this ID" / "This ID is not in the catalog" | | |

## Tests (`/tests`)

| # | Item | Where it was | Now lives at |
|---|---|---|---|
| T1 | Filters: investigation, fuel, fuel phase, outcome, diluent (counts), ranges (oxygen, pressure, flow), cabin-air window; in the URL | Left rail | |
| T2 | Tests chart: oxygen against pressure, cabin air drawn, legend, "Show every pressure" / "Show the usual pressure range" | Main | |
| T3 | The matching tests table: test ID, investigation, fuel, oxygen, pressure, flow, diluent, outcome, flags; paging; empty state | Main | |
| T4 | Test dialog: the row as published (every cell as the source file writes it), numbers the analyses give for this test (evidence), flags; "No test with this ID" | Dialog | |

## Assistant (`/assistant` and the dock)

| # | Item | Where it was | Now lives at |
|---|---|---|---|
| A1 | Intro text (answers from the site's data, cites PSI IDs, says when the data cannot answer) | `/assistant` | |
| A2 | Chat: suggested questions, input "Ask about a test, a gas, a cabin air", send, streamed answer with evidence chips, "what the assistant read", limits | `/assistant` and dock | |

## About the data (`/about`)

| # | Item | Where it was | Now lives at |
|---|---|---|---|
| AB1 | What this site is | About | |
| AB2 | Where the data comes from (psi.nasa.gov link, PSI IDs, saved copy) | About | |
| AB3 | How the numbers are obtained: the provenance badges and what each means | About | |
| AB4 | How SI was used (link to the SI ledger) | About | |
| AB5 | Who built it (team, place, repository link) | About | |
| AB6 | What this data cannot tell (same four lines as O6) | About | |

## Backend routes the site reads (unchanged by the redesign)

`/api/v1/catalog/investigations`, `/catalog/investigations/{id}`, `/…/files`, `/catalog/tests`,
`/catalog/tests/{id}`, `/catalog/rank`, `/catalog/compare` (DOB-75, not yet shown on the site),
`/air/presets`, `/air/window`, `/air/coverage`, `/modules`, `/modules/{id}`, `/…/evidence`,
`/…/findings`, `/…/files/{name}`; the assistant at `/api/ask`.

## New in the redesign (nothing above was removed)

| Item | Where |
|---|---|
| Landing hero: headline, three live counts (investigations, tests, experimental tables, read from the API), the four demo steps, a CSS flame sphere | Overview, top |
| Compare: 2 to 4 investigations side by side over `GET /catalog/compare` (DOB-75), starts, shareable `?ids=`, Same / Differs per row, filter to differences or shared rows, per-investigation range bars, suspect values and planned lists as stated | `/compare` |
| Limitations: the site's, each analysis's and each investigation's stated limits, word for word | `/limitations` |

## How this was checked (15 November 2026)

A browser script (Playwright, local production build, real backend) walked every row above at
1920x1080: 68 checks, all passed, including the timed demo path landing -> investigations ->
compare -> suppression model -> limitations (3.2 s of machine time). The earlier page checks
(question, answers, checks, limits and evidence panel on Spread and Suppression: 15; the
Suppression bench including helium "no prediction" and the impossible mixture: 14) pass too. All 11
pages fit 390 px without sideways scroll. No console errors besides the two deliberate 404 checks.

## UI refining (15 November 2026, Linear milestone "UI refining", DOB-117 to DOB-130)

The product owner (Alex) reviewed the redesigned site and asked for shorter text, readable sizes,
long pages split into sections, and less repetition. These rows record what moved or was removed
on his decision; everything else above is still on the page it names.

| Item above | What happened | Where it is now |
|---|---|---|
| S2 navigation | Groups renamed to Start, Data, Analyses, About, Tools. "Spread" is named "Video to Data", "Suppression" is named "Suppression test bench" (routes `/spread` and `/suppress` unchanged). No Detection entry | Sidebar (`lib/nav.ts`) |
| O3 stage cards | Two cards (Video to Data, Suppression test bench). The Detection card is removed | Overview |
| D1, D2 Detection page | Removed (DOB-121). `/detection` redirects | `/investigations?pillar=detection` |
| O6, P6, IV2, AB6 "cannot tell" blocks | Removed from the Overview, the analysis pages, the investigation page and About (DOB-120). Each place links to the limits | `/limitations` (sections Whole site, Analyses, Investigations; `#<module id>` and `#<PSI id>` open the entry) |
| Compare row "What it cannot tell" | Not shown as a row; a link under the table | `/limitations#investigations` |
| P1 to P7 pillar template | A compact header (question, opening of the summary, facts, limits link), then one section at a time: Tests, Findings, Checks and sources (Video to Data); What works, Try a mixture, What was tested, Never tested, Findings, Evidence, Checks and sources (Suppression test bench) | `components/pillar/PillarPage.tsx`, `components/ui/SectionNav.tsx` |
| SP1, SP2, SP7 and the T-series table | One list of every BASS-II test in NASA's table (PSI-25), with material, oxygen, video file and a status from the data: Processed, Outcome graded, Could not be measured (with the reason), Video not processed yet. A processed row expands in place; none is open on load | Video to Data, section Tests |
| SP3 to SP6 test detail | Unchanged content, shown when a processed row is expanded (`?test=B1` opens one) | Video to Data, section Tests |
| IV1 to IV10 investigation page | Header on top, then one section at a time: Summary, NASA's description, Data and files, Conditions, Publications, Related (`#holdings` still opens Data and files) | `/investigations/{id}` |
| T1 to T4 tests | The flag "oxygen is the burner stream" is named "Inverse flame", once per row, explained in a tooltip and the dialog. Inverse-flame rows sort last (`apps/api/app/catalog.py`) | `/tests` |
| AB1 to AB5 About | Shorter text at 16 px | `/about` |

Site-wide: no text under 13 px; a `sticky` bar sits flush at the top of the scroll area (the
scroll container's top padding moved to `app/template.tsx`, DOB-117).

Checked in a browser on 15 November (local dev server, live backend) at 1440 px and 390 px, day
and night: every page above, every section of the sectioned pages, the links into Limitations, a
processed test expanded with its overlay clip playing, no sideways overflow.
