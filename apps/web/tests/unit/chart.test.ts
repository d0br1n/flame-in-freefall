import { describe, expect, it } from "vitest";
import {
  SHAPES,
  assignSeries,
  countInside,
  insideWindow,
  legendEntries,
  linearScale,
  nearestPoint,
  niceDomain,
  niceStep,
  pressureView,
  quantile,
  shapePath,
  ticks,
  windowBounds,
  windowRect,
} from "@/lib/chart";
import type { AirWindow, TestPoint } from "@/lib/types";

// A fixed window for the arithmetic (the real windows come from GET /air/presets).
const station: AirWindow = {
  o2_min: 0.2, o2_max: 0.22, pressure_kpa_min: 96, pressure_kpa_max: 106, flow_cm_s_min: null, flow_cm_s_max: null,
};
const open: AirWindow = {
  o2_min: null, o2_max: null, pressure_kpa_min: null, pressure_kpa_max: null, flow_cm_s_min: null, flow_cm_s_max: null,
};

describe("scales and ticks", () => {
  it("picks round steps", () => {
    expect(niceStep(28, 5)).toBe(5);
    expect(niceStep(310, 5)).toBe(50);
    expect(niceStep(310, 3)).toBe(100);
    expect(niceStep(0.4, 4)).toBe(0.1);
    expect(niceStep(12, 5)).toBe(2);
    expect(niceStep(0)).toBe(1);
  });

  it("puts ticks on whole steps inside the range", () => {
    expect(ticks(10, 45, 7)).toEqual([10, 15, 20, 25, 30, 35, 40, 45]);
    expect(ticks(0, 350, 4)).toEqual([0, 100, 200, 300]);
    expect(ticks(0.1, 0.4, 3)).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it("keeps a test at 0 kPa on the chart and never goes below 0", () => {
    const [lo, hi] = niceDomain([0, 70.17, 101.3, 309.29]);
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThanOrEqual(309.29);
  });

  it("pads the extent so no dot sits on the frame, and includes the window's sides", () => {
    const [lo, hi] = niceDomain([12, 40]);
    expect(lo).toBeLessThan(12);
    expect(hi).toBeGreaterThan(40);
    expect(niceDomain([100, 102], [70.33])[0]).toBeLessThanOrEqual(70.33);
    expect(niceDomain([], [])).toEqual([0, 1]);
    const single = niceDomain([21]);
    expect(single[0]).toBeLessThan(21);
    expect(single[1]).toBeGreaterThan(21);
  });

  it("maps a domain onto pixels, flipped for the y axis", () => {
    const x = linearScale([0, 100], [50, 550]);
    expect(x(0)).toBe(50);
    expect(x(50)).toBe(300);
    const y = linearScale([0, 300], [400, 10]);
    expect(y(0)).toBe(400);
    expect(y(300)).toBe(10);
  });
});

describe("the cabin-air window", () => {
  const points: TestPoint[] = [
    ["A/1", "A", 0.21, 101.3], // inside the station window
    ["A/2", "A", 0.2, 96], // on the edges: counted inside
    ["A/3", "A", 0.23, 101.3], // too much oxygen
    ["B/1", "B", 0.21, 0], // the suspect 0 kPa
    ["B/2", "B", 0.4, 70], // exploration-like
  ];

  it("counts the dots inside, edges included", () => {
    expect(insideWindow(0.2, 96, station)).toBe(true);
    expect(insideWindow(0.21, 0, station)).toBe(false);
    expect(countInside(points, station)).toBe(2);
  });

  it("treats an open side as no limit", () => {
    expect(countInside(points, open)).toBe(points.length);
    const highOxygen: AirWindow = { ...open, o2_min: 0.4 };
    expect(countInside(points, highOxygen)).toBe(1);
  });

  it("draws the window clipped to the plot, open sides to the edge", () => {
    expect(windowRect(station, [10, 45], [0, 350])).toEqual({ x0: 20, x1: 22, y0: 96, y1: 106 });
    const exploration: AirWindow = { ...open, o2_min: 0.3, pressure_kpa_max: 70.33 };
    expect(windowRect(exploration, [10, 45], [0, 350])).toEqual({ x0: 30, x1: 45, y0: 0, y1: 70.33 });
    expect(windowRect(open, [10, 45], [0, 350])).toEqual({ x0: 10, x1: 45, y0: 0, y1: 350 });
    expect(windowRect(station, [30, 45], [0, 350])).toBeNull();
  });

  it("gives the window's finite sides in chart units", () => {
    expect(windowBounds(station)).toEqual({ x: [20, 22], y: [96, 106] });
    expect(windowBounds(open)).toEqual({ x: [], y: [] });
  });
});

describe("series", () => {
  it("gives each investigation a colour and a shape in PSI-number order, whatever the input order", () => {
    const a = assignSeries(["PSI-69", "PSI-10"]);
    const b = assignSeries(["PSI-10", "PSI-69", "PSI-69"]);
    expect(a.get("PSI-10")).toEqual({ psi_id: "PSI-10", slot: 1, shape: "circle" });
    expect(a.get("PSI-69")).toEqual({ psi_id: "PSI-69", slot: 2, shape: "square" });
    expect(b.get("PSI-69")).toEqual(a.get("PSI-69"));
  });

  it("folds investigations past the eighth into 'other'", () => {
    const many = assignSeries(Array.from({ length: 10 }, (_, i) => `PSI-${i + 1}`));
    expect(many.get("PSI-8")?.slot).toBe(8);
    expect(many.get("PSI-9")?.slot).toBeNull();
  });

  it("draws every shape as a closed path", () => {
    for (const shape of SHAPES) expect(shapePath(shape, 4)).toMatch(/^M.*Z$/);
    expect(new Set(SHAPES.map((shape) => shapePath(shape, 4))).size).toBe(SHAPES.length);
  });

  it("finds the nearest dot within reach, and none beyond it", () => {
    const pixels = [{ x: 10, y: 10 }, { x: 40, y: 40 }];
    expect(nearestPoint(pixels, 12, 11, 14)).toBe(0);
    expect(nearestPoint(pixels, 37, 41, 14)).toBe(1);
    expect(nearestPoint(pixels, 100, 100, 14)).toBe(-1);
  });
});

describe("the pressure axis's default view", () => {
  const bulk = Array.from({ length: 200 }, (_, i) => 70 + (i % 50) * 5); // 70 to 315 kPa

  it("takes the nearest-rank quantile", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([], 0.5)).toBeNaN();
  });

  it("shows every value when none is far above the rest", () => {
    const view = pressureView(bulk);
    expect(view.cut).toBe(false);
    expect(view.domain[1]).toBeGreaterThanOrEqual(315);
  });

  it("stops below a few far outliers, keeps 0 and the window on the axis", () => {
    const view = pressureView([0, ...bulk, 506.6, 506.6, 506.6], [96, 106]);
    expect(view.cut).toBe(true);
    expect(view.domain[0]).toBe(0);
    expect(view.domain[1]).toBeGreaterThanOrEqual(315);
    expect(view.domain[1]).toBeLessThan(506.6);
  });

  it("never cuts a small set or a window side away", () => {
    expect(pressureView([100, 101, 900]).cut).toBe(false);
    const view = pressureView([...bulk, 2000], [1500]);
    expect(view.domain[1]).toBeGreaterThanOrEqual(1500);
  });
});

describe("the legend", () => {
  it("lists coloured investigations in slot order and folds the rest into one 'other' entry", () => {
    const series = assignSeries(Array.from({ length: 10 }, (_, i) => `PSI-${i + 1}`));
    const counts = new Map([["PSI-10", 4], ["PSI-2", 3], ["PSI-1", 5], ["PSI-9", 2]]);
    const entries = legendEntries(counts, (id) => series.get(id)!);
    expect(entries.map((entry) => entry.key)).toEqual(["PSI-1", "PSI-2", "other"]);
    expect(entries[2]).toMatchObject({ psiIds: ["PSI-9", "PSI-10"], count: 6, slot: null, shape: "circle" });
  });

  it("has no 'other' entry when every investigation has its own colour", () => {
    const series = assignSeries(["PSI-10", "PSI-69"]);
    const entries = legendEntries(new Map([["PSI-69", 1], ["PSI-10", 2]]), (id) => series.get(id)!);
    expect(entries.map((entry) => entry.key)).toEqual(["PSI-10", "PSI-69"]);
  });
});
