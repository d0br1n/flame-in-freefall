// The stored answers: five example questions answered ahead of time from the data, with no
// language model (scripts/make-stored-answers.mjs runs the real tools against the data service
// and fills answer templates, so every number is read from the data on the date recorded).
// They are shown when live answers are not available, always labelled "Stored answer".
// Pure, unit tested; safe to import in the browser.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import file from "./stored-answers.json";
import type { AskEvent, SourceItem } from "./types";

export interface StoredAnswer {
  id: string;
  /** The short label of the suggestion chip. */
  chip: string;
  question: string;
  /** The answer text, with [PSI-…] citations. */
  answer: string;
  sources: SourceItem[];
  /** The tools that were run to write it. */
  tools: { name: string; label: string }[];
  /** True if any of those tools read the saved copy instead of the live data service. */
  saved_copy: boolean;
}

interface StoredFile {
  note: string;
  generated_on: string;
  answers: StoredAnswer[];
}

const stored = file as unknown as StoredFile;

export const STORED_ANSWERS: readonly StoredAnswer[] = stored.answers;
export const STORED_ON: string = stored.generated_on;

export function storedLabel(date: string = STORED_ON): string {
  return date ? `Stored answer, written from the data on ${date}` : "Stored answer";
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** The stored answer to exactly this question (case and punctuation ignored), or null. */
export function findStored(question: string, answers: readonly StoredAnswer[] = STORED_ANSWERS): StoredAnswer | null {
  const wanted = normalize(question);
  return answers.find((a) => normalize(a.question) === wanted) ?? null;
}

/** The answer stream of a stored answer. */
export function storedEvents(answer: StoredAnswer, date: string = STORED_ON): AskEvent[] {
  return [
    ...answer.tools.map((t): AskEvent => ({ type: "tool", name: t.name, label: t.label })),
    { type: "text", delta: answer.answer },
    { type: "sources", items: answer.sources },
    { type: "done", model: null, saved_copy: answer.saved_copy, stored: true, generated_on: date },
  ];
}
