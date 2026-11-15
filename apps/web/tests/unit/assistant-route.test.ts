import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/ask/route";
import { createAskHandler, type AskDeps } from "@/lib/assistant/handler";
import Anthropic from "@anthropic-ai/sdk";
import { KEY_HEADER, cleanKey } from "@/lib/assistant/key";
import { KEY_REFUSED_MESSAGE, KEY_SHAPE_MESSAGE, OWN_LIMIT_MESSAGE, UNAVAILABLE_MESSAGE } from "@/lib/assistant/messages";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { CallModel } from "@/lib/assistant/model";
import { STORED_ANSWERS } from "@/lib/assistant/stored";
import { parseEvent } from "@/lib/assistant/stream";
import type { AskEvent } from "@/lib/assistant/types";

// POST /api/ask end to end on the server side, with no network: no key, then a fake key with a
// fake model and a fake data service.

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://burnrate.example/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function eventsOf(response: Response): Promise<AskEvent[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => parseEvent(line))
    .filter((e): e is AskEvent => e !== null);
}

afterEach(() => vi.unstubAllEnvs());

describe("the route without a key", () => {
  it("GET says live answers are off and lists the stored questions", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.live).toBe(false);
    expect(body.stored).toHaveLength(STORED_ANSWERS.length);
  });

  it("POST of a stored question gets the stored answer, marked stored", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const answer = STORED_ANSWERS[1];
    const response = await POST(post({ question: answer.question }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/ndjson/);
    const events = await eventsOf(response);
    expect(events.find((e) => e.type === "text")).toEqual({ type: "text", delta: answer.answer });
    expect(events.find((e) => e.type === "sources")).toEqual({ type: "sources", items: answer.sources });
    expect(events.at(-1)).toMatchObject({ type: "done", model: null, stored: true });
  });

  it("POST of any other question says plainly that live answers are not available", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const events = await eventsOf(await POST(post({ question: "What burned in SAFFIRE?" })));
    expect(events).toEqual([{ type: "error", message: UNAVAILABLE_MESSAGE, stored: true }]);
  });

  it("refuses an over-long question and a body that is not JSON", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const long = await POST(post({ question: "a".repeat(801) }));
    expect(long.status).toBe(413);
    expect(await eventsOf(long)).toEqual([{ type: "error", message: "Questions can be at most 800 characters. This one has 801.", stored: true }]);
    expect((await POST(post("not json"))).status).toBe(400);
  });
});

describe("the handler with a key, a fake model and fake data", () => {
  const investigations = {
    count: 1,
    items: [{ psi_id: "PSI-69", acronym: "FLEX", title: "FLEX", pillar: "suppression", stage: "suppress", fuel_phase: "liquid", summary_plain: "Droplets.", table_count: 1, files_count: 2 }],
  };
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "http://data.test/api/v1/catalog/investigations") return Response.json(investigations);
    if (url.includes("anthropic.com")) throw new Error("the real model must not be called");
    return new Response("", { status: 404 });
  }) as typeof fetch;

  function deps(callModel: CallModel, extra: Partial<AskDeps> = {}): () => AskDeps {
    return () => ({ apiKey: "sk-fake", model: "claude-sonnet-5-5", apiOrigin: "http://data.test", fetcher, callModel, ...extra });
  }

  const reply = (content: unknown[], stop: string) =>
    ({ model: "claude-sonnet-5-5", content, stop_reason: stop, usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as BetaMessage;
  const model: CallModel = async (request) => {
    const answered = request.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result"));
    if (!answered) return reply([{ type: "tool_use", id: "1", name: "search_investigations", input: { text: "flex" } }], "tool_use");
    request.onText("FLEX burned fuel droplets [PSI-69].");
    return reply([{ type: "text", text: "FLEX burned fuel droplets [PSI-69]." }], "end_turn");
  };

  it("streams tool, text, sources and done, in that order", async () => {
    const handler = createAskHandler(deps(model));
    const status = await handler.status().json();
    expect(status.live).toBe(true);
    const response = await handler.ask(post({ question: "What did FLEX burn?", air: "station" }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    const events = await eventsOf(response);
    expect(events.map((e) => e.type)).toEqual(["tool", "text", "sources", "done"]);
    expect(events[1]).toEqual({ type: "text", delta: "FLEX burned fuel droplets [PSI-69]." });
    expect(events[2]).toEqual({ type: "sources", items: [{ kind: "investigation", id: "PSI-69", label: "FLEX", href: "/investigations/PSI-69" }] });
    expect(events[3]).toEqual({ type: "done", model: "claude-sonnet-5-5", saved_copy: false });
  });

  it("goes live even for a stored question when a key is set", async () => {
    const events = await eventsOf(await createAskHandler(deps(model)).ask(post({ question: STORED_ANSWERS[0].question })));
    expect(events.at(-1)).toMatchObject({ type: "done", model: "claude-sonnet-5-5" });
  });

  it("refuses the ninth question in ten minutes from one address", async () => {
    const handler = createAskHandler(deps(model));
    const from = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 8; i += 1) expect((await handler.ask(post({ question: "q" }, from))).status).toBe(200);
    const refused = await handler.ask(post({ question: "q" }, from));
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await eventsOf(refused))[0]).toMatchObject({ type: "error", stored: true, message: expect.stringMatching(/stored answers/) });
  });

  it("ends with the stored-answers message when the answer takes too long", async () => {
    const slow: CallModel = (request) =>
      new Promise((_, reject) => request.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const events = await eventsOf(await createAskHandler(deps(slow, { deadlineMs: 20 })).ask(post({ question: "q" })));
    expect(events).toEqual([{ type: "error", message: UNAVAILABLE_MESSAGE, stored: true }]);
  });

  it("never sends the key or a provider error to the browser", async () => {
    const failing: CallModel = async () => {
      throw new Error("401 invalid key sk-fake");
    };
    const text = await (await createAskHandler(deps(failing)).ask(post({ question: "q" }))).text();
    expect(text).not.toContain("sk-fake");
    expect(text).not.toContain("401");
  });
});

// A visitor's own key (DOB-161). The keys here are built in pieces so the repository's key
// scanner does not take them for real ones.
describe("a visitor's own API key", () => {
  const VISITOR = "sk-" + "ant-" + "visitor0".repeat(6);
  const SITE = "sk-" + "ant-" + "siteown0".repeat(6);
  const fetcher = (async (input: RequestInfo | URL) => {
    if (String(input).includes("anthropic.com")) throw new Error("the real model must not be called");
    return new Response("", { status: 404 });
  }) as typeof fetch;
  const reply = { model: "claude-sonnet-5-5", content: [{ type: "text", text: "I could not check that." }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } } as unknown as BetaMessage;

  /** A handler that records which key each request's model was made with. */
  function recording(apiKey: string | undefined, callModel: CallModel = async () => reply) {
    const keys: string[] = [];
    const handler = createAskHandler(() => ({
      apiKey,
      model: "claude-sonnet-5-5",
      apiOrigin: "http://data.test",
      fetcher,
      makeModel: (key) => {
        keys.push(key);
        return callModel;
      },
    }));
    return { handler, keys };
  }
  const withKey = (key: string, extra: Record<string, string> = {}) => ({ [KEY_HEADER]: key, ...extra });

  it("accepts only strings shaped like an Anthropic key", () => {
    expect(cleanKey(`  ${VISITOR}\n`)).toBe(VISITOR);
    for (const bad of ["", "sk-ant-short", "sk-proj-" + "a".repeat(40), VISITOR + " extra", VISITOR + "\r\nx-evil: 1", null, 42]) {
      expect(cleanKey(bad)).toBeNull();
    }
  });

  it("answers live on the visitor's key when the site has none", async () => {
    const { handler, keys } = recording(undefined);
    expect((await handler.status().json()).live).toBe(false);
    const events = await eventsOf(await handler.ask(post({ question: "q" }, withKey(VISITOR))));
    expect(keys).toEqual([VISITOR]);
    expect(events.at(-1)).toMatchObject({ type: "done", model: "claude-sonnet-5-5" });
  });

  it("uses the visitor's key instead of the site's, and the site's when none is sent", async () => {
    const { handler, keys } = recording(SITE);
    await (await handler.ask(post({ question: "q" }, withKey(VISITOR)))).text();
    await (await handler.ask(post({ question: "q" }))).text();
    expect(keys).toEqual([VISITOR, SITE]);
  });

  it("refuses a header that is not shaped like a key before any model is made", async () => {
    const { handler, keys } = recording(SITE);
    const response = await handler.ask(post({ question: "q" }, withKey("let-me-in")));
    expect(response.status).toBe(400);
    expect(await eventsOf(response)).toEqual([{ type: "error", message: KEY_SHAPE_MESSAGE, stored: true, reason: "key" }]);
    expect(keys).toEqual([]);
  });

  it("says plainly when Anthropic refuses the visitor's key, and tells the browser to forget it", async () => {
    const refusing: CallModel = async () => {
      throw new Anthropic.AuthenticationError(401, undefined, `invalid x-api-key ${VISITOR}`, new Headers());
    };
    const lines: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => void lines.push(args.join(" ")));
    const text = await (await recording(undefined, refusing).handler.ask(post({ question: "q" }, withKey(VISITOR)))).text();
    spy.mockRestore();
    expect(text.split("\n").filter(Boolean).map((l) => parseEvent(l))).toEqual([{ type: "error", message: KEY_REFUSED_MESSAGE, stored: true, reason: "key" }]);
    expect(text).not.toContain(VISITOR);
    // The server log names the failure, never the key.
    expect(lines.join("\n")).toContain("401");
    expect(lines.join("\n")).not.toContain(VISITOR);
  });

  it("does not blame the visitor when the site's own key is refused", async () => {
    const refusing: CallModel = async () => {
      throw new Anthropic.AuthenticationError(401, undefined, "x", new Headers());
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const events = await eventsOf(await recording(SITE, refusing).handler.ask(post({ question: "q" })));
    spy.mockRestore();
    expect(events).toEqual([{ type: "error", message: UNAVAILABLE_MESSAGE, stored: true }]);
  });

  it("says it is the visitor's own limit when their key is rate limited", async () => {
    const limited: CallModel = async () => {
      throw new Anthropic.RateLimitError(429, undefined, "x", new Headers());
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const events = await eventsOf(await recording(SITE, limited).handler.ask(post({ question: "q" }, withKey(VISITOR))));
    spy.mockRestore();
    expect(events).toEqual([{ type: "error", message: OWN_LIMIT_MESSAGE, stored: true }]);
  });

  it("never writes the key into a response: not the body, not a header", async () => {
    const { handler } = recording(SITE);
    const response = await handler.ask(post({ question: "q" }, withKey(VISITOR)));
    const headers = [...response.headers.entries()].flat().join(" ");
    expect(headers).not.toContain(VISITOR);
    expect(await response.text()).not.toContain(VISITOR);
    expect(JSON.stringify(await handler.status().json())).not.toContain("sk-");
  });

  it("gives a visitor on their own key a wider limit than the site's key, counted apart", async () => {
    const { handler } = recording(SITE);
    const from = { "x-forwarded-for": "203.0.113.20" };
    for (let i = 0; i < 40; i += 1) expect((await handler.ask(post({ question: "q" }, withKey(VISITOR, from)))).status).toBe(200);
    const refused = await handler.ask(post({ question: "q" }, withKey(VISITOR, from)));
    expect(refused.status).toBe(429);
    expect((await eventsOf(refused))[0]).toMatchObject({ message: expect.stringMatching(/^You have asked 40 questions/) });
    // The same address without a key still has the site's own allowance.
    expect((await handler.ask(post({ question: "q" }, from))).status).toBe(200);
  });
});
