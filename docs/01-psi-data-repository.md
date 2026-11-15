# Resource 1: PSI Data Repository – Combustion Science

**Link:** https://psi.nasa.gov/physci/repo/search?q=combustion
**Type:** Data repository (the primary and only data source for the challenge)
**Owner:** NASA Physical Sciences Informatics (PSI)
**Read:** 2026-11-14 (investigation list pulled live from the repository's API)

## What it is

PSI is NASA's public archive of physical science experiments, mostly from the International Space Station. The challenge page calls it the "source of the data upon which the NASA Space App is to be based". Each record is an *investigation* with an ID of the form `PSI-<n>`, descriptive metadata (objectives, approach, hardware, publications) and attached files (experimental tables, raw data, documents, images, video).

On 2026-11-14 the repository listed **133 investigations**: Materials Science 35, Complex Fluids / Soft Matter 34, Fluid Physics 27, **Combustion Science 24**, Biophysics 7, Fundamental Physics 6.

## The 24 Combustion Science investigations

Sub-area labels are PSI's own and are inconsistent (see caveats).

### Flight investigations (19)

| ID | Acronym | Title | PSI sub-area | What it studies |
|---|---|---|---|---|
| PSI-10 | ACME / Flame Design | Advanced Combustion via Microgravity Experiments / Flame Design | Flames of Gaseous Fuels | Soot-inception limits of normal and inverse spherical diffusion flames (ethylene, methane) versus flow rate, inert gas (N2, CO2) and pressure |
| PSI-20 | ACME BRE | Burning Rate Emulator | Flames of Gaseous Fuels | Burning conditions in quiescent microgravity in terms of material properties; CH4/N2 and C2H4/N2 on 25 and 50 mm porous burners, in O2/N2 atmospheres at various pressures and oxygen levels |
| PSI-21 | ACME CLD Flame | Coflow Laminar Diffusion Flame | Flames of gaseous fuel | Weak coflow diffusion flames of methane and ethylene: shape, lift-off, temperature, extinction limits, sooting |
| PSI-22 | ACME E-FIELD Flames | Electric-Field Effects on Laminar Diffusion Flames | Laminar Flames | Electric field voltage versus chemi-ion current, flame response, soot, near-limit lifted flames. Related: PSI-23 |
| PSI-23 | ACME s-Flame | Structure and Response of Spherical Diffusion Flames | Flames of gaseous fuels | Transient structure and extinction of spherical diffusion flames, for comparison with detailed simulation |
| PSI-159 | ACME CFI-G | Cool Flames Investigation with Gases | Flames of Gaseous Fuels | Conditions under which cool diffusion flames occur for propane, n-butane, n-pentane; normal and inverse flames |
| PSI-25 | BASS-II | Burning and Suppression of Solids – II | Spacecraft Fire Safety | Ignition, flame growth, spread and extinction limits of solid fuels in low-velocity forced flow; link to NASA-STD-6001 Test 1. Related: PSI-26 |
| PSI-26 | BASS | Burning and Suppression of Solids | Spacecraft Fire Safety | Gap between the 1g NASA-STD-6001 Test 1, ground microgravity tests and real microgravity flammability; thicker realistic fuels. Related: PSI-107, PSI-25 |
| PSI-39 | CFI | Cool Flames Investigation | Droplets | n-dodecane and n-dodecane/iso-dodecane droplets at 0.25–5 atm; helium dilution; droplet size, pressure and extinction. Related: PSI-69 |
| PSI-68 | FLEX-2 | Flame Extinguishment Experiment – 2 | Spacecraft Fire Safety | Extends FLEX to realistic fuels and conditions; benchmark data on bi-component droplets |
| PSI-69 | FLEX | Flame Extinguishment Experiment | Spacecraft Fire Safety | Flammability limits of liquid fuels in microgravity; effectiveness of gaseous suppressants (CO2, He, SF6); predictive models |
| PSI-98 | SAFFIRE-I | Spacecraft Fire Safety Experiment-I | Spacecraft Fire, Smoke Distribution | How fast a large-scale fire grows in low gravity; low-g flammability limits versus NASA's 1g screening test. Related: PSI-99, PSI-100, PSI-26 |
| PSI-99 | SAFFIRE-II | Spacecraft Fire Experiment-II | Surface Combustion | Same objectives as Saffire-I (flown on a Cygnus spacecraft) |
| PSI-100 | SAFFIRE-III | Spacecraft Fire Experiment-III | Spacecraft Fire Safety | Same objectives as Saffire-I. Related: PSI-99, PSI-98 |
| PSI-101 | SAME-R | Smoke Aerosol Measurement Experiment – Reflight | Spacecraft Fire Safety | Size of liquid smoke particles in low gravity versus generation and transport conditions. Related: PSI-102 |
| PSI-102 | SAME | Smoke and Aerosol Measurement Experiment | Spacecraft Fire Safety | Smoke particle size distribution in low gravity; numerical model of smoke droplet growth. Related: PSI-101 |
| PSI-47 | DAFT / DAFT-2 | Dust and Aerosol Measurement Feasibility Test | Spacecraft Fire Safety | Risk-reduction for SAME: checks that a modified TSI P-Trak particle counter works in microgravity. Related: PSI-102 |
| PSI-106 | SLICE | Structure and Liftoff In Combustion Experiment | (blank) | Structure and stability of laminar diffusion flames; lift-off velocity limits by fuel and burner diameter. Related: PSI-107 |
| PSI-107 | SPICE | Smoke Point In Co-flow Experiment | Fire Safety | Laminar smoke points of non-buoyant jet diffusion flames under various co-flow conditions |

### Ground investigations that re-use PSI data (5)

| ID | Title | Builds on |
|---|---|---|
| PSI-60 | Computational and Experimental Analysis of SPICE Data Sets (temperature and soot volume fraction from 1,600+ raw images) | PSI-107 |
| PSI-62 | Concurrent Flame Spread Modeling using Flamelet Generated Manifolds, compared with BASS | PSI-25, PSI-26 |
| PSI-115 | Use of SAME data for modeling smoke generation in microgravity | PSI-102 |
| PSI-117 | Effect of external thermo-convective perturbation on cool flame dynamics (CFD) | PSI-69, PSI-142 |
| PSI-142 | Cool flame transitions at radiation / stretch extinction using counterflow flames | PSI-69 |

## Mapping to the fire safety pillars

| Pillar | Most direct investigations |
|---|---|
| Prevention (material flammability) | BASS, BASS-II, Saffire-I/II/III, ACME BRE |
| Detection (smoke) | SAME, SAME-R, DAFT/DAFT-2, PSI-115 |
| Suppression | FLEX, FLEX-2 (inert-gas dilution), BASS (nitrogen suppression) |
| High-oxygen atmospheres | ACME CFI-G (up to 85% O2 from the burner), ACME BRE |
| Partial-gravity proxy | ACME E-FIELD Flames (electric field on flame ions) |
| Supporting fundamentals | SPICE, SLICE, CFI, the other ACME experiments |

## How to access the data

The web interface is a JavaScript application, so scraping its HTML returns nothing useful. It is backed by a public JSON API that needs no key or login but is not documented by NASA. The team's own notes (checked against the live API on 2026-11-12) record these routes under `https://psi.nasa.gov/geode-py/ws`:

| Purpose | Route |
|---|---|
| List all investigations | `GET /repo/search?source=psi&type=investigation&size=200&from=0` |
| Keyword search | same, plus `&term=<text>` |
| One investigation (metadata and file lists) | `GET /repo/investigations/PSI-<n>` |
| Download link for a file | `GET /studies/PSI-<n>/download?file=<url-encoded name>&redirect=false` (returns a temporary link) |

Search results use Title-Case keys with spaces (`"Accession"`, `"Acronym"`, `"Research Area"`, `"SubResearch Area"`, `"Objectives"`, `"Approach"`, `"Related Investigations"`). The detail route uses camelCase keys (`objective`, `approach`, `hypothesis`, `description`, `experimentHardware`, `publications`, `experimentalTable[]`, `added[]`, `removed[]`).

## How it relates to the challenge

This is the challenge. Every dashboard feature the page suggests (summarize, rank, compare, extract for modeling) operates on these 24 records and their files. The metadata alone is enough for an investigation explorer and an AI ranking layer; the experimental tables are what support predictive modeling.

## Brainstorming hooks

- A relevance score per investigation against each fire safety pillar and each habitat type (spacecraft, station, Moon base, rover).
- A cross-investigation comparison view on the attributes the challenge lists: fuel, sample geometry, oxygen concentration, pressure, flow speed, sensors.
- A graph of the "Related Investigations" links, including the ground studies that re-used flight data, to show how one dataset fed later research.
- A "Moon Base atmosphere" filter (about 30%+ O2 at 10.2 psi or less) that surfaces tests run near those conditions.
- An explicit "data gap" panel for partial gravity.

## Caveats (from the team's notes; verify before relying on them)

- **No partial-gravity data exists in PSI.** Do not extrapolate to 1/6 g; flag the gap.
- PSI sub-area labels mislead: FLEX is filed under "Spacecraft Fire Safety", Saffire-II under "Surface Combustion", SLICE has none. Build your own fire safety classification.
- The registered total file size does not reflect what is downloadable. FLEX is listed at hundreds of GB but exposes one small CSV table.
- Use the `experimentalTable` and `added` file lists; `removed` holds retracted files.
- Tables cannot be concatenated across investigations: units differ (mole fraction vs %, atm vs mmHg vs psi) and missing values appear in many forms (blank, `-`, `n/a`, `-999`, `#DIV/0!`).
- Datasets are small (tens to hundreds of tests), so they suit simple, well-validated models more than deep learning.
- SoFIE, a major current solid-fuel experiment, is not in PSI.
- Records checked were licensed CC0.
