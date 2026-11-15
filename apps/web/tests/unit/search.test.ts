import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { searchInvestigations, testsTarget } from "@/lib/search";
import type { InvestigationList } from "@/lib/types";

const catalog: InvestigationList = JSON.parse(
  readFileSync(new URL("../../fixtures/api/v1/catalog/investigations.json", import.meta.url), "utf8"),
);
const ids = (query: string) => searchInvestigations(catalog.items, query).map((match) => match.item.psi_id);

describe("searching investigations", () => {
  it("finds a PSI ID however it is typed, the exact one first", () => {
    expect(ids("PSI-69")[0]).toBe("PSI-69");
    expect(ids("psi 69")[0]).toBe("PSI-69");
    expect(ids("psi69")[0]).toBe("PSI-69");
  });

  it("finds an acronym and words of a title", () => {
    expect(ids("flex")).toContain("PSI-69");
    expect(ids("FLEX")[0]).toBe("PSI-69");
    expect(ids("smoke").length).toBeGreaterThan(0);
    for (const id of ids("smoke")) {
      const item = catalog.items.find((entry) => entry.psi_id === id)!;
      expect(`${item.title} ${item.acronym}`.toLowerCase()).toContain("smoke");
    }
  });

  it("returns nothing for empty text and caps the list", () => {
    expect(ids("   ")).toEqual([]);
    expect(searchInvestigations(catalog.items, "a", 3)).toHaveLength(3);
    expect(ids("zzzz-no-such-thing")).toEqual([]);
  });
});

describe("Search tests for ...", () => {
  const facets = {
    psi_id: [{ value: "PSI-69", count: 274 }],
    fuel: [{ value: "Methanol", count: 10 }],
    outcome: [{ value: "Extinction", count: 5 }],
  };

  it("opens a typed test ID", () => {
    expect(testsTarget("PSI-69/114", facets)).toMatchObject({ href: "/tests?test=PSI-69%2F114", kind: "test" });
    expect(testsTarget("psi 20/#1", facets)?.href).toBe("/tests?test=PSI-20%2F%231");
  });

  it("filters by a PSI ID that has tests, and offers nothing for one that has none", () => {
    expect(testsTarget("psi-69", facets)).toMatchObject({ href: "/tests?psi_id=PSI-69", kind: "investigation" });
    expect(testsTarget("PSI-1", facets)).toBeNull();
  });

  it("filters by a fuel or an outcome the tests list, whatever the case", () => {
    expect(testsTarget("methanol", facets)).toMatchObject({ href: "/tests?fuel=Methanol", kind: "fuel" });
    expect(testsTarget("EXTINCTION", facets)?.href).toBe("/tests?outcome=Extinction");
  });

  it("offers no tests option for text the tests page cannot filter by", () => {
    expect(testsTarget("flame", facets)).toBeNull();
    expect(testsTarget("", facets)).toBeNull();
  });

  it("names the search in the option", () => {
    expect(testsTarget("PSI-69", facets)?.label).toBe("Search tests for “PSI-69”");
  });
});
