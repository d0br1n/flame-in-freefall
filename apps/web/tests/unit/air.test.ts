import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { airQuery, airShort, airWhileLoading, coveragePath, nearestTestedAir, testedMarks, parseAirChoice, resolveAir, sameChoice, snap, urlWithAir, windowPath, windowPoint } from "@/lib/air";
import { rankPath } from "@/lib/home";
import type { AirPresets } from "@/lib/types";

const presets: AirPresets = JSON.parse(
  readFileSync(new URL("../../fixtures/api/v1/air/presets.json", import.meta.url), "utf8"),
);

describe("resolveAir", () => {
  it("uses the air named in the URL", () => {
    expect(resolveAir(presets, "exploration")).toMatchObject({ air: { id: "exploration" }, isDefault: false });
  });

  it("falls back to the backend's default when the URL names none or an unknown one", () => {
    expect(resolveAir(presets, null)).toMatchObject({ air: { id: presets.default }, isDefault: true });
    expect(resolveAir(presets, "mars")).toMatchObject({ air: { id: presets.default }, isDefault: true });
  });

  it("falls back to the first preset if the default is missing, and to nothing if there is none", () => {
    expect(resolveAir({ ...presets, default: "gone" }, null).air?.id).toBe(presets.presets[0].id);
    expect(resolveAir({ default: "x", presets: [] }, null)).toEqual({ air: null, isDefault: true });
  });
});

describe("air in the URL", () => {
  it("asks the backend for the chosen air and for nothing while it is unknown", () => {
    expect(coveragePath("exploration")).toBe("/air/coverage?air=exploration");
    expect(coveragePath(null)).toBeNull();
  });

  it("changes only the air and keeps the page's other parameters", () => {
    expect(urlWithAir("/tests", "?psi_id=PSI-69&air=station", "exploration")).toBe(
      "/tests?psi_id=PSI-69&air=exploration",
    );
    expect(urlWithAir("/", "", "station")).toBe("/?air=station");
  });
});

describe("a custom air", () => {
  it("reads a custom point from the URL, and a preset by id", () => {
    expect(parseAirChoice("?air=custom&o2=0.24&p=80")).toEqual({ kind: "custom", o2: 0.24, p: 80 });
    expect(parseAirChoice("?air=custom&o2=0.240001&p=80.004")).toEqual({ kind: "custom", o2: 0.24, p: 80 });
    expect(parseAirChoice("?air=station")).toEqual({ kind: "preset", id: "station" });
    expect(parseAirChoice("")).toBeNull();
  });

  it("refuses a custom air with a missing or impossible point", () => {
    expect(parseAirChoice("?air=custom")).toBeNull();
    expect(parseAirChoice("?air=custom&o2=24&p=80")).toBeNull();
    expect(parseAirChoice("?air=custom&o2=0.24&p=-1")).toBeNull();
    expect(parseAirChoice("?air=custom&o2=abc&p=80")).toBeNull();
  });

  it("names the air to the API: air= for a preset, o2= and pressure_kpa= for a custom point", () => {
    expect(airQuery("station")).toBe("air=station");
    expect(airQuery({ kind: "preset", id: "a b" })).toBe("air=a%20b");
    expect(airQuery({ kind: "custom", o2: 0.24, p: 80 })).toBe("o2=0.24&pressure_kpa=80");
    expect(coveragePath({ kind: "custom", o2: 0.3, p: 70.33 })).toBe("/air/coverage?o2=0.3&pressure_kpa=70.33");
    expect(rankPath({ kind: "custom", o2: 0.3, p: 70 })).toBe("/catalog/rank?o2=0.3&pressure_kpa=70");
    expect(rankPath({ kind: "preset", id: "station" })).toBe("/catalog/rank?air=station");
    expect(windowPath(0.21, 101.3529)).toBe("/air/window?o2=0.21&pressure_kpa=101.35");
    expect(airQuery(null)).toBeNull();
  });

  it("writes a custom air into the URL, and clears it when a preset is chosen", () => {
    expect(urlWithAir("/tests", "?psi_id=PSI-69&air=station", { kind: "custom", o2: 0.25, p: 70 })).toBe(
      "/tests?psi_id=PSI-69&air=custom&o2=0.25&p=70",
    );
    expect(urlWithAir("/", "?air=custom&o2=0.25&p=70", "station")).toBe("/?air=station");
    expect(urlWithAir("/", "?air=custom&o2=0.25&p=70", { kind: "preset", id: "exploration" })).toBe("/?air=exploration");
  });

  it("places the sliders inside a preset's window without inventing a point", () => {
    const range = { o2_min: 0.12, o2_max: 0.4, pressure_kpa_min: 43, pressure_kpa_max: 507 };
    const station = presets.presets.find((preset) => preset.id === "station")!;
    const point = windowPoint(station.window, range);
    expect(point.isRange).toBe(false);
    expect(point.o2).toBeCloseTo(0.21, 6);
    expect(point.p!).toBeGreaterThan(station.window.pressure_kpa_min!);
    expect(point.p!).toBeLessThan(station.window.pressure_kpa_max!);
    const exploration = presets.presets.find((preset) => preset.id === "exploration")!;
    const open = windowPoint(exploration.window, range);
    expect(open.isRange).toBe(true);
    expect(open.o2!).toBeGreaterThanOrEqual(exploration.window.o2_min!);
    expect(open.p!).toBeLessThanOrEqual(exploration.window.pressure_kpa_max!);
    expect(windowPoint({ ...exploration.window, pressure_kpa_max: null }).p).toBeNull();
  });

  it("snaps a value onto the slider's grid", () => {
    expect(snap(101.3529, 43, 507, 0.5)).toBe(101.5);
    expect(snap(5, 43, 507, 0.5)).toBe(43);
    expect(snap(21.04, 12, 40, 0.5)).toBe(21);
    expect(snap(999, 12, 40, 0.5)).toBe(40);
  });

  it("writes the air in a few characters, from its window or its point", () => {
    const station = presets.presets.find((preset) => preset.id === "station")!;
    expect(airShort(station)).toMatch(/^21% O₂ · 101\.\d kPa$/);
    const exploration = presets.presets.find((preset) => preset.id === "exploration")!;
    expect(airShort(exploration)).toBe(`≥30% O₂ · ≤${Number(exploration.window.pressure_kpa_max!.toFixed(1))} kPa`);
    expect(airShort({ window: station.window, point: { o2_mole_fraction: 0.245, pressure_kpa: 80 } })).toBe("24.5% O₂ · 80 kPa");
  });

  it("tells two choices apart", () => {
    expect(sameChoice({ kind: "custom", o2: 0.24, p: 80 }, { kind: "custom", o2: 0.24, p: 80 })).toBe(true);
    expect(sameChoice({ kind: "preset", id: "a" }, { kind: "custom", o2: 0.24, p: 80 })).toBe(false);
    expect(sameChoice(null, null)).toBe(true);
  });
});

describe("the air shown while a custom point loads (DOB-147)", () => {
  const preset = { id: "station" };
  const custom = { id: "custom" };

  it("keeps the last custom air when there is one", () => {
    expect(airWhileLoading(custom, preset)).toBe(custom);
  });

  it("keeps the preset on screen on the first move away from it, so the sliders are not replaced", () => {
    expect(airWhileLoading(null, preset)).toBe(preset);
  });

  it("has nothing to keep on a page opened straight on a custom air", () => {
    expect(airWhileLoading(null, null)).toBeNull();
  });
});

describe("slider marks where catalogued tests exist", () => {
  it("places one mark per tested position, as a share of the slider, and leaves out values off the slider", () => {
    // 28 bins over 12 to 40% oxygen: one bin per point of oxygen.
    expect(testedMarks([21, 21, 30, 50, Number.NaN], 12, 40, 28)).toEqual([9 / 28, 18 / 28]);
    expect(testedMarks([12, 40], 12, 40, 28)).toEqual([0, 1]);
  });

  it("merges values that share a position and returns the marks in slider order", () => {
    expect(testedMarks([30.2, 21.1, 20.9, 30], 12, 40, 28)).toEqual([9 / 28, 18 / 28]);
  });

  it("has no marks without tests or without a slider range", () => {
    expect(testedMarks([], 12, 40)).toEqual([]);
    expect(testedMarks([21], 40, 40)).toEqual([]);
  });
});

describe("nearest tested air", () => {
  const range = { o2_min: 0.12, o2_max: 0.4, pressure_kpa_min: 43, pressure_kpa_max: 507 };
  const tests = [
    { testId: "PSI-A/1", o2: 0.21, p: 101.3 },
    { testId: "PSI-B/1", o2: 0.3, p: 70 },
    { testId: "PSI-C/1", o2: 0.4, p: 300 },
  ];

  it("picks the test closest to the sliders, each axis measured in slider widths", () => {
    expect(nearestTestedAir({ o2: 0.22, p: 100 }, tests, range)?.testId).toBe("PSI-A/1");
    expect(nearestTestedAir({ o2: 0.29, p: 72 }, tests, range)?.testId).toBe("PSI-B/1");
    // 199 kPa away is 0.43 of the pressure slider; 19 points of oxygen away is 0.68 of the oxygen slider.
    expect(nearestTestedAir({ o2: 0.21, p: 300 }, tests, range)?.testId).toBe("PSI-A/1");
  });

  it("reports a distance of 0 on a tested air and keeps the first of two equally near tests", () => {
    expect(nearestTestedAir({ o2: 0.3, p: 70 }, tests, range)).toMatchObject({ testId: "PSI-B/1", distance: 0 });
    const twins = [{ testId: "first", o2: 0.2, p: 100 }, { testId: "second", o2: 0.2, p: 100 }];
    expect(nearestTestedAir({ o2: 0.25, p: 100 }, twins, range)?.testId).toBe("first");
  });

  it("answers nothing when there is no test or no slider range", () => {
    expect(nearestTestedAir({ o2: 0.21, p: 101 }, [], range)).toBeNull();
    expect(nearestTestedAir({ o2: 0.21, p: 101 }, tests, { ...range, o2_max: 0.12 })).toBeNull();
  });
});
