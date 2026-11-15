// Limits of the assistant: question length, history length, and a per-address rate limit.
// Pure functions and a small in-memory limiter, unit tested.
//
// The hard spend cap is NOT here: it is the spend limit of the Anthropic workspace that owns
// ANTHROPIC_API_KEY (set in the Claude Console). When that limit is reached the API refuses the
// call and the assistant falls back to the stored answers. The in-memory limiter below only slows
// down one visitor; it resets when the server instance restarts and is per instance.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import type { AskRequest, HistoryTurn } from "./types";

export const MAX_QUESTION_CHARS = 800;
/** At most this many earlier messages (user or assistant, one each) are sent to the model. */
export const MAX_HISTORY_TURNS = 8;
/** Each earlier message is cut to this length before it is sent on. */
export const MAX_TURN_CHARS = 2000;
export const RATE_LIMIT_MAX = 8;
/** Questions per window for a visitor on their own API key (they pay for them). */
export const OWN_KEY_RATE_LIMIT_MAX = 40;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const AIR_ID = /^[a-z0-9_]{1,40}$/;

export function tooLongMessage(length: number): string {
  return `Questions can be at most ${MAX_QUESTION_CHARS} characters. This one has ${length}.`;
}

export type CheckedRequest =
  | { ok: true; question: string; history: HistoryTurn[]; air: string | null }
  | { ok: false; status: number; message: string };

/** Validate the body of POST /api/ask. Anything unexpected is dropped, never passed on. */
export function checkRequest(body: unknown): CheckedRequest {
  if (typeof body !== "object" || body === null) return { ok: false, status: 400, message: "Send a question." };
  const raw = body as Partial<AskRequest> & Record<string, unknown>;
  const question = typeof raw.question === "string" ? raw.question.trim() : "";
  if (!question) return { ok: false, status: 400, message: "Send a question." };
  if (question.length > MAX_QUESTION_CHARS) return { ok: false, status: 413, message: tooLongMessage(question.length) };
  const history: HistoryTurn[] = [];
  if (Array.isArray(raw.history)) {
    for (const turn of raw.history) {
      if (typeof turn !== "object" || turn === null) continue;
      const { role, text } = turn as unknown as Record<string, unknown>;
      if ((role === "user" || role === "assistant") && typeof text === "string" && text.trim()) {
        history.push({ role, text: text.trim().slice(0, MAX_TURN_CHARS) });
      }
    }
  }
  const air = typeof raw.air === "string" && AIR_ID.test(raw.air) ? raw.air : null;
  return { ok: true, question, history: history.slice(-MAX_HISTORY_TURNS), air };
}

/** The visitor's address: the first entry of x-forwarded-for (set by Vercel), else x-real-ip. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || headers.get("x-real-ip")?.trim() || "unknown").slice(0, 64);
}

export interface RateDecision {
  allowed: boolean;
  /** Seconds until the next question is allowed (0 when allowed). */
  retryAfter: number;
}

/** A sliding-window counter per key, in memory. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max = RATE_LIMIT_MAX,
    private readonly windowMs = RATE_LIMIT_WINDOW_MS,
    private readonly maxKeys = 5000,
  ) {}

  check(key: string, now = Date.now()): RateDecision {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    // Forget the oldest addresses so the map cannot grow without bound.
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
    return { allowed: true, retryAfter: 0 };
  }
}

export function rateLimitMessage(retryAfter: number, max = RATE_LIMIT_MAX): string {
  const minutes = Math.ceil(retryAfter / 60);
  return `You have asked ${max} questions in the last ${RATE_LIMIT_WINDOW_MS / 60000} minutes, the most this site allows. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}, or read the stored answers.`;
}
