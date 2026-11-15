// The stub backend's stand-in for the module routes (docs/ENGINE_API_CONTRACT.md): it answers
// from the repo's data/modules/ folders the way apps/api/app/store.py does, so the pillar pages
// can be built and browser-tested without Python. Development only; the mock engine (_mock) is
// always served here. It checks only that the three contract files exist and parse and that the
// module's id and status are sane; contracts/validate.py remains the real gate.
// Standard library only, pure functions that take the modules directory. Code generated with SI
// assistance (Claude Code), reviewed by the team.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const MODULES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data", "modules");

/** Stub-only files that stand in for an engine's own (README.md in that folder). */
export const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "modules");

const CONTENT_TYPES = {
  ".json": "application/json",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/**
 * @typedef {{ id: string, folder: string, ok: boolean, problems: number,
 *   module?: Record<string, any>, evidence?: Record<string, any>[], findings?: Record<string, any>[] }} Engine
 * @typedef {{ status: number, body?: unknown, file?: string, contentType?: string }} Answer
 */

/** Every engine folder, hidden folders left out, sorted by name (as contracts/validate.py does). */
export function engineIds(dir = MODULES_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith(".") && statSync(resolve(dir, name)).isDirectory())
    .sort();
}

/** @returns {Engine} */
export function loadEngine(dir, id) {
  const folder = resolve(dir, id);
  /** @type {Record<string, any>} */
  const parts = {};
  let problems = 0;
  for (const name of ["module", "evidence", "findings"]) {
    try {
      parts[name] = JSON.parse(readFileSync(resolve(folder, `${name}.json`), "utf8"));
    } catch {
      problems += 1;
    }
  }
  const m = parts.module;
  if (m) {
    if (m.id !== id) problems += 1;
    if (!["example", "built"].includes(m.status)) problems += 1;
    if (!Array.isArray(m.files)) problems += 1;
  }
  if (parts.evidence && !Array.isArray(parts.evidence)) problems += 1;
  if (parts.findings && !Array.isArray(parts.findings)) problems += 1;
  if (problems > 0) return { id, folder, ok: false, problems };
  return { id, folder, ok: true, problems: 0, module: m, evidence: parts.evidence, findings: parts.findings };
}

/** One row of GET /modules. A not_built engine carries no numbers. */
export function summary(engine) {
  if (!engine.ok) return { id: engine.id, status: "not_built", problems: engine.problems };
  const m = engine.module;
  return {
    id: engine.id,
    status: m.status,
    title: m.title,
    stage: m.stage,
    question: m.question,
    evidence_count: engine.evidence.length,
    findings_count: engine.findings.length,
    problems: 0,
  };
}

/**
 * Evidence records matching the optional test_id and quantity filters.
 * @param {Record<string, any>[]} records
 * @param {string | null} [testId]
 * @param {string | null} [quantity]
 */
export function filterEvidence(records, testId = null, quantity = null) {
  return records.filter(
    (record) => (testId === null || record.test_id === testId) && (quantity === null || record.quantity === quantity),
  );
}

/** The stub-only file `<fixtureDir>/<id>/<name>`, or null. It wins over the engine's file of the same name. */
export function fixtureFile(fixtureDir, id, name) {
  if (name.includes("..") || id.includes("..")) return null;
  const folder = resolve(fixtureDir, id);
  const path = resolve(folder, name);
  if (!path.startsWith(folder + sep) || !existsSync(path) || !statSync(path).isFile()) return null;
  return path;
}

/** Stub-only evidence records in `<fixtureDir>/<id>/evidence-extra.json`, added to the engine's own; [] when absent. */
export function fixtureEvidence(fixtureDir, id) {
  const path = fixtureFile(fixtureDir, id, "evidence-extra.json");
  if (!path) return [];
  try {
    const records = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

/** The path of a file listed in module.json, inside the engine folder, or null. Nothing else is served. */
export function listedFile(engine, name) {
  if (!engine.ok || name.includes("..")) return null;
  const listed = new Set(engine.module.files.map((file) => file.name));
  if (!listed.has(name)) return null;
  const path = resolve(engine.folder, name);
  if (!path.startsWith(engine.folder + sep) || !existsSync(path) || !statSync(path).isFile()) return null;
  return path;
}

const notFound = (detail) => ({ status: 404, body: { detail } });

/**
 * The answer to one request below /api/v1, or null when the path is not a module route.
 * @param {string} url the request URL (path and query), for example "/api/v1/modules/_mock/evidence?test_id=PSI-0/MOCK-1"
 * @param {string} dir the modules directory
 * @param {string} [fixtureDir] stub-only files that replace an engine's own (fixtures/modules)
 * @returns {Answer | null}
 */
export function moduleAnswer(url, dir = MODULES_DIR, fixtureDir = FIXTURE_DIR) {
  const parsed = new URL(url, "http://stub");
  const match = /^\/api\/v1\/modules(?:\/([^/]+)(?:\/(evidence|findings|files\/(.+)))?)?\/?$/.exec(parsed.pathname);
  if (!match) return null;
  const [, rawId, route, rawName] = match;
  if (rawId === undefined) {
    return { status: 200, body: engineIds(dir).map((id) => summary(loadEngine(dir, id))) };
  }
  let id;
  let name;
  try {
    id = decodeURIComponent(rawId);
    name = rawName === undefined ? undefined : decodeURIComponent(rawName);
  } catch {
    return notFound("The path is not valid.");
  }
  if (!engineIds(dir).includes(id)) return notFound(`No engine '${id}'. GET /api/v1/modules lists the engines.`);
  const engine = loadEngine(dir, id);
  if (!engine.ok) {
    return notFound(
      `Engine '${id}' is not built: its folder fails the contract (${engine.problems} problem(s)). Run: python3 contracts/validate.py data/modules/${id}`,
    );
  }
  if (route === undefined) return { status: 200, body: engine.module };
  if (route === "evidence") {
    const params = parsed.searchParams;
    return { status: 200, body: filterEvidence([...engine.evidence, ...fixtureEvidence(fixtureDir, id)], params.get("test_id"), params.get("quantity")) };
  }
  if (route === "findings") return { status: 200, body: engine.findings };
  const file = name === undefined ? null : (fixtureFile(fixtureDir, id, name) ?? listedFile(engine, name));
  if (!file) return notFound(`Engine '${id}' has no file '${name}'. Only files listed in its module.json are served.`);
  return { status: 200, file, contentType: CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" };
}

/** Writes an answer to a node:http response. */
export function sendAnswer(response, answer) {
  if (answer.file) {
    response.writeHead(answer.status, { "content-type": answer.contentType, "cache-control": "no-store" });
    response.end(readFileSync(answer.file));
    return;
  }
  response.writeHead(answer.status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(answer.body));
}
