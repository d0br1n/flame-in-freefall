import { describe, expect, it } from "vitest";
import { applyEvent, historyOf, noticeEntry, type AnswerEntry, type ChatEntry } from "@/lib/assistant/conversation";
import { createEventParser, encodeEvent, parseEvent, readEvents } from "@/lib/assistant/stream";
import type { AskEvent } from "@/lib/assistant/types";

// The answer stream: one JSON event per line, encoded on the server and parsed in the browser.

const EVENTS: AskEvent[] = [
  { type: "tool", name: "query_tests", label: "Looking up PSI-69 tests" },
  { type: "text", delta: "FLEX ran tests [PSI-69].\nSecond line." },
  { type: "sources", items: [{ kind: "investigation", id: "PSI-69", label: "FLEX", href: "/investigations/PSI-69" }] },
  { type: "done", model: "anthropic/claude-sonnet-5.5", saved_copy: true },
];

describe("encode and parse", () => {
  it("round-trips every event, one per line", () => {
    const body = EVENTS.map(encodeEvent).join("");
    expect(body.split("\n").filter(Boolean)).toHaveLength(EVENTS.length);
    const seen: AskEvent[] = [];
    const parser = createEventParser((e) => seen.push(e));
    parser.push(body);
    parser.end();
    expect(seen).toEqual(EVENTS);
  });

  it("puts lines together across chunks and ignores what it cannot read", () => {
    const body = `${encodeEvent(EVENTS[0])}not json\n{"type":"unknown"}\n${encodeEvent(EVENTS[1])}`;
    const seen: AskEvent[] = [];
    const parser = createEventParser((e) => seen.push(e));
    for (let i = 0; i < body.length; i += 7) parser.push(body.slice(i, i + 7));
    parser.end();
    expect(seen).toEqual([EVENTS[0], EVENTS[1]]);
  });

  it("never lets a source link out of the site", () => {
    const event = parseEvent(
      JSON.stringify({
        type: "sources",
        items: [
          { kind: "investigation", id: "PSI-1", label: "x", href: "https://evil.example" },
          { kind: "investigation", id: "PSI-2", label: "x", href: "//evil.example" },
          { kind: "investigation", id: "PSI-3", label: "x", href: "/investigations/PSI-3" },
        ],
      }),
    );
    expect(event).toEqual({ type: "sources", items: [{ kind: "investigation", id: "PSI-3", label: "x", href: "/investigations/PSI-3" }] });
  });

  it("reads an error event as one that offers the stored answers", () => {
    expect(parseEvent('{"type":"error","message":"Not now"}')).toEqual({ type: "error", message: "Not now", stored: true });
    // "key" is the only reason the browser acts on (it forgets the visitor's key); others are dropped.
    expect(parseEvent('{"type":"error","message":"Refused","reason":"key"}')).toEqual({ type: "error", message: "Refused", stored: true, reason: "key" });
    expect(parseEvent('{"type":"error","message":"Not now","reason":"other"}')).toEqual({ type: "error", message: "Not now", stored: true });
  });

  it("reads a streamed body to the end", async () => {
    const encoder = new TextEncoder();
    const text = EVENTS.map(encodeEvent).join("");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text.slice(0, 30)));
        controller.enqueue(encoder.encode(text.slice(30)));
        controller.close();
      },
    });
    const seen: AskEvent[] = [];
    await readEvents(body, (e) => seen.push(e));
    expect(seen).toEqual(EVENTS);
  });
});

describe("the conversation", () => {
  const working: AnswerEntry = { ...noticeEntry("a1", ""), kind: "live", state: "working", offerStored: false };

  it("builds the answer from the events", () => {
    const done = EVENTS.reduce(applyEvent, working);
    expect(done).toMatchObject({
      kind: "live",
      state: "done",
      tools: ["Looking up PSI-69 tests"],
      text: "FLEX ran tests [PSI-69].\nSecond line.",
      model: "anthropic/claude-sonnet-5.5",
      savedCopy: true,
    });
    expect(done.sources).toHaveLength(1);
    const stored = applyEvent(working, { type: "done", model: null, saved_copy: false, stored: true, generated_on: "2026-11-14" });
    expect(stored).toMatchObject({ kind: "stored", generatedOn: "2026-11-14" });
  });

  it("turns an error into a notice that offers the stored answers", () => {
    const failed = applyEvent({ ...working, sources: EVENTS[2].type === "sources" ? EVENTS[2].items : [] }, { type: "error", message: "Not now.", stored: true });
    expect(failed).toMatchObject({ kind: "notice", state: "error", text: "Not now.", sources: [], offerStored: true });
  });

  it("sends back only answered turns", () => {
    const entries: ChatEntry[] = [
      { id: "1", role: "user", text: "q1" },
      { ...working, id: "2", state: "done", text: "a1" },
      { id: "3", role: "user", text: "q2" },
      noticeEntry("4", "Live answers are not available right now."),
      { id: "5", role: "user", text: "q3" },
      { ...working, id: "6", kind: "stored", state: "done", text: "a3" },
    ];
    expect(historyOf(entries)).toEqual([
      { role: "user", text: "q1" },
      { role: "assistant", text: "a1" },
      { role: "user", text: "q3" },
      { role: "assistant", text: "a3" },
    ]);
  });
});
