// The answer stream: one JSON event per line (newline-delimited JSON). The server encodes,
// the browser parses. Pure, unit tested; no network here.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import type { AskEvent, SourceItem } from "./types";

export const STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export function encodeEvent(event: AskEvent): string {
  return `${JSON.stringify(event)}\n`;
}

const KINDS = new Set(["investigation", "test", "analysis"]);

function isSource(value: unknown): value is SourceItem {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.kind === "string" &&
    KINDS.has(s.kind) &&
    typeof s.id === "string" &&
    typeof s.label === "string" &&
    typeof s.href === "string" &&
    s.href.startsWith("/") &&
    !s.href.startsWith("//")
  );
}

/** One line to an event, or null when it is not a well-formed event. */
export function parseEvent(line: string): AskEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  switch (e.type) {
    case "tool":
      return typeof e.name === "string" && typeof e.label === "string" ? { type: "tool", name: e.name, label: e.label } : null;
    case "text":
      return typeof e.delta === "string" ? { type: "text", delta: e.delta } : null;
    case "sources":
      // Only links into this site are kept: a source can never point elsewhere.
      return Array.isArray(e.items) ? { type: "sources", items: e.items.filter(isSource) } : null;
    case "done":
      return {
        type: "done",
        model: typeof e.model === "string" ? e.model : null,
        saved_copy: e.saved_copy === true,
        ...(e.stored === true ? { stored: true } : {}),
        ...(typeof e.generated_on === "string" ? { generated_on: e.generated_on } : {}),
      };
    case "error":
      if (typeof e.message !== "string") return null;
      return { type: "error", message: e.message, stored: true, ...(e.reason === "key" ? { reason: "key" as const } : {}) };
    default:
      return null;
  }
}

/** Splits incoming text into lines and hands each complete event on. Keeps a partial last line. */
export function createEventParser(onEvent: (event: AskEvent) => void) {
  let buffer = "";
  const flushLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = parseEvent(trimmed);
    if (event) onEvent(event);
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        flushLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    },
    end() {
      flushLine(buffer);
      buffer = "";
    },
  };
}

/** Read a streamed body to the end, handing each event on as it arrives. */
export async function readEvents(body: ReadableStream<Uint8Array>, onEvent: (event: AskEvent) => void): Promise<void> {
  const parser = createEventParser(onEvent);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } finally {
    reader.releaseLock();
  }
}

/** A stream body that sends the given events, one per line (for the stored and refusal answers). */
export function eventsBody(events: AskEvent[]): string {
  return events.map(encodeEvent).join("");
}
