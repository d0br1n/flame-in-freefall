import { describe, expect, it } from "vitest";
import { airName, checkVerdict, chooseEngine, coverageSentence, sortEvidence, stageLabel, testCount } from "@/lib/pillar";
import type { Evidence, ModuleSummary } from "@/lib/types";

const row = (id: string, status: ModuleSummary["status"], stage?: ModuleSummary["stage"]): ModuleSummary => ({ id, status, stage });

describe("the analysis for a stage", () => {
  it("prefers built over example over not built", () => {
    const rows = [row("a", "not_built", "spread"), row("b", "example", "spread"), row("c", "built", "spread")];
    expect(chooseEngine(rows, "spread")?.id).toBe("c");
    expect(chooseEngine(rows.slice(0, 2), "spread")?.id).toBe("b");
    expect(chooseEngine(rows.slice(0, 1), "spread")?.status).toBe("not_built");
  });

  it("uses the mock analysis last, and only when nothing else answers the stage", () => {
    expect(chooseEngine([row("_mock", "example", "spread"), row("video-to-data", "example", "spread")], "spread")?.id).toBe(
      "video-to-data",
    );
    expect(chooseEngine([row("_mock", "example", "spread"), row("x", "not_built", "spread")], "spread")?.id).toBe("x");
    expect(chooseEngine([row("_mock", "example", "spread")], "spread")?.id).toBe("_mock");
  });

  it("ignores other stages and rows without a stage", () => {
    const rows = [row("ft", "built", "suppress"), row("broken", "not_built")];
    expect(chooseEngine(rows, "spread")).toBeNull();
    expect(chooseEngine(rows, "suppress")?.id).toBe("ft");
    expect(chooseEngine([], "suppress")).toBeNull();
  });
});

describe("page names", () => {
  it("takes the stage's name from the navigation", () => {
    expect(stageLabel("spread")).toBe("Video to Data");
    expect(stageLabel("detect")).toBe("Detection");
    expect(stageLabel("suppress")).toBe("Suppression test bench");
  });
});

describe("check wording", () => {
  it("says passed or failed for a built analysis", () => {
    expect(checkVerdict(true, "built")).toEqual({ word: "passed", tone: "ok" });
    expect(checkVerdict(false, "built")).toEqual({ word: "failed", tone: "danger" });
  });

  it("says 'being measured', never 'failed', for an example analysis", () => {
    expect(checkVerdict(false, "example").word).toBe("being measured");
    expect(checkVerdict(true, "example").word).toBe("passed");
    expect(checkVerdict(undefined, "built").word).toBe("being measured");
  });

  it("says 'being measured' for a built analysis whose check ran zero comparisons", () => {
    expect(checkVerdict(false, "built", { value: 0, unit: "comparisons" }).word).toBe("being measured");
    expect(checkVerdict(false, "built", { value: 5, unit: "comparisons" }).word).toBe("failed");
    expect(checkVerdict(false, "built", { value: 2.5, unit: "px/s" }).word).toBe("failed");
  });
});

describe("cabin air coverage in words", () => {
  it("counts the tests inside the air", () => {
    expect(coverageSentence({ status: "tested", inside: 49, stated: 274, investigations: [] })).toBe(
      "49 of 274 tests of this stage ran inside this air.",
    );
  });

  it("says never tested, with the number of tests", () => {
    expect(coverageSentence({ status: "never_tested", inside: 0, stated: 1, investigations: [] })).toBe(
      "Never tested in this air: none of the 1 test of this stage ran inside it.",
    );
  });

  it("says when the tables do not state the air, and nothing when the backend is silent", () => {
    expect(coverageSentence({ status: "not_stated", inside: null, stated: 0, investigations: [] })).toMatch(
      /do not state oxygen or pressure/,
    );
    expect(coverageSentence(null)).toBeNull();
  });

  it("names the air with its plain words", () => {
    expect(airName({ label: "Station cabin", plain: "About 21% oxygen" })).toBe("Station cabin (About 21% oxygen)");
  });
});

describe("evidence table order", () => {
  const ev = (id: string, test_id: string) => ({ id, test_id }) as Evidence;

  it("groups by test in natural order and keeps file order within a test", () => {
    const sorted = sortEvidence([ev("a", "PSI-69/10"), ev("b", "PSI-69/2"), ev("c", "PSI-69/10"), ev("d", "PSI-69/2")]);
    expect(sorted.map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
    expect(testCount(sorted)).toBe(2);
  });
});
