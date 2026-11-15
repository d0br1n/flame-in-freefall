// The suppression bench (Linear DOB-87): what the Suppress page shows from the flame
// temperature engine's files (data/modules/flame-temperature/, served by GET
// /modules/flame-temperature/files/<name>). Pure functions, no drawing; unit tested in
// tests/unit/suppress.test.ts. Every number shown comes from these files, which come from the
// FLEX (PSI-69), CFI (PSI-39) and FLEX-2 (PSI-68) tables. Nothing here computes a new value.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { SHAPES, type Shape } from "./chart";

export const ENGINE_ID = "flame-temperature";

/** The path of one of the engine's files below /api/v1. */
export function engineFilePath(name: string): string {
  return `/modules/${ENGINE_ID}/files/${encodeURIComponent(name)}`;
}

// ---------------------------------------------------------------- the files' shapes

/** One FLEX test in flex_tests.json (only the fields the page reads). */
export interface FlexTest {
  test_id: string;
  flex_test: number;
  fuel: string;
  pressure_atm: number | null;
  x_o2: number | null;
  gas_label: string;
  test_end: string | null;
  flags: { dropped: boolean };
  dropped_reason: string | null;
}

export interface FlexTestsFile {
  header: Record<string, unknown>;
  tests: FlexTest[];
}

/** One "next test to fly" cell in flex_gaps.json. */
export interface GapRow {
  rank: number;
  fuel: string;
  added_gas: string;
  x_added: number;
  x_o2: number;
  pressure_atm: number;
  distance: number;
  nearest_test_id: string;
  nearest_same_fuel_test_id: string;
  model_fails_here: boolean;
  note: string;
}

export interface GapsFile {
  header: {
    headline: string;
    headline_holds: boolean;
    scope: string;
    not_a_prediction: string;
    region: string;
    distance: string;
    left_out: { test_id: string; reason: string }[];
    /** The designed batch of next tests (DOB-114). Absent in gap files written before it. */
    campaign?: Campaign;
  };
  rows: GapRow[];
}

/** One test of the designed batch: a gas condition, fuel left open. */
export interface BatchPick {
  pick: number;
  added_gas: string;
  x_added: number;
  x_o2: number;
  x_n2: number;
  pressure_atm: number;
  /** Its distance from the nearest test, real or picked earlier, when it was chosen. */
  gap_when_picked: number;
  /** The largest distance left anywhere in the region once it is flown. */
  largest_gap_after: number;
  mean_gap_after: number;
  nearest_test_id: string;
  model_fails_here: boolean;
  note: string;
}

/** The largest and the mean gap left in the region after `tests` tests of each plan. */
export interface BatchCurvePoint {
  tests: number;
  designed_batch: number;
  ranked_list: number;
  designed_batch_mean: number;
  ranked_list_mean: number;
}

export interface Campaign {
  method: string;
  why: string;
  fuel: string;
  not_a_prediction: string;
  n_conditions: number;
  default_tests: number;
  picks: BatchPick[];
  curve: BatchCurvePoint[];
}

// ---------------------------------------------------------------- the three gas groups

export type GasKey = "nitrogen" | "carbon_dioxide" | "helium";

export interface Gas {
  key: GasKey;
  label: string;
  /** Colour slot (--color-series-N) and mark shape: colour is never the only signal. */
  slot: number;
  shape: Shape;
}

/** Fixed order: the same gas keeps its colour and shape on every view. */
export const GASES: readonly Gas[] = [
  { key: "nitrogen", label: "Nitrogen only", slot: 1, shape: SHAPES[0] },
  { key: "carbon_dioxide", label: "With carbon dioxide", slot: 2, shape: SHAPES[1] },
  { key: "helium", label: "With helium", slot: 3, shape: SHAPES[2] },
];

const BY_LABEL: Record<string, GasKey> = {
  "nitrogen only": "nitrogen",
  none: "nitrogen",
  "with carbon dioxide": "carbon_dioxide",
  "carbon dioxide": "carbon_dioxide",
  "with helium": "helium",
  helium: "helium",
};

/** The gas group of a FLEX test's `gas_label` or a gap row's `added_gas`; null if unknown. */
export function gasOf(label: string): GasKey | null {
  return BY_LABEL[label.trim().toLowerCase()] ?? null;
}

export function gasInfo(key: GasKey): Gas {
  return GASES.find((gas) => gas.key === key)!;
}

// ---------------------------------------------------------------- the measured plot

/** How a FLEX test ended, as the table writes it, top row first. */
export const OUTCOMES = ["Extinction", "Disruption", "Completion"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_PLAIN: Record<Outcome, string> = {
  Extinction: "the flame went out with fuel left",
  Disruption: "the droplet broke up while burning",
  Completion: "the droplet burned away",
};

export interface OutcomePoint {
  test_id: string;
  fuel: string;
  gas: GasKey;
  outcome: Outcome;
  /** Oxygen as a mole fraction, as the FLEX table states it. */
  o2: number;
  pressure_atm: number | null;
  /** A fixed vertical offset inside the outcome's band, from -0.5 to 0.5, so dots do not hide each other. */
  jitter: number;
}

/**
 * A fixed spread for test n: the golden-ratio sequence gives evenly scattered offsets that do not
 * change between page loads (no random numbers).
 */
export function jitterFor(n: number): number {
  const golden = 0.6180339887498949;
  const frac = (n * golden) % 1;
  return Number((frac - 0.5).toFixed(4));
}

/**
 * The measured plot's dots: every FLEX test with an oxygen value, a known gas group and one of
 * the three outcomes. The engine's dropped test (114, 0 mmHg) is kept: the plot shows oxygen and
 * outcome only, which the table states for it. Returns the dots and how many tests were left out.
 */
export function outcomePoints(tests: FlexTest[]): { points: OutcomePoint[]; leftOut: number } {
  const points: OutcomePoint[] = [];
  for (const t of tests) {
    const gas = gasOf(t.gas_label);
    const outcome = OUTCOMES.find((o) => o === t.test_end);
    if (t.x_o2 === null || !Number.isFinite(t.x_o2) || gas === null || outcome === undefined) continue;
    points.push({
      test_id: t.test_id, fuel: t.fuel, gas, outcome, o2: t.x_o2,
      pressure_atm: t.pressure_atm, jitter: jitterFor(t.flex_test),
    });
  }
  return { points, leftOut: tests.length - points.length };
}

export interface GasSummary {
  gas: GasKey;
  tests: number;
  /** Highest oxygen mole fraction among the gas group's tests. */
  maxO2: number;
  /** The tests at that highest oxygen, in table order. */
  atMax: string[];
  outcomes: Record<Outcome, number>;
}

/** Per gas group: how many tests, the highest oxygen tested, and the outcome counts. */
export function gasSummaries(points: OutcomePoint[]): GasSummary[] {
  return GASES.map(({ key }) => {
    const own = points.filter((p) => p.gas === key);
    const maxO2 = own.length ? Math.max(...own.map((p) => p.o2)) : NaN;
    const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, own.filter((p) => p.outcome === o).length])) as Record<Outcome, number>;
    return {
      gas: key, tests: own.length, maxO2,
      atMax: own.filter((p) => p.o2 === maxO2).map((p) => p.test_id),
      outcomes,
    };
  });
}

/** Counts of tests in each outcome row and gas group, for the plot's table view. */
export function outcomeTable(points: OutcomePoint[]): { outcome: Outcome; counts: Record<GasKey, number>; total: number }[] {
  return OUTCOMES.map((outcome) => {
    const counts = Object.fromEntries(GASES.map(({ key }) => [key, 0])) as Record<GasKey, number>;
    for (const p of points) if (p.outcome === outcome) counts[p.gas] += 1;
    return { outcome, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  });
}

// ---------------------------------------------------------------- what works (DOB-140)
// The plain answer that opens the page: FLEX tests counted by oxygen band and added gas, and how
// many of them ended in "Extinction" (the flame went out with fuel left). Counts of table rows
// only: no model output. The tests in one box also differ in fuel, pressure and droplet size.

/** Oxygen bands in whole percent of the gas. A test sits in the band that holds its rounded oxygen. */
const O2_BAND_EDGES: readonly (readonly [number, number])[] = [[0, 15], [16, 18], [19, 21], [22, 25], [26, 100]];

/** The oxygen of air on Earth, in whole percent: the band that holds it is the reference column. */
const EARTH_AIR_O2 = 21;

export interface AnswerMark {
  test_id: string;
  /** The table's "Extinction": the flame went out with fuel left. */
  wentOut: boolean;
}

export interface AnswerBand {
  /** Lowest and highest oxygen among the band's tests, in whole percent. */
  minO2: number;
  maxO2: number;
  tests: number;
  /** "12 to 15%", from the tests in the band. */
  label: string;
  /** The band that holds the oxygen of air on Earth. */
  earthAir: boolean;
}

export interface AnswerCell {
  gas: GasKey;
  /** Index into Answer.bands. */
  band: number;
  /** One mark per test, the flames that went out first. Empty when the box was never tested. */
  marks: AnswerMark[];
  wentOut: number;
}

export interface Tally {
  wentOut: number;
  tests: number;
  /** The oxygen band's label. */
  band: string;
}

export interface Answer {
  bands: AnswerBand[];
  rows: { gas: GasKey; cells: AnswerCell[] }[];
  /** Nitrogen-only tests at the lowest and the highest oxygen band; null when either is empty. */
  oxygen: { low: Tally; high: Tally } | null;
  /** At the Earth-air band: each added gas, and nitrogen only for comparison. Null where a box is empty. */
  atAir: { nitrogen: Tally | null; carbon_dioxide: Tally | null; helium: Tally | null };
  /** The highest oxygen of any test with an added gas (mole fraction), or null when there is none. */
  addedGasMaxO2: number | null;
  /** Nitrogen-only tests above that oxygen. */
  nitrogenAbove: number;
}

/** The answer's numbers, counted from the FLEX tests the measured plot draws. */
export function answer(points: OutcomePoint[]): Answer {
  const pct = (p: OutcomePoint) => Math.round(p.o2 * 100);
  const filled = O2_BAND_EDGES.map(([from, to]) => points.filter((p) => pct(p) >= from && pct(p) <= to)).filter((own) => own.length > 0);
  const bands: AnswerBand[] = filled.map((own) => {
    const values = own.map(pct);
    const minO2 = Math.min(...values);
    const maxO2 = Math.max(...values);
    return {
      minO2, maxO2, tests: own.length,
      label: minO2 === maxO2 ? `${minO2}%` : `${minO2} to ${maxO2}%`,
      earthAir: minO2 <= EARTH_AIR_O2 && EARTH_AIR_O2 <= maxO2,
    };
  });
  const rows = GASES.map(({ key }) => ({
    gas: key,
    cells: filled.map((own, band): AnswerCell => {
      const mine = own.filter((p) => p.gas === key);
      const marks = mine.map((p) => ({ test_id: p.test_id, wentOut: p.outcome === "Extinction" }));
      return { gas: key, band, marks: [...marks.filter((m) => m.wentOut), ...marks.filter((m) => !m.wentOut)], wentOut: marks.filter((m) => m.wentOut).length };
    }),
  }));
  const tally = (cell: AnswerCell | undefined): Tally | null =>
    cell && cell.marks.length > 0 ? { wentOut: cell.wentOut, tests: cell.marks.length, band: bands[cell.band].label } : null;
  const row = (gas: GasKey) => rows.find((r) => r.gas === gas)!.cells;

  const tested = row("nitrogen").filter((cell) => cell.marks.length > 0);
  const low = tally(tested[0]);
  const high = tally(tested[tested.length - 1]);
  const air = bands.findIndex((band) => band.earthAir);
  const added = points.filter((p) => p.gas !== "nitrogen");
  const addedGasMaxO2 = added.length ? Math.max(...added.map((p) => p.o2)) : null;
  return {
    bands,
    rows,
    oxygen: low && high && tested.length > 1 ? { low, high } : null,
    atAir: {
      nitrogen: tally(row("nitrogen")[air]),
      carbon_dioxide: tally(row("carbon_dioxide")[air]),
      helium: tally(row("helium")[air]),
    },
    addedGasMaxO2,
    nitrogenAbove: addedGasMaxO2 === null ? 0 : points.filter((p) => p.gas === "nitrogen" && p.o2 > addedGasMaxO2).length,
  };
}

// ---------------------------------------------------------------- next test to fly

export interface GapGroup {
  gas: GasKey;
  /** The note the engine wrote for these cells (one per gas, sometimes split by level). */
  notes: string[];
  cells: number;
  /** The farthest cell from any real test (rank order: largest distance first). */
  farthest: GapRow;
}

/** The ranked cells, best first, as the engine ranked them. */
export function rankedGaps(file: GapsFile): GapRow[] {
  return [...file.rows].sort((a, b) => a.rank - b.rank);
}

/** One summary per gas group: how many cells, the engine's notes, and the farthest cell. */
export function gapGroups(file: GapsFile): GapGroup[] {
  const groups: GapGroup[] = [];
  for (const { key } of GASES) {
    const own = rankedGaps(file).filter((row) => gasOf(row.added_gas) === key);
    if (own.length === 0) continue;
    groups.push({ gas: key, notes: [...new Set(own.map((row) => row.note))], cells: own.length, farthest: own[0] });
  }
  return groups;
}

// ---------------------------------------------------------------- the designed batch (DOB-114)

export interface Batch {
  /** How many tests the engine proposes to fly together. */
  size: number;
  /** Those tests, in the order the engine picked them. */
  picks: BatchPick[];
  /** The engine's whole curve, from 0 tests on. */
  curve: BatchCurvePoint[];
  /** The largest gap in the region today, with no new test. */
  start: number;
  /** The largest gap left after the batch. */
  designed: number;
  /** The largest gap left after the same number of tests from the top of the ranked list. */
  ranked: number;
}

/**
 * The engine's designed batch at its own default size, or null when the gap file has none.
 * Every number is read from flex_gaps.json (header.campaign): nothing is computed here.
 */
export function designedBatch(file: GapsFile): Batch | null {
  const campaign = file.header.campaign;
  if (!campaign) return null;
  const size = campaign.default_tests;
  const picks = [...campaign.picks].sort((a, b) => a.pick - b.pick).slice(0, size);
  const curve = [...campaign.curve].sort((a, b) => a.tests - b.tests);
  const before = curve.find((point) => point.tests === 0);
  const after = curve.find((point) => point.tests === size);
  if (picks.length < size || !before || !after) return null;
  return { size, picks, curve, start: before.designed_batch, designed: after.designed_batch, ranked: after.ranked_list };
}

// ---------------------------------------------------------------- formatting

/** 0.25 -> "25%", 0.265 -> "26.5%". */
export function percent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(1))}%`;
}

/** The tests explorer's address for one test, so a dot or a row opens its PSI row. */
export function testHref(testId: string): string {
  return `/tests?test=${encodeURIComponent(testId)}`;
}

// ---------------------------------------------------------------- the model view (sliders)
// flex_grid.json: 13,152 slider positions computed by the engine. Each row holds fuel, oxygen,
// added gas and its share, pressure and droplet size, then the computed flame ceiling
// temperature, the heat-spreading speed, the predicted share of fuel burned (null when no real
// test is near), the "no test near" flag, the nearest real FLEX tests and the "model fails here"
// flag (every helium position).

export interface GridFile {
  header: {
    columns: string[];
    fitted_link_error_points: number;
    no_test_near: string;
    nearest: string;
    prediction: string;
    model_fails_here: { text: string; label: string };
  };
  rows: unknown[][];
}

export interface ChecksFile {
  checks: { id: string; result?: Record<string, unknown> }[];
}

export type GridGas = "none" | "carbon dioxide" | "helium";

export interface Selection {
  fuel: string;
  o2: number;
  gas: GridGas;
  added: number;
  pressure: number;
  d0: number;
}

export interface GridCell {
  temperatureK: number | null;
  sharePred: number | null;
  noTestNear: boolean;
  modelFails: boolean;
  nearest: { test_id: string; distance: number }[];
}

export interface GridAxes {
  fuels: string[];
  o2: number[];
  gases: GridGas[];
  /** Added-gas shares offered for each gas (just 0 for "none"). */
  added: Record<GridGas, number[]>;
  pressures: number[];
  d0: number[];
}

export interface Grid {
  axes: GridAxes;
  cells: Map<string, GridCell>;
  errorPoints: number;
}

function cellKey(s: Selection): string {
  return [s.fuel, s.o2.toFixed(2), s.gas, s.added.toFixed(2), s.pressure.toFixed(2), s.d0.toFixed(2)].join("|");
}

function sortedUnique(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/** Index the grid by its six inputs, and list the values each slider can take. */
export function indexGrid(file: GridFile): Grid {
  const col = (name: string) => {
    const i = file.header.columns.indexOf(name);
    if (i < 0) throw new Error(`flex_grid.json has no column ${name}`);
    return i;
  };
  const c = {
    fuel: col("fuel"), o2: col("x_o2"), gas: col("added_gas"), added: col("x_added"), p: col("pressure_atm"),
    d0: col("d0_mm"), t: col("ceiling_temperature_k"), share: col("share_burned_pred"), far: col("no_test_near"),
    nearest: col("nearest"), fails: col("model_fails_here"),
  };
  const cells = new Map<string, GridCell>();
  const co2: number[] = [];
  const he: number[] = [];
  for (const r of file.rows) {
    const sel: Selection = {
      fuel: String(r[c.fuel]), o2: Number(r[c.o2]), gas: r[c.gas] as GridGas,
      added: Number(r[c.added]), pressure: Number(r[c.p]), d0: Number(r[c.d0]),
    };
    if (sel.gas === "carbon dioxide") co2.push(sel.added);
    if (sel.gas === "helium") he.push(sel.added);
    cells.set(cellKey(sel), {
      temperatureK: r[c.t] === null ? null : Number(r[c.t]),
      sharePred: r[c.share] === null ? null : Number(r[c.share]),
      noTestNear: Boolean(r[c.far]),
      modelFails: Boolean(r[c.fails]),
      nearest: ((r[c.nearest] as [number, number][] | null) ?? []).map(([n, distance]) => ({ test_id: `PSI-69/${n}`, distance })),
    });
  }
  const values = (i: number) => sortedUnique(file.rows.map((r) => Number(r[i])));
  return {
    axes: {
      fuels: [...new Set(file.rows.map((r) => String(r[c.fuel])))].sort(),
      o2: values(c.o2),
      gases: ["none", "carbon dioxide", "helium"],
      added: { none: [0], "carbon dioxide": sortedUnique(co2), helium: sortedUnique(he) },
      pressures: values(c.p),
      d0: values(c.d0),
    },
    cells,
    errorPoints: file.header.fitted_link_error_points,
  };
}

/** The grid cell for a selection, or null where oxygen plus added gas would pass 100% (left out). */
export function lookup(grid: Grid, sel: Selection): GridCell | null {
  return grid.cells.get(cellKey({ ...sel, added: sel.gas === "none" ? 0 : sel.added })) ?? null;
}

/** When the gas changes, keep the added share if that gas offers it, else take its smallest. */
export function withGas(grid: Grid, sel: Selection, gas: GridGas): Selection {
  const options = grid.axes.added[gas];
  return { ...sel, gas, added: options.includes(sel.added) ? sel.added : options[0] };
}

/** The noise floor: how far apart near-identical real tests end, in points of fuel burned. */
export function noisePoints(checks: ChecksFile): number | null {
  const check = checks.checks.find((c) => c.id === "repeatability");
  const value = (check?.result as { median_points_apart?: number } | undefined)?.median_points_apart;
  return typeof value === "number" ? value : null;
}

/** The predicted share in percent, plus or minus the error, kept within 0 to 100. */
export function shareRange(share: number, errorPoints: number): { value: number; low: number; high: number } {
  const value = Math.round(share * 100);
  return { value, low: Math.max(0, Math.round(value - errorPoints)), high: Math.min(100, Math.round(value + errorPoints)) };
}

// ---------------------------------------------------------------- what would put it out here (DOB-141)
// For the mixture the sliders hold: how the predicted share burned changes along one lever, read
// from the same grid cells (flex_grid.json). Nothing is computed here: each point is a grid cell.
// A point has no share where the engine shows none (no real test near, helium). A mixture that
// cannot exist (oxygen plus gas above 100%) is not a point.

export interface CurvePoint {
  /** The lever's value at this point: the added share, or the oxygen (both as fractions). */
  x: number;
  /** The predicted share of the droplet burned, 0 to 1, or null where the engine shows none. */
  share: number | null;
  /** The slider position of this point. */
  sel: Selection;
}

export interface LeverCurve {
  points: CurvePoint[];
  /** Index of the sliders' own position on this curve, or -1 when it is not on it. */
  current: number;
  /** Index of the point the others are compared with. */
  baseline: number;
  /** The whole curve is at mixtures where the model fails (helium). */
  modelFails: boolean;
}

/** The point for a slider position, or null where there is no such mixture (oxygen plus gas above 100%). */
function curvePoint(grid: Grid, x: number, sel: Selection): CurvePoint | null {
  const cell = lookup(grid, sel);
  if (cell === null) return null;
  return { x, share: cell.modelFails || cell.noTestNear ? null : cell.sharePred, sel };
}

const existing = (points: (CurvePoint | null)[]): CurvePoint[] => points.filter((point): point is CurvePoint => point !== null);

/** Adding carbon dioxide at the sliders' fuel, oxygen, pressure and droplet size, from none upward. */
export function carbonDioxideCurve(grid: Grid, sel: Selection): LeverCurve {
  const shares = [0, ...grid.axes.added["carbon dioxide"].filter((share) => share > 0)];
  const points = existing(shares.map((x) => curvePoint(grid, x, { ...sel, gas: x === 0 ? "none" : "carbon dioxide", added: x })));
  const here = sel.gas === "none" ? 0 : sel.added;
  const current = sel.gas === "helium" ? -1 : points.findIndex((point) => point.x === here);
  return { points, current, baseline: points.findIndex((point) => point.x === 0), modelFails: false };
}

/** Changing the oxygen with everything else as the sliders hold it. */
export function oxygenCurve(grid: Grid, sel: Selection): LeverCurve {
  const points = existing(grid.axes.o2.map((x) => curvePoint(grid, x, { ...sel, o2: x })));
  const current = points.findIndex((point) => point.x === sel.o2);
  return { points, current, baseline: current, modelFails: sel.gas === "helium" };
}

export type LeverVerdict =
  /** The lowest predicted share along the lever is lower than the baseline by more than the model's error. */
  | { kind: "drop"; from: CurvePoint; to: CurvePoint }
  /** The lowest predicted share stays within the model's error of the baseline. */
  | { kind: "flat"; from: CurvePoint; to: CurvePoint }
  /** Nothing to compare: no prediction at the baseline, or none on the lever's side of it. */
  | { kind: "none" };

/**
 * What the lever does to the predicted share: compare the baseline with the lowest prediction among
 * `candidates` (indexes into the curve). A difference no larger than the engine's own error, in
 * points of fuel burned, is "flat".
 */
export function leverVerdict(curve: LeverCurve, candidates: number[], errorPoints: number): LeverVerdict {
  const from = curve.points[curve.baseline];
  if (!from || from.share === null) return { kind: "none" };
  let to: CurvePoint | null = null;
  for (const index of candidates) {
    const point = curve.points[index];
    if (point && point.share !== null && (to === null || point.share < to.share!)) to = point;
  }
  if (to === null) return { kind: "none" };
  return { kind: (from.share - to.share!) * 100 > errorPoints ? "drop" : "flat", from, to };
}

/** The candidates of each lever: more carbon dioxide than none, or less oxygen than now. */
export function carbonDioxideCandidates(curve: LeverCurve): number[] {
  return curve.points.map((_, index) => index).filter((index) => index > curve.baseline);
}
export function lowerOxygenCandidates(curve: LeverCurve): number[] {
  return curve.points.map((_, index) => index).filter((index) => index < curve.baseline);
}
