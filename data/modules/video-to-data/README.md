# video-to-data

Output folder of the offline video engine (`pipeline/video_to_data/`). It tracks the flame in
NASA BASS-II videos (PSI-25). A shared backend serves this folder; the engine has no router.

**Status: built.** `module.json` has `"status": "built"`. Values come from the NASA BASS-II
videos (PSI-25) through `pipeline/video_to_data/run.py`; there are no example rows left. Run it
with `python -m pipeline.video_to_data.run` (see `pipeline/video_to_data/README.md`). Every
position and rate is in **pixels**, because no scale reference is visible in the videos.

## Files

| File | Shape |
|---|---|
| `module.json` | One object: `id`, `title`, `stage`, `psi_ids`, `question`, `summary`, `cannot_tell`, `status`, `files` |
| `evidence.json` | A list of records, one per value per test (measured and PUBLISHED) |
| `index.json` | What the Spread page reads, one entry per measured test (see below) |
| `findings.json` | Three headlines and the check "tracker against hand measurement" |
| `results.csv` | One row per measured test (columns below) |
| `not_measurable.csv` | `test_id`, `file_name`, `reason`: every B-series test or config row with no measurement |
| `validation.json` | `{"status": "pending", "comparisons": []}` until a teammate fills it |
| `PSI-25_<Test>_*` | Per-test files, see below |

`module.json`, `evidence.json` and `findings.json` follow the shared contract (issue DOB-82).
The other files are listed under `files` in `module.json`.

## Evidence

Per measured test (provenance `VIDEO_MEASURED`): `ignition_time` (s), `extinction_time` (s) and
`burn_duration` (s), both left out when the flame was still burning at the end of the video,
`outcome` (a label as a string, unit ""), `spread_rate` (px/s with an interval and the flag
`no_scale`) and `leading_edge_travel` (px). `n` is the number of sampled frames the value rests on.
Records with provenance `PUBLISHED` (quantities `published_spread_rate`, `published_outcome_note`)
exist only for measured tests; the published rate is in mm/s and is never compared with px/s.
Two records may not share the same test, segment and quantity.

**Ignition time** is the first light in the video, the igniter spark included; it can be up to
about 2.5 s before the flame is established.

**Eye viewing flags.** Before any tracker output, an SI viewer (Claude, not a person) looked at
contact sheets of each video and wrote a quality (`spreading`, `doubtful`, `no_spread`) and a
one-line note in `pipeline/video_to_data/config.csv`. This is not the hand measurement. It is
used only as a flag, never as a filter: every configured test with an ignition is measured and
written. `doubtful` adds the flag `eye_doubtful` and `no_spread` adds `eye_no_spread` to that
test's `spread_rate` and `leading_edge_travel` records and its `results.csv` row. The viewer's
note and name sit in each record's `conditions` as `viewing_note` and `viewed_by`. The optional
config column `track_end_s` cuts the sampled frames after it (a camera playback screen at the
end of some videos is bright but not flame).

**Read-out files.** Each plain video has text burned into the top rows: the fields labelled FUEL,
AIR, FAN and RAD, and a clock. `PSI-25_<Test>_readout.csv` (`time_s`, `fuel`, `fan`, `air`, `rad`,
`clock_s`; empty cell where the characters could not be read) holds those numbers at 5 samples per
second, cut at `track_end_s` when set. What they are, from NASA's PSI-25 ReadMe and the BASS-II
Summary Report (page 13):
- FAN is the fan voltage times ten (unit "V x10", maximum 122 = 12.2 V). It is not an air speed and
  nothing here converts it.
- AIR is NASA's measured flow speed in the duct, in cm/s. The sensor takes about a minute to
  respond, so the reading is only steady after long holds at one flow setting.
- RAD is NASA's radiometer read-out: uncalibrated and relative.
- The field labelled FUEL shows, by elimination, NASA's N2 flow rate in cm3/min (the report lists
  N2 flow rate, fan voltage, air velocity and radiometer signal and does not name the label). It is
  only in the CSV; no evidence record is made from it.
- `conditions.fan_display` and `conditions.air_display` are NASA's test-table values: fan voltage
  x10 (or a pot setting, as the table gives it) and air in cm/s.

Evidence quantities (names are kept for the web page): `fan_setting_at_ignition` (median FAN in the
3 s after ignition, V x10), `air_speed_at_ignition` (median AIR in the 3 s after ignition, cm/s),
`fan_setting_changes` (sustained changes from ignition on, listed as text in
`conditions.fan_changes`), `fan_drop_time` (the time the last fall of the fan voltage BEGAN; left
out when there is no fall), `fan_settled_time` (the time the reading settled at its new level),
`flame_gone_minus_fan_drop` (extinction time minus the time the fall began; negative means the
flame left the video before the fall began) and `clock_rate` (clock seconds per video second). The
fall start is found because a ramp is made of values each held for less than 1 s, so a change
detector only sees where the ramp ends. The findings report counts only; they claim no cause in
either direction. Two limits: the FAN read-out is the fan voltage times ten, not an air speed; and
the time between the fan voltage starting to fall and the flame leaving the video is good to about
half a second, because the read-out refreshes 5 times a second and the tracker loses the last dim
half second of a flame. The finding about B1 compares that time with NASA's report, which says the
flame extinguished within 2 s of the flow being cut off (the report's first test, matched to B1 by
its table note).

**index.json** is the file the Spread page reads: one entry per measured test (tests with no warning
flag ahead of the rest, each group by test number) with conditions, the SI eye viewing, flags, events, the
rate with its fitted line (`rate.intercept_px`: position = intercept_px + value * time_s, in the
leading-edge coordinate of `curve.csv`; null when the spread direction is -1, where the line is
not in that coordinate), the fan read-out, stages, the overlay clip's real timing (`clip.start_s`,
`end_s`, `speed` = test seconds per clip second), file names and evidence ids, plus the
not-measurable list. Nothing in it is new data: every number is also in `evidence.json`, the
curve or the read-out.

**Steps image.** `PSI-25_<Test>_steps.jpg` shows one sampled frame from the middle of the fitted
window in four panels made with the tracker's own functions: 1 frame (NASA's frame), 2 brightness
(the signal the tracker thresholds; pixels outside its valid area are black), 3 flame mask
(white on black), 4 outline and edges.

**Curve columns.** `PSI-25_<Test>_curve.csv` ends with `flame_light` and `stage`. Flame light is
the flame area in pixels times the mean brightness inside the flame: a relative, uncalibrated
number from 8-bit video with unknown exposure and saturated flame cores. It is not a
temperature, an energy or a heat release.

**Stages.** The stage names `growth`, `fully developed` and `decay` come from NIST's Fire Dynamics
page (a fuel-limited fire grows until all the fuel available is burning, then decays). Where one
stage ends and the next begins is our own rule, applied to the flame-light curve of one small
test flame: growth lasts until the median-smoothed (5 samples) curve stays at or above 80% of its
plateau (the 90th percentile) for 1 s, decay starts at the last time it is at or above that
level, and fully developed is in between. A curve that never holds the level gets `growth` up to
its peak and then `decay`, with the flag `no_plateau`. This is not a hazard rating. Evidence:
`stage_duration_growth`, `stage_duration_fully_developed`, `stage_duration_decay` (s) and
`peak_flame_light` (relative units, uncalibrated).

**Card switch for the web app:** the check finding "tracker against hand measurement" decides
the card. While its `passed` is `false`, the card says "being measured". When it is `true`
(or the check is judged), the card shows a verdict.

`results.csv` columns: test_id, segment, sample, material, thickness_mm, width_mm,
flow_direction, o2_before, o2_after, ignition_time_s, extinction_time_s, outcome, rate,
rate_unit, rate_ci_low, rate_ci_high, window_start_s, window_end_s, flags,
pixel_scale_px_per_mm, published_value, signed_error, provenance, psi_file.
`published_value` and `signed_error` stay empty while the units differ.

## Provenance tags

`VIDEO_MEASURED`, `PUBLISHED`, `PSI_TABLE`, `HAND_MEASURED`, `SI_EXTRACTED`, `MODEL`.

## Test ID rule

`PSI-25/<Test # from the PSI-25 experimental table>`, for example `PSI-25/B1`. A rerun letter
or part number in a file name is not part of the test ID.

## Per-test files

For each measured test, with the test ID written with `_` in place of `/`:

- `PSI-25_<Test>_kymograph.png`: kymograph image
- `PSI-25_<Test>_overlay.mp4`: overlay clip of the lit range, at most 20 s, NASA's frames with the
  tracked outline and the two edge lines drawn (sped up when the lit range is long; the speed is
  written on the frame)
- `PSI-25_<Test>_still1.jpg`, `_still2.jpg`, `_still3.jpg`: three overlay stills (start, middle,
  end of the lit range)
- `PSI-25_<Test>_curve.csv`: leading edge, trailing edge, area, flame light and stage against time over the lit range
- `PSI-25_<Test>_steps.jpg`: the four-panel image of one frame (see Steps image)
- `PSI-25_<Test>_readout.csv`: the on-screen display numbers and clock (see Read-out files)

Each of these files is listed under `files` in `module.json`, and an evidence record points to
its files through `assets`, a list of file names. The shapes are checked by the shared contract:
`python3 contracts/validate.py data/modules/video-to-data`. Running the command again removes the
per-test files of tests that are no longer measured.

## SI note

The pipeline is written with SI help (Claude).

## Detection-steps clip (`PSI-25_<Test>_stepsclip.mp4`)

One clip per measured B test shows how the tracker sees the video: three panels side by side,
each 480 x 320 (1440 x 320 in all), H.264, no audio, at most 1,000,000 bytes. It has the same
frames, frame rate and speed as the test's overlay clip (`clip` in `index.json`), so test time is
`clip.start_s + currentTime * clip.speed`. Panel 1 is NASA's frame with the tracked outline and
edge lines. Panel 2 is the brightness the tracker thresholds (its input signal, relative and
uncalibrated, not a temperature; pixels outside its valid area are black). Panel 3 is the flame
mask (white where the tracker says flame). The file is named in `files.steps_clip` of the test's
entry in `index.json` and listed in `module.json`.

## T-series outcomes

The T-series are fabric strips with dim blue flames. The rule-based tracker cannot follow them,
so they are not in `tests`, `results.csv` or the three headlines. Instead an SI grader (a Claude
agent) read each plain video from brightened frames and the on-screen fan voltage history and
wrote how the test ended (`quenched`, `blow_off`, `no_blow_off`, `no_ignition` or `cannot_tell`).
It was barred from NASA's outcomes while grading; they were compared afterwards with NASA's
Summary Report Table 7.1 (PDF page 104). T20 has no plain video on PSI and was not graded.

- Evidence: `outcome_graded_by_si` (provenance `SI_EXTRACTED`, flags `si_graded`, plus
  `low_confidence` when the grader's confidence was low) and, for each test NASA lists,
  `published_outcome` (`PUBLISHED`).
- Index: the `t_series` block of `index.json`, in test-number order, T20 included with no grade.
- Finding `find-t-series-si-grades-vs-table-7-1`: the grader matched NASA's outcome in 10 of the
  11 graded tests; 1 (T12) could not be decided and 0 contradicted NASA's table. The fan voltage
  history carries much of the answer.
- Input: `pipeline/video_to_data/t_series_grades.csv` (the `match` column is computed by
  `pipeline/video_to_data/grades.py`).

This is an SI judgement, not a measurement. On 2026-11-15 one team member (Dobrin Alexandru)
checked every SI grade against the videos brightened x6, without looking at NASA's outcomes
(they were hidden on the review page; the checker states this, the check was not supervised).
What the check covers is listed below.

### The person's check and the review clips

- Input: `pipeline/video_to_data/t_series_checked.csv`, the person's own entries for the 11 graded
  tests (grade, the times the flame was seen from and gone, a note). T20 has no plain video and
  no row.
- Evidence (provenance `HAND_MEASURED`, flags `person_viewed` and `one_person`):
  `outcome_checked_by_person` (value is the grade label; conditions hold the SI grade,
  `saw_nasa_outcome_before_grading` ("no, as stated by the checker") and
  `agrees_with_si`: `yes`, `no`, or `decided` where SI said `cannot_tell`), and where the person
  gave times `flame_seen_time_checked` and `flame_gone_time_checked` (seconds, flag
  `approximate`: dim flames, about 1 to 2 s).
- Finding `find-t-series-person-check`: the person checked 11 SI grades, agreed with 10, decided
  T12 as no ignition (SI could not tell), changed 0, and the checked grade matches NASA's
  Table 7.1 in 11 of 11 tests. It fails only if a checked grade contradicts NASA's table. It is
  one person, so it is a check on the SI grades and not a measurement.
- Review clip `PSI-25_<T>_review.mp4` for each of the 11 tests: the picture below row 90 is
  brightened by a gain of 6 (clipped at white); the top 90 rows (NASA's on-screen numbers) stay
  as recorded. The label `NASA PSI-25 <T>, brightened x6` sits at the top left just below row
  90. H.264, no audio, at most 6 MB each. Test time is `start_s + currentTime * speed` (the
  `clip` entry of the test in `index.json`). A brightened clip is a way to look, not a
  measurement. T13 is interlaced (665 s): it is deinterlaced and the clip covers only its first
  135 s, the stretch with the test.
- Read-out `PSI-25_<T>_readout.csv`: the on-screen numbers read by the same reader as the B
  tests (same columns), cut to the clip's range. The reader could not read any number of T13,
  raw or deinterlaced, so T13 has no read-out file and its `readout` is `null`.
- Index: each test in the `t_series` block gains `si_times`, `checked`, `clip` and `readout`;
  the block gains `checked_by` and `check_note`.

## Last faint light (B3 and B11 only)

Today's tracker uses fixed brightness thresholds (180 and 120) and loses a dim flame: in B3 it
stops at about 26.6 s while a dim red ring flame burns on to about 50 s, and in B11 it stops at
about 46.4 s while a faint ring is visible to about 96 s. For these two tests only, where an SI
viewer saw a flame at that time (`pipeline/video_to_data/faint_light.csv`), the engine adds a second
time, `last_faint_light_time` (evidence) and `events.last_faint_light_s` (`index.json`, null for
every other test). It is the time after which the tracker sees no light above a low fixed
threshold: 8 brightness units above the dark frames, in a region of at least 150 pixels (rule R1,
`pipeline/video_to_data/faint.py`). It depends on that threshold and can follow an ember or a
glowing sample holder; it is not the time the flame went out. The flag `threshold_dependent` is on
every such record, and `faint_small_region` when the last region is under 200 pixels. Ignition,
extinction, burn duration, rate, stages and fan numbers do not use it and are unchanged.
