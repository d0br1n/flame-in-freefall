# Flame in Freefall: Challenge Description

**Full title:** Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data
**Event:** 2026 NASA Space Apps Challenge
**Difficulty:** Intermediate / Advanced
**Subject:** Space Exploration
**Source:** https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/?tab=details (read 2026-11-14)

This file restates the challenge page for use as a reference by teammates and AI agents. It is a paraphrase; check the source page before quoting NASA.

## The task in one paragraph

NASA has decades of experimental data on how flames behave in microgravity. The data is public through the Physical Sciences Informatics (PSI) database, but it is hard to find, compare and interpret. The challenge is to build an **interactive, web-based dashboard powered by "super intelligence (SI)"** that **summarizes, ranks and interprets** combustion science investigations and delivers **fire safety insights for human space exploration**.

## What the dashboard may enable (suggested, not mandatory)

1. **Identify the investigations most relevant to fire safety** in habitable crew environments: spacecraft, space stations, lunar and Martian surface bases, and pressurized rovers.
2. **Extract data that supports predictive modeling** of flammability and fire scenarios in space exploration.
3. **Highlight research that informs next-generation fire safety controls and equipment.**
4. Optionally, show **applications of PSI data to fire safety on Earth** (NASA examples: fine-water-mist extinguishers developed for the ISS, smoke detection, firefighter clothing and air tanks).

**Out of scope:** fire safety involving rockets and propellants. Combustion inside rocket engines is effectively independent of gravity, and PSI does not generally cover it.

## Background the page gives

- **Why it matters now:** humans are preparing to return to the Moon and go on to Mars. The page cites a smoke alarm that went off during the recent Artemis II mission, and three historical incidents: the Apollo 1 fire (1967, crew died in an oxygen-filled cabin during a pre-launch test), the Apollo 13 oxygen tank explosion, and the Mir fire caused by an oxygen generator failure.
- **Why microgravity flames differ:** with no buoyancy, hot gases do not rise. A candle flame becomes a blue sphere that depends on diffusion for its oxygen.
- **NASA's fire safety framework has three pillars:**
  - **Prevention** – control ignition sources and select materials, which requires understanding flammability limits. Flammability depends strongly on oxygen concentration, and in microgravity on air flow as well. Studied for solid materials (fabrics, plastics) in **BASS, BASS-II** and **Saffire-I, -II, -III**.
  - **Detection** – tested in **SAME** and **SAME-R** (Smoke and Aerosol Measurement Experiment).
  - **Suppression** – studied in **FLEX** (Flame Extinguishment Experiment) by diluting the chamber atmosphere with carbon dioxide and helium.

## Potential considerations (from the page)

### Audience

Professors, graduate and undergraduate students, aerospace researchers and aerospace engineers.

### Attributes worth summarizing and displaying

- Experimental objectives
- Fuels, including shape and size of samples or burners
- Other test conditions, such as oxygen concentration and airflow speed
- Variables: how tests within one investigation differed and what they had in common
- Sensors or measurement types
- Similarities and differences between investigations

### Other investigations in PSI

- The instrument used for smoke detection in SAME and SAME-R was used to detect dust in **DAFT and DAFT-2** (Dust and Aerosol Measurement Feasibility Test).
- The **Burning Rate Emulator (BRE)** of the ACME project burned gaseous fuels, but it was a study of material flammability in still atmospheres as a function of material properties.
- Other combustion investigations in PSI are still relevant to fire safety, only less strongly or directly.

### Hardware groupings

| Hardware | Investigations | Fuel type |
|---|---|---|
| ACME modular hardware in the Combustion Integrated Rack (CIR) | The six ACME experiments | Gaseous fuels |
| Multi-user Droplet Combustion Apparatus (MDCA) in the CIR | FLEX, FLEX-2, Cool Flames Investigation (CFI) | Liquid fuel droplets |
| SPICE fan-driven flow duct in the Microgravity Science Glovebox (MSG) | BASS, BASS-II, SPICE, SLICE | Solid and gaseous fuels |

### Spacesuits and oxygen concentration

- Spacesuits are filled with 100% oxygen at only 4.3 psi (Earth sea level is 14.7 psi).
- Astronauts pre-breathe 100% oxygen to expel nitrogen and avoid decompression sickness.
- To shorten pre-breathing, the Moon Base and pressurized rovers are expected to use an intermediate atmosphere: **likely 30% oxygen or more at 10.2 psi or less**. That is more than a 40% increase in oxygen concentration over Earth's air, which makes materials much more flammable.
- The highest-oxygen microgravity tests were in ACME's **CFI-G** (Cool Flames Investigation with Gases): the chamber held nitrogen plus a flammable gas such as propane, and an oxygen-nitrogen mixture of up to 85% oxygen flowed from a spherical burner, creating an "inside-out" flame.

### Partial gravity

- **There is currently no partial-gravity combustion data in PSI.** NASA expects it later, for example from the Lunar-g Combustion Investigation (LUCI) and Flammability of Materials on the Moon (FM2).
- ACME's **E-FIELD Flames** mimicked partial gravity through the effect of an electric field on the ions that occur naturally in flames.
- Microgravity and normal-gravity results could bound what happens at intermediate gravity.

## Constraints and things to keep straight

- The dashboard must be **web-based**, **interactive** and **SI-powered**. The page does not define "SI" beyond "super intelligence"; in practice this means AI-driven summarizing, ranking and interpretation.
- The data source is the **PSI repository**. Everything else on the Resources tab is context.
- The bulleted user capabilities are things teams "may consider", not a required checklist.
- The page says more resources may be added before the hackathon begins.

## Companion reference files

| File | Resource |
|---|---|
| `01-psi-data-repository.md` | PSI Data Repository: Combustion Science |
| `02-nasa-combustion-science.md` | NASA Combustion Science (Glenn) |
| `03-sciencecast-video.md` | NASA ScienceCasts video |
| `04-researchers-guide-iss-combustion.md` | A Researcher's Guide to ISS Combustion Science |
| `05-apollo-1.md` | Apollo 1 |
| `06-apollo-13.md` | Apollo 13 |
| `07-mir-fire-1997.md` | Fire Aboard Space Station Mir |
| `08-spinoff-firemans-air-tanks.md` | Fireman's Air Tanks |
| `09-spinoff-fire-detector.md` | Fire Detector |
| `10-spinoff-fire-attire.md` | New Technology for the Fire Attire |
