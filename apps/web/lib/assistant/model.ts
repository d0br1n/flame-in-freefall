// The language model: Claude, through the official Anthropic SDK (@anthropic-ai/sdk). Server side
// only: the key (the site's ANTHROPIC_API_KEY, or a visitor's own key from the request header,
// see key.ts) is given to the one client created here, and never logged or sent to the browser.
//
// One request per round of the tool loop (run.ts), streamed with the SDK's helper
// (client.beta.messages.stream + finalMessage): text deltas are handed on as they arrive, the
// complete message comes back for the loop to read its stop reason and tool calls. The beta
// endpoint is used because the server-side refusal fallback (`fallbacks`) is a beta parameter.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaTextBlockParam,
  BetaTool,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { SYSTEM_PROMPT } from "./prompt";

/** The models the owner may choose with ASSISTANT_MODEL. The owner named Claude Sonnet 5.5. */
export const MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"] as const;
export type AssistantModel = (typeof MODELS)[number];
export const DEFAULT_MODEL: AssistantModel = "claude-sonnet-5-5";

/**
 * Effort "medium", set explicitly: the starting point the API guide gives for multistep tool use on
 * Claude Sonnet 5.5 (its levels were recalibrated; its default is high). Medium keeps the tool
 * calls few and the answer inside the route's 60 s limit; the numbers are guarded by the tools
 * and the grounding check. Opus 5.5 and Haiku 5.5 also accept it (their default is medium).
 */
export const EFFORT = "medium" as const;
/** Per response. Thinking counts toward it, so it is not set near the answer's length. */
export const MAX_OUTPUT_TOKENS = 16000;
/** One request may take this long (the SDK retries once on a connection error, 429 or 5xx). */
export const REQUEST_TIMEOUT_MS = 30_000;
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** ASSISTANT_MODEL, if it is one of the three allowed IDs; otherwise the default. */
export function resolveModel(value: string | undefined | null): AssistantModel {
  const wanted = value?.trim();
  return (MODELS as readonly string[]).includes(wanted ?? "") ? (wanted as AssistantModel) : DEFAULT_MODEL;
}

/**
 * The parameters that differ per model. Pure, unit tested.
 * - All three: adaptive thinking (a disabled setting is a 400 on Sonnet 5.5 and Opus 5.5), an
 *   explicit effort, no temperature or top_p (non-default values are rejected), no prefill, and
 *   tool_choice auto only (forced tool use is a 400 on Sonnet 5.5 and Opus 5.5).
 * - Sonnet 5.5 and Opus 5.5: the server-side refusal fallback in its "default" form (the form the
 *   guide prescribes for Sonnet 5.5: routes a declined request by refusal category).
 * - Haiku 5.5: no server-side fallback exists; a refusal is handled by the loop.
 */
export function modelOptions(model: AssistantModel): Pick<BetaMessageStreamParams, "thinking" | "output_config" | "betas" | "fallbacks"> {
  const common = { thinking: { type: "adaptive" as const }, output_config: { effort: EFFORT } };
  if (model === "claude-haiku-5-5") return common;
  return { ...common, betas: [FALLBACK_BETA], fallbacks: "default" };
}

export interface TurnRequest {
  tools: BetaTool[];
  messages: BetaMessageParam[];
  /** Called with each piece of answer text as it streams. */
  onText: (delta: string) => void;
  signal?: AbortSignal;
}

/** One round: stream the request, hand on text, return the complete message. Throws SDK errors. */
export type CallModel = (request: TurnRequest) => Promise<BetaMessage>;

/** The system prompt as one cached block: tools and system come first and never change. */
export function systemBlocks(): BetaTextBlockParam[] {
  return [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];
}

/**
 * The request body (without the key). Caching: an explicit breakpoint on the system block caches
 * the tools and the system prompt across conversations; the top-level automatic breakpoint
 * caches the growing conversation between the rounds of one question. Anything volatile (the
 * chosen cabin air) is in the user turn, after both. Pure, unit tested.
 */
export function requestParams(model: AssistantModel, request: Omit<TurnRequest, "onText" | "signal">): BetaMessageStreamParams {
  return {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: systemBlocks(),
    tools: request.tools,
    tool_choice: { type: "auto" },
    messages: request.messages,
    cache_control: { type: "ephemeral" },
    ...modelOptions(model),
  };
}

/** The one place the SDK client is created. */
export function createClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 1, timeout: REQUEST_TIMEOUT_MS });
}

/** The client surface the loop needs: tests pass a fake with the same shape. */
export type MessagesClient = Pick<Anthropic, "beta">;

export function createClaudeModel(client: MessagesClient, model: AssistantModel, log: (line: string) => void = console.info): CallModel {
  return async (request) => {
    const stream = client.beta.messages.stream(requestParams(model, request), { signal: request.signal });
    stream.on("text", (delta) => request.onText(delta));
    const message = await stream.finalMessage();
    const usage = message.usage;
    log(
      `[assistant] model=${message.model} stop=${message.stop_reason} input=${usage.input_tokens} ` +
        `cache_read=${usage.cache_read_input_tokens ?? 0} cache_write=${usage.cache_creation_input_tokens ?? 0} output=${usage.output_tokens}`,
    );
    return message;
  };
}

export type ModelFailure = "limit" | "key" | "failed";

/**
 * Why a model call failed, from the SDK's typed errors, most specific first. "limit": the
 * account's rate or spend limit (429, 402 billing). "key": the key was refused (401) or may not
 * do this (403). Everything else is "failed". The error's text is never shown to the visitor.
 */
export function classifyError(error: unknown): { kind: ModelFailure; detail: string } {
  if (error instanceof Anthropic.NotFoundError) return { kind: "failed", detail: "model or route not found (404)" };
  if (error instanceof Anthropic.RateLimitError) return { kind: "limit", detail: "rate limited (429)" };
  if (error instanceof Anthropic.AuthenticationError) return { kind: "key", detail: "the key was refused (401)" };
  if (error instanceof Anthropic.PermissionDeniedError) return { kind: "key", detail: "the key is not allowed to do this (403)" };
  if (error instanceof Anthropic.APIConnectionError) return { kind: "failed", detail: "no connection to the API" };
  if (error instanceof Anthropic.APIError) {
    return error.status === 402 ? { kind: "limit", detail: "billing limit (402)" } : { kind: "failed", detail: `API error ${error.status ?? "?"}` };
  }
  return { kind: "failed", detail: error instanceof Error ? error.name : "unknown error" };
}
