# References ledger

> This is the public copy of the repository. Paths under `research/` and `.claude/` (other
> than `.claude/skills/psi-api/`) refer to the team's private working repository: working
> notes and the setup of the SI coding sessions, which are not published.

Everything external that enters the project goes here, in the same change that adds it:
data, libraries, frameworks, models, APIs, fonts, icons, images, code snippets, papers, tools.
"Even if they are open source or freely available" (Project Submission Guide). This file is
pasted into the "Space Agency Partner Data and Other References" field, and the NASA rows
into the "NASA Data" field.

The checker fails if a package in `package.json`, `requirements*.txt` or `pyproject.toml`
is not named here.

## NASA data and resources

| Resource | Link | Licence | Used for |
|---|---|---|---|
| NASA Physical Science Informatics (PSI) database: combustion science investigations, metadata, experimental tables and data files | https://psi.nasa.gov | CC0-1.0 | The core data of the project |
| PSI repository web API (public, undocumented) | https://psi.nasa.gov/geode-py/ws | n/a | Listing investigations and downloading their files |
| NASA Space Apps 2026 challenge "Flame in Freefall" and its Resources tab | https://www.spaceappschallenge.org/2026/challenges/ | n/a | Problem statement; the Artemis II commander's quote on the `/scenarios/artemis-2` page (`apps/web/lib/scenarios/artemis2.ts`) |
| Starlust, "Artemis II in retrospect: Commander Reid Wiseman talks space toilet issue, Orion heat shield and more" (17 April 2026), a report of NASA's 16 April 2026 crew news conference | https://starlust.org/artemis-ii-in-retrospect-commander-reid-wiseman-talks-space-toilet-issue-orion-heat-shield-and-more/ | Press article, cited only (no text or image copied beyond a paraphrase) | "A tense few minutes aboard Integrity before Mission Control intervened": the "What happened" side of the `/scenarios/artemis-2` page |
| NASA Combustion Science program page (Glenn Research Center) | https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/ | n/a | Background on the investigations, summarised in `docs/02-nasa-combustion-science.md` |
| NASA ScienceCasts video "The Power of Studying Combustion on the ISS" (YouTube) | https://www.youtube.com/watch?v=W1oXykoz9zg | YouTube terms | Orientation material, described in `docs/03-sciencecast-video.md` |
| A Researcher's Guide to International Space Station Combustion Science (NP-2015-10-034-JSC) | https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/ | n/a | Fire safety findings and hardware ranges, summarised in `docs/04-researchers-guide-iss-combustion.md`; the "a fire does not go out by itself without airflow" limit on `/scenarios/artemis-2` |
| NASA lessons-learned page: Apollo 1 | https://sma.nasa.gov/sma-disciplines/accllp/apollo-1 | n/a | Incident background, summarised in `docs/05-apollo-1.md` |
| Report of the Apollo 204 Review Board (NASA, April 1967): findings, chronology, Appendices D-5 and D6-10, and the summary report | https://www.nasa.gov/wp-content/uploads/static/history/Apollo204/find.html | NASA, public | Apollo 1 cabin air and the Board's clock on the `/scenarios/apollo-1` page (`apps/web/lib/scenarios/apollo1.ts`); the research in `research/apollo1-fire-1967/` |
| NASA lessons-learned page: Apollo 13 | https://sma.nasa.gov/sma-disciplines/accllp/apollo-13 | n/a | Incident background, summarised in `docs/06-apollo-13.md`; the Apollo 13 quick example on `/scenarios` |
| NASA history article "25 Years Ago: Fire Aboard Space Station Mir" | https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/ | n/a | Incident background, summarised in `docs/07-mir-fire-1997.md`; the Mir quick example on `/scenarios` |
| NASA Spinoff entry "Fireman's Air Tanks" (1976) | https://spinoff.nasa.gov/node/9582 | n/a | Earth-applications background, summarised in `docs/08-spinoff-firemans-air-tanks.md` |
| NASA Spinoff entry "Fire Detector" (1978) | https://spinoff.nasa.gov/node/9407 | n/a | Earth-applications background, summarised in `docs/09-spinoff-fire-detector.md` |
| NASA Spinoff entry "New Technology for the Fire Attire" (1982) | https://spinoff.nasa.gov/node/9918 | n/a | Earth-applications background, summarised in `docs/10-spinoff-fire-attire.md` |
| Olson, Ferkul et al., "Burning and Suppression of Solids-II (BASS-II) Summary Report", NASA/TM-20210011385, October 2021 (file in PSI-25) | https://ntrs.nasa.gov (report) and https://psi.nasa.gov (PSI-25) | NASA, public | Published reference values and test outcomes for the video-to-data engine, `pipeline/video_to_data/published.csv` |
| PSI-25 BASS-II ReadMe (file in PSI-25) | https://psi.nasa.gov | CC0-1.0 | Meaning of fan display, air display and flow restrictors, `pipeline/video_to_data/published_notes.md` |

| PSI-68 FLEX-2 experimental table (`PSI-68_Experimental table_Flex2.csv`) | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-68 | CC0-1.0 | Checked the planned test range (no per-test rows) for the suppression coverage-gap finding, `research/judge-pivot-2026-11-14.md` |
| PSI-39 CFI experimental table (`PSI-39_Experimental table_CFI.csv`) | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-39 | CC0-1.0 | Per-test oxygen and helium levels for the suppression coverage-gap finding, `research/judge-pivot-2026-11-14.md` |
| PSI-69 FLEX (Flame Extinguishment Experiment), experimental table | https://psi.nasa.gov | CC0-1.0 | 274 droplet tests: the input of the flame temperature engine, `pipeline/flame_temperature/` |
| PSI-10 ACME Flame Design, Normal Flame experimental table | https://psi.nasa.gov | CC0-1.0 | NASA's own `Tad (K)` column, used to check our ceiling temperature, `pipeline/flame_temperature/` |
| PSI-39 CFI experimental table (`PSI-39_Experimental table_CFI.csv`), read by the flame temperature engine | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-39 | CC0-1.0 | 87 per-test rows: real tests for the "next test to fly" gap list and the coverage headline, `pipeline/flame_temperature/gaps.py`, `data/modules/flame-temperature/flex_gaps.json` |
| PSI-68 FLEX-2 experimental table (`PSI-68_Experimental table_Flex2.csv`), read by the flame temperature engine | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-68 | CC0-1.0 | Planned range (no per-test rows) for the gap list notes and the coverage headline, `pipeline/flame_temperature/gaps.py` |

| PSI-10 ACME/Flame Design: Advanced Combustion via Microgravity Experiments / Flame Design | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-10 | to confirm (the PSI record has no licence field) | PSI record (objective, approach, file list, publications, people) and 2 experimental tables for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-20 ACME BRE: Advanced Combustion via Microgravity Experiments - Burning Rate Emulator | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-20 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-21 ACME CLD Flame: Advanced Combustion via Microgravity Experiments / Coflow Laminar Diffusion Flame | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-21 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-22 ACME E-FIELD Flames: Advanced Combustion via Microgravity Experiments Electric-Field Effects on Laminar Diffusion Flames | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-22 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-23 ACME s-Flame: Advanced Combustion via Microgravity Experiments-Structure and Response of Spherical Diffusion Flames | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-23 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-25 BASS-II: Burning and Suppression of Solids - II | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-25 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-26 BASS: Burning and Suppression of Solids | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-26 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-39 CFI: Cool Flames Investigation | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-39 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-39 CFI videos of one droplet test, FLEX-1393 (`PSI-39_Raw Data_MDCA_View_Movie.mp4`, `PSI-39_Raw Data_Droplet_View_Movie.mp4`), and of test F151A04 (`PSI-39_Raw Data_vlc-record-2017-05-31-18h21m37s-udp____F151A04.mp4`) | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-39 | CC0-1.0 | Viewed as the visual reference for the animated droplet flame on the Suppression test bench (`apps/web/components/suppress/FlameSim.tsx`): the look of the igniters, the flash, the faint sphere and the backlit droplet view is matched to them by eye. No frame of these videos is shown on the site, and they burned other fuels than FLEX |
| PSI-47 DAFT / DAFT-2: Dust and Aerosol Measurement Feasibility Test / Dust and Aerosol Measurement Feasibility Test-2 | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-47 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-60 Computational and Experimental Analysis of SPICE Data Sets | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-60 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-62 Concurrent Flame Spread Modeling using Flamelet Generated Manifolds in Microgravity with Comparison to BASS Experiments using Two-Color Tomography | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-62 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-68 FLEX-2: Flame Extinguishment Experiment - 2 | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-68 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-69 FLEX: Flame Extinguishment Experiment | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-69 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-98 SAFFIRE-I: Spacecraft Fire Safety Experiment-I | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-98 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-99 SAFFIRE-II: Spacecraft Fire Experiment-II | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-99 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-100 SAFFIRE-III: Spacecraft Fire Experiment-III | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-100 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-101 SAME-R: Smoke Aerosol Measurement Experiment-Reflight | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-101 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-102 SAME: Smoke and Aerosol Measurement Experiment | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-102 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-106 SLICE: Structure and Liftoff In Combustion Experiment | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-106 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-107 SPICE: Smoke Point In Co-flow Experiment | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-107 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-115 Utilization of the Smoke Aerosol Measurement Experiment Data for Advanced Modeling and Simulation of Smoke Generation in Micro-Gravity | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-115 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-117 Effect of External Thermo-Convective Perturbation on Cool Flame Dynamics: A Multidimensional Multi-Physics CFD Analysis | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-117 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-142 Quantitative Studies of Cool Flame Transitions at Radiation / Stretch Extinction Using Counterflow Flames | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-142 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 1 experimental table for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-159 ACME CFI-G: Advanced Combustion via Microgravity Experiments / Cool Flames Investigation with Gases | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-159 | CC0-1.0 | PSI record (objective, approach, file list, publications, people) and 2 experimental tables for the catalog, the tags and the ranking in `pipeline/catalog/`, `data/build/catalog.sqlite` |
| PSI-25 BASS-II test videos (the B-series videos in PSI-25) | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-25 | CC0-1.0 | Input of the video-to-data engine `pipeline/video_to_data/`; results in `data/modules/video-to-data/` |
| Hardware and background pages that PSI records link to (NASA Glenn ISS Fluids and Combustion Facility pages, ESA video, ISS National Lab, Northrop Grumman); links only, nothing copied | as written in each PSI record (`hardware_link`) | n/a | Shown as links on the investigation pages (`apps/web/fixtures/api/v1/catalog/investigations/`) |

The rows above, one per investigation, are the 24 combustion investigations in the catalog. The licence column is read from `data/build/catalog.sqlite` (field `license_id`).

## Textbook reference values (flame temperature engine)

| Source | Used for |
|---|---|
| Turns, S. R., "An Introduction to Combustion" (McGraw-Hill): adiabatic flame temperatures in air | Ranges for the air check in `pipeline/flame_temperature/checks.py` (methane 2200 to 2250 K, heptane 2260 to 2300 K, methanol 2200 to 2240 K). Written from memory; to be confirmed at source (DOB-51) |
| Incropera and DeWitt, "Fundamentals of Heat and Mass Transfer": thermal conductivity of gases at 300 K | Nitrogen 0.0259, carbon dioxide 0.0166, helium 0.152 W/(m K) in the conduction check. Written from memory; to be confirmed at source (DOB-51) |

## Space Agency Partner data

None yet.

## Libraries, frameworks and models

| Name | Link | Licence | Used for |
|---|---|---|---|
| Python standard library | https://www.python.org | PSF | Data scripts, PSI client, compliance checker |
| modal (Python client) | https://modal.com | Apache-2.0 | Running the training script `modal/train_flex.py` in the cloud |
| Cantera (with its bundled NASA thermodynamic species data) | https://cantera.org | BSD-3-Clause | Equilibrium flame temperature for FLEX tests in `research/user-research-2026-11-14/spike_flex_*.py` and the flame temperature engine `pipeline/flame_temperature/` |
| NumPy | https://numpy.org | BSD-3-Clause | Arithmetic in the research spike scripts and `pipeline/flame_temperature/` |
| FastAPI | https://fastapi.tiangolo.com | MIT | The one read-only backend in `apps/api/` |
| SQLite (through Python's `sqlite3` module) | https://sqlite.org | Public domain | The catalog database `data/build/catalog.sqlite` (`pipeline/catalog/build.py`) read by the backend |
| uvicorn | https://www.uvicorn.org | BSD-3-Clause | Running the backend |
| pydantic | https://docs.pydantic.dev | MIT | Response models of the backend |
| pytest | https://pytest.org | MIT | HTTP-level tests of the backend in `apps/api/tests/` |
| httpx | https://www.python-httpx.org | BSD-3-Clause | Test client for the backend tests |
| NumPy (numpy 2.5.4 in the video engine) | https://numpy.org | BSD-3-Clause | Arithmetic in the research spike scripts; frame arrays in the video engine `pipeline/video_to_data/` |
| Pillow (PIL fork) | https://python-pillow.org | MIT-CMU (HPND) | Drawing the captions on the pitch-deck BASS-II video, `tools/deck/render_b1.py` |
| imageio-ffmpeg (bundles an FFmpeg binary with libx264) | https://github.com/imageio/imageio-ffmpeg | BSD-2-Clause (FFmpeg LGPL/GPL, x264 GPL) | Encoding the pitch-deck BASS-II video to H.264, `tools/deck/render_b1.py` |
| OpenCV (opencv-python-headless 5.0.0.93) | https://opencv.org | Apache-2.0 | Reading the BASS-II video frames (PSI-25) and finding the flame in `pipeline/video_to_data/` |
| pandas 3.1.1 | https://pandas.pydata.org | BSD-3-Clause | Tables of the video engine, including `results.csv` |
| SciPy (scipy 1.18.1) | https://scipy.org | BSD-3-Clause | Fitting the spread rate and its interval in the video engine |
| scikit-image 0.26.0 | https://scikit-image.org | BSD-3-Clause | Image processing for the flame mask in the video engine |
| Next.js 16 (`next`) | https://nextjs.org | MIT | The web app in `apps/web/`: pages, routing, and forwarding `/api/v1` to the backend |
| React 19 (`react`, `react-dom`) | https://react.dev | MIT | User interface of the web app |
| Tailwind CSS 4 (`tailwindcss`, `@tailwindcss/turbopack`) | https://tailwindcss.com | MIT | Styling of the web app |
| TypeScript (`typescript`, with the type packages `@types/node`, `@types/react`, `@types/react-dom`) | https://www.typescriptlang.org | Apache-2.0 (types: MIT) | Language and type check of the web app |
| ESLint (`eslint`, `eslint-config-next`) | https://eslint.org | MIT | Lint rules of the web app |
| Vitest (`vitest`) | https://vitest.dev | MIT | Unit tests of the web app, run by the gate with `npm test` |
| Playwright (`@playwright/test`, with its Chromium build) | https://playwright.dev | Apache-2.0 | Browser tests of the web app, run locally before each landing |
| pandas | https://pandas.pydata.org | BSD-3-Clause | Reading the PSI-69 and PSI-10 tables in `pipeline/flame_temperature/` |
| scikit-learn | https://scikit-learn.org | BSD-3-Clause | Gradient-boosted trees and grouped cross-validation in `pipeline/flame_temperature/` |
| Anthropic TypeScript SDK (`@anthropic-ai/sdk` 1.8.0) | https://github.com/anthropics/anthropic-sdk-typescript | Apache-2.0 (as its package.json states) | The web app's assistant calls Claude through it, server side only (`apps/web/lib/assistant/model.ts`) |
| Claude API (Anthropic), model Claude Sonnet 5.5 (`claude-sonnet-5-5`, default; `claude-opus-5-5` or `claude-haiku-5-5` by setting) | https://platform.claude.com/docs | Anthropic commercial terms | The language model of the assistant "Ask burnrate": it is given only this site's data service results through tools; see `submission/SI_USAGE.md`, "SI inside the product" |
| Cantera data file `example_data/ammonia-CO-H2-Alzueta-2023.yaml` (shipped with Cantera) | https://cantera.org | to confirm (file's own licence not checked) | Transport data for O2, N2, CO2 and He in `pipeline/flame_temperature/physics.py` |
| Models Claude Fable 5.2, Claude Opus 5.5 and Claude Sonnet 5.5 (Anthropic) | https://www.anthropic.com | Anthropic terms | SI models named in the commit trailers; see `SI_USAGE.md` |
| Playwright for Python, OpenCV, NumPy and Pillow in the demo video recorder | https://playwright.dev/python/ , https://opencv.org , https://numpy.org , https://python-pillow.org | Apache-2.0, Apache-2.0, BSD-3-Clause, MIT-CMU (HPND) | `tools/demo/`: driving the live site with a scripted cursor, then drawing the window, camera zoom, cursor and captions of `submission/demo/burnrate-demo.mp4` |

## Tools and services

| Name | Link | Used for |
|---|---|---|
| Claude Code (Anthropic) | https://claude.com/claude-code | SI coding assistant, see `SI_USAGE.md` |
| GitHub | https://github.com | Source hosting |
| FFmpeg, with ffprobe (LGPL/GPL, system install) | https://ffmpeg.org | Reading the properties of the PSI-25 videos and decoding their frames for the video engine |
| uv (Astral, Apache-2.0 or MIT) | https://docs.astral.sh/uv/ | Resolving and running the pinned Python 3.12 environment of the video engine |
| Modal | https://modal.com | Cloud compute for model training |
| Oracle Cloud | https://www.oracle.com/cloud/ | Team server for shared files and long jobs; second server hosting the CI runners |
| GitHub Actions, with the `actions/checkout` action (MIT) | https://github.com/features/actions | CI: runs the integrity gate `tools/ci/gate.py` on every pull request |
| GitHub Actions self-hosted runner (MIT) | https://github.com/actions/runner | Runs the CI jobs on the team's server while the repository is private |
| uv (Apache-2.0 / MIT) | https://docs.astral.sh/uv/ | The gate installs each change's declared Python packages with it before running the tests |
| pytest (MIT) | https://pytest.org | Test runner used by the gate |
| Node.js and npm | https://nodejs.org | On the CI runners: installs each `package.json` and runs its tests |
| GitHub CLI (MIT) | https://cli.github.com | The landing bot (`.github/workflows/auto-land.yml`) opens pull requests and arms auto-merge with it |
| uv (Astral) | https://docs.astral.sh/uv/ | Runs the engine on Python 3.12 with pinned requirements |
| Oracle Cloud | https://www.oracle.com/cloud/ | Team server for shared files and long jobs |
| Impeccable design skill (Apache-2.0) | https://github.com/pbakaus/impeccable | Design rules the SI coding assistant follows for the web app; the result is `apps/web/DESIGN.md` |
| PyMuPDF (AGPL-3.0, run once with uv, not part of the product) | https://pymupdf.readthedocs.io | Correcting the header of the layout mock in the design sheets under `design/` and adding their SI line |
| Vercel (hobby plan) with the Vercel CLI (Apache-2.0) | https://vercel.com | Hosting of the web app; it forwards `/api/v1` to the backend on the team's Oracle server |
| Higgsfield, model GPT Image 2.6 (image generation, run by Flavius's session) | https://higgsfield.ai | Four SI-generated background images in the pitch deck `submission/pitch-deck/`, each with a visible "SI-generated" label |
| Higgsfield, model Seedance 2.5 (text-to-video, run by Flavius in Claude chat) | https://higgsfield.ai | The 6 s title animation of the pitch deck `submission/pitch-deck/img/si-hero-v4.mp4` (Earth flame turning into a microgravity sphere), with "SI-generated" burned into the frame |
| Playwright for Python (Apache-2.0, with its Chromium build) | https://playwright.dev/python/ | Screenshots of the live site for the pitch deck and rendering the deck to PDF |
| Google Chrome (headless print to PDF) | https://www.google.com/chrome/ | Rendering the project demo deck (7 slides at first, 5 slides since the evening of 15 Nov) `submission/demo-deck/index.html` to `burnrate-demo-deck.pdf`; the deck reuses the pitch deck's fonts, images and site screenshots listed here |
| Canva (create-design, through the Canva connector) | https://www.canva.com | The prediction flow diagram on slide 6 of the pitch deck, `submission/pitch-deck/img/canva-predict.png` (one garbled label painted over by hand) |
| marketingskills `copywriting` skill v2.3.5 (Corey Haines, MIT) | https://github.com/coreyhaines31/marketingskills | Rules the SI followed to rewrite the pitch deck copy (diagnosis, three-question gate, no AI tells) |
| Scientific American report on the Artemis II smoke alarm (16 April 2026) and the Apollo 204 Review Board findings (1967) | https://www.nasa.gov/wp-content/uploads/static/history/Apollo204/find.html | Facts for the incident slide of the pitch deck |
| Google Chrome (headless, proprietary freeware) and FFmpeg with libx264 (LGPL/GPL, system install) | https://www.google.com/chrome/ , https://ffmpeg.org | Recording the live site for the demo video (Chrome plays the H.264 flame clip) and encoding `submission/demo/burnrate-demo.mp4` |
| Poppler `pdftoppm` (GPL-2.0-or-later, system install), with Google Chrome and FFmpeg above | https://poppler.freedesktop.org | Turning the 5 pages of `submission/demo-deck/burnrate-demo-deck.pdf` into the slide frames of `submission/demo/burnrate-demo-30s-with-slides.mp4`; Chrome also renders the step labels (`tools/demo/step-labels.html`, fonts Figtree and Geist Mono from Google Fonts) and FFmpeg joins slides, recording and labels (`tools/demo/slides_cut.sh`) |
| FxEmbed public API (api.fxtwitter.com) | https://github.com/FxEmbed/FxEmbed | Reading eight public posts by Vic Giurgiu on X to study the look of his product videos. Nothing from them is in the project |
| YouTube | https://www.youtube.com | Hosting the 30 second demo video (unlisted, opens with no login): https://youtu.be/ONnKjQW7STY |

## Images, fonts, icons, media

| Name | Link | Licence | Used for |
|---|---|---|---|
| Figtree (font, served from our own site through `next/font`) | https://github.com/erikdkennedy/figtree | SIL Open Font License 1.1 | Interface text of the web app |
| Bricolage Grotesque (font, served from our own site through `next/font`) | https://github.com/ateliertriay/bricolage | SIL Open Font License 1.1 | Headings and large numbers in the web app |
| Geist Mono (font, served from our own site through `next/font`) | https://github.com/vercel/geist-font | SIL Open Font License 1.1 | PSI identifiers and numbers in tables in the web app |
| Space Grotesk (font, served from our own site through `next/font`) | https://github.com/floriankarsten/space-grotesk | SIL Open Font License 1.1 | The wordmark "burnrate" in the web app header, nothing else |
| Source Serif 4 (font, served from our own site through `next/font`) | https://github.com/adobe-fonts/source-serif | SIL Open Font License 1.1 | Page titles and quoted NASA text in the web app (`apps/web/DESIGN.md`); IBM Plex Sans carries the interface and headings |
| Google Fonts | https://fonts.google.com | n/a | Source the fonts are downloaded from at build time |
| `apps/web/app/favicon.ico` (48x48, 32x32, 16x16 icon file, added in the web app base commit) | to confirm (origin not recorded; likely the create-next-app default) | to confirm | Browser tab icon |
| Stills (`*_still*.jpg`), kymographs (`*_kymograph.png`) and overlay videos (`*_overlay.mp4`) in `data/modules/video-to-data/`, and the stills in `research/video-gate-2026-11-14/` | https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-25 | CC0-1.0 (source videos) | Made by our own code from the NASA PSI-25 BASS-II videos. Not SI-generated images |
| NASA photo S67-21294, interior of Apollo Spacecraft 012 after the fire, 28 January 1967 (NASA Image and Video Library), resized | https://images.nasa.gov/details/S67-21294 | NASA media, not copyrighted (NASA media usage guidelines); no NASA logo or insignia in the frame | The aftermath photo on the `/scenarios/apollo-1` page, `apps/web/public/scenarios/apollo1-S67-21294.jpg` |
| Demo video `submission/demo/burnrate-demo.mp4` (our own screen recording of our own site; captions set in Figtree, SIL OFL 1.1) | https://burnrate-psi-rosy.vercel.app | Our own work; the flame clip inside it is NASA PSI-25 BASS-II footage (public domain) with our tracked edge | The 30 second project demo |
| Vic Giurgiu's product videos on X (style reference only: window on a gradient, camera zoom on each click) | https://x.com/PiticVic/status/2121256775379018232 | Not reused: no frame, asset or code of his is in the project | The look of the demo video |

## Papers and texts

| Text | Link | Used for |
|---|---|---|
| NIST, "Fire Dynamics" (Fire Research Division), created 17 November 2010, updated 9 September 2025 | https://www.nist.gov/el/fire-research-division-73300/firegov-fire-service/fire-dynamics | The stage names growth, fully developed and decay on the Spread page (`pipeline/video_to_data/stages.py`). The limits between the stages are our own rule |
| Senecal, "Flame extinguishing in the cup-burner by inert gases", Fire Safety Journal, 2005 | https://www.nist.gov/document/r0501586pdf | Background for the limiting flame temperature idea, `research/judge-pivot-2026-11-14.md` |
| NIST report on ground and microgravity flammability test correlation | https://www.nist.gov/document/r0200470pdf | Background on NASA-STD-6001 Test 1, `research/judge-pivot-2026-11-14.md` |
| Johnson, Moore and Ylvisaker, "Minimax and maximin distance designs", J. Statistical Planning and Inference 26, 131-148, 1990 | https://doi.org/10.1016/0378-3758(90)90122-B | Maximin criterion behind the designed test batch (DOB-114), `research/doe-suppression-2026-11-14/` |
| Neyer D-optimal test (overview) | https://en.wikipedia.org/wiki/Neyer_d-optimal_test | Threshold-test design notes (DOB-104), `research/doe-suppression-2026-11-14/` |
| Langlie/Neyer hybrid sensitivity test, J. Applied Statistics, 2013 | https://www.ingentaconnect.com/content/tandf/cjas/2013/00000040/00000011/art00005 | Threshold-test design notes, `research/doe-suppression-2026-11-14/` |
| IDA, comparison of sensitivity-test designs (D-5829), 2016 | https://www.ida.org/idamedia/Corporate/Files/Publications/IDA_Documents/OED/2016/D-5829.pdf | Threshold-test design notes, `research/doe-suppression-2026-11-14/` |
| NASA-STD-6001B Test 1 maximum oxygen concentration study (Texas Tech repository) | https://ttu-ir.tdl.org/items/325f37b5-bbe3-4768-81ba-a0c39d27720f | How NASA steps oxygen to find a limit (DOB-104), `research/doe-suppression-2026-11-14/` |
| NASA NTRS 20150004099 (NASA-STD-6001 Test 1 maximum oxygen concentration) | https://ntrs.nasa.gov/api/citations/20150004099/downloads/20150004099.pdf | Same, `research/doe-suppression-2026-11-14/` |
| "Sequential adaptive design for emulating costly computer codes", arXiv 2206.12113 | https://arxiv.org/html/2206.12113v4 | Why model-guided picking was not recommended, `research/doe-suppression-2026-11-14/` |
| "Active learning for derivative-based global sensitivity analysis with Gaussian processes", arXiv 2407.09739 | https://arxiv.org/pdf/2407.09739 | Same |
| AFIT STAT COE, "Model Building Process Part 2: Factor Assumptions" | https://www.afit.edu/STAT/statcoe_files/Model%20Building%20Process%20Part%202%20Factor%20Assumptions.pdf | Aliasing in the FLEX design audit (DOB-95), `research/doe-suppression-2026-11-14/` |
| Krennrich, "Design of Experiments and Optimization" (bookdown), chapter 4 | https://bookdown.org/gerhard_krennrich/doe_and_optimization/doe2.html | Collinearity and confounding, `research/doe-suppression-2026-11-14/` |
| JMP blog, "Why design experiments? Reason 4: Clarity" | https://community.jmp.com/t5/JMP-Blog/Why-design-experiments-Reason-4-Clarity/m-p/224078 | Unplanned data and aliasing, `research/doe-suppression-2026-11-14/` |
| FLEX ISS test ranges paper, Microgravity Science and Technology, 2014 | https://link.springer.com/doi/10.1007/s12217-014-9372-2 | FLEX oxygen, pressure and diluent ranges, `research/doe-suppression-2026-11-14/` |
| NASA NTRS 20130014061 (FLEX methanol droplets in CO2 and helium) | https://ntrs.nasa.gov/citations/20130014061 | Same |
| Secondary Apollo 1 sources: NASA SP-4205 "Chariots for Apollo" ch. 9, NASA SP-4204 "Moonport" ch. 18-5, US Senate Report 956 (1968), NSSDC Apollo 1 page, Smithsonian Air & Space Quarterly (Winter 2023), AIP "Trial by Fire", NASA SMA Apollo 1 lessons learned; full list with links in the report | see `research/apollo1-fire-1967/report.md` | Cross-checks of the Board's timeline, causes and Block II changes for the Apollo 1 research |
