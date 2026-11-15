import { describe, expect, it } from "vitest";
import {
  HOME_STAGES,
  PART_LABEL,
  RANK_PARTS,
  barWidth,
  evidenceText,
  partSummary,
  partValue,
  rankPath,
  scoreText,
  weightsText,
} from "@/lib/home";

describe("the ranking request", () => {
  it("asks for the chosen air, and for nothing while the air is unknown", () => {
    expect(rankPath("station")).toBe("/catalog/rank?air=station");
    expect(rankPath("intermediate_26_5")).toBe("/catalog/rank?air=intermediate_26_5");
    expect(rankPath("a b&c")).toBe("/catalog/rank?air=a%20b%26c");
    expect(rankPath(null)).toBeNull();
    expect(rankPath("")).toBeNull();
  });

  it("asks exactly two questions: spread and suppress (no alarm)", () => {
    expect(HOME_STAGES).toEqual(["spread", "suppress"]);
  });
});

describe("the parts of a score", () => {
  it("has a label for each of the four parts, in the formula's order", () => {
    expect(RANK_PARTS).toEqual(["pillar", "evidence", "data", "fuel"]);
    for (const key of RANK_PARTS) expect(PART_LABEL[key]).toMatch(/^[A-Z]/);
  });

  it("draws a bar as wide as its score, clamped to 0 to 100%", () => {
    expect(barWidth(0)).toBe("0%");
    expect(barWidth(0.1788)).toBe("17.9%");
    expect(barWidth(1)).toBe("100%");
    expect(barWidth(1.4)).toBe("100%");
    expect(barWidth(-0.2)).toBe("0%");
    expect(barWidth(Number.NaN)).toBe("0%");
  });

  it("writes scores with two decimals", () => {
    expect(scoreText(0.75)).toBe("0.75");
    expect(scoreText(1)).toBe("1.00");
    expect(scoreText(0.12345)).toBe("0.12");
  });

  it("writes the evidence part as counts, or 'not stated' when no table states the air", () => {
    expect(evidenceText({ inside: 49, stated: 274 })).toBe("49 of 274");
    expect(evidenceText({ inside: 0, stated: 1290 })).toBe("0 of 1,290");
    expect(evidenceText({ inside: null, stated: 0 })).toBe("not stated");
    expect(partValue("evidence", { score: 0, inside: null, stated: 0 })).toBe("not stated");
    expect(partValue("evidence", { score: 0.1788, inside: 49, stated: 274 })).toBe("49 of 274");
    expect(partValue("fuel", { score: 0.5 })).toBe("0.50");
  });

  it("gives a screen reader the number, never the bar alone", () => {
    expect(partSummary("evidence", { score: 0.1788, inside: 49, stated: 274 })).toBe(
      "Tests in this air: 49 of 274, score 0.18 of 1.",
    );
    expect(partSummary("data", { score: 1 })).toBe("Data in PSI: 1.00 of 1.");
  });

  it("lists the weights in the formula's order", () => {
    expect(weightsText({ pillar: 0.25, evidence: 0.25, data: 0.25, fuel: 0.25 })).toBe(
      "pillar 0.25, evidence 0.25, data 0.25, fuel 0.25",
    );
  });
});
