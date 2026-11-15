// Tests for lib/suppress.ts (Linear DOB-87), on the flame temperature engine's committed files.
// The counts are the ones in the FLEX table (PSI-69) and research/judge-pivot-2026-11-14.md.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GASES,
  answer,
  carbonDioxideCandidates,
  carbonDioxideCurve,
  designedBatch,
  leverVerdict,
  lowerOxygenCandidates,
  oxygenCurve,
  OUTCOMES,
  OUTCOME_PLAIN,
  engineFilePath,
  gapGroups,
  gasOf,
  gasSummaries,
  indexGrid,
  jitterFor,
  lookup,
  noisePoints,
  outcomePoints,
  outcomeTable,
  percent,
  rankedGaps,
  shareRange,
  testHref,
  withGas,
  type ChecksFile,
  type FlexTestsFile,
  type GapsFile,
  type GridFile,
  type Selection,
} from "@/lib/suppress";

const engine = new URL("../../../../data/modules/flame-temperature/", import.meta.url);
const flex: FlexTestsFile = JSON.parse(readFileSync(new URL("flex_tests.json", engine), "utf8"));
const gaps: GapsFile = JSON.parse(readFileSync(new URL("flex_gaps.json", engine), "utf8"));

describe("gas groups", () => {
  it("reads both files' labels into three fixed groups", () => {
    expect(gasOf("nitrogen only")).toBe("nitrogen");
    expect(gasOf("none")).toBe("nitrogen");
    expect(gasOf("with carbon dioxide")).toBe("carbon_dioxide");
    expect(gasOf("carbon dioxide")).toBe("carbon_dioxide");
    expect(gasOf("With Helium")).toBe("helium");
    expect(gasOf("argon")).toBeNull();
  });

  it("gives each group its own colour slot and shape", () => {
    expect(new Set(GASES.map((g) => g.slot)).size).toBe(3);
    expect(new Set(GASES.map((g) => g.shape)).size).toBe(3);
  });
});

describe("measured plot", () => {
  const { points, leftOut } = outcomePoints(flex.tests);

  it("plots every FLEX test (274), none left out", () => {
    expect(points).toHaveLength(274);
    expect(leftOut).toBe(0);
  });

  it("matches the FLEX table's outcome counts", () => {
    const rows = outcomeTable(points);
    expect(rows.map((r) => r.outcome)).toEqual([...OUTCOMES]);
    expect(Object.fromEntries(rows.map((r) => [r.outcome, r.total]))).toEqual({ Extinction: 186, Disruption: 61, Completion: 27 });
  });

  it("finds the headline: no diluted FLEX test above 25% oxygen, nitrogen-only up to 34%", () => {
    const byGas = Object.fromEntries(gasSummaries(points).map((s) => [s.gas, s]));
    expect(byGas.nitrogen.tests).toBe(101);
    expect(byGas.carbon_dioxide.tests).toBe(123);
    expect(byGas.helium.tests).toBe(50);
    expect(byGas.nitrogen.maxO2).toBe(0.34);
    expect(byGas.carbon_dioxide.maxO2).toBe(0.25);
    expect(byGas.helium.maxO2).toBe(0.24);
    expect(byGas.carbon_dioxide.atMax).toEqual(["PSI-69/88", "PSI-69/89", "PSI-69/90", "PSI-69/91", "PSI-69/92", "PSI-69/93"]);
  });

  it("explains each outcome in a few plain words", () => {
    for (const outcome of OUTCOMES) {
      expect(OUTCOME_PLAIN[outcome].length).toBeGreaterThan(0);
      expect(OUTCOME_PLAIN[outcome].split(" ").length).toBeLessThanOrEqual(8);
    }
    expect(Object.keys(OUTCOME_PLAIN).sort()).toEqual([...OUTCOMES].sort());
  });

  it("spreads dots the same way on every load, inside the band", () => {
    expect(jitterFor(7)).toBe(jitterFor(7));
    for (let n = 1; n <= 300; n += 1) {
      expect(Math.abs(jitterFor(n))).toBeLessThanOrEqual(0.5);
    }
    expect(new Set(points.map((p) => p.jitter)).size).toBeGreaterThan(200);
  });
});

describe("next test to fly", () => {
  it("keeps the engine's ranking", () => {
    const ranked = rankedGaps(gaps);
    expect(ranked).toHaveLength(232);
    expect(ranked.map((r) => r.rank)).toEqual(ranked.map((_, i) => i + 1));
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1].distance).toBeGreaterThanOrEqual(ranked[i].distance);
    }
  });

  it("groups the cells by gas with the engine's own notes", () => {
    const groups = Object.fromEntries(gapGroups(gaps).map((g) => [g.gas, g]));
    expect(groups.carbon_dioxide.cells).toBe(132);
    expect(groups.helium.cells).toBe(90);
    expect(groups.nitrogen.cells).toBe(10);
    expect(groups.carbon_dioxide.notes[0]).toContain("never tested in PSI's droplet tables");
    expect(groups.helium.farthest.model_fails_here).toBe(true);
  });

  it("carries the engine's headline, which its own check says holds", () => {
    expect(gaps.header.headline_holds).toBe(true);
    expect(gaps.header.headline).toContain("no diluted test sits above 25% oxygen");
  });
});

describe("the designed batch of next tests (DOB-114)", () => {
  it("takes the engine's first picks, in the engine's order, at the engine's own batch size", () => {
    const batch = designedBatch(gaps);
    expect(batch).not.toBeNull();
    expect(batch!.size).toBe(6);
    expect(batch!.picks.map((p) => p.pick)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(batch!.picks[0]).toMatchObject({ added_gas: "carbon dioxide", x_added: 0.65, x_o2: 0.34, pressure_atm: 0.7 });
    for (const pick of batch!.picks) expect(pick.nearest_test_id).toMatch(/^PSI-69\//);
    // Helium picks carry the engine's flag: the fitted link fails there.
    expect(batch!.picks.filter((p) => p.model_fails_here).map((p) => p.added_gas)).toEqual(["helium", "helium", "helium"]);
  });

  it("reads the largest gap before, after the batch, and after the same number from the ranked list", () => {
    const batch = designedBatch(gaps)!;
    expect(batch.start).toBe(0.757);
    expect(batch.designed).toBe(0.24);
    expect(batch.ranked).toBe(0.445);
    // The last pick's own record says the same thing as the curve.
    expect(batch.picks[batch.size - 1].largest_gap_after).toBe(batch.designed);
  });

  it("keeps the engine's whole curve: the batch never leaves a larger gap than the ranked list", () => {
    const { curve } = designedBatch(gaps)!;
    expect(curve.map((p) => p.tests)).toEqual(curve.map((_, i) => i));
    expect(curve[0].designed_batch).toBe(curve[0].ranked_list);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i].designed_batch).toBeLessThanOrEqual(curve[i - 1].designed_batch);
      expect(curve[i].designed_batch).toBeLessThanOrEqual(curve[i].ranked_list);
    }
  });

  it("is absent, not invented, when the gap file has no batch", () => {
    const header = { ...gaps.header };
    delete header.campaign;
    expect(designedBatch({ header, rows: gaps.rows })).toBeNull();
    expect(designedBatch({ header: { ...header, campaign: { ...gaps.header.campaign!, picks: [] } }, rows: gaps.rows })).toBeNull();
  });
});

describe("formatting and links", () => {
  it("formats mole fractions as percent", () => {
    expect(percent(0.25)).toBe("25%");
    expect(percent(0.265)).toBe("26.5%");
  });

  it("builds the backend and explorer addresses", () => {
    expect(engineFilePath("flex_gaps.json")).toBe("/modules/flame-temperature/files/flex_gaps.json");
    expect(testHref("PSI-69/114")).toBe("/tests?test=PSI-69%2F114");
  });
});

describe("model view (sliders)", () => {
  const grid = indexGrid(JSON.parse(readFileSync(new URL("flex_grid.json", engine), "utf8")) as GridFile);
  const checks = JSON.parse(readFileSync(new URL("flex_checks.json", engine), "utf8")) as ChecksFile;
  const air: Selection = { fuel: "Methanol", o2: 0.21, gas: "none", added: 0, pressure: 1.0, d0: 2.53 };

  it("indexes every grid row and lists the slider values", () => {
    expect(grid.cells.size).toBe(13152);
    expect(grid.axes.fuels).toEqual(["Heptane", "Methanol"]);
    expect(grid.axes.o2[0]).toBe(0.12);
    expect(grid.axes.o2.at(-1)).toBe(0.34);
    expect(grid.axes.added.helium.at(-1)).toBe(0.45);
    expect(grid.axes.added["carbon dioxide"].at(-1)).toBe(0.7);
    expect(grid.axes.pressures).toEqual([0.7, 1]);
    expect(grid.axes.d0).toHaveLength(6);
  });

  it("finds normal air with a temperature, a prediction and nearest real tests", () => {
    const cell = lookup(grid, air)!;
    expect(cell.temperatureK).toBeGreaterThan(2000);
    expect(cell.sharePred).not.toBeNull();
    expect(cell.nearest.length).toBeGreaterThan(0);
    expect(cell.nearest[0].test_id).toMatch(/^PSI-69\/\d+$/);
  });

  it("marks every helium position as a place where the model fails", () => {
    const helium = [...grid.cells.entries()].filter(([k]) => k.includes("|helium|"));
    expect(helium.length).toBeGreaterThan(0);
    expect(helium.every(([, cell]) => cell.modelFails)).toBe(true);
    expect(lookup(grid, withGas(grid, air, "helium"))!.modelFails).toBe(true);
  });

  it("gives no prediction where no real test is near", () => {
    const far = [...grid.cells.values()].filter((cell) => cell.noTestNear);
    expect(far).toHaveLength(3099);
    expect(far.every((cell) => cell.sharePred === null)).toBe(true);
  });

  it("has no cell where oxygen plus added gas passes 100%", () => {
    expect(lookup(grid, { ...air, o2: 0.34, gas: "carbon dioxide", added: 0.7 })).toBeNull();
  });

  it("keeps the added share when switching gas only if that gas offers it", () => {
    expect(withGas(grid, { ...air, gas: "carbon dioxide", added: 0.6 }, "helium").added).toBe(0.05);
    expect(withGas(grid, { ...air, gas: "carbon dioxide", added: 0.3 }, "helium").added).toBe(0.3);
    expect(withGas(grid, { ...air, gas: "helium", added: 0.3 }, "none").added).toBe(0);
  });

  it("reads the error and the noise floor from the engine's own checks", () => {
    expect(grid.errorPoints).toBe(12.7);
    expect(noisePoints(checks)).toBe(7.1);
    expect(shareRange(0.431, 12.7)).toEqual({ value: 43, low: 30, high: 56 });
    expect(shareRange(0.05, 12.7)).toEqual({ value: 5, low: 0, high: 18 });
    expect(shareRange(0.97, 12.7)).toEqual({ value: 97, low: 84, high: 100 });
  });
});

describe("what works (DOB-140)", () => {
  const { points } = outcomePoints(flex.tests);
  const a = answer(points);
  const cell = (gas: string, band: string) => a.rows.find((r) => r.gas === gas)!.cells[a.bands.findIndex((b) => b.label === band)];

  it("puts every FLEX test in one oxygen band, labelled from the tests", () => {
    expect(a.bands.map((b) => b.label)).toEqual(["12 to 15%", "16 to 18%", "19 to 21%", "23 to 25%", "30 to 34%"]);
    expect(a.bands.reduce((sum, b) => sum + b.tests, 0)).toBe(274);
    expect(a.rows.flatMap((r) => r.cells).reduce((sum, c) => sum + c.marks.length, 0)).toBe(274);
    expect(a.bands.filter((b) => b.earthAir).map((b) => b.label)).toEqual(["19 to 21%"]);
  });

  it("counts the flames that went out as the table's Extinction rows (186)", () => {
    expect(a.rows.flatMap((r) => r.cells).reduce((sum, c) => sum + c.wentOut, 0)).toBe(186);
    const raw = (gas: string, from: number, to: number) =>
      flex.tests.filter((t) => t.gas_label === gas && Math.round(t.x_o2! * 100) >= from && Math.round(t.x_o2! * 100) <= to);
    const low = raw("nitrogen only", 0, 15);
    expect(cell("nitrogen", "12 to 15%").marks).toHaveLength(low.length);
    expect(cell("nitrogen", "12 to 15%").wentOut).toBe(low.filter((t) => t.test_end === "Extinction").length);
  });

  it("lists the flames that went out first in each box", () => {
    for (const c of a.rows.flatMap((r) => r.cells)) {
      expect(c.marks.map((m) => m.wentOut)).toEqual([...Array(c.wentOut).fill(true), ...Array(c.marks.length - c.wentOut).fill(false)]);
    }
  });

  it("states the oxygen lever from the nitrogen-only tests", () => {
    expect(a.oxygen).toEqual({ low: { wentOut: 30, tests: 33, band: "12 to 15%" }, high: { wentOut: 2, tests: 24, band: "30 to 34%" } });
  });

  it("states the added gases at the oxygen of Earth air", () => {
    expect(a.atAir.nitrogen).toEqual({ wentOut: 17, tests: 34, band: "19 to 21%" });
    expect(a.atAir.carbon_dioxide).toEqual({ wentOut: 32, tests: 41, band: "19 to 21%" });
    expect(a.atAir.helium).toEqual({ wentOut: 14, tests: 16, band: "19 to 21%" });
  });

  it("finds no added-gas test above 25% oxygen", () => {
    expect(a.addedGasMaxO2).toBe(0.25);
    expect(a.nitrogenAbove).toBe(24);
    expect(cell("carbon_dioxide", "30 to 34%").marks).toHaveLength(0);
    expect(cell("helium", "30 to 34%").marks).toHaveLength(0);
  });

  it("says nothing where the data is missing", () => {
    const none = answer([]);
    expect(none.bands).toEqual([]);
    expect(none.oxygen).toBeNull();
    expect(none.atAir).toEqual({ nitrogen: null, carbon_dioxide: null, helium: null });
    expect(none.addedGasMaxO2).toBeNull();
  });
});

describe("what would put it out here (DOB-141)", () => {
  const file: GridFile = JSON.parse(readFileSync(new URL("flex_grid.json", engine), "utf8"));
  const grid = indexGrid(file);
  const air: Selection = { fuel: "Heptane", o2: 0.21, gas: "none", added: 0, pressure: 1, d0: 3.24 };

  it("reads the carbon dioxide curve from the grid's own cells, starting with none", () => {
    const curve = carbonDioxideCurve(grid, air);
    expect(curve.points.map((p) => p.x)).toEqual([0, ...grid.axes.added["carbon dioxide"]]);
    expect(curve.baseline).toBe(0);
    expect(curve.current).toBe(0);
    for (const point of curve.points) {
      const cell = lookup(grid, point.sel);
      expect(point.share).toBe(cell!.noTestNear ? null : cell!.sharePred);
    }
    expect(carbonDioxideCurve(grid, { ...air, gas: "carbon dioxide", added: 0.35 }).current).toBe(curve.points.findIndex((p) => p.x === 0.35));
    expect(carbonDioxideCurve(grid, { ...air, gas: "helium", added: 0.2 }).current).toBe(-1);
  });

  it("says carbon dioxide lowers the predicted burn of heptane in station air", () => {
    const curve = carbonDioxideCurve(grid, air);
    const verdict = leverVerdict(curve, carbonDioxideCandidates(curve), grid.errorPoints);
    expect(verdict.kind).toBe("drop");
    if (verdict.kind !== "drop") return;
    expect(verdict.from.share).toBe(lookup(grid, air)!.sharePred);
    expect(verdict.to.share).toBe(Math.min(...curve.points.slice(1).flatMap((p) => (p.share === null ? [] : [p.share]))));
    expect((verdict.from.share! - verdict.to.share!) * 100).toBeGreaterThan(grid.errorPoints);
  });

  it("calls a change inside the model's error flat", () => {
    const curve = carbonDioxideCurve(grid, { ...air, o2: 0.34, pressure: 0.7 });
    const verdict = leverVerdict(curve, carbonDioxideCandidates(curve), grid.errorPoints);
    expect(verdict.kind).toBe("flat");
  });

  it("leaves out mixtures that cannot exist (oxygen plus gas above 100%)", () => {
    const curve = carbonDioxideCurve(grid, { ...air, o2: 0.34, pressure: 0.7 });
    expect(curve.points.length).toBeLessThan(grid.axes.added["carbon dioxide"].length + 1);
    expect(curve.points.every((p) => 0.34 + p.x <= 1)).toBe(true);
    expect(curve.points.every((p) => lookup(grid, p.sel) !== null)).toBe(true);
    const oxygen = oxygenCurve(grid, { ...air, gas: "carbon dioxide", added: 0.7 });
    expect(oxygen.points.every((p) => p.x + 0.7 <= 1)).toBe(true);
  });

  it("reads the oxygen curve around the sliders' own position", () => {
    const curve = oxygenCurve(grid, air);
    expect(curve.points.map((p) => p.x)).toEqual(grid.axes.o2);
    expect(curve.points[curve.current].x).toBe(0.21);
    expect(lowerOxygenCandidates(curve).every((i) => curve.points[i].x < 0.21)).toBe(true);
    expect(leverVerdict(curve, lowerOxygenCandidates(curve), grid.errorPoints).kind).toBe("drop");
    const lowest = oxygenCurve(grid, { ...air, o2: grid.axes.o2[0] });
    expect(leverVerdict(lowest, lowerOxygenCandidates(lowest), grid.errorPoints)).toEqual({ kind: "none" });
  });

  it("shows no share where the model fails (helium)", () => {
    const curve = oxygenCurve(grid, { ...air, gas: "helium", added: 0.2 });
    expect(curve.modelFails).toBe(true);
    expect(curve.points.every((p) => p.share === null)).toBe(true);
    expect(leverVerdict(curve, lowerOxygenCandidates(curve), grid.errorPoints)).toEqual({ kind: "none" });
  });
});
