// The site's navigation in one place: the sidebar, the top bar's page title, and the links
// between pages. A page that is not built yet is hidden, never a dead link: set `built: true` in
// the same change that adds the page. Pure, unit tested (tests/unit/nav-links.test.ts).
import type { InvestigationSummary, Stage } from "./types";

/**
 * Where an entry sits in the sidebar (redesign, 15 Nov 2026): the start, the data, the analyses,
 * about, and the tools. The order is the demo path: Overview, Investigations, Compare, the
 * suppression test bench, Limitations.
 *
 * UI refining (15 Nov, DOB-119, DOB-121, DOB-126, DOB-127): short group names; the spread page is
 * named "Video to Data" and the suppression page "Suppression test bench" (the routes stay
 * /spread and /suppress); the Detection page is gone, its investigations are the detection filter
 * of the Investigations page.
 */
export type NavGroup = "start" | "explore" | "analyses" | "trust" | "tools";

/** The count shown beside an entry, always read from the API. */
export type NavCountKey = "spread" | "detect" | "suppress" | "investigations" | "tests";

export type NavIcon = "overview" | "scenarios" | "spread" | "detect" | "suppress" | "investigations" | "compare" | "tests" | "limits" | "assistant" | "about";

export interface NavEntry {
  href: string;
  label: string;
  group: NavGroup;
  icon: NavIcon;
  built: boolean;
  count?: NavCountKey;
}

export const NAV: readonly NavEntry[] = [
  { href: "/", label: "Overview", group: "start", icon: "overview", built: true },
  { href: "/scenarios", label: "Scenarios", group: "start", icon: "scenarios", built: true },
  { href: "/investigations", label: "Investigations", group: "explore", icon: "investigations", built: true, count: "investigations" },
  { href: "/compare", label: "Compare", group: "explore", icon: "compare", built: true },
  { href: "/tests", label: "Tests", group: "explore", icon: "tests", built: true, count: "tests" },
  { href: "/spread", label: "Video to Data", group: "analyses", icon: "spread", built: true, count: "spread" },
  { href: "/suppress", label: "Suppression test bench", group: "analyses", icon: "suppress", built: true, count: "suppress" },
  { href: "/limitations", label: "Limitations", group: "trust", icon: "limits", built: true },
  { href: "/about", label: "About the data", group: "trust", icon: "about", built: true },
  { href: "/assistant", label: "Assistant", group: "tools", icon: "assistant", built: true },
];

/** The sidebar's group headings, in order. */
export const NAV_GROUPS: readonly { group: NavGroup; label: string }[] = [
  { group: "start", label: "Start" },
  { group: "explore", label: "Data" },
  { group: "analyses", label: "Analyses" },
  { group: "trust", label: "About" },
  { group: "tools", label: "Tools" },
];

/** The entries a visitor sees: only pages that exist. */
export function visibleNav(entries: readonly NavEntry[] = NAV): NavEntry[] {
  return entries.filter((entry) => entry.built);
}

/** The built entries of one sidebar group, in order. */
export function navGroup(group: NavGroup, entries: readonly NavEntry[] = NAV): NavEntry[] {
  return visibleNav(entries).filter((entry) => entry.group === group);
}

/** Detection has no page of its own: its investigations are a filter of the Investigations page. */
export const DETECTION_HREF = "/investigations?pillar=detection";

/** The page of each stage of a fire. */
export const STAGE_HREF: Record<Stage, string | null> = {
  spread: "/spread",
  detect: DETECTION_HREF,
  suppress: "/suppress",
};

/** The href if that page is built, otherwise null (render plain text, not a dead link). */
export function builtHref(href: string | null, entries: readonly NavEntry[] = NAV): string | null {
  if (href === null) return null;
  const path = href.split(/[?#]/)[0];
  const entry = entries.find((item) => item.href === path);
  return entry?.built ? href : null;
}

/** The built page for a stage, or null. */
export function stagePage(stage: Stage | null, entries: readonly NavEntry[] = NAV): string | null {
  return stage === null ? null : builtHref(STAGE_HREF[stage], entries);
}

/** True when `pathname` is the page of `href` or below it ("/" only matches itself). */
export function isCurrent(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The section a path belongs to: the most specific built entry it falls under, or null. */
export function currentEntry(pathname: string | null, entries: readonly NavEntry[] = NAV): NavEntry | null {
  const matches = visibleNav(entries).filter((entry) => isCurrent(entry.href, pathname));
  return matches.sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

/** The top bar's title for a path when the page sets none: the section's name. */
export function sectionTitle(pathname: string | null, entries: readonly NavEntry[] = NAV): string | null {
  return currentEntry(pathname, entries)?.label ?? null;
}

/**
 * The counts beside the sidebar entries, from GET /catalog/investigations (investigations per
 * stage, and all of them) and the `total` of GET /catalog/tests. A count that is not known yet is
 * absent, never 0.
 */
export function navCounts(
  investigations: readonly Pick<InvestigationSummary, "stage">[] | null,
  testsTotal: number | null,
): Partial<Record<NavCountKey, number>> {
  const counts: Partial<Record<NavCountKey, number>> = {};
  if (investigations) {
    counts.investigations = investigations.length;
    for (const stage of ["spread", "detect", "suppress"] as const) {
      counts[stage] = investigations.filter((item) => item.stage === stage).length;
    }
  }
  if (testsTotal !== null && Number.isFinite(testsTotal)) counts.tests = testsTotal;
  return counts;
}
