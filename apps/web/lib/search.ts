// The top bar's search (DESIGN.md, "Top bar"): investigations matched by PSI ID, acronym and
// title, and where "Search tests for ..." leads on the tests page. The tests page has no free-text
// filter, so the text must name something the tests can be filtered by: a test ID, a PSI ID, or a
// fuel or outcome that the tests list. Otherwise no tests option is offered (never a dead end).
// Pure, unit tested (tests/unit/search.test.ts).
import type { FacetCount, InvestigationSummary } from "./types";

export interface InvestigationMatch {
  item: InvestigationSummary;
  /** Lower is better. */
  score: number;
}

const norm = (text: string | null | undefined) => (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
/** "psi 69", "psi69", "PSI-69" all read as "psi-69". */
const normId = (text: string) => norm(text).replace(/^psi[\s_-]*(\d+)/, "psi-$1");

/**
 * The investigations that match the text, best first: an exact PSI ID, then an acronym or ID that
 * starts with the text, then a word of the title that starts with it, then anywhere in the title.
 */
export function searchInvestigations(items: readonly InvestigationSummary[], query: string, limit = 6): InvestigationMatch[] {
  const q = norm(query);
  if (!q) return [];
  const qId = normId(query);
  const out: InvestigationMatch[] = [];
  for (const item of items) {
    const id = norm(item.psi_id);
    const acronym = norm(item.acronym);
    const title = norm(item.title);
    let score: number | null = null;
    if (id === qId) score = 0;
    else if (acronym && acronym === q) score = 1;
    else if (id.startsWith(qId) || (acronym && acronym.startsWith(q))) score = 2;
    else if (title.split(/[\s/-]+/).some((word) => word.startsWith(q))) score = 3;
    else if (title.includes(q) || (acronym && acronym.includes(q))) score = 4;
    if (score !== null) out.push({ item, score });
  }
  return out
    .sort((a, b) => a.score - b.score || a.item.psi_id.localeCompare(b.item.psi_id, "en", { numeric: true }))
    .slice(0, limit);
}

export interface TestsTarget {
  /** The tests page URL (without the air: AppLink or withAir adds it). */
  href: string;
  /** What the option says: "Search tests for “PSI-69/114”". */
  label: string;
  /** What kind of match it is, for the option's second line. */
  kind: "test" | "investigation" | "fuel" | "outcome";
}

const TEST_ID = /^psi[\s_-]*(\d+)\s*\/\s*(\S+)$/i;
const PSI_ID = /^psi[\s_-]*(\d+)$/i;

/**
 * Where "Search tests for <text>" goes, or null when the tests page cannot filter by it.
 * `facets` are the tests' own facets (GET /catalog/tests), so a fuel or outcome is only offered
 * when the tests list it.
 */
export function testsTarget(
  query: string,
  facets: { psi_id?: FacetCount[]; fuel?: FacetCount[]; outcome?: FacetCount[] } | null,
): TestsTarget | null {
  const text = query.trim();
  if (!text) return null;
  const quoted = `Search tests for “${text}”`;
  const test = TEST_ID.exec(text);
  if (test) {
    const id = `PSI-${test[1]}/${test[2]}`;
    return { href: `/tests?test=${encodeURIComponent(id)}`, label: quoted, kind: "test" };
  }
  const psi = PSI_ID.exec(text);
  if (psi) {
    const id = `PSI-${psi[1]}`;
    const known = facets?.psi_id ? facets.psi_id.some((facet) => facet.value === id) : true;
    return known ? { href: `/tests?psi_id=${encodeURIComponent(id)}`, label: quoted, kind: "investigation" } : null;
  }
  const lower = norm(text);
  for (const key of ["fuel", "outcome"] as const) {
    const facet = facets?.[key]?.find((entry) => norm(entry.value) === lower);
    if (facet) return { href: `/tests?${key}=${encodeURIComponent(facet.value)}`, label: quoted, kind: key };
  }
  return null;
}
