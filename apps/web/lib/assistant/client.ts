// The only browser module that calls /api/ask. lib/api.ts stays the only one that calls the
// data service. Every failure becomes an error event the panel can show; nothing throws except
// a stop by the visitor (an AbortError).
// Code generated with SI assistance (Claude Code), reviewed by the team.
"use client";

import { KEY_HEADER } from "./key";
import { UNAVAILABLE_MESSAGE } from "./messages";
import { readEvents } from "./stream";
import type { AskEvent, AskRequest, AskStatus } from "./types";

export const ASK_PATH = "/api/ask";

/** Whether live answers are possible. Null when the site does not answer. */
export async function fetchAskStatus(signal?: AbortSignal): Promise<AskStatus | null> {
  try {
    const response = await fetch(ASK_PATH, { signal, headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<AskStatus>;
    return { live: body.live === true, stored: Array.isArray(body.stored) ? body.stored : [] };
  } catch {
    return null;
  }
}

/**
 * Ask one question; events arrive through onEvent. Always ends with a done or an error event.
 * key: the visitor's own API key, if they gave one. It goes in a header of this one same-site
 * request and nowhere else: not in the body, not in the URL, and a redirect is refused so the
 * header can never be carried to another address.
 */
export async function ask(request: AskRequest, onEvent: (event: AskEvent) => void, signal?: AbortSignal, key?: string | null): Promise<void> {
  let ended = false;
  const handle = (event: AskEvent) => {
    if (ended) return;
    if (event.type === "done" || event.type === "error") ended = true;
    onEvent(event);
  };
  try {
    const response = await fetch(ASK_PATH, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson", ...(key ? { [KEY_HEADER]: key } : {}) },
      cache: "no-store",
      redirect: "error",
      body: JSON.stringify(request),
    });
    const type = response.headers.get("content-type") ?? "";
    if (response.body && type.includes("ndjson")) await readEvents(response.body, handle);
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  if (!ended) handle({ type: "error", message: UNAVAILABLE_MESSAGE, stored: true });
}
