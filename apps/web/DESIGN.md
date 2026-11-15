# burnrate: the design system of the web app

The source is the mockup the product owner approved on 14 November 2026,
`design/mockup-2026-11-14/app.html` (with `Cover.html`, `CabinAirControl.html`, `StageCard.html`
and `AssistantDock.html`). Where this file and the mockup disagree, the mockup wins; fix this
file. It replaces the earlier "technical report" system (serif titles, ruled rows, margin notes,
header band, light theme only) and the PDFs in `design/`.

The feel: a modern, friendly, interactive app. A sidebar, a main panel on a rounded surface, cards,
pills, sliders, a dock for the assistant. Calm, dense where data is dense, never decorative.

## Who uses it and what for

Space Apps judges and engineers who want to know what NASA's microgravity flame tests say about a
fire in a spacecraft cabin, for an air they choose. They must be able to trust every number, so
every number shows where it comes from.

## Rules that never change

- **Every number has a source.** A number of an analysis opens the evidence panel
  (`components/evidence/EvidenceNumber.tsx`); any other number has a source chip (a PSI ID in
  mono) beside it or in its card. No number is typed into the UI: counts, labels, tolerances and
  sources come from the API.
- **The PSI ID is always visible, in mono** (`SourceChip`, Geist Mono).
- **State colour always comes with a word.** A status pill has a dot and a word ("Tested",
  "Never tested in this air", "Not stated"); colour only adds to it.
- **Example data and "being measured"** markers stay wherever an analysis is still a placeholder
  (`components/evidence/Markers.tsx`). A check not yet run for real reads "being measured", never
  "failed".
- **Saved copy:** when the live service does not answer, the page says it shows a saved copy.
- **Loading** shows skeletons in the shape of the content; **errors** say what failed and offer
  "Try again".
- **No NASA logo, insignia, flag or mission patch. No generated images.** The only mark is ours.
- **No claim the data does not make:** nothing about Moon or Mars gravity, no safety claim, no
  prediction outside the tested ranges (docs/ARCHITECTURE.md, "What we must not claim").
- English only. Plain, short, friendly, second person where natural. Avoid "AI-powered",
  "platform", "intelligence", "comprehensive", "saves", "cuts".

### Copy (DOB-119)

- One intro sentence per page or card, about 12 words, a plain statement of what the thing is.
- Labels over sentences where a label is enough. Buttons name their action.
- Say each thing once. If the heading says it, no sentence under it.
- No contrast constructions ("X, not Y", "rather than"), no chained instructions, no sentence
  about the page itself ("This page shows"), no filler ("at a glance", "actually", "exactly",
  "simply"), no semicolon gluing two thoughts, no colon-plus-explanation in every line.
- Keep the honesty statements that prevent a wrong reading ("SI-written summary", "saved copy",
  "never tested in this air"), in their shortest form. Keep every fact; invent none.
- Reading text is 15 to 16 px in `ink` (`ink-2` for secondary sentences). `ink-3` is for small
  meta only. Nothing under 13 px.

## Name and logo

- **Name:** `burnrate`, always lower case. Tagline: "Every NASA microgravity flame test, traced to
  its source." Both live in `lib/site.ts`.
- **Wordmark:** Space Grotesk 600, 19 px in the sidebar, tracking -0.03em. Space Grotesk is used
  for the wordmark and nothing else.
- **Mark:** a ball between two square brackets (a flame in freefall burns as a ball; shape source:
  the spherical flame of PSI-23 ACME s-Flame). Designed by the team with SI assistance (disclosed in
  `submission/SI_USAGE.md`). `components/shell/BrandMark.tsx`, 32-unit grid; at 24 px and below
  the ring and dot merge into one ball.
- **Colours:** brackets `ink`, ring `brand-soft` with a `brand` edge, dot `brand`. They follow the
  theme. Never add a flame tongue, a swoosh, stars, a chevron or anything like a NASA insignia;
  never stretch, rotate or glow. Next to the wordmark the mark is `aria-hidden`.

## Theme

Day and night, switched by `data-theme="night"` on `<html>`. The choice is stored in
`localStorage` (`burnrate-theme`); with nothing stored, `prefers-color-scheme` decides. A tiny
script in `<head>` (`lib/theme.ts`, `THEME_SCRIPT`) applies it before the first paint. The sidebar
toggle reads "Night mode" in day and "Day mode" in night (its words follow the theme through CSS).

## Tokens

Raw values are CSS variables on `<html>` (`app/globals.css`); the Tailwind theme points at them,
so `bg-surface`, `text-ink-2`, `border-line`, `bg-brand text-on-brand` and the rest follow the theme.

| Token | Day | Night | Job |
| --- | --- | --- | --- |
| `canvas` | #f5f6f8 | #0c0e13 | Behind everything; the sidebar sits on it |
| `surface` | #ffffff | #14171e | The main panel, cards, popovers, the dock |
| `surface-sunk` | #eef0f4 | #1b1f28 | Tracks, the search field, segmented controls, chips |
| `line` | #e3e6ec | #262b36 | 1 px borders and dividers |
| `control` | #7c8596 | #6b7588 | Hover border of controls (non-text, 3.7:1 / 3.9:1) |
| `ink` | #14171f | #eef1f6 | Text, headings |
| `ink-2` | #475063 | #b6bdca | Secondary text |
| `ink-3` | #5f6878 | #8f99aa | Quiet text: captions, counts, axis labels |
| `brand` | #3555e8 | #8aa2ff | Primary buttons, links, current item, focus ring, the air window |
| `on-brand` | #ffffff | #0c0e13 | Text on `brand` |
| `brand-soft` | #eceffe | #1c2443 | Current nav item, chosen chip, the air window fill |
| `ember` / `ember-fill` / `ember-soft` | #c2410c / #e25d10 / #fff0e6 | #ff9a5c / #ff8a47 / #2c1a0f | "Custom" air, a few outcomes |
| `ok` / `ok-soft` | #157a42 / #e7f6ee | #5fd394 / #10261a | Tested |
| `warn` / `warn-soft` | #a15c07 / #fdf3e1 | #f5b85c / #2a1f0c | Not stated, limits, example data |
| `danger` / `danger-soft` | #c4320a / #fdeceb | #ff8a73 / #2e1512 | Never tested in this air, errors |
| `series-gas` / `series-droplet` | #3555e8 / #0d7f7f | #8aa2ff / #4fd1c5 | Gas flames, droplets |
| `series-1` to `series-8`, `series-other` | blue, teal, violet, sky, magenta, olive, navy, rose; grey | lighter versions | Chart series, one per investigation, each with its own mark shape |

Radii: `sm` 8 px (chips, nav items), `md` 10 px (buttons, fields), `lg` 14 px (cards), `xl` 20 px
(the main panel, the dock), `full` (pills, sliders). Shadows: `sm` (cards, the main panel),
`pop` (popovers, the drawer, the floating dock). Spacing steps: 4, 8, 12, 16, 24, 32, 48 px.
Controls are 40 px tall (44 px on phones). Sidebar 248 px, dock 384 px.

**Deprecated aliases.** The old names (`paper`, `card`, `wash`, `muted`, `rule`, `shell*`,
`accent*`, `blue-50` to `blue-950`, `prov-*`, `*-wash`, `font-serif`, `shadow-dialog`) still work and
map onto the new tokens, so pages not yet polished stay coherent in both themes. Do not use them in
new code.

### Contrast (WCAG, computed from the token values)

| Pair | Day | Night |
| --- | --- | --- |
| ink on surface / canvas / surface-sunk | 17.9 / 16.6 / 15.7 | 15.8 / 17.1 / 14.6 |
| ink-2 on surface / canvas / surface-sunk | 8.1 / 7.5 / 7.1 | 9.5 / 10.2 / 8.7 |
| ink-3 on surface / canvas / surface-sunk | 5.6 / 5.2 / 4.9 | 6.2 / 6.7 / 5.7 |
| brand on surface / canvas / brand-soft | 5.8 / 5.4 / 5.1 | 7.4 / 8.0 / 6.3 |
| on-brand on brand | 5.8 | 8.0 |
| ink on brand-soft | 15.7 | 13.4 |
| ok on ok-soft | 4.8 | 8.6 |
| warn on warn-soft | 4.7 | 9.2 |
| danger on danger-soft | 4.8 | 7.4 |
| ember on ember-soft | 4.7 | 8.0 |
| ink-2 on warn-soft / danger-soft / brand-soft | 7.4 / 7.1 / 7.1 | 8.6 / 9.0 / 8.0 |

Every text pair is at least 4.5:1 in both themes. `control` is used for borders only (3:1 needed).

## Type

- **Figtree** (`font-sans`): the interface, 15 to 16 px reading text; 14 px for controls and
  secondary lines, 13 px for captions and meta. Nothing under 13 px.
- **Bricolage Grotesque** (`font-display`): headings (the page title 24 px / 650, card titles 18 px
  / 600) and big numbers (30 px figure, 24 px in stage cards), tracking -0.01 to -0.02em.
- **Geist Mono** (`font-mono`): PSI IDs, test IDs, slider values, counts in the sidebar, axis ticks.
  Data, never decoration.
- **Space Grotesk** (`font-wordmark`): the word "burnrate" only.
- Numbers in tables and counts use tabular figures. Prose keeps a 70ch measure.

## Shell

- **Sidebar** (`components/shell/Sidebar.tsx`), on the canvas: the wordmark, then the groups.
  Start (Overview); Data (Investigations, Compare, Tests); Analyses (Video to Data, Suppression
  test bench); About (Limitations, About the data); at the bottom Tools (Assistant, the Night mode
  toggle) and the data credit. There is no Detection page: its investigations are the detection
  filter of the Investigations list. Long pages use `components/ui/SectionNav.tsx` and show one
  section at a time. The limits live only on the Limitations page.
  Items are 40 px, icon + label + a mono count from the API (never typed; none while loading). The
  current item: `brand-soft` fill, `ink` text, a `brand` icon and `aria-current="page"`. Under
  1024 px it is an off-canvas drawer opened from the top bar: focus stays inside, Escape closes
  and gives focus back to the menu button. The structure lives in `lib/nav.ts`.
- **Main panel**: a `surface` with a 1 px line border, `xl` radius and the small shadow, inset
  10 px from the window. It holds the top bar and the scrolling page (`<main>`, a size container:
  card grids use container queries, so they reflow when the dock opens).
- **Top bar** (`components/shell/TopBar.tsx`), 68 px: the page title (the page's one h1; a page
  can set it with `<PageTitle>`, otherwise it is the section's name), the cabin-air dropdown (the
  same choice as the Overview's card; it shows the air in mono from 1200 px), the search ("/"
  focuses it) and the "Ask" button. On phones the dropdown and the search take a second row.
- **Assistant dock** (`components/shell/Dock.tsx`): 384 px on the right. From 1280 px it pushes the
  page (width animates); narrower it floats over the page with the pop shadow; on phones it is a
  full-screen sheet. Its open state survives navigation. Escape closes it; focus goes into it on
  open and back to "Ask" on close. The assistant itself is `components/assistant/AssistantDock.tsx`.

## The cabin air

One source of truth: `lib/air.ts` reads the URL. A preset is `?air=<id>`; a custom air (the
Overview's sliders) is `?air=custom&o2=<mole fraction>&p=<kPa>`. Internal links carry these
parameters (`components/AppLink.tsx`). The sliders' ranges and steps, the presets, their labels,
plain words, tolerance and source all come from the API (`GET /air/presets`, `GET /air/window`).
A preset puts the thumbs inside its window but keeps `?air=<id>`; an open window is said to
"cover a range". Moving a slider moves the thumb at once and writes the URL 250 ms later. If
the backend offers no custom air, the sliders give way to a quiet note and the presets stay.

## Overview

The hero (headline, tagline, three counts from the API, four steps), then the heading "Tests in
your cabin air".
Row 1: "Cabin air" (sliders, preset chips, the air in plain words, "Why this window") and "In this
air" (N of M tests inside the window, per investigation with bars and PSI chips, "Open tests").
Row 2: two analysis cards (Video to Data, Suppression test bench): icon, title link, a status
pill, one big number (the analysis's headline, opening the evidence panel), its sentence, its
count, source chips, and the coverage line with a bar. Row 3: the flame map (oxygen against
pressure, the air's window drawn, a segmented filter by the fuel phases that have dots; a dot
opens its test). Row 4: "Ranked for this air", full width (top 5, in two columns on a wide panel,
link to the full ranking at `/investigations?sort=rank`). When the air changes, numbers rise
in and bars slide (150 to 300 ms), never a page reload.

## Components (`components/ui/`)

`Card`, `SectionCard` (title + action), `StatusPill` (dot + word), `SourceChip` (mono PSI or test
ID; links to the record or opens the evidence panel), `SegmentedControl`, `Button` / `IconButton` /
`ButtonLink` (primary, secondary, ghost, danger), `Slider`, `Select` (a select-only combobox with
a listbox popover and two-line options), `Skeleton`, `Callout` (warn, danger, info),
`EmptyState`, `Icon` (24-unit line icons, 1.6 stroke, round caps, from the mockup; always
`aria-hidden`). Every control has hover, focus-visible (2 px brand ring, 2 px offset), active and
disabled states.

## Motion

150 to 300 ms, ease-out (`cubic-bezier(.2,.8,.2,1)`). Motion shows a change of state: a number
that changed rises in, a bar slides to its new width, the dock and the drawer slide. No entrance
choreography. Everything is off with `prefers-reduced-motion`.

## Check before you call a page done

- Both themes, at 1440 and 390 px; nothing unreadable, nothing overflowing.
- Every number traced (evidence panel or source chip); every state colour has its word.
- Keyboard: every control reachable, visible focus, the drawer and the dock close with Escape.
- Loading, empty, error ("Try again") and saved-copy states exist.
