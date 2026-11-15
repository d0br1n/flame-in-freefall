import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTE_POINTS, PITFALLS } from "@/lib/giveBack";

// DOB-160: every pitfall on the About page restates the team's note for the PSI team. If the note
// changes, or a line here says more than the note, this goes red.
const note = readFileSync(resolve(process.cwd(), "..", "..", "submission", "PSI_DATA_NOTE.md"), "utf8");

describe("what we give back: the PSI data pitfalls", () => {
  it("lists the five the team named, each under its PSI ID", () => {
    expect(PITFALLS.map((item) => item.psiId)).toEqual(["PSI-69", "PSI-69", "PSI-159", "PSI-100", "PSI-101"]);
    for (const item of PITFALLS) expect(note).toContain(item.psiId);
  });

  it("every line rests on words that are in the note", () => {
    for (const item of PITFALLS) {
      expect(item.proof.length).toBeGreaterThan(0);
      for (const words of item.proof) expect(note, `${item.psiId}: "${words}"`).toContain(words);
    }
  });

  it("every number in a line is in the note too", () => {
    for (const item of PITFALLS) {
      for (const number of item.text.match(/−?\d[\d,]*(?:\.\d+)?|0x[0-9a-f]+/gi) ?? []) {
        expect(note, `${item.psiId}: ${number}`).toContain(number);
      }
    }
  });

  it("counts the note's points as the note numbers them", () => {
    const rows = note.split("\n").filter((line) => /^\| \d+ \|/.test(line));
    expect(rows.length).toBe(NOTE_POINTS);
  });

  it("claims nothing the note rules out", () => {
    const text = PITFALLS.map((item) => item.text).join(" ");
    expect(text).not.toMatch(/accepted|confirmed by|fix for NASA/i);
  });
});
