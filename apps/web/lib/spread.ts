// The logic of the Video to Data page's main view (DOB-86, DOB-126): reading the engine's
// index.json and the per-test curve and read-out tables, joining NASA's table of the series with
// the index into one list of tests, mapping video time to test time, flags in plain words, stage
// bands, and the fitted line. Pure, unit tested.
// components/spread/ is the caller. Every field may be absent or null: nothing here throws on it.
import type { Evidence } from "./types";

// ------------------------------------------------------------------ the shape of index.json

export type Quality = "spreading" | "doubtful" | "no_spread";

export interface SpreadConditions {
  material_text: string | null;
  thickness_mm: number | null;
  width_mm: number | null;
  o2_initial_pct: number | null;
  fan_display: string | null;
  air_display: string | null;
}

export interface SpreadRate {
  value: number | null;
  unit: string;
  ci_low: number | null;
  ci_high: number | null;
  window_start_s: number | null;
  window_end_s: number | null;
  /** position = intercept_px + value * time_s, in the curve's leading-edge coordinate. */
  intercept_px: number | null;
}

export interface FanChange {
  time_s: number;
  from: number | null;
  to: number | null;
}

export interface Stage {
  stage: string;
  start_s: number;
  end_s: number;
}

export interface Clip {
  file: string;
  start_s: number;
  end_s: number;
  speed: number;
}

export interface SpreadTest {
  test_id: string;
  label: string;
  video_file: string | null;
  conditions: SpreadConditions;
  viewing: { quality: Quality | null; note: string | null; viewed_by: string | null };
  flags: string[];
  events: {
    ignition_time_s: number | null;
    extinction_time_s: number | null;
    /** The time after which the tracker sees no light above a low fixed threshold. Not the time the flame went out. */
    last_faint_light_s: number | null;
    censored: boolean;
    outcome: string | null;
  };
  rate: SpreadRate | null;
  fan: {
    at_ignition: number | null;
    changes: FanChange[];
    /** When the fan voltage began to fall. */
    drop_time_s: number | null;
    /** When it settled at its new value. */
    settled_time_s: number | null;
    unit: string;
    flame_gone_minus_fan_drop_s: number | null;
  };
  air: { at_ignition: number | null };
  stages: Stage[];
  clip: Clip | null;
  files: {
    kymograph: string | null;
    steps: string | null;
    /** The three-panel detection clip (NASA's frame with outline, brightness, flame mask); same timing as `clip`. */
    steps_clip: string | null;
    stills: string[];
    curve: string | null;
    readout: string | null;
  };
  evidence_ids: Record<string, string>;
}

export interface NotMeasurable {
  test_id: string | null;
  file_name: string | null;
  reason: string;
}

export interface TSeriesRow {
  test_id: string;
  label: string;
  video_file: string | null;
  /** NASA's outcome in NASA's words (Summary Report Table 7.1). */
  nasa_outcome: string | null;
  /** The SI grade as the index writes it (no_ignition, blow_off, ...), or null when the test was not graded. */
  si_grade: string | null;
  confidence: string | null;
  /** yes, no, undecided, not_graded; any other value is kept as written. */
  match: string;
  reason: string | null;
  fan_history: string | null;
  evidence_id: string | null;
  published_evidence_id: string | null;
  /** The grader's times of the wire glow and the flame, seconds of the test. Null when the index has none. */
  si_times: TTimes | null;
  /** The check by a person against the brightened video. Null when nobody checked this test. */
  checked: TCheck | null;
  /** The brightened review clip (test time = start_s + currentTime * speed). Null when there is none. */
  clip: TClip | null;
  /** File name of the read-out table (time_s,fuel,fan,air,rad,clock_s), or null. */
  readout: string | null;
}

/** Times as the grader or a person gave them: the leading number of the written text, null when empty. */
export interface TTimes {
  wire_glow_s: number | null;
  flame_seen_from_s: number | null;
  flame_gone_s: number | null;
}

/** A review clip: the clip rule plus the brightening gain the engine applied (null when it is not stated). */
export interface TClip extends Clip {
  gain: number | null;
}

export interface TCheck {
  by: string | null;
  date: string | null;
  grade: string | null;
  flame_seen_from_s: number | null;
  flame_gone_s: number | null;
  note: string | null;
  /** yes, no, decided (the SI grade was "could not tell" and the person gave one). Other values are kept as written. */
  agrees_with_si: string | null;
  /** The person's grade against NASA's outcome: yes, no, undecided. */
  match: string | null;
  evidence_id: string | null;
}

export interface TSeries {
  note: string | null;
  graded_by: string | null;
  /** Who checked, and when, as one line. */
  checked_by: string | null;
  /** One sentence on what the check is. */
  check_note: string | null;
  tests: TSeriesRow[];
}

export interface SpreadIndex {
  module: string;
  units: Record<string, string>;
  stage_source: { citation: string; link: string | null; note: string | null } | null;
  tests: SpreadTest[];
  not_measurable: NotMeasurable[];
  /** The SI-graded outcomes of the T-series, or null when the index has no such block. */
  t_series: TSeries | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const QUALITIES: readonly string[] = ["spreading", "doubtful", "no_spread"];

function parseRate(raw: unknown): SpreadRate | null {
  if (!isRecord(raw)) return null;
  const value = num(raw.value);
  if (value === null) return null;
  return {
    value,
    unit: str(raw.unit) ?? "px/s",
    ci_low: num(raw.ci_low),
    ci_high: num(raw.ci_high),
    window_start_s: num(raw.window_start_s),
    window_end_s: num(raw.window_end_s),
    intercept_px: num(raw.intercept_px),
  };
}

function parseClip(raw: unknown): Clip | null {
  if (!isRecord(raw)) return null;
  const file = str(raw.file);
  const start = num(raw.start_s);
  const end = num(raw.end_s);
  if (file === null || start === null || end === null || end <= start) return null;
  const speed = num(raw.speed);
  return { file, start_s: start, end_s: end, speed: speed !== null && speed > 0 ? speed : 1 };
}

function parseTest(raw: unknown): SpreadTest | null {
  if (!isRecord(raw)) return null;
  const testId = str(raw.test_id);
  if (testId === null) return null;
  const conditions = isRecord(raw.conditions) ? raw.conditions : {};
  const viewing = isRecord(raw.viewing) ? raw.viewing : {};
  const events = isRecord(raw.events) ? raw.events : {};
  const fan = isRecord(raw.fan) ? raw.fan : {};
  const files = isRecord(raw.files) ? raw.files : {};
  const quality = str(viewing.quality);
  const text = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : null);
  return {
    test_id: testId,
    label: str(raw.label) ?? testId.split("/").pop() ?? testId,
    video_file: str(raw.video_file),
    conditions: {
      material_text: str(conditions.material_text),
      thickness_mm: num(conditions.thickness_mm),
      width_mm: num(conditions.width_mm),
      o2_initial_pct: num(conditions.o2_initial_pct),
      fan_display: text(conditions.fan_display),
      air_display: text(conditions.air_display),
    },
    viewing: {
      quality: quality !== null && QUALITIES.includes(quality) ? (quality as Quality) : null,
      note: str(viewing.note),
      viewed_by: str(viewing.viewed_by),
    },
    flags: list(raw.flags).filter((flag): flag is string => typeof flag === "string"),
    events: {
      ignition_time_s: num(events.ignition_time_s),
      extinction_time_s: num(events.extinction_time_s),
      last_faint_light_s: num(events.last_faint_light_s),
      censored: events.censored === true,
      outcome: str(events.outcome),
    },
    rate: parseRate(raw.rate),
    air: { at_ignition: num(isRecord(raw.air) ? raw.air.at_ignition : null) },
    fan: {
      at_ignition: num(fan.at_ignition),
      changes: list(fan.changes).flatMap((change) => {
        if (!isRecord(change)) return [];
        const time = num(change.time_s);
        return time === null ? [] : [{ time_s: time, from: num(change.from), to: num(change.to) }];
      }),
      drop_time_s: num(fan.drop_time_s),
      settled_time_s: num(fan.settled_time_s),
      unit: str(fan.unit) ?? "V x10",
      flame_gone_minus_fan_drop_s: num(fan.flame_gone_minus_fan_drop_s),
    },
    stages: list(raw.stages).flatMap((stage) => {
      if (!isRecord(stage)) return [];
      const name = str(stage.stage);
      const start = num(stage.start_s);
      const end = num(stage.end_s);
      return name === null || start === null || end === null || end <= start ? [] : [{ stage: name, start_s: start, end_s: end }];
    }),
    clip: parseClip(raw.clip),
    files: {
      kymograph: str(files.kymograph),
      steps: str(files.steps),
      steps_clip: str(files.steps_clip),
      stills: list(files.stills).filter((name): name is string => typeof name === "string" && name !== ""),
      curve: str(files.curve),
      readout: str(files.readout),
    },
    evidence_ids: isRecord(raw.evidence_ids)
      ? Object.fromEntries(Object.entries(raw.evidence_ids).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : {},
  };
}

function parseTSeriesRow(raw: unknown): TSeriesRow | null {
  if (!isRecord(raw)) return null;
  const testId = str(raw.test_id);
  if (testId === null) return null;
  const grade = str(raw.si_grade);
  return {
    test_id: testId,
    label: str(raw.label) ?? testId.split("/").pop() ?? testId,
    video_file: str(raw.video_file),
    nasa_outcome: str(raw.nasa_outcome),
    si_grade: grade,
    confidence: str(raw.confidence),
    match: str(raw.match) ?? (grade === null ? "not_graded" : "undecided"),
    reason: str(raw.reason),
    fan_history: str(raw.fan_history),
    evidence_id: str(raw.evidence_id),
    published_evidence_id: str(raw.published_evidence_id),
    si_times: isRecord(raw.si_times)
      ? { wire_glow_s: num(raw.si_times.wire_glow_s), flame_seen_from_s: num(raw.si_times.flame_seen_from_s), flame_gone_s: num(raw.si_times.flame_gone_s) }
      : null,
    checked: parseTCheck(raw.checked),
    clip: parseTClip(raw.clip),
    readout: str(raw.readout),
  };
}

function parseTClip(raw: unknown): TClip | null {
  const clip = parseClip(raw);
  if (!clip || !isRecord(raw)) return null;
  const gain = num(raw.gain);
  return { ...clip, gain: gain !== null && gain > 0 ? gain : null };
}

/** The caption under a review clip; the gain comes from the clip. */
export function clipCaption(gain: number | null): string {
  return `NASA's video, brightened${gain !== null ? ` x${gain}` : ""} so the dim flame can be seen. The on-screen numbers are as recorded.`;
}

function parseTCheck(raw: unknown): TCheck | null {
  if (!isRecord(raw)) return null;
  return {
    by: str(raw.by),
    date: str(raw.date),
    grade: str(raw.grade),
    flame_seen_from_s: num(raw.flame_seen_from_s),
    flame_gone_s: num(raw.flame_gone_s),
    note: str(raw.note),
    agrees_with_si: str(raw.agrees_with_si),
    match: str(raw.match),
    evidence_id: str(raw.evidence_id),
  };
}

/** The index's t_series block. Null when it is absent or not an object with a list of tests. */
export function parseTSeries(raw: unknown): TSeries | null {
  if (!isRecord(raw) || !Array.isArray(raw.tests)) return null;
  return {
    note: str(raw.note),
    graded_by: str(raw.graded_by),
    checked_by: str(raw.checked_by),
    check_note: str(raw.check_note),
    tests: raw.tests.flatMap((row) => {
      const parsed = parseTSeriesRow(row);
      return parsed ? [parsed] : [];
    }),
  };
}

const GRADE_WORDS: Record<string, string> = {
  quenched: "quenched",
  no_ignition: "no ignition",
  blow_off: "blow-off",
  no_blow_off: "no blow-off",
  cannot_tell: "could not tell",
};

/** An SI grade in plain words. An unknown grade is shown as written; null is "not graded". */
export function gradeWord(grade: string | null): string {
  return grade === null ? "not graded" : (GRADE_WORDS[grade] ?? grade);
}

const MATCH_WORDS: Record<string, string> = { yes: "yes", no: "no", undecided: "undecided", not_graded: "not graded" };

/** The match column in words. An unknown value is shown as written. */
export function matchWord(match: string): string {
  return MATCH_WORDS[match] ?? match;
}

export interface TSeriesCounts {
  /** Rows with an SI grade. */
  graded: number;
  match: number;
  undecided: number;
  contradict: number;
}

export function tSeriesCounts(rows: readonly TSeriesRow[]): TSeriesCounts {
  const graded = rows.filter((row) => row.si_grade !== null);
  return {
    graded: graded.length,
    match: graded.filter((row) => row.match === "yes").length,
    undecided: graded.filter((row) => row.match === "undecided").length,
    contradict: graded.filter((row) => row.match === "no").length,
  };
}

/** "10 of 11 graded tests match NASA's published outcome; 1 could not be decided; 0 contradict it", from the rows. */
export function tSeriesCountLine(rows: readonly TSeriesRow[]): string {
  const c = tSeriesCounts(rows);
  if (c.graded === 0) return "No T-series test is graded.";
  return `${c.match} of ${c.graded} graded ${c.graded === 1 ? "test matches" : "tests match"} NASA's published outcome; ${c.undecided} could not be decided; ${c.contradict} ${c.contradict === 1 ? "contradicts" : "contradict"} it`;
}

/** Rows the person checked (a grade was given). */
export function tCheckCounts(rows: readonly TSeriesRow[]): { checked: number; match: number } {
  const checked = rows.filter((row) => row.checked !== null && row.checked.grade !== null);
  return { checked: checked.length, match: checked.filter((row) => row.checked?.match === "yes").length };
}

/** "11 checked by a person; 11 of 11 match NASA's published outcome", from the rows. Null when nobody checked. */
export function tCheckLine(rows: readonly TSeriesRow[]): string | null {
  const c = tCheckCounts(rows);
  if (c.checked === 0) return null;
  return `${c.checked} checked by a person; ${c.match} of ${c.checked} match NASA's published outcome`;
}

const AGREE_WORDS: Record<string, string> = { yes: "agrees with SI", no: "differs from SI", decided: "decided where SI could not tell" };

/** The person's check against the SI grade, in words. */
export function agreeWord(value: string | null): string {
  return value === null ? "not compared" : (AGREE_WORDS[value] ?? value);
}

export type TMarkKind = "si_seen" | "si_gone" | "person_seen" | "person_gone";

/** The vertical marks of a T chart: flame seen and flame gone, from the SI grader and from the person. */
export function tMarks(row: TSeriesRow): { t: number; kind: TMarkKind }[] {
  const out: { t: number; kind: TMarkKind }[] = [];
  const add = (t: number | null | undefined, kind: TMarkKind) => {
    if (t !== null && t !== undefined) out.push({ t, kind });
  };
  add(row.si_times?.flame_seen_from_s, "si_seen");
  add(row.si_times?.flame_gone_s, "si_gone");
  add(row.checked?.flame_seen_from_s, "person_seen");
  add(row.checked?.flame_gone_s, "person_gone");
  return out;
}

/** The time axis of a T chart: the clip, widened to the read-out table when that reaches further. */
export function tRange(clip: Clip, readout: readonly ReadoutRow[]): [number, number] {
  const times = readout.map((r) => r.time_s);
  return [Math.min(clip.start_s, ...times), Math.max(clip.end_s, ...times)];
}

/** index.json into the shape above. Null when it is not an object with a list of tests. */
export function parseIndex(raw: unknown): SpreadIndex | null {
  if (!isRecord(raw) || !Array.isArray(raw.tests)) return null;
  const source = isRecord(raw.stage_source) ? raw.stage_source : null;
  const citation = source ? str(source.citation) : null;
  return {
    module: str(raw.module) ?? "video-to-data",
    units: isRecord(raw.units) ? Object.fromEntries(Object.entries(raw.units).filter((e): e is [string, string] => typeof e[1] === "string")) : {},
    stage_source: citation ? { citation, link: source ? str(source.link) : null, note: source ? str(source.note) : null } : null,
    tests: raw.tests.flatMap((test) => {
      const parsed = parseTest(test);
      return parsed ? [parsed] : [];
    }),
    t_series: parseTSeries(raw.t_series),
    not_measurable: list(raw.not_measurable).flatMap((row) => {
      if (!isRecord(row)) return [];
      return [{ test_id: str(row.test_id), file_name: str(row.file_name), reason: str(row.reason) ?? "no reason is given" }];
    }),
  };
}

// ------------------------------------------------------------------ the CSV tables

/** One CSV line into cells, with "quoted, cells" kept whole. */
function splitLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(current);
      current = "";
    } else current += ch;
  }
  cells.push(current);
  return cells;
}

/** A CSV into rows keyed by header name. Blank lines are skipped; short rows give empty cells. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return [];
  const header = splitLine(lines[0]).map((name) => name.trim());
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    return Object.fromEntries(header.map((name, index) => [name, (cells[index] ?? "").trim()]));
  });
}

/** An empty cell, "nan" or text is null: the value was not read. */
export function cellNumber(cell: string | undefined): number | null {
  if (cell === undefined || cell.trim() === "") return null;
  const value = Number(cell);
  return Number.isFinite(value) ? value : null;
}

export interface CurveRow {
  time_s: number;
  leading_edge_px: number | null;
  trailing_edge_px: number | null;
  area_px: number | null;
  flame_light: number | null;
  stage: string | null;
}

/** PSI-25_<T>_curve.csv. The last two columns are optional; a row without a time is dropped. */
export function parseCurve(text: string): CurveRow[] {
  return parseCsv(text).flatMap((row) => {
    const time = cellNumber(row.time_s);
    if (time === null) return [];
    return [
      {
        time_s: time,
        leading_edge_px: cellNumber(row.leading_edge_px),
        trailing_edge_px: cellNumber(row.trailing_edge_px),
        area_px: cellNumber(row.area_px),
        flame_light: cellNumber(row.flame_light),
        stage: row.stage && row.stage !== "" ? row.stage : null,
      },
    ];
  });
}

export interface ReadoutRow {
  time_s: number;
  /** The field labelled FUEL on the picture: parsed, never plotted. */
  fuel: number | null;
  fan: number | null;
  air: number | null;
  rad: number | null;
  clock_s: number | null;
}

/** PSI-25_<T>_readout.csv: what the on-screen read-out showed. An empty cell is unreadable. */
export function parseReadout(text: string): ReadoutRow[] {
  return parseCsv(text).flatMap((row) => {
    const time = cellNumber(row.time_s);
    if (time === null) return [];
    return [{ time_s: time, fuel: cellNumber(row.fuel), fan: cellNumber(row.fan), air: cellNumber(row.air), rad: cellNumber(row.rad), clock_s: cellNumber(row.clock_s) }];
  });
}

// ------------------------------------------------------------------ clip time and test time

/** Test time of a moment in the clip: clip.start_s + videoTime * speed, kept inside the clip. */
export function clipToTest(clip: Clip, videoTime: number): number {
  const test = clip.start_s + Math.max(0, videoTime) * clip.speed;
  return Math.min(clip.end_s, test);
}

/** Video time of a test time. A test time outside the clip is moved to the nearest end of it. */
export function testToClip(clip: Clip, testTime: number): number {
  const inside = Math.min(clip.end_s, Math.max(clip.start_s, testTime));
  return (inside - clip.start_s) / clip.speed;
}

// ------------------------------------------------------------------ the list of tests

export const QUALITY_WORDS: Record<Quality, string> = {
  spreading: "spreading",
  doubtful: "doubtful",
  no_spread: "no spread",
};

/** The word for what was seen, or "not viewed" when the index states none. */
export function qualityWord(quality: Quality | null): string {
  return quality ? QUALITY_WORDS[quality] : "not viewed";
}

/** The flags that matter for ordering: every flag except no_scale, which all tests carry. */
export function warningFlags(flags: readonly string[]): string[] {
  return flags.filter((flag) => flag !== "no_scale");
}

const naturalOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Tests with no flag other than no_scale lead the list; within each group, natural order of the label. */
export function orderTests(tests: readonly SpreadTest[]): SpreadTest[] {
  return [...tests].sort(
    (a, b) =>
      Number(warningFlags(a.flags).length > 0) - Number(warningFlags(b.flags).length > 0) ||
      naturalOrder.compare(a.label, b.label),
  );
}

export interface TestFilter {
  /** Qualities to keep; an empty set keeps all. */
  quality: ReadonlySet<Quality>;
  /** Thickness in mm to keep, or null for all. */
  thickness: number | null;
  /** Keep only tests with no warning flag besides no_scale. */
  noFlag: boolean;
}

export const NO_FILTER: TestFilter = { quality: new Set(), thickness: null, noFlag: false };

export function filterTests(tests: readonly SpreadTest[], filter: TestFilter): SpreadTest[] {
  return tests.filter(
    (test) =>
      (filter.quality.size === 0 || (test.viewing.quality !== null && filter.quality.has(test.viewing.quality))) &&
      (filter.thickness === null || test.conditions.thickness_mm === filter.thickness) &&
      (!filter.noFlag || warningFlags(test.flags).length === 0),
  );
}

/** The thicknesses present, in rising order, each with how many tests have it. */
export function thicknessOptions(tests: readonly SpreadTest[]): { value: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const test of tests) {
    const value = test.conditions.thickness_mm;
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value - b.value);
}

/** Seconds from ignition to extinction, or null when either is not known (still burning at the end). */
export function burnDuration(test: SpreadTest): number | null {
  const { ignition_time_s: start, extinction_time_s: end, censored } = test.events;
  if (censored || start === null || end === null || end < start) return null;
  return end - start;
}

// ------------------------------------------------------------------ every test of the series (DOB-126)

/** The investigation whose videos the engine reads (BASS-II). */
export const SERIES_PSI_ID = "PSI-25";
/**
 * NASA's whole experimental table of the series in one request: 129 rows, and the backend allows
 * up to 500 per request. scripts/snapshot.mjs saves the same path for the saved copy.
 */
export const SERIES_TESTS_PATH = `/catalog/tests?psi_id=${SERIES_PSI_ID}&limit=200`;
/** Where this site lists the investigation's files. */
export const SERIES_FILES_HREF = `/investigations/${SERIES_PSI_ID}#holdings`;

/** The fields of a row of GET /catalog/tests that the list uses. */
export interface CatalogTest {
  test_id: string;
  test_number: string | null;
  fuel: string | null;
  o2_mole_fraction: number | null;
}

/** The answer of GET /catalog/tests, read defensively. Null when it is not an object with a list of rows. */
export function parseCatalogTests(raw: unknown): { total: number; items: CatalogTest[] } | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;
  const items = raw.items.flatMap((row) => {
    if (!isRecord(row)) return [];
    const testId = str(row.test_id);
    if (testId === null) return [];
    return [{ test_id: testId, test_number: str(row.test_number), fuel: str(row.fuel), o2_mole_fraction: num(row.o2_mole_fraction) }];
  });
  return { total: num(raw.total) ?? items.length, items };
}

export type VideoStatus = "processed" | "graded" | "not_measurable" | "not_processed";

export const VIDEO_STATUSES: readonly VideoStatus[] = ["processed", "graded", "not_measurable", "not_processed"];

/** The status as the row shows it. */
export const STATUS_WORDS: Record<VideoStatus, string> = {
  processed: "Processed",
  graded: "Outcome graded",
  not_measurable: "Could not be measured",
  not_processed: "Video not processed yet",
};

/** The status as the filter names it. */
export const STATUS_FILTER_WORDS: Record<VideoStatus, string> = {
  processed: "Processed",
  graded: "Outcome graded",
  not_measurable: "Could not be measured",
  not_processed: "Not processed yet",
};

/** One test of the series: its conditions from NASA's table, and what the engine has for it. */
export interface SeriesRow {
  test_id: string;
  label: string;
  status: VideoStatus;
  /** The sample as NASA's table writes it (or as the index does, for a test the table does not list). */
  material: string | null;
  /** Oxygen at the start, percent by volume. */
  oxygen_pct: number | null;
  /** NASA's video file name, where the index names one. Never made up. */
  video_file: string | null;
  /** False for a test that only the engine's index names. */
  in_table: boolean;
  /** The engine's measurements. Present only for a processed test. */
  test: SpreadTest | null;
  /** The T-series row of the test (NASA's outcome, the SI grade). Null for a test outside that block. */
  outcome: TSeriesRow | null;
  /** Why the engine has no measurement. Present only with the status not_measurable. */
  reason: string | null;
}

export interface SeriesList {
  rows: SeriesRow[];
  /** Entries of not_measurable that sit on no row: no resolved test id, or a test that has results. */
  loose: NotMeasurable[];
}

const oneLine = (text: string | null | undefined): string | null => {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean === "" ? null : clean;
};

/**
 * NASA's table joined with the engine's index by test id. The table gives the list and the
 * conditions; the index gives the status and the results. Table order is kept. A test that only
 * the index names is appended, in natural order, so nothing is dropped. A test with no entry in
 * the index is "not processed" and carries no result.
 */
export function joinTests(catalog: readonly CatalogTest[], index: SpreadIndex): SeriesList {
  const processed = new Map(index.tests.map((test) => [test.test_id, test]));
  const outcomes = new Map((index.t_series?.tests ?? []).map((row) => [row.test_id, row]));
  const reasons = new Map<string, NotMeasurable>();
  const loose: NotMeasurable[] = [];
  for (const entry of index.not_measurable) {
    const id = entry.test_id;
    const hasResult = id !== null && (processed.has(id) || (outcomes.get(id)?.si_grade ?? null) !== null);
    if (id === null || hasResult || reasons.has(id)) loose.push(entry);
    else reasons.set(id, entry);
  }

  const build = (testId: string, row: CatalogTest | null): SeriesRow => {
    const test = processed.get(testId) ?? null;
    const outcome = outcomes.get(testId) ?? null;
    const entry = reasons.get(testId) ?? null;
    const status: VideoStatus = test
      ? "processed"
      : outcome && outcome.si_grade !== null
        ? "graded"
        : outcome || entry
          ? "not_measurable"
          : "not_processed";
    const fraction = row?.o2_mole_fraction ?? null;
    return {
      test_id: testId,
      label: test?.label ?? outcome?.label ?? row?.test_number ?? testId.split("/").pop() ?? testId,
      status,
      material: oneLine(row?.fuel) ?? oneLine(test?.conditions.material_text),
      oxygen_pct: fraction !== null ? Number((fraction * 100).toFixed(4)) : (test?.conditions.o2_initial_pct ?? null),
      video_file: test?.video_file ?? outcome?.video_file ?? entry?.file_name ?? null,
      in_table: row !== null,
      test,
      outcome,
      reason: status === "not_measurable" ? (entry?.reason ?? outcome?.reason ?? null) : null,
    };
  };

  const rows: SeriesRow[] = [];
  const seen = new Set<string>();
  for (const row of catalog) {
    if (seen.has(row.test_id)) continue;
    seen.add(row.test_id);
    rows.push(build(row.test_id, row));
  }
  const extra = [...processed.keys(), ...outcomes.keys(), ...reasons.keys()].filter((id) => !seen.has(id));
  for (const id of [...new Set(extra)].sort(naturalOrder.compare)) rows.push(build(id, null));
  return { rows, loose };
}

/** How many rows have each status. */
export function statusCounts(rows: readonly SeriesRow[]): Record<VideoStatus, number> {
  const counts: Record<VideoStatus, number> = { processed: 0, graded: 0, not_measurable: 0, not_processed: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/** The rows of one status, or every row for null. */
export function filterStatus(rows: readonly SeriesRow[], status: VideoStatus | null): SeriesRow[] {
  return status === null ? [...rows] : rows.filter((row) => row.status === status);
}

/** "18 of 129 tests processed". Without NASA's table the total is not known, so only the processed count is said. */
export function processedLine(rows: readonly SeriesRow[], hasTable: boolean): string {
  const processed = statusCounts(rows).processed;
  return hasTable ? `${processed} of ${rows.length} tests processed` : `${processed} ${processed === 1 ? "test" : "tests"} processed`;
}

/** Whether a row can open: it has measurements, or a T-series outcome to show (NASA's, even with no video). */
export function canOpen(row: SeriesRow): boolean {
  return row.test !== null || row.outcome !== null;
}

/** The list of tests, where a test's page links back to. */
export const SPREAD_LIST_HREF = "/spread";

/**
 * The page of one test: /spread/B1 (DOB-156). Takes a row's label ("B1") or a whole test id
 * ("PSI-25/B1", as older ?test= links may carry): the page is named by the label alone.
 */
export function testPageHref(key: string): string {
  const label = key.trim().split("/").pop() ?? "";
  return `${SPREAD_LIST_HREF}/${encodeURIComponent(label)}`;
}

const OPENED_KEY = "spread:opened-test";

/** A test's page notes its label, so the list can bring that row back into view on return. */
export function rememberOpenedTest(label: string): void {
  try {
    window.sessionStorage.setItem(OPENED_KEY, label);
  } catch {
    // No storage (private window): the list simply opens at its top.
  }
}

/** The label noted by the last opened test's page, read once: the note is cleared. */
export function takeOpenedTest(): string | null {
  try {
    const label = window.sessionStorage.getItem(OPENED_KEY);
    if (label !== null) window.sessionStorage.removeItem(OPENED_KEY);
    return label;
  } catch {
    return null;
  }
}

/** Whether a name (a page's /spread/<name>, or an older ?test= value) names this row: its label ("B1", any case) or its whole id ("PSI-25/B1"). */
export function namesRow(row: SeriesRow, key: string | null): boolean {
  if (key === null) return false;
  const wanted = key.trim().toLowerCase();
  return wanted !== "" && (row.label.toLowerCase() === wanted || row.test_id.toLowerCase() === wanted);
}

// ------------------------------------------------------------------ flags in plain words

const FLAG_WORDS: Record<string, string> = {
  no_scale: "in pixels: no scale reference is visible in the video",
  eye_doubtful: "the SI viewer who looked at the frames doubted that the flame spreads",
  eye_no_spread: "the SI viewer who looked at the frames saw no spread",
  negative_rate: "the fitted rate is negative: the edge moved the other way",
  short_window: "the window the rate is fitted over is short",
  short_travel: "the leading edge travelled only a short distance",
  steady_under_20s: "the steady part of the test lasts under 20 s",
  no_steady_window: "no steady stretch was found, so there is no fitted rate",
  estimates_disagree: "two ways of estimating the rate disagree",
  reignition: "the flame went out and lit again",
  match_inferred: "the match between this video and its table row was inferred",
  hand_checked_by_team_member: "the SI markings were checked by a team member",
  si_draft_not_an_independent_human_measurement: "the markings were made by SI: this is not an independent human measurement",
};

/** A flag in words. An unknown flag is shown as written. */
export function flagWords(flag: string): string {
  return FLAG_WORDS[flag] ?? flag;
}

// ------------------------------------------------------------------ charts

export interface Band {
  stage: string;
  start_s: number;
  end_s: number;
  /** Position in the stage list, for the colour. */
  index: number;
}

/** The stage bands as the data gives them (names are never assumed), cut to the visible range. */
export function stageBands(stages: readonly Stage[], range: [number, number]): Band[] {
  return stages.flatMap((stage, index) => {
    const start = Math.max(stage.start_s, range[0]);
    const end = Math.min(stage.end_s, range[1]);
    return end > start ? [{ stage: stage.stage, start_s: start, end_s: end, index }] : [];
  });
}

/** The time of the last-faint-light marker, or null when the test has none (then nothing is drawn). */
export function lastFaintLight(test: SpreadTest): number | null {
  return test.events.last_faint_light_s;
}

export const LAST_FAINT_LIGHT_NOTE =
  "The time after which the tracker sees no light above a low fixed threshold. It depends on that threshold and can follow an ember or a glowing sample holder; it is not the time the flame went out. Given only where a viewer saw a flame at that time.";

/** The one time range every chart of a test shares: every table, event, band and the clip. */
export function timeRange(test: SpreadTest, curve: readonly CurveRow[], readout: readonly ReadoutRow[]): [number, number] | null {
  const times: number[] = [];
  for (const row of curve) times.push(row.time_s);
  for (const row of readout) times.push(row.time_s);
  const { ignition_time_s: ignition, extinction_time_s: extinction } = test.events;
  if (ignition !== null) times.push(ignition);
  if (extinction !== null) times.push(extinction);
  if (test.events.last_faint_light_s !== null) times.push(test.events.last_faint_light_s);
  for (const change of test.fan.changes) times.push(change.time_s);
  for (const stage of test.stages) times.push(stage.start_s, stage.end_s);
  if (test.clip) times.push(test.clip.start_s, test.clip.end_s);
  if (times.length === 0) return null;
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  return hi > lo ? [lo, hi] : [lo, lo + 1];
}

/**
 * The fitted line of the rate, from the index: position = intercept_px + value * time_s over the
 * fitted window, in the same coordinate as the curve's leading edge. Null when the index does not
 * state the slope, the window and the intercept (then no line is drawn).
 */
export function fittedLine(rate: SpreadRate | null): { t0: number; y0: number; t1: number; y1: number } | null {
  if (!rate || rate.value === null || rate.intercept_px === null) return null;
  if (rate.window_start_s === null || rate.window_end_s === null) return null;
  const { value: slope, intercept_px: intercept, window_start_s: t0, window_end_s: t1 } = rate;
  return { t0, y0: intercept + slope * t0, t1, y1: intercept + slope * t1 };
}

/** The stretch of time over which the fan voltage fell: from its start to when it settled. */
export function fanFall(test: SpreadTest): { from: number; to: number } | null {
  const { drop_time_s: from, settled_time_s: to } = test.fan;
  return from !== null && to !== null && to > from ? { from, to } : null;
}

/** The row whose time is nearest to the given time, by bisection (rows are in time order). */
export function nearestRow<T extends { time_s: number }>(rows: readonly T[], time: number): T | null {
  if (rows.length === 0) return null;
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].time_s < time) lo = mid + 1;
    else hi = mid;
  }
  const after = rows[lo];
  const before = rows[Math.max(0, lo - 1)];
  return Math.abs(before.time_s - time) <= Math.abs(after.time_s - time) ? before : after;
}

// ------------------------------------------------------------------ numbers and the evidence panel

/** The evidence record the index names for a quantity, or the one of that test and quantity. */
export function findEvidence(
  evidence: readonly Evidence[],
  test: SpreadTest,
  quantity: string,
): Evidence | null {
  return (
    evidence.find((record) => record.id === test.evidence_ids[quantity]) ??
    evidence.find((record) => record.test_id === test.test_id && record.quantity === quantity) ??
    null
  );
}

/** Seconds as written on the page: one decimal. */
export function seconds(value: number): string {
  return `${value.toFixed(1)} s`;
}

/** The rate with its interval, in the unit the index states: "9.65 px/s (9.58 to 9.74)". */
export function rateText(rate: SpreadRate | null): string | null {
  if (!rate || rate.value === null) return null;
  const value = Number(rate.value.toPrecision(3));
  const interval =
    rate.ci_low !== null && rate.ci_high !== null ? ` (${Number(rate.ci_low.toPrecision(3))} to ${Number(rate.ci_high.toPrecision(3))})` : "";
  return `${value} ${rate.unit}${interval}`;
}

// ------------------------------------------------------------------ without index.json

export interface FallbackRow {
  test_id: string;
  quantities: Record<string, Evidence>;
  flags: string[];
}

/** One row per test built from the evidence records alone, in natural test order. */
export function fallbackRows(evidence: readonly Evidence[]): FallbackRow[] {
  const byTest = new Map<string, FallbackRow>();
  for (const record of evidence) {
    const row = byTest.get(record.test_id) ?? { test_id: record.test_id, quantities: {}, flags: [] };
    row.quantities[record.quantity] ??= record;
    for (const flag of record.flags ?? []) if (!row.flags.includes(flag)) row.flags.push(flag);
    byTest.set(record.test_id, row);
  }
  return [...byTest.values()].sort((a, b) => naturalOrder.compare(a.test_id, b.test_id));
}

// ------------------------------------------------------------------ NASA's on-screen read-out

// Where the read-out text sits in the 720 x 480 frame. Taken from pipeline/video_to_data/overlay.py
// (ROW_Y = 31, 49, 67; glyph 25 x 15 px; cell pitch about 28.5 px; the x of column 0 is fitted per
// video between 150 and 168, so the boxes are approximate: they mark the area, not exact pixels).
export const FRAME = { w: 720, h: 480 } as const;
export const READOUT_GRID = { x0: 158, pitch: 28.5, valuesY: 49, clockY: 67, glyphH: 15, marginY: 2, gap: 4 } as const;
/** Rows of the frame NASA's text occupies, and where the brightening of a review clip starts (review_clip.py KEEP_ROWS). */
export const BRIGHTEN_FROM_Y = 90;

export type ReadoutField = "fuel" | "air" | "fan" | "rad" | "clock";

export interface FieldBox {
  field: ReadoutField;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Character columns of the fields (overlay.py parse_values: FUEL 0 to 4, AIR 5 to 9, FAN 10 to 14, RAD 15 to 19; the clock is 17 columns). */
const FIELD_COLUMNS: Record<ReadoutField, [number, number]> = { fuel: [0, 5], air: [5, 10], fan: [10, 15], rad: [15, 20], clock: [0, 17] };

/** The region of one field in frame pixels, a few pixels of margin above and below, kept inside the frame. */
export function fieldBox(field: ReadoutField): FieldBox {
  const g = READOUT_GRID;
  const [c0, c1] = FIELD_COLUMNS[field];
  const x = g.x0 + c0 * g.pitch;
  const right = Math.min(FRAME.w - 2, g.x0 + c1 * g.pitch - g.gap);
  const top = field === "clock" ? g.clockY : g.valuesY;
  return { field, x, y: top - g.marginY, w: right - x, h: g.glyphH + 2 * g.marginY - (field === "clock" ? 0 : 1) };
}

export const READOUT_FIELDS: readonly ReadoutField[] = ["fuel", "air", "fan", "rad", "clock"];

/** The row of a read-out table nearest to a test time, or null when none is within `tolerance` seconds. */
export function readoutRowAt(rows: readonly ReadoutRow[], time: number, tolerance = 1): ReadoutRow | null {
  let best: ReadoutRow | null = null;
  for (const row of rows) if (best === null || Math.abs(row.time_s - time) < Math.abs(best.time_s - time)) best = row;
  return best !== null && Math.abs(best.time_s - time) <= tolerance ? best : null;
}

/** The row of a curve nearest to a test time, or null when none is within `tolerance` seconds. */
export function curveRowAt(rows: readonly CurveRow[], time: number, tolerance = 1): CurveRow | null {
  let best: CurveRow | null = null;
  for (const row of rows) if (best === null || Math.abs(row.time_s - time) < Math.abs(best.time_s - time)) best = row;
  return best !== null && Math.abs(best.time_s - time) <= tolerance ? best : null;
}

/** NASA's clock reading (seconds of the day) as hh:mm:ss. */
export function clockText(seconds: number): string {
  const s = Math.round(seconds) % 86400;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** The value of one field at a test time as text; null when the read-out has no value there. FUEL is never shown. */
export function fieldValueAt(rows: readonly ReadoutRow[], field: ReadoutField, time: number | null): string | null {
  if (time === null || field === "fuel") return null;
  const row = readoutRowAt(rows, time);
  if (!row) return null;
  if (field === "clock") return row.clock_s === null ? null : clockText(row.clock_s);
  const value = row[field];
  return value === null ? null : String(value);
}

// ------------------------------------------------------------------ the tracker check (validation.json)

/** The comparison of the engine's validation file that the page shows (DOB-159). */
export const TRACKER_CHECK_ID = "val-si-px";
export const VALIDATION_FILE = "validation.json";

export interface TrackerCheckPair {
  label: string;
  /** The tracker's rate. */
  measured: number;
  /** The rate from the SI markings. */
  reference: number;
  difference: number;
  /** |difference| as a share of the reference rate, in percent. Null when the reference is 0. */
  percent: number | null;
}

export interface TrackerCheck {
  name: string;
  unit: string;
  n: number;
  meanAbsError: number;
  /** Mean absolute percentage error, in percent (25.75). */
  meanAbsPercent: number;
  pairs: TrackerCheckPair[];
  flags: string[];
  /** The pass rule as the engine's file words it. */
  rule: string | null;
  /** The limit read from the rule's words, in percent. Null when the rule states none. */
  limitPercent: number | null;
  /** Whether the check meets its own rule. Null when the rule states no limit. */
  passes: boolean | null;
  /** The pair that differs most, by percent. */
  worst: TrackerCheckPair | null;
}

/**
 * The tracker-against-SI-markings check, from the engine's validation.json. Every number is the
 * file's own; the per-test difference is the file's two rates subtracted. Null when the file has
 * no such comparison or it compared nothing.
 */
export function parseTrackerCheck(raw: unknown): TrackerCheck | null {
  if (!isRecord(raw)) return null;
  const file = raw;
  const found = list(file.comparisons).filter(isRecord).find((item) => item.id === TRACKER_CHECK_ID);
  if (!found) return null;
  const n = num(found.n);
  const meanAbsError = num(found.mean_abs_error);
  const share = num(found.mean_abs_percent_error);
  if (n === null || n < 1 || meanAbsError === null || share === null) return null;
  const pairs: TrackerCheckPair[] = list(found.pairs).flatMap((item) => {
    if (!isRecord(item)) return [];
    const measured = num(item.measured);
    const reference = num(item.reference);
    const testId = str(item.test_id);
    if (measured === null || reference === null || testId === null) return [];
    const difference = measured - reference;
    return [{ label: testId.split("/").pop() ?? testId, measured, reference, difference, percent: reference === 0 ? null : (Math.abs(difference) / Math.abs(reference)) * 100 }];
  });
  const rule = str(file.pass_rule);
  const limit = rule ? /(\d+(?:\.\d+)?)\s*%/.exec(rule) : null;
  const limitPercent = limit ? Number(limit[1]) : null;
  const meanAbsPercent = share * 100;
  const worst = pairs.reduce<TrackerCheckPair | null>((top, pair) => (pair.percent !== null && (top === null || pair.percent > (top.percent ?? 0)) ? pair : top), null);
  return {
    name: str(found.name) ?? "Tracker against the SI markings",
    unit: str(found.unit) ?? "px/s",
    n,
    meanAbsError,
    meanAbsPercent,
    pairs,
    flags: list(found.flags).filter((flag): flag is string => typeof flag === "string"),
    rule,
    limitPercent,
    passes: limitPercent === null ? null : meanAbsPercent <= limitPercent,
    worst,
  };
}

/** The check's one-line result: "5 tests: mean difference 2.50 px/s (25.75%)". */
export function trackerCheckLine(check: TrackerCheck): string {
  return `${check.n} ${check.n === 1 ? "test" : "tests"}: mean difference ${check.meanAbsError.toFixed(2)} ${check.unit} (${check.meanAbsPercent.toFixed(2)}%)`;
}

/** The verdict against the file's own rule, in words. */
export function trackerCheckVerdict(check: TrackerCheck): string {
  if (check.passes === null || check.limitPercent === null) return "No pass limit is stated";
  return check.passes ? `Within our ${check.limitPercent}% limit` : `Above our ${check.limitPercent}% limit: not passed`;
}
