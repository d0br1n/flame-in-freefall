# Presentation playbook: how The Overfitters present to win

Written 2026-11-14 with Claude (SI) for every session that builds our presentation: the
project page, the 30-second demo video, the live site's first screen, the README and the live
pitch at the Cluj-Napoca local event.

**Scope.** This file is about how we present, not what we build. It is idea-agnostic on
purpose: the humans choose the idea and the story (current proposal:
`research/user-research-2026-11-14/PLAN.md`, not final). Apply these rules to whatever they
choose.

**Precedence.** The official 2026 guides win over this file:
`.claude/skills/space-apps-judging/reference/judging-guide.md` and `submission-guide.md`, then
the `space-apps-judging` skill, then `docs/00-challenge-description.md` for the challenge. Load
the `space-apps-judging` skill before using this playbook. If a rule here conflicts with them,
follow them and fix this file.

**Evidence base** (details and sources in section 14):

- the official 2014-2026 guides;
- 37 Global Winner project pages from 2019-2025, compared with 113 pages that won less or nothing;
- 4,688 Space Apps repos found on GitHub, 2,641 kept after filtering out lists and profile
  pages, and 57 award claims checked against the official lists;
- 129 competing 2026 "Flame in Freefall" repos, with 22 live sites opened;
- judges', organizers' and winners' advice.

Each rule carries a tag:

- `[RULE]` means the official 2026 guide says it.
- `[EVIDENCE]` means we measured it in past winners or the 2026 field.
- `[ADVICE]` means a judge or organizer said it.
- `[INFERENCE]` means our reasoning from the above.

---

## 1. The twelve laws (read these if nothing else)

1. **The project page is the product.** "The majority of judges' evaluation will be based on
   your project submission." Global judges read the page blind, with no live pitch. Anything
   said only out loud on Sunday does not exist for them. `[RULE]`
2. **Show, don't announce.** Winners linked a video demo far more often than other teams did
   (65% vs 22%) and a hosted, clickable product (45% vs 31%). In the one challenge where six
   teams built nearly the same tool, the Best Use of Data winner was the one with a hosted app
   and a video; the others linked a repo or a Drive file. `[EVIDENCE]`
3. **First sentence = what it is, for whom, with which NASA data, why it matters.** Winners
   open with one declarative sentence about the artefact. Teams that won nothing open by
   restating the challenge. `[EVIDENCE]`
4. **Lead with one concrete thing only we have:** an object, a question or a number. Do not
   lead with a category noun such as "platform", "dashboard" or "intelligence engine". After
   50 near-identical entries, the only first screens a judge remembers are the ones built
   around one concrete thing. `[EVIDENCE]`
5. **Name the data down to the ID.** Winners name datasets at the product or archive level
   and say how much they used (for example, "23 flights, about 20 million rows"). Teams that
   won nothing write "NASA data" or "the Resources tab". Winners' NASA data sections run about
   twice as long (median 99 words vs 49). For us: every PSI investigation by its ID, with a
   link, what we used (runs, files, variables) and what it cannot tell. `[EVIDENCE]`
6. **Show the analysis, not just the app.** Best Use of Data winners read like a short methods
   section with results: a real plot, a number with its uncertainty, the processing steps.
   Winners put a number in their summary twice as often (55% vs 26%). `[EVIDENCE]`
7. **Say what the data cannot tell, before anyone asks.** Finalists did this more than nominees
   (3 of 4 vs 2 of 14). Only 17 of 129 rivals have a limitations section. It raises Validity,
   and the challenge author, who will likely lead global judging for this challenge, will look
   for it. `[EVIDENCE]` `[INFERENCE]`
8. **The demo is 30 seconds or less, checked on the exported file.** Over the limit means not
   eligible for global judging. Several of the best-presented rivals already miss it (31 s,
   1 min, 2:38, 3:57). We aim for 28 s. `[RULE]` `[EVIDENCE]`
9. **It must work on the first click.** No login, no cold-start blank screen, a result visible
   on first load, and a static backup. 10 of 11 past winners' live links still work, mostly
   on static hosts. The dead ones sat on paid tiers or free backends. Rivals on Streamlit or
   Flutter show blank screens for 7 to 30 s. `[RULE]` `[EVIDENCE]`
10. **Never overclaim.** Every number traces to a PSI investigation ID and a script in the
    repo. Overclaims cost points under Validity, and an expert reader will catch them.
    `[RULE]` `[INFERENCE]`
11. **Everyone on stage can explain the method without notes.** A judge's report of an
    SI-heavy team: "When I asked them to explain their solution ... they struggled." We
    disclose SI use, so we must own the reasoning. `[ADVICE]`
12. **Presentation is one fifth of the score, and it also carries the other four.** The guide
    warns that teams neglect it. One person owns the demo and the page from Saturday
    afternoon. `[RULE]`

---

## 2. Who judges us, and what each of them sees

| Stage | Who | What they see | What they reward |
|---|---|---|---|
| Local, Sun 15 Nov (pitching reported for 15:30, unconfirmed) | Cluj jury, all from industry: Minyo & Co, Regnology, Synaptiq, Control Data Systems. None from combustion or space | The live pitch plus the project page | Same five criteria, 1 to 5. Romanian events also note "team cohesion" and "clarity of presentations" |
| Global Nominee to Finalist (announced 3 Dec, then 17 Dec) | NASA and partner subject-matter experts. In past years the challenge author led judging for the challenge, with three blind reviewers per project | The project page, the 30 s demo and the links. **No live pitch** | Validity and Relevance read by people who know PSI better than we do |
| Global Winner (announced 26 Jan 2027) | NASA and partner executives | The same page and demo | Impact and a clear story. Best Use of Data: "best makes space data accessible or leverages it to a unique application" |

Consequences:

- **Two audiences, one page.** The page must make sense to an industry juror in 30 seconds and
  survive a combustion expert reading every line. Plain words up top, exact detail one level
  down. `[INFERENCE]`
- **Local slots are scarce.** Roughly 29 teams at Cluj compete for about 2 nominee slots. In
  2025, Cluj sent one or two teams (sources disagree). Euronews says "at least 3" advance from
  Bucharest and Cluj (the reading as a total or per city is disputed). Plan to place first
  locally. `[EVIDENCE]` `[INFERENCE]`
- **Being someone's first choice beats being everyone's fourth.** Judges often stack-rank. A
  memorable, distinct entry beats a complete but generic one. `[ADVICE]` (MLH judging plan)

---

## 3. The field we are up against (measured 2026-11-14)

129 GitHub repos created in 2026 target Flame in Freefall. Some are already-finished entries
from events held earlier (Cairo, for example). No Cluj or Romanian rival was found yet; that
check is weak, since local teams may not have pushed.

The **default submission** a judge will see dozens of times:

- **Name:** the challenge title itself (42 of 129), or Flame/Fire plus
  Guard/Lens/Scope/Sense, or IGNIS, EMBER, FLARE, PROMETHEUS (124 of 129 names contain
  flame, fire, ignis, ember or pyro).
- **Opener:** "AI-powered (or SI-powered) fire safety insights", then a physics primer: no
  buoyancy, the candle flame becomes a blue sphere (23), "decades of NASA research is hard to
  find, compare and interpret" (that is the brief's own phrase).
- **README:** a wall of badges, a tech stack, a directory tree and install steps. No
  screenshot (106 of 129), no video (only about 8 have one; fewer than 3 are 30 s or less), a
  placeholder "Live demo (#)".
- **Site:** dark navy with an orange flame. The tabs are Explorer, Compare, Rank, Gaps and Ask
  AI. Habitat presets, a weighted ranking with sliders (68), a chatbot that "cites every claim"
  (61).
- **Headline finding:** "no solid was tested above 22.2% O₂, while Moon habitats run 30-34%",
  in at least 10 entries.
- **Trust slogans that are now the default:** "evidence-first" (29), "every claim cited"
  (27), "says so when NASA never tested it" (22), "not a certified safety tool" (16-31).

**Rules from this:**

- **Do not use** as our name, tagline or headline: the challenge title as the product name;
  flame, fire, ember, ignis, flare, guard, lens, scope, sense, sight or Prometheus names;
  "-X" suffixes; backronyms; "AI-powered" or "SI-powered platform"; "intelligence platform",
  "engine", "mission control", "digital twin", "comprehensive", "mission-grade"; "fire behaves
  differently in microgravity"; "decades of NASA research"; "hard to find, compare and
  interpret"; the 22.2% O₂ gap as our main finding.
- **Show trust, don't claim it.** Citations, honesty about gaps and disclaimers are now
  expected, not distinctive. Show them in the product, for example by clicking a number to
  open its PSI source, and never make them the tagline.
- **Look different on sight.** A light, report-like, print-style look stands out in a field
  of dark space and orange. Use real PSI or NASA imagery credited with its PSI ID; no
  SI-generated flames. `[EVIDENCE]` `[INFERENCE]`
- **Match the best rivals, at minimum:**
  - a first sentence that says what it is, for whom and why now;
  - video and live-app links at the very top;
  - an "At a glance" table;
  - a live result on first load;
  - named PSI IDs with links;
  - numbers traced to their table and page;
  - short Limitations and Use of SI sections;
  - a light mapping of the project to the five criteria.
- **Show a data trap we caught.** The most trustworthy rival move is "the copied value said X;
  NASA's table on page N says Y; we fixed it". One specific trap, shown and fixed, beats "every
  claim is cited". `[EVIDENCE]`

Refresh these numbers before the final submission if time allows. The field is still growing
during the weekend.

---

## 4. Project page rules (the judged artefact)

Drafts live in `submission/PROJECT_PAGE.md`. Write every field so it can be read alone.

**Global rules for every field**

- English only, plain words, short sentences. Write for a reader with "no context, technical
  background, or previous knowledge". `[RULE]`
- Use the order challenge, solution, why it matters at every level: the summary, each section,
  the video. `[RULE]`
- A judge skims and searches with Ctrl-F. Put the literal strings they look for in the text:
  "PSI-xx" investigation IDs, "NASA", "Flame in Freefall", "Limitations", "Use of SI".
  `[ADVICE]`
- Every number carries its source (PSI ID, and the table, file or script) and its unit. Give
  sample sizes ("8 tests", "273 runs"). Never a bare percentage. `[RULE]` (CLAUDE.md)
- Images: 2 to 4 real screenshots or plots (JPG, PNG or GIF up to 10 MB). Winners' median is
  2.5 images; teams that won nothing have a median of 0. Each image gets a one-line caption
  that says what to notice. `[EVIDENCE]`
- Recheck any field that changed when a feature changed. The page must match what exists.

**Field by field**

| Field | Do | Don't |
|---|---|---|
| Project Name | Short, ownable and memorable; says what the user gains or names the one concrete thing. Check it against the saturated list in section 3 | The challenge title, flame or fire compounds, backronyms |
| High-Level Project Summary | Three short paragraphs. (1) What we built, for whom, on which PSI investigations, in one sentence with one real number. (2) How it addresses the challenge: summarize, rank, interpret, fire-safety insight. (3) Why it matters: the crew decision it informs, and who else benefits | Opening by restating the challenge; buzzwords; a physics primer |
| Link to Project Demo | One link only: the ≤ 30 s video, public or unlisted on YouTube, playable with no login | Drive links that ask for permission; a second link |
| Link to Final Project | The live site, deep-linked to a prepared case if possible, and linking to the public repo | localhost, a paid tier, cold-start hosting |
| Detailed Project Description | Sections in this order: what it does (with screenshots), how it works (pipeline steps, each with a plot or screen), the result (the finding or number, with uncertainty), what the data cannot tell, benefits, what's next, tools and languages. Add a five-row "how this meets the judging criteria" table at the end, factual, one line each | Install instructions; a feature list without pictures |
| Use of SI | Itemised: which tool, what it did, what humans did, what was checked. "No SI-generated images, logos or NASA branding" if true | Vagueness. Note: judges do not see this field, so the same disclosure must also be in the README and the page body |
| NASA Data | One line per PSI investigation: ID, name, link, what we used (files, runs, variables, counts), what it contributed, and the preprocessing in one clause. Then one line on what PSI cannot tell us | "We used NASA data" or "the Resources tab" |
| Space Agency Partner Data and Other References | Everything in `submission/REFERENCES.md` | Anything missing from the ledger |

**Optional, and permitted:** a longer walkthrough video (60 to 120 s) linked from the page body
or the final project. Staff answer, 9 Nov 2026: "There is no time requirement or limit for
project link videos." It can never replace the ≤ 30 s demo. `[RULE]` (GO Team answer,
discussion 1857)

---

## 5. The 30-second demo video

Format: video, decided by the team (`space-apps-judging` skill). Seven slides have also won
Best Use of Data (2022), but only one demo format can be linked; change it only if the humans
decide to.

**The official beat sheet, and how to fill it** `[RULE]`, mapped to And-But-Therefore
`[ADVICE]`

| Time | Official beat | What goes on screen |
|---|---|---|
| 0:00-0:02 | Who we are | Team name plus first names, as on-screen text over the first product frame. No logo intro |
| 0:02-0:05 | The challenge and why we chose it (**And**) | One hook line: the concrete situation or object, ideally from the brief (for example, the alarm on Artemis II) |
| 0:05-0:10 | Title and tagline (**But**) | Product name and one tagline that states the gap or tension in plain words |
| 0:10-0:20 | How it works, the real product, a user's experience, how NASA data made it possible (**Therefore**) | A real screen recording: one user action, one result, and one number on screen with its PSI ID |
| 0:20-0:28 | The future | What it changes for crews and for Earth fire safety, then the URL on screen |

**Rules**

- **Real product on screen from second 0.** Judges "need to know what they're looking at"
  early, and a live demo "removes doubt". A montage of slides about the product loses.
  `[ADVICE]`
- **It must work muted.** About 92% of mobile viewers watch with the sound off. Burn English
  subtitles into the video, use large type and keep each claim readable without audio. Also
  upload an `.srt`. Auto-captions garble "PSI-69" and "microgravity". `[EVIDENCE]` `[RULE]`
- **One claim, one number.** Thirty seconds holds about one finding. Pick the strongest and
  cut the rest.
- **Export at 28 to 29 s** and verify the file with `check.py`. Never trust the editor
  timeline. Three 2020-22 winners ran 0:31, which would be ineligible today. `[RULE]`
- **The last frame points to the page:** the URL and "full results and data on the project
  page". The demo's job is to make a judge read the page. `[ADVICE]` (2022 guide)
- **Hosting:** YouTube, public or unlisted. Title: "<Project name>: NASA Space Apps 2026,
  Flame in Freefall". The description links the live site, the repo and the PSI investigations.
  `[EVIDENCE]`
- **Legal:**
  - no copyrighted music (silence, or a licensed or self-made track listed in REFERENCES);
  - nobody under 18 by face, voice or name;
  - no NASA insignia;
  - a visible "SI-generated" watermark on any SI-made frame or image;
  - any SI voiceover declared in the text and metadata. `[RULE]`
- **Ownership:** one person owns the video from Saturday afternoon. Make a rough cut early;
  only polish late.

---

## 6. The final project link: what a judge sees on the first click

- **A result on first load.** The first screen shows the answer or finding, not an empty
  search box or a loading spinner. Deep-link to a prepared case, such as `?case=...` or a
  "Start here, judges" link. `[EVIDENCE]`
- **No login, no cookie wall, no permission request.** Test in a private window on a laptop
  and a phone. `[RULE]`
- **Hosting:** static hosting such as GitHub Pages, Netlify or Cloudflare Pages, or a
  pre-warmed backend. Keep a static "lite" copy as a backup link. No paid tier that can lapse
  after the event (judging runs until January). `[EVIDENCE]`
- **Lineage visible in the UI:** every figure has its PSI ID and a link back to psi.nasa.gov.
  This is the visual proof of "NASA data is integral". `[RULE]`
- **A "What this cannot tell you" panel**, short and specific, reachable in one click.
- **Usability is scored under Validity:** fast load, readable on a laptop, no dead buttons,
  sensible empty and error states. `[RULE]`
- **Freeze what we submit.** Tag the submitted commit (for example `submitted-2026-11-15`) and
  keep the live site on it during judging. `[INFERENCE]`
- **File the FortiGuard classification** as soon as the URL exists, so that judges behind
  web filters can open it. `[RULE]` (skill)

---

## 7. README rules (linked material)

A key measured fact: winners' READMEs were not better than other teams'. Their median length
was about 2.1k characters against 6.5k; seven were under 1,000 characters, and the 2022 Best
Use of Data winner's README is 65 characters. Polished award repos were rewritten after
winning. The README did not decide awards; the page and the demo did. So the README is a hub,
not an essay. `[EVIDENCE]`

**What fits in the first screen, in this order**

1. The title, then a one-sentence tagline with the concrete thing and a PSI ID.
2. A 6-8 s GIF or a screenshot of the core interaction, linked to the live site. Only 1 rival
   has a GIF.
3. Three links: ▶ the 30 s demo · the live app ("public, no login") · the project page.
4. An "At a glance" table:
   - the video and its length;
   - the live URL;
   - data counts with PSI IDs;
   - what SI does and does not decide;
   - the number of automated checks.

**Then, briefly**

- the finding with its number and source;
- how it works, in 3 to 5 steps;
- data (PSI IDs, links, what we used);
- Limitations;
- Use of SI (required: it is linked material and judges see it);
- the team;
- how to reproduce (short, and at the end).

**Skip:** badge walls, directory trees, long install guides above the fold, emoji headings,
tables of contents for a short README, award banners, a pasted copy of the form. These are
noise. `[EVIDENCE]`

---

## 8. The live pitch at Cluj (local judging)

Unknowns: ask the Local Lead about the slot length, the Q&A, the projector and screen setup,
and whether submissions close at 15:00 or 23:59. Until we know, prepare a 3-minute version and
a 5-minute version. The 2019 official FAQ says pitches run 3 to 5 minutes; MLH uses 2 minutes
of pitch and demo plus 1 minute of questions.

**Structure** (adapted from the official 2017 "240 Seconds of Glory" model, rescaled)

| Share | Part | Content |
|---|---|---|
| ~15% | Who and hook | "The first 15 seconds are crucial to get them leaning forward." One real situation, object or question. No agenda slide, no team-bio slide |
| ~20% | Why: the problem made human | Who is affected and what decision they face. One "killer data point" with its source. "If you can't do this in 60 seconds you're taking too long" |
| ~45% | What: live demo | Show the product doing the one thing. Click a number and land on its PSI source. Say the investigation ID out loud. Show one limitation on screen |
| ~20% | Impact and next step | What it changes for crews and on Earth, and what would come next with more data or time |

**Rules**

- **Rehearse the first 30 seconds out loud** until they are automatic: "That is where the
  score is set." Time every full run; the first run tells you what to cut. `[ADVICE]`
- **Live demo, with a recorded fallback saved locally** on the presenting laptop, playable
  offline. "Wifi fails at most events I judged." `[ADVICE]`
- **At most one or two slides** (title and hook; perhaps one chart). "Slide decks fill time.
  They do not persuade." `[ADVICE]`
- **Pitch to the industry jury.** Start from a problem and test it on concrete data: "I'm not
  looking for the prettiest pitch. I'm looking for teams that start from a problem and test
  their idea on concrete data" (Bucharest juror). Never let a sentence need combustion
  background. Say "which gas puts the fire out", not "adiabatic flame temperature".
  `[ADVICE]`
- **Show cohesion.** Two speakers at most for the pitch, with clean handovers. Everyone
  answers questions in their own area. Romanian juries cite "team cohesion". `[EVIDENCE]`
- **Don't narrate what's on screen;** say what it means. "Judges watch and listen at the same
  time." `[ADVICE]`
- **Use the mentors' "pitch help" on Sunday morning** for one dry run in front of a stranger.
  `[EVIDENCE]`
- **Everything said must also be on the page.** The global judges never hear the pitch.

**Q&A preparation** (Q&A "often runs as long as the demo itself"). Write a one-line answer to
each of these, and drill them:

1. Where does this number come from? Open the PSI file, table or script live.
2. What can this data not tell you? Give the specific limits: gravity levels never tested,
   sample sizes, materials, and anything the data does not cover.
3. What did the SI do, and what did you do? Who checked it, and how?
4. How is this different from the PSI website, or from asking a chatbot?
5. Who would use this, and for what decision?
6. What is the error, uncertainty or validation? Give a plain baseline.
7. What would you do with three more months?

---

## 9. Words: how we write

- **And, But, Therefore**: set-up, conflict, resolution. Never "and, and, and". `[ADVICE]`
- **One idea per sentence. Active voice. No hype words:** revolutionary, cutting-edge,
  seamless, powerful, comprehensive, unlock, harness, leverage. Use numbers instead.
- **Concrete over abstract:** a named user (a spacecraft fire-safety engineer, a mission
  designer, a student), a named decision, a named investigation.
- **Calibrated claims:** "in these 8 tests", "within 17 K", "we have not checked X".
  Calibration reads as competence to the expert reader and costs nothing with the local jury.
- **Say "SI" as the challenge does**, and describe precisely what it does. A model that is
  "AI-powered" in name only is the field default.
- **No NASA endorsement implied.** Write "built on NASA open data (PSI)"; never imply NASA
  approved, certified or uses our tool. `[RULE]`

---

## 10. Visual rules

- **No NASA insignia** (meatball, worm), flags or mission identifiers in anything we make or
  generate. The Space Apps logo, if used, goes unaltered on a clean background. `[RULE]`
  (brand guide 2026)
- **Contrast of at least 4.5:1;** large type in the video, readable on a phone. `[RULE]`
- **Real imagery first:** screenshots, our plots from PSI data, NASA PSI images credited with
  their PSI ID. SI-made images need a visible "SI-generated" watermark, so avoid them.
  `[RULE]`
- **A distinct look:** light and report-like, not dark space and orange (section 3).
- **One chart, one message.** Title each chart with its takeaway sentence, not a variable name.
  Show the units, n and the source (PSI ID) on the chart itself. Load the `dataviz` skill
  before making any chart.
- **Fonts:** Fira Sans and Overpass are the free Space Apps brand fonts and are a safe choice.
  Any font used goes in `submission/REFERENCES.md`.
- **Nobody under 18** in any image or video. Two 2021-22 winners showed schoolchildren, which
  is not allowed in 2026. `[RULE]`

---

## 11. Validity signals that are also presentation

These are cheap, rare in the field, and read by the expert judges.

- A **Limitations** section in the page, the README and the UI. Only 17 of 129 rivals have one.
- A **data trap we found and fixed**, shown in one sentence with the PSI file, table and page.
- **Numbers reproduced by a committed script**, with the script named next to the number.
- A **baseline or sanity check** next to any model output.
- An **SI disclosure that is itemised and checked**, in the README and the page body, with
  watermarks where needed.
- **Evidence of real use**, if we can get it honestly: for example, "a mentor or engineer used
  it to answer X". It is rare and it wins (MIMBI, Best Storytelling 2022: "over 300 people
  visited" in 4 hours). Never invent it. `[EVIDENCE]`

---

## 12. Pre-submit presentation checklist

Run this after `python3 .claude/skills/space-apps-judging/scripts/check.py --online` is green.

- [ ] The first sentence of the summary says what, for whom, with which PSI data, and why,
      with one real number.
- [ ] The name and tagline avoid every saturated term in section 3.
- [ ] Demo: the exported file is 28 to 29 s, has burned-in English subtitles, plays muted,
      shows the real product from 0:00, ends on the URL, and opens with no login.
- [ ] The final project shows a result on first load in a private window on a phone and a
      laptop; the static backup works.
- [ ] Every PSI investigation used is listed by ID, with a link and what we used; every number
      on the page and in the video traces to one.
- [ ] Limitations are present on the page, in the README and in the UI.
- [ ] Use of SI is present in the README and the page body; SI imagery is watermarked; there is
      no NASA insignia anywhere.
- [ ] 2 to 4 captioned screenshots or plots are on the page.
- [ ] The README's first screen has the title, tagline, GIF or screenshot, three links and the
      At a glance table.
- [ ] The criteria table is at the end of the Detailed Description.
- [ ] Read the page top to bottom as a stranger: challenge, solution, why it matters.
- [ ] Pitch rehearsed against the clock (3-minute and 5-minute versions), fallback video saved
      offline, Q&A answers drilled.
- [ ] Ledgers are current: `REFERENCES.md` (fonts, music, images, libraries) and `SI_USAGE.md`.
- [ ] The submitted commit is tagged.

**Self-score before submitting.** Score each of the five criteria from 1 to 5 as a blind judge
reading only the page and the 30 s video. For any criterion below 4, name the single change
that would raise it, and make it if the time rule allows.

---

## 13. What does not matter (don't spend time here)

- Badges, award banners, emoji headings and README templates. They are noise in the data.
- README length. Winners' READMEs were shorter.
- Cinematic production. A clean screen recording with subtitles beats a montage. Production
  value helps only as far as it makes things clear.
- Covering every feature. One finding shown well beats ten features listed.

---

## 14. Evidence and sources

Full working notes were made in the session scratchpad and are not in the repo; ask the
server session for them before they expire. Key sources:

- **Official, 2026:**
  - `.claude/skills/space-apps-judging/reference/` (judging and submission guides);
  - GO Team answers in github.com/nasa/spaceapps discussions 1857 and 1858 (project-link
    videos have no time limit; colours and hosting are free choices; no minors);
  - Space Apps Brand Guide (June 2026).
- **Official, older years (where they conflict, 2026 wins):**
  - the 2019 Judging and Awards guide (blind review by three NASA experts led by the
    challenge author; "not required to watch your video past second 30");
  - the 2019 local-lead FAQ (3-5 minute pitches; the main pitfall is skipping pitch
    preparation);
  - the 2020 submission guide ("show us your solution blueprint and your reasoning");
  - the 2021 Demo Guide (call out what is unique, next steps, recap the work);
  - the 2022 submission guide (the demo is a pitch to make judges read the page; judges stop
    at the limit);
  - the 2017 "240 Seconds of Glory" pitch model.
  - Most are on sa-2019.s3.amazonaws.com and spaceapps-prod.s3.amazonaws.com.
- **Past winners, measured:**
  - all 33 Global Winner pages from 2019-22 and 4 from 2025, compared with every page in two
    complete 2021-22 challenges (113 pages);
  - examples: Starflock (Best Use of Data 2022, a slide demo plus a long phased analysis
    page), Cambridge Asteroids (Best Use of Data 2021, a hosted app plus a 30 s video beat five
    nominees with the same tool), AEDES (Best Use of Data 2019, R and R² per model and
    region), Selene (Galactic Impact 2022, links at the top, one line per data source), MIMBI
    (Best Storytelling 2022, evidence of real use), Resonant Exoplanets (Best Use of Data
    2025, four named mission archives, an itemised SI disclosure).
- **GitHub:**
  - 4,688 repos from 30 searches (topics, "space apps" by year, award phrases, Flame in
    Freefall, PSI), with READMEs fetched and tagged;
  - 57 award claims checked against official lists: 12 confirmed, 3 strongly evidenced, 25
    false at the global level, 15 unclear. Self-claimed awards are unreliable; never cite one
    unverified;
  - 25 official-winner repos compared with 26 that won nothing, from the same challenges and
    years.
- **2026 field:** 129 Flame in Freefall repos read, scored on 9 presentation checks; 22 live
  sites opened; 6 demo videos checked.
- **Judges, organizers and winners:**
  - the MLH judging plan;
  - Biggin (dev.to: judges have about 5 minutes per project, Ctrl-F);
  - Kurbaitaev (dev.to: rehearse the first 30 s; slides do not persuade);
  - AngelHack demo tips (2026);
  - a Hyderabad 2025 local judge (an SI-heavy team could not explain its solution);
  - a 2021 FireWay winner interview (visualisation carries the first impression);
  - a CSA 2021 winner ("you will still get points if you can explain your ideas");
  - a Minerva 2023 winner and mentor (open with a hook);
  - Euronews Romania, 10 Nov 2026 (the Cluj jury and criteria; the Bucharest juror quote);
  - start-up.ro and itmania.ro (2025 Romanian criteria: team cohesion, clarity, pitch help);
  - Verizon and Publicis 2019 (92% watch mobile video muted);
  - Olson's And-But-Therefore structure.
- **Could not open:**
  - the 2023-2025 project pages (client-rendered, and their TLS certificate fails on the
    server; 2024 pages ask for a login);
  - YouTube video lengths (bot check);
  - two official "Global Winner" talks on YouTube, worth a human watch: "Secrets to Hackathon
    Success (from a Global Winner!)" and "Hear from a Space Apps Global Winner".

---

## 15. Open questions for the humans

1. **Cluj schedule:** do submissions close Sunday at 15:00 or 23:59, how long is the pitch
   slot, is there Q&A, and what is the screen setup? Ask the Local Lead.
2. **The idea and the story.** This playbook applies to whichever the team chooses. Note that
   section 3 marks some headlines as saturated in the 2026 field.
3. **Demo format.** We stay with the video (the team's decision) unless the humans switch to
   7 slides for a data-heavy story.
4. **The optional uncapped walkthrough video** (60-120 s) behind the final project link: worth
   making only if the 30 s demo is finished first.
