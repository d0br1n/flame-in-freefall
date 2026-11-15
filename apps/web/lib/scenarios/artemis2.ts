// The Artemis II scenario (April 2026): a smoke detector went off in the crew cabin about
// 80,000 miles from home. What burnrate would have shown: what happened to the 15 BASS-II flames
// (PSI-25) whose fan was turned down in orbit, and whether the planned Moon-base air was ever
// tested. The mission facts below are the only numbers on the page not read from the API; each
// carries its source. The flame times come from GET /modules/video-to-data/evidence (quantity
// `flame_gone_minus_fan_drop`) and the air check from GET /air/coverage?air=exploration; none is
// typed here. Pure, unit tested (tests/unit/artemis2.test.ts).
// Code generated with SI assistance (Claude Code), reviewed by the team.
import type { AirCoverage, Evidence, StageCoverage } from "@/lib/types";

export const VIDEO_MODULE = "video-to-data";
export const EVIDENCE_PATH = `/modules/${VIDEO_MODULE}/evidence`;
export const FINDINGS_PATH = `/modules/${VIDEO_MODULE}/findings`;
export const FAN_FINDING_ID = "find-flame-gone-vs-fan-drop";
export const B1_FINDING_ID = "find-b1-fall-vs-report";
export const FAN_QUANTITY = "flame_gone_minus_fan_drop";
/** The planned Moon-base and rover air (preset of GET /air/presets, from the challenge page). */
export const EXPLORATION_AIR = "exploration";
export const EXPLORATION_COVERAGE_PATH = `/air/coverage?air=${EXPLORATION_AIR}`;

/** The commander's words, as the challenge page quotes them. */
export const QUOTE =
  "[If] you want to get somebody's attention really quick, make the fire alarm go off in your spacecraft when you're still about 80,000 miles from home.";
export const QUOTE_SOURCE = "Challenge page, Flame in Freefall";
export const QUOTE_URL = "https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/";
/** The press report of the 16 April 2026 news conference: "a tense few minutes aboard Integrity before Mission Control intervened". */
export const PRESS_SOURCE = "Starlust, 17 April 2026";
export const PRESS_URL = "https://starlust.org/artemis-ii-in-retrospect-commander-reid-wiseman-talks-space-toilet-issue-orion-heat-shield-and-more/";
/** NASA's guide to ISS combustion research rejects the idea that a fire goes out by itself without airflow. */
export const GUIDE_SOURCE = "NASA Researcher's Guide, ISS combustion";
export const GUIDE_URL = "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/";

/** Miles from home when the alarm went off (the commander's figure). */
export const MILES_FROM_HOME = 80_000;

/**
 * The window the finding uses: a flame that left the video no more than this many seconds after
 * the fan voltage began to fall counts as "went out with the fan". Matches the finding's text.
 */
export const WITH_FAN_WINDOW_S = 3;

export type FanOutcome = "before" | "with_fan" | "kept_burning";

export interface FanTest {
  /** "B1", from the evidence's test_id "PSI-25/B1". */
  label: string;
  testId: string;
  /** Seconds from the start of the fan-voltage fall to the flame leaving the video (negative: already gone). */
  seconds: number;
  outcome: FanOutcome;
  record: Evidence;
}

/** Where one flame sits against the fan drop. Pure. */
export function outcomeOf(seconds: number): FanOutcome {
  if (seconds < 0) return "before";
  if (seconds <= WITH_FAN_WINDOW_S) return "with_fan";
  return "kept_burning";
}

function testNumber(label: string): number {
  const n = Number(label.replace(/^\D+/, ""));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** The fan-drop flames of PSI-25, in test order, from the module's evidence. Pure. */
export function fanTests(evidence: readonly Evidence[]): FanTest[] {
  return evidence
    .filter((record) => record.quantity === FAN_QUANTITY && typeof record.value === "number" && Number.isFinite(record.value))
    .map((record) => {
      const seconds = record.value as number;
      const label = record.test_id.split("/").pop() ?? record.test_id;
      return { label, testId: record.test_id, seconds, outcome: outcomeOf(seconds), record };
    })
    .sort((a, b) => testNumber(a.label) - testNumber(b.label));
}

export interface FanCounts {
  total: number;
  before: number;
  withFan: number;
  keptBurning: number;
  /** The longest time a flame kept burning after the fall began, and its test. */
  longest: FanTest | null;
  /** The longest time among the flames that went out with the fan. */
  slowestWithFan: number | null;
}

/** The three groups of the finding, counted from the evidence. Pure. */
export function fanCounts(tests: readonly FanTest[]): FanCounts {
  const withFan = tests.filter((test) => test.outcome === "with_fan");
  const burning = tests.filter((test) => test.seconds >= 0);
  const longest = burning.reduce<FanTest | null>((best, test) => (best === null || test.seconds > best.seconds ? test : best), null);
  return {
    total: tests.length,
    before: tests.filter((test) => test.outcome === "before").length,
    withFan: withFan.length,
    keptBurning: tests.filter((test) => test.outcome === "kept_burning").length,
    longest,
    slowestWithFan: withFan.length ? Math.max(...withFan.map((test) => test.seconds)) : null,
  };
}

/** True while the flame is still in the video at time t (seconds after the fan began to fall). Pure. */
export function burningAt(test: Pick<FanTest, "seconds">, t: number): boolean {
  return test.seconds > t;
}

/** How many flames are still burning at time t. Pure. */
export function burningCount(tests: readonly FanTest[], t: number): number {
  return tests.filter((test) => burningAt(test, t)).length;
}

export interface AirAnswer {
  /** Tests whose stated air falls inside the planned Moon-base air, summed over the investigations that state it. */
  inside: number;
  /** Tests that state their air at all. */
  stated: number;
  /** The investigations that state their air, with their counts. */
  investigations: StageCoverage["investigations"];
  tested: boolean;
}

/** The suppression stage of GET /air/coverage for the Moon-base air, or null if absent. Pure. */
export function moonBaseAnswer(coverage: AirCoverage): AirAnswer | null {
  const stage = coverage.stages.suppress;
  if (!stage) return null;
  const investigations = stage.investigations.filter((item) => item.stated > 0);
  const inside = stage.inside ?? 0;
  return { inside, stated: stage.stated, investigations, tested: inside > 0 };
}

/** A number of seconds with one decimal ("1.6 s"). Pure. */
export function secondsText(seconds: number): string {
  return `${seconds.toFixed(1)} s`;
}
