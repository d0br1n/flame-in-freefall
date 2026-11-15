// The conversation shown in the assistant panel: its entries and how a stream event changes the
// answer being written. Pure, unit tested; the React state lives in
// components/assistant/AssistantProvider.tsx.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { MAX_HISTORY_TURNS } from "./limits";
import { STORED_ON, type StoredAnswer } from "./stored";
import type { AskEvent, HistoryTurn, SourceItem } from "./types";

export type AssistantStatus = "checking" | "live" | "stored";

export interface UserEntry {
  id: string;
  role: "user";
  text: string;
}

export interface AnswerEntry {
  id: string;
  role: "assistant";
  /** live: written by the model now. stored: written from the data ahead of time. notice: a message from the site. */
  kind: "live" | "stored" | "notice";
  state: "working" | "done" | "error" | "stopped";
  text: string;
  /** The plain lines of the tools that ran, in order. */
  tools: string[];
  sources: SourceItem[];
  model: string | null;
  savedCopy: boolean;
  generatedOn: string | null;
  /** Offer the stored answers under this message (after an error or a refusal). */
  offerStored: boolean;
}

export type ChatEntry = UserEntry | AnswerEntry;

export function storedEntry(id: string, answer: StoredAnswer): AnswerEntry {
  return {
    id,
    role: "assistant",
    kind: "stored",
    state: "done",
    text: answer.answer,
    tools: answer.tools.map((t) => t.label),
    sources: answer.sources,
    model: null,
    savedCopy: answer.saved_copy,
    generatedOn: STORED_ON || null,
    offerStored: false,
  };
}

export function noticeEntry(id: string, message: string): AnswerEntry {
  return {
    id,
    role: "assistant",
    kind: "notice",
    state: "error",
    text: message,
    tools: [],
    sources: [],
    model: null,
    savedCopy: false,
    generatedOn: null,
    offerStored: true,
  };
}

/** The earlier answered turns, as the server takes them. Pure. */
export function historyOf(entries: ChatEntry[]): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const entry of entries) {
    if (entry.role === "user") turns.push({ role: "user", text: entry.text });
    else if (entry.state === "done" && entry.kind !== "notice") turns.push({ role: "assistant", text: entry.text });
    else if (turns.length && turns[turns.length - 1].role === "user") turns.pop(); // unanswered question
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}

/** Apply one stream event to the answer being written. Pure. */
export function applyEvent(entry: AnswerEntry, event: AskEvent): AnswerEntry {
  switch (event.type) {
    case "tool":
      return { ...entry, tools: [...entry.tools, event.label] };
    case "text":
      return { ...entry, text: entry.text + event.delta };
    case "sources":
      return { ...entry, sources: event.items };
    case "done":
      return {
        ...entry,
        state: "done",
        kind: event.stored ? "stored" : "live",
        model: event.model,
        savedCopy: event.saved_copy,
        generatedOn: event.generated_on ?? null,
      };
    case "error":
      return { ...entry, kind: "notice", state: "error", text: event.message, sources: [], offerStored: true };
  }
}

