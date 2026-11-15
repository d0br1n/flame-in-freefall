import { describe, expect, it } from "vitest";
import { StreamGrounder, answerBlocks, collectKnownIds, ground, hasNumber, hrefFor, safeCut, splitCitations } from "@/lib/assistant/ground";
import type { ToolResult } from "@/lib/assistant/types";

// The grounding check: a citation stays only if a tool result of the conversation named it.

const results: ToolResult[] = [
  {
    ok: true,
    from: "live",
    data: { rows: [{ test_id: "PSI-69/114", nearest_test_id: "PSI-39/1285#23" }], note: "see PSI-10 for the check" },
    sources: [
      { kind: "investigation", id: "PSI-69", label: "FLEX" },
      { kind: "test", id: "PSI-69/114" },
      { kind: "analysis", id: "flame-temperature", label: "Flame temperature", href: "/suppress", psi_ids: ["PSI-69", "PSI-10"] },
      { kind: "file", id: "flex_gaps.json" },
    ],
  },
  { ok: false, error: "Not found", sources: [] },
];
const known = collectKnownIds(results);

describe("collectKnownIds", () => {
  it("collects sources and the IDs written in the data", () => {
    expect([...known.investigations.keys()].sort()).toEqual(["PSI-10", "PSI-39", "PSI-69"]);
    expect(known.investigations.get("PSI-69")).toBe("FLEX");
    expect([...known.tests].sort()).toEqual(["PSI-39/1285#23", "PSI-69/114"]);
    expect(known.analyses.get("flame-temperature")).toEqual({ label: "Flame temperature", href: "/suppress", psi_ids: ["PSI-69", "PSI-10"] });
  });
});

describe("ground", () => {
  it("removes a fabricated citation and says so in one line", () => {
    const out = ground("FLEX burned droplets [PSI-69]. A made-up claim [PSI-999].", known);
    expect(out.removed).toEqual(["PSI-999"]);
    expect(out.text).toBe("FLEX burned droplets [PSI-69]. A made-up claim.\n\nOne reference could not be verified and was removed.");
    expect(out.sources).toEqual([
      { kind: "investigation", id: "PSI-69", label: "FLEX", href: "/investigations/PSI-69" },
      { kind: "analysis", id: "flame-temperature", label: "Flame temperature", href: "/suppress" },
    ]);
  });

  it("keeps the real IDs of a mixed bracket and counts several removals", () => {
    const out = ground("Both [PSI-69, PSI-998] and [PSI-997/1].", known);
    expect(out.text).toBe("Both [PSI-69] and.\n\n2 references could not be verified and were removed.");
    expect(out.removed).toEqual(["PSI-998", "PSI-997/1"]);
  });

  it("turns a real test citation into a test source that opens the tests explorer", () => {
    const out = ground("Test 114 states 0 mmHg [PSI-69/114]; nearest [PSI-39/1285#23].", known);
    expect(out.removed).toEqual([]);
    expect(out.sources).toEqual([
      { kind: "test", id: "PSI-69/114", label: "FLEX", href: "/tests?test=PSI-69%2F114" },
      { kind: "test", id: "PSI-39/1285#23", label: "PSI-39", href: "/tests?test=PSI-39%2F1285%2323" },
      { kind: "analysis", id: "flame-temperature", label: "Flame temperature", href: "/suppress" },
    ]);
  });

  it("lists no source that is not cited, and leaves brackets without PSI IDs alone", () => {
    const out = ground("Nothing cited here [see note].", known);
    expect(out.sources).toEqual([]);
    expect(out.text).toBe("Nothing cited here [see note].");
  });

  it("with no tool results, every citation is removed", () => {
    const out = ground("A claim [PSI-69].", collectKnownIds([]));
    expect(out.removed).toEqual(["PSI-69"]);
    expect(out.sources).toEqual([]);
  });
});

describe("rendering helpers", () => {
  it("splits a line into text and citation chips", () => {
    expect(splitCitations("FLEX [PSI-69, PSI-39] and [PSI-69/114].")).toEqual([
      { type: "text", text: "FLEX " },
      { type: "cite", ids: ["PSI-69", "PSI-39"] },
      { type: "text", text: " and " },
      { type: "cite", ids: ["PSI-69/114"] },
      { type: "text", text: "." },
    ]);
    expect(splitCitations("no citations")).toEqual([{ type: "text", text: "no citations" }]);
  });

  it("reads paragraphs and '- ' lists", () => {
    expect(answerBlocks("Intro line\n- one\n- two\n\nAfter.")).toEqual([
      { kind: "p", lines: ["Intro line"] },
      { kind: "list", items: ["one", "two"] },
      { kind: "p", lines: ["After."] },
    ]);
  });

  it("links into the site", () => {
    expect(hrefFor("investigation", "PSI-25")).toBe("/investigations/PSI-25");
    expect(hrefFor("test", "PSI-25/B1")).toBe("/tests?test=PSI-25%2FB1");
  });

  it("finds numbers outside citations only", () => {
    expect(hasNumber("No numbers [PSI-69].")).toBe(false);
    expect(hasNumber("It ran 274 tests.")).toBe(true);
  });
});

describe("StreamGrounder", () => {
  it("never lets an unverified citation out, whatever the chunk boundaries", () => {
    const answer = "FLEX [PSI-69] and a made-up one [PSI-999]. Test [PSI-69/114].";
    for (const size of [1, 2, 3, 7, 50]) {
      const grounder = new StreamGrounder(known);
      const pieces: string[] = [];
      for (let i = 0; i < answer.length; i += size) pieces.push(grounder.push(answer.slice(i, i + size)));
      pieces.push(grounder.end());
      expect(pieces.join(""), `chunk size ${size}`).toBe("FLEX [PSI-69] and a made-up one. Test [PSI-69/114].");
      expect(pieces.some((p) => p.includes("999"))).toBe(false);
      expect(grounder.cited).toEqual(["PSI-69", "PSI-69/114"]);
      expect(grounder.removed).toEqual(["PSI-999"]);
    }
  });

  it("holds text only from an open bracket, and not across a line", () => {
    expect(safeCut("Text [PSI-6")).toBe(4);
    expect(safeCut("Text [PSI-69] done")).toBe(18);
    expect(safeCut("Text [note\nmore")).toBe(15);
    expect(safeCut("trailing  ")).toBe(8);
  });
});
