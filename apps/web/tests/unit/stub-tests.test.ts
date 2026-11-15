import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { oneTest, queryTests } from "../../scripts/stub-tests.mjs";

const rows = JSON.parse(readFileSync(new URL("../../fixtures/data/tests.json", import.meta.url), "utf8"));
const query = (text: string) => queryTests(rows, new URLSearchParams(text));

describe("stub /catalog/tests", () => {
  it("holds the two tables as PSI publishes them", () => {
    expect(query("").total).toBe(481);
    expect(query("psi_id=PSI-69").total).toBe(274); // docs/PSI_VERIFICATION_REPORT.md
    expect(query("psi_id=PSI-10").total).toBe(207);
  });

  it("filters FLEX by outcome: 186 tests end in extinction", () => {
    const result = query("psi_id=PSI-69&outcome=Extinction");
    expect(result.total).toBe(186);
    expect(result.items.every((row) => row.outcome === "Extinction")).toBe(true);
  });

  it("keeps only rows inside an oxygen range", () => {
    const result = query("o2_min=0.3&limit=200&include=points");
    expect(result.total).toBeGreaterThan(0);
    expect(result.items.every((row) => row.o2_mole_fraction >= 0.3)).toBe(true);
    expect(result.points?.items).toHaveLength(result.total);
  });

  it("pages without repeating a row", () => {
    const first = query("limit=50&offset=0").items.map((row) => row.test_id);
    const second = query("limit=50&offset=50").items.map((row) => row.test_id);
    expect(first).toHaveLength(50);
    expect(second.some((id: string) => first.includes(id))).toBe(false);
  });

  it("lists inverse flames after every other row, as the real route does (DOB-125)", () => {
    const row = (test_id: string, flags: string[]) => ({
      test_id, psi_id: "PSI-10", acronym: "Flame Design", fuel: null, fuel_phase: "gas", outcome: null, diluent: null,
      o2_mole_fraction: null, pressure_kpa: 101.3, flow_cm_s: null, flags,
    });
    const mixed = [row("a", ["oxygen_is_burner_stream"]), row("b", []), row("c", ["oxygen_is_burner_stream"]), row("d", [])];
    const ids = (text: string) => queryTests(mixed, new URLSearchParams(text)).items.map((item) => item.test_id);
    expect(ids("")).toEqual(["b", "d", "a", "c"]);
    expect([...ids("limit=2"), ...ids("limit=2&offset=2")]).toEqual(["b", "d", "a", "c"]);
    expect(queryTests(mixed, new URLSearchParams("")).total).toBe(4);
  });

  it("counts a facet without its own filter, so a choice can be widened", () => {
    const result = query("psi_id=PSI-69&outcome=Extinction");
    const outcomes = Object.fromEntries(result.facets.outcome.map((f) => [f.value, f.count]));
    expect(outcomes).toEqual({ Extinction: 186, Disruption: 61, Completion: 27 });
    expect(result.facets.psi_id.find((f) => f.value === "PSI-69")?.label).toBe("FLEX");
  });

  it("keeps the suspect FLEX test 114 and flags it", () => {
    const row = query("psi_id=PSI-69&limit=200&include=raw").items.find((r) => r.test_id === "PSI-69/114");
    expect(row?.pressure_kpa).toBe(0);
    expect(row?.flags).toContain("suspect_pressure");
    expect(row?.original.pressure_kpa).toMatchObject({ text: "0", unit: "mmHg" });
    expect(row?.source_file).toBe("PSI-69_Experimental table_FLEX.csv");
    expect(row?.raw["FLEX Test #"]).toBe("114");
  });

  it("leaves the raw row out unless asked", () => {
    expect(query("limit=1").items[0].raw).toBeUndefined();
  });

  it("opens one test by its ID, with its cells as published", () => {
    const result = query("test_id=PSI-69%2F114&include=raw");
    expect(result.total).toBe(1);
    expect(result.items[0].test_id).toBe("PSI-69/114");
    expect(result.items[0].raw["Test end"]).toBe("Extinction");
  });
});

describe("stub /catalog/tests/{test_id}", () => {
  it("answers one test by its ID with its cells, and nothing for an unknown ID", () => {
    const row = oneTest(rows, "PSI-69/114");
    expect(row?.test_id).toBe("PSI-69/114");
    expect(row?.raw["FLEX Test #"]).toBe("114");
    expect(row?.evidence).toEqual([]);
    expect(oneTest(rows, "PSI-69/99999")).toBeNull();
  });
});
