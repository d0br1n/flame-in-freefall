import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock, BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describe, expect, it } from "vitest";
import { CUT_NOTE, LIMIT_MESSAGE, REFUSAL_MESSAGE, UNAVAILABLE_MESSAGE, UNCHECKED_ANSWER } from "@/lib/assistant/messages";
import type { CallModel, TurnRequest } from "@/lib/assistant/model";
import { SYSTEM_PROMPT } from "@/lib/assistant/prompt";
import { LAST_ROUND_NOTE, buildMessages, echoContent, runAssistant } from "@/lib/assistant/run";
import { createToolbox, type FetchJson } from "@/lib/assistant/tools";
import type { AskEvent } from "@/lib/assistant/types";

// The tool loop with a fake Claude and fake data: no network, no key.

const DATA: Record<string, unknown> = {
  "/catalog/investigations": {
    count: 1,
    items: [{ psi_id: "PSI-69", acronym: "FLEX", title: "FLEX", pillar: "suppression", stage: "suppress", fuel_phase: "liquid", summary_plain: "Droplets.", table_count: 1, files_count: 2 }],
  },
};
const fetchJson: FetchJson = async (path) => {
  if (!(path in DATA)) throw new Error("no route");
  return { data: DATA[path], from: "live" };
};

const text = (t: string) => ({ type: "text", text: t, citations: null });
const use = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

function message(content: unknown[], stop: string, model = "claude-sonnet-5-5"): BetaMessage {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason: stop,
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as BetaMessage;
}

/** A fake model that plays back replies, streams their text in small pieces, and records requests. */
function scripted(replies: (BetaMessage | Error)[]) {
  const requests: TurnRequest[] = [];
  const model: CallModel = async (request) => {
    requests.push({ ...request, messages: structuredClone(request.messages) });
    const next = replies[Math.min(requests.length - 1, replies.length - 1)];
    if (next instanceof Error) throw next;
    for (const block of next.content) {
      if (block.type === "text") for (let i = 0; i < block.text.length; i += 5) request.onText(block.text.slice(i, i + 5));
    }
    return next;
  };
  return { model, requests };
}

async function run(model: CallModel, extra: Partial<Parameters<typeof runAssistant>[0]> = {}) {
  const events: AskEvent[] = [];
  const logs: string[] = [];
  await runAssistant({
    question: "What did FLEX burn?",
    history: [],
    air: "station",
    callModel: model,
    toolbox: createToolbox(fetchJson),
    emit: (e) => events.push(e),
    log: (line) => logs.push(line),
    ...extra,
  });
  return { events, logs, text: events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("") };
}

describe("runAssistant", () => {
  it("calls a tool, streams the checked answer and ends with sources and done", async () => {
    const { model, requests } = scripted([
      message([use("c1", "search_investigations", { text: "flex" })], "tool_use"),
      message([text("FLEX burned fuel droplets [PSI-69]. It ran 999 tests [PSI-999].")], "end_turn"),
    ]);
    const { events, text: answer } = await run(model);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("tool");
    expect(types.slice(-2)).toEqual(["sources", "done"]);
    expect(types.slice(1, -2).every((t) => t === "text")).toBe(true);
    expect(answer).toBe("FLEX burned fuel droplets [PSI-69]. It ran 999 tests.\n\nOne reference could not be verified and was removed.");
    // The fabricated citation never appeared in any streamed piece.
    expect(events.some((e) => e.type === "text" && e.delta.includes("999]"))).toBe(false);
    expect(events.at(-2)).toEqual({ type: "sources", items: [{ kind: "investigation", id: "PSI-69", label: "FLEX", href: "/investigations/PSI-69" }] });
    expect(events.at(-1)).toEqual({ type: "done", model: "claude-sonnet-5-5", saved_copy: false });
    // The full assistant content goes back, then ONE user message with the tool results.
    const second = requests[1].messages;
    expect(second.at(-2)).toEqual({ role: "assistant", content: [use("c1", "search_investigations", { text: "flex" })] });
    const results = second.at(-1) as { role: string; content: { type: string; tool_use_id: string; content: string }[] };
    expect(results.role).toBe("user");
    expect(results.content).toHaveLength(1);
    expect(results.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "c1" });
    expect(JSON.parse(results.content[0].content)).toMatchObject({ ok: true, from: "live" });
  });

  it("runs the calls of one turn together, answers all of them in one message, and caps them at four", async () => {
    const many = Array.from({ length: 6 }, (_, i) => use(`c${i}`, "search_investigations", {}));
    const { model, requests } = scripted([message(many, "tool_use"), message([text("Done [PSI-69].")], "end_turn")]);
    const { events } = await run(model);
    expect(events.filter((e) => e.type === "tool")).toHaveLength(4);
    const reply = requests[1].messages.at(-1) as { content: { tool_use_id: string; is_error?: boolean }[] };
    expect(reply.content.map((b) => b.tool_use_id)).toEqual(["c0", "c1", "c2", "c3", "c4", "c5"]);
    expect(reply.content.slice(4).every((b) => b.is_error === true)).toBe(true);
  });

  it("returns a failed tool as is_error, never drops it", async () => {
    const { model, requests } = scripted([
      message([use("x", "get_investigation", { psi_id: "nonsense" })], "tool_use"),
      message([text("I could not read that investigation.")], "end_turn"),
    ]);
    await run(model);
    const reply = requests[1].messages.at(-1) as { content: { is_error?: boolean; content: string }[] };
    expect(reply.content[0].is_error).toBe(true);
    expect(JSON.parse(reply.content[0].content)).toMatchObject({ ok: false });
  });

  it("stops after the round limit; the results before the last round carry the answer-now note", async () => {
    const { model, requests } = scripted([message([use("c", "list_cabin_airs", {})], "tool_use")]);
    const { events } = await run(model, { maxRounds: 3 });
    expect(requests).toHaveLength(3);
    const beforeLast = requests[2].messages.at(-1) as { content: { type: string; text?: string }[] };
    expect(beforeLast.content.at(-1)).toEqual({ type: "text", text: LAST_ROUND_NOTE });
    expect(events.at(-1)).toEqual({ type: "error", message: UNAVAILABLE_MESSAGE, stored: true });
  });

  it("refusal: a friendly message that offers the stored answers, no raw details", async () => {
    const refused = message([text("partial")], "refusal");
    const { events } = await run(scripted([message([use("c", "list_cabin_airs", {})], "tool_use"), refused]).model);
    expect(events.at(-1)).toEqual({ type: "error", message: REFUSAL_MESSAGE, stored: true });
  });

  it("max_tokens: shows what there is and says the answer was cut, without running cut-off tool calls", async () => {
    const { events, text: answer } = await run(
      scripted([message([use("c", "search_investigations", {})], "tool_use"), message([text("FLEX burned [PSI-69]"), use("d", "list_analyses", {})], "max_tokens")]).model,
    );
    expect(events.filter((e) => e.type === "tool")).toHaveLength(1);
    expect(answer).toBe(`FLEX burned [PSI-69]\n\n${CUT_NOTE}`);
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("pause_turn: sends the turn back and continues", async () => {
    const { model, requests } = scripted([
      message([text("…")], "pause_turn"),
      message([use("c", "search_investigations", {})], "tool_use"),
      message([text("FLEX [PSI-69].")], "end_turn"),
    ]);
    const { events } = await run(model);
    expect(requests[1].messages.at(-1)).toEqual({ role: "assistant", content: [text("…")] });
    expect(events.at(-1)).toMatchObject({ type: "done" });
  });

  it("turns API errors into the stored-answers message, and a spent limit into the limit message", async () => {
    const limit = new Anthropic.RateLimitError(429, undefined, "slow down", new Headers());
    const down = new Anthropic.InternalServerError(500, undefined, "boom", new Headers());
    expect((await run(scripted([down]).model)).events.at(-1)).toEqual({ type: "error", message: UNAVAILABLE_MESSAGE, stored: true });
    expect((await run(scripted([limit]).model)).events.at(-1)).toEqual({ type: "error", message: LIMIT_MESSAGE, stored: true });
    const { events, logs } = await run(scripted([new TypeError("boom")]).model);
    expect(events.at(-1)).toMatchObject({ type: "error", stored: true });
    expect(logs[0]).toMatch(/^\[assistant\] no answer/);
  });

  it("does not show numbers when no tool ran, but lets a plain refusal through", async () => {
    const { text: numbers } = await run(scripted([message([text("FLEX ran 274 tests.")], "end_turn")]).model);
    expect(numbers).toBe(UNCHECKED_ANSWER);
    const { text: decline } = await run(scripted([message([text("I can only answer questions about these experiments.")], "end_turn")]).model);
    expect(decline).toBe("I can only answer questions about these experiments.");
  });

  it("emits nothing more once the visitor stops", async () => {
    const stop = new AbortController();
    const model: CallModel = async () => {
      stop.abort();
      throw new Anthropic.APIUserAbortError();
    };
    expect((await run(model, { signal: stop.signal })).events).toEqual([]);
  });
});

describe("echoContent", () => {
  it("sends the full content back, without the declined model's thinking and tool calls before a fallback", () => {
    const content = [
      { type: "thinking", thinking: "", signature: "a" },
      text("partial "),
      use("old", "list_analyses", {}),
      { type: "fallback", from: { model: "claude-sonnet-5-5" }, to: { model: "claude-sonnet-5" }, trigger: {} },
      { type: "thinking", thinking: "", signature: "b" },
      use("new", "list_analyses", {}),
    ] as unknown as BetaContentBlock[];
    expect(echoContent(content).map((b) => b.type)).toEqual(["text", "fallback", "thinking", "tool_use"]);
    const plain = [{ type: "thinking", thinking: "", signature: "a" }, use("x", "t", {})] as unknown as BetaContentBlock[];
    expect(echoContent(plain)).toEqual(plain);
  });
});

describe("buildMessages", () => {
  it("keeps turns alternating and puts the chosen air in the user turn, not the system prompt", () => {
    const messages = buildMessages(
      "And in this air?",
      [
        { role: "assistant", text: "dropped: an answer with no question" },
        { role: "user", text: "Hi" },
        { role: "user", text: "What is FLEX?" },
        { role: "assistant", text: "A droplet experiment [PSI-69]." },
        { role: "user", text: "unanswered" },
      ],
      "exploration",
    );
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[0]).toEqual({ role: "user", content: "Hi\n\nWhat is FLEX?" });
    expect(messages.at(-1)).toEqual({ role: "user", content: 'And in this air?\n\n(The cabin air chosen on the site is the preset "exploration".)' });
    expect(SYSTEM_PROMPT).not.toContain("exploration");
  });

  it("the system prompt holds rules, not data", () => {
    expect(SYSTEM_PROMPT).toMatch(/ONLY from the results of the tools/);
    expect(SYSTEM_PROMPT).toMatch(/\[PSI-69\/114\]/);
    expect(SYSTEM_PROMPT).toMatch(/Moon or Mars gravity/);
    // no data in the prompt: the only digits are the example IDs, the unit example and the word limit
    expect(SYSTEM_PROMPT.replace(/PSI-\d+(\/\d+)?/g, "").match(/\d+/g)).toEqual(["0", "25", "25", "150"]);
  });
});
