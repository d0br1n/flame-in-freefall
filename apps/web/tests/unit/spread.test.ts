import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureFile, FIXTURE_DIR, moduleAnswer } from "../../scripts/stub-modules.mjs";
import { linePath, MARKER_STYLE } from "@/components/spread/TimeChart";
import {
  burnDuration,
  cellNumber,
  clipToTest,
  fallbackRows,
  filterTests,
  fanFall,
  findEvidence,
  fittedLine,
  flagWords,
  gradeWord,
  canOpen,
  filterStatus,
  joinTests,
  namesRow,
  parseCatalogTests,
  processedLine,
  SERIES_FILES_HREF,
  SERIES_TESTS_PATH,
  statusCounts,
  STATUS_WORDS,
  lastFaintLight,
  LAST_FAINT_LIGHT_NOTE,
  matchWord,
  parseTSeries,
  tSeriesCountLine,
  tSeriesCounts,
  NO_FILTER,
  nearestRow,
  orderTests,
  parseCurve,
  parseCsv,
  parseIndex,
  parseReadout,
  rateText,
  stageBands,
  testToClip,
  thicknessOptions,
  timeRange,
  warningFlags,
  type Clip,
  type SpreadTest,
  testPageHref,
  parseTrackerCheck,
  trackerCheckLine,
  trackerCheckVerdict,
} from "@/lib/spread";
import type { Evidence } from "@/lib/types";

const FIXTURE = resolve(process.cwd(), "fixtures", "modules", "video-to-data", "index.json");
const fixtureIndex = () => parseIndex(JSON.parse(readFileSync(FIXTURE, "utf8")));

const test1 = (over: Record<string, unknown> = {}): SpreadTest =>
  parseIndex({ tests: [{ test_id: "PSI-25/B1", label: "B1", ...over }] })!.tests[0];

describe("index.json", () => {
  it("reads the fixture of the contract", () => {
    const index = fixtureIndex()!;
    expect(index.tests.map((t) => t.label)).toEqual(["B3", "B2", "B1"]);
    const b1 = index.tests.find((t) => t.label === "B1")!;
    expect(b1.rate).toMatchObject({ value: 9.649, unit: "px/s", ci_low: 9.578, ci_high: 9.741 });
    expect(b1.clip).toEqual({ file: "PSI-25_B1_overlay.mp4", start_s: 10.41, end_s: 37.604, speed: 2 });
    expect(b1.stages.map((s) => s.stage)).toEqual(["growth", "fully developed", "decay"]);
    expect(b1.fan.changes).toEqual([{ time_s: 36.003, from: 62, to: 38 }]);
    expect(b1.fan).toMatchObject({ drop_time_s: 36.003, settled_time_s: 39.406, unit: "V x10", flame_gone_minus_fan_drop_s: 1.601 });
    expect(b1.air.at_ignition).toBe(5);
    expect(b1.rate?.intercept_px).toBe(92.523);
    expect(index.not_measurable).toHaveLength(5);
    expect(index.not_measurable[0].test_id).toBeNull();
    expect(index.stage_source?.citation).toMatch(/NIST/);
    expect(index.stage_source?.note).toMatch(/our own rule/);
  });

  it("never throws on absent or odd fields", () => {
    expect(parseIndex(null)).toBeNull();
    expect(parseIndex({})).toBeNull();
    expect(parseIndex({ tests: "x" })).toBeNull();
    const bare = test1();
    expect(bare.rate).toBeNull();
    expect(bare.clip).toBeNull();
    expect(bare.flags).toEqual([]);
    expect(bare.files.stills).toEqual([]);
    expect(bare.viewing.quality).toBeNull();
    expect(bare.events.censored).toBe(false);
    const odd = parseIndex({ tests: [1, null, { label: "no id" }, { test_id: "PSI-25/B9", rate: { value: null }, clip: { file: "a.mp4", start_s: 5, end_s: 5 }, viewing: { quality: "strange" } }] })!;
    expect(odd.tests).toHaveLength(1);
    expect(odd.tests[0]).toMatchObject({ label: "B9", rate: null, clip: null });
    expect(odd.tests[0].viewing.quality).toBeNull();
    expect(odd.not_measurable).toEqual([]);
    expect(odd.stage_source).toBeNull();
  });

  it("keeps a clip speed of zero or less as 1", () => {
    expect(test1({ clip: { file: "a.mp4", start_s: 1, end_s: 3, speed: 0 } }).clip?.speed).toBe(1);
  });

  it("reads a fan display given as a number", () => {
    expect(test1({ conditions: { fan_display: 62 } }).conditions.fan_display).toBe("62");
  });
});

describe("the curve and read-out tables", () => {
  it("reads a curve with the new columns", () => {
    const rows = parseCurve("time_s,leading_edge_px,trailing_edge_px,area_px,flame_light,stage\n10.4,219.00,192.00,276,0.28,growth\n10.6,223,188,700,0.7,\n");
    expect(rows).toEqual([
      { time_s: 10.4, leading_edge_px: 219, trailing_edge_px: 192, area_px: 276, flame_light: 0.28, stage: "growth" },
      { time_s: 10.6, leading_edge_px: 223, trailing_edge_px: 188, area_px: 700, flame_light: 0.7, stage: null },
    ]);
  });

  it("tolerates a curve without the last two columns, empty cells and blank lines", () => {
    const rows = parseCurve("time_s,leading_edge_px,trailing_edge_px,area_px\r\n10.4,219,192,276\r\n\r\n37.6,,,0\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[0].flame_light).toBeNull();
    expect(rows[0].stage).toBeNull();
    expect(rows[1]).toMatchObject({ time_s: 37.6, leading_edge_px: null, trailing_edge_px: null, area_px: 0 });
  });

  it("drops rows without a time and handles an empty file", () => {
    expect(parseCurve("")).toEqual([]);
    expect(parseCurve("time_s,leading_edge_px\n,5\nabc,6\n")).toEqual([]);
  });

  it("reads the read-out with unreadable cells as null", () => {
    const rows = parseReadout("time_s,fuel,fan,air,rad,clock_s\n8.0,-2,62,5,0.21,0.00\n8.5,,,5,,0.50\n9.0,-2,62\n");
    expect(rows[0]).toEqual({ time_s: 8, fuel: -2, fan: 62, air: 5, rad: 0.21, clock_s: 0 });
    expect(rows[1]).toEqual({ time_s: 8.5, fuel: null, fan: null, air: 5, rad: null, clock_s: 0.5 });
    expect(rows[2]).toEqual({ time_s: 9, fuel: -2, fan: 62, air: null, rad: null, clock_s: null });
    // a table without the fuel column still reads
    expect(parseReadout("time_s,fan,air,rad,clock_s\n1,60,5,0.1,\n")[0]).toMatchObject({ fuel: null, fan: 60, air: 5 });
  });

  it("keeps quoted commas in one cell and numbers only", () => {
    expect(parseCsv('a,b\n"x, y",2\n')).toEqual([{ a: "x, y", b: "2" }]);
    expect(cellNumber("")).toBeNull();
    expect(cellNumber("nan")).toBeNull();
    expect(cellNumber(" 4.5 ")).toBe(4.5);
    expect(cellNumber(undefined)).toBeNull();
  });

  it("parses the real fixture tables", () => {
    const dir = resolve(process.cwd(), "fixtures", "modules", "video-to-data");
    const curve = parseCurve(readFileSync(resolve(dir, "PSI-25_B1_curve.csv"), "utf8"));
    const readout = parseReadout(readFileSync(resolve(dir, "PSI-25_B1_readout.csv"), "utf8"));
    expect(curve.length).toBeGreaterThan(100);
    expect(curve.some((row) => row.leading_edge_px === null)).toBe(true);
    expect(readout.some((row) => row.fan === null)).toBe(true);
  });
});

describe("clip time and test time", () => {
  const clip = (speed: number): Clip => ({ file: "c.mp4", start_s: 10.41, end_s: 37.6, speed });

  it("maps the ends of the clip", () => {
    expect(clipToTest(clip(1), 0)).toBeCloseTo(10.41);
    expect(testToClip(clip(1), 10.41)).toBe(0);
    expect(testToClip(clip(2), 37.6)).toBeCloseTo((37.6 - 10.41) / 2);
    expect(clipToTest(clip(2), (37.6 - 10.41) / 2)).toBeCloseTo(37.6);
  });

  it("scales by the speed (1 and 3.2)", () => {
    expect(clipToTest(clip(1), 4)).toBeCloseTo(14.41);
    expect(clipToTest(clip(3.2), 4)).toBeCloseTo(10.41 + 12.8);
    expect(testToClip(clip(3.2), 10.41 + 12.8)).toBeCloseTo(4);
    expect(testToClip(clip(1), 20.41)).toBeCloseTo(10);
  });

  it("keeps times inside the clip", () => {
    expect(clipToTest(clip(2), 999)).toBe(37.6);
    expect(clipToTest(clip(2), -3)).toBeCloseTo(10.41);
    expect(testToClip(clip(2), 0)).toBe(0);
    expect(testToClip(clip(2), 99)).toBeCloseTo((37.6 - 10.41) / 2);
  });
});

describe("the list of tests", () => {
  const mk = (label: string, flags: string[], quality: SpreadTest["viewing"]["quality"], thickness: number | null) =>
    test1({ test_id: `PSI-25/${label}`, label, flags, viewing: { quality }, conditions: { thickness_mm: thickness } });
  const tests = [
    mk("B10", ["no_scale", "short_window"], "spreading", 0.1),
    mk("B2", ["no_scale"], "spreading", 0.1),
    mk("B1", ["no_scale", "eye_doubtful"], "doubtful", 0.2),
    mk("B11", [], "no_spread", 0.2),
    mk("B3", ["no_scale"], null, null),
  ];

  it("puts tests with no flag but no_scale at the top, then natural order", () => {
    expect(orderTests(tests).map((t) => t.label)).toEqual(["B2", "B3", "B11", "B1", "B10"]);
    expect(warningFlags(["no_scale", "reignition"])).toEqual(["reignition"]);
  });

  it("filters by what was seen, thickness and no warning flag", () => {
    const labels = (filter: Partial<typeof NO_FILTER>) => filterTests(tests, { ...NO_FILTER, ...filter }).map((t) => t.label);
    expect(labels({})).toHaveLength(5);
    expect(labels({ quality: new Set(["spreading" as const]) })).toEqual(["B10", "B2"]);
    expect(labels({ quality: new Set(["doubtful" as const, "no_spread" as const]) })).toEqual(["B1", "B11"]);
    expect(labels({ thickness: 0.2 })).toEqual(["B1", "B11"]);
    expect(labels({ noFlag: true })).toEqual(["B2", "B11", "B3"]);
    expect(labels({ noFlag: true, thickness: 0.1, quality: new Set(["spreading" as const]) })).toEqual(["B2"]);
    expect(labels({ thickness: 9 })).toEqual([]);
  });

  it("counts thicknesses", () => {
    expect(thicknessOptions(tests)).toEqual([
      { value: 0.1, count: 2 },
      { value: 0.2, count: 2 },
    ]);
  });

  it("computes the burn duration only for a flame that went out", () => {
    expect(burnDuration(test1({ events: { ignition_time_s: 10.41, extinction_time_s: 37.604 } }))).toBeCloseTo(27.194);
    expect(burnDuration(test1({ events: { ignition_time_s: 5, extinction_time_s: null, censored: true } }))).toBeNull();
    expect(burnDuration(test1({ events: { ignition_time_s: 5, extinction_time_s: 9, censored: true } }))).toBeNull();
    expect(burnDuration(test1())).toBeNull();
  });

  it("writes the rate with its interval", () => {
    expect(rateText(test1({ rate: { value: 9.649, unit: "px/s", ci_low: 9.578, ci_high: 9.741 } }).rate)).toBe("9.65 px/s (9.58 to 9.74)");
    expect(rateText(test1({ rate: { value: 3 } }).rate)).toBe("3 px/s");
    expect(rateText(null)).toBeNull();
  });
});

describe("flags in plain words", () => {
  it("has a sentence for every flag the engine uses", () => {
    for (const flag of [
      "no_scale", "eye_doubtful", "eye_no_spread", "negative_rate", "short_window", "short_travel",
      "steady_under_20s", "no_steady_window", "estimates_disagree", "reignition", "match_inferred",
    ]) {
      expect(flagWords(flag)).not.toBe(flag);
    }
    expect(flagWords("no_scale")).toBe("in pixels: no scale reference is visible in the video");
  });

  it("shows an unknown flag as written", () => {
    expect(flagWords("brand_new_flag")).toBe("brand_new_flag");
  });
});

describe("charts", () => {
  it("builds stage bands from the data, whatever the names", () => {
    const stages = [
      { stage: "rising", start_s: 1, end_s: 4 },
      { stage: "plateau", start_s: 4, end_s: 9 },
      { stage: "outside", start_s: 20, end_s: 30 },
    ];
    expect(stageBands(stages, [2, 10])).toEqual([
      { stage: "rising", start_s: 2, end_s: 4, index: 0 },
      { stage: "plateau", start_s: 4, end_s: 9, index: 1 },
    ]);
    expect(stageBands([], [0, 1])).toEqual([]);
  });

  it("shares one time range over the tables, events, stages and clip", () => {
    const b1 = fixtureIndex()!.tests.find((t) => t.label === "B1")!;
    const curve = parseCurve("time_s,leading_edge_px\n10.4,1\n37.6,2\n");
    const readout = parseReadout("time_s,fan\n8,62\n44,38\n");
    expect(timeRange(b1, curve, readout)).toEqual([8, 44]);
    expect(timeRange(test1(), [], [])).toBeNull();
    expect(timeRange(test1({ events: { ignition_time_s: 5 } }), [], [])).toEqual([5, 6]);
  });

  it("draws the fitted line from the index: intercept_px + value * time_s over the window", () => {
    const rate = { value: 10, unit: "px/s", ci_low: null, ci_high: null, window_start_s: 2, window_end_s: 5, intercept_px: 90 };
    expect(fittedLine(rate)).toEqual({ t0: 2, y0: 110, t1: 5, y1: 140 });
    const b1 = fixtureIndex()!.tests.find((t) => t.label === "B1")!;
    const line = fittedLine(b1.rate)!;
    expect(line.y0).toBeCloseTo(92.523 + 9.649 * 13.213);
    // no intercept, no window or no rate: no line, and no guess
    expect(fittedLine({ ...rate, intercept_px: null })).toBeNull();
    expect(fittedLine({ ...rate, window_start_s: null })).toBeNull();
    expect(fittedLine({ ...rate, value: null })).toBeNull();
    expect(fittedLine(null)).toBeNull();
  });

  it("gives the stretch over which the fan voltage fell", () => {
    const b1 = fixtureIndex()!.tests.find((t) => t.label === "B1")!;
    expect(fanFall(b1)).toEqual({ from: 36.003, to: 39.406 });
    expect(fanFall(test1())).toBeNull();
    expect(fanFall(test1({ fan: { drop_time_s: 5 } }))).toBeNull();
    expect(fanFall(test1({ fan: { drop_time_s: 5, settled_time_s: 4 } }))).toBeNull();
  });

  it("finds the nearest row", () => {
    const rows = [{ time_s: 1 }, { time_s: 2 }, { time_s: 4 }];
    expect(nearestRow(rows, 1.4)).toEqual({ time_s: 1 });
    expect(nearestRow(rows, 3.1)).toEqual({ time_s: 4 });
    expect(nearestRow(rows, 99)).toEqual({ time_s: 4 });
    expect(nearestRow([], 1)).toBeNull();
  });

  it("lifts the pen at a gap and holds a step", () => {
    const x = (t: number) => t * 10;
    const y = (v: number) => v;
    expect(linePath([{ t: 0, y: 1 }, { t: 1, y: null }, { t: 2, y: 3 }, { t: 3, y: 4 }], x, y)).toBe("M0.0 1.0M20.0 3.0L30.0 4.0");
    expect(linePath([{ t: 0, y: 1 }, { t: 1, y: 5 }], x, y, true)).toBe("M0.0 1.0H10.0V5.0");
    expect(linePath([], x, y)).toBe("");
  });
});

describe("evidence behind the numbers", () => {
  const record = (id: string, test_id: string, quantity: string): Evidence => ({
    id, module: "video-to-data", test_id, quantity, value: 1, unit: "s", n: 1, conditions: {},
    provenance: "VIDEO_MEASURED", source: { psi_id: "PSI-25", file: "f.mp4" }, flags: id.endsWith("x") ? ["no_scale"] : [],
  });
  const evidence = [record("ev-B2-rate", "PSI-25/B2", "spread_rate"), record("ev-B10-rate", "PSI-25/B10", "spread_rate"), record("ev-B1-rate", "PSI-25/B1", "spread_rate"), record("ev-B1-ignx", "PSI-25/B1", "ignition_time")];

  it("finds a record by test and quantity, or by the id the index names", () => {
    const b1 = test1({ evidence_ids: { spread_rate: "ev-B1-other" } });
    expect(findEvidence(evidence, b1, "spread_rate")?.id).toBe("ev-B1-rate");
    const named1 = test1({ evidence_ids: { spread_rate: "ev-B2-rate" } });
    expect(findEvidence(evidence, named1, "spread_rate")?.id).toBe("ev-B2-rate");
    expect(findEvidence(evidence, b1, "nothing")).toBeNull();
    const named = test1({ test_id: "PSI-25/B77", evidence_ids: { burn_duration: "ev-B2-rate" } });
    expect(findEvidence(evidence, named, "burn_duration")?.id).toBe("ev-B2-rate");
  });

  it("falls back to a table row per test, in natural order, when index.json is absent", () => {
    const rows = fallbackRows(evidence);
    expect(rows.map((r) => r.test_id)).toEqual(["PSI-25/B1", "PSI-25/B2", "PSI-25/B10"]);
    expect(rows[0].quantities.spread_rate.id).toBe("ev-B1-rate");
    expect(rows[0].flags).toEqual(["no_scale"]);
    expect(fallbackRows([])).toEqual([]);
  });
});

describe("wording guard", () => {
  // The page shows what the video measured; these words would claim more than that.
  const banned = /\b(temperatures?|recovered|discover(?:s|ed|y)?|prov(?:e|es|ed|en)|missing|dials?|first-ever)\b|mm\/s/i;
  const dirs = [resolve(process.cwd(), "components", "spread")];
  const files = [
    ...dirs.flatMap((dir) => readdirSync(dir).map((name) => resolve(dir, name))),
    resolve(process.cwd(), "lib", "spread.ts"),
  ];

  it("scans the Spread components and logic", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of files) {
    it(`${file.split("/").slice(-2).join("/")} has no banned word`, () => {
      const lines = readFileSync(file, "utf8").split("\n");
      const hits = lines.flatMap((line, i) => (banned.test(line) ? [`${i + 1}: ${line.trim()}`] : []));
      expect(hits).toEqual([]);
    });
  }

  it("never says the fan put the flame out", () => {
    const text = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(text).not.toMatch(/fan[^.\n]{0,40}(put|puts|blew|blows)[^.\n]{0,20}out/i);
    expect(text).toContain("not an air speed");
    expect(text).toContain("fan voltage x10");
  });
});

describe("the stub's fixture index", () => {
  it("serves index.json from fixtures/modules, which the engine folder need not list", () => {
    const answer = moduleAnswer("/api/v1/modules/video-to-data/files/index.json");
    expect(answer?.status).toBe(200);
    expect(answer?.contentType).toBe("application/json");
    expect(parseIndex(JSON.parse(readFileSync(answer?.file as string, "utf8")))?.tests).toHaveLength(3);
    expect(fixtureFile(FIXTURE_DIR, "video-to-data", "../index.json")).toBeNull();
    expect(fixtureFile(FIXTURE_DIR, "video-to-data", "nothing.csv")).toBeNull();
  });
});

const tRow = (over: Record<string, unknown> = {}) => ({
  test_id: "PSI-25/T4",
  label: "T4",
  nasa_outcome: "quenched",
  si_grade: "quenched",
  confidence: "high",
  match: "yes",
  reason: "Faded.",
  evidence_id: "ev-T4-si-grade",
  published_evidence_id: "ev-T4-PUB-17",
  ...over,
});
const rowsOf = (...rows: Record<string, unknown>[]) => parseTSeries({ note: "n", tests: rows })!.tests;

describe("the T-series block", () => {
  it("is null when absent or malformed, and empty when it lists no test", () => {
    expect(parseTSeries(undefined)).toBeNull();
    expect(parseTSeries({ note: "x" })).toBeNull();
    expect(parseIndex({ tests: [] })!.t_series).toBeNull();
    expect(parseTSeries({ tests: [] })!.tests).toEqual([]);
    expect(parseTSeries({ tests: [null, 3, { label: "no id" }] })!.tests).toEqual([]);
  });

  it("reads the real rows of the fixture", () => {
    const t = fixtureIndex()!.t_series!;
    expect(t.note).toMatch(/judgement|graded by SI/i);
    expect(t.tests.length).toBeGreaterThan(5);
    expect(tSeriesCountLine(t.tests)).toMatch(/^\d+ of \d+ graded tests match NASA's published outcome; \d+ could not be decided; \d+ contradict it$/);
  });

  it("keeps a null grade as not graded, with its reason", () => {
    const [row] = rowsOf(tRow({ si_grade: null, confidence: null, match: "not_graded", evidence_id: null, reason: "No video." }));
    expect(row).toMatchObject({ si_grade: null, confidence: null, match: "not_graded", evidence_id: null, reason: "No video." });
    expect(gradeWord(row.si_grade)).toBe("not graded");
  });

  it("shows an unknown match value as written", () => {
    const [row] = rowsOf(tRow({ match: "partly" }));
    expect(matchWord(row.match)).toBe("partly");
    expect(matchWord("not_graded")).toBe("not graded");
    expect(matchWord("undecided")).toBe("undecided");
  });

  it("puts each grade in plain words", () => {
    expect(gradeWord("no_ignition")).toBe("no ignition");
    expect(gradeWord("blow_off")).toBe("blow-off");
    expect(gradeWord("no_blow_off")).toBe("no blow-off");
    expect(gradeWord("cannot_tell")).toBe("could not tell");
    expect(gradeWord("quenched")).toBe("quenched");
    expect(gradeWord("something_new")).toBe("something_new");
  });

  it("counts from the rows: all match, one undecided, a contradiction, none graded", () => {
    const yes = tRow();
    const notGraded = tRow({ si_grade: null, match: "not_graded" });
    expect(tSeriesCountLine(rowsOf(yes, yes, notGraded))).toBe("2 of 2 graded tests match NASA's published outcome; 0 could not be decided; 0 contradict it");
    expect(tSeriesCountLine(rowsOf(yes, tRow({ si_grade: "cannot_tell", match: "undecided" }), notGraded))).toBe(
      "1 of 2 graded tests match NASA's published outcome; 1 could not be decided; 0 contradict it",
    );
    const mixed = rowsOf(yes, yes, tRow({ si_grade: "blow_off", match: "no" }), tRow({ match: "undecided" }));
    expect(tSeriesCounts(mixed)).toEqual({ graded: 4, match: 2, undecided: 1, contradict: 1 });
    expect(tSeriesCountLine(mixed)).toBe("2 of 4 graded tests match NASA's published outcome; 1 could not be decided; 1 contradicts it");
    expect(tSeriesCountLine(rowsOf(notGraded))).toBe("No T-series test is graded.");
    expect(tSeriesCountLine([])).toBe("No T-series test is graded.");
  });

  it("matches the count in the issue text for 11 graded tests", () => {
    const rows = rowsOf(...Array.from({ length: 10 }, (_, i) => tRow({ test_id: `PSI-25/T${i}` })), tRow({ test_id: "PSI-25/T20", match: "undecided", si_grade: "cannot_tell" }), tRow({ test_id: "PSI-25/T30", si_grade: null, match: "not_graded" }));
    expect(tSeriesCountLine(rows)).toBe("10 of 11 graded tests match NASA's published outcome; 1 could not be decided; 0 contradict it");
  });
});

describe("last faint light", () => {
  it("is read from the events and absent when null or missing", () => {
    expect(test1({ events: { last_faint_light_s: 49.6 } }).events.last_faint_light_s).toBe(49.6);
    expect(lastFaintLight(test1({ events: { last_faint_light_s: 49.6 } }))).toBe(49.6);
    expect(lastFaintLight(test1({ events: { last_faint_light_s: null } }))).toBeNull();
    expect(lastFaintLight(test1({ events: { last_faint_light_s: "late" } }))).toBeNull();
    expect(lastFaintLight(test1())).toBeNull();
  });

  it("is in the fixture for B3 only, with its evidence id", () => {
    const tests = fixtureIndex()!.tests;
    const b3 = tests.find((t) => t.label === "B3")!;
    expect(b3.events.last_faint_light_s).toBe(49.6);
    expect(b3.evidence_ids.last_faint_light_time).toBeTruthy();
    expect(tests.filter((t) => t.label !== "B3").every((t) => lastFaintLight(t) === null)).toBe(true);
  });

  it("widens the shared time range to take in the marker", () => {
    const t = test1({ events: { ignition_time_s: 5, extinction_time_s: 9, last_faint_light_s: 49.6 } });
    expect(timeRange(t, [], [])).toEqual([5, 49.6]);
  });

  it("has its own marker style and the agreed note", () => {
    expect(MARKER_STYLE.faint.label).toBe("last faint light");
    expect(MARKER_STYLE.faint.dash).not.toBe(MARKER_STYLE.extinction.dash);
    expect(LAST_FAINT_LIGHT_NOTE).toMatch(/not the time the flame went out/);
  });

  it("is served as a stub-only evidence record that findEvidence resolves", () => {
    const records = moduleAnswer("/api/v1/modules/video-to-data/evidence?test_id=PSI-25/B3&quantity=last_faint_light_time")?.body as Evidence[];
    // The engine's own record for B3 may be served too; the fixture's record must be among them.
    expect(records.some((r) => r.id === "ev-B3-fixture-last-faint-light")).toBe(true);
    const b3 = fixtureIndex()!.tests.find((t) => t.label === "B3")!;
    expect(findEvidence(records, b3, "last_faint_light_time")?.value).toBe(49.6);
  });
});

// ------------------------------------------------------------------ every test of the series (DOB-126)

// The test numbers of NASA's BASS-II table (PSI-25_Experimental table_BASS-II.csv), in table order,
// as GET /catalog/tests?psi_id=PSI-25&limit=200 answered on 2026-11-15: 129 rows.
const TABLE_NUMBERS =
  "B1 B2 B3 B4 B5 B6 B7 B8 B9 B10 B11 B12 B13 B14 B15 B16 B17 B18 B19 B20 B21 B22 F1 F2 F3 F4 M1 M2 M3 M4 M5 M6 M7 M8 M9 M10 M11 M12 M13 M14 M15 M16 M17 M18 M19 M20 O1 O2 O3a O3b O4 O5a O5b O6 O7 O8a O8b O9 O10 O11 O12 O13a O13b O14 O15a O15b O16 O17 O18 O19 O20 O21 O22 P1 P2 P3a P3b P4 P5 P6 P8 P9 P10 P12 P13a P13b P14 P15 P16 P17 P18 P19 P20 P21a P21b P22a P22b P23 P24 P25 T1 T2 T3 T4 T5 T6 T7 T9 T10 T11 T12 T13 T14 T15 T16 T17 T18 T19 T20 T21 T22 T23 T24 T25 T26 T27 T28a T28b T29".split(
    " ",
  );
const tableRow = (number: string, over: Record<string, unknown> = {}) => ({
  test_id: `PSI-25/${number}`,
  test_number: number,
  fuel: "100 micron PMMA film   2 cm wide",
  o2_mole_fraction: 0.222,
  ...over,
});
const TABLE = TABLE_NUMBERS.map((number) => tableRow(number));
const REAL_INDEX = resolve(process.cwd(), "..", "..", "data", "modules", "video-to-data", "index.json");
const realIndex = () => parseIndex(JSON.parse(readFileSync(REAL_INDEX, "utf8")))!;

describe("the list of every test: NASA's table joined with the index", () => {
  it("asks for the whole table in one request and links to the investigation's files", () => {
    expect(SERIES_TESTS_PATH).toBe("/catalog/tests?psi_id=PSI-25&limit=200");
    expect(SERIES_FILES_HREF).toBe("/investigations/PSI-25#holdings");
    expect(TABLE).toHaveLength(129);
  });

  it("reads the answer of the tests route and never throws on an odd one", () => {
    expect(parseCatalogTests(null)).toBeNull();
    expect(parseCatalogTests({ total: 3 })).toBeNull();
    const answer = parseCatalogTests({ total: 129, items: [tableRow("B1"), null, { test_number: "no id" }, { test_id: "PSI-25/B2", o2_mole_fraction: "x" }] })!;
    expect(answer.total).toBe(129);
    expect(answer.items).toEqual([
      { test_id: "PSI-25/B1", test_number: "B1", fuel: "100 micron PMMA film   2 cm wide", o2_mole_fraction: 0.222 },
      { test_id: "PSI-25/B2", test_number: null, fuel: null, o2_mole_fraction: null },
    ]);
    expect(parseCatalogTests({ items: [] })).toEqual({ total: 0, items: [] });
  });

  it("gives the real data 18 processed, 11 graded, 5 that could not be measured and 95 not processed, in table order", () => {
    const { rows, loose } = joinTests(TABLE, realIndex());
    expect(rows).toHaveLength(129);
    expect(rows.map((row) => row.label)).toEqual(TABLE_NUMBERS);
    expect(statusCounts(rows)).toEqual({ processed: 18, graded: 11, not_measurable: 5, not_processed: 95 });
    expect(processedLine(rows, true)).toBe("18 of 129 tests processed");
    expect(filterStatus(rows, "not_measurable").map((row) => row.label)).toEqual(["B14", "B17", "B18", "B20", "T20"]);
    expect(filterStatus(rows, "graded").map((row) => row.label)).toEqual(["T4", "T9", "T10", "T12", "T13", "T14", "T15", "T17", "T18", "T21", "T22"]);
    expect(filterStatus(rows, null)).toHaveLength(129);
    // The video whose test could not be told apart sits on no row and is still returned.
    expect(loose).toHaveLength(1);
    expect(loose[0]).toMatchObject({ test_id: null, reason: expect.stringMatching(/not resolved/) });
  });

  it("puts every test of the index on exactly one row", () => {
    const index = realIndex();
    const { rows } = joinTests(TABLE, index);
    for (const test of index.tests) expect(rows.filter((row) => row.test_id === test.test_id).map((row) => row.status)).toEqual(["processed"]);
    for (const outcome of index.t_series!.tests) expect(rows.filter((row) => row.outcome === outcome)).toHaveLength(1);
  });

  it("shows no result for a test that is not processed, and calls no processed test unprocessed", () => {
    const { rows } = joinTests(TABLE, realIndex());
    for (const row of rows) {
      if (row.status === "not_processed") {
        expect(row).toMatchObject({ test: null, outcome: null, reason: null, video_file: null });
        expect(canOpen(row)).toBe(false);
      }
      if (row.status === "processed") {
        expect(row.test?.test_id).toBe(row.test_id);
        expect(canOpen(row)).toBe(true);
        expect(row.reason).toBeNull();
      }
      if (row.status === "graded") {
        expect(row.outcome?.si_grade).not.toBeNull();
        expect(row.test).toBeNull();
      }
      if (row.status === "not_measurable") expect(row.reason).toBeTruthy();
    }
    expect(STATUS_WORDS.not_processed).toBe("Video not processed yet");
  });

  it("takes the conditions from NASA's table and the video file name from the index only", () => {
    const { rows } = joinTests([tableRow("B1"), tableRow("M1", { fuel: null, o2_mole_fraction: null }), tableRow("B14")], realIndex());
    const [b1, m1, b14] = rows;
    expect(b1).toMatchObject({ label: "B1", status: "processed", material: "100 micron PMMA film 2 cm wide", oxygen_pct: 22.2, in_table: true });
    expect(b1.video_file).toBe("PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4");
    expect(m1).toMatchObject({ label: "M1", status: "not_processed", material: null, oxygen_pct: null, video_file: null });
    expect(b14).toMatchObject({ status: "not_measurable", video_file: "PSI-25_Raw Data_BASS_GMT183_SAMPLE_174_TESTB14.mp4" });
    expect(b14.reason).toMatch(/main video does not open/);
    // A T-series test with no grade (no video) keeps its reason and NASA's outcome.
    const t20 = joinTests(TABLE, realIndex()).rows.find((row) => row.label === "T20")!;
    expect(t20).toMatchObject({ status: "not_measurable", reason: "no plain main video on PSI", video_file: null });
    expect(t20.outcome?.nasa_outcome).toBe("quenched");
    expect(canOpen(t20)).toBe(true);
  });

  it("appends a test that only the index names, in natural order, so nothing is dropped", () => {
    const index = fixtureIndex()!;
    const { rows, loose } = joinTests([], index);
    expect(rows.map((row) => row.label).slice(0, 7)).toEqual(["B1", "B2", "B3", "B14", "B17", "B18", "B20"]);
    expect(rows).toHaveLength(3 + 4 + 12);
    expect(rows.every((row) => !row.in_table)).toBe(true);
    expect(statusCounts(rows)).toEqual({ processed: 3, graded: 11, not_measurable: 5, not_processed: 0 });
    expect(processedLine(rows, true)).toBe("3 of 19 tests processed");
    expect(processedLine(rows, false)).toBe("3 tests processed");
    expect(loose).toHaveLength(1);
    // The index's own conditions fill in for a test the table does not list.
    const b1 = rows.find((row) => row.label === "B1")!;
    expect(b1.material).toBe(index.tests.find((test) => test.label === "B1")!.conditions.material_text);
    // Listed after the table's rows when the table has some.
    const mixed = joinTests([tableRow("M1"), tableRow("B2"), tableRow("B2")], index).rows.map((row) => row.label);
    expect(mixed.slice(0, 3)).toEqual(["M1", "B2", "B1"]);
    expect(mixed.filter((label) => label === "B2")).toHaveLength(1);
  });

  it("keeps a reason that has no row of its own: a processed test, or a second reason for one test", () => {
    const index = parseIndex({
      tests: [{ test_id: "PSI-25/B1", label: "B1" }],
      not_measurable: [
        { test_id: "PSI-25/B1", file_name: "other.mp4", reason: "a second video" },
        { test_id: "PSI-25/B9", reason: "first" },
        { test_id: "PSI-25/B9", reason: "second" },
      ],
    })!;
    const { rows, loose } = joinTests([tableRow("B1"), tableRow("B9")], index);
    expect(rows.map((row) => row.status)).toEqual(["processed", "not_measurable"]);
    expect(rows[1].reason).toBe("first");
    expect(loose.map((entry) => entry.reason)).toEqual(["a second video", "second"]);
  });

  it("matches the page's ?test= value by label or whole id", () => {
    const [b1] = joinTests([tableRow("B1")], realIndex()).rows;
    expect(namesRow(b1, "B1")).toBe(true);
    expect(namesRow(b1, "b1")).toBe(true);
    expect(namesRow(b1, "PSI-25/B1")).toBe(true);
    expect(namesRow(b1, "B10")).toBe(false);
    expect(namesRow(b1, "")).toBe(false);
    expect(namesRow(b1, null)).toBe(false);
  });
});

describe("the page of one test (DOB-156)", () => {
  it("is named by the test's label", () => {
    expect(testPageHref("B1")).toBe("/spread/B1");
    expect(testPageHref(" T12 ")).toBe("/spread/T12");
  });

  it("takes the label out of a whole test id, as older ?test= links may carry", () => {
    expect(testPageHref("PSI-25/B3")).toBe("/spread/B3");
  });

  it("escapes a label that is not plain", () => {
    expect(testPageHref("B 1?")).toBe("/spread/B%201%3F");
  });
});

describe("the tracker check from validation.json (DOB-159)", () => {
  // The engine's real file: the numbers asserted here are read from it, not typed.
  const file = JSON.parse(readFileSync(resolve(process.cwd(), "..", "..", "data", "modules", "video-to-data", "validation.json"), "utf8")) as {
    pass_rule: string;
    comparisons: { id: string; n: number; mean_abs_error: number; mean_abs_percent_error: number; pairs: { test_id: string; measured: number; reference: number }[] }[];
  };
  const source = file.comparisons.find((item) => item.id === "val-si-px")!;
  const check = parseTrackerCheck(file)!;

  it("reads the comparison's own numbers", () => {
    expect(check.n).toBe(source.n);
    expect(check.meanAbsError).toBe(source.mean_abs_error);
    expect(check.meanAbsPercent).toBeCloseTo(source.mean_abs_percent_error * 100, 10);
    expect(check.pairs.map((pair) => pair.label)).toEqual(source.pairs.map((pair) => pair.test_id.split("/")[1]));
    expect(check.rule).toBe(file.pass_rule);
  });

  it("the per-test percents average to the file's mean, so the table and the headline agree", () => {
    const mean = check.pairs.reduce((sum, pair) => sum + (pair.percent ?? 0), 0) / check.pairs.length;
    expect(mean).toBeCloseTo(check.meanAbsPercent, 6);
  });

  it("judges the result against the limit in the rule's own words, and names the test that differs most", () => {
    expect(check.limitPercent).toBe(25);
    expect(check.passes).toBe(check.meanAbsPercent <= 25);
    expect(trackerCheckVerdict(check)).toBe(check.passes ? "Within our 25% limit" : "Above our 25% limit: not passed");
    expect(trackerCheckLine(check)).toBe(`${source.n} tests: mean difference ${source.mean_abs_error.toFixed(2)} px/s (${(source.mean_abs_percent_error * 100).toFixed(2)}%)`);
    const top = [...check.pairs].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0];
    expect(check.worst).toBe(check.pairs.find((pair) => pair.label === top.label));
  });

  it("a result at the limit passes, one above it does not, and a rule with no limit gives no verdict", () => {
    const one = (share: number, rule: unknown) =>
      parseTrackerCheck({ pass_rule: rule, comparisons: [{ id: "val-si-px", n: 2, mean_abs_error: 1, mean_abs_percent_error: share, pairs: [] }] })!;
    expect(one(0.25, "at most 25%").passes).toBe(true);
    expect(one(0.2501, "at most 25%").passes).toBe(false);
    expect(one(0.1, "to be decided").passes).toBeNull();
    expect(trackerCheckVerdict(one(0.1, null))).toBe("No pass limit is stated");
  });

  it("is absent when the file has no such comparison or it compared nothing", () => {
    expect(parseTrackerCheck(null)).toBeNull();
    expect(parseTrackerCheck({ comparisons: [{ id: "val-hand", n: 3, mean_abs_error: 1, mean_abs_percent_error: 0.1 }] })).toBeNull();
    expect(parseTrackerCheck({ comparisons: [{ id: "val-si-px", n: 0, mean_abs_error: null, mean_abs_percent_error: null, pairs: [] }] })).toBeNull();
  });
});
