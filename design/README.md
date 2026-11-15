# burnrate design hand-over

The design system of the web app (`apps/web/`), as handed over by the team on 14 November 2026.
The written, maintained version is `apps/web/DESIGN.md`; if the two disagree, tell the web lane
and fix both.

| File | What it holds |
|---|---|
| `Overfitters App Design System.pdf` | Three pages: name and logo, colours, layout decisions |
| `Colors.pdf` | The colours page on its own: the blue scale, neutrals, roles, state colours |
| `Layout decisions.pdf` | The layout page on its own: header band, columns, breakpoints, spacing, shape and motion |

Things to know before you redesign from these:

- **Name: burnrate** (lower case). Tagline: "Every NASA microgravity flame test, traced to its
  source." The team chose it from the three options on the first page.
- The pages are flat pictures with a hidden text layer: you can search and copy the text, but
  you cannot edit the shapes. The editable source is the design canvas the pages were exported
  from (ask Alex Florea).
- Two things were corrected in these copies after the export: the header of the layout mock
  showed older name options ("nullg", "Blue Halo") and now shows the burnrate logo, and the
  phrase "shell green" now reads "shell blue" (the header band is blue 900, `#0f2547`).
- The mark must never look like a NASA insignia (no flame tongue, orbit swoosh, stars or red
  chevron). In the site it is drawn as code: `apps/web/components/shell/BrandMark.tsx`.

## Use of SI

The sheets were made with SI assistance (Claude) in a design session and chosen by the team;
each page carries a visible line saying so. Any exported picture of the mark (social card, video
end frame) needs a visible "SI-generated" label too. Logged in `submission/SI_USAGE.md`.
