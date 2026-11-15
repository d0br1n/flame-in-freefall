// The assistant's tool loop, run on the server (a manual loop over the Claude API): the model
// asks for tools, the server runs them against the data service, the model answers from the
// results, and the events go to the browser. Unit tested with a fake model and fake data.
//
// Why a manual loop: the SDK's tool runner needs Zod (not a dependency of this site), and the
// loop must stream its own events (tool lines, checked text) to the browser between rounds.
//
// Streaming and correctness: the answer text streams to the browser through StreamGrounder,
// which holds back any citation until its "]" arrives and checks it against the tool results
// first, so a citation the check removes never reaches the screen. Text of a round that runs
// before any tool has returned data is not streamed: it is checked whole (an answer with numbers
// and no tool behind it is replaced, see UNCHECKED_ANSWER).
// Code generated with SI assistance (Claude Code), reviewed by the team.
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTextBlockParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { StreamGrounder, collectKnownIds, ground, hasNumber, removalNote, sourcesFor } from "./ground";
import { CUT_NOTE, KEY_REFUSED_MESSAGE, LIMIT_MESSAGE, OWN_LIMIT_MESSAGE, REFUSAL_MESSAGE, UNAVAILABLE_MESSAGE, UNCHECKED_ANSWER } from "./messages";
import { classifyError, type CallModel } from "./model";
import { airLine } from "./prompt";
import { toolLabel, toolSpecs, type Toolbox } from "./tools";
import type { AskEvent, HistoryTurn, ToolResult } from "./types";

export const MAX_ROUNDS = 6;
export const MAX_CALLS_PER_ROUND = 4;
/** A tool result longer than this is not passed on (they are designed to be far smaller). */
export const MAX_RESULT_CHARS = 16_000;
/** Sent with the tool results before the last round (tool_choice stays auto on every round). */
export const LAST_ROUND_NOTE = "No more tool calls are possible. Answer now from the tool results above, and say what you could not check.";

export interface RunOptions {
  question: string;
  history: HistoryTurn[];
  air: string | null;
  callModel: CallModel;
  toolbox: Toolbox;
  emit: (event: AskEvent) => void;
  signal?: AbortSignal;
  maxRounds?: number;
  maxCallsPerRound?: number;
  /** True when the model runs on the visitor's own key: a refused key or its limit is then said plainly. */
  ownKey?: boolean;
  /** Server log for failures (never shown to the visitor). */
  log?: (line: string) => void;
}

/** The conversation as the model sees it: alternating turns, starting with the visitor. Pure. */
export function buildMessages(question: string, history: HistoryTurn[], air: string | null): BetaMessageParam[] {
  const turns: HistoryTurn[] = [];
  for (const turn of history) {
    if (!turns.length && turn.role === "assistant") continue;
    const last = turns[turns.length - 1];
    if (last && last.role === turn.role) last.text = `${last.text}\n\n${turn.text}`;
    else turns.push({ ...turn });
  }
  if (turns.length && turns[turns.length - 1].role === "user") turns.pop();
  return [
    ...turns.map((t): BetaMessageParam => ({ role: t.role, content: t.text })),
    // The chosen air is volatile: it goes in the user turn, after the cached prefix.
    { role: "user", content: `${question}\n\n${airLine(air)}` },
  ];
}

/** The index of the last server-side fallback block (a declined model handed over), or -1. */
function lastFallback(content: BetaContentBlock[]): number {
  let at = -1;
  content.forEach((block, i) => {
    if (block.type === "fallback") at = i;
  });
  return at;
}

/**
 * The assistant turn as it is sent back: the full content, except that before the last fallback
 * block the declined model's thinking and tool calls are left out (the API's rule for echoing a
 * fallback turn); the fallback block stays where it was. Pure, unit tested.
 */
export function echoContent(content: BetaContentBlock[]): BetaContentBlockParam[] {
  const boundary = lastFallback(content);
  const dropped = new Set(["thinking", "redacted_thinking", "tool_use", "server_tool_use"]);
  return content.filter((block, i) => i >= boundary || !dropped.has(block.type)) as BetaContentBlockParam[];
}

/** The tool calls to run: those after the last fallback block. */
function toolCalls(content: BetaContentBlock[]): BetaToolUseBlock[] {
  const boundary = lastFallback(content);
  return content.filter((block, i): block is BetaToolUseBlock => i > boundary && block.type === "tool_use");
}

function textOf(message: BetaMessage): string {
  return message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

function resultContent(result: ToolResult): string {
  const text = JSON.stringify(result);
  if (text.length <= MAX_RESULT_CHARS) return text;
  return JSON.stringify({ ok: false, error: "This result is too large. Ask for fewer rows or a narrower filter.", sources: [] });
}

class NoAnswer extends Error {}

/** Runs one question to the end. Never throws: every failure becomes an error event. */
export async function runAssistant(options: RunOptions): Promise<void> {
  const { emit, toolbox, callModel, signal, ownKey = false } = options;
  const log = options.log ?? console.error;
  const maxRounds = options.maxRounds ?? MAX_ROUNDS;
  const maxCalls = options.maxCallsPerRound ?? MAX_CALLS_PER_ROUND;
  const messages = buildMessages(options.question, options.history, options.air);
  const tools = toolSpecs();
  const results: ToolResult[] = [];
  const cited: string[] = [];
  let removed = 0;
  let streamed = "";
  const say = (text: string) => {
    if (!text) return;
    streamed += text;
    emit({ type: "text", delta: text });
  };

  try {
    let final: BetaMessage | null = null;
    let cut = false;
    for (let round = 0; round < maxRounds && !final; round += 1) {
      const last = round === maxRounds - 1;
      // Stream only once a tool has returned data: then every citation can be checked as it arrives.
      const grounder = results.length ? new StreamGrounder(collectKnownIds(results)) : null;
      let first = true;
      const message = await callModel({
        tools,
        messages,
        signal,
        onText: (delta) => {
          if (!grounder) return;
          // Text of a new round starts a new paragraph.
          if (first && streamed && !streamed.endsWith("\n")) say("\n\n");
          first = false;
          say(grounder.push(delta));
        },
      });
      if (signal?.aborted) return;
      if (grounder) {
        say(grounder.end());
        cited.push(...grounder.cited);
        removed += grounder.removed.length;
      }

      switch (message.stop_reason) {
        case "refusal":
          // Declined (after any server-side fallback). Partial text is discarded by the browser.
          emit({ type: "error", message: REFUSAL_MESSAGE, stored: true });
          return;
        case "pause_turn":
          messages.push({ role: "assistant", content: echoContent(message.content) });
          continue;
        case "tool_use": {
          const calls = toolCalls(message.content);
          if (!calls.length || last) {
            final = message;
            break;
          }
          messages.push({ role: "assistant", content: echoContent(message.content) });
          const run = calls.slice(0, maxCalls);
          for (const call of run) emit({ type: "tool", name: call.name, label: toolLabel(call.name, call.input) });
          // The calls of one turn run at the same time; every call gets a result in ONE user message.
          const outcomes = await Promise.all(run.map((call) => toolbox.run(call.name, call.input)));
          if (signal?.aborted) return;
          results.push(...outcomes);
          const blocks: BetaToolResultBlockParam[] = calls.map((call, i) => {
            const result = i < run.length ? outcomes[i] : null;
            if (!result) {
              return {
                type: "tool_result",
                tool_use_id: call.id,
                is_error: true,
                content: `Not run: at most ${maxCalls} tools per turn. Ask for it again in the next turn.`,
              };
            }
            return { type: "tool_result", tool_use_id: call.id, is_error: !result.ok || undefined, content: resultContent(result) };
          });
          // Before the last round, a note after the results (same message) asks for the answer.
          const content: (BetaToolResultBlockParam | BetaTextBlockParam)[] =
            round === maxRounds - 2 ? [...blocks, { type: "text", text: LAST_ROUND_NOTE }] : blocks;
          messages.push({ role: "user", content });
          continue;
        }
        case "max_tokens":
          // Cut off: never run tool calls whose input may be truncated; show what there is.
          final = message;
          cut = true;
          break;
        default:
          final = message;
      }
    }
    if (!final) throw new NoAnswer("no answer after the last round");

    const known = collectKnownIds(results);
    if (!streamed) {
      // Nothing was streamed: check the whole text now.
      let grounded = ground(textOf(final).trim(), known);
      if (!results.length && hasNumber(grounded.text)) grounded = { text: UNCHECKED_ANSWER, removed: [], sources: [] };
      if (!grounded.text && !cut) throw new NoAnswer("empty answer");
      say(grounded.text);
      if (cut) say(`${grounded.text ? "\n\n" : ""}${CUT_NOTE}`);
      emit({ type: "sources", items: grounded.sources });
    } else {
      if (removed) say(`\n\n${removalNote(removed)}`);
      if (cut) say(`\n\n${CUT_NOTE}`);
      emit({ type: "sources", items: sourcesFor(cited, known) });
    }
    emit({ type: "done", model: final.model, saved_copy: results.some((r) => r.ok && r.from === "saved_copy") });
  } catch (error) {
    if (signal?.aborted) return;
    const failure = error instanceof NoAnswer ? { kind: "failed" as const, detail: error.message } : classifyError(error);
    log(`[assistant] no answer: ${failure.detail}`);
    // The site's own key being refused is the site's problem: the visitor only hears "not available".
    if (failure.kind === "key" && ownKey) emit({ type: "error", message: KEY_REFUSED_MESSAGE, stored: true, reason: "key" });
    else if (failure.kind === "limit") emit({ type: "error", message: ownKey ? OWN_LIMIT_MESSAGE : LIMIT_MESSAGE, stored: true });
    else emit({ type: "error", message: UNAVAILABLE_MESSAGE, stored: true });
  }
}
