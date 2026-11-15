import { describe, expect, it } from "vitest";
import { citationTokens } from "@/lib/assistant/ground";
import { STORED_ANSWERS, STORED_ON, findStored, storedEvents, storedLabel } from "@/lib/assistant/stored";
import file from "@/lib/assistant/stored-answers.json";

// The committed stored answers (written from the data by scripts/make-stored-answers.mjs).

describe("the stored answers file", () => {
  it("holds five answers, dated, written with no language model", () => {
    expect(STORED_ANSWERS).toHaveLength(5);
    expect(STORED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(file.note).toMatch(/No language model wrote these answers/);
    expect(new Set(STORED_ANSWERS.map((a) => a.id)).size).toBe(5);
    expect(new Set(STORED_ANSWERS.map((a) => a.chip)).size).toBe(5);
  });

  it("every stored answer cites only IDs present in its recorded sources, and cites something", () => {
    for (const answer of STORED_ANSWERS) {
      const cited = [...answer.answer.matchAll(/\[([^\]]*PSI-\d+[^\]]*)\]/g)].flatMap((m) => citationTokens(m[1]));
      expect(cited.length, answer.id).toBeGreaterThan(0);
      const recorded = new Set(answer.sources.map((s) => s.id));
      for (const id of cited) expect(recorded.has(id), `${answer.id} cites ${id}`).toBe(true);
      expect(answer.tools.length, answer.id).toBeGreaterThan(0);
      expect(answer.answer).not.toMatch(/could not be verified/);
    }
  });

  it("every source links into the site", () => {
    for (const answer of STORED_ANSWERS) {
      for (const source of answer.sources) {
        expect(source.href.startsWith("/") && !source.href.startsWith("//"), source.href).toBe(true);
        if (source.kind === "investigation") expect(source.href).toBe(`/investigations/${source.id}`);
        if (source.kind === "test") expect(source.href).toBe(`/tests?test=${encodeURIComponent(source.id)}`);
      }
    }
  });

  it("makes no claim the site must not make", () => {
    for (const answer of STORED_ANSWERS) {
      expect(answer.answer).not.toMatch(/\bsafe\b|would (burn|spread|happen)|on the Moon,|on Mars,/i);
    }
  });
});

describe("stored answer helpers", () => {
  it("finds a stored answer whatever the case and punctuation", () => {
    const first = STORED_ANSWERS[0];
    expect(findStored(first.question.toUpperCase().replace("?", ""))).toBe(first);
    expect(findStored("Something nobody stored")).toBeNull();
  });

  it("streams a stored answer as tool lines, text, sources and a done marked stored", () => {
    const events = storedEvents(STORED_ANSWERS[0]);
    expect(events.map((e) => e.type)).toEqual([...STORED_ANSWERS[0].tools.map(() => "tool"), "text", "sources", "done"]);
    expect(events.at(-1)).toEqual({ type: "done", model: null, saved_copy: STORED_ANSWERS[0].saved_copy, stored: true, generated_on: STORED_ON });
  });

  it("labels a stored answer with its date", () => {
    expect(storedLabel("2026-11-14")).toBe("Stored answer, written from the data on 2026-11-14");
    expect(storedLabel("")).toBe("Stored answer");
  });
});
