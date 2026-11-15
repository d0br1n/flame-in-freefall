// Internal links carry the visitor's chosen cabin air from page to page: a preset as ?air=<id>, a
// custom air as ?air=custom&o2=<mole fraction>&p=<kPa>. Pure, unit tested.
// components/AppLink.tsx is the only caller in the UI.

export const AIR_PARAM = "air";
/** The custom air's oxygen, as a mole fraction (0.24 = 24 %). Only with air=custom. */
export const O2_PARAM = "o2";
/** The custom air's pressure, in kPa. Only with air=custom. */
export const PRESSURE_PARAM = "p";
/** Every URL parameter that belongs to the chosen air: they travel together. */
export const AIR_PARAMS = [AIR_PARAM, O2_PARAM, PRESSURE_PARAM] as const;

type QueryLike = URLSearchParams | { get(name: string): string | null } | string | null | undefined;

function readParam(current: QueryLike, name: string): string | null {
  if (current === null || current === undefined) return null;
  if (typeof current === "string") return new URLSearchParams(current.replace(/^\?/, "")).get(name);
  return current.get(name);
}

/**
 * Copy the air parameters of `current` into `out` (the air, plus o2 and p for a custom air).
 * Empty values are skipped. Used by every serializer that rewrites a page's query.
 */
export function copyAirParams(current: QueryLike, out: URLSearchParams): void {
  const air = readParam(current, AIR_PARAM);
  if (!air) return;
  out.set(AIR_PARAM, air);
  for (const name of [O2_PARAM, PRESSURE_PARAM]) {
    const value = readParam(current, name);
    if (value) out.set(name, value);
  }
}

/** True for links that leave the site (a scheme such as https: or mailto:, or //host). */
export function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

/**
 * The URL an internal link should open: `href` as given, plus the air parameters of the current
 * URL. Nothing else from the current URL is carried over (filters belong to one page). A query
 * already in `href` is kept, and an `air` written in `href` wins over the current one.
 */
export function withAir(href: string, current: QueryLike): string {
  if (isExternal(href)) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const beforeHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const queryAt = beforeHash.indexOf("?");
  const path = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  const params = new URLSearchParams(queryAt >= 0 ? beforeHash.slice(queryAt + 1) : "");

  if (!params.has(AIR_PARAM)) copyAirParams(current, params);

  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}${hash}`;
}
