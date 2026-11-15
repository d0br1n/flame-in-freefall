# Hand measurement of the flame spread rate (Linear DOB-43)

Why: an independent check on the pipeline that does not depend on any published table. If the
pipeline and two careful people agree, the number can be trusted. If they do not, the report says so.

Written with SI help (Claude Code). The measuring itself is done by people.

## The one rule

**Do not look at the pipeline's numbers until both of you have finished.** Do not open
`data/modules/video-to-data/` (`results.csv`, `findings.json`, `evidence.json`, the images) or
`published.csv` while you measure. Do not talk about your numbers with each other. Each of you
works alone and saves your own files. Comparing comes after, by `hand_rates.py`.

## Who and which videos

* Two people, each alone. Use your own two or three letters as initials (for example `DG`).
* The five videos are in `videos_to_measure.csv` (B1, B3, B4, B11, B13). All are real-time
  video of 100 to 400 micrometre PMMA film, 2 cm wide. The two videos of tests B5 and B6 were left
  out on purpose: their time base is held still images, so a video time stamp is not the real time.
* Use the **main** video file named in the list, not the "Still_Sequence" or "2ND_VIEW" file.
* The videos are in `data/raw/files/PSI-25/` (not in git; get them from a teammate or the server).

## What to mark

The **leading edge** of the flame: the front of the visible flame sheet, on the side toward the
unburned film. Mark where it is at one moment, then step forward in time and mark it again.

* Start when the flame has clearly started to spread from the igniter. End when the flame
  goes out, stops spreading, or the film is used up, whichever comes first.
* Mark about **once per second** of video time, and at least **15 points** per video.
  Marking every frame is not needed.
* If the flame cannot be seen at a moment, skip that moment. Do not guess.

## How

1. **Easiest: open `mark.html` in this folder** (double-click it; Chrome or Safari; nothing to
   install, the video never leaves your computer). Pick the test, type your initials, choose the
   video file. It steps one frame at a time, asks for the scale and the direction, lets you click
   the edge, and downloads `<TEST>_<INITIALS>.csv` in the right format. Your work is kept in the
   browser if you reload. Its times are frame numbers divided by 29.97 frames per second, the
   same time base as the pipeline.
   Otherwise: [Tracker](https://opensourcephysics.github.io/tracker-website/) (free) works too, or
   a video player that shows the time stamp and a spreadsheet.
2. **Scale is optional.** In the frames we checked (B1, B4, B13) the video is black with a text
   overlay and the flame: the sample is not visible, so there is no known length to calibrate on. In
   that case **skip the scale**. Positions are then saved in pixels, which is the unit the pipeline
   reports (px/s), and the comparison is made in pixels per second. **Never guess a scale.** Only if
   a video really shows a length you know (the sample width is 20 mm, BASS-II report Table A.1),
   click its two ends and type it: the file then also gets a `position_mm` column. Write in
   `NOTES.md` which length you used and its pixels.
3. Position = distance of the leading edge from the igniter end of the sample, **growing as the flame
   advances**. Click the igniter end, then a second point along the sample in the direction the flame
   spreads. Keep that line close to horizontal: the pipeline follows the edge along the image's x axis.
4. Time = the video's own time stamp in seconds (not a frame number, not the clock on the overlay).

## What to save

One file per person per video in this folder, named `<TEST>_<INITIALS>.csv`, for example
`B1_DG.csv`. The header and nothing else in the file; `mark.html` writes it for you:

```
time_s,position_px
3.203,41.0
4.204,63.5
5.205,85.0
```

(Example of the format only, not measurements.) If you calibrated on a visible length, a third column
`position_mm` is added. The reader accepts `position_px`, `position_mm` or both.

Time must increase from row to row. The reader rejects empty cells, text in a number column and
time going backwards, and says which line is wrong.

Add one line per file to `NOTES.md` (create it): file name, the length used for the scale, its
pixels, the tool, anything odd (flame hard to see, camera moved). Install nothing new without
adding it to `submission/REFERENCES.md`; if you used Tracker, add it there.

## After both of you are done

Run (one command, from the repo root):

```
uv run --python 3.12 --with-requirements pipeline/video_to_data/requirements.txt python -m pipeline.video_to_data.hand_rates
```

It fits each file with the same code as the pipeline (`fit.fit_spread_rate`), writes
`hand_rates.csv` (pixels per second, and millimetres per second where there is a `position_mm`
column), and prints how far the two people agree, in each unit. Two people agree when their rates
differ by less than 25% of the larger one. That limit is a first proposal. A pixel rate carries the
flag `no_scale`. A millimetre rate carries `hand_calibration_uncertainty_not_included`: the interval
does not include how well you calibrated.

Only after that is the pipeline compared with these rates (Linear DOB-42). Rates from these files
carry the provenance `HAND_MEASURED`.

## What this check cannot tell

* Two people can make the same mistake. Agreement shows they see the same edge, not that the edge
  is the true flame front.
* Five videos are five videos. A good match is not a proof for the other tests.
* A rate in pixels per second is not a spread rate in mm/s. It says whether the pipeline and two people
  see the same edge moving at the same speed, not how fast the flame spreads in millimetres. Turning it
  into mm/s needs a scale that none of these videos shows.
* The hand rates inherit the video's own limits: 720 pixels wide, and a rate under 1 pixel per second
  is hard to see.

## The SI draft (`<TEST>_SI.csv`)

To save time, `pipeline/video_to_data/si_draft.py` made a draft of the leading edge for B1, B3, B4, B11 and B13
from the video pixels (red-hued bright pixels in the band of rows where the flame lives, rightmost column of the
largest blob; a more sensitive rule follows the faint flame after the bright phase in B3, B11 and B13, marked
`dim` in the `mode` column). It does **not** use the pipeline's tracker or output. Points are saved about once per
second in pixels.

* Provenance is `SI_EXTRACTED`, never `HAND_MEASURED`; the rows carry the flag `hand_checked_by_team_member` (Daria
  watched all five review videos, 14 Nov 2026, and approved them). Say "SI-measured, hand checked". A team member watched the review videos and accepted the
  drafts without corrections. That is a check by one person of an automated result, not an independent human
  measurement, and the reader never counts it as a person in the person-against-person agreement.
* Known weak spots, left as they are: B13 before about 55 s (a large white igniter glow dominates; the edge rises
  only about 2 px/s, so it may not be spread), the ignition flash at the start of every test, B11 between 48 and 61 s
  (the faint flame flickers out of detection), and B13 and B3 where a faint blue arc extends beyond the pink flame.
* The person-against-person check described above is still open: it needs two people who have not seen the
  pipeline's numbers.
