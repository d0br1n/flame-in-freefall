import { describe, expect, it } from "vitest";
import { CANNOT_TELL, LINES_SHOWN, limitAnchor, matchesInvestigation, shownLines } from "@/components/limits/siteLimits";

describe("the site-wide limits", () => {
  it("are four lines, each with a source", () => {
    expect(CANNOT_TELL).toHaveLength(4);
    for (const line of CANNOT_TELL) {
      expect(line.text.length).toBeGreaterThan(20);
      expect(line.source).toMatch(/^(the challenge page|this site), /);
    }
  });

  it("keep the four statements", () => {
    const text = CANNOT_TELL.map((line) => line.text).join(" ");
    expect(text).toContain("PSI has no partial-gravity combustion data yet");
    expect(text).toContain("Moon or Mars");
    expect(text).toContain("Droplet tests do not show how a solid material or a cabin fire behaves");
    expect(text).toContain("No number here holds outside the oxygen levels, pressures and fuels that NASA tested");
    expect(text).toContain("Nothing here is a discovery");
  });

  it("use none of the banned words", () => {
    const text = CANNOT_TELL.map((line) => line.text).join(" ").toLowerCase();
    for (const banned of ["prove", "we discovered", "validated by", "experts agree", "ai-powered", "platform", "comprehensive"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("shownLines", () => {
  const lines = Array.from({ length: 14 }, (_, index) => `line ${index + 1}`);

  it("shows the first lines of a long list, and all of them when asked", () => {
    expect(shownLines(lines, false)).toEqual(lines.slice(0, LINES_SHOWN));
    expect(shownLines(lines, true)).toEqual(lines);
  });

  it("shows a short list whole", () => {
    expect(shownLines(lines.slice(0, LINES_SHOWN), false)).toHaveLength(LINES_SHOWN);
    expect(shownLines([], false)).toEqual([]);
  });
});

describe("matchesInvestigation", () => {
  const flex = { psi_id: "PSI-69", acronym: "FLEX", title: "Flame Extinguishment Experiment" };
  const noAcronym = { psi_id: "PSI-7", acronym: null, title: "Burning and Suppression of Solids" };

  it("matches everything when the search is empty", () => {
    expect(matchesInvestigation(flex, "")).toBe(true);
    expect(matchesInvestigation(noAcronym, "   ")).toBe(true);
  });

  it("matches the PSI ID, the acronym or the title, in any case", () => {
    expect(matchesInvestigation(flex, "psi-69")).toBe(true);
    expect(matchesInvestigation(flex, "69")).toBe(true);
    expect(matchesInvestigation(flex, "flex")).toBe(true);
    expect(matchesInvestigation(flex, "extinguishment")).toBe(true);
    expect(matchesInvestigation(noAcronym, "solids")).toBe(true);
  });

  it("needs every word of the search", () => {
    expect(matchesInvestigation(flex, "flame experiment")).toBe(true);
    expect(matchesInvestigation(flex, "flame solids")).toBe(false);
    expect(matchesInvestigation(noAcronym, "flex")).toBe(false);
  });
});

describe("limitAnchor", () => {
  it("never equals a section id of the page or the id other pages link to", () => {
    expect(limitAnchor("PSI-69")).toBe("limit-PSI-69");
    expect(limitAnchor("video-to-data")).toBe("limit-video-to-data");
    for (const section of ["site", "analyses", "investigations"]) {
      expect(limitAnchor(section)).not.toBe(section);
    }
  });
});
