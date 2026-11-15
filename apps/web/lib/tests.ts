// The tests explorer (/tests, Linear DOB-77): its URL state, the API paths it asks for, and how
// a test's values are written on screen. The backend filters, pages and counts; this file only
// turns the visitor's choices into parameters and the answer into words.
// The URL uses the API's own parameter names, so a link and a request read the same.
// Pure, unit tested (tests/unit/tests-query.test.ts).
import { copyAirParams } from "./links";
import { FUEL_LABEL } from "./filters";
import type { FacetCount, FuelPhase, TestFacetKey, TestRow } from "./types";

export const TESTS_PATH = "/catalog/tests";

/** The URL parameter of the test opened in the dialog, for example ?test=PSI-69/114. */
export const TEST_PARAM = "test";

/** Facets in the order they are shown. The key is the URL and API parameter. */
export const TEST_FACETS: readonly { key: TestFacetKey; label: string; search?: string }[] = [
  { key: "psi_id", label: "Investigation" },
  // `search` names the search box a facet gets while its list is long enough to fold (DOB-154).
  { key: "fuel", label: "Fuel", search: "Search fuels" },
  { key: "fuel_phase", label: "Fuel phase" },
  { key: "outcome", label: "How the test ended", search: "Search endings" },
  { key: "diluent", label: "Added gas (diluent)", search: "Search added gases" },
];

export const RANGE_KEYS = ["o2_min", "o2_max", "pressure_min", "pressure_max", "flow_min", "flow_max"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

/** The three range filters. Oxygen is a mole fraction in the URL and the API, percent on screen. */
export const RANGES: readonly {
  name: "o2" | "pressure" | "flow";
  label: string;
  unit: string;
  min: RangeKey;
  max: RangeKey;
  /** Words for "their table states no <what>". */
  what: string;
}[] = [
  { name: "o2", label: "Oxygen", unit: "%", min: "o2_min", max: "o2_max", what: "oxygen" },
  { name: "pressure", label: "Pressure", unit: "kPa", min: "pressure_min", max: "pressure_max", what: "pressure" },
  { name: "flow", label: "Airflow", unit: "cm/s", min: "flow_min", max: "flow_max", what: "airflow" },
];

export interface TestsQuery {
  facets: Record<TestFacetKey, string[]>;
  ranges: Record<RangeKey, number | null>;
  /** Page size; null means the backend's default. */
  limit: number | null;
  offset: number;
  /** The test open in the dialog, or null. */
  test: string | null;
}

export function emptyTestsQuery(): TestsQuery {
  return {
    facets: { psi_id: [], fuel: [], fuel_phase: [], outcome: [], diluent: [] },
    ranges: { o2_min: null, o2_max: null, pressure_min: null, pressure_max: null, flow_min: null, flow_max: null },
    limit: null,
    offset: 0,
    test: null,
  };
}

function toParams(query: URLSearchParams | string): URLSearchParams {
  return typeof query === "string" ? new URLSearchParams(query.replace(/^\?/, "")) : query;
}

function finite(text: string | null): number | null {
  if (text === null || text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Read the explorer's state from a query string. Unknown or malformed values are ignored. */
export function parseTestsQuery(search: URLSearchParams | string): TestsQuery {
  const params = toParams(search);
  const query = emptyTestsQuery();
  for (const { key } of TEST_FACETS) {
    const values = params.getAll(key).map((value) => value.trim()).filter(Boolean);
    query.facets[key] = [...new Set(values)];
  }
  for (const key of RANGE_KEYS) query.ranges[key] = finite(params.get(key));
  const limit = finite(params.get("limit"));
  query.limit = limit !== null && limit >= 1 ? Math.floor(limit) : null;
  const offset = finite(params.get("offset"));
  query.offset = offset !== null && offset > 0 ? Math.floor(offset) : 0;
  query.test = params.get(TEST_PARAM)?.trim() || null;
  return query;
}

/** The filter parameters shared by the page URL and every API request. */
function appendFilters(out: URLSearchParams, query: TestsQuery): void {
  for (const { key } of TEST_FACETS) {
    for (const value of [...new Set(query.facets[key])].sort()) out.append(key, value);
  }
  for (const key of RANGE_KEYS) {
    const value = query.ranges[key];
    if (value !== null) out.set(key, String(value));
  }
}

/**
 * The page's query string, without the leading "?". the air parameters (air, o2, p) are kept from `current` untouched;
 * every other parameter of `current` is replaced by `query`.
 */
export function serializeTestsQuery(query: TestsQuery, current?: URLSearchParams | string | null): string {
  const out = new URLSearchParams();
  if (current) copyAirParams(toParams(current), out);
  appendFilters(out, query);
  if (query.limit !== null) out.set("limit", String(query.limit));
  if (query.offset > 0) out.set("offset", String(query.offset));
  if (query.test) out.set(TEST_PARAM, query.test);
  return out.toString();
}

/** GET /catalog/tests for the current page of the table. */
export function testsApiPath(query: TestsQuery): string {
  const out = new URLSearchParams();
  appendFilters(out, query);
  if (query.limit !== null) out.set("limit", String(query.limit));
  if (query.offset > 0) out.set("offset", String(query.offset));
  const text = out.toString();
  return text ? `${TESTS_PATH}?${text}` : TESTS_PATH;
}

/** GET /catalog/tests with every matching point for the chart (not paged; one row is enough). */
export function pointsApiPath(query: TestsQuery): string {
  const out = new URLSearchParams();
  appendFilters(out, query);
  out.set("limit", "1");
  out.set("include", "points");
  return `${TESTS_PATH}?${out.toString()}`;
}

/**
 * GET /catalog/tests/{test_id}: one test with its cells as published and its evidence.
 * A test ID keeps its slash as a path separator ("PSI-69/114"); every other character is
 * encoded, so "PSI-20/#1" and "PSI-159/21196 A1" reach the backend whole.
 */
export function testApiPath(testId: string): string {
  return `${TESTS_PATH}/${testId.trim().split("/").map(encodeURIComponent).join("/")}`;
}

/** True when any filter (facet or range) is chosen. Paging and the open test do not count. */
export function hasFilters(query: TestsQuery): boolean {
  return (
    TEST_FACETS.some(({ key }) => query.facets[key].length > 0) || RANGE_KEYS.some((key) => query.ranges[key] !== null)
  );
}

export function activeFilterCount(query: TestsQuery): number {
  return (
    TEST_FACETS.reduce((sum, { key }) => sum + query.facets[key].length, 0) +
    RANGES.filter((range) => query.ranges[range.min] !== null || query.ranges[range.max] !== null).length
  );
}

/** A copy with one facet value ticked or unticked; back to the first page. */
export function toggleTestFacet(query: TestsQuery, facet: TestFacetKey, value: string): TestsQuery {
  const chosen = query.facets[facet];
  const next = chosen.includes(value) ? chosen.filter((item) => item !== value) : [...chosen, value];
  return { ...query, facets: { ...query.facets, [facet]: next }, offset: 0 };
}

/** A copy with every filter removed; the page size is kept. */
export function clearTestFilters(query: TestsQuery): TestsQuery {
  return { ...emptyTestsQuery(), limit: query.limit };
}

// ---------------------------------------------------------------- units

/** 0.21 -> 21 (percent), without floating-point dust. */
export function toPercent(moleFraction: number): number {
  return Number((moleFraction * 100).toFixed(6));
}

/** 21 -> 0.21 (mole fraction), without floating-point dust. */
export function fromPercent(percent: number): number {
  return Number((percent / 100).toFixed(8));
}

/** A range value as typed by the visitor (percent for oxygen), or null when empty or not a number. */
export function rangeFromInput(name: "o2" | "pressure" | "flow", text: string): number | null {
  const value = finite(text);
  if (value === null) return null;
  return name === "o2" ? fromPercent(value) : value;
}

/** A range value from the URL as the visitor sees it in the input (percent for oxygen). */
export function rangeToInput(name: "o2" | "pressure" | "flow", value: number | null): string {
  if (value === null) return "";
  return String(name === "o2" ? toPercent(value) : value);
}

// ---------------------------------------------------------------- words

export const NOT_STATED = "not stated";

/** A number with at most `digits` decimals and no trailing zeros. */
export function trimNumber(value: number, digits = 2): string {
  return String(Number(value.toFixed(digits)));
}

export type ValueField = "o2_mole_fraction" | "pressure_kpa" | "flow_cm_s";

const DISPLAY_UNIT: Record<ValueField, string> = { o2_mole_fraction: "%", pressure_kpa: "kPa", flow_cm_s: "cm/s" };

/** One value as shown: "20.71%", "101.02 kPa", "not stated". */
export function formatValue(field: ValueField, value: number | null): string {
  if (value === null) return NOT_STATED;
  if (field === "o2_mole_fraction") return `${trimNumber(toPercent(value))}%`;
  return `${trimNumber(value)} ${DISPLAY_UNIT[field]}`;
}

/**
 * The value as the source table writes it, when that says more than the converted value:
 * "757.7 mmHg as published". Null when the table has no original or it reads the same.
 */
export function originalText(row: Pick<TestRow, "original">, field: ValueField, value: number | null): string | null {
  const original = originalValue(row, field, value);
  return original ? `${original} as published` : null;
}

/** The same without "as published" (for the table, whose header says it once): "757.7 mmHg". */
export function originalValue(row: Pick<TestRow, "original">, field: ValueField, value: number | null): string | null {
  const original = row.original?.[field];
  if (!original || original.text === "") return null;
  const unit = (original.unit ?? "").trim();
  const sameUnit = unit.toLowerCase() === DISPLAY_UNIT[field].toLowerCase();
  if (sameUnit && value !== null && Number(original.text) === value) return null;
  return unit ? `${original.text} ${unit}` : original.text;
}

/** "101.02 kPa (757.7 mmHg as published)", or the value alone. */
export function valueWithOriginal(row: Pick<TestRow, "original">, field: ValueField, value: number | null): string {
  const original = originalText(row, field, value);
  return original ? `${formatValue(field, value)} (${original})` : formatValue(field, value);
}

/** An empty cell reads "not stated", never 0 or a dash. */
export function textOrNotStated(text: string | null | undefined): string {
  return text === null || text === undefined || text.trim() === "" ? NOT_STATED : text;
}

/** "FLEX, PSI-69", or the PSI ID alone when there is no acronym. */
export function investigationLabel(psiId: string, acronym: string | null | undefined): string {
  return acronym ? `${acronym}, ${psiId}` : psiId;
}

/** The label of one facet option. */
export function facetLabel(facet: TestFacetKey, option: Pick<FacetCount, "value" | "label">): string {
  // The backend counts an empty cell under the value "none" (and filters on it the same way).
  if (option.value === "none" && facet !== "psi_id") return NOT_STATED;
  if (facet === "psi_id") return investigationLabel(option.value, option.label);
  if (facet === "fuel_phase") return FUEL_LABEL[option.value as FuelPhase] ?? option.value;
  return option.value;
}

// ---------------------------------------------------------------- flags

/** The flag on an inverse flame: oxygen is the burner gas, so the oxygen column stays empty. */
export const INVERSE_FLAME = "oxygen_is_burner_stream";

/**
 * Every flag the data service writes on a test row (pipeline/catalog/tables.py), in words.
 * A value flag reads "<field>:<kind>", for example "pressure_kpa:range_or_list".
 */
const FLAG_WORDS: Record<string, { label: string; explain: string }> = {
  suspect_pressure: {
    label: "suspect pressure",
    explain:
      "The table states a pressure of 0 for this test. The value is kept as published and marked suspect. Check the source file before using it.",
  },
  co_header_assumed_co2: {
    label: "CO column read as CO2",
    explain: "The table's column header reads \"CO\". This site reads it as carbon dioxide (CO2). The file does not say which.",
  },
  // An inverse flame (pipeline/catalog/tables.py, the PSI-10 and PSI-159 inverse-flame tables).
  [INVERSE_FLAME]: {
    label: "Inverse flame",
    explain:
      "Oxygen flows from the burner into fuel gas, so this oxygen value is not the air around the flame. It is left out of the oxygen column.",
  },
  note: {
    label: "note line",
    explain: "This row is a note line of the table.",
  },
};

/** The value fields a flag can name, in words. */
const FIELD_WORDS: Record<string, string> = {
  o2_mole_fraction: "oxygen",
  pressure_kpa: "pressure",
  flow_cm_s: "airflow",
};

/** What happened to a value, per kind of value flag. `{field}` is replaced by the field's word. */
const VALUE_FLAG_WORDS: Record<string, { label: string; short: string; explain: string }> = {
  range_or_list: {
    label: "{field} is a range or list",
    short: "its {field} is a range or a list",
    explain: "The table gives a range or a list for the {field} of this test, so the value is left empty.",
  },
  not_a_number: {
    label: "{field} is not a number",
    short: "its {field} is not a number",
    explain: "The table's {field} cell holds no single number, so the value is left empty.",
  },
  approximate: {
    label: "{field} approximate",
    short: "its {field} is approximate",
    explain: "The table marks the {field} of this test as approximate (with a ~). The number is used as written.",
  },
  unknown_unit: {
    label: "{field} unit not converted",
    short: "its {field} unit is not converted",
    explain: "The table states the {field} in a unit this site does not convert, so the value is left empty.",
  },
  out_of_range: {
    label: "{field} out of range",
    short: "its {field} is out of range",
    explain: "The table's {field} cell cannot be a share of the gas (above 100%, for example), so the value is left empty.",
  },
};

/** Underscores and colons to plain words: "pressure_kpa:odd_thing" -> "pressure kpa: odd thing". */
function readable(text: string): string {
  return text.replace(/_/g, " ").replace(/:/g, ": ").replace(/\s+/g, " ").trim();
}

function valueFlag(flag: string): { field: string; kind: string } | null {
  const at = flag.indexOf(":");
  if (at <= 0) return null;
  return { field: flag.slice(0, at), kind: flag.slice(at + 1) };
}

function fill(template: string, field: string): string {
  return template.replace("{field}", FIELD_WORDS[field] ?? readable(field));
}

/** A flag in words, never colour only: "suspect_pressure" -> "suspect pressure". Unknown flags stay readable. */
export function flagLabel(flag: string): string {
  const known = FLAG_WORDS[flag];
  if (known) return known.label;
  const value = valueFlag(flag);
  const words = value ? VALUE_FLAG_WORDS[value.kind] : undefined;
  if (value && words) return fill(words.label, value.field);
  if (value && FIELD_WORDS[value.field]) return `${FIELD_WORDS[value.field]}: ${readable(value.kind)}`;
  return readable(flag);
}

/** One sentence that explains a flag. */
export function flagExplanation(flag: string): string {
  const known = FLAG_WORDS[flag];
  if (known) return known.explain;
  const value = valueFlag(flag);
  const words = value ? VALUE_FLAG_WORDS[value.kind] : undefined;
  if (value && words) return fill(words.explain, value.field);
  return `The data service marks this test "${flagLabel(flag)}". This site has no explanation for that mark yet.`;
}

type ComparableFields = Pick<TestRow, "comparable" | "flags" | "o2_mole_fraction" | "pressure_kpa">;

/**
 * Why a test is off the chart, one part per missing value (oxygen, then pressure). `flagged`
 * is true when a flag on the row already says it, so its badge carries the reason.
 */
function missingParts(row: ComparableFields): { text: string; flagged: boolean }[] {
  if (row.comparable) return [];
  const parts: { text: string; flagged: boolean }[] = [];
  for (const field of ["o2_mole_fraction", "pressure_kpa"] as const) {
    if (row[field] !== null) continue;
    const flagged = row.flags
      .map(valueFlag)
      .find((value) => value !== null && value.field === field && VALUE_FLAG_WORDS[value.kind]);
    if (flagged) parts.push({ text: fill(VALUE_FLAG_WORDS[flagged.kind].short, field), flagged: true });
    else if (field === "o2_mole_fraction" && row.flags.includes(INVERSE_FLAME)) parts.push({ text: "inverse flame", flagged: true });
    else parts.push({ text: `no ${FIELD_WORDS[field]} stated`, flagged: false });
  }
  if (parts.length === 0) parts.push({ text: "it lacks a value the chart needs", flagged: false });
  return parts;
}

function sentenceCase(text: string): string {
  return text[0].toUpperCase() + text.slice(1);
}

/**
 * Why a test is not comparable (it lacks oxygen or pressure, so it is not on the chart), in
 * words built from its flags: "No pressure stated; its oxygen is a range or a list".
 * Null for a comparable test.
 */
export function notComparableReason(row: ComparableFields): string | null {
  const parts = missingParts(row);
  return parts.length === 0 ? null : sentenceCase(parts.map((part) => part.text).join("; "));
}

/**
 * The same for a table row, where the flag badges sit next to it: only what no badge says
 * ("no pressure stated"). Null for a comparable test and when the badges say it all, so an
 * inverse flame is named once.
 */
export function unflaggedReason(row: ComparableFields): string | null {
  const parts = missingParts(row).filter((part) => !part.flagged);
  return parts.length === 0 ? null : parts.map((part) => part.text).join("; ");
}

/** "1 test", "186 tests". */
export function testsCount(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "test" : "tests"}`;
}

/** "12 tests are left out because their table states no pressure." One line per active range. */
export function excludedLines(query: TestsQuery, excluded: Partial<Record<"o2" | "pressure" | "flow", number>>): string[] {
  const lines: string[] = [];
  for (const range of RANGES) {
    const active = query.ranges[range.min] !== null || query.ranges[range.max] !== null;
    const count = excluded[range.name] ?? 0;
    if (!active || count <= 0) continue;
    lines.push(
      `${testsCount(count)} ${count === 1 ? "is" : "are"} left out because ${count === 1 ? "its table states" : "their table states"} no ${range.what}.`,
    );
  }
  return lines;
}

/**
 * The facet's options: every value the backend counted, plus a value chosen in the URL that the
 * backend no longer lists (count 0, so it can be unticked). Order as the backend sends it.
 */
export function testFacetOptions(
  counts: FacetCount[] | undefined,
  chosen: string[],
): { value: string; label?: string | null; count: number }[] {
  const list = [...(counts ?? [])];
  for (const value of chosen) if (!list.some((option) => option.value === value)) list.push({ value, count: 0 });
  return list;
}

/** How many options a facet shows before "Show all": the real tables name over a hundred fuels. */
export const FACET_SHORT_LIST = 10;

/**
 * The options a facet shows: all of them when the list is short or opened, otherwise the first
 * `limit` (the backend sends the largest counts first) plus every chosen option, so a ticked box
 * is never hidden. `hidden` is how many are left for "Show all".
 */
export function visibleFacetOptions<T extends { value: string }>(
  options: T[],
  chosen: string[],
  expanded: boolean,
  limit = FACET_SHORT_LIST,
): { shown: T[]; hidden: number } {
  if (expanded || options.length <= limit + 2) return { shown: options, hidden: 0 };
  const shown = options.filter((option, index) => index < limit || chosen.includes(option.value));
  return { shown, hidden: options.length - shown.length };
}

/** True for a list long enough to fold: such a list also gets a search box. */
export function facetIsLong(count: number, limit = FACET_SHORT_LIST): boolean {
  return count > limit + 2;
}

/**
 * The options a search leaves (DOB-154): those whose label contains the typed text, ignoring case
 * and the spaces around it, plus every chosen option, so a ticked box is never hidden. Order is
 * kept. An empty text keeps every option.
 */
export function searchFacetOptions<T extends { value: string }>(
  options: T[],
  chosen: string[],
  text: string,
  labelOf: (option: T) => string,
): T[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) => chosen.includes(option.value) || labelOf(option).toLowerCase().includes(needle));
}

/**
 * What the explorer says in place of the chart when no matching test can be drawn on it (DOB-153):
 * the chart needs both oxygen and pressure, and whole investigations state only one or neither.
 */
export function noChartNote(count: number): string {
  if (count === 1) {
    return "This test does not state both oxygen and pressure, so it cannot be placed on the chart. It is in the table below.";
  }
  return `None of these ${count.toLocaleString("en-US")} tests states both oxygen and pressure, so none can be placed on the chart. They are in the table below.`;
}
