// The pillar page's layout helpers (components/pillar/layout.ts): they only rearrange what an
// analysis hands over, so these tests check that nothing is lost or invented on the way.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { leadClause, pickStill, shareOf, splitSentences, testIdOfFile } from "@/components/pillar/layout";
import type { EngineModule, Finding } from "@/lib/types";

const MODULES = resolve(__dirname, "..", "..", "..", "..", "data", "modules");
const read = <T>(id: string, file: string): T => JSON.parse(readFileSync(resolve(MODULES, id, file), "utf8")) as T;

describe("splitSentences", () => {
  it("keeps every word of both real summaries: joined back with a space it is the summary", () => {
    for (const id of ["video-to-data", "flame-temperature"]) {
      const summary = read<EngineModule>(id, "module.json").summary;
      const parts = splitSentences(summary);
      expect(parts.length).toBeGreaterThan(1);
      expect(parts.join(" ")).toBe(summary.replace(/\s+/g, " ").trim());
    }
  });

  it("gives the page header one sentence and leaves the rest for the findings section", () => {
    for (const id of ["video-to-data", "flame-temperature"]) {
      const summary = read<EngineModule>(id, "module.json").summary;
      const [lead, ...rest] = splitSentences(summary);
      expect(summary.startsWith(lead)).toBe(true);
      expect(lead.endsWith(".")).toBe(true);
      expect(rest.length).toBeGreaterThan(0);
    }
  });

  it("does not split inside a number or a quotation that ends in a question mark", () => {
    expect(splitSentences('It ran 18.5 s. The question "Does it burn?", asked twice.')).toEqual([
      "It ran 18.5 s.",
      'The question "Does it burn?", asked twice.',
    ]);
  });
});

describe("pickStill", () => {
  it("picks the Video to Data engine's own frame of the first test, middle of the lit range", () => {
    const still = pickStill(read<EngineModule>("video-to-data", "module.json").files);
    expect(still?.name).toBe("PSI-25_B1_still2.jpg");
    expect(still?.kind).toBe("image");
  });

  it("gives nothing when the analysis hands over no still (the suppression test bench)", () => {
    expect(pickStill(read<EngineModule>("flame-temperature", "module.json").files)).toBeNull();
    expect(pickStill([{ name: "PSI-25_B1_kymograph.png", kind: "image", description: "" }])).toBeNull();
  });

  it("orders tests naturally (B2 before B10) and falls back to any still", () => {
    const files = [
      { name: "PSI-25_B10_still1.jpg", kind: "image", description: "" },
      { name: "PSI-25_B2_still3.jpg", kind: "image", description: "" },
    ];
    expect(pickStill(files)?.name).toBe("PSI-25_B2_still3.jpg");
  });
});

describe("testIdOfFile", () => {
  it("reads the site's test ID from an engine file name", () => {
    expect(testIdOfFile("PSI-25_B1_still2.jpg")).toBe("PSI-25/B1");
    expect(testIdOfFile("flex_tests.json")).toBeNull();
  });
});

describe("shareOf", () => {
  it("draws a bar only for a count of tests out of n, from the finding's own two numbers", () => {
    const findings = read<Finding[]>("video-to-data", "findings.json").filter((f) => f.kind === "headline");
    const shares = findings.map(shareOf);
    expect(shares.every(Boolean)).toBe(true);
    findings.forEach((finding, index) => expect(shares[index]).toEqual({ part: finding.value, total: finding.n }));
  });

  it("never draws a bar for temperatures, errors, fractions or impossible shares", () => {
    const suppress = read<Finding[]>("flame-temperature", "findings.json");
    for (const finding of suppress.filter((f) => f.unit !== "tests")) expect(shareOf(finding)).toBeNull();
    expect(shareOf({ value: 19, unit: "tests", n: 18 })).toBeNull();
    expect(shareOf({ value: 3, unit: "tests", n: 0 })).toBeNull();
    expect(shareOf({ value: "many", unit: "tests", n: 4 } as unknown as Finding)).toBeNull();
  });
});

describe("the header's opening clause", () => {
  it("keeps a sentence that fits whole", () => {
    expect(leadClause("Short sentence, with a comma.")).toBe("Short sentence, with a comma.");
  });

  it("cuts a long sentence at the last break that fits, words unchanged", () => {
    const [first] = splitSentences(read<EngineModule>("video-to-data", "module.json").summary);
    const lead = leadClause(first);
    expect(lead.length).toBeLessThanOrEqual(141);
    expect(first.startsWith(lead.slice(0, -1))).toBe(true);
    expect(lead.endsWith(".")).toBe(true);
  });

  it("returns a long sentence with no break whole", () => {
    const long = "word ".repeat(40).trim();
    expect(leadClause(long)).toBe(long);
  });
});
