// Filters of the Investigations list. The state lives in the URL, for example
// /investigations?pillar=detection&fuel=solid&fuel=liquid
// Within one facet the choices mean "any of"; across facets they mean "and".
// Pure, unit tested (tests/unit/filters.test.ts).
import { copyAirParams } from "./links";
import type { DataKind, FuelPhase, InvestigationSummary, Pillar } from "./types";

export type FacetKey = "pillar" | "fuel" | "hardware" | "kind";

/** Facets in the order they are shown and written to the URL. The key is the URL parameter. */
export const FACETS: readonly { key: FacetKey; label: string }[] = [
  { key: "pillar", label: "Fire safety pillar" },
  { key: "fuel", label: "What burned (fuel phase)" },
  { key: "hardware", label: "Hardware" },
  { key: "kind", label: "Kind of data" },
];

export type Filters = Record<FacetKey, string[]>;

export const PILLAR_LABEL: Record<Pillar, string> = {
  prevention: "Prevention",
  detection: "Detection",
  suppression: "Suppression",
  related: "Related",
  fundamentals: "Combustion fundamentals",
};

export const FUEL_LABEL: Record<FuelPhase, string> = {
  solid: "Solid fuel",
  liquid: "Liquid fuel",
  gas: "Gas fuel",
  aerosol: "Aerosol (smoke or dust)",
};

export const KIND_LABEL: Record<DataKind, string> = {
  table: "Experimental table",
  data_files: "Data files",
  video: "Video",
  images: "Images",
  documents: "Documents",
  archives: "Archives",
};

const PILLAR_ORDER = Object.keys(PILLAR_LABEL);
const FUEL_ORDER = Object.keys(FUEL_LABEL);
const KIND_ORDER = Object.keys(KIND_LABEL);

export function emptyFilters(): Filters {
  return { pillar: [], fuel: [], hardware: [], kind: [] };
}

/** Read the filters from a query string. Repeated or comma-separated values, deduplicated. */
export function parseFilters(query: URLSearchParams | string): Filters {
  const params = typeof query === "string" ? new URLSearchParams(query.replace(/^\?/, "")) : query;
  const filters = emptyFilters();
  for (const { key } of FACETS) {
    const values = params
      .getAll(key)
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    filters[key] = [...new Set(values)];
  }
  return filters;
}

/**
 * The query string for a set of filters, without the leading "?". the air parameters are kept from `current`;
 * every other parameter of `current` is dropped. Values are written in a stable order.
 */
export function serializeFilters(filters: Filters, current?: URLSearchParams | string | null): string {
  const out = new URLSearchParams();
  if (current) {
    const params = typeof current === "string" ? new URLSearchParams(current.replace(/^\?/, "")) : current;
    copyAirParams(params, out);
  }
  for (const { key } of FACETS) {
    for (const value of [...new Set(filters[key])].sort()) out.append(key, value);
  }
  return out.toString();
}

export function toggleFilter(filters: Filters, facet: FacetKey, value: string): Filters {
  const chosen = filters[facet];
  const next = chosen.includes(value) ? chosen.filter((item) => item !== value) : [...chosen, value];
  return { ...filters, [facet]: next };
}

export function activeCount(filters: Filters): number {
  return FACETS.reduce((sum, { key }) => sum + filters[key].length, 0);
}

/** The values one investigation has for a facet (several for "kind of data"). */
export function valuesOf(item: InvestigationSummary, facet: FacetKey): string[] {
  switch (facet) {
    case "pillar":
      return [item.pillar];
    case "fuel":
      return [item.fuel_phase];
    case "hardware":
      return [item.hardware_group];
    case "kind":
      return item.data_kinds;
  }
}

/** True when the investigation passes every facet, ignoring `skip` if given. */
export function matches(item: InvestigationSummary, filters: Filters, skip?: FacetKey): boolean {
  return FACETS.every(({ key }) => {
    if (key === skip || filters[key].length === 0) return true;
    const values = valuesOf(item, key);
    return filters[key].some((value) => values.includes(value));
  });
}

export function applyFilters(items: InvestigationSummary[], filters: Filters): InvestigationSummary[] {
  return items.filter((item) => matches(item, filters));
}

export interface FacetOption {
  value: string;
  label: string;
  /** Investigations that would show with this value, given the choices in the other facets. */
  count: number;
}

function labelFor(facet: FacetKey, value: string, items: InvestigationSummary[]): string {
  if (facet === "pillar") return PILLAR_LABEL[value as Pillar] ?? value;
  if (facet === "fuel") return FUEL_LABEL[value as FuelPhase] ?? value;
  if (facet === "kind") return KIND_LABEL[value as DataKind] ?? value;
  return items.find((item) => item.hardware_group === value)?.hardware_group_label ?? value;
}

function orderFor(facet: FacetKey): string[] | null {
  if (facet === "pillar") return PILLAR_ORDER;
  if (facet === "fuel") return FUEL_ORDER;
  if (facet === "kind") return KIND_ORDER;
  return null;
}

/**
 * The options of one facet: every value present in the full list (so a choice never vanishes),
 * each counted against the choices in the other facets. A value chosen in the URL but absent from
 * the data is listed too, with a count of 0, so it can be unticked.
 */
export function facetOptions(items: InvestigationSummary[], filters: Filters, facet: FacetKey): FacetOption[] {
  const present = new Set<string>();
  for (const item of items) for (const value of valuesOf(item, facet)) present.add(value);
  const values = new Set([...present, ...filters[facet]]);

  const counts = new Map<string, number>();
  for (const item of items) {
    if (!matches(item, filters, facet)) continue;
    for (const value of new Set(valuesOf(item, facet))) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const order = orderFor(facet);
  const options = [...values].map((value) => ({
    value,
    label: labelFor(facet, value, items),
    count: counts.get(value) ?? 0,
  }));
  return options.sort((a, b) => {
    // Values chosen in the URL but absent from the data go last.
    const missing = Number(!present.has(a.value)) - Number(!present.has(b.value));
    if (missing !== 0) return missing;
    if (order) {
      const ai = order.indexOf(a.value);
      const bi = order.indexOf(b.value);
      return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi) || a.label.localeCompare(b.label);
    }
    return a.label.localeCompare(b.label);
  });
}
