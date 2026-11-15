import { describe, expect, it } from "vitest";
import { parseIndex, clockText, curveRowAt, fieldBox, fieldValueAt, FRAME, READOUT_FIELDS, readoutRowAt, type ReadoutRow } from "@/lib/spread";

// "Where the numbers come from" (DOB-86): the regions of NASA's on-screen text and the value lookup.
const row = (time_s: number, over: Partial<ReadoutRow> = {}): ReadoutRow => ({ time_s, fuel: -2, fan: 60, air: 5, rad: 0.5, clock_s: 36000, ...over });

describe("the read-out regions", () => {
  const boxes = READOUT_FIELDS.map(fieldBox);
  it("sit inside the 720 x 480 frame, in the top rows", () => {
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(FRAME.w);
      expect(b.y + b.h).toBeLessThanOrEqual(90);
      expect(b.w).toBeGreaterThan(0);
    }
  });
  it("do not overlap", () => {
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.field} and ${b.field}`).toBe(true);
      }
  });
  it("put the fields in the order FUEL, AIR, FAN, RAD left to right", () => {
    const xs = ["fuel", "air", "fan", "rad"].map((f) => fieldBox(f as "fuel").x);
    expect([...xs].sort((p, q) => p - q)).toEqual(xs);
  });
});

describe("the value at a time", () => {
  const rows = [row(0), row(10, { fan: 50, clock_s: 36010 }), row(20, { fan: null, air: 4 })];
  it("takes the nearest row within a second", () => {
    expect(readoutRowAt(rows, 9.6)?.time_s).toBe(10);
    expect(readoutRowAt(rows, 15)).toBeNull();
    expect(fieldValueAt(rows, "fan", 10.2)).toBe("50");
    expect(fieldValueAt(rows, "air", 19.5)).toBe("4");
  });
  it("is null where the read-out has nothing, for FUEL and with no cursor", () => {
    expect(fieldValueAt(rows, "fan", 20)).toBeNull();
    expect(fieldValueAt(rows, "fan", 15)).toBeNull();
    expect(fieldValueAt(rows, "fuel", 0)).toBeNull();
    expect(fieldValueAt(rows, "fan", null)).toBeNull();
    expect(fieldValueAt([], "fan", 0)).toBeNull();
  });
  it("writes the clock as hh:mm:ss", () => {
    expect(clockText(36010)).toBe("10:00:10");
    expect(fieldValueAt(rows, "clock", 10)).toBe("10:00:10");
    expect(clockText(86399)).toBe("23:59:59");
  });
  it("finds the curve row for the outline and edge values", () => {
    const curve = [{ time_s: 1, leading_edge_px: 5, trailing_edge_px: 2, area_px: 9, flame_light: 7, stage: null }];
    expect(curveRowAt(curve, 1.4)?.area_px).toBe(9);
    expect(curveRowAt(curve, 4)).toBeNull();
  });
});

describe("the three-panel detection clip", () => {
  const test1 = (files: Record<string, unknown>) =>
    parseIndex({ tests: [{ test_id: "PSI-25/B1", label: "B1", files }] })!.tests[0];
  it("reads files.steps_clip, and gives null when it is absent, null or not a name", () => {
    expect(test1({ steps_clip: "PSI-25_B1_stepsclip.mp4" }).files.steps_clip).toBe("PSI-25_B1_stepsclip.mp4");
    expect(test1({}).files.steps_clip).toBeNull();
    expect(test1({ steps_clip: null }).files.steps_clip).toBeNull();
    expect(test1({ steps_clip: 3 }).files.steps_clip).toBeNull();
  });
});
