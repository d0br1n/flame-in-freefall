// One mapping from an API path to a file name, shared by the app (saved-copy fallback),
// the fixture generator, the stub backend and the snapshot script.
// Plain JavaScript on purpose: Node scripts import it without a build step.

/**
 * "/catalog/tests?b=2&a=1" -> "catalog/tests__a=1&b=2.json"
 * "/catalog/investigations/PSI-25" -> "catalog/investigations/PSI-25.json"
 * @param {string} path API path below /api/v1, starting with "/", with an optional query.
 * @returns {string} relative file path
 */
export function fileForPath(path) {
  const [rawPath, rawQuery = ""] = path.split("?");
  const clean = rawPath.replace(/^\/+|\/+$/g, "");
  const params = new URLSearchParams(rawQuery);
  const pairs = [...params.entries()]
    .filter(([, value]) => value !== "")
    .sort(([ak, av], [bk, bv]) => (ak === bk ? av.localeCompare(bv) : ak.localeCompare(bk)))
    .map(([key, value]) => `${safe(key)}=${safe(value)}`);
  return pairs.length ? `${clean}__${pairs.join("&")}.json` : `${clean}.json`;
}

/** @param {string} text */
function safe(text) {
  return text.replace(/[^A-Za-z0-9._-]/g, "_");
}
