# video_to_data (offline engine)

Tracks the flame in NASA BASS-II videos (PSI-25) and writes measurements to
`data/modules/video-to-data/`. It runs offline; a shared backend serves the output folder.
The engine has no router and no server. This README was written with SI help (Claude).

## What it does

1. Reads each PSI-25 video and follows the flame front frame by frame.
2. Per test: finds ignition time, extinction time, whether the flame is still burning at the
   end of the video, and an outcome class (burnout, fan_off, quench, blow_off, unclassified,
   censored).
3. Fits spread rate: pixels per second, and millimetres per second where a pixel scale is
   reliable.
4. Later, a small T-series extinction slice.

No measurement code exists yet: the scripts below are planned.

## Planned scripts (in order)

| Script | Job |
|---|---|
| `manifest.py` | List the video files, map each to its test ID `PSI-25/<Test #>` |
| `track.py` | Flame tracker: position against time for each video |
| `events.py` | Ignition, extinction, still burning at end, outcome class |
| `fit.py` | Spread rate with an interval, window and flags |
| `run.py` | Runs the steps above and writes the output folder |

## Input

`data/raw/files/PSI-25/` (gitignored, never committed). ffmpeg comes from the system.

The raw videos are not in git. To get them, run the fetch command from the repo root. It reads
`manifest.csv`, downloads each missing video through `.claude/skills/psi-api/psi_client.py`
(one at a time, three tries, stops under 6 GB of free disk) and rewrites `downloads.csv`.

```
python -m pipeline.video_to_data.fetch --dry-run          # count and GB still to fetch
python -m pipeline.video_to_data.fetch                    # fetch everything missing
python -m pipeline.video_to_data.fetch --only main        # plain main-view videos only
python -m pipeline.video_to_data.fetch --register-only    # rewrite downloads.csv from the disk
```

## Video inventory

`videos.csv` has one row per video in `downloads.csv` (what each file is: size, frame rate, frame
count, and whether the automatic time-base call says real-time video or held stills). Files that
do not open stay in the list as not readable. Rows nobody has viewed carry the NOT_VIEWED note:
the automatic time-base call is unreliable for plain and second-view files.

Counts by investigator and view, from `videos.csv` and `manifest.csv`. Each video is counted once,
first match wins: not readable, still sequence (by file name), second view, else main.

| Investigator | main | second view | still sequence | not readable | total |
|---|---|---|---|---|---|
| Bhattacharjee | 19 | 14 | 13 | 6 | 52 |
| Ferkul | 3 | 2 | 1 | 0 | 6 |
| Fernandez-Pello | 28 | 25 | 5 | 0 | 58 |
| Miller | 24 | 16 | 6 | 0 | 46 |
| Olson | 27 | 22 | 10 | 0 | 59 |
| T'ien | 38 | 22 | 15 | 0 | 75 |
| all | 139 | 101 | 50 | 6 | 296 |

```
python -m pipeline.video_to_data.inventory --counts
```

To add videos fetched later: register them, then measure only the new ones. The run that measured the 231 new videos took 25 minutes (65 old rows kept).

```
python -m pipeline.video_to_data.fetch --register-only
uv run --python 3.12 --with-requirements pipeline/video_to_data/requirements.txt \
    python -m pipeline.video_to_data.inventory --new-only
python -m pipeline.video_to_data.inventory --counts
```

## Output

`data/modules/video-to-data/`: `module.json`, `evidence.json`, `findings.json`,
`results.csv`, `validation.json`, and the per-test files described in that folder's README.

## Run

```
uv run --python 3.12 --with-requirements pipeline/video_to_data/requirements.txt python -m pipeline.video_to_data.run
```

## T-series person check and review clips

`t_series_checked.csv` holds one team member's check of the SI grades of the T-series tests
(11 tests, viewing video brightened x6, without looking at NASA's outcomes as the checker states, not supervised). `grades.build_checked` joins it to the
SI grades. `review_clip.py` writes `PSI-25_<T>_review.mp4` (picture below row 90 brightened x6,
label under the top rows, at most 6 MB: smaller picture and lower quality first, speed-up only
then) and `run.py` writes the read-out cut to the clip, the evidence records, the finding and
the `t_series` entries of `index.json`. T13 is interlaced and 665 s long: the clip is
deinterlaced and covers its first 135 s, and its on-screen numbers cannot be read, so it has no
read-out. Without the raw video a T test gets no clip and no read-out (the tests never need the
videos).

## Detection-steps clips

The batch command writes `PSI-25_<Test>_stepsclip.mp4` next to the overlay clip: NASA's frame with
the outline, the brightness the tracker thresholds, and the flame mask, from the same sampled
frames and the tracker's own functions (`render_steps_clip_frame`). To make only these clips
(about 2 minutes instead of the full batch) and add them to `index.json` and `module.json`,
leaving every other file as it is:

```
python -m pipeline.video_to_data.run --steps-clips-only --workers 4
```

The quality is lowered first and the frame rate only after that, if a clip would pass 1,000,000
bytes; a test with no fitting clip has no `files.steps_clip`.
