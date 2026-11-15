// The limits that hold for the whole site, and the pure helpers of the Limitations page.
// Unit tested (tests/unit/limits.test.ts).
import type { InvestigationSummary } from "@/lib/types";

/**
 * What the data cannot tell, each line with its source: the challenge page
 * (docs/00-challenge-description.md, "Partial gravity") or this site's own rules
 * (docs/ARCHITECTURE.md, "What we must not claim"). Shown on the Limitations page only.
 */
export const CANNOT_TELL: readonly { text: string; source: string }[] = [
  {
    text: "PSI has no partial-gravity combustion data yet. Nothing here describes a fire on the Moon or Mars.",
    source: "the challenge page, section Partial gravity",
  },
  {
    text: "Droplet tests do not show how a solid material or a cabin fire behaves.",
    source: "this site, What we must not claim",
  },
  {
    text: "No number here holds outside the oxygen levels, pressures and fuels that NASA tested.",
    source: "this site, What we must not claim",
  },
  {
    text: "Nothing here is a discovery. The site reproduces and counts known science on NASA's open data.",
    source: "this site, What we must not claim",
  },
];

/** A longer list of limits shows this many lines, then a "Show all" button. */
export const LINES_SHOWN = 6;

/** The lines to show: all of them when asked or when the list is short, otherwise the first ones. */
export function shownLines<T>(lines: readonly T[], all: boolean, limit: number = LINES_SHOWN): readonly T[] {
  return all || lines.length <= limit ? lines : lines.slice(0, limit);
}

/** True when every word of the search text is in the investigation's PSI ID, acronym or title. */
export function matchesInvestigation(
  item: Pick<InvestigationSummary, "psi_id" | "acronym" | "title">,
  query: string,
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = `${item.psi_id} ${item.acronym ?? ""} ${item.title}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

/** The DOM id of the block of one analysis or investigation (never a section id of the page). */
export function limitAnchor(id: string): string {
  return `limit-${id}`;
}
