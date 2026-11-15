#!/usr/bin/env node
// Builds fixtures/data/tests.json: test rows for the tests explorer (Linear DOB-77), used by
// the stub backend until the real route GET /catalog/tests (DOB-72) is on main.
//
//   node scripts/make-test-fixtures.mjs --raw /path/to/data/raw
//
// Two PSI tables only, both read as PSI publishes them:
//   PSI-69 FLEX (274 droplet tests) and PSI-10 ACME Flame Design, normal flames (207 tests).
// Every value is a cell of those tables or a unit conversion of one (the original text is
// kept next to it). The choice of which column feeds which shared field is a development
// stand-in: the catalog pipeline (DOB-67, DOB-69) owns the real mapping for all 22 tables.
// The inverse-flame table is left out on purpose: its oxygen column is the burner stream,
// not the surrounding air.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const rawFlag = args.indexOf("--raw");
const rawDir = resolve(rawFlag >= 0 ? args[rawFlag + 1] : join(WEB, "..", "..", "data", "raw"));

const KPA_PER_MMHG = 101.325 / 760;
const KPA_PER_ATM = 101.325;

/** Minimal CSV reader: quoted cells, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const num = (textValue) => {
  const t = String(textValue ?? "").trim();
  return t !== "" && Number.isFinite(Number(t)) ? Number(t) : null;
};
const round = (value, digits) => (value === null ? null : Number(value.toFixed(digits)));

function table(file, encoding) {
  const bytes = readFileSync(join(rawDir, "tables", file));
  const [header, ...rows] = parseCsv(new TextDecoder(encoding).decode(bytes));
  return { header: header.map((h) => h.trim()), rows };
}

function flex() {
  const file = "PSI-69_Experimental table_FLEX.csv";
  const { header, rows } = table(file, "windows-1252"); // the table is cp1252, not UTF-8
  const col = (name) => header.indexOf(name);
  const c = {
    test: col("FLEX Test #"), fuel: col("Fuel"), p: col("Ambient pressure; mmHg"),
    o2: header.findIndex((h) => h.startsWith("O") && h.includes("initial ambient composition")),
    co2: header.findIndex((h) => h.startsWith("CO") && h.includes("initial ambient composition")),
    he: header.findIndex((h) => h.startsWith("He") && h.includes("initial ambient composition")),
    end: col("Test end"),
  };
  return rows.map((r, i) => {
    const mmhg = num(r[c.p]);
    const co2 = num(r[c.co2]) ?? 0, he = num(r[c.he]) ?? 0;
    const flags = [];
    if (mmhg === 0) flags.push("suspect_pressure"); // test 114: 0 mmHg as published
    return {
      test_id: `PSI-69/${r[c.test].trim()}`, psi_id: "PSI-69", acronym: "FLEX", test_number: r[c.test].trim(),
      fuel: r[c.fuel].trim(), fuel_phase: "liquid",
      o2_mole_fraction: num(r[c.o2]), pressure_kpa: round(mmhg === null ? null : mmhg * KPA_PER_MMHG, 2),
      flow_cm_s: null,
      diluent: co2 > 0 && he > 0 ? "CO2 + He" : co2 > 0 ? "CO2" : he > 0 ? "He" : "None (N2 only)",
      outcome: r[c.end].trim() || null, comparable: true,
      original: {
        o2_mole_fraction: { text: r[c.o2], unit: "mole fraction", column: header[c.o2] },
        pressure_kpa: { text: r[c.p], unit: "mmHg", column: header[c.p] },
      },
      flags, source_file: file, source_row: i + 1,
      raw: Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])),
    };
  });
}

function flameDesignNormal() {
  const file = "PSI-10_Experimental table_Flame Design_Normal Flame.csv";
  const { header, rows } = table(file, "utf-8");
  const col = (name) => header.indexOf(name);
  const c = { test: col("Test"), fuel: col("Fuel"), o2: col("XO2 (init)"), p: col("pinit (atm)") };
  return rows.map((r, i) => {
    const atm = num(r[c.p]);
    return {
      test_id: `PSI-10/${r[c.test].trim()}`, psi_id: "PSI-10", acronym: "ACME/Flame Design", test_number: r[c.test].trim(),
      fuel: r[c.fuel].trim(), fuel_phase: "gas",
      o2_mole_fraction: round(num(r[c.o2]), 4), pressure_kpa: round(atm === null ? null : atm * KPA_PER_ATM, 2),
      flow_cm_s: null, diluent: null, outcome: null, comparable: true,
      original: {
        o2_mole_fraction: { text: r[c.o2], unit: "mole fraction", column: header[c.o2] },
        pressure_kpa: { text: r[c.p], unit: "atm", column: header[c.p] },
      },
      flags: [], source_file: file, source_row: i + 1,
      raw: Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])),
    };
  });
}

// ---------------------------------------------------------------- cabin air (DOB-84)
// Stand-in for GET /air/presets and /air/coverage until DOB-83 is on main. The window bounds
// are PLACEHOLDERS (the tolerance is a team decision, DOB-64), except the exploration window,
// which converts the challenge page's own words: 30% oxygen or more at 10.2 psi or less.
// Coverage is counted on the rows above only, so it covers PSI-69 (stage: suppress) and
// nothing else. Fixtures are never deployed.
const KPA_PER_PSI = 6.894757;
const PRESETS = [
  { id: "station", label: "Station cabin", plain: "About 21% oxygen at 14.7 psi, like air at sea level",
    window: { o2_min: 0.2, o2_max: 0.22, pressure_kpa_min: 96, pressure_kpa_max: 106 } },
  { id: "exploration", label: "Exploration atmosphere", plain: "30% oxygen or more, at 10.2 psi or less",
    window: { o2_min: 0.3, o2_max: null, pressure_kpa_min: null, pressure_kpa_max: round(10.2 * KPA_PER_PSI, 2) } },
  { id: "high_oxygen", label: "High oxygen", plain: "40% oxygen or more, at any pressure",
    window: { o2_min: 0.4, o2_max: null, pressure_kpa_min: null, pressure_kpa_max: null } },
];

function inside(row, w) {
  const o2 = row.o2_mole_fraction, p = row.pressure_kpa;
  return (w.o2_min === null || o2 >= w.o2_min) && (w.o2_max === null || o2 <= w.o2_max) &&
    (w.pressure_kpa_min === null || p >= w.pressure_kpa_min) && (w.pressure_kpa_max === null || p <= w.pressure_kpa_max);
}

function airFixtures(rows) {
  const out = {};
  const presets = PRESETS.map((preset) => ({
    ...preset,
    tolerance_plain: "Strict window: no tolerance applied yet.",
    window: { ...preset.window, flow_cm_s_min: null, flow_cm_s_max: null },
  }));
  out["air/presets.json"] = { default: "station", presets };
  const flexRows = rows.filter((r) => r.psi_id === "PSI-69" && r.o2_mole_fraction !== null && r.pressure_kpa !== null);
  for (const preset of presets) {
    const count = flexRows.filter((r) => inside(r, preset.window)).length;
    const status = count > 0 ? "tested" : "never_tested";
    out[`air/coverage__air=${preset.id}.json`] = {
      air: preset.id,
      stages: {
        spread: { status: "not_stated", inside: null, stated: 0, investigations: [] },
        detect: { status: "not_stated", inside: null, stated: 0, investigations: [] },
        suppress: { status, inside: count, stated: flexRows.length,
          investigations: [{ psi_id: "PSI-69", status, inside: count, stated: flexRows.length }] },
      },
    };
  }
  return out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const rows = [...flameDesignNormal(), ...flex()];
  const out = join(WEB, "fixtures", "data", "tests.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(rows) + "\n");
  for (const [name, body] of Object.entries(airFixtures(rows))) {
    const file = join(WEB, "fixtures", "api", "v1", name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(body, null, 1) + "\n");
  }
  const count = (id) => rows.filter((r) => r.psi_id === id).length;
  console.log(`wrote ${rows.length} test rows (PSI-10: ${count("PSI-10")}, PSI-69: ${count("PSI-69")}) to ${out}`);
}
