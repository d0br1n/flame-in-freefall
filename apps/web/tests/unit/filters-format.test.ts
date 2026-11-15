import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  activeCount,
  applyFilters,
  emptyFilters,
  facetOptions,
  matches,
  parseFilters,
  serializeFilters,
  toggleFilter,
} from "@/lib/filters";
import { fileGap, formatBytes, formatCount, formatPercent, holdingsLine, plural } from "@/lib/format";
import type { InvestigationList, InvestigationSummary } from "@/lib/types";
import { fixtureFor } from "../../scripts/stub-api.mjs";

function row(over: Partial<InvestigationSummary>): InvestigationSummary {
  return {
    psi_id: "PSI-1",
    acronym: null,
    title: "t",
    ground_investigation: false,
    pillar: "prevention",
    stage: "spread",
    fuel_phase: "solid",
    hardware_group: "ground",
    hardware_group_label: "Ground",
    psi_sub_area: null,
    summary_plain: null,
    data_kinds: [],
    table_count: 0,
    files_count: 0,
    files_bytes: 0,
    listed_bytes: null,
    publications_count: 0,
    psi_url: "https://doi.org/x",
    ...over,
  };
}

const items = [
  row({ psi_id: "PSI-1", pillar: "detection", fuel_phase: "aerosol", hardware_group: "smoke", hardware_group_label: "Smoke", data_kinds: ["table", "video"] }),
  row({ psi_id: "PSI-2", pillar: "detection", fuel_phase: "aerosol", hardware_group: "smoke", hardware_group_label: "Smoke", data_kinds: ["table"] }),
  row({ psi_id: "PSI-3", pillar: "prevention", fuel_phase: "solid", hardware_group: "duct", hardware_group_label: "Duct", data_kinds: ["video"] }),
  row({ psi_id: "PSI-4", pillar: "suppression", fuel_phase: "liquid", hardware_group: "duct", hardware_group_label: "Duct", data_kinds: [] }),
];

describe("parseFilters / serializeFilters", () => {
  it("reads repeated and comma-separated values, deduplicated", () => {
    const filters = parseFilters("?pillar=detection&pillar=prevention,detection&fuel=solid&other=x");
    expect(filters).toEqual({ pillar: ["detection", "prevention"], fuel: ["solid"], hardware: [], kind: [] });
  });

  it("writes a stable query, keeps air, drops other parameters", () => {
    const filters = { ...emptyFilters(), fuel: ["solid", "liquid"], pillar: ["detection"] };
    expect(serializeFilters(filters, "air=station&page=2")).toBe("air=station&pillar=detection&fuel=liquid&fuel=solid");
    expect(serializeFilters(emptyFilters(), "air=station")).toBe("air=station");
    expect(serializeFilters(emptyFilters())).toBe("");
  });

  it("round-trips", () => {
    const filters = { ...emptyFilters(), kind: ["video", "table"], hardware: ["duct"] };
    const back = parseFilters(serializeFilters(filters));
    expect(back.kind.sort()).toEqual(["table", "video"]);
    expect(back.hardware).toEqual(["duct"]);
  });

  it("toggles a value on and off", () => {
    const on = toggleFilter(emptyFilters(), "pillar", "detection");
    expect(on.pillar).toEqual(["detection"]);
    expect(activeCount(on)).toBe(1);
    expect(toggleFilter(on, "pillar", "detection").pillar).toEqual([]);
  });
});

describe("matching", () => {
  it("is any-of within a facet and and across facets", () => {
    const anyOf = { ...emptyFilters(), pillar: ["detection", "prevention"] };
    expect(applyFilters(items, anyOf).map((item) => item.psi_id)).toEqual(["PSI-1", "PSI-2", "PSI-3"]);
    const and = { ...anyOf, fuel: ["solid"] };
    expect(applyFilters(items, and).map((item) => item.psi_id)).toEqual(["PSI-3"]);
  });

  it("matches a kind of data when the investigation has any of the chosen kinds", () => {
    const filters = { ...emptyFilters(), kind: ["video"] };
    expect(applyFilters(items, filters).map((item) => item.psi_id)).toEqual(["PSI-1", "PSI-3"]);
  });

  it("returns nothing for a combination no investigation has", () => {
    expect(applyFilters(items, { ...emptyFilters(), pillar: ["detection"], fuel: ["solid"] })).toEqual([]);
  });

  it("can ignore one facet (for counting)", () => {
    const filters = { ...emptyFilters(), pillar: ["detection"], fuel: ["solid"] };
    expect(matches(items[2], filters, "pillar")).toBe(true);
    expect(matches(items[2], filters)).toBe(false);
  });
});

describe("facetOptions", () => {
  it("counts each value against the other facets, never its own", () => {
    const filters = { ...emptyFilters(), pillar: ["detection"] };
    const pillar = facetOptions(items, filters, "pillar");
    expect(pillar.map((option) => [option.value, option.count])).toEqual([
      ["prevention", 1],
      ["detection", 2],
      ["suppression", 1],
    ]);
    const fuel = facetOptions(items, filters, "fuel");
    expect(fuel.find((option) => option.value === "aerosol")?.count).toBe(2);
    expect(fuel.find((option) => option.value === "solid")?.count).toBe(0);
  });

  it("uses the backend's hardware label and lists a chosen value missing from the data", () => {
    const filters = { ...emptyFilters(), hardware: ["nowhere"] };
    const hardware = facetOptions(items, filters, "hardware");
    expect(hardware.map((option) => option.label)).toEqual(["Duct", "Smoke", "nowhere"]);
    expect(hardware.find((option) => option.value === "nowhere")?.count).toBe(0);
  });

  it("counts a kind of data once per investigation", () => {
    const kind = facetOptions(items, emptyFilters(), "kind");
    expect(kind.map((option) => [option.value, option.count])).toEqual([
      ["table", 2],
      ["video", 2],
    ]);
  });

  it("matches the catalog fixture: 4 detection investigations of 24", () => {
    const list = JSON.parse(readFileSync(fixtureFor("/api/v1/catalog/investigations") as string, "utf8")) as InvestigationList;
    const filters = parseFilters("pillar=detection");
    expect(applyFilters(list.items, filters)).toHaveLength(4);
    const total = facetOptions(list.items, emptyFilters(), "pillar").reduce((sum, option) => sum + option.count, 0);
    expect(total).toBe(list.count);
    expect(applyFilters(list.items, parseFilters("pillar=detection&fuel=solid"))).toHaveLength(0);
  });
});

describe("formatBytes and friends", () => {
  it("uses decimal units", () => {
    expect(formatBytes(923832535657)).toBe("923.83 GB");
    expect(formatBytes(6308108039)).toBe("6.31 GB");
    expect(formatBytes(2180435304347)).toBe("2.18 TB");
    expect(formatBytes(24776)).toBe("24.78 kB");
    expect(formatBytes(1000)).toBe("1.00 kB");
    expect(formatBytes(999995)).toBe("1.00 MB");
    expect(formatBytes(734)).toBe("734 bytes");
    expect(formatBytes(1)).toBe("1 byte");
    expect(formatBytes(0)).toBe("0 bytes");
    expect(formatBytes(-1)).toBe("unknown size");
  });

  it("formats counts and plurals", () => {
    expect(formatCount(16354)).toBe("16,354");
    expect(plural(1, "file")).toBe("1 file");
    expect(plural(342, "file")).toBe("342 files");
  });

  it("never rounds a real gap away", () => {
    expect(formatPercent(734 / 72914598688)).toBe("less than 0.01%");
    expect(formatPercent(0.0051)).toBe("0.51%");
    expect(formatPercent(0.051)).toBe("5.1%");
    expect(formatPercent(0.51)).toBe("51%");
  });

  it("describes the gap between what PSI lists and what it offers", () => {
    expect(fileGap(0, 923832535657)).toEqual({ kind: "none_offered", listed: 923832535657 });
    expect(fileGap(734, 72914598688).kind).toBe("partial");
    expect(fileGap(6308108039, 6308124750).kind).toBe("complete");
    expect(fileGap(10, null)).toEqual({ kind: "not_listed" });
  });

  it("writes one line for a list row", () => {
    expect(holdingsLine(0, 0, 923832535657)).toBe("No files to download; PSI lists 923.83 GB");
    expect(holdingsLine(0, 0, null)).toBe("No files to download");
    expect(holdingsLine(342, 6308108039, 6308124750)).toBe("342 files, 6.31 GB");
    expect(holdingsLine(1, 734, 72914598688)).toBe("1 file, 734 bytes of 72.91 GB listed");
  });
});
