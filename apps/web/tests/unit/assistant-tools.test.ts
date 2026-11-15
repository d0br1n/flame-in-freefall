import { describe, expect, it } from "vitest";
import {
  DataError,
  MAX_ROWS,
  createDataFetcher,
  createToolbox,
  parsePsiId,
  parseTestId,
  toolLabel,
  toolSpecs,
  trim,
  type FetchJson,
} from "@/lib/assistant/tools";
import type { ToolResult } from "@/lib/assistant/types";

// The assistant's tools against fake answers of the data service: no network.

type Routes = Record<string, unknown>;

function fakeData(routes: Routes, from: "live" | "saved_copy" = "live") {
  const calls: string[] = [];
  const fetchJson: FetchJson = async (path) => {
    calls.push(path);
    if (!(path in routes)) throw new DataError("not_found", `No route ${path}`);
    const value = routes[path];
    if (value instanceof DataError) throw value;
    return { data: value, from };
  };
  return { fetchJson, calls };
}

function okData(result: ToolResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.data;
}

const INVESTIGATIONS = {
  count: 3,
  items: [
    { psi_id: "PSI-25", acronym: "BASS-II", title: "Burning and Suppression of Solids II", pillar: "prevention", stage: "spread", fuel_phase: "solid", summary_plain: "Thin solid samples burned in a flow duct.", table_count: 1, files_count: 40, ground_investigation: false },
    { psi_id: "PSI-69", acronym: "FLEX", title: "Flame Extinguishment Experiment", pillar: "suppression", stage: "suppress", fuel_phase: "liquid", summary_plain: "Fuel droplets burned until the flame went out. ".repeat(20), table_count: 1, files_count: 2, ground_investigation: false },
    { psi_id: "PSI-10", acronym: "ACME/Flame Design", title: "Flame Design", pillar: "fundamentals", stage: null, fuel_phase: "gas", summary_plain: "Gas flames.", table_count: 2, files_count: 3807, ground_investigation: false },
  ],
};

function testRow(n: number, extra: Record<string, unknown> = {}) {
  return {
    test_id: `PSI-69/${n}`, psi_id: "PSI-69", acronym: "FLEX", table_name: "FLEX", test_number: String(n),
    fuel: "Heptane", fuel_phase: "liquid", o2_mole_fraction: 0.21, pressure_kpa: 101.3, flow_cm_s: null,
    diluent: "N2", outcome: "Extinction", comparable: true, original: {}, flags: [],
    source_file: "PSI-69_Experimental table_FLEX.csv", source_row: n, ...extra,
  };
}

describe("argument checks", () => {
  it("reads PSI IDs in their usual spellings and refuses anything else", () => {
    expect(parsePsiId("PSI-69")).toBe("PSI-69");
    expect(parsePsiId("psi-69")).toBe("PSI-69");
    expect(parsePsiId("69")).toBe("PSI-69");
    expect(parsePsiId(69)).toBe("PSI-69");
    for (const bad of ["PSI-69/../../x", "FLEX", "PSI-", "", "PSI-69?x=1", "http://x"]) {
      expect(() => parsePsiId(bad)).toThrow(/PSI investigation ID/);
    }
  });

  it("reads test IDs, including repeated numbers and spaces, and refuses others", () => {
    expect(parseTestId("PSI-69/114")).toBe("PSI-69/114");
    expect(parseTestId("psi-39/1285#23")).toBe("PSI-39/1285#23");
    expect(parseTestId("PSI-159/21088 B1")).toBe("PSI-159/21088 B1");
    for (const bad of ["69/114", "PSI-69", "PSI-69/a?b", "PSI-69/<script>"]) expect(() => parseTestId(bad)).toThrow(/test ID/);
  });

  it("trims long texts at a word boundary", () => {
    expect(trim("short", 20)).toBe("short");
    const cut = trim("one two three four five six seven", 18) ?? "";
    expect(cut.length).toBeLessThanOrEqual(18);
    expect(cut.endsWith("…")).toBe(true);
    expect(trim(42, 10)).toBeNull();
  });

  it("describes every tool for the model with a strict JSON-schema object", () => {
    for (const spec of toolSpecs()) {
      expect(spec.strict).toBe(true);
      expect(spec.input_schema.type).toBe("object");
      expect(spec.input_schema.additionalProperties).toBe(false);
      expect(spec.description!.length).toBeGreaterThan(20);
    }
  });

  it("gives a plain label, and a generic one for a bad argument", () => {
    expect(toolLabel("query_tests", { psi_id: "PSI-69" })).toBe("Looking up PSI-69 tests");
    expect(toolLabel("get_investigation", { psi_id: "nonsense" })).toBe("Reading an investigation");
    expect(toolLabel("no_such_tool", {})).toBe("Reading the data");
  });
});

describe("the toolbox", () => {
  it("returns an error result, never throws, for an unknown tool, bad arguments or a data error", async () => {
    const { fetchJson } = fakeData({});
    const box = createToolbox(fetchJson);
    expect(await box.run("no_such_tool", {})).toMatchObject({ ok: false });
    expect(await box.run("get_investigation", "PSI-69")).toMatchObject({ ok: false, error: /JSON object/ });
    expect(await box.run("get_investigation", { psi_id: "../../etc" })).toMatchObject({ ok: false, error: /PSI investigation ID/ });
    expect(await box.run("get_investigation", { psi_id: "PSI-1" })).toMatchObject({ ok: false, error: /^Not found/ });
  });

  it("asks the data service once per path in one conversation", async () => {
    const { fetchJson, calls } = fakeData({ "/catalog/investigations": INVESTIGATIONS });
    const box = createToolbox(fetchJson);
    await box.run("search_investigations", {});
    await box.run("search_investigations", { text: "flex" });
    expect(calls).toEqual(["/catalog/investigations"]);
  });
});

describe("search_investigations", () => {
  it("filters in code, trims the summaries and lists the investigations as sources", async () => {
    const box = createToolbox(fakeData({ "/catalog/investigations": INVESTIGATIONS }).fetchJson);
    const data = okData(await box.run("search_investigations", { fuel_phase: "liquid" }));
    expect(data.total).toBe(3);
    expect(data.matched).toBe(1);
    const item = (data.items as Record<string, unknown>[])[0];
    expect(item.psi_id).toBe("PSI-69");
    expect(String(item.summary).length).toBeLessThanOrEqual(360);
    const result = await box.run("search_investigations", { stage: "none" });
    expect(result.sources).toEqual([{ kind: "investigation", id: "PSI-10", label: "ACME/Flame Design" }]);
    expect(await box.run("search_investigations", { pillar: "everything" })).toMatchObject({ ok: false, error: /pillar must be one of/ });
  });
});

describe("get_investigation", () => {
  it("normalizes the ID, keeps what the model needs and names related investigations and analyses as sources", async () => {
    const detail = {
      psi_id: "PSI-69", acronym: "FLEX", title: "Flame Extinguishment Experiment", pillar: "suppression", stage: "suppress",
      fuel_phase: "liquid", summary_plain: "Droplets.", summary_written_by: "SI", ground_investigation: false,
      psi_text: { objective: "x ".repeat(800) }, tags: { measurements: { value: ["droplet diameter"] } },
      cannot_tell: ["No partial gravity."], conditions: { hardware: "MDCA" },
      files: { count: 2, tables: [{ file_name: "PSI-69_Experimental table_FLEX.csv" }], by_category: [] },
      publications_count: 3, related: ["PSI-68", "not-an-id"], engines: [{ id: "flame-temperature", title: "Flame temperature", stage: "suppress", status: "built" }],
      psi_url: "https://doi.org/x", publications: [{ title: "dropped" }],
    };
    const { fetchJson, calls } = fakeData({ "/catalog/investigations/PSI-69": detail, "/catalog/investigations": INVESTIGATIONS });
    const result = await createToolbox(fetchJson).run("get_investigation", { psi_id: "69" });
    expect(calls[0]).toBe("/catalog/investigations/PSI-69");
    const data = okData(result);
    expect(String(data.nasa_objective).length).toBeLessThanOrEqual(700);
    expect(data.related).toEqual(["PSI-68"]);
    expect(data).not.toHaveProperty("publications");
    expect(result.sources).toContainEqual({ kind: "investigation", id: "PSI-69", label: "FLEX" });
    expect(result.sources).toContainEqual({ kind: "investigation", id: "PSI-68" });
    expect(result.sources).toContainEqual(expect.objectContaining({ kind: "analysis", id: "flame-temperature", href: "/suppress" }));
    expect(result.sources).toContainEqual({ kind: "file", id: "PSI-69_Experimental table_FLEX.csv" });
  });
});

describe("query_tests", () => {
  const response = {
    total: 50, limit: 20, offset: 0,
    items: Array.from({ length: 50 }, (_, i) => testRow(i + 1)),
    facets: { psi_id: [{ value: "PSI-69", count: 50, label: "FLEX" }], fuel: Array.from({ length: 15 }, (_, i) => ({ value: `fuel ${i}`, count: 1 })) },
    excluded: { o2: 3, pressure: 0, flow: 0 },
    points: { items: [["PSI-69/1", "PSI-69", 0.21, 101.3], ["PSI-69/2", "PSI-69", 0.25, 70.9], ["PSI-69/3", "PSI-69", 0.25, 101.3]], not_plotted: 0 },
  };

  it("sends only validated filters, caps the rows at 20 and summarises the ranges", async () => {
    const path = "/catalog/tests?psi_id=PSI-69&diluent=N2%2BCO2&o2_min=0.2&limit=20&include=points";
    const { fetchJson, calls } = fakeData({ [path]: response, "/catalog/investigations": INVESTIGATIONS });
    const result = await createToolbox(fetchJson).run("query_tests", { psi_id: "psi-69", diluent: "N2+CO2", o2_min: 0.2, limit: 500 });
    expect(calls[0]).toBe(path);
    const data = okData(result);
    expect(data.shown).toBe(MAX_ROWS);
    expect((data.rows as unknown[]).length).toBe(MAX_ROWS);
    expect((data.counts as Record<string, unknown[]>).fuel.length).toBe(10);
    expect(data.left_out_because_value_not_stated).toEqual({ o2: 3 });
    expect(data.ranges_of_matching_tests).toMatchObject({
      tests_stating_both: 3,
      o2_mole_fraction: { min: 0.21, max: 0.25, tests_at_max: ["PSI-69/2", "PSI-69/3"], tests_at_max_count: 2 },
    });
    const row = (data.rows as Record<string, unknown>[])[0];
    expect(row).not.toHaveProperty("original");
    expect(result.sources).toContainEqual({ kind: "investigation", id: "PSI-69", label: "FLEX" });
    expect(result.sources).toContainEqual({ kind: "test", id: "PSI-69/1" });
    expect(result.sources).toContainEqual({ kind: "test", id: "PSI-69/3" });
  });

  it("refuses oxygen given as a percentage and an air that is not a preset ID", async () => {
    const box = createToolbox(fakeData({}).fetchJson);
    expect(await box.run("query_tests", { o2_min: 30 })).toMatchObject({ ok: false, error: /mole fraction/ });
    expect(await box.run("query_tests", { air: "../../admin" })).toMatchObject({ ok: false, error: /preset ID/ });
  });
});

describe("get_test", () => {
  it("encodes the test number in the path and lists the analysis values with their provenance", async () => {
    const row = {
      ...testRow(1285, { test_id: "PSI-39/1285#23", psi_id: "PSI-39", acronym: "CFI" }),
      raw: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`col${i}`, "v".repeat(200)])),
      evidence: [{ module: "flame-temperature", quantity: "ceiling_temperature", value: 2220.4, unit: "K", n: 1, provenance: "MODEL", flags: [] }],
    };
    const { fetchJson, calls } = fakeData({ "/catalog/tests/PSI-39/1285%2323": row, "/catalog/investigations": INVESTIGATIONS });
    const result = await createToolbox(fetchJson).run("get_test", { test_id: "PSI-39/1285#23" });
    expect(calls[0]).toBe("/catalog/tests/PSI-39/1285%2323");
    const data = okData(result);
    expect(Object.keys(data.row_as_published as object)).toHaveLength(25);
    expect(String(Object.values(data.row_as_published as object)[0]).length).toBeLessThanOrEqual(80);
    expect(data.analysis_values).toEqual([expect.objectContaining({ value: 2220.4, unit: "K", provenance: "MODEL" })]);
    expect(result.sources).toContainEqual({ kind: "test", id: "PSI-39/1285#23" });
  });
});

describe("cabin air tools", () => {
  const presets = { default: "station", presets: [{ id: "station", label: "Station cabin", plain: "About 21% oxygen at 14.7 psi", tolerance_plain: "t", source: "s" }] };
  const coverage = {
    air: "station", window: { o2_min: 0.2, o2_max: 0.22 }, constrains: [],
    stages: { suppress: { status: "tested", inside: 49, stated: 274, investigations: [{ psi_id: "PSI-69", status: "tested", inside: 49, stated: 274 }] } },
  };

  it("labels the coverage with acronyms and the preset", async () => {
    const box = createToolbox(fakeData({ "/air/coverage?air=station": coverage, "/air/presets": presets, "/catalog/investigations": INVESTIGATIONS }).fetchJson);
    const result = await box.run("cabin_air_coverage", { air: "station" });
    const data = okData(result);
    expect(data.air_label).toBe("Station cabin (About 21% oxygen at 14.7 psi)");
    expect((data.stages as Record<string, { investigations: unknown[] }>).suppress.investigations[0]).toEqual({
      psi_id: "PSI-69", acronym: "FLEX", status: "tested", inside: 49, stated: 274,
    });
    expect(result.sources).toEqual([{ kind: "investigation", id: "PSI-69", label: "FLEX" }]);
  });

  it("ranks: keeps the top 10 and says what the ranking cannot tell", async () => {
    const items = Array.from({ length: 24 }, (_, i) => ({
      rank: i + 1, psi_id: `PSI-${i + 1}`, acronym: null, pillar: "related", stage: null, score: 1 - i / 24,
      parts: { pillar: { score: 0, reason: "r" }, evidence: { score: 0, inside: null, stated: 0, reason: "r" }, data: { score: 1, reason: "r" }, fuel: { score: 0, reason: "r" } },
      reason: "A reason.",
    }));
    const rank = { air: "station", weights: { pillar: 0.25 }, weights_are_default: true, formula: "f", items };
    const box = createToolbox(fakeData({ "/catalog/rank?air=station": rank, "/air/presets": presets, "/catalog/investigations": INVESTIGATIONS }).fetchJson);
    const data = okData(await box.run("rank_investigations", { air: "station" }));
    expect((data.items as unknown[]).length).toBe(10);
    expect(data.ranked).toBe(24);
    expect(String(data.cannot_tell)).toMatch(/not how dangerous/);
  });
});

describe("analysis tools", () => {
  const analysisModule = { id: "flame-temperature", title: "Flame temperature", stage: "suppress", status: "example", psi_ids: ["PSI-69", "PSI-10"], summary: "s", cannot_tell: ["Microgravity only."], question: "q", files: [] };
  const findings = [
    { id: "h1", kind: "headline", text: "A headline.", value: 1, unit: "tests", n: 1, provenance: "PSI_TABLE", source: { psi_id: "PSI-69", file: "f.csv" } },
    { id: "c1", kind: "check", text: "A check.", value: 2.5, unit: "K", n: 147, provenance: "MODEL", source: { psi_id: "PSI-10", file: "g.csv" }, passed: true },
  ];
  const evidence = [
    { test_id: "PSI-69/1", quantity: "ceiling_temperature", value: 2220.4, unit: "K", n: 1, provenance: "MODEL", flags: [], conditions: { fuel: "Methanol", nested: { a: 1 } }, source: { psi_id: "PSI-69", file: "f.csv" } },
    { test_id: "PSI-69/2", quantity: "ceiling_temperature", value: 1800, unit: "K", n: 1, provenance: "MODEL", flags: [], conditions: {}, source: { psi_id: "PSI-69", file: "f.csv" } },
    { test_id: "PSI-69/2", quantity: "share_burned", value: 0.5, unit: "", n: 1, provenance: "PSI_TABLE", flags: [], conditions: {}, source: { psi_id: "PSI-69", file: "f.csv" } },
  ];
  const routes = {
    "/modules": [{ id: "_mock", status: "example" }, { id: "flame-temperature", status: "built", title: "Flame temperature", stage: "suppress", question: "q", evidence_count: 3, findings_count: 2 }, { id: "broken", status: "not_built", problems: 2 }],
    "/modules/flame-temperature": analysisModule,
    "/modules/flame-temperature/findings": findings,
    "/modules/flame-temperature/evidence": evidence,
    "/catalog/investigations": INVESTIGATIONS,
  };

  it("lists analyses without the mock and with no numbers for one not built", async () => {
    const data = okData(await createToolbox(fakeData(routes).fetchJson).run("list_analyses", {}));
    expect(data.analyses).toEqual([
      { id: "flame-temperature", status: "built", title: "Flame temperature", stage: "suppress", question: "q", values: 3, findings: 2, page: "/suppress" },
      { id: "broken", status: "not_built" },
    ]);
  });

  it("splits findings into headlines and checks, keeps pass or fail, and warns on example data", async () => {
    const result = await createToolbox(fakeData(routes).fetchJson).run("get_findings", { analysis_id: "flame-temperature" });
    const data = okData(result);
    expect(data.warning).toMatch(/placeholder/);
    expect(data.headlines).toEqual([expect.objectContaining({ id: "h1", psi_id: "PSI-69" })]);
    expect(data.checks).toEqual([expect.objectContaining({ id: "c1", passed: true, provenance: "MODEL" })]);
    expect(result.sources).toContainEqual(expect.objectContaining({ kind: "analysis", id: "flame-temperature", href: "/suppress", psi_ids: ["PSI-69", "PSI-10"] }));
    expect(result.sources).toContainEqual({ kind: "investigation", id: "PSI-10", label: "ACME/Flame Design" });
    expect(await createToolbox(fakeData(routes).fetchJson).run("get_findings", { analysis_id: "../x" })).toMatchObject({ ok: false });
  });

  it("filters evidence in code, reports the quantities and the range, and keeps conditions small", async () => {
    const { fetchJson, calls } = fakeData(routes);
    const result = await createToolbox(fetchJson).run("get_evidence", { analysis_id: "flame-temperature", quantity: "ceiling_temperature" });
    expect(calls).toContain("/modules/flame-temperature/evidence");
    const data = okData(result);
    expect(data.matched).toBe(2);
    expect(data.quantities).toEqual({ ceiling_temperature: 2, share_burned: 1 });
    expect(data.range_of_matching_values).toEqual({ count: 2, unit: "K", min: 1800, test_at_min: "PSI-69/2", max: 2220.4, test_at_max: "PSI-69/1" });
    expect((data.rows as Record<string, unknown>[])[0].conditions).toEqual({ fuel: "Methanol" });
    const one = okData(await createToolbox(fetchJson).run("get_evidence", { analysis_id: "flame-temperature", test_id: "PSI-69/2" }));
    expect(one.matched).toBe(2);
  });

  it("next_tests_to_fly passes on the scope and the not-a-prediction sentence, filters by gas and caps rows", async () => {
    const gaps = {
      header: { psi_ids: { "PSI-69": "u", "PSI-39": "u" }, scope: "Scope: droplets only.", not_a_prediction: "Not a prediction.", region: "r", distance: "d", headline: "h" },
      rows: Array.from({ length: 30 }, (_, i) => ({
        rank: i + 1, fuel: "Heptane", added_gas: i % 2 ? "helium" : "carbon dioxide", x_added: 0.5, x_o2: 0.34, pressure_atm: 0.7,
        distance: 0.7, nearest_test_id: `PSI-69/${i + 1}`, nearest_conditions: {}, model_fails_here: i % 2 === 1, note: "n",
      })),
    };
    const box = createToolbox(fakeData({ ...routes, "/modules/flame-temperature/files/flex_gaps.json": gaps }).fetchJson);
    const result = await box.run("next_tests_to_fly", { added_gas: "helium", limit: 99 });
    const data = okData(result);
    expect(data.scope).toBe("Scope: droplets only.");
    expect(data.not_a_prediction).toBe("Not a prediction.");
    expect(data.matched).toBe(15);
    expect((data.rows as unknown[]).length).toBe(15);
    expect((data.rows as Record<string, unknown>[]).every((r) => r.added_gas === "helium")).toBe(true);
    expect(result.sources).toContainEqual({ kind: "investigation", id: "PSI-39", label: undefined });
    expect(result.sources).toContainEqual({ kind: "file", id: "flex_gaps.json" });
    const capped = okData(await box.run("next_tests_to_fly", { limit: 99 }));
    expect((capped.rows as unknown[]).length).toBe(MAX_ROWS);
  });
});

describe("createDataFetcher", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  function fetcherOf(routes: Record<string, () => Response | Promise<Response>>) {
    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      const route = routes[url];
      if (!route) throw new TypeError("fetch failed");
      const signal = init?.signal;
      return Promise.race([
        route(),
        new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted")))),
      ]);
    }) as typeof fetch;
    return { fetcher, calls };
  }

  it("answers from the live data service", async () => {
    const { fetcher, calls } = fetcherOf({ "http://api/api/v1/modules": () => json([{ id: "x" }]) });
    const get = createDataFetcher({ apiOrigin: "http://api/", siteOrigin: "https://site", fetcher });
    expect(await get("/modules")).toEqual({ data: [{ id: "x" }], from: "live" });
    expect(calls).toEqual(["http://api/api/v1/modules"]);
  });

  it("falls back to the saved copy when the service fails, and says so", async () => {
    const { fetcher, calls } = fetcherOf({
      "http://api/api/v1/catalog/rank?air=station": () => json({}, 502),
      "https://site/snapshot/api/v1/catalog/rank__air=station.json": () => json({ items: [] }),
    });
    const get = createDataFetcher({ apiOrigin: "http://api", siteOrigin: "https://site", fetcher });
    expect(await get("/catalog/rank?air=station")).toEqual({ data: { items: [] }, from: "saved_copy" });
    expect(calls[1]).toBe("https://site/snapshot/api/v1/catalog/rank__air=station.json");
  });

  it("falls back when the service hangs past the time limit", async () => {
    const { fetcher } = fetcherOf({
      "http://api/api/v1/modules": () => new Promise<Response>(() => {}),
      "https://site/snapshot/api/v1/modules.json": () => json([]),
    });
    const get = createDataFetcher({ apiOrigin: "http://api", siteOrigin: "https://site", fetcher, timeoutMs: 20 });
    expect(await get("/modules")).toEqual({ data: [], from: "saved_copy" });
  });

  it("treats a 404 as an answer and never asks the saved copy", async () => {
    const { fetcher, calls } = fetcherOf({ "http://api/api/v1/catalog/investigations/PSI-1": () => json({ detail: "No investigation 'PSI-1'." }, 404) });
    const get = createDataFetcher({ apiOrigin: "http://api", siteOrigin: "https://site", fetcher });
    const error = await get("/catalog/investigations/PSI-1").catch((e) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(error.kind).toBe("not_found");
    expect(error.message).toBe("No investigation 'PSI-1'.");
    expect(calls).toHaveLength(1);
  });

  it("says plainly when neither answers", async () => {
    const { fetcher } = fetcherOf({});
    const get = createDataFetcher({ apiOrigin: "http://api", siteOrigin: null, fetcher });
    const error = await get("/modules").catch((e) => e);
    expect(error.kind).toBe("unreachable");
  });

  it("a tool reports the saved copy as its origin", async () => {
    const box = createToolbox(fakeData({ "/catalog/investigations": INVESTIGATIONS }, "saved_copy").fetchJson);
    expect(await box.run("search_investigations", {})).toMatchObject({ ok: true, from: "saved_copy" });
  });
});
