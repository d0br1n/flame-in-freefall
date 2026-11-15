# Demo video script (30 seconds or less) and final checklist

Linear DOB-47 (video) and DOB-49 (final checks). The video is recorded by a person from the
real site. This file is the script, the shot list and the checks. Written with SI help
(Claude Code); the team edits the wording and records it.

## Rules the file must meet (gates G3, G4, G5, G8, G11)

- 30 seconds or less; export at 28 to 29 s; check the exported file with
  `python3 .claude/skills/space-apps-judging/scripts/check.py`, not the editor timeline.
- English subtitles burned in (it must work muted). Spoken Romanian only with English subtitles.
- Screen recording of the real site, not slides. No stock or copyrighted music. Nobody under 18
  on screen or in audio. No NASA logo or mission patch in any frame; say "built on NASA open
  data" in words.
- Public link, no login, opens in a private window. Put the file in `submission/demo/` only if
  it is under 10 MB (gate); otherwise keep it out of git and link it.

## Beat sheet: ready to record (29 s). Checked line by line on the live site and in `findings.json` (15 Nov, Fable 5.2 review plus a manual check)

Product name: **burnrate**. The tagline in `apps/web/lib/site.ts` is only in the page's meta description, not visible on any page, so the video shows the Overview and does not promise an on-screen tagline. Re-read the live site before recording; if a screen differs, change the shot, never the claim.

| Time | On screen (real site, light theme) | Subtitle burned in | Source of the line |
|---|---|---|---|
| 0:00-0:03 | Overview page (or a title card) | "The Overfitters, from Cluj-Napoca, Romania." | team, `site.ts` |
| 0:03-0:07 | Overview | "burnrate: NASA microgravity flame tests, traced to source." | `site.ts` |
| 0:07-0:12 | Investigations list, scroll | "All 24 combustion investigations in NASA's PSI archive, in one place." | catalog, live "24 of 24" |
| 0:12-0:19 | Video to Data, test B1 detail (one click on B1 in the Tests list, or the address `/spread?test=B1`) with the tracked flame edge; press play on the clip. The clip plays: all 18 clips loaded on the live site on 15 Nov, 12:40 EET. **Only if it does not load when you record:** the table of tests on Video to Data, without opening Test B1 | Clip plays (it does since port 8000 opened; the page itself says "18 of 129 tests processed"): "Our tracker follows the flame in NASA's BASS-II videos: 18 tests processed so far." Otherwise: "18 BASS-II tests processed from NASA's videos." | `find-tests-measured` |
| 0:19-0:23 | Click a value under "The numbers" (or the "18 tests" figure on Overview): the evidence panel opens. Its "Open on psi.nasa.gov" link opens the investigation's page since 15 Nov (DOB-110), but do not click it in the video: rule 4 below keeps the PSI website out of the frame | "Click a number to see the NASA test and file behind it." | evidence panel |
| 0:23-0:27 | Overview: click the "High oxygen" chip; the Video to Data and Suppression test bench cards turn to "Never tested in this air" | "Pick a cabin air. Where NASA's data has no test, we say so." | live site, works in saved-copy mode |
| 0:27-0:29 | Closing card | "Built on NASA open data." | challenge wording |

Optional variant for 0:23-0:27 (bench): pre-scroll to "Try a mixture", drag its Oxygen slider from 21% to 24%, leave the cabin-air control out. Subtitle: "Pick a mixture. No FLEX test near it: no prediction." The bench is not driven by the cabin-air control, so never combine the two in one shot.

Reading speed: every subtitle is at or under 15 characters per second in its slot. About 70 words: subtitles only is safest; if you speak, read them as written.

Left out on purpose: the hand-check result (SI-measured, hand checked, 26% error, not an independent hand measurement), the pixel units and the assistant. 29 s has no room for their caveats. "Measured" in the 0:12 line means the tracker's spread rate from the video; 8 of the 18 are seen spreading and 6 have a steady unflagged rate, so never say "all spread at X".

Known weak point, closed on 15 Nov: the backend is live, so the banner "Showing a saved copy: the live data service did not answer" no longer shows (checked on every page, 12:40 EET). If it shows when you record, the backend is down: tell the team and record once it is back; otherwise crop it out of the frame rather than hide it in the edit.

## The video exists: `submission/demo/burnrate-demo.mp4` (15 Nov, recorded by SI from the live site)

29.45 s, 1920x1080, 60 frames per second, no audio, under 10 MB, English captions burned in, and
a visible label on every frame: "Screen recording of the live site". The label named SI in the
first cuts; Iustin shortened it on 15 Nov. The video is a screen recording, not generated
imagery, and its SI use (the recorder and the edit) is declared in the file's comment metadata,
in `submission/SI_USAGE.md` and should be repeated in the description where it is uploaded.
Made with `tools/demo/` (see its README): a scripted cursor drives the real site and
the recording is framed in the style of Vic Giurgiu's product videos on X (window on a gradient,
the camera zooms into each click). Every pixel inside the window is the live site.

**The route replaces the beat sheet above.** Iustin chose it on 15 Nov after watching two
earlier cuts: no zoom on the Overview, then Scenarios (Artemis II, scrolled), Video to Data
(test B1) and the Suppression test bench. Each caption restates what the page on screen says:

| Time | On screen (clicks are real) | Caption | Where the page says it |
|---|---|---|---|
| 0:00-0:04 | Overview, whole window; click Scenarios; the two scenario cards; click Artemis II (April 2026) | "The Overfitters present burnrate: NASA flame tests, traced to source." | team, `site.ts` |
| 0:04-0:11 | Artemis II: the alarm headline, scroll past "what happened" and what burnrate would have shown, down to "15 flames, one fan": the fan slows and the flames go out at the times measured from the PSI-25 videos | "What burnrate would have shown: cut the fans. 7 of 8 burning flames went out within 2 s." | Artemis II page: "Cutting the fans works: 7 of the 8 flames still burning went out within 2.0 s of the fan slowing" (PSI-25 BASS-II) |
| 0:12-0:19 | Click Video to Data, click test B1, play NASA's clip and hold one still framing: the clip with the tracked flame edge on the left, its chart on the right with the cursor line moving | "Our tracker follows the flame in NASA's own BASS-II videos and charts where it was." | Test B1 page: "The footage and what was measured from it", "Where the flame was", source PSI-25 |
| 0:19-0:25 | Click Suppression test bench, Try a mixture, Carbon dioxide, drag its share from 0 to 70%: the predicted share burned falls from about 91% to about 52% | "Add carbon dioxide: less of the droplet is predicted to burn." | Try a mixture: "With 70% carbon dioxide the predicted burn falls from about 88% to about 52% of the droplet" (FLEX, PSI-69) |
| 0:25-0:28 | Drag Oxygen from 21% to 12%: "No real FLEX test is near this mixture: no prediction" | "No real NASA test near your mixture? No prediction." | Try a mixture, the prediction box |
| 0:28-0:29 | Zoom back out | "Built on NASA open data." | challenge wording |

Not in this cut: the evidence panel, the cabin-air chips and the engine view of Video to Data
(Iustin, 15 Nov: that part moved too fast, keep the clip and its chart only). Length: 29.45 s, because
`check.py` fails a file above 29.5 s as too close to the 30 s limit.

Uploaded by Iustin on 15 Nov: https://youtu.be/ONnKjQW7STY (YouTube, unlisted, opens with no login).
The link is in `submission/PROJECT_PAGE.md` under "Link to Project Demo".

## The cut with slides: `submission/demo/burnrate-demo-30s-with-slides.mp4` (15 Nov, evening)

29.43 s, 1920x1080, 30 frames per second, no audio, under 10 MB. Remade at Iustin's request
after a teammate asked for fewer slides, passed in a few seconds, and a demo where each step is
clear. Five slides of 1.5 s each (`submission/demo-deck/`, 7 slides before), then the recording
above at 1.3x (it was 3.5x in the first cut with slides) with a label for every step.

| Time | On screen | Text |
|---|---|---|
| 0:00-0:01.5 | Slide 1, intro | burnrate, the tagline, team The Overfitters, Cluj-Napoca, the six names |
| 0:01.5-0:03 | Slide 2, the problem and the situations | "Every crew asks if the fire spreads and what kills it." Apollo 1 (1967), Artemis II (2026), 30 TB you can download but not ask |
| 0:03-0:04.5 | Slide 3, computer vision | "We turn NASA's flame videos into usable data." Test B1: 9.6 px/s, 27.2 s, 1.6 s (PSI-25) |
| 0:04.5-0:06 | Slide 4, the gas mixture model | "Change the gas mixture. See what puts the flame out." 274 droplet flames (PSI-69 FLEX) |
| 0:06-0:07.5 | Slide 5, the rest | Catalog, AI assistant, filters, Compare, insights, evidence and limits |
| 0:07.5-0:10.9 | Overview, Scenarios, click Artemis II | STEP 1, SCENARIOS: "Open a real incident: the Artemis II fire alarm, April 2026." |
| 0:10.9-0:15.9 | Artemis II, "15 flames, one fan" | STEP 1, SCENARIOS: "NASA's tests answer it: cut the fans. 7 of 8 burning flames went out within 2 s." |
| 0:15.9-0:21.6 | Video to Data, test B1, clip and chart | STEP 2, VIDEO TO DATA, COMPUTER VISION: "Our tracker follows the flame edge in NASA's own video and charts where it was." |
| 0:21.6-0:25.9 | Suppression test bench, Try a mixture, carbon dioxide to 70% | STEP 3, SUPPRESSION TEST BENCH, GAS MIXTURE MODEL: "Add carbon dioxide to the air: less of the droplet is predicted to burn." |
| 0:25.9-0:28.4 | Oxygen from 21% to 12% | STEP 3: "Lower the oxygen: no real NASA test is near this mixture, so no prediction." |
| 0:28.4-0:29.4 | Zoom back out | TRY IT, BUILT ON NASA OPEN DATA: "burnrate.website: opens in any browser, no login." |

The step labels sit on a dark band over the recording's own captions (same claims, larger
type). The corner label reads "Screen recording of the live site, sped up 1.3x". Made with
`tools/demo/slides_cut.sh` (see `tools/demo/README.md`).

**Not uploaded yet.** The link on the project page still opens the cut without slides
(https://youtu.be/ONnKjQW7STY). To use this cut, upload it (YouTube, unlisted) and replace the
link in `submission/PROJECT_PAGE.md` and on the form.

## Before you record (10 minutes)

1. Open https://burnrate-psi-rosy.vercel.app in a private window. Open each page once first and record only after its content shows: about 2 s per page with the backend live (measured 15 Nov). If a page stays on "Loading", the backend is unreachable: tell the team before recording. Cut nothing out of the middle of a shot.
2. Check that the Video to Data detail clip plays (DOB-86, DOB-116; it did for all 18 tests on 15 Nov). If it shows "The overlay clip could not be loaded", use the fallback shot in the 0:12 row. Do not claim a tracked overlay you did not film.
3. Screen recording only: macOS Shift-Command-5, 1080p, browser zoom 125% so subtitles read on a phone.
4. No NASA logo or mission patch in any frame. Do not show the PSI website.
5. Burn the subtitles in (CapCut, iMovie or DaVinci Resolve; white text on a dark bar). Music: none, or music you made or that is licensed for this use, logged in `submission/REFERENCES.md`. Nobody under 18 on screen or in the audio.
6. Export 28 to 29 s, then run `python3 .claude/skills/space-apps-judging/scripts/check.py` (G3 reads the file in `submission/demo/` if it is under 10 MB; otherwise keep it out of git and link it).
7. Upload where a private window can open it with no login (YouTube "unlisted"), then send the link to iustin for `submission/PROJECT_PAGE.md` "Link to Project Demo".

Do not say: "AI-powered", "fire behaves differently in microgravity", "decades of NASA
research", "hard to find, compare and interpret", any claim that NASA endorses it, any figure
that is not in a `findings.json` (`research/RECOMMENDATION-2026-11-14.md` section 12).

## Final run (DOB-49), Sunday; the real deadline is a team decision (DOB-65)

1. `python3 .claude/skills/space-apps-judging/scripts/check.py --online` is all green, G2 included.
2. `submission/PROJECT_PAGE.md` has no TODO; names, links and numbers are final.
3. Open the demo link and the project link in a private window, on a phone and a laptop.
4. Read the project page top to bottom as a stranger: challenge, solution, why it matters.
5. Team page: all members listed, same Local Event, none waitlisted.
6. Paste the references and SI fields from `REFERENCES.md` and `SI_USAGE.md`.
7. Tick both boxes, click Submit for Judging, confirm the banner. Resubmitting is allowed until
   the deadline; only the last save counts. Stop editing 30 minutes before the deadline.
8. If the site is new, file the FortiGuard web-filter form (company name "N/A").
