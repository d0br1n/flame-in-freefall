// The assistant's tools: small, read-only questions to this site's own data service
// (apps/api, routes in docs/ENGINE_API_CONTRACT.md). Server side only.
//
// Rules (they are what keeps answers honest):
// - Every tool takes IDs and enumerated values only, validated here. No URL is built from free
//   text: free values (a fuel name) go into a query string through URLSearchParams.
// - A bad argument returns an error result the model can read; a tool never throws.
// - Results are small: at most 20 rows, long texts trimmed, fields the model does not need dropped.
// - Every result lists its sources (PSI IDs, test IDs, analyses, file names). The grounding
//   check (ground.ts) accepts a citation only if it appears in a tool result.
// - When the live service does not answer, a route that is in the saved copy
//   (public/snapshot/, scripts/snapshot.mjs) is read from there, and the result says so.
//
// Imports: only lib/paths.mjs at run time (type imports are erased), so the stored-answers script
// (scripts/make-stored-answers.mjs) can load this file without a build step.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { fileForPath } from "../paths.mjs";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { DataOrigin, ToolResult, ToolSource } from "./types";

/** How long the live data service may take before the saved copy is tried. */
export const DATA_TIMEOUT_MS = 6000;
/** No tool hands the model more rows than this. */
export const MAX_ROWS = 20;

export type DataErrorKind = "not_found" | "bad_request" | "unreachable";

export class DataError extends Error {
  kind: DataErrorKind;
  constructor(kind: DataErrorKind, message: string) {
    super(message);
    this.name = "DataError";
    this.kind = kind;
  }
}

export interface DataResponse {
  data: unknown;
  from: DataOrigin;
}

/** GET one path below /api/v1 (starting with "/"). Throws DataError. */
export type FetchJson = (path: string) => Promise<DataResponse>;

export interface DataFetcherOptions {
  /** The data service, for example http://127.0.0.1:8000 (API_ORIGIN). */
  apiOrigin: string;
  /** This site's own address, where the saved copy is served; null: no saved copy. */
  siteOrigin: string | null;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

async function detailOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body?.detail === "string") return trim(body.detail, 200) ?? `HTTP ${response.status}`;
  } catch {
    // not JSON
  }
  return `HTTP ${response.status}`;
}

/**
 * The live data service with a time limit, then the saved copy. A 404 or 422 is an answer
 * (thrown as such, never replaced by the saved copy); no answer at all falls back.
 */
export function createDataFetcher(options: DataFetcherOptions): FetchJson {
  const fetcher = options.fetcher ?? fetch;
  const apiOrigin = options.apiOrigin.replace(/\/+$/, "");
  const siteOrigin = options.siteOrigin ? options.siteOrigin.replace(/\/+$/, "") : null;
  const timeoutMs = options.timeoutMs ?? DATA_TIMEOUT_MS;

  return async (path: string) => {
    const limit = new AbortController();
    const timer = setTimeout(() => limit.abort(), timeoutMs);
    try {
      const response = await fetcher(`${apiOrigin}/api/v1${path}`, {
        signal: limit.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (response.ok) return { data: await response.json(), from: "live" };
      if (response.status === 404) throw new DataError("not_found", await detailOf(response));
      if (response.status === 400 || response.status === 422) {
        throw new DataError("bad_request", await detailOf(response));
      }
    } catch (error) {
      if (error instanceof DataError) throw error;
      // no answer: try the saved copy
    } finally {
      clearTimeout(timer);
    }
    if (siteOrigin) {
      const saved = new AbortController();
      const savedTimer = setTimeout(() => saved.abort(), timeoutMs);
      try {
        const response = await fetcher(`${siteOrigin}/snapshot/api/v1/${fileForPath(path)}`, {
          signal: saved.signal,
          headers: { Accept: "application/json" },
        });
        if (response.ok) return { data: await response.json(), from: "saved_copy" };
      } catch {
        // no saved copy either
      } finally {
        clearTimeout(savedTimer);
      }
    }
    throw new DataError("unreachable", "The data service did not answer and this question is not in the saved copy.");
  };
}

// ---------------------------------------------------------------- small helpers

/** A text cut at a word boundary to at most `max` characters, with an ellipsis when cut. */
export function trim(text: unknown, max: number): string | null {
  if (typeof text !== "string") return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asObject = (value: unknown): Json => (isObject(value) ? value : {});
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

class BadArgument extends Error {}

function fail(message: string): ToolResult {
  return { ok: false, error: message, sources: [] };
}

const PSI_ID = /^PSI-\d{1,4}$/;
const TEST_ID = /^PSI-\d{1,4}\/[A-Za-z0-9 #()._/-]{1,120}$/;
const AIR_ID = /^[a-z0-9_]{1,40}$/;
const ANALYSIS_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const QUANTITY = /^[a-z0-9_]{1,60}$/;

/** "PSI-69", "psi-69" and "69" all mean PSI-69. Throws BadArgument. */
export function parsePsiId(value: unknown, name = "psi_id"): string {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().toUpperCase() : "";
  const id = /^\d+$/.test(text) ? `PSI-${text}` : text;
  if (!PSI_ID.test(id)) throw new BadArgument(`${name} must be a PSI investigation ID such as PSI-69.`);
  return id;
}

/** A test ID such as PSI-69/114 or PSI-39/1285#23. Throws BadArgument. */
export function parseTestId(value: unknown): string {
  const text = typeof value === "string" ? value.trim().replace(/^psi-/i, "PSI-") : "";
  if (!TEST_ID.test(text)) throw new BadArgument("test_id must be a test ID such as PSI-69/114.");
  return text;
}

function optional<T>(args: Json, name: string, parse: (value: unknown) => T): T | undefined {
  const value = args[name];
  return value === undefined || value === null || value === "" ? undefined : parse(value);
}

function matching(pattern: RegExp, what: string) {
  return (value: unknown): string => {
    if (typeof value !== "string" || !pattern.test(value.trim())) throw new BadArgument(`${what}.`);
    return value.trim();
  };
}

function oneOf<T extends string>(values: readonly T[], name: string) {
  return (value: unknown): T => {
    const text = typeof value === "string" ? value.trim().toLowerCase() : "";
    const found = values.find((v) => v === text);
    if (!found) throw new BadArgument(`${name} must be one of: ${values.join(", ")}.`);
    return found;
  };
}

/** A free value from a facet (a fuel name, an outcome): it only ever goes into a query string. */
function facetValue(name: string) {
  return (value: unknown): string => {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || text.length > 80 || /[\u0000-\u001f]/.test(text)) {
      throw new BadArgument(`${name} must be a short value as the tests table writes it (see the facets of query_tests).`);
    }
    return text;
  };
}

function numberIn(name: string, min: number, max: number, hint = "") {
  return (value: unknown): number => {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) {
      throw new BadArgument(`${name} must be a number from ${min} to ${max}${hint}.`);
    }
    return n;
  };
}

function limitOf(args: Json, fallback: number): number {
  const value = optional(args, "limit", numberIn("limit", 1, 1000));
  return Math.min(MAX_ROWS, Math.max(1, Math.round(value ?? fallback)));
}

/** The page an analysis lives on, by its fire stage. */
export function analysisPage(stage: unknown): string {
  return stage === "spread" ? "/spread" : stage === "suppress" ? "/suppress" : "/";
}

function dedupe(sources: ToolSource[]): ToolSource[] {
  const seen = new Map<string, ToolSource>();
  for (const source of sources) {
    const key = `${source.kind}:${source.id}`;
    const known = seen.get(key);
    if (!known) seen.set(key, source);
    else if (!known.label && source.label) seen.set(key, { ...known, label: source.label });
  }
  return [...seen.values()];
}

function primitive(value: unknown, max = 120): unknown {
  if (typeof value === "string") return trim(value, max);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return undefined;
}

/** At most `keys` primitive entries of an object, long strings trimmed. */
function smallObject(value: unknown, keys: number, max = 120): Json {
  const out: Json = {};
  for (const [key, entry] of Object.entries(asObject(value))) {
    if (Object.keys(out).length >= keys) break;
    const small = primitive(entry, max);
    if (small !== undefined) out[key] = small;
  }
  return out;
}

// ---------------------------------------------------------------- the tools

export interface ToolContext {
  fetchJson: FetchJson;
  /** Paths already read in this conversation: one request per path. */
  memo: Map<string, Promise<DataResponse>>;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Json;
  /** A plain line shown while the tool runs, for example "Looking up FLEX tests". */
  label: (args: Json) => string;
  run: (args: Json, ctx: ToolContext) => Promise<ToolResult>;
}

function get(ctx: ToolContext, path: string): Promise<DataResponse> {
  let pending = ctx.memo.get(path);
  if (!pending) {
    pending = ctx.fetchJson(path);
    ctx.memo.set(path, pending);
  }
  return pending;
}

/** psi_id -> acronym (or the ID), from the investigations list. */
async function investigationLabels(ctx: ToolContext): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  try {
    const { data } = await get(ctx, "/catalog/investigations");
    for (const item of asArray(asObject(data).items)) {
      const row = asObject(item);
      const id = str(row.psi_id);
      if (id) labels.set(id, str(row.acronym) ?? id);
    }
  } catch {
    // labels are a convenience: the IDs still stand
  }
  return labels;
}

function worst(...origins: DataOrigin[]): DataOrigin {
  return origins.includes("saved_copy") ? "saved_copy" : "live";
}

const PILLARS = ["prevention", "detection", "suppression", "related", "fundamentals"] as const;
const STAGES = ["spread", "detect", "suppress", "none"] as const;
const FUEL_PHASES = ["solid", "liquid", "gas", "aerosol"] as const;
const ADDED_GASES = ["carbon dioxide", "helium", "none"] as const;

const UNITS_NOTE =
  "Oxygen is a mole fraction (0.21 means 21%). Pressure is in kPa (101.325 kPa = 1 atm = 14.7 psi). " +
  "Flow is in cm/s. null means the PSI table does not state the value.";

const searchInvestigations: ToolDefinition = {
  name: "search_investigations",
  description:
    "Find PSI combustion investigations by words and tags. Returns each one's PSI ID, acronym, title, fire-safety pillar, fire stage, fuel phase, plain summary and how many tables and files PSI holds.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Words that must all appear (acronym, title, summary), e.g. 'droplet' or 'BASS'." },
      pillar: { type: "string", enum: [...PILLARS] },
      stage: { type: "string", enum: [...STAGES], description: "Fire stage; 'none' for investigations with no stage." },
      fuel_phase: { type: "string", enum: [...FUEL_PHASES] },
    },
    additionalProperties: false,
  },
  label: () => "Searching the 24 investigations",
  async run(args, ctx) {
    const text = optional(args, "text", (v) => {
      if (typeof v !== "string" || v.length > 80) throw new BadArgument("text must be a few words.");
      return v.toLowerCase();
    });
    const pillar = optional(args, "pillar", oneOf(PILLARS, "pillar"));
    const stage = optional(args, "stage", oneOf(STAGES, "stage"));
    const fuelPhase = optional(args, "fuel_phase", oneOf(FUEL_PHASES, "fuel_phase"));
    const { data, from } = await get(ctx, "/catalog/investigations");
    const all = asArray(asObject(data).items).map(asObject);
    const words = (text ?? "").split(/\s+/).filter(Boolean);
    const matched = all.filter((row) => {
      if (pillar && row.pillar !== pillar) return false;
      if (stage && (row.stage ?? "none") !== stage) return false;
      if (fuelPhase && row.fuel_phase !== fuelPhase) return false;
      const hay = [row.psi_id, row.acronym, row.title, row.summary_plain, row.psi_sub_area]
        .map((v) => (typeof v === "string" ? v.toLowerCase() : ""))
        .join(" ");
      return words.every((word) => hay.includes(word));
    });
    const items = matched.slice(0, MAX_ROWS).map((row) => ({
      psi_id: row.psi_id,
      acronym: row.acronym,
      title: trim(row.title, 140),
      pillar: row.pillar,
      stage: row.stage,
      fuel_phase: row.fuel_phase,
      ground_investigation: row.ground_investigation,
      summary: trim(row.summary_plain, matched.length > 8 ? 200 : 360),
      tables: row.table_count,
      files: row.files_count,
    }));
    return {
      ok: true,
      from,
      data: {
        total: all.length,
        matched: matched.length,
        items,
        ...(matched.length > items.length ? { not_shown: matched.length - items.length } : {}),
        note: "Summaries and tags are the team's curation (summaries drafted with SI from PSI's own text).",
      },
      sources: items.map((row) => ({ kind: "investigation", id: String(row.psi_id), label: str(row.acronym) ?? undefined })),
    };
  },
};

const getInvestigation: ToolDefinition = {
  name: "get_investigation",
  description:
    "Read one PSI investigation: plain summary, NASA's objective, what was measured, what it cannot tell, what data PSI holds, related investigations and the site's analyses that use it.",
  parameters: {
    type: "object",
    properties: { psi_id: { type: "string", description: "A PSI ID such as PSI-69." } },
    required: ["psi_id"],
    additionalProperties: false,
  },
  label: (args) => {
    try {
      return `Reading ${parsePsiId(args.psi_id)}`;
    } catch {
      return "Reading an investigation";
    }
  },
  async run(args, ctx) {
    const psiId = parsePsiId(args.psi_id);
    const { data, from } = await get(ctx, `/catalog/investigations/${psiId}`);
    const d = asObject(data);
    const tags = asObject(d.tags);
    const files = asObject(d.files);
    const conditions = asObject(d.conditions);
    const engines = asArray(d.engines).map(asObject);
    const related = asArray(d.related).filter((x): x is string => typeof x === "string" && PSI_ID.test(x));
    const tables = asArray(files.tables).map((t) => str(asObject(t).file_name)).filter((x): x is string => !!x);
    return {
      ok: true,
      from,
      data: {
        psi_id: d.psi_id,
        acronym: d.acronym,
        title: trim(d.title, 200),
        pillar: d.pillar,
        stage: d.stage,
        fuel_phase: d.fuel_phase,
        ground_investigation: d.ground_investigation,
        summary: trim(d.summary_plain, 500),
        summary_written_by: d.summary_written_by,
        nasa_objective: trim(asObject(d.psi_text).objective, 700),
        measurements: asArray(asObject(tags.measurements).value).slice(0, 12),
        cannot_tell: asArray(d.cannot_tell).map((t) => trim(t, 300)).slice(0, 6),
        hardware: trim(conditions.hardware, 120),
        flight_program: trim(conditions.flight_program, 80),
        dates: { start: conditions.start_date ?? null, end: conditions.end_date ?? null },
        data_held: {
          experimental_tables: tables.slice(0, 6),
          data_files: files.count,
          file_groups: asArray(files.by_category)
            .slice(0, 6)
            .map((g) => ({ category: asObject(g).category, count: asObject(g).count })),
          publications: d.publications_count,
        },
        related,
        analyses: engines.map((e) => ({ id: e.id, title: e.title, stage: e.stage, status: e.status, page: analysisPage(e.stage) })),
        psi_link: d.psi_url,
      },
      sources: dedupe([
        { kind: "investigation", id: psiId, label: str(d.acronym) ?? undefined },
        ...related.map((id): ToolSource => ({ kind: "investigation", id })),
        ...tables.map((name): ToolSource => ({ kind: "file", id: name })),
        ...engines.map(
          (e): ToolSource => ({ kind: "analysis", id: String(e.id), label: str(e.title) ?? undefined, href: analysisPage(e.stage), psi_ids: [psiId] }),
        ),
      ]),
    };
  },
};

/** min and max over the matching tests that state both oxygen and pressure (from include=points). */
function pointRanges(points: unknown): Json | null {
  const items = asArray(asObject(points).items).filter(
    (p): p is [string, string, number, number] => Array.isArray(p) && typeof p[2] === "number" && typeof p[3] === "number",
  );
  if (!items.length) return null;
  const range = (index: 2 | 3) => {
    const values = items.map((p) => p[index]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const atMax = items.filter((p) => p[index] === max).map((p) => p[0]);
    return { min, max, tests_at_max: atMax.slice(0, 5), tests_at_max_count: atMax.length };
  };
  return { tests_stating_both: items.length, o2_mole_fraction: range(2), pressure_kpa: range(3) };
}

const queryTests: ToolDefinition = {
  name: "query_tests",
  description:
    "Count and list tests from the PSI experimental tables, filtered by investigation, fuel, added gas, outcome, cabin air or ranges of oxygen and pressure. Returns the total, counts per value, the oxygen and pressure range of the matching tests and the first rows.",
  parameters: {
    type: "object",
    properties: {
      psi_id: { type: "string", description: "Only this investigation, e.g. PSI-69." },
      fuel: { type: "string", description: "A fuel exactly as the table writes it (see the fuel counts), e.g. Heptane." },
      fuel_phase: { type: "string", enum: [...FUEL_PHASES] },
      outcome: { type: "string", description: "An outcome as the table writes it, e.g. Extinction." },
      diluent: { type: "string", description: "The gas mixture column, e.g. N2, N2+CO2 or N2+He." },
      air: { type: "string", description: "A cabin air preset ID from list_cabin_airs, e.g. station or exploration." },
      o2_min: { type: "number", description: "Oxygen mole fraction from 0 to 1 (0.30 means 30%)." },
      o2_max: { type: "number", description: "Oxygen mole fraction from 0 to 1." },
      pressure_min: { type: "number", description: "Pressure in kPa." },
      pressure_max: { type: "number", description: "Pressure in kPa." },
      limit: { type: "integer", description: "Rows to return, 1 to 20 (default 10)." },
    },
    additionalProperties: false,
  },
  label: (args) => {
    try {
      const psiId = optional(args, "psi_id", (v) => parsePsiId(v));
      return psiId ? `Looking up ${psiId} tests` : "Looking up tests";
    } catch {
      return "Looking up tests";
    }
  },
  async run(args, ctx) {
    const o2 = numberIn("oxygen", 0, 1, " (a mole fraction: 30% is 0.30)");
    const kpa = numberIn("pressure", 0, 10000, " kPa");
    const filters = {
      psi_id: optional(args, "psi_id", (v) => parsePsiId(v)),
      fuel: optional(args, "fuel", facetValue("fuel")),
      fuel_phase: optional(args, "fuel_phase", oneOf(FUEL_PHASES, "fuel_phase")),
      outcome: optional(args, "outcome", facetValue("outcome")),
      diluent: optional(args, "diluent", facetValue("diluent")),
      air: optional(args, "air", matching(AIR_ID, "air must be a cabin air preset ID from list_cabin_airs")),
      o2_min: optional(args, "o2_min", o2),
      o2_max: optional(args, "o2_max", o2),
      pressure_min: optional(args, "pressure_min", kpa),
      pressure_max: optional(args, "pressure_max", kpa),
    };
    const limit = limitOf(args, 10);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined) params.set(key, String(value));
    params.set("limit", String(limit));
    params.set("include", "points");
    const { data, from } = await get(ctx, `/catalog/tests?${params.toString()}`);
    const d = asObject(data);
    const rows = asArray(d.items).slice(0, limit).map(asObject);
    const facets: Json = {};
    for (const [name, list] of Object.entries(asObject(d.facets))) {
      facets[name] = asArray(list)
        .slice(0, 10)
        .map((f) => {
          const row = asObject(f);
          return row.label && row.label !== row.value ? { value: row.value, label: row.label, count: row.count } : { value: row.value, count: row.count };
        });
    }
    const excluded = Object.fromEntries(Object.entries(asObject(d.excluded)).filter(([, n]) => typeof n === "number" && n > 0));
    const ranges = pointRanges(d.points);
    const psiFacet = asArray(asObject(d.facets).psi_id).map(asObject);
    const rangeTests = ranges
      ? [...asArray(asObject(ranges.o2_mole_fraction).tests_at_max), ...asArray(asObject(ranges.pressure_kpa).tests_at_max)]
      : [];
    return {
      ok: true,
      from,
      data: {
        filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)),
        total: d.total,
        shown: rows.length,
        units: UNITS_NOTE,
        ...(Object.keys(excluded).length
          ? { left_out_because_value_not_stated: excluded }
          : {}),
        counts: facets,
        ranges_of_matching_tests: ranges,
        rows: rows.map((r) => ({
          test_id: r.test_id,
          investigation: r.acronym ?? r.psi_id,
          fuel: r.fuel,
          fuel_phase: r.fuel_phase,
          o2_mole_fraction: r.o2_mole_fraction,
          pressure_kpa: r.pressure_kpa,
          flow_cm_s: r.flow_cm_s,
          diluent: r.diluent,
          outcome: r.outcome,
          flags: r.flags,
        })),
      },
      sources: dedupe([
        ...psiFacet
          .filter((f) => typeof f.value === "string" && PSI_ID.test(f.value as string) && Number(f.count) > 0)
          .map((f): ToolSource => ({ kind: "investigation", id: String(f.value), label: str(f.label) ?? undefined })),
        ...rows.map((r): ToolSource => ({ kind: "test", id: String(r.test_id) })),
        ...rangeTests.filter((id): id is string => typeof id === "string").map((id): ToolSource => ({ kind: "test", id })),
        ...rows.map((r): ToolSource => ({ kind: "file", id: String(r.source_file) })),
      ]),
    };
  },
};

const getTest: ToolDefinition = {
  name: "get_test",
  description:
    "Read one test: its row exactly as PSI publishes it, the values in shared units, its flags and every analysis value computed or measured for it.",
  parameters: {
    type: "object",
    properties: { test_id: { type: "string", description: "A test ID such as PSI-69/114 or PSI-25/B1." } },
    required: ["test_id"],
    additionalProperties: false,
  },
  label: (args) => {
    try {
      return `Reading test ${parseTestId(args.test_id)}`;
    } catch {
      return "Reading a test";
    }
  },
  async run(args, ctx) {
    const testId = parseTestId(args.test_id);
    const slash = testId.indexOf("/");
    const path = `/catalog/tests/${testId.slice(0, slash)}/${encodeURIComponent(testId.slice(slash + 1))}`;
    const { data, from } = await get(ctx, path);
    const d = asObject(data);
    const evidence = asArray(d.evidence).map(asObject);
    return {
      ok: true,
      from,
      data: {
        test_id: d.test_id,
        investigation: d.acronym ?? d.psi_id,
        psi_id: d.psi_id,
        table: d.table_name,
        values: {
          fuel: d.fuel,
          fuel_phase: d.fuel_phase,
          o2_mole_fraction: d.o2_mole_fraction,
          pressure_kpa: d.pressure_kpa,
          flow_cm_s: d.flow_cm_s,
          diluent: d.diluent,
          outcome: d.outcome,
        },
        units: UNITS_NOTE,
        as_written: d.original,
        flags: d.flags,
        row_as_published: smallObject(d.raw, 25, 80),
        source_file: d.source_file,
        source_row: d.source_row,
        analysis_values_total: evidence.length,
        analysis_values: evidence.slice(0, MAX_ROWS).map((e) => ({
          analysis: e.module,
          quantity: e.quantity,
          value: e.value,
          unit: e.unit,
          ...(e.uncertainty ? { uncertainty: e.uncertainty } : {}),
          n: e.n,
          provenance: e.provenance,
          flags: e.flags,
        })),
      },
      sources: dedupe([
        { kind: "test", id: testId },
        { kind: "investigation", id: String(d.psi_id), label: str(d.acronym) ?? undefined },
        { kind: "file", id: String(d.source_file) },
        ...evidence.map((e): ToolSource => ({ kind: "analysis", id: String(e.module), psi_ids: [String(d.psi_id)] })),
      ]),
    };
  },
};

const listCabinAirs: ToolDefinition = {
  name: "list_cabin_airs",
  description:
    "List the cabin air presets the site offers (oxygen and pressure windows), each with its plain description, tolerance and source.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  label: () => "Reading the cabin air presets",
  async run(_args, ctx) {
    const { data, from } = await get(ctx, "/air/presets");
    const d = asObject(data);
    return {
      ok: true,
      from,
      data: {
        default: d.default,
        presets: asArray(d.presets)
          .map(asObject)
          .map((p) => ({ id: p.id, label: p.label, plain: p.plain, tolerance: p.tolerance_plain, source: trim(p.source, 240) })),
      },
      sources: [],
    };
  },
};

async function presetLabel(ctx: ToolContext, air: string): Promise<string | null> {
  try {
    const { data } = await get(ctx, "/air/presets");
    const preset = asArray(asObject(data).presets).map(asObject).find((p) => p.id === air);
    return preset ? `${preset.label} (${preset.plain})` : null;
  } catch {
    return null;
  }
}

const cabinAirCoverage: ToolDefinition = {
  name: "cabin_air_coverage",
  description:
    "For one cabin air preset: per fire stage and per investigation, how many tests ran inside that air out of the tests whose tables state oxygen and pressure, and whether it was tested, never tested or not stated.",
  parameters: {
    type: "object",
    properties: { air: { type: "string", description: "A preset ID from list_cabin_airs, e.g. station." } },
    required: ["air"],
    additionalProperties: false,
  },
  label: () => "Checking what was tested in this air",
  async run(args, ctx) {
    const air = matching(AIR_ID, "air must be a cabin air preset ID from list_cabin_airs")(args.air);
    const [{ data, from }, labels, label] = await Promise.all([
      get(ctx, `/air/coverage?air=${encodeURIComponent(air)}`),
      investigationLabels(ctx),
      presetLabel(ctx, air),
    ]);
    const d = asObject(data);
    const stages: Json = {};
    const ids: string[] = [];
    for (const [stage, value] of Object.entries(asObject(d.stages))) {
      const s = asObject(value);
      const invs = asArray(s.investigations).map(asObject);
      ids.push(...invs.map((i) => String(i.psi_id)));
      stages[stage] = {
        status: s.status,
        inside: s.inside,
        stated: s.stated,
        investigations: invs.map((i) => ({
          psi_id: i.psi_id,
          acronym: labels.get(String(i.psi_id)) ?? null,
          status: i.status,
          inside: i.inside,
          stated: i.stated,
        })),
      };
    }
    return {
      ok: true,
      from,
      data: {
        air: d.air,
        air_label: label,
        window: d.window,
        units: UNITS_NOTE,
        meaning:
          "inside = tests that ran inside this air; stated = tests whose table states the oxygen and pressure needed to check. " +
          "tested: at least one inside. never_tested: stated, none inside. not_stated: no table states them. " +
          "'other' holds investigations with no fire stage.",
        stages,
      },
      sources: dedupe(ids.filter((id) => PSI_ID.test(id)).map((id): ToolSource => ({ kind: "investigation", id, label: labels.get(id) }))),
    };
  },
};

const rankInvestigations: ToolDefinition = {
  name: "rank_investigations",
  description:
    "The site's ranking of the investigations for one cabin air: the top 10 with score, its four parts (pillar, evidence in this air, data, fuel) and a one-sentence reason, plus the weights.",
  parameters: {
    type: "object",
    properties: { air: { type: "string", description: "A preset ID from list_cabin_airs, e.g. station." } },
    required: ["air"],
    additionalProperties: false,
  },
  label: () => "Ranking the investigations for this air",
  async run(args, ctx) {
    const air = matching(AIR_ID, "air must be a cabin air preset ID from list_cabin_airs")(args.air);
    const [{ data, from }, label] = await Promise.all([get(ctx, `/catalog/rank?air=${encodeURIComponent(air)}`), presetLabel(ctx, air)]);
    const d = asObject(data);
    const all = asArray(d.items).map(asObject);
    const items = all.slice(0, 10).map((item) => {
      const parts = asObject(item.parts);
      const evidence = asObject(parts.evidence);
      return {
        rank: item.rank,
        psi_id: item.psi_id,
        acronym: item.acronym,
        pillar: item.pillar,
        stage: item.stage,
        score: item.score,
        parts: {
          pillar: asObject(parts.pillar).score,
          evidence: { score: evidence.score, inside: evidence.inside, stated: evidence.stated },
          data: asObject(parts.data).score,
          fuel: asObject(parts.fuel).score,
        },
        reason: trim(item.reason, 260),
      };
    });
    return {
      ok: true,
      from,
      data: {
        air: d.air,
        air_label: label,
        ranked: all.length,
        weights: d.weights,
        weights_are_default: d.weights_are_default,
        formula: d.formula,
        parts_meaning:
          "pillar: 1 if the challenge page names it for a fire-safety pillar, 0.5 if the team's curation does, 0 otherwise. " +
          "evidence: share of its tests inside this air, out of those whose table states oxygen and pressure. " +
          "data: 0.5 for an experimental table plus 0.5 for downloadable files. fuel: 1 solid, 0.5 liquid or gas, 0 aerosol.",
        cannot_tell: "The ranking orders how well PSI's data covers a fire question in this air, not how dangerous a material is.",
        items,
      },
      sources: items.map((item): ToolSource => ({ kind: "investigation", id: String(item.psi_id), label: str(item.acronym) ?? undefined })),
    };
  },
};

const listAnalyses: ToolDefinition = {
  name: "list_analyses",
  description:
    "List the site's analyses of PSI data (for example the video analysis of BASS-II and the flame temperature analysis of FLEX): ID, status, fire stage, question and how many values and findings each has.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  label: () => "Listing the analyses",
  async run(_args, ctx) {
    const { data, from } = await get(ctx, "/modules");
    const rows = asArray(data)
      .map(asObject)
      .filter((row) => typeof row.id === "string" && !row.id.startsWith("_"));
    return {
      ok: true,
      from,
      data: {
        analyses: rows.map((row) =>
          row.status === "not_built"
            ? { id: row.id, status: "not_built" }
            : {
                id: row.id,
                status: row.status,
                title: row.title,
                stage: row.stage,
                question: row.question,
                values: row.evidence_count,
                findings: row.findings_count,
                page: analysisPage(row.stage),
              },
        ),
        status_meaning: "built: real results. example: placeholder values, never results. not_built: no numbers.",
      },
      sources: rows
        .filter((row) => row.status !== "not_built")
        .map((row): ToolSource => ({ kind: "analysis", id: String(row.id), label: str(row.title) ?? undefined, href: analysisPage(row.stage) })),
    };
  },
};

async function analysisModule(ctx: ToolContext, id: string): Promise<{ module: Json; from: DataOrigin }> {
  const { data, from } = await get(ctx, `/modules/${id}`);
  return { module: asObject(data), from };
}

function analysisSource(module: Json): ToolSource {
  return {
    kind: "analysis",
    id: String(module.id),
    label: str(module.title) ?? undefined,
    href: analysisPage(module.stage),
    psi_ids: asArray(module.psi_ids).filter((x): x is string => typeof x === "string"),
  };
}

const analysisIdParam = { type: "string", description: "An analysis ID from list_analyses, e.g. video-to-data or flame-temperature." };

const getFindings: ToolDefinition = {
  name: "get_findings",
  description:
    "Read one analysis: its status, question, summary, what it cannot tell, its headline findings and its checks with pass or fail, each with value, unit, count, provenance and PSI source.",
  parameters: {
    type: "object",
    properties: { analysis_id: analysisIdParam },
    required: ["analysis_id"],
    additionalProperties: false,
  },
  label: () => "Reading the findings of an analysis",
  async run(args, ctx) {
    const id = matching(ANALYSIS_ID, "analysis_id must be an ID from list_analyses")(args.analysis_id);
    const [{ module, from: a }, { data, from: b }] = await Promise.all([analysisModule(ctx, id), get(ctx, `/modules/${id}/findings`)]);
    const findings = asArray(data).map(asObject);
    const shape = (f: Json) => ({
      id: f.id,
      text: trim(f.text, 420),
      value: f.value,
      unit: f.unit,
      n: f.n,
      provenance: f.provenance,
      psi_id: asObject(f.source).psi_id,
      file: asObject(f.source).file,
      ...(typeof f.passed === "boolean" ? { passed: f.passed } : {}),
    });
    const psiIds = findings.map((f) => str(asObject(f.source).psi_id)).filter((x): x is string => !!x);
    return {
      ok: true,
      from: worst(a, b),
      data: {
        analysis: {
          id: module.id,
          title: module.title,
          status: module.status,
          stage: module.stage,
          question: module.question,
          psi_ids: module.psi_ids,
          summary: trim(module.summary, 700),
          cannot_tell: asArray(module.cannot_tell).slice(0, 14).map((t) => trim(t, 240)),
          page: analysisPage(module.stage),
        },
        ...(module.status === "example" ? { warning: "status example: placeholder values, not results." } : {}),
        provenance_meaning: "MODEL = computed by the team's analysis. VIDEO_MEASURED = measured from NASA video. PSI_TABLE = read from a PSI table. PUBLISHED = from a NASA report. HAND_MEASURED = measured by hand.",
        headlines: findings.filter((f) => f.kind === "headline").slice(0, MAX_ROWS).map(shape),
        checks: findings.filter((f) => f.kind === "check").slice(0, MAX_ROWS).map(shape),
      },
      sources: dedupe([
        analysisSource(module),
        ...[...asArray(module.psi_ids), ...psiIds]
          .filter((x): x is string => typeof x === "string" && PSI_ID.test(x))
          .map((psiId): ToolSource => ({ kind: "investigation", id: psiId })),
        ...findings.map((f): ToolSource => ({ kind: "file", id: String(asObject(f.source).file) })),
      ]),
    };
  },
};

const getEvidence: ToolDefinition = {
  name: "get_evidence",
  description:
    "Read the values one analysis produced, optionally for one test or one quantity: value, unit, uncertainty, count, provenance (measured or computed) and source, plus the list of quantities and the range of the matching values.",
  parameters: {
    type: "object",
    properties: {
      analysis_id: analysisIdParam,
      test_id: { type: "string", description: "Only this test, e.g. PSI-25/B1." },
      quantity: { type: "string", description: "Only this quantity, e.g. spread_rate or ceiling_temperature." },
      limit: { type: "integer", description: "Rows to return, 1 to 20 (default 10)." },
    },
    required: ["analysis_id"],
    additionalProperties: false,
  },
  label: () => "Reading the values of an analysis",
  async run(args, ctx) {
    const id = matching(ANALYSIS_ID, "analysis_id must be an ID from list_analyses")(args.analysis_id);
    const testId = optional(args, "test_id", parseTestId);
    const quantity = optional(args, "quantity", matching(QUANTITY, "quantity must be a quantity name such as spread_rate"));
    const limit = limitOf(args, 10);
    // The whole list is read once (it is in the saved copy) and filtered here.
    const [{ module, from: a }, { data, from: b }] = await Promise.all([analysisModule(ctx, id), get(ctx, `/modules/${id}/evidence`)]);
    const all = asArray(data).map(asObject);
    const forTest = testId ? all.filter((e) => e.test_id === testId) : all;
    const matched = quantity ? forTest.filter((e) => e.quantity === quantity) : forTest;
    const quantities: Record<string, number> = {};
    for (const e of forTest) quantities[String(e.quantity)] = (quantities[String(e.quantity)] ?? 0) + 1;
    const numeric = matched.filter((e) => typeof e.value === "number");
    const units = new Set(numeric.map((e) => e.unit));
    let range: Json | null = null;
    if (numeric.length > 1 && units.size === 1) {
      const lo = numeric.reduce((m, e) => ((e.value as number) < (m.value as number) ? e : m));
      const hi = numeric.reduce((m, e) => ((e.value as number) > (m.value as number) ? e : m));
      range = { count: numeric.length, unit: lo.unit, min: lo.value, test_at_min: lo.test_id, max: hi.value, test_at_max: hi.test_id };
    }
    const rows = matched.slice(0, limit);
    return {
      ok: true,
      from: worst(a, b),
      data: {
        analysis: { id: module.id, title: module.title, status: module.status, page: analysisPage(module.stage) },
        ...(module.status === "example" ? { warning: "status example: placeholder values, not results." } : {}),
        filters: { ...(testId ? { test_id: testId } : {}), ...(quantity ? { quantity } : {}) },
        total_values: all.length,
        matched: matched.length,
        quantities: Object.fromEntries(Object.entries(quantities).slice(0, 25)),
        range_of_matching_values: range,
        provenance_meaning: "MODEL = computed, not measured. VIDEO_MEASURED = measured from NASA video. PSI_TABLE = read from a PSI table. PUBLISHED = from a NASA report.",
        rows: rows.map((e) => ({
          test_id: e.test_id,
          quantity: e.quantity,
          value: e.value,
          unit: e.unit,
          ...(e.uncertainty ? { uncertainty: e.uncertainty } : {}),
          n: e.n,
          provenance: e.provenance,
          flags: e.flags,
          conditions: smallObject(e.conditions, 8, 100),
          ...(e.reference ? { reference: smallObject(e.reference, 2, 160) } : {}),
        })),
      },
      sources: dedupe([
        analysisSource(module),
        ...[...rows, ...(range ? [{ test_id: range.test_at_min }, { test_id: range.test_at_max }] : [])].map(
          (e): ToolSource => ({ kind: "test", id: String(e.test_id) }),
        ),
        ...rows.map((e): ToolSource => ({ kind: "investigation", id: String(asObject(e.source).psi_id) })),
        ...rows.map((e): ToolSource => ({ kind: "file", id: String(asObject(e.source).file) })),
      ]).filter((s) => s.kind !== "investigation" || PSI_ID.test(s.id)),
    };
  },
};

const GAPS_ANALYSIS = "flame-temperature";
const GAPS_FILE = "flex_gaps.json";

const nextTestsToFly: ToolDefinition = {
  name: "next_tests_to_fly",
  description:
    "The gap list of the flame temperature analysis: droplet test conditions at 30 to 34% oxygen and about 0.7 atm ranked by how far they are from the nearest real test, with that nearest test, plus the list's scope and what it is not.",
  parameters: {
    type: "object",
    properties: {
      added_gas: { type: "string", enum: [...ADDED_GASES], description: "Only conditions with this added gas." },
      limit: { type: "integer", description: "Rows to return, 1 to 20 (default 8)." },
    },
    additionalProperties: false,
  },
  label: () => "Reading the list of untested conditions",
  async run(args, ctx) {
    const gas = optional(args, "added_gas", oneOf(ADDED_GASES, "added_gas"));
    const limit = limitOf(args, 8);
    const [{ module, from: a }, { data, from: b }] = await Promise.all([
      analysisModule(ctx, GAPS_ANALYSIS),
      get(ctx, `/modules/${GAPS_ANALYSIS}/files/${GAPS_FILE}`),
    ]);
    const d = asObject(data);
    const header = asObject(d.header);
    const all = asArray(d.rows).map(asObject);
    const matched = gas ? all.filter((r) => r.added_gas === gas) : all;
    const rows = matched.slice(0, limit);
    const psiIds = Object.keys(asObject(header.psi_ids)).filter((id) => PSI_ID.test(id));
    return {
      ok: true,
      from: worst(a, b),
      data: {
        analysis: { id: module.id, status: module.status, page: analysisPage(module.stage) },
        file: GAPS_FILE,
        scope: header.scope,
        not_a_prediction: header.not_a_prediction,
        region: header.region,
        distance_meaning: trim(header.distance, 320),
        headline: header.headline,
        units: "Gas amounts are mole fractions (0.34 means 34%). Pressure in atm.",
        rows_total: all.length,
        matched: matched.length,
        rows: rows.map((r) => ({
          rank: r.rank,
          fuel: r.fuel,
          added_gas: r.added_gas,
          added_gas_fraction: r.x_added,
          o2_mole_fraction: r.x_o2,
          pressure_atm: r.pressure_atm,
          distance: r.distance,
          nearest_test_id: r.nearest_test_id,
          nearest_conditions: r.nearest_conditions,
          model_fails_here: r.model_fails_here,
          note: trim(r.note, 220),
        })),
      },
      sources: dedupe([
        analysisSource(module),
        ...psiIds.map((id): ToolSource => ({ kind: "investigation", id })),
        ...rows.map((r): ToolSource => ({ kind: "test", id: String(r.nearest_test_id) })),
        { kind: "file", id: GAPS_FILE },
      ]),
    };
  },
};

export const TOOLS: readonly ToolDefinition[] = [
  searchInvestigations,
  getInvestigation,
  queryTests,
  getTest,
  listCabinAirs,
  cabinAirCoverage,
  rankInvestigations,
  listAnalyses,
  getFindings,
  getEvidence,
  nextTestsToFly,
];

/**
 * The tool list as the Claude API takes it. strict: the API guarantees the arguments match the
 * schema (every schema closes additionalProperties and lists its required fields). The list and
 * its order never change, so it is part of the cached prefix.
 */
export function toolSpecs(): BetaTool[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    strict: true,
    input_schema: { required: [], ...tool.parameters, type: "object" as const },
  }));
}

export function toolLabel(name: string, args: unknown): string {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return "Reading the data";
  try {
    return tool.label(asObject(args));
  } catch {
    return "Reading the data";
  }
}

/** Give every investigation source its acronym (from the cached investigations list). */
async function withLabels(result: ToolResult, ctx: ToolContext): Promise<ToolResult> {
  if (!result.ok || result.sources.every((s) => s.kind !== "investigation" || s.label)) return result;
  const labels = await investigationLabels(ctx);
  return {
    ...result,
    sources: result.sources.map((s) => (s.kind === "investigation" && !s.label && labels.has(s.id) ? { ...s, label: labels.get(s.id) } : s)),
  };
}

/** One set of tools for one conversation: requests to the same path are made once. */
export function createToolbox(fetchJson: FetchJson) {
  const ctx: ToolContext = { fetchJson, memo: new Map() };
  return {
    async run(name: string, args: unknown): Promise<ToolResult> {
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(`There is no tool named ${trim(String(name), 40)}.`);
      if (!isObject(args)) return fail("The arguments must be a JSON object.");
      try {
        return await withLabels(await tool.run(args, ctx), ctx);
      } catch (error) {
        if (error instanceof BadArgument) return fail(error.message);
        if (error instanceof DataError) {
          if (error.kind === "not_found") return fail(`Not found: ${error.message}`);
          if (error.kind === "bad_request") return fail(`The data service did not accept these values: ${error.message}`);
          return fail(error.message);
        }
        return fail("This tool failed on unexpected data.");
      }
    },
  };
}

export type Toolbox = ReturnType<typeof createToolbox>;
