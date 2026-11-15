# Stub-only module files

`modules/<engine id>/<file>` here is served by `scripts/stub-modules.mjs` in place of the same
file of `data/modules/<engine id>/` (and even when `module.json` does not list it). It gives the
Spread page's browser tests a fixed `index.json` of the shape in the DOB-86 contract (tests B3,
B2 and B1; B1 is copied from the real engine output of 2026-11-14 with the fan fall times set by hand, B2 and B3 are made up), so they do not depend on the engine's own
output. The values are test data, not results, and the real backend never serves them.

Stand-in videos: `video-to-data/PSI-25_T4_review.mp4` and `PSI-25_T9_review.mp4` in this folder are
byte-for-byte copies of the real B1 overlay (`data/modules/video-to-data/PSI-25_B1_overlay.mp4`).
They only give the browser tests a file to load under those names; the real T-series review
videos are in `data/modules/video-to-data/`. Fixtures are not deployed (`.vercelignore`).
