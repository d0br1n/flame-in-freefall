// The Overview page's data shaping (DESIGN.md, "Overview"): the "In this air" card from
// GET /air/coverage, the status pill of each stage, the flame map's fuel filter and the top of the
// ranking. Every number comes from the backend; this file only sorts and words it.
// Pure, unit tested (tests/unit/overview.test.ts).
import type { AirCoverage, CoverageStatus, FacetCount, FuelPhase, InvestigationSummary, RankResponse, Stage } from "./types";

export interface InAirRow {
  psi_id: string;
  /** The acronym, else the start of the title, else the PSI ID. */
  name: string;
  fuel_phase: FuelPhase | null;
  inside: number;
  stated: number;
  status: CoverageStatus;
}

export interface InAirSummary {
  /** Tests inside the window, over every investigation. */
  inside: number;
  /** Tests that state what the window bounds, over every investigation. */
  stated: number;
  /** Investigations whose tests state it, most tests first. */
  rows: InAirRow[];
  /** Investigations whose tables do not state what the window bounds. */
  notStated: number;
}

/** A short name for an investigation: its acronym, or the first words of its title. */
export function shortName(item: Pick<InvestigationSummary, "psi_id" | "acronym" | "title"> | undefined, psiId: string): string {
  if (!item) return psiId;
  if (item.acronym) return item.acronym;
  const words = item.title.split(/\s+/);
  return words.length > 5 ? `${words.slice(0, 5).join(" ")}…` : item.title;
}

/** The "In this air" card: every stage of the coverage answer (and `other`), per investigation. */
export function inAirSummary(coverage: AirCoverage, investigations: readonly InvestigationSummary[] | null): InAirSummary {
  const byId = new Map((investigations ?? []).map((item) => [item.psi_id, item]));
  const rows: InAirRow[] = [];
  let notStated = 0;
  const seen = new Set<string>();
  for (const stage of Object.values(coverage.stages)) {
    for (const entry of stage?.investigations ?? []) {
      if (seen.has(entry.psi_id)) continue;
      seen.add(entry.psi_id);
      if (!entry.stated) {
        notStated += 1;
        continue;
      }
      const item = byId.get(entry.psi_id);
      rows.push({
        psi_id: entry.psi_id,
        name: shortName(item, entry.psi_id),
        fuel_phase: item?.fuel_phase ?? null,
        inside: entry.inside ?? 0,
        stated: entry.stated,
        status: entry.status,
      });
    }
  }
  rows.sort((a, b) => b.inside - a.inside || b.stated - a.stated || a.psi_id.localeCompare(b.psi_id, "en", { numeric: true }));
  return {
    inside: rows.reduce((sum, row) => sum + row.inside, 0),
    stated: rows.reduce((sum, row) => sum + row.stated, 0),
    rows,
    notStated,
  };
}

export type PillTone = "ok" | "danger" | "warn";

/** A coverage status in words and a tone (the dot and the colour only add to the word). */
export function statusPill(status: CoverageStatus | null | undefined): { word: string; tone: PillTone } | null {
  switch (status) {
    case "tested":
      return { word: "Tested", tone: "ok" };
    case "never_tested":
      return { word: "Never tested in this air", tone: "danger" };
    case "not_stated":
      return { word: "Not stated", tone: "warn" };
    default:
      return null;
  }
}

/** The share of tests inside the window, 0 to 1 (0 when nothing is stated). */
export function share(inside: number | null | undefined, stated: number | null | undefined): number {
  if (!stated || !inside || !Number.isFinite(inside) || !Number.isFinite(stated)) return 0;
  return Math.min(1, Math.max(0, inside / stated));
}

/** The investigations of one stage, in catalog order. */
export function stageInvestigations(items: readonly InvestigationSummary[], stage: Stage): InvestigationSummary[] {
  return items.filter((item) => item.stage === stage);
}

/** The flame map's fuel filter: "All", then each known fuel phase the tests list, most tests first. */
export function phaseOptions(facets: readonly FacetCount[] | undefined): { value: string | null; label: string }[] {
  const LABEL: Record<string, string> = { gas: "Gas flames", liquid: "Droplets", solid: "Solids", aerosol: "Aerosols" };
  const phases = [...(facets ?? [])]
    .filter((facet) => facet.count > 0 && facet.value in LABEL)
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .map((facet) => ({ value: facet.value, label: LABEL[facet.value] ?? facet.value }));
  return [{ value: null, label: "All" }, ...phases];
}

/** The first `n` rows of the ranking. */
export function topRanked(rank: RankResponse, n = 5) {
  return rank.items.slice(0, Math.max(0, n));
}
