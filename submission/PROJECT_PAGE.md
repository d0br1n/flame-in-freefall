# Project page drafts

One section per field of the Space Apps Project Submission form, in form order. English only.
Paste from here into the form; keep this file as the source of truth and update it whenever
the product changes. A field still containing the word `TODO` fails the checker
(`python3 .claude/skills/space-apps-judging/scripts/check.py`).

Every text follows the same arc: the challenge, our solution, why it matters. Write for a
reader with no context and no technical background.

Team: The Overfitters. Local Event: Cluj-Napoca, Romania. Challenge: Flame in Freefall.

## Project Name

burnrate

Tagline: Every NASA microgravity flame test, traced to its source.

## High-Level Project Summary

NASA's 24 combustion investigations, most of them flown on the space station, sit in one
public archive, the Physical Science Informatics (PSI) database. Crews and mission designers
need to know two things about a fire in a spacecraft: will it spread and what puts it
out. The archive does not answer them directly. It holds hundreds of
files per experiment, some of them videos of burning samples whose outcomes are not in the PSI table.

We built a website where a visitor picks the air inside a cabin (oxygen, pressure, airflow)
and sees what NASA's flight tests say about it. Our open, checkable tracker follows the flame
in the Burning and Suppression of Solids II (BASS-II) videos and turns each test into
measurements: when the flame ignited, when it went out, and how fast it spread. So far 18 of
the 22 B-series tests in the PSI-25 table are measured; spread is given in pixels per second because
the videos show no scale. On 5 tests we compared the tracker with SI-made flame markings checked
by a team member: the mean difference is 2.5 pixels per second (26%), driven mostly by one test,
and the Video to Data page shows it, test by test, as not passing our own 25% limit. An independent
hand measurement has not been done. A second
piece is a suppression test bench on the Flame Extinguishment (FLEX) droplet tests: for each
mix of oxygen and an inert gas (nitrogen, carbon dioxide or helium) it shows how hot a flame
could get and which mixes were never flown. Every test on the site opens its PSI source, and the
site says what was never tested.

This matters because the next crewed missions will fly to the Moon and on to Mars, where cabin
air and gravity differ from the tests that exist: no PSI test used Moon or Mars gravity. A tool that shows which tests cover a cabin
and which do not tells engineers where the evidence is thin, and it makes NASA's open data
usable for researchers, students and anyone planning the next experiment.

## Link to Project Demo

https://youtu.be/ONnKjQW7STY

(YouTube, unlisted: it opens with no login and no permission request, checked on 15 Nov. The
video is 29.45 s; the same file is `submission/demo/burnrate-demo.mp4`.)

## Link to Final Project

https://burnrate-psi-rosy.vercel.app

(Public, no login. The source is in the public repository
https://github.com/d0br1n/flame-in-freefall.)

## Detailed Project Description

**The challenge.** NASA asks for a dashboard that summarizes, ranks and interprets the PSI
combustion experiments so that fire-safety insight is easier to reach. Fire in a spacecraft is
a hard problem: the fire-safety pillars are prevention (which materials burn, and under
what air), detection (will smoke be noticed) and suppression (what stops a flame). We built
two analyses: Video to Data (how a flame spreads and when it goes out) and the Suppression
test bench (what puts a flame out); detection is covered only through the catalog.

**What it does.**
- A **catalog** of all 24 PSI combustion investigations. Each has our plain-language summary
  (written with SI help, labelled as such), tags for fire-safety pillar, fuel phase and
  hardware, a page per investigation and a tests explorer that puts every test from the 22
  experimental tables on one shared set of columns, each traced to its file and row.
- A **cabin air control** (oxygen, pressure, airflow) that every page reads, and a ranking of
  the 24 investigations for that air, with the reason for each position written out.
  Marks under the oxygen and pressure sliders show where the 727 tests that state both ran, and one
  button moves the sliders to the nearest tested air and names that test.
- A **Video to Data** page built on PSI-25 (BASS-II): for each measured test, the clip with the
  tracked flame edge drawn on it, the events (ignition, extinction, still burning at the end)
  and the spread rate in pixels per second with an interval and warning flags. Of the 18
  measured tests, 6 show a steady spread with no warning flag; the others keep their flags in
  view. Checks: in test B1 the flame left the video 1.6 s after the fan began
  to slow, matching NASA's report ("within 2 s"); a blind SI grader matched NASA's published
  outcome in 10 of 11 fabric (T-series) tests, with 1 undecided and 0 contradictions (blind,
  against NASA's Table 7.1, labelled SI-made in the data); and the tracker against
  SI-made markings, checked by a team member, on 5 tests (mean difference 2.5 pixels per second,
  26%, mostly from one test where the tracker followed only a bright burst; shown test by test on
  the Video to Data page, as not passing our own 25% limit). No independent hand
  measurement and no comparison with NASA's published spread rates exist yet (pixels against
  millimetres).
- A **Suppression test bench** page built on PSI-69 (FLEX). It opens with what the flight tests
  show, counted from the FLEX table: with nitrogen only, the flame went out in 30 of 33 tests at
  12 to 15% oxygen but in 2 of 24 at 30 to 34%; at
  19 to 21% oxygen it went out in 32 of 41 tests with carbon dioxide added against 17 of 34 with
  nitrogen only. Below that, for 273 of the 274 FLEX tests it
  computes the hottest temperature the flame could reach and how fast heat spreads in that gas
  mix (a calculated, ideal value, not a measurement). It shows where the flown tests stop: none of
  the 173 tests with carbon dioxide or helium went above 25% oxygen, and all 24 tests at 30 to
  34% oxygen used nitrogen only. Helium is flagged as the place where temperature alone does not explain the
  result. We check the calculation against NASA's own calculated (adiabatic) flame temperatures in PSI-10 (off by
  2.5 K at the median over 147 flames).
  For a chosen mixture, the bench also shows a prediction of how much more carbon dioxide or how
  much less oxygen would make the flame burn out sooner. It is a model fitted to the FLEX tests,
  off by about 13 points of fuel burned on test days it never saw, and it is labelled as a
  prediction, not a result.
  Under "Never tested" it proposes the next experiment: 6 gas mixtures at 30 to 34% oxygen to fly
  together, picked to be far from every real test and from each other. They cut the largest gap in
  that region from 0.76 to 0.24 (a distance in slider widths, not a prediction of what a flame
  would do); the first 6 rows of a plain ranked list would leave 0.45.
- An **evidence panel**: a value opens the same panel, which shows how the value was made
  (video measured, published, read from the PSI table, hand measured, calculated, or SI
  extracted), the PSI file and a link back to psi.nasa.gov.
- A **Compare** page puts up to four investigations side by side, one row per field that PSI
  states for each of them (from the catalog's compare route).
- A **Limitations** page gathers what the data cannot tell in one place: for the whole site,
  for each analysis and for each investigation, each line with its source.
- **Scenarios** set real spacecraft fires against the data, as "what happened versus what burnrate
  would have shown". **Artemis II (2026):** the fire alarm 80,000 miles from home, against the 15
  BASS-II flames (PSI-25) whose fan was turned down in orbit: 7 went out within 2.0 s, 7 had already
  gone, and one (B8) kept burning 6.2 s; and the Moon-base air, where 0 of 274 FLEX suppression tests
  (PSI-69) ran. **Apollo 1 (1967):** the fire on the Apollo 204 Review Board's own clock, and its cabin
  air (100% oxygen at 16.7 psi) checked against the range of the catalogued PSI tests: it sits
  outside, so the site would have flagged it as untested air. Apollo 13, Mir 1997 and a future Moon
  base get one sentence each. Thought experiments on published data, not claims about what could
  have been prevented.
- Smoke detection is a filter of the Investigations list (4 investigations: SAME, SAME-R, DAFT
  and a ground study). There is no detection
  engine: we did not compute new detection numbers.
- **Ask burnrate**, an assistant that answers questions in plain language. It can only use this
  site's own data service (catalog, tests and the two engines) through tools, and every
  citation it writes is checked against what those tools returned before it is shown; a
  citation the check cannot match is removed.

**How it works.** An offline pipeline reads the raw PSI files and writes three things: a
catalog database, and, for each engine, a folder with the same three files (a description,
one record per value per test, and the headline numbers and checks). One validator checks the
folders. A single read-only backend (FastAPI) serves them and the website (Next.js) shows
them.

**What is new compared with the PSI site.** PSI lets you search investigations and download
files. We add one table across all tests, a view by cabin air instead of by investigation, and
numbers measured from the BASS-II videos, which PSI holds only as video. Every page shows
its checks, including the ones that have not passed or not run yet.

**What the data cannot tell.** No PSI test was run in Moon or Mars gravity. Most flight tests
are small and use one material, one size and one fuel at a time; the table for BASS-II has no
spread-rate or outcome column, so those numbers come from the videos. A dim flame can vanish
from video before it is out, and without a scale in the frame the spread rates cannot be
given in millimetres per second. The Suppression test bench temperatures are calculated for ideal burning,
not measured, and the coldest mix that still burned in a flight test is the edge of what was
tested, not a measured extinction limit. Near-identical FLEX tests already differ by about 7
points in share of fuel burned, so no model can be more precise than that. Droplet and gas-flame experiments say little about a cabin fire.
The ranking shows where the evidence is, not which material is safe, and nothing here is a
safety certification.

**Benefits.** Crew-safety engineers and mission designers see which tests cover a cabin and
which do not. Researchers get a cleaned, traceable table and video-derived numbers. Students
and the public get plain-language summaries of what NASA tested and why.

**Who we asked, and what we changed.** On 14 November we wrote to about 110 combustion and
fire-safety researchers and engineers, mostly authors of the NASA papers behind the PSI
investigations (some twice, by LinkedIn after an email bounced). 15 replied in person by 15 November. Most
said the experiments were outside their own work and pointed us to the NASA investigators.
Those who answered the science agreed on one point: a calculated, ideal flame temperature does
not by itself decide whether a flame goes out, and helium behaves differently because it carries
heat differently. A researcher who worked on the FLEX droplet tests said he would expect our
calculated FLEX temperatures to be correct. A reduced-gravity flammability researcher added that a
standard flammability test ranks materials only at the sample size it tests, so its ranking is not
universal, one more reason the site shows conditions next to every result. The Space Apps Navigator reviewed our wording in the
public discussion. What changed: temperatures on the Suppression test bench are presented as
calculated, not measured; helium is flagged as the case where temperature alone fails; the
smoke detector claim we first sent out is not made anywhere in the product; a Limitations page
gathers what the data cannot tell; and the test bench plots how every FLEX test ended against
oxygen and added gas, as one researcher asked. Replies are logged,
by role, in `research/user-research-2026-11-14/EXPERT_FEEDBACK.md`. Nobody named here has
endorsed the project.

**Who pays.** Nobody pays for the NASA data, which is public and free. Two groups have a
reason and a budget to pay for the work on top of it. Commercial space-station builders such as
Vast and Axiom have materials and safety teams that must show their materials are fit for
crewed stations, so they could use a citable evidence summary per material and hazard: the PSI
tests, their conditions and what was never tested. Fire test laboratories read flame
positions from test videos by eye today, so they could run our video-to-data
engine on their own videos, checked against their own hand readings. We make no revenue or
savings claims, and none of these organizations has endorsed or used this. (Source:
`research/business-model-2026-11-14.md`, sections 1 and 3.)

**What we hope to achieve.** To show that the archive can be used as a decision tool, and to
give back to it: a list of PSI data pitfalls we hit, and requests for the next experiment.

**Tools.** Python (data pipeline), FastAPI (backend), Next.js (website), Modal for one
training experiment, GitHub for source and an automated integrity check on every change.
The full list is in the references field. SI assistance (Claude Code) is described in the
next field.

**Screenshots.** Real screenshots of the live site (https://burnrate-psi-rosy.vercel.app),
uploaded with this field from `submission/screenshots/`: the overview, the investigations
list, the PSI-25 page, the tests explorer, Video to Data on test B1, the Suppression test
bench (what works, try a mixture), Compare, Limitations and Ask burnrate. Every data figure in this text appears in a module's `findings.json` or
in the catalog database; the historical figures in the two scenarios come from the sources
listed in the references field.

## Use of Super Intelligence (SI)

The idea of how to solve the challenge is the team's. SI tools helped with the work, as the
rules allow, and each use is logged in `submission/SI_USAGE.md` and marked in the repository.

- **Claude Code (Anthropic)**: research on the event rules, on the PSI data and on past
  winners; the compliance checker and the file-transfer and coordination scripts; code for the
  data pipeline, backend and website; the plain-language summaries and tags for the 24
  investigations (each marked "SI-written" with the model name, drafted from the PSI
  objective and approach text only); draft flame markings on 5 BASS-II videos and a blind grading of T-series outcomes, both
  labelled SI-made in the data and checked by a team member; transcription of reference values from NASA's BASS-II
  report with a page and a quote for every row; and drafting of this page. Commits it
  contributed to carry a `Co-Authored-By` trailer.
- **Outreach**: with the team's authorization, SI drafted and sent feedback requests to
  researchers and relayed their replies; the humans chose the recipients and make the calls.
  The replies are logged in the repository.
- **In the product**: the assistant "Ask burnrate" uses the Claude API (Anthropic), model
  Claude Sonnet 5.5, called server side. It answers only from the site's data service through
  tools, and every PSI ID it cites is checked against what the tools returned. Every number on the other
  pages comes from the PSI files through the pipeline, not from a language model.
- SI-made images or video, if any, carry a visible "SI-generated" label. The demo shows the
  real product.

## NASA Data

All data comes from NASA's Physical Science Informatics (PSI) database, https://psi.nasa.gov,
records published under CC0-1.0 (the licence field is empty for PSI-10).

- **Catalog, all 24 combustion investigations** (PSI-10, 20, 21, 22, 23, 159, 25, 26, 39, 68,
  69, 98, 99, 100, 101, 102, 47, 106, 107 and the ground studies 60, 62, 115, 117, 142): their
  metadata (objective, approach, hardware, publications) and the 22 experimental tables, which
  belong to 20 of the investigations (PSI-10 and PSI-159 have two each; four have none).
- **PSI-25, BASS-II (DOI 10.60555/4qc4-de67), in detail:** the BASS-II videos (B-series thin
  PMMA film and T-series fabric tests) are the input of our video-tracking engine, which
  produces the ignition, extinction and spread-rate measurements. The experimental table
  (`PSI-25_Experimental table_BASS-II.csv`, 129 tests) gives each test's material, fan setting
  and oxygen level. The BASS-II Summary Report, NASA/TM-20210011385 (October 2021), supplies
  published reference values with page and quote, and the ReadMe and fan calibration workbook explain
  the fan and flow settings.
- **PSI-69, FLEX (DOI 10.60555/mbq8-0451), for the Suppression test bench:** the FLEX experimental
  table (274 tests) gives each droplet test's fuel, oxygen, inert gas, pressure and how much
  fuel burned. **PSI-10, ACME Flame Design (DOI 10.60555/w4zy-bt45):** NASA's own computed
  flame temperatures, which we check our calculation against.
- **PSI-101 (SAME-R) and PSI-47 (DAFT, DAFT-2)** appear in the catalog only (detection is a filter of
  the Investigations list); there is no smoke detection engine.

## Space Agency Partner Data and Other References

The full list is `submission/REFERENCES.md`. NASA material first:

- NASA PSI database, repository API, challenge page and Resources tab (see the NASA Data field).
- NASA BASS-II Summary Report, NASA/TM-20210011385, and the PSI-25 ReadMe.
- NASA lessons-learned, history and Spinoff pages cited in `docs/`.

No partner-agency data is used. Libraries, tools and services (for example Python, FastAPI,
Next.js, pandas, scikit-learn, Cantera, Modal, GitHub, uv) are listed with licences in
`REFERENCES.md`.
