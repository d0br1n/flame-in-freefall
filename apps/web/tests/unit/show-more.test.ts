import { describe, expect, it } from "vitest";
import { cutText } from "@/lib/format";

describe("cutText", () => {
  it("does not cut short text", () => {
    expect(cutText("short text", 100)).toBeNull();
    expect(cutText("a".repeat(150), 100)).toBeNull();
  });

  it("cuts long text at a word and marks the cut", () => {
    const text = "word ".repeat(200).trim();
    const cut = cutText(text, 100) as string;
    expect(cut.endsWith("word…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(101);
  });
});
