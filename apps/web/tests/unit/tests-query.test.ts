import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  clearTestFilters,
  emptyTestsQuery,
  excludedLines,
  facetIsLong,
  facetLabel,
  flagExplanation,
  flagLabel,
  formatValue,
  fromPercent,
  hasFilters,
  noChartNote,
  notComparableReason,
  originalText,
  originalValue,
  parseTestsQuery,
  pointsApiPath,
  rangeFromInput,
  rangeToInput,
  searchFacetOptions,
  serializeTestsQuery,
  testApiPath,
  testFacetOptions,
  testsApiPath,
  textOrNotStated,
  toPercent,
  toggleTestFacet,
  unflaggedReason,
  valueWithOriginal,
  visibleFacetOptions,
} from "@/lib/tests";
import type { TestRow } from "@/lib/types";

const params = (path: string) => new URLSearchParams(path.split("?")[1] ?? "");

describe("the request path names every filter as the API documents it", () => {
  const query = emptyTestsQuery();
  query.facets = {
    psi_id: ["PSI-69", "PSI-10"],
    fuel: ["Methanol"],
    fuel_phase: ["liquid"],
    outcome: ["Extinction"],
    diluent: ["CO2", "He"],
  };
  query.ranges = { o2_min: 0.18, o2_max: 0.3, pressure_min: 50, pressure_max: 110, flow_min: 1, flow_max: 20 };
  query.limit = 25;
  query.offset = 50;
  query.test = "PSI-69/114";

  it("sends each facet under its own name, repeated for 'any of'", () => {
    const p = params(testsApiPath(query));
    expect(testsApiPath(query).startsWith("/catalog/tests?")).toBe(true);
    expect(p.getAll("psi_id")).toEqual(["PSI-10", "PSI-69"]);
    expect(p.getAll("fuel")).toEqual(["Methanol"]);
    expect(p.getAll("fuel_phase")).toEqual(["liquid"]);
    expect(p.getAll("outcome")).toEqual(["Extinction"]);
    expect(p.getAll("diluent")).toEqual(["CO2", "He"]);
  });

  it("sends the ranges in the API's units (oxygen as a mole fraction) and the page", () => {
    const p = params(testsApiPath(query));
    expect(p.get("o2_min")).toBe("0.18");
    expect(p.get("o2_max")).toBe("0.3");
    expect(p.get("pressure_min")).toBe("50");
    expect(p.get("pressure_max")).toBe("110");
    expect(p.get("flow_min")).toBe("1");
    expect(p.get("flow_max")).toBe("20");
    expect(p.get("limit")).toBe("25");
    expect(p.get("offset")).toBe("50");
  });

  it("never sends the open test, the air or anything else to the list", () => {
    const keys = [...new Set(params(testsApiPath(query)).keys())].sort();
    expect(keys).toEqual(
      ["diluent", "flow_max", "flow_min", "fuel", "fuel_phase", "limit", "o2_max", "o2_min", "offset", "outcome", "pressure_max", "pressure_min", "psi_id"].sort(),
    );
  });

  it("asks for every point, not paged, with the same filters", () => {
    const p = params(pointsApiPath(query));
    expect(p.get("include")).toBe("points");
    expect(p.get("offset")).toBeNull();
    expect(p.getAll("outcome")).toEqual(["Extinction"]);
    expect(p.get("o2_min")).toBe("0.18");
  });

  it("asks for one test on its own route, the slash kept and everything else encoded", () => {
    expect(testApiPath("PSI-69/114")).toBe("/catalog/tests/PSI-69/114");
    expect(testApiPath("PSI-39/1285#3")).toBe("/catalog/tests/PSI-39/1285%233");
    expect(testApiPath("PSI-20/#1")).toBe("/catalog/tests/PSI-20/%231");
    expect(testApiPath("PSI-159/21196 A1")).toBe("/catalog/tests/PSI-159/21196%20A1");
    expect(testApiPath(" PSI-69/114 ")).toBe("/catalog/tests/PSI-69/114");
  });

  it("asks for everything with no parameters when nothing is chosen", () => {
    expect(testsApiPath(emptyTestsQuery())).toBe("/catalog/tests");
  });
});

describe("the page URL", () => {
  it("reads facets, ranges, paging and the open test", () => {
    const query = parseTestsQuery(
      "?air=station&psi_id=PSI-69&outcome=Extinction&outcome=Completion&o2_min=0.2&pressure_max=abc&limit=20&offset=40&test=PSI-69%2F114",
    );
    expect(query.facets.psi_id).toEqual(["PSI-69"]);
    expect(query.facets.outcome).toEqual(["Extinction", "Completion"]);
    expect(query.ranges.o2_min).toBe(0.2);
    expect(query.ranges.pressure_max).toBeNull();
    expect(query.limit).toBe(20);
    expect(query.offset).toBe(40);
    expect(query.test).toBe("PSI-69/114");
  });

  it("ignores a negative offset and a zero limit", () => {
    const query = parseTestsQuery("offset=-5&limit=0");
    expect(query.offset).toBe(0);
    expect(query.limit).toBeNull();
  });

  it("keeps air untouched, uses the API's names, and round-trips", () => {
    const text = "air=exploration&psi_id=PSI-69&outcome=Extinction&o2_max=0.25&offset=50&test=PSI-69%2F114";
    const query = parseTestsQuery(text);
    const written = serializeTestsQuery(query, "?air=exploration&junk=1");
    expect(new URLSearchParams(written).get("air")).toBe("exploration");
    expect(new URLSearchParams(written).get("junk")).toBeNull();
    expect(parseTestsQuery(written)).toEqual(query);
  });

  it("writes nothing but the air when nothing is chosen", () => {
    expect(serializeTestsQuery(emptyTestsQuery(), "air=station")).toBe("air=station");
    expect(serializeTestsQuery(emptyTestsQuery(), null)).toBe("");
  });

  it("goes back to the first page when a filter changes, and clears every filter", () => {
    const query = { ...parseTestsQuery("psi_id=PSI-69&o2_min=0.2&offset=50&limit=20"), test: "PSI-69/1" };
    const toggled = toggleTestFacet(query, "outcome", "Extinction");
    expect(toggled.offset).toBe(0);
    expect(toggled.facets.outcome).toEqual(["Extinction"]);
    expect(toggleTestFacet(toggled, "outcome", "Extinction").facets.outcome).toEqual([]);
    expect(activeFilterCount(query)).toBe(2);
    const cleared = clearTestFilters(query);
    expect(hasFilters(cleared)).toBe(false);
    expect(cleared.limit).toBe(20);
    expect(cleared.test).toBeNull();
  });
});

describe("units", () => {
  it("shows oxygen as percent and sends it as a mole fraction", () => {
    expect(toPercent(0.21)).toBe(21);
    expect(fromPercent(21)).toBe(0.21);
    expect(rangeFromInput("o2", "30")).toBe(0.3);
    expect(rangeFromInput("pressure", "70.33")).toBe(70.33);
    expect(rangeFromInput("o2", "")).toBeNull();
    expect(rangeFromInput("o2", "abc")).toBeNull();
    expect(rangeToInput("o2", 0.205)).toBe("20.5");
    expect(rangeToInput("flow", null)).toBe("");
  });
});

describe("value formatting", () => {
  const row: Pick<TestRow, "original"> = {
    original: {
      o2_mole_fraction: { text: "0.207128374", unit: "mole fraction", column: "XO2 (init)" },
      pressure_kpa: { text: "757.7", unit: "mmHg", column: "Ambient pressure; mmHg" },
    },
  };

  it("writes an empty value as 'not stated', never 0", () => {
    expect(formatValue("flow_cm_s", null)).toBe("not stated");
    expect(formatValue("pressure_kpa", 0)).toBe("0 kPa");
    expect(textOrNotStated(null)).toBe("not stated");
    expect(textOrNotStated("  ")).toBe("not stated");
    expect(textOrNotStated("CO2")).toBe("CO2");
  });

  it("writes the converted value with the original beside it", () => {
    expect(formatValue("o2_mole_fraction", 0.2071)).toBe("20.71%");
    expect(valueWithOriginal(row, "pressure_kpa", 101.02)).toBe("101.02 kPa (757.7 mmHg as published)");
    expect(valueWithOriginal(row, "o2_mole_fraction", 0.2071)).toBe("20.71% (0.207128374 mole fraction as published)");
    expect(valueWithOriginal(row, "flow_cm_s", null)).toBe("not stated");
  });

  it("leaves the original out when it says the same thing", () => {
    const same: Pick<TestRow, "original"> = { original: { pressure_kpa: { text: "101", unit: "kPa", column: "p" } } };
    expect(originalText(same, "pressure_kpa", 101)).toBeNull();
    expect(originalText(same, "pressure_kpa", 101.3)).toBe("101 kPa as published");
    expect(originalValue(row, "pressure_kpa", 101.02)).toBe("757.7 mmHg");
    expect(originalValue(row, "flow_cm_s", null)).toBeNull();
  });

  it("names investigations and flags in words", () => {
    expect(facetLabel("psi_id", { value: "PSI-69", label: "FLEX" })).toBe("FLEX, PSI-69");
    expect(facetLabel("psi_id", { value: "PSI-1", label: null })).toBe("PSI-1");
    expect(facetLabel("fuel_phase", { value: "liquid" })).toBe("Liquid fuel");
    expect(flagLabel("suspect_pressure")).toBe("suspect pressure");
    expect(flagExplanation("suspect_pressure")).toContain("kept as published");
  });

  it("words every flag the data service writes, and keeps an unknown one readable", () => {
    const known = [
      "suspect_pressure", "co_header_assumed_co2", "oxygen_is_burner_stream", "note",
      ...["o2_mole_fraction", "pressure_kpa", "flow_cm_s"].flatMap((field) =>
        ["range_or_list", "not_a_number", "approximate", "unknown_unit", "out_of_range"].map((kind) => `${field}:${kind}`),
      ),
    ];
    for (const flag of known) {
      expect(flagLabel(flag)).not.toMatch(/[_:]/);
      expect(flagExplanation(flag)).not.toContain("no explanation");
      expect(flagExplanation(flag)).toMatch(/\.$/);
    }
    expect(flagLabel("oxygen_is_burner_stream")).toBe("Inverse flame");
    expect(flagExplanation("oxygen_is_burner_stream")).toBe(
      "Oxygen flows from the burner into fuel gas, so this oxygen value is not the air around the flame. It is left out of the oxygen column.",
    );
    expect(flagLabel("pressure_kpa:range_or_list")).toBe("pressure is a range or list");
    expect(flagLabel("o2_mole_fraction:approximate")).toBe("oxygen approximate");
    expect(flagLabel("odd_thing")).toBe("odd thing");
    expect(flagLabel("pressure_kpa:odd_kind")).toBe("pressure: odd kind");
    expect(flagLabel("weird_field:odd_kind")).toBe("weird field: odd kind");
    expect(flagExplanation("odd_thing")).toContain('"odd thing"');
  });

  it("says why a test is not comparable, from its flags", () => {
    const base = { comparable: false, o2_mole_fraction: null, pressure_kpa: 101.3, flags: [] as string[] };
    expect(notComparableReason({ ...base, comparable: true, o2_mole_fraction: 0.21 })).toBeNull();
    expect(notComparableReason(base)).toBe("No oxygen stated");
    expect(notComparableReason({ ...base, flags: ["oxygen_is_burner_stream"] })).toBe("Inverse flame");
    expect(notComparableReason({ ...base, pressure_kpa: null, flags: ["oxygen_is_burner_stream"] })).toBe(
      "Inverse flame; no pressure stated",
    );
    expect(notComparableReason({ ...base, flags: ["o2_mole_fraction:range_or_list"] })).toBe("Its oxygen is a range or a list");
    expect(notComparableReason({ ...base, o2_mole_fraction: 0.21, pressure_kpa: null, flags: ["pressure_kpa:out_of_range"] })).toBe(
      "Its pressure is out of range",
    );
    expect(notComparableReason({ ...base, pressure_kpa: null })).toBe("No oxygen stated; no pressure stated");
  });

  it("leaves out of a table row the reason its flag badge already gives (DOB-125)", () => {
    const base = { comparable: false, o2_mole_fraction: null, pressure_kpa: 101.3, flags: [] as string[] };
    expect(unflaggedReason({ ...base, comparable: true, o2_mole_fraction: 0.21 })).toBeNull();
    // An inverse flame is named once, by its badge.
    expect(unflaggedReason({ ...base, flags: ["oxygen_is_burner_stream"] })).toBeNull();
    expect(unflaggedReason({ ...base, flags: ["o2_mole_fraction:range_or_list"] })).toBeNull();
    // A reason no badge gives stays, once.
    expect(unflaggedReason(base)).toBe("no oxygen stated");
    expect(unflaggedReason({ ...base, pressure_kpa: null, flags: ["oxygen_is_burner_stream"] })).toBe("no pressure stated");
    expect(unflaggedReason({ ...base, pressure_kpa: null })).toBe("no oxygen stated; no pressure stated");
  });

  it("says why tests are left out, only for an active range", () => {
    const query = parseTestsQuery("pressure_min=50");
    expect(excludedLines(query, { o2: 3, pressure: 12, flow: 0 })).toEqual([
      "12 tests are left out because their table states no pressure.",
    ]);
    expect(excludedLines(parseTestsQuery("flow_max=5"), { flow: 1 })).toEqual([
      "1 test is left out because its table states no airflow.",
    ]);
    expect(excludedLines(emptyTestsQuery(), { o2: 3, pressure: 12, flow: 0 })).toEqual([]);
  });

  it("keeps a chosen value the backend no longer lists, so it can be unticked", () => {
    expect(testFacetOptions([{ value: "CO2", count: 3 }], ["He"])).toEqual([
      { value: "CO2", count: 3 },
      { value: "He", count: 0 },
    ]);
  });
});

describe("long facet lists", () => {
  const options = Array.from({ length: 30 }, (_, i) => ({ value: `fuel-${i}`, count: 30 - i }));

  it("shows the first ten and keeps every chosen option visible", () => {
    const { shown, hidden } = visibleFacetOptions(options, ["fuel-25"], false);
    expect(shown.map((o) => o.value)).toEqual([...options.slice(0, 10).map((o) => o.value), "fuel-25"]);
    expect(hidden).toBe(19);
  });

  it("shows everything when opened or when the list is short", () => {
    expect(visibleFacetOptions(options, [], true)).toEqual({ shown: options, hidden: 0 });
    expect(visibleFacetOptions(options.slice(0, 12), [], false).hidden).toBe(0);
  });

  it("calls an empty cell 'not stated', not 'none'", () => {
    expect(facetLabel("fuel", { value: "none" })).toBe("not stated");
    expect(facetLabel("outcome", { value: "Extinction" })).toBe("Extinction");
  });
});

describe("searching a long facet list (DOB-154)", () => {
  const fuels = [
    { value: "Heptane", count: 40 },
    { value: "n-Decane", count: 12 },
    { value: "Methanol", count: 9 },
    { value: "none", count: 2 },
  ];
  const label = (option: { value: string }) => facetLabel("fuel", option);

  it("keeps the options whose label contains the text, ignoring case and outer spaces, in order", () => {
    expect(searchFacetOptions(fuels, [], "  AN ", label).map((o) => o.value)).toEqual(["Heptane", "n-Decane", "Methanol"]);
    expect(searchFacetOptions(fuels, [], "dec", label).map((o) => o.value)).toEqual(["n-Decane"]);
  });

  it("searches the label a visitor reads, not the raw value", () => {
    expect(searchFacetOptions(fuels, [], "not stated", label).map((o) => o.value)).toEqual(["none"]);
  });

  it("never hides a ticked option, and an empty text keeps every option", () => {
    expect(searchFacetOptions(fuels, ["Methanol"], "hept", label).map((o) => o.value)).toEqual(["Heptane", "Methanol"]);
    expect(searchFacetOptions(fuels, [], "   ", label)).toBe(fuels);
    expect(searchFacetOptions(fuels, [], "xyz", label)).toEqual([]);
  });

  it("offers the search only for a list long enough to fold", () => {
    expect(facetIsLong(12)).toBe(false);
    expect(facetIsLong(13)).toBe(true);
  });
});

describe("the note in place of an empty chart (DOB-153)", () => {
  it("counts the tests that cannot be placed and points to the table", () => {
    expect(noChartNote(469)).toBe(
      "None of these 469 tests states both oxygen and pressure, so none can be placed on the chart. They are in the table below.",
    );
    expect(noChartNote(1234)).toContain("these 1,234 tests");
  });

  it("reads right for a single test", () => {
    expect(noChartNote(1)).toBe(
      "This test does not state both oxygen and pressure, so it cannot be placed on the chart. It is in the table below.",
    );
  });
});
