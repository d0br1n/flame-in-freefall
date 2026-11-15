// POST /api/ask and GET /api/ask, as plain functions over injected parts so a test can run them
// with a fake model and fake data. app/api/ask/route.ts wires the real ones.
//
// No key, a failed model call or the rate limit: the visitor is told plainly and offered the
// stored answers. The key, the provider's errors and the data service's errors never reach
// the browser.
//
// Whose key (DOB-161): a visitor may send their own Anthropic key in the KEY_HEADER header
// (key.ts). It is checked for shape, handed to the one client of this one request, and dropped
// with the request: never stored, never logged, never written into a response. It wins over the
// site's key. With neither, the answers are the stored ones.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { KEY_HEADER, cleanKey } from "./key";
import { OWN_KEY_RATE_LIMIT_MAX, RATE_LIMIT_MAX, RateLimiter, checkRequest, clientKey, rateLimitMessage } from "./limits";
import { createClaudeModel, createClient, resolveModel, type AssistantModel, type CallModel } from "./model";
import { KEY_SHAPE_MESSAGE, UNAVAILABLE_MESSAGE } from "./messages";
import { runAssistant } from "./run";
import { STORED_ANSWERS, findStored, storedEvents } from "./stored";
import { STREAM_CONTENT_TYPE, encodeEvent, eventsBody } from "./stream";
import { createDataFetcher, createToolbox } from "./tools";
import type { AskEvent, AskStatus } from "./types";

/** The whole answer may take this long; the route's maxDuration is a little longer. */
export const ANSWER_DEADLINE_MS = 55_000;
/** A request body larger than this is refused before it is read as JSON. */
const MAX_BODY_CHARS = 40_000;

export interface AskDeps {
  /** ANTHROPIC_API_KEY, the site's own key; empty or missing means stored answers unless the visitor sends a key. */
  apiKey: string | undefined;
  /** ASSISTANT_MODEL (one of the three allowed IDs), default claude-opus-5-5. */
  model: AssistantModel;
  /** API_ORIGIN: the data service. */
  apiOrigin: string;
  /** Tests inject these; the route uses fetch and the Anthropic SDK client. */
  fetcher?: typeof fetch;
  callModel?: CallModel;
  /** Makes the model for one request from the key it runs on (default: the Anthropic SDK client). */
  makeModel?: (apiKey: string, model: AssistantModel) => CallModel;
  deadlineMs?: number;
}

export function depsFromEnv(): AskDeps {
  const env = process.env;
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    model: resolveModel(env.ASSISTANT_MODEL),
    apiOrigin: (env.API_ORIGIN ?? "http://127.0.0.1:8000").replace(/\/+$/, ""),
  };
}

const HEADERS = {
  "Content-Type": STREAM_CONTENT_TYPE,
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
};

function eventsResponse(events: AskEvent[], status = 200, extra: Record<string, string> = {}): Response {
  return new Response(eventsBody(events), { status, headers: { ...HEADERS, ...extra } });
}

function errorResponse(message: string, status = 200, extra: Record<string, string> = {}, reason?: "key"): Response {
  return eventsResponse([{ type: "error", message, stored: true, ...(reason ? { reason } : {}) }], status, extra);
}

export function createAskHandler(getDeps: () => AskDeps = depsFromEnv) {
  const limiter = new RateLimiter();
  // A visitor on their own key pays for their own questions; this only stops the route being hammered.
  const ownKeyLimiter = new RateLimiter(OWN_KEY_RATE_LIMIT_MAX);

  return {
    status(): Response {
      const deps = getDeps();
      const body: AskStatus = {
        live: Boolean(deps.apiKey),
        stored: STORED_ANSWERS.map((a) => ({ id: a.id, question: a.question, chip: a.chip })),
      };
      return Response.json(body, { headers: { "Cache-Control": "no-store" } });
    },

    async ask(request: Request): Promise<Response> {
      const deps = getDeps();
      let body: unknown;
      try {
        const text = await request.text();
        if (text.length > MAX_BODY_CHARS) return errorResponse("This question is too long.", 413);
        body = JSON.parse(text);
      } catch {
        return errorResponse("Send a question.", 400);
      }
      const checked = checkRequest(body);
      if (!checked.ok) return errorResponse(checked.message, checked.status);

      // The visitor's own key, if they sent one. A header that is not shaped like a key is refused
      // here, before anything is done with it.
      const sent = request.headers.get(KEY_HEADER);
      const visitorKey = sent === null ? null : cleanKey(sent);
      if (sent !== null && !visitorKey) return errorResponse(KEY_SHAPE_MESSAGE, 400, {}, "key");
      const apiKey = visitorKey ?? deps.apiKey;
      const ownKey = visitorKey !== null;

      if (!apiKey) {
        const stored = findStored(checked.question);
        return stored ? eventsResponse(storedEvents(stored)) : errorResponse(UNAVAILABLE_MESSAGE);
      }

      const max = ownKey ? OWN_KEY_RATE_LIMIT_MAX : RATE_LIMIT_MAX;
      const decision = (ownKey ? ownKeyLimiter : limiter).check(clientKey(request.headers));
      if (!decision.allowed) {
        return errorResponse(rateLimitMessage(decision.retryAfter, max), 429, { "Retry-After": String(decision.retryAfter) });
      }

      // The saved copy of the data is served by this site itself.
      const origin = new URL(request.url).origin;
      const fetcher = deps.fetcher ?? fetch;
      const makeModel = deps.makeModel ?? ((key, model) => createClaudeModel(createClient(key), model));
      const callModel = deps.callModel ?? makeModel(apiKey, deps.model);
      const toolbox = createToolbox(createDataFetcher({ apiOrigin: deps.apiOrigin, siteOrigin: origin, fetcher }));
      const stop = new AbortController();
      request.signal?.addEventListener("abort", () => stop.abort(), { once: true });
      const encoder = new TextEncoder();

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let finished = false;
          const emit = (event: AskEvent) => {
            if (finished) return;
            if (event.type === "done" || event.type === "error") finished = true;
            try {
              controller.enqueue(encoder.encode(encodeEvent(event)));
            } catch {
              // the visitor left: nothing to send to
            }
          };
          const deadline = setTimeout(() => {
            emit({ type: "error", message: UNAVAILABLE_MESSAGE, stored: true });
            stop.abort();
          }, deps.deadlineMs ?? ANSWER_DEADLINE_MS);
          try {
            await runAssistant({
              question: checked.question,
              history: checked.history,
              air: checked.air,
              callModel,
              ownKey,
              toolbox,
              emit,
              signal: stop.signal,
            });
          } finally {
            clearTimeout(deadline);
            try {
              controller.close();
            } catch {
              // already closed
            }
          }
        },
        cancel() {
          stop.abort();
        },
      });
      return new Response(stream, { headers: HEADERS });
    },
  };
}
