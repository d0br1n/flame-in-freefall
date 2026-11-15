import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL,
  EFFORT,
  FALLBACK_BETA,
  MAX_OUTPUT_TOKENS,
  MODELS,
  classifyError,
  createClaudeModel,
  modelOptions,
  requestParams,
  resolveModel,
  type MessagesClient,
} from "@/lib/assistant/model";
import { SYSTEM_PROMPT } from "@/lib/assistant/prompt";
import { toolSpecs } from "@/lib/assistant/tools";

// The Claude client: per-model parameters, the request body, the streaming call and errors.
// No key, no network: the SDK client is replaced by a fake of the same shape.

describe("models", () => {
  it("defaults to Claude Sonnet 5.5 and accepts only the three exact IDs", () => {
    expect(DEFAULT_MODEL).toBe("claude-sonnet-5-5");
    expect(MODELS).toEqual(["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"]);
    expect(resolveModel(undefined)).toBe("claude-sonnet-5-5");
    expect(resolveModel(" claude-opus-5-5 ")).toBe("claude-opus-5-5");
    expect(resolveModel("claude-haiku-5-5")).toBe("claude-haiku-5-5");
    expect(resolveModel("claude-sonnet-5-5-20260101")).toBe("claude-sonnet-5-5");
    expect(resolveModel("anthropic/claude-sonnet-5.5")).toBe("claude-sonnet-5-5");
  });

  it("sends each model only parameters it accepts", () => {
    for (const model of MODELS) {
      const options = modelOptions(model) as Record<string, unknown>;
      expect(options.thinking).toEqual({ type: "adaptive" });
      expect(options.output_config).toEqual({ effort: EFFORT });
      for (const banned of ["temperature", "top_p", "top_k", "budget_tokens"]) expect(options).not.toHaveProperty(banned);
    }
    expect(EFFORT).toBe("medium");
    expect(modelOptions("claude-sonnet-5-5")).toMatchObject({ betas: [FALLBACK_BETA], fallbacks: "default" });
    expect(modelOptions("claude-opus-5-5")).toMatchObject({ betas: [FALLBACK_BETA], fallbacks: "default" });
    // Haiku 5.5 has no server-side fallback.
    expect(modelOptions("claude-haiku-5-5")).not.toHaveProperty("fallbacks");
    expect(modelOptions("claude-haiku-5-5")).not.toHaveProperty("betas");
  });
});

describe("requestParams", () => {
  it("builds the request: cached system and tools, automatic caching of the tail, auto tool choice", () => {
    const tools = toolSpecs();
    const messages = [{ role: "user" as const, content: "q" }];
    expect(requestParams("claude-sonnet-5-5", { tools, messages })).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools,
      tool_choice: { type: "auto" },
      messages,
      cache_control: { type: "ephemeral" },
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  });

  it("declares every tool strict, with a closed schema and its required list", () => {
    for (const tool of toolSpecs()) {
      expect(tool.strict).toBe(true);
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema.additionalProperties).toBe(false);
      expect(Array.isArray(tool.input_schema.required)).toBe(true);
      expect(tool.description!.length).toBeGreaterThan(20);
    }
    expect(toolSpecs().map((t) => t.name)).toEqual([
      "search_investigations", "get_investigation", "query_tests", "get_test", "list_cabin_airs", "cabin_air_coverage",
      "rank_investigations", "list_analyses", "get_findings", "get_evidence", "next_tests_to_fly",
    ]);
  });
});

describe("createClaudeModel", () => {
  it("streams through the SDK helper, hands on text, returns the final message and logs the cache use", async () => {
    let seen: { params: unknown; options: unknown } | null = null;
    const final = {
      model: "claude-sonnet-5-5",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Hello" }],
      usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 2500, cache_creation_input_tokens: 0 },
    };
    const fake = {
      beta: {
        messages: {
          stream(params: unknown, options: unknown) {
            seen = { params, options };
            const handlers: ((delta: string) => void)[] = [];
            return {
              on(event: string, handler: (delta: string) => void) {
                if (event === "text") handlers.push(handler);
                return this;
              },
              async finalMessage() {
                handlers.forEach((h) => h("Hel"));
                handlers.forEach((h) => h("lo"));
                return final;
              },
            };
          },
        },
      },
    } as unknown as MessagesClient;
    const logs: string[] = [];
    const deltas: string[] = [];
    const stop = new AbortController();
    const model = createClaudeModel(fake, "claude-sonnet-5-5", (line) => logs.push(line));
    const message = await model({ tools: [], messages: [{ role: "user", content: "q" }], onText: (d) => deltas.push(d), signal: stop.signal });
    expect(message).toBe(final);
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(seen!.options).toEqual({ signal: stop.signal });
    expect((seen!.params as { model: string }).model).toBe("claude-sonnet-5-5");
    expect(logs).toEqual(["[assistant] model=claude-sonnet-5-5 stop=end_turn input=10 cache_read=2500 cache_write=0 output=3"]);
  });
});

describe("classifyError", () => {
  const headers = new Headers();
  it("reads the SDK's typed errors, most specific first", () => {
    expect(classifyError(new Anthropic.NotFoundError(404, undefined, "x", headers)).kind).toBe("failed");
    expect(classifyError(new Anthropic.RateLimitError(429, undefined, "x", headers))).toEqual({ kind: "limit", detail: "rate limited (429)" });
    expect(classifyError(new Anthropic.AuthenticationError(401, undefined, "x", headers)).kind).toBe("key");
    expect(classifyError(new Anthropic.PermissionDeniedError(403, undefined, "x", headers)).kind).toBe("key");
    expect(classifyError(new Anthropic.APIConnectionError({ message: "x" })).kind).toBe("failed");
    expect(classifyError(new Anthropic.APIError(402, undefined, "x", headers)).kind).toBe("limit");
    expect(classifyError(new Anthropic.InternalServerError(529, undefined, "x", headers)).kind).toBe("failed");
    expect(classifyError(new TypeError("x")).kind).toBe("failed");
  });
});
