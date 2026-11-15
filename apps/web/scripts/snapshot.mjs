#!/usr/bin/env node
// Saves a copy of the backend's answers into public/snapshot/api/v1/, so the deployed site can
// still show its pages when the backend does not answer (lib/api.ts falls back to it and the
// page says "Showing a saved copy"). Run at build time, against the real backend:
//
//   node scripts/snapshot.mjs --origin https://<backend>      # or API_ORIGIN in the environment
//
// It fails (exit 1) if a route does not answer, so a deploy never ships a half-empty copy.
// Set SNAPSHOT_OPTIONAL=1 to build without a copy instead (local work only).
// Only JSON routes are saved. The tests explorer's filtered queries are not: with the backend
// down it shows its first view from the copy and says filtering needs the live service.
// Standard library only. Code generated with SI assistance (Claude Code), reviewed by the team.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileForPath } from "../lib/paths.mjs";
import { COMPARE_STARTS, comparePath } from "../lib/compareDefaults.mjs";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(WEB, "public", "snapshot");

/**
 * Every API path (below /api/v1) the site needs for its first view of each page.
 * Pure: unit tested in tests/unit/snapshot.test.ts.
 * @param {{ investigations: string[], airs: string[], modules: { id: string, jsonFiles: string[] }[], extra?: string[] }} known
 * @returns {string[]}
 */
export function snapshotPaths(known) {
  const paths = [
    "/catalog/investigations",
    "/air/presets",
    "/modules",
    // the tests explorer's first view: the first page of rows and every point of the chart
    "/catalog/tests",
    "/catalog/tests?limit=1&include=points",
    // the Video to Data page's list: NASA's whole BASS-II table (SERIES_TESTS_PATH in lib/spread.ts)
    "/catalog/tests?psi_id=PSI-25&limit=200",
  ];
  for (const psiId of known.investigations) paths.push(`/catalog/investigations/${psiId}`);
  for (const start of COMPARE_STARTS) paths.push(comparePath(start.ids));
  for (const air of known.airs) {
    const query = `air=${encodeURIComponent(air)}`;
    paths.push(`/air/coverage?${query}`, `/catalog/rank?${query}`);
  }
  for (const analysis of known.modules) {
    const base = `/modules/${analysis.id}`;
    paths.push(base, `${base}/evidence`, `${base}/findings`);
    for (const file of analysis.jsonFiles) paths.push(`${base}/files/${file}`);
  }
  return [...new Set([...paths, ...(known.extra ?? [])])];
}

/** The engine files a page reads as JSON. Pure. @param {{ files?: { name: string }[] }} analysis */
export function jsonFilesOf(analysis) {
  return (analysis.files ?? []).map((file) => file.name).filter((name) => name.toLowerCase().endsWith(".json"));
}

async function getJson(origin, path) {
  const response = await fetch(`${origin}/api/v1${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${path} answered HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const args = process.argv.slice(2);
  const flag = args.indexOf("--origin");
  const origin = (flag >= 0 ? args[flag + 1] : process.env.API_ORIGIN ?? "").replace(/\/+$/, "");
  const extraFlag = args.indexOf("--extra");
  const extra = extraFlag >= 0 ? args[extraFlag + 1].split(",").filter(Boolean) : [];
  if (!origin) throw new Error("no backend address: pass --origin <url> or set API_ORIGIN");

  const [catalog, presets, modules] = await Promise.all([
    getJson(origin, "/catalog/investigations"),
    getJson(origin, "/air/presets"),
    getJson(origin, "/modules"),
  ]);
  const served = modules.filter((row) => row.status !== "not_built" && !row.id.startsWith("_"));
  const details = await Promise.all(served.map((row) => getJson(origin, `/modules/${row.id}`)));
  const paths = snapshotPaths({
    investigations: catalog.items.map((item) => item.psi_id),
    airs: presets.presets.map((preset) => preset.id),
    modules: details.map((detail) => ({ id: detail.id, jsonFiles: jsonFilesOf(detail) })),
    extra,
  });

  let bytes = 0;
  for (const path of paths) {
    const text = JSON.stringify(await getJson(origin, path));
    const file = join(OUT, "api", "v1", fileForPath(path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    bytes += text.length;
  }
  const meta = { saved_at: new Date().toISOString(), paths: paths.length, bytes };
  writeFileSync(join(OUT, "meta.json"), JSON.stringify(meta, null, 1) + "\n");
  console.log(`snapshot: saved ${paths.length} answers (${(bytes / 1e6).toFixed(2)} MB) from ${origin} to public/snapshot/`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    if (process.env.SNAPSHOT_OPTIONAL === "1") {
      console.warn(`snapshot: skipped (${error.message}). The site will have no saved copy.`);
      return;
    }
    console.error(`snapshot: failed: ${error.message}`);
    process.exit(1);
  });
}
