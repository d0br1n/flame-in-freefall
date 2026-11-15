import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FULL_SCENARIOS, QUICK_EXAMPLES, quickSentences } from "@/lib/scenarios/catalog";

const DATA = { o2Max: 0.4, moon: { inside: 0, stated: 274, psiIds: ["PSI-69"] } };

describe("the scenarios index", () => {
  it("leads with Artemis II and Apollo 1, each with its own page", () => {
    expect(FULL_SCENARIOS.map((scenario) => scenario.href)).toEqual(["/scenarios/artemis-2", "/scenarios/apollo-1"]);
  });

  it("writes each quick example as one sentence, numbers from the API", () => {
    const quick = quickSentences(DATA);
    expect(quick.map((item) => item.example.id)).toEqual(["apollo-13", "mir-1997", "moon-base"]);
    for (const item of quick) {
      expect(item.sentence.split(/[.!?](\s|$)/).filter((part) => part && part.trim()).length).toBe(1);
      expect(item.sentence).toContain("burnrate");
      expect(item.example.source.url).toMatch(/^https:\/\//);
    }
    expect(quick[0].sentence).toContain("above 40% oxygen");
    expect(quick[2].sentence).toContain("0 of 274");
    expect(quick[2].psiIds).toEqual(["PSI-69"]);
  });

  // DOB-158 (replaces the "would have done" wording test): the scenarios are thought experiments on
  // published data. They say what burnrate would have shown, never that it would have stopped,
  // prevented or decided anything.
  const overclaim = /would have (stopped|prevented|saved|put|told)|stops? the test|in seconds|tells the crew|from the first second/i;

  it("says what burnrate would have shown, and never claims it would have stopped or prevented an accident", () => {
    for (const scenario of FULL_SCENARIOS) expect(scenario.answer).not.toMatch(overclaim);
    for (const item of quickSentences(DATA)) {
      expect(item.sentence).toMatch(/burnrate (would have|already shows|shows)/);
      expect(item.sentence).not.toMatch(overclaim);
    }
  });

  it("keeps the same rule in every scenario file, and says they are thought experiments", () => {
    const dirs = [resolve(process.cwd(), "components", "scenarios"), resolve(process.cwd(), "lib", "scenarios")];
    const files = dirs.flatMap((dir) => readdirSync(dir).map((name) => resolve(dir, name)));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const hits = readFileSync(file, "utf8").split("\n").flatMap((line, i) => (overclaim.test(line) ? [`${file.split("/").pop()}:${i + 1}: ${line.trim()}`] : []));
      expect(hits).toEqual([]);
    }
    const index = readFileSync(resolve(process.cwd(), "components", "scenarios", "ScenariosIndex.tsx"), "utf8");
    expect(index).toContain("What burnrate would have shown");
    expect(index).toContain("thought experiment on the data NASA has published");
  });

  it("drops a quick example whose number the API did not give", () => {
    expect(quickSentences({ o2Max: null, moon: null }).map((item) => item.example.id)).toEqual(["mir-1997"]);
  });

  it("uses none of the wording the Apollo research says to avoid", () => {
    const text = [...FULL_SCENARIOS.flatMap((s) => [s.happened, s.answer]), ...quickSentences(DATA).map((q) => q.sentence)].join(" ").toLowerCase();
    for (const banned of ["explo", "burned alive", "burned to death", "frayed wire", "saves", "ai-powered"]) {
      expect(text).not.toContain(banned);
    }
    expect(QUICK_EXAMPLES.length).toBeGreaterThan(0);
  });
});
