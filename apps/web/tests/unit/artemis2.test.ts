import { describe, expect, it } from "vitest";
import {
  EXPLORATION_COVERAGE_PATH,
  FAN_QUANTITY,
  QUOTE,
  WITH_FAN_WINDOW_S,
  burningAt,
  burningCount,
  fanCounts,
  fanTests,
  moonBaseAnswer,
  outcomeOf,
  secondsText,
} from "@/lib/scenarios/artemis2";
import type { AirCoverage, Evidence } from "@/lib/types";

// The 15 fan-drop times of data/modules/video-to-data/evidence.json on 15 Nov 2026 (PSI-25, s).
const TIMES: Record<string, number> = {
  B1: 1.601, B2: 1.968, B3: -22.623, B4: 1.802, B5: 1.602, B7: 0.0, B8: 6.207, B9: 1.001,
  B10: -42.609, B11: -63.597, B12: -55.189, B13: -0.801, B16: -23.223, B21: -76.41, B22: 1.602,
};

function record(label: string, value: number, quantity = FAN_QUANTITY): Evidence {
  return {
    id: `ev-${label}-${quantity}`,
    module: "video-to-data",
    test_id: `PSI-25/${label}`,
    quantity,
    value,
    unit: "s",
    n: 1,
    conditions: {},
    provenance: "VIDEO_MEASURED",
    source: { psi_id: "PSI-25", file: "x.mp4", link: "https://psi.nasa.gov" },
    flags: [],
  } as Evidence;
}

const EVIDENCE = [
  ...Object.entries(TIMES).map(([label, value]) => record(label, value)),
  record("B1", 36.003, "fan_drop_time"),
];

describe("the BASS-II fan-drop flames", () => {
  it("reads the 15 fan-drop records in test order and ignores other quantities", () => {
    const tests = fanTests(EVIDENCE);
    expect(tests).toHaveLength(15);
    expect(tests[0].label).toBe("B1");
    expect(tests[tests.length - 1].label).toBe("B22");
    expect(tests.map((test) => test.label)).toContain("B10");
  });

  it("matches the finding: 7 out with the fan, 7 gone before, 1 kept burning (B8, 6.2 s)", () => {
    const counts = fanCounts(fanTests(EVIDENCE));
    expect(counts).toMatchObject({ total: 15, withFan: 7, before: 7, keptBurning: 1 });
    expect(counts.longest?.label).toBe("B8");
    expect(secondsText(counts.longest!.seconds)).toBe("6.2 s");
    expect(secondsText(counts.slowestWithFan!)).toBe("2.0 s");
  });

  it("places a flame against the fan drop with the finding's 3 s window", () => {
    expect(WITH_FAN_WINDOW_S).toBe(3);
    expect(outcomeOf(-0.8)).toBe("before");
    expect(outcomeOf(0)).toBe("with_fan");
    expect(outcomeOf(3)).toBe("with_fan");
    expect(outcomeOf(6.2)).toBe("kept_burning");
  });

  it("counts the flames still burning on the clock", () => {
    const tests = fanTests(EVIDENCE);
    expect(burningCount(tests, -1)).toBe(9);
    expect(burningCount(tests, 0)).toBe(7);
    expect(burningCount(tests, 2.5)).toBe(1);
    expect(burningCount(tests, 7)).toBe(0);
    expect(burningAt({ seconds: 1.6 }, 1.5)).toBe(true);
    expect(burningAt({ seconds: 1.6 }, 1.6)).toBe(false);
  });

  it("returns no tests when the evidence has none", () => {
    expect(fanCounts(fanTests([]))).toMatchObject({ total: 0, longest: null, slowestWithFan: null });
  });
});

describe("the Moon-base air", () => {
  const coverage: AirCoverage = {
    air: "exploration",
    stages: {
      spread: { status: "not_stated", inside: null, stated: 0, investigations: [] },
      suppress: { status: "never_tested", inside: 0, stated: 274, investigations: [{ psi_id: "PSI-69", status: "never_tested", inside: 0, stated: 274 }] },
    },
  } as unknown as AirCoverage;

  it("reads the suppression stage: 0 of 274 FLEX tests, never tested", () => {
    expect(EXPLORATION_COVERAGE_PATH).toBe("/air/coverage?air=exploration");
    const answer = moonBaseAnswer(coverage)!;
    expect(answer).toMatchObject({ inside: 0, stated: 274, tested: false });
    expect(answer.investigations.map((item) => item.psi_id)).toEqual(["PSI-69"]);
  });

  it("returns null when the stage is missing", () => {
    expect(moonBaseAnswer({ air: "exploration", stages: {} } as AirCoverage)).toBeNull();
  });
});

describe("the mission facts", () => {
  it("quote the commander as the challenge page does", () => {
    expect(QUOTE).toContain("80,000 miles from home");
  });
});
