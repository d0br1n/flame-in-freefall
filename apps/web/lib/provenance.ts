// How each provenance tag looks, in one place (DESIGN.md: "measured and computed look
// different", the same on every page). Each tag has its own words, its own mark (an inline SVG
// path drawn in one stroke weight) and its own border style, so the badge never relies on colour
// alone. The tone picks one of the colour tokens in app/globals.css. Pure, unit tested.
import type { Provenance } from "./types";

export type ProvenanceTone = "measured" | "nasa" | "computed";
export type ProvenanceBorder = "solid" | "double" | "dashed" | "dotted";

export interface ProvenanceStyle {
  /** Plain words shown in the badge. */
  label: string;
  /** One sentence for the evidence panel: what the tag means. */
  meaning: string;
  /** SVG path data on a 16 x 16 grid, drawn with a 1.5 stroke and no fill. */
  mark: string;
  /** What the mark depicts, for the reader of this file. */
  markName: string;
  tone: ProvenanceTone;
  border: ProvenanceBorder;
}

export const PROVENANCE: Record<Provenance, ProvenanceStyle> = {
  VIDEO_MEASURED: {
    label: "measured from video",
    meaning: "Measured by software that follows the flame in NASA's video.",
    mark: "M2.5 3.5h11v9h-11z M6.5 6v4l3.5-2z",
    markName: "a film frame with a play triangle",
    tone: "measured",
    border: "solid",
  },
  HAND_MEASURED: {
    label: "measured by hand",
    meaning: "Measured by a person, by hand, from NASA's images or video.",
    mark: "M1.5 5.5h13v5h-13z M4.5 5.5v2.5 M7.5 5.5v2.5 M10.5 5.5v2.5",
    markName: "a ruler",
    tone: "measured",
    border: "dashed",
  },
  PSI_TABLE: {
    label: "from NASA's table",
    meaning: "Copied from an experimental table that NASA publishes in the PSI repository.",
    mark: "M2.5 2.5h11v11h-11z M2.5 6.5h11 M2.5 10h11 M7 6.5v7",
    markName: "a table grid",
    tone: "nasa",
    border: "solid",
  },
  PUBLISHED: {
    label: "published by NASA",
    meaning: "A value printed in a NASA publication or record.",
    mark: "M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3 M5.5 8h5 M5.5 10.5h5",
    markName: "a printed page",
    tone: "nasa",
    border: "double",
  },
  SI_EXTRACTED: {
    label: "read by SI",
    meaning: "Read from a NASA document by a language model (SI). Check it against the source.",
    mark: "M8 1.5l6.5 6.5-6.5 6.5-6.5-6.5z M6 8h4",
    markName: "a diamond with a bar",
    tone: "computed",
    border: "dotted",
  },
  MODEL: {
    label: "computed",
    meaning: "Computed by this analysis from NASA's numbers. Not measured.",
    mark: "M2.5 2.5v11h11 M4.5 11c2-6 4-7 8-7.5",
    markName: "a curve on two axes",
    tone: "computed",
    border: "dashed",
  },
};

export const PROVENANCE_TAGS = Object.keys(PROVENANCE) as Provenance[];

/** The style of a tag. An unknown tag (a contract break) is shown in words, never hidden. */
export function provenanceStyle(tag: string): ProvenanceStyle {
  return (
    PROVENANCE[tag as Provenance] ?? {
      label: tag.toLowerCase().replace(/_/g, " "),
      meaning: "An unknown provenance tag: this site does not know how the number was obtained.",
      mark: "M8 2.5a5.5 5.5 0 1 0 0.01 0z",
      markName: "a circle",
      tone: "nasa",
      border: "dotted",
    }
  );
}
