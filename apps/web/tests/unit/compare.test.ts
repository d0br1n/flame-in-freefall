// The Compare page's pure helpers (components/compare/compareModel.ts) and its shareable starts.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { describe, expect, it } from "vitest";
import { caveatLine, notStatedLine, notStatedScope, parseIds, rangeAxis, shownRows, statedLine } from "@/components/compare/compareModel";
import { COMPARE_STARTS, comparePath } from "@/lib/compareDefaults.mjs";

describe("parseIds", () => {
  it("normalises, keeps order, drops repeats and junk, and stops at four", () => {
    expect(parseIds("psi-69, 68,PSI-69,,nope,PSI-25,PSI-26,PSI-39")).toEqual(["PSI-69", "PSI-68", "PSI-25", "PSI-26"]);
    expect(parseIds(null)).toEqual([]);
  });
});

describe("rangeAxis", () => {
  it("spans the stated ranges only; an unstated cell does not stretch it", () => {
    const row = { cells: [{ value: { min: 0.12, max: 0.34 } }, { value: null }, { value: { min: 0.15, max: 0.4 } }] };
    expect(rangeAxis(row)).toEqual([0.12, 0.4]);
    expect(rangeAxis({ cells: [{ value: null }] })).toBeNull();
  });
});

describe("the starts", () => {
  it("offer FLEX against FLEX-2 first (the issue's own check) and build the API path", () => {
    expect(COMPARE_STARTS[0].ids).toEqual(["PSI-69", "PSI-68"]);
    expect(comparePath(["PSI-69", "PSI-68"])).toBe("/catalog/compare?ids=PSI-69,PSI-68");
    for (const start of COMPARE_STARTS) expect(start.ids.length).toBeGreaterThanOrEqual(2);
  });
});

describe("the count wording (a test is one row of a PSI experimental table)", () => {
  it("says how many tests state a range", () => {
    expect(statedLine(12, 18)).toBe("Stated in 12 of 30 tests");
    expect(statedLine(1, 1)).toBe("Stated in 1 of 2 tests");
    expect(statedLine(30, 0)).toBe("Stated in all 30 tests");
    expect(statedLine(1, 0)).toBe("Stated in the only test");
    expect(statedLine(1234, 1)).toBe("Stated in 1,234 of 1,235 tests");
  });

  it("counts a left-out suspect row in the total, so the total is the investigation's test count", () => {
    // FLEX pressure: 273 used, 0 empty, 1 flagged suspect, 274 tests in the table
    expect(statedLine(273, 0, 1)).toBe("Stated in 273 of 274 tests");
    expect(statedLine(0, 0, 1)).toBe("Stated in 0 of 1 test");
  });

  it("leaves the none case to one Not stated box and its scope", () => {
    expect(statedLine(0, 18)).toBeNull();
    expect(statedLine(0, 0)).toBeNull();
    expect(notStatedScope(18)).toBe("in any of the 18 tests");
    expect(notStatedScope(1)).toBe("in the only test");
    expect(notStatedScope(0)).toBeNull();
  });

  it("counts the tests that leave a counted value empty", () => {
    expect(notStatedLine(5)).toBe("Not stated in 5 tests");
    expect(notStatedLine(1)).toBe("Not stated in 1 test");
    expect(notStatedLine(0)).toBeNull();
  });

  it("names the caveat flags for readers and keeps their count", () => {
    expect(caveatLine("oxygen_is_burner_stream", 120)).toBe("Inverse flame: oxygen is not the air around the flame (120 tests)");
    expect(caveatLine("o2_mole_fraction:approximate", 1)).toBe("Approximate value (1 test)");
    expect(caveatLine("some_other_flag", 2)).toBe("Some other flag (2 tests)");
  });
});

describe("shownRows", () => {
  it("leaves out the limits row, which lives on the Limitations page", () => {
    const rows = [{ key: "pillar", same: true }, { key: "cannot_tell", same: false }, { key: "oxygen", same: false }];
    const shown = shownRows(rows);
    expect(shown.map((row) => row.key)).toEqual(["pillar", "oxygen"]);
    expect(shown.filter((row) => !row.same)).toHaveLength(1);
  });
});
