// A visitor's own Anthropic API key (DOB-161). Shared by the browser and the server so both
// check the same shape. Pure: no storage and no network here.
//
// Where the key may be, and nowhere else:
// - Browser: the React state of AssistantProvider (the page's memory). Never localStorage,
//   sessionStorage, a cookie or the URL. A reload forgets it.
// - Wire: the KEY_HEADER header of POST /api/ask on this site (client.ts), over HTTPS.
// - Server: the one Anthropic client made for that one request (handler.ts). Never stored,
//   never logged, never part of a response.
// Code generated with SI assistance (Claude Code), reviewed by the team.

/** The request header that carries the visitor's key to POST /api/ask. */
export const KEY_HEADER = "x-assistant-key";

/** Anthropic API keys start with sk-ant- and use URL-safe characters only. */
const KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;

/** The key with surrounding spaces removed, or null when it does not have the shape of one. */
export function cleanKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return KEY_SHAPE.test(key) ? key : null;
}
