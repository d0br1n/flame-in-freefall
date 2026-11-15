// The only file that talks to the backend. Every page goes through getJson / useApi.
//
// The browser calls this site's own /api/v1/... (forwarded to the backend, see next.config.ts).
// If the backend does not answer, the saved copy bundled with the site build is used
// (public/snapshot/api/v1/..., written by scripts/snapshot.mjs) and the caller is told so.
"use client";

import { useCallback, useEffect, useState } from "react";
import { fileForPath } from "./paths.mjs";

export const API_BASE = "/api/v1";
export const SNAPSHOT_BASE = "/snapshot/api/v1";

export type ApiErrorKind = "unreachable" | "not_found" | "bad_request";

export class ApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;
  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

export interface ApiResult<T> {
  data: T;
  /** "live" from the backend, "saved" from the copy bundled with the site. */
  source: "live" | "saved";
  /** ISO date of the saved copy, when source is "saved" and the copy states it. */
  savedAt: string | null;
}

type Fetcher = typeof fetch;

/** How long the live backend may take before the saved copy is used instead (first load under 3 s). */
export const LIVE_TIMEOUT_MS = 2500;
/** After the live backend hung past the time limit, go straight to the saved copy for this long. */
export const LIVE_RETRY_AFTER_MS = 60_000;
/** The back-off is kept for the browser tab, so a reload or a typed URL does not wait again. */
export const LIVE_DOWN_KEY = "burnrate.liveDownUntil";

function tabStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // storage blocked: the back-off then lasts only while the page is open
  }
}

function storedDownUntil(): number {
  try {
    const value = Number(tabStorage()?.getItem(LIVE_DOWN_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function setDownUntil(until: number): void {
  liveDownUntil = until;
  try {
    if (until > 0) tabStorage()?.setItem(LIVE_DOWN_KEY, String(until));
    else tabStorage()?.removeItem(LIVE_DOWN_KEY);
  } catch {
    // storage full or blocked: the in-memory value still applies
  }
}

let liveDownUntil = storedDownUntil();

/** Ask the live backend again on the next request (used by "Try again" and by tests). */
export function resetLiveBackoff(): void {
  setDownUntil(0);
}

/** How a backend answer is classified. Pure, unit tested. */
export function classifyStatus(status: number): "ok" | ApiErrorKind {
  if (status >= 200 && status < 300) return "ok";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "bad_request";
  return "unreachable";
}

async function detailOf(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (body?.detail) return JSON.stringify(body.detail);
  } catch {
    // not JSON: fall through to the status text
  }
  return response.statusText || `HTTP ${response.status}`;
}

/**
 * A path with no saved copy (a custom cabin air, a filter) has only the live backend. It is asked
 * with this longer limit, whatever the back-off says: without it, one slow request left the cabin
 * air sliders dead for a minute (DOB-147).
 */
export const LIVE_ONLY_TIMEOUT_MS = 12_000;

type LiveAnswer<T> = { result: ApiResult<T> } | { failure: string; timedOut: boolean };

/** One request to the live backend with a time limit. An answer of any kind is returned or thrown. */
async function askLive<T>(path: string, fetcher: Fetcher, signal: AbortSignal | undefined, timeoutMs: number): Promise<LiveAnswer<T>> {
  // The live request gets a time limit: a backend that hangs must not keep the page waiting.
  const limit = new AbortController();
  const onAbort = () => limit.abort();
  if (signal?.aborted) limit.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    limit.abort();
  }, timeoutMs);
  try {
    const response = await fetcher(`${API_BASE}${path}`, {
      signal: limit.signal,
      headers: { Accept: "application/json" },
    });
    const kind = classifyStatus(response.status);
    if (kind === "ok") {
      return { result: { data: (await response.json()) as T, source: "live", savedAt: null } };
    }
    if (kind !== "unreachable") {
      throw new ApiError(kind, await detailOf(response), response.status);
    }
    return { failure: `The backend answered with an error (HTTP ${response.status}).`, timedOut: false };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted) throw error;
    return { failure: "The backend did not answer.", timedOut };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * GET one API path (below /api/v1, starting with "/").
 * A 404 or a rejected parameter is an answer and is thrown as such.
 * No answer at all (network error, 5xx, non-JSON) falls back to the saved copy. A path with no
 * saved copy is then asked from the live backend once more, with a longer limit.
 */
export async function getJson<T>(
  path: string,
  options: { signal?: AbortSignal; fetcher?: Fetcher; timeoutMs?: number; liveOnlyTimeoutMs?: number; now?: () => number } = {},
): Promise<ApiResult<T>> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  let failure = "The backend did not answer.";
  const backedOff = now() < liveDownUntil;
  let timedOut = false;
  if (!backedOff) {
    const live = await askLive<T>(path, fetcher, options.signal, options.timeoutMs ?? LIVE_TIMEOUT_MS);
    if ("result" in live) return live.result;
    failure = live.failure;
    timedOut = live.timedOut;
    // Only a backend that hangs starts the back-off: a quick failure costs nothing to retry,
    // and one failing route must not send every other request to the saved copy.
    if (timedOut) setDownUntil(now() + LIVE_RETRY_AFTER_MS);
  }

  try {
    const response = await fetcher(`${SNAPSHOT_BASE}/${fileForPath(path)}`, { signal: options.signal });
    if (response.ok) {
      const data = (await response.json()) as T;
      return { data, source: "saved", savedAt: response.headers.get("x-saved-at") };
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
  }

  // No saved copy for this path. If the backend was skipped (back-off) or cut off at the short
  // limit, it is the only source left: ask it, and wait longer for it.
  if (backedOff || timedOut) {
    const live = await askLive<T>(path, fetcher, options.signal, options.liveOnlyTimeoutMs ?? LIVE_ONLY_TIMEOUT_MS);
    if ("result" in live) return live.result;
    failure = live.failure;
  }
  throw new ApiError("unreachable", failure);
}

// One request per path while the page is open: the shell and the page often ask for the same thing.
const cache = new Map<string, Promise<ApiResult<unknown>>>();

export function getJsonCached<T>(path: string): Promise<ApiResult<T>> {
  let pending = cache.get(path);
  if (!pending) {
    pending = getJson<unknown>(path);
    cache.set(path, pending);
    pending.catch(() => cache.delete(path));
  }
  return pending as Promise<ApiResult<T>>;
}

export function clearApiCache(): void {
  cache.clear();
  resetLiveBackoff();
}

export type ApiState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T; source: "live" | "saved"; savedAt: string | null }
  | { status: "error"; error: ApiError };

/** useApi's answer, plus `retry` to ask again (for a "Try again" button). */
export type ApiHandle<T> = ApiState<T> & { retry: () => void };

/** Load one API path in a client component. Pass null to wait (for example for a parameter). */
export function useApi<T>(path: string | null): ApiHandle<T> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ path: string | null; attempt: number; value: ApiState<T> }>({
    path,
    attempt: 0,
    value: { status: "loading" },
  });

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    getJsonCached<T>(path).then(
      (result) => {
        if (!cancelled) setState({ path, attempt, value: { status: "ok", ...result } });
      },
      (error: unknown) => {
        if (cancelled) return;
        const apiError =
          error instanceof ApiError ? error : new ApiError("unreachable", "The backend did not answer.");
        setState({ path, attempt, value: { status: "error", error: apiError } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, attempt]);

  const retry = useCallback(() => {
    if (path !== null) cache.delete(path);
    resetLiveBackoff();
    setAttempt((value) => value + 1);
  }, [path]);

  // While a new path (or a new attempt) is loading, never show the previous answer.
  const value: ApiState<T> = state.path === path && state.attempt === attempt ? state.value : { status: "loading" };
  return { ...value, retry };
}

/**
 * Like useApi, but while a new path loads the previous answer stays (marked `stale`), so a card
 * updates calmly when the cabin air changes instead of flashing back to a skeleton.
 */
export function useKeptApi<T>(path: string | null): ApiHandle<T> & { kept: T | null; stale: boolean } {
  const handle = useApi<T>(path);
  const [kept, setKept] = useState<{ path: string; data: T } | null>(null);
  if (handle.status === "ok" && path !== null && (kept === null || kept.path !== path || kept.data !== handle.data)) {
    setKept({ path, data: handle.data });
  }
  const data = handle.status === "ok" ? handle.data : handle.status === "loading" ? (kept?.data ?? null) : null;
  return { ...handle, kept: data, stale: handle.status === "loading" && data !== null };
}
