import { describe, expect, it } from "vitest";
import { agreeWord, clipCaption, parseIndex, parseTSeries, tCheckCounts, tCheckLine, tMarks, tRange, type TSeriesRow } from "@/lib/spread";

// The T-series detail view's data (DOB-86): the keys the engine adds to each t_series row.
const base = { test_id: "PSI-25/T4", label: "T4", nasa_outcome: "quenched", si_grade: "quenched", confidence: "medium", match: "yes", reason: "Faded." };
const full = {
  ...base,
  si_times: { wire_glow_s: null, flame_seen_from_s: 4, flame_gone_s: 13 },
  checked: { by: "A", date: "2026-11-15", grade: "quenched", flame_seen_from_s: 4.5, flame_gone_s: 12, note: "n", agrees_with_si: "yes", match: "yes", evidence_id: "ev-T4-check" },
  clip: { file: "PSI-25_T4_review.mp4", start_s: 0, end_s: 60, speed: 4, gain: 6 },
  readout: "PSI-25_T4_readout.csv",
};
const rows = (...r: Record<string, unknown>[]) => parseTSeries({ checked_by: "A, 2026-11-15", check_note: "One person.", tests: r })!;

describe("the T-series keys of the detail view", () => {
  it("reads checked_by, check_note and the per-row keys", () => {
    const t = rows(full);
    expect(t.checked_by).toBe("A, 2026-11-15");
    expect(t.check_note).toBe("One person.");
    expect(t.tests[0].si_times).toEqual({ wire_glow_s: null, flame_seen_from_s: 4, flame_gone_s: 13 });
    expect(t.tests[0].checked).toMatchObject({ by: "A", grade: "quenched", agrees_with_si: "yes", match: "yes", evidence_id: "ev-T4-check" });
    expect(t.tests[0].clip).toEqual({ file: "PSI-25_T4_review.mp4", start_s: 0, end_s: 60, speed: 4, gain: 6 });
    expect(t.tests[0].readout).toBe("PSI-25_T4_readout.csv");
  });

  it("old data without the new keys still parses, the keys are null", () => {
    const t = parseIndex({ tests: [], t_series: { note: "n", graded_by: "g", tests: [base] } })!.t_series!;
    expect(t.checked_by).toBeNull();
    expect(t.check_note).toBeNull();
    expect(t.tests[0]).toMatchObject({ si_times: null, checked: null, clip: null, readout: null });
  });

  it("keeps a row with explicit nulls and drops a clip that cannot play", () => {
    const [row] = rows({ ...base, si_times: null, checked: null, clip: { file: "a.mp4", start_s: 3, end_s: 3, speed: 2 }, readout: null }).tests;
    expect(row).toMatchObject({ si_times: null, checked: null, clip: null, readout: null });
  });
});

describe("the person's check, counted from the rows", () => {
  const checked = (match: string, grade: string | null = "quenched") => ({ ...full, checked: { ...full.checked, match, grade } });
  it("reports checked and matching", () => {
    const t = rows(checked("yes"), checked("no"), checked("undecided"), base).tests;
    expect(tCheckCounts(t)).toEqual({ checked: 3, match: 1 });
    expect(tCheckLine(t)).toBe("3 checked by a person; 1 of 3 match NASA's published outcome");
  });
  it("says nothing when nobody checked, and ignores a check with no grade", () => {
    expect(tCheckLine(rows(base).tests)).toBeNull();
    expect(tCheckLine(rows(checked("yes", null)).tests)).toBeNull();
  });
  it("matches the line for 11 checked tests that all match", () => {
    const t = rows(...Array.from({ length: 11 }, (_, i) => ({ ...checked("yes"), test_id: `PSI-25/T${i}` })), { ...base, test_id: "PSI-25/T20" }).tests;
    expect(tCheckLine(t)).toBe("11 checked by a person; 11 of 11 match NASA's published outcome");
  });
});

describe("agreement words, marks and axis", () => {
  it("puts the agreement in words", () => {
    expect(agreeWord("yes")).toBe("agrees with SI");
    expect(agreeWord("no")).toBe("differs from SI");
    expect(agreeWord("decided")).toBe("decided where SI could not tell");
    expect(agreeWord(null)).toBe("not compared");
    expect(agreeWord("odd")).toBe("odd");
  });
  it("lists the four marks, leaving out empty times", () => {
    const [row] = rows(full).tests;
    expect(tMarks(row).map((m) => m.kind)).toEqual(["si_seen", "si_gone", "person_seen", "person_gone"]);
    const none: TSeriesRow = rows(base).tests[0];
    expect(tMarks(none)).toEqual([]);
    const partial = rows({ ...full, si_times: { wire_glow_s: 2, flame_seen_from_s: null, flame_gone_s: null } }).tests[0];
    expect(tMarks(partial).map((m) => m.kind)).toEqual(["person_seen", "person_gone"]);
  });
  it("widens the axis to the read-out when it reaches further", () => {
    const clip = { file: "c.mp4", start_s: 5, end_s: 60, speed: 4 };
    const r = (time_s: number) => ({ time_s, fuel: null, fan: null, air: null, rad: null, clock_s: null });
    expect(tRange(clip, [])).toEqual([5, 60]);
    expect(tRange(clip, [r(0), r(80)])).toEqual([0, 80]);
  });
});

describe("the review clip caption", () => {
  it("names the gain from the clip", () => {
    expect(clipCaption(6)).toBe("NASA's video, brightened x6 so the dim flame can be seen. The on-screen numbers are as recorded.");
    expect(clipCaption(4)).toContain("brightened x4");
    expect(clipCaption(null)).toBe("NASA's video, brightened so the dim flame can be seen. The on-screen numbers are as recorded.");
  });
  it("reads gain only when it is a positive number", () => {
    expect(rows({ ...full, clip: { ...full.clip, gain: 0 } }).tests[0].clip?.gain).toBeNull();
    expect(rows({ ...full, clip: { ...full.clip, gain: "x" } }).tests[0].clip?.gain).toBeNull();
    expect(rows({ ...full, clip: { file: "a.mp4", start_s: 0, end_s: 5, speed: 1 } }).tests[0].clip?.gain).toBeNull();
  });
});

describe("pinning the video", () => {
  it("keeps the block under the top of the scroller, inside its area", async () => {
    const { pinOffset } = await import("@/components/spread/usePinned");
    // Block still below the top: no shift.
    expect(pinOffset(300, 100, 2000, 100, 8)).toBe(0);
    // Scrolled past: shifted so it sits 8 px under the scroller's top.
    expect(pinOffset(-50, 100, 2000, 100, 8)).toBe(158);
    // Near the end of the area: it stops with its bottom at the area's bottom.
    expect(pinOffset(-1000, 100, 300, 100, 8)).toBe(1108);
    expect(pinOffset(-1000, 100, -500, 100, 8)).toBe(400);
    // An area shorter than the block: never negative.
    expect(pinOffset(0, 500, 200, 0, 8)).toBe(0);
  });
});
