// The grounding check. After the model answers, every [PSI-…] citation is checked against the
// tool results of the same conversation. A cited ID that no tool returned is removed, and the
// answer says so in one line. The sources the visitor sees are only IDs that a tool returned
// AND the answer cites. Pure, unit tested; also used by scripts/make-stored-answers.mjs.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import type { SourceItem, ToolResult, ToolSource } from "./types";

const PSI_TOKEN = /^PSI-\d+(\/.+)?$/;
/** A bracket that holds at least one PSI token: [PSI-69], [PSI-69/114], [PSI-69, PSI-39]. */
const CITATION = /\s?\[([^\]\n]*PSI-\d+[^\]\n]*)\]/g;

/** What the tool results of one conversation named. */
export interface KnownIds {
  investigations: Map<string, string>;
  tests: Set<string>;
  analyses: Map<string, { label: string; href: string; psi_ids: string[] }>;
}

/** Every ID a tool result named: its sources, plus any PSI or test ID written in its data. */
export function collectKnownIds(results: ToolResult[]): KnownIds {
  const known: KnownIds = { investigations: new Map(), tests: new Set(), analyses: new Map() };
  const addInvestigation = (id: string, label?: string) => {
    const current = known.investigations.get(id);
    if (!current || (label && current === id)) known.investigations.set(id, label ?? current ?? id);
  };
  for (const result of results) {
    for (const source of result.sources as ToolSource[]) {
      if (source.kind === "investigation") addInvestigation(source.id, source.label);
      else if (source.kind === "test") known.tests.add(source.id);
      else if (source.kind === "analysis") {
        const current = known.analyses.get(source.id);
        known.analyses.set(source.id, {
          label: source.label ?? current?.label ?? source.id,
          href: source.href ?? current?.href ?? "/",
          psi_ids: [...new Set([...(current?.psi_ids ?? []), ...(source.psi_ids ?? [])])],
        });
      }
    }
    if (!result.ok) continue;
    // IDs written in the data (a nearest test, a related investigation) also appeared in a result.
    const text = JSON.stringify(result.data);
    for (const match of text.matchAll(/"(PSI-\d+)(\/[^"\\]+)?"/g)) {
      if (match[2]) known.tests.add(`${match[1]}${match[2]}`);
      else addInvestigation(match[1]);
    }
    for (const match of text.matchAll(/\bPSI-\d+\b/g)) addInvestigation(match[0]);
  }
  for (const test of known.tests) addInvestigation(test.slice(0, test.indexOf("/")));
  return known;
}

/** The tokens inside one citation bracket: "PSI-69, PSI-39" -> ["PSI-69", "PSI-39"]. */
export function citationTokens(inner: string): string[] {
  return inner
    .split(/[,;]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isKnown(token: string, known: KnownIds): boolean {
  return token.includes("/") ? known.tests.has(token) : known.investigations.has(token);
}

export interface Grounded {
  text: string;
  /** Cited IDs that no tool result named: removed from the text. */
  removed: string[];
  sources: SourceItem[];
}

export function hrefFor(kind: "investigation" | "test", id: string): string {
  return kind === "investigation" ? `/investigations/${id}` : `/tests?test=${encodeURIComponent(id)}`;
}

/** The citation pass on one piece of text: keeps known IDs, removes the others. Pure. */
export function groundCitations(answer: string, known: KnownIds): { text: string; cited: string[]; removed: string[] } {
  const removed: string[] = [];
  const cited: string[] = [];
  let text = answer.replace(CITATION, (whole, inner: string) => {
    const tokens = citationTokens(inner);
    const kept: string[] = [];
    for (const token of tokens) {
      if (!PSI_TOKEN.test(token)) kept.push(token);
      else if (isKnown(token, known)) {
        kept.push(token);
        cited.push(token);
      } else removed.push(token);
    }
    if (!kept.some((token) => PSI_TOKEN.test(token))) return "";
    const space = whole.startsWith(" ") || whole.startsWith("\n") ? whole[0] : "";
    return `${space}[${kept.join(", ")}]`;
  });
  if (removed.length) text = text.replace(/[ \t]+([.,;:])/g, "$1");
  return { text, cited, removed };
}

/** The one line that says how many citations were removed. */
export function removalNote(count: number): string {
  return count === 1 ? "One reference could not be verified and was removed." : `${count} references could not be verified and were removed.`;
}

/** The sources of an answer: the cited IDs a tool returned, plus the analyses that read them. */
export function sourcesFor(cited: string[], known: KnownIds): SourceItem[] {
  const sources: SourceItem[] = [];
  const seen = new Set<string>();
  const add = (item: SourceItem) => {
    const key = `${item.kind}:${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push(item);
    }
  };
  const citedInvestigations = new Set<string>();
  for (const id of cited) {
    if (!isKnown(id, known)) continue;
    if (id.includes("/")) {
      add({ kind: "test", id, label: known.investigations.get(id.slice(0, id.indexOf("/"))) ?? id, href: hrefFor("test", id) });
      citedInvestigations.add(id.slice(0, id.indexOf("/")));
    } else {
      add({ kind: "investigation", id, label: known.investigations.get(id) ?? id, href: hrefFor("investigation", id) });
      citedInvestigations.add(id);
    }
  }
  // An analysis is a source when a tool read it and the answer cites an investigation it reads.
  for (const [id, analysis] of known.analyses) {
    if (analysis.psi_ids.some((psiId) => citedInvestigations.has(psiId))) {
      add({ kind: "analysis", id, label: analysis.label, href: analysis.href });
    }
  }
  return sources;
}

/** Check a whole answer's citations against what the tools returned. */
export function ground(answer: string, known: KnownIds): Grounded {
  const pass = groundCitations(answer, known);
  let text = pass.text;
  if (pass.removed.length) text = `${text.trimEnd()}\n\n${removalNote(pass.removed.length)}`;
  return { text, removed: pass.removed, sources: sourcesFor(pass.cited, known) };
}

/**
 * The same check on text that arrives in pieces (a streamed answer). Text is handed on as soon as
 * no citation can still be open in it: from an unclosed "[" on, it waits for the "]", so a
 * citation is always checked before the visitor sees it.
 */
export class StreamGrounder {
  private held = "";
  readonly cited: string[] = [];
  readonly removed: string[] = [];
  constructor(private readonly known: KnownIds) {}

  push(delta: string): string {
    this.held += delta;
    const cut = safeCut(this.held);
    const ready = this.held.slice(0, cut);
    this.held = this.held.slice(cut);
    return this.pass(ready);
  }

  end(): string {
    const rest = this.pass(this.held);
    this.held = "";
    return rest;
  }

  private pass(text: string): string {
    if (!text) return "";
    const out = groundCitations(text, this.known);
    this.cited.push(...out.cited);
    this.removed.push(...out.removed);
    return out.text;
  }
}

/** Where text may be cut so that no citation is split: before an open "[" and trailing spaces. */
export function safeCut(text: string): number {
  let cut = text.length;
  const open = text.lastIndexOf("[");
  if (open >= 0 && text.indexOf("]", open) < 0 && text.length - open < 300 && !text.slice(open).includes("\n")) cut = open;
  while (cut > 0 && (text[cut - 1] === " " || text[cut - 1] === "\t")) cut -= 1;
  return cut;
}

export type AnswerPart = { type: "text"; text: string } | { type: "cite"; ids: string[] };

/**
 * One line of an answer split into text and citations, for rendering the citations as chips.
 * Only PSI tokens become chips; other words inside a bracket stay text. Pure, unit tested.
 */
export function splitCitations(line: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const match of line.matchAll(/\[([^\]\n]*PSI-\d+[^\]\n]*)\]/g)) {
    const ids = citationTokens(match[1]).filter((token) => PSI_TOKEN.test(token));
    if (!ids.length) continue;
    const before = line.slice(last, match.index);
    if (before) parts.push({ type: "text", text: before });
    parts.push({ type: "cite", ids });
    last = (match.index ?? 0) + match[0].length;
  }
  if (last < line.length) parts.push({ type: "text", text: line.slice(last) });
  return parts;
}

export type AnswerBlock = { kind: "p"; lines: string[] } | { kind: "list"; items: string[] };

/** An answer's text as paragraphs and "- " lists (a blank line ends a block). Pure, unit tested. */
export function answerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let current: AnswerBlock | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      current = null;
      continue;
    }
    const item = /^[-•*]\s+(.*)$/.exec(line);
    if (item) {
      if (current?.kind !== "list") blocks.push((current = { kind: "list", items: [] }));
      current.items.push(item[1]);
    } else {
      if (current?.kind !== "p") blocks.push((current = { kind: "p", lines: [] }));
      current.lines.push(line);
    }
  }
  return blocks;
}

/** True when an answer states a number. Used when no tool ran: such an answer is not shown. */
export function hasNumber(text: string): boolean {
  return /\d/.test(text.replace(CITATION, ""));
}
