import { describe, expect, it } from "vitest";
import { APOLLO1_AIR, TIMELINE, checkAir, gmtSeconds, offsets, percent, psiaToKpa, richer, verdict } from "@/lib/scenarios/apollo1";

// The range of the catalogued PSI tests as GET /air/presets states it (field `custom`) on 15 Nov 2026.
const RANGE = { o2_min: 0.12, o2_max: 0.4, pressure_kpa_min: 43, pressure_kpa_max: 507 };

describe("the Apollo 1 timeline", () => {
  it("follows the Board's clock: about 25 s from the transient to the rupture", () => {
    const at = Object.fromEntries(TIMELINE.map((event, i) => [event.id, offsets()[i]]));
    expect(at.transient).toBe(0);
    expect(at.call).toBe(9.9);
    expect(at.rupture).toBe(24.6);
    expect(at.silence).toBe(27.6);
  });

  it("reads GMT times to the tenth of a second", () => {
    expect(gmtSeconds("23:31:19.4") - gmtSeconds("23:31:04.7")).toBeCloseTo(14.7, 5);
  });

  it("uses none of the wording the research says to avoid", () => {
    const text = TIMELINE.map((event) => event.label).join(" ").toLowerCase();
    for (const banned of ["explo", "burned alive", "burned to death", "frayed wire", "we have a bad fire", "cost", "money"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("the Apollo 1 cabin air", () => {
  it("is 100% oxygen at 16.7 psia, 115.1 kPa", () => {
    expect(APOLLO1_AIR.o2MoleFraction).toBe(1);
    expect(psiaToKpa(APOLLO1_AIR.pressurePsia)).toBe(115.1);
  });

  it("is never tested: oxygen above the catalogued range, pressure inside it", () => {
    expect(checkAir(RANGE)).toEqual({ o2: "above", pressure: "inside", tested: false });
  });

  it("would count as tested only if both quantities fall inside the range", () => {
    expect(checkAir({ ...RANGE, o2_max: 1 }).tested).toBe(true);
    expect(checkAir({ ...RANGE, pressure_kpa_max: 100 }).pressure).toBe("above");
  });
});

describe("verdict and percent", () => {
  it("place a value against a range", () => {
    expect(verdict(0.1, 0.12, 0.4)).toBe("below");
    expect(verdict(0.4, 0.12, 0.4)).toBe("inside");
    expect(verdict(1, 0.12, 0.4)).toBe("above");
  });

  it("say how many times richer the Apollo 1 oxygen is than the richest tested air", () => {
    expect(richer(APOLLO1_AIR.o2MoleFraction, RANGE.o2_max)).toBe("2.5");
    expect(richer(1, 0.3)).toBe("3.3");
  });

  it("write a fraction as a short percentage", () => {
    expect(percent(0.4)).toBe("40");
    expect(percent(1)).toBe("100");
    expect(percent(0.265)).toBe("26.5");
  });
});
