import { describe, expect, it } from "vitest";
import { inAirSummary, phaseOptions, share, shortName, stageInvestigations, statusPill, topRanked } from "@/lib/overview";
import type { AirCoverage, InvestigationSummary, RankResponse } from "@/lib/types";

const inv = (psi_id: string, extra: Partial<InvestigationSummary> = {}) =>
  ({ psi_id, acronym: null, title: `Title of ${psi_id}`, stage: null, fuel_phase: "gas", pillar: "fundamentals", ...extra }) as InvestigationSummary;

const coverage: AirCoverage = {
  air: "station",
  constrains: ["o2_mole_fraction", "pressure_kpa"],
  stages: {
    spread: { status: "not_stated", inside: null, stated: 0, investigations: [{ psi_id: "PSI-25", status: "not_stated", inside: null, stated: 0 }] },
    suppress: { status: "tested", inside: 49, stated: 274, investigations: [{ psi_id: "PSI-69", status: "tested", inside: 49, stated: 274 }] },
    other: {
      status: "tested",
      inside: 67,
      stated: 227,
      investigations: [
        { psi_id: "PSI-10", status: "tested", inside: 67, stated: 207 },
        { psi_id: "PSI-39", status: "never_tested", inside: 0, stated: 20 },
      ],
    },
  },
};

describe("the In this air card", () => {
  const items = [inv("PSI-69", { acronym: "FLEX", fuel_phase: "liquid" }), inv("PSI-10", { acronym: "ACME/Flame Design" }), inv("PSI-39", { title: "One two three four five six seven" })];

  it("adds up every stage, the stage-less investigations included, from the backend's counts", () => {
    const summary = inAirSummary(coverage, items);
    expect(summary.inside).toBe(49 + 67 + 0);
    expect(summary.stated).toBe(274 + 207 + 20);
    expect(summary.notStated).toBe(1);
  });

  it("lists investigations with tests in this air first, then by tests stated", () => {
    const rows = inAirSummary(coverage, items).rows;
    expect(rows.map((row) => row.psi_id)).toEqual(["PSI-10", "PSI-69", "PSI-39"]);
    expect(rows[1]).toMatchObject({ name: "FLEX", fuel_phase: "liquid", inside: 49, stated: 274, status: "tested" });
    expect(rows[2].name).toBe("One two three four five…");
  });

  it("still works before the catalog answers: names fall back to the PSI ID", () => {
    expect(inAirSummary(coverage, null).rows[0]).toMatchObject({ psi_id: "PSI-10", name: "PSI-10", fuel_phase: null });
    expect(shortName(undefined, "PSI-1")).toBe("PSI-1");
  });
});

describe("status pills", () => {
  it("say the status in words, with a tone", () => {
    expect(statusPill("tested")).toEqual({ word: "Tested", tone: "ok" });
    expect(statusPill("never_tested")).toEqual({ word: "Never tested in this air", tone: "danger" });
    expect(statusPill("not_stated")).toEqual({ word: "Not stated", tone: "warn" });
    expect(statusPill(undefined)).toBeNull();
  });

  it("draw a share from counts, never past 0 to 1", () => {
    expect(share(49, 274)).toBeCloseTo(0.1788, 3);
    expect(share(null, 0)).toBe(0);
    expect(share(5, 2)).toBe(1);
  });
});

describe("the flame map filter and the ranking", () => {
  it("offers All, then the fuel phases the tests list, most tests first", () => {
    expect(phaseOptions([{ value: "liquid", count: 300 }, { value: "gas", count: 900 }, { value: "solid", count: 0 }, { value: "none", count: 4 }])).toEqual([
      { value: null, label: "All" },
      { value: "gas", label: "Gas flames" },
      { value: "liquid", label: "Droplets" },
    ]);
    expect(phaseOptions(undefined)).toEqual([{ value: null, label: "All" }]);
  });

  it("keeps the stage's investigations and the top of the ranking", () => {
    expect(stageInvestigations([inv("A", { stage: "detect" }), inv("B", { stage: "spread" })], "detect").map((i) => i.psi_id)).toEqual(["A"]);
    const rank = { items: [1, 2, 3, 4, 5, 6].map((n) => ({ rank: n, psi_id: `PSI-${n}` })) } as unknown as RankResponse;
    expect(topRanked(rank, 5).map((item) => item.rank)).toEqual([1, 2, 3, 4, 5]);
  });
});
