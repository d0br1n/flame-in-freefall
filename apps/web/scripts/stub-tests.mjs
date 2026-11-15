// The stub backend's stand-in for GET /catalog/tests (Linear DOB-72), in the shape documented
// in fixtures/README.md. Development and browser tests only: the real route replaces it.
// Standard library only. Code generated with SI assistance (Claude Code), reviewed by the team.

const FACETS = ["psi_id", "fuel", "fuel_phase", "outcome", "diluent"];
const RANGES = [
  ["o2", "o2_mole_fraction"],
  ["pressure", "pressure_kpa"],
  ["flow", "flow_cm_s"],
];
const MAX_LIMIT = 200;
// As the real route orders them: inverse flames come after every other row (DOB-125).
const LAST_FLAG = "oxygen_is_burner_stream";

const number = (text) => (text !== null && text !== "" && Number.isFinite(Number(text)) ? Number(text) : null);

/**
 * @typedef {Record<string, any>} TestRow
 * @typedef {{ value: string, count: number, label?: string }} FacetCount
 * @typedef {{
 *   total: number, limit: number, offset: number, items: TestRow[],
 *   facets: Record<string, FacetCount[]>, excluded: Record<string, number>,
 *   points?: { items: [string, string, number, number][], not_plotted: number },
 * }} TestsResponse
 */

/**
 * @param {TestRow[]} rows all test rows (fixtures/data/tests.json)
 * @param {URLSearchParams} params the request's query
 * @returns {TestsResponse}
 */
export function queryTests(rows, params) {
  const chosen = Object.fromEntries(FACETS.map((key) => [key, new Set(params.getAll(key).filter(Boolean))]));
  const ranges = RANGES.map(([name, field]) => ({
    name, field, min: number(params.get(`${name}_min`)), max: number(params.get(`${name}_max`)),
  })).filter((r) => r.min !== null || r.max !== null);

  const inFacets = (row, skip) =>
    FACETS.every((key) => key === skip || chosen[key].size === 0 || chosen[key].has(String(row[key])));
  const inRange = (row, r) =>
    row[r.field] !== null && (r.min === null || row[r.field] >= r.min) && (r.max === null || row[r.field] <= r.max);
  const inRanges = (row) => ranges.every((r) => inRange(row, r));
  // test_id (may repeat) picks tests by ID, as on the engine evidence route; it is not a facet.
  const ids = new Set(params.getAll("test_id").filter(Boolean));
  const inIds = (row) => ids.size === 0 || ids.has(row.test_id);

  const isLast = (row) => (row.flags ?? []).includes(LAST_FLAG);
  const kept = rows.filter((row) => inIds(row) && inFacets(row) && inRanges(row));
  const matching = [...kept.filter((row) => !isLast(row)), ...kept.filter(isLast)];

  // Rows a range filter dropped only because the source states no value for it.
  /** @type {Record<string, number>} */
  const excluded = { o2: 0, pressure: 0, flow: 0 };
  for (const r of ranges) {
    excluded[r.name] = rows.filter(
      (row) => inFacets(row) && row[r.field] === null && ranges.every((other) => other === r || inRange(row, other)),
    ).length;
  }

  // Each facet is counted without its own filter, so a visitor can widen a choice.
  /** @type {Record<string, FacetCount[]>} */
  const facets = {};
  for (const key of FACETS) {
    const counts = new Map();
    for (const row of rows) {
      if (row[key] === null || !inFacets(row, key) || !inRanges(row)) continue;
      const entry = counts.get(row[key]) ?? { value: row[key], count: 0 };
      if (key === "psi_id") entry.label = row.acronym;
      entry.count += 1;
      counts.set(row[key], entry);
    }
    facets[key] = [...counts.values()].sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
  }

  const limit = Math.min(Math.max(number(params.get("limit")) ?? 50, 1), MAX_LIMIT);
  const offset = Math.max(number(params.get("offset")) ?? 0, 0);
  const include = new Set((params.get("include") ?? "").split(",").map((s) => s.trim()));

  const items = matching.slice(offset, offset + limit).map((row) => {
    if (include.has("raw")) return row;
    const rest = { ...row };
    delete rest.raw;
    return rest;
  });

  /** @type {TestsResponse} */
  const body = { total: matching.length, limit, offset, items, facets, excluded };
  if (include.has("points")) {
    const plotted = matching.filter((row) => row.o2_mole_fraction !== null && row.pressure_kpa !== null);
    body.points = {
      items: plotted.map((row) => [row.test_id, row.psi_id, row.o2_mole_fraction, row.pressure_kpa]),
      not_plotted: matching.length - plotted.length,
    };
  }
  return body;
}

/**
 * The stand-in for GET /catalog/tests/{test_id}: one row with its cells as published, or null.
 * The stub has no analysis evidence, so `evidence` is always empty here.
 * @param {TestRow[]} rows
 * @param {string} testId already decoded, for example "PSI-69/114"
 * @returns {TestRow | null}
 */
export function oneTest(rows, testId) {
  const row = rows.find((item) => item.test_id === testId.trim());
  return row ? { ...row, evidence: [] } : null;
}
