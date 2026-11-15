# Flame in Freefall: our plan and status

> A snapshot of 14 November 2026, 19:00, kept as a record of the plan. Everything listed below
> as in progress or not started was finished on 15 November: the site is live, the demo video
> is published and the product is named burnrate. The current state is in the
> [README](../README.md).

**Status as of 14 November 2026, 19:00 Romania time** (deadline: Sunday 15 November, 23:59).
What the team builds and where it stands. For what the challenge asks and the official
resources, start with [00-challenge-description.md](00-challenge-description.md). For how the
parts connect, [ARCHITECTURE.md](ARCHITECTURE.md) wins over this page. Live task tracking is
the team's Linear project (P-DOB-8).

## 1. What we build

One public website, no login. A visitor picks the air inside a spacecraft cabin and sees what
NASA's PSI combustion experiments say about a fire in it. Core parts:

1. **Catalog:** the 24 investigations, a page for each, and a tests explorer with every test
   from the 22 experimental tables on shared columns.
2. **Spread page (video to data):** flame tracking on the BASS-II (PSI-25) videos, giving
   ignition, extinction and spread rate per test, checked against NASA's published values.
3. **Suppress page (test bench):** calculated flame temperature for the FLEX (PSI-69) tests,
   checked against PSI-10, showing which oxygen and inert-gas mixes were never flown.
4. **Evidence panel:** every number opens the PSI test and file it came from.

Smoke detection was dropped as an engine on 14 November; it is reached through the catalog.
The assistant ("Ask burnrate") was cut and then restored on 14 November; it is built and deployed (DOB-80).

## 2. Where we are

**Done (on main):**

- Hand-over contract, validator and one read-only backend (FastAPI) for every engine.
- Catalog database and the `/api/v1/catalog/investigations` and `/api/v1/catalog/tests` routes
  (2,001 tests from 22 tables, as the live site counts them), plain-language summaries and tags for the 24 investigations.
- Flame temperature engine in `data/modules/flame-temperature/` (273 of 274 FLEX tests, 15
  findings, checked against PSI-10).
- Video engine pieces: inventory and manifest of the PSI-25 videos, flame tracker, events and
  spread rate with an interval; published BASS-II reference values.
- Website base in `apps/web`: shell, investigations list and investigation page.
- Project page draft, demo video script, business model and buyer outreach.

**In progress:**

- Video engine batch run into `data/modules/video-to-data/` (Alex Dobrin).
- Website: cabin air control, tests explorer, evidence panel, pillar pages, gap list and
  helium flag, Suppress page, deploy (Alex Florea).
- Backend: cabin air filter, hosting (Flavius).
- Submission: project page fields, docs kept in step with the scope (Iustin).

**Not started on 14 November (all three done on 15 November):**

- Deployment to a public URL.
- The demo video (30 seconds or less).
- Project name (team decision, DOB-65).

## 3. Where to read more

| File | What it is |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the product fits together: parts, folders, hand-overs, the eight merge decisions, the test ID rule. Wins over older design files |
| [00-challenge-description.md](00-challenge-description.md) | What the challenge asks. The source of truth, together with the resource files `01` to `10` next to it |
| [challenge-text-verbatim.md](challenge-text-verbatim.md) | NASA's challenge text, word for word, for exact quotes |
| [PSI_VERIFICATION_REPORT.md](PSI_VERIFICATION_REPORT.md) | Our check of the PSI data against NASA's live API: what each file contains and its pitfalls |
| `research/space-apps-win-2026-11-12/report.md` (working notes, private working repository) | How Space Apps is judged, timing, compute options |
