// Shapes shared by the assistant's server side (tools, loop, route) and its browser side
// (client, panel). Pure types: no runtime code, so Node scripts can load the modules that use them.

/** Where a tool's data came from: the live data service, or the saved copy bundled with the site. */
export type DataOrigin = "live" | "saved_copy";

export type SourceKind = "investigation" | "test" | "analysis";

/** One source of an answer, shown as a chip that links into the site. */
export interface SourceItem {
  kind: SourceKind;
  /** A PSI ID (PSI-69), a test ID (PSI-69/114) or an analysis ID (flame-temperature). */
  id: string;
  /** What the chip says next to the ID, for example the acronym "FLEX". */
  label: string;
  /** A path inside this site. */
  href: string;
}

/** A source a tool result names: what the grounding check may accept as a citation. */
export interface ToolSource {
  kind: SourceKind | "file";
  id: string;
  label?: string;
  /** For an analysis: the page it lives on (/spread, /suppress). */
  href?: string;
  /** For an analysis: the PSI investigations it reads. */
  psi_ids?: string[];
}

/** What a tool hands back to the model. Small on purpose: rows are capped and long texts trimmed. */
export type ToolResult =
  | { ok: true; from: DataOrigin; data: Record<string, unknown>; sources: ToolSource[] }
  | { ok: false; error: string; sources: ToolSource[] };

/** One line of the answer stream (newline-delimited JSON, see lib/assistant/stream.ts). */
export type AskEvent =
  | { type: "tool"; name: string; label: string }
  | { type: "text"; delta: string }
  | { type: "sources"; items: SourceItem[] }
  | {
      type: "done";
      /** The model that wrote the answer; null for a stored answer. */
      model: string | null;
      /** True when at least one tool read the saved copy instead of the live data service. */
      saved_copy: boolean;
      /** True for a stored answer (written from the data ahead of time, no model). */
      stored?: boolean;
      /** For a stored answer: the date it was written from the data. */
      generated_on?: string;
    }
  | {
      type: "error";
      message: string;
      stored: true;
      /** "key": the visitor's own API key was refused, so the browser forgets it. */
      reason?: "key";
    };

/** One earlier message of the conversation, as the browser sends it back. */
export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

/** The body of POST /api/ask. */
export interface AskRequest {
  question: string;
  history?: HistoryTurn[];
  /** The cabin air chosen on the site (a preset ID such as "station"), so "this air" means something. */
  air?: string | null;
}

/** GET /api/ask: whether live answers are possible, and the stored questions. */
export interface AskStatus {
  live: boolean;
  stored: { id: string; question: string; chip: string }[];
}
