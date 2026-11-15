#!/usr/bin/env node
// A stand-in backend for building and browser-testing the site: it serves the JSON files in
// fixtures/api/v1/ on the same paths as the real backend (apps/api). Development only: it is
// never deployed, and the real routes replace it as they land.
//
//   node scripts/stub-api.mjs            # http://127.0.0.1:8787
//   STUB_PORT=9000 node scripts/stub-api.mjs
//
// Standard library only. Code generated with SI assistance (Claude Code), reviewed by the team.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileForPath } from "../lib/paths.mjs";
import { oneTest, queryTests } from "./stub-tests.mjs";
import { moduleAnswer, sendAnswer } from "./stub-modules.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "api", "v1");
const PORT = Number(process.env.STUB_PORT ?? 8787);
const PREFIX = "/api/v1";
const TEST_ROWS = resolve(ROOT, "..", "..", "data", "tests.json");

/** The fixture file for a request URL, or null. Exact path and query first, then the path alone. */
export function fixtureFor(url, root = ROOT) {
  if (!url.startsWith(PREFIX)) return null;
  const path = url.slice(PREFIX.length) || "/";
  for (const candidate of [path, path.split("?")[0]]) {
    const file = resolve(root, fileForPath(candidate));
    if (file.startsWith(root) && existsSync(file)) return file;
  }
  return null;
}

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  createServer((request, response) => {
    const url = request.url ?? "/";
    if (request.method !== "GET") return send(response, 405, { detail: "The stub only answers GET." });
    if (url.split("?")[0] === `${PREFIX}/health`) return send(response, 200, { status: "ok", stub: true });
    if (url.split("?")[0] === `${PREFIX}/catalog/tests` && existsSync(TEST_ROWS)) {
      const rows = JSON.parse(readFileSync(TEST_ROWS, "utf8"));
      return send(response, 200, queryTests(rows, new URL(url, "http://stub").searchParams));
    }
    const testPrefix = `${PREFIX}/catalog/tests/`;
    if (url.startsWith(testPrefix) && existsSync(TEST_ROWS)) {
      const testId = decodeURIComponent(url.slice(testPrefix.length).split("?")[0]);
      const row = oneTest(JSON.parse(readFileSync(TEST_ROWS, "utf8")), testId);
      return row ? send(response, 200, row) : send(response, 404, { detail: `No test '${testId}'.` });
    }
    const modules = moduleAnswer(url);
    if (modules) return sendAnswer(response, modules);
    const file = fixtureFor(url);
    if (!file) return send(response, 404, { detail: `No fixture for ${url}. Fixtures live in apps/web/fixtures/api/v1/.` });
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(readFileSync(file));
  }).listen(PORT, "127.0.0.1", () => {
    console.log(`stub backend on http://127.0.0.1:${PORT}${PREFIX} (fixtures: ${join("fixtures", "api", "v1")})`);
  });
}
