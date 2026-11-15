#!/usr/bin/env node
// Builds the catalog fixtures the site is developed and browser-tested against, until the
// real catalog routes (Linear DOB-66) are on main. Every value is copied or counted from the
// PSI records (data/raw/json/PSI-*.json, not in git) and the curation file
// pipeline/catalog/curation/investigations.yaml (DOB-61). Nothing is invented here.
//
//   node scripts/make-fixtures.mjs --raw /path/to/data/raw
//
// Output: fixtures/api/v1/catalog/investigations.json and one file per PSI ID.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileForPath } from "../lib/paths.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "..");
const REPO = resolve(WEB, "..", "..");
const OUT = join(WEB, "fixtures", "api", "v1");

const args = process.argv.slice(2);
const rawFlag = args.indexOf("--raw");
const rawDir = resolve(rawFlag >= 0 ? args[rawFlag + 1] : join(REPO, "data", "raw"));

const HARDWARE_LABELS = {
  acme_cir: "ACME hardware in the Combustion Integrated Rack",
  mdca_cir: "Droplet apparatus (MDCA) in the Combustion Integrated Rack",
  msg_flow_duct: "Flow duct in the Microgravity Science Glovebox",
  saffire_cygnus: "Saffire enclosure in a Cygnus spacecraft",
  smoke_diagnostics: "Smoke and aerosol instruments",
  ground: "Ground investigation (re-uses PSI data)",
};

const KIND_BY_EXTENSION = {
  ".csv": "data_files", ".txt": "data_files", ".dat": "data_files", ".xls": "data_files",
  ".xlsx": "data_files", ".asc": "data_files",
  ".mp4": "video", ".avi": "video",
  ".jpg": "images", ".png": "images", ".tif": "images", ".nef": "images",
  ".pdf": "documents", ".pptx": "documents", ".ppt": "documents", ".docx": "documents",
  ".doc": "documents", ".rtf": "documents",
  ".zip": "archives",
};
const KIND_ORDER = ["table", "data_files", "video", "images", "documents", "archives"];

const text = (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
const extension = (name) => (name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "");
const number = (id) => Number(id.replace("PSI-", ""));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function build() {
  const curation = readJson(join(REPO, "pipeline", "catalog", "curation", "investigations.yaml")).investigations;
  const modules = engineModules();
  const files = readdirSync(join(rawDir, "json")).filter((name) => /^PSI-\d+\.json$/.test(name));
  const details = files
    .map((name) => detail(readJson(join(rawDir, "json", name)), curation, modules))
    .sort((a, b) => number(a.psi_id) - number(b.psi_id));

  const summaryKeys = [
    "psi_id", "acronym", "title", "ground_investigation", "pillar", "stage", "fuel_phase",
    "hardware_group", "hardware_group_label", "psi_sub_area", "summary_plain", "data_kinds",
    "table_count", "files_count", "files_bytes", "listed_bytes", "publications_count", "psi_url",
  ];
  const items = details.map((d) => Object.fromEntries(summaryKeys.map((key) => [key, d[key]])));
  write("/catalog/investigations", { count: items.length, items });
  for (const d of details) write(`/catalog/investigations/${d.psi_id}`, d);
  console.log(`wrote ${details.length} investigations to ${OUT}`);
}

function engineModules() {
  const dir = join(REPO, "data", "modules");
  const found = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith("_")) continue; // the mock engine is never listed
    try {
      const m = readJson(join(dir, name, "module.json"));
      found.push({ id: m.id, title: m.title, stage: m.stage, status: m.status, psi_ids: m.psi_ids });
    } catch {
      // a folder without a readable module.json is not built: not listed
    }
  }
  return found;
}

function detail(record, curation, modules) {
  const psiId = record.accession;
  const tags = curation[psiId];
  if (!tags) throw new Error(`${psiId} has no entry in the curation file`);

  const added = record.added ?? [];
  const tables = (record.experimentalTable ?? []).map((t) => ({ file_name: t.file_name, bytes: t.file_size ?? 0 }));
  const byCategory = new Map();
  const kinds = new Set(tables.length ? ["table"] : []);
  let bytes = 0;
  for (const file of added) {
    const size = Number(file.file_size ?? 0);
    bytes += size;
    const category = String(file.remote_path ?? "").split("/")[4] ?? "Other";
    const group = byCategory.get(category) ?? { category, count: 0, bytes: 0 };
    group.count += 1;
    group.bytes += size;
    byCategory.set(category, group);
    const kind = KIND_BY_EXTENSION[extension(file.file_name ?? "")];
    if (kind) kinds.add(kind);
  }
  const listed = record.totalFileSize == null ? null : Number(record.totalFileSize);
  const doi = text(record.doi);

  return {
    psi_id: psiId,
    acronym: text(record.investigationAcronym),
    title: text(record.title) ?? psiId,
    ground_investigation: record.projectType === "Ground Investigation",
    pillar: tags.pillar.value,
    stage: tags.stage,
    fuel_phase: tags.fuel_phase.value,
    hardware_group: tags.hardware_group.value,
    hardware_group_label: HARDWARE_LABELS[tags.hardware_group.value] ?? tags.hardware_group.value,
    psi_sub_area: text(record.subResearchArea),
    summary_plain: text(tags.summary_plain?.text),
    data_kinds: KIND_ORDER.filter((kind) => kinds.has(kind)),
    table_count: tables.length,
    files_count: added.length,
    files_bytes: bytes,
    listed_bytes: listed,
    publications_count: (record.publications ?? []).length,
    // The DOI resolves to the record on psi.nasa.gov. Without a DOI the repository home is
    // the honest link.
    psi_url: doi ? `https://doi.org/${doi}` : "https://psi.nasa.gov/physci/repo",

    psi_text: {
      objective: text(record.objective),
      approach: text(record.approach),
      hypothesis: text(record.hypothesis),
      research_impacts: text(record.researchImpacts),
    },
    summary_written_by: text(tags.summary_plain?.written_by),
    tags: {
      pillar: tags.pillar,
      fuel_phase: tags.fuel_phase,
      hardware_group: tags.hardware_group,
      measurements: tags.measurements,
    },
    cannot_tell: [tags.cannot_tell].flat().filter(Boolean),
    conditions: {
      hardware: text(record.experimentHardware),
      hardware_link: text(record.experimentHardwareLink),
      flight_program: text(record.flightProgram),
      managing_center: text(record.managingNasaCenter),
      start_date: text(record.investigationStartDate),
      end_date: text(record.investigationEndDate),
      release_date: text(record.releaseDate),
    },
    licence: {
      id: text(record.licenseIdentifier),
      name: text(record.licenseName),
      link: text(record.licenseLink),
    },
    doi,
    files: {
      count: added.length,
      bytes,
      listed_bytes: listed,
      by_category: [...byCategory.values()].sort((a, b) => b.bytes - a.bytes),
      tables,
    },
    publications: (record.publications ?? []).map((p) => ({
      title: text(p.title) ?? "(untitled)",
      authors: text(p.authorList),
      doi: text(p.doi),
    })),
    related: String(record.related_glds ?? "").split(/[,;\s]+/).filter((id) => /^PSI-\d+$/.test(id)),
    engines: modules
      .filter((m) => m.psi_ids.includes(psiId))
      .map(({ id, title, stage, status }) => ({ id, title, stage, status })),
  };
}

function write(path, body) {
  const file = join(OUT, fileForPath(path));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(body, null, 1) + "\n");
}

build();
