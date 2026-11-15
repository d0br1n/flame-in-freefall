#!/usr/bin/env node
// Writes lib/assistant/stored-answers.json: five example questions answered from the data with
// NO language model. Each answer runs the assistant's real tools (lib/assistant/tools.ts)
// against a running data service and fills a sentence template written here, so every number
// and every ID in a stored answer is read from the data at generation time. The same grounding
// check as live answers (lib/assistant/ground.ts) then builds the sources and fails the run if
// an answer cites an ID no tool returned.
//
// A template states facts only after checking them in the tool results (for example "none of
// them has tests inside this air" is written only if every one has 0). If the data changes so
// that a sentence would no longer be true, the run stops with an error instead of writing it.
//
//   node scripts/make-stored-answers.mjs --origin http://127.0.0.1:8791
//
// Loads the TypeScript tools with the TypeScript compiler (a declared dev dependency), so no
// build step or new package is needed. Code generated with SI assistance (Claude Code).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(WEB, "lib");
const OUT = join(LIB, "assistant", "stored-answers.json");

/** Import a TypeScript module of lib/ (and the relative modules it imports) without a build step. */
async function importTs(entry, outDir) {
  const done = new Map();
  const compile = (file) => {
    if (done.has(file)) return done.get(file);
    const target = join(outDir, relative(LIB, file)).replace(/\.ts$/, ".mjs");
    done.set(file, target);
    let code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    code = code.replace(/(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g, (_m, open, spec, close) => {
      const abs = resolve(dirname(file), spec);
      const url = spec.endsWith(".mjs") ? pathToFileURL(abs).href : pathToFileURL(compile(`${abs}.ts`)).href;
      return `${open}${url}${close}`;
    });
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, code);
    return target;
  };
  return import(pathToFileURL(compile(join(LIB, entry))).href);
}

class TemplateError extends Error {}
function need(condition, what) {
  if (!condition) throw new TemplateError(`the data no longer supports: ${what}. Rewrite this template.`);
}
const pct = (fraction) => `${Math.round(fraction * 1000) / 10}%`;
const listWords = (items) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
const name = (row) => row.acronym ?? row.psi_id;

// ---------------------------------------------------------------- the five answers

const ANSWERS = [
  {
    id: "station-ranking",
    chip: "Station cabin",
    question: "Which investigations matter most for a station cabin, and why?",
    async write(call) {
      const presets = await call("list_cabin_airs", {});
      const station = presets.presets.find((p) => p.id === "station");
      need(station, "the station preset");
      const r = await call("rank_investigations", { air: "station" });
      const top = r.items.filter((item) => item.score === r.items[0].score);
      need(top.length >= 1, "a first place");
      const ids = top.map((item) => item.psi_id).join(", ");
      const plain = station.plain.charAt(0).toLowerCase() + station.plain.slice(1);
      const lines = [
        `In station cabin air (${plain}), the site's ranking puts ${listWords(top.map(name))} first, each with a score of ${top[0].score} out of 1 [${ids}].`,
      ];
      const reasons = [];
      const pillars = [...new Set(top.map((item) => item.pillar))];
      if (top.every((item) => item.parts.pillar === 1)) reasons.push(`the challenge page names each one for fire ${listWords(pillars)}`);
      if (top.every((item) => item.parts.data === 1)) reasons.push("PSI holds an experimental table and downloadable files for each");
      if (top.every((item) => item.parts.fuel === 1)) reasons.push("each burned a solid fuel, like cabin materials");
      need(reasons.length > 0, "a shared reason for the first place");
      lines.push(`Why: ${listWords(reasons)}.`);
      if (top.every((item) => item.parts.evidence.stated === 0)) {
        lines.push("But none of their tables states the oxygen and pressure needed to check station air, so none of them scores on tests run in this air.");
      }
      const firstTested = r.items.find((item) => (item.parts.evidence.inside ?? 0) > 0);
      if (firstTested) {
        lines.push(
          `The first investigation with tests inside this air is ${name(firstTested)} at rank ${firstTested.rank}: ${firstTested.parts.evidence.inside} of its ${firstTested.parts.evidence.stated} tests [${firstTested.psi_id}].`,
        );
      }
      need(r.weights_are_default && new Set(Object.values(r.weights)).size === 1, "equal default weights");
      lines.push(`The score adds four equally weighted parts: pillar, tests in this air, data available and fuel. ${r.cannot_tell}`);
      return lines.join(" ");
    },
  },
  {
    id: "droplets-moon-air",
    chip: "Moon-base air",
    question: "Was any droplet test run in a Moon-base-like air?",
    async write(call) {
      const presets = await call("list_cabin_airs", {});
      const exploration = presets.presets.find((p) => p.id === "exploration");
      need(exploration && /moon/i.test(exploration.source ?? ""), "the exploration preset sourced to the Moon base");
      const inside = await call("query_tests", { fuel_phase: "liquid", air: "exploration", limit: 5 });
      const all = await call("query_tests", { fuel_phase: "liquid", limit: 1 });
      const coverage = await call("cabin_air_coverage", { air: "exploration" });
      const findings = await call("get_findings", { analysis_id: "flame-temperature" });
      const gravity = findings.analysis.cannot_tell.find((line) => /Moon or Mars gravity/.test(line));
      need(gravity, "a gravity limit in the flame temperature analysis");
      const byId = new Map(Object.values(coverage.stages).flatMap((stage) => stage.investigations).map((i) => [i.psi_id, i]));
      const parts = all.counts.psi_id.map((facet) => {
        const row = byId.get(facet.value);
        need(row, `coverage for ${facet.value}`);
        const label = facet.label ?? facet.value;
        return row.stated
          ? `${label}: ${row.inside} of ${row.stated} tests that state oxygen and pressure [${facet.value}]`
          : `${label}: its table states no per-test oxygen and pressure [${facet.value}]`;
      });
      const lines = [
        `Taking the challenge page's exploration atmosphere as Moon-base-like air (${exploration.plain}):`,
      ];
      if (inside.total === 0) {
        lines.push(`no droplet test in PSI's tables ran in it. Of ${all.total} droplet test rows, none falls inside this air.`);
      } else {
        lines.push(`${inside.total} of ${all.total} droplet test rows fall inside this air, for example [${inside.rows[0].test_id}].`);
      }
      lines.push(`Per investigation: ${parts.join("; ")}.`);
      lines.push(`This is about the gas mixture only. ${gravity} [PSI-69]`);
      return lines.join(" ");
    },
  },
  {
    id: "video-analysis",
    chip: "Video analysis",
    question: "What does the video analysis measure on BASS-II, and has it been checked?",
    async write(call) {
      const f = await call("get_findings", { analysis_id: "video-to-data" });
      const e = await call("get_evidence", { analysis_id: "video-to-data", quantity: "spread_rate", limit: 1 });
      need(f.analysis.status === "built", "a built video analysis");
      const measured = f.headlines.find((h) => h.id === "find-tests-measured");
      need(measured, "the headline on measured tests");
      const words = {
        ignition_time: "when the flame lit",
        extinction_time: "when it went out",
        burn_duration: "how long it burned",
        outcome: "how the test ended",
        spread_rate: "how fast it spread",
        leading_edge_travel: "how far the flame front travelled",
      };
      const present = Object.keys(words).filter((q) => (e.quantities[q] ?? 0) > 0);
      need(present.length >= 4, "the main measured quantities");
      const pixels = f.analysis.cannot_tell.find((line) => /pixels/.test(line));
      need(pixels, "the pixel limit");
      const passed = f.checks.filter((c) => c.passed === true);
      const open = f.checks.filter((c) => c.passed !== true);
      const lines = [
        `The video analysis follows the flame in NASA's BASS-II test videos [PSI-25]. ${measured.text} [PSI-25]`,
        `For each measured test it records ${listWords(present.map((q) => words[q]))}. ${pixels} [PSI-25]`,
      ];
      if (passed.length) lines.push(`Checks passed: ${passed.map((c) => c.text).join(" ")} [PSI-25]`);
      if (open.length) lines.push(`Not passed yet: ${open.map((c) => c.text).join(" ")} [PSI-25]`);
      return lines.join(" ");
    },
  },
  {
    id: "added-gas-oxygen",
    chip: "Added gases",
    question: "Which added gas was tested at the highest oxygen level?",
    async write(call) {
      const overall = await call("query_tests", { limit: 1 });
      const mixtures = overall.counts.diluent.filter((d) => d.value !== "none");
      need(mixtures.length >= 2, "more than one gas mixture in the tables");
      const named = mixtures.reduce((sum, d) => sum + d.count, 0);
      const withGas = await call("query_tests", { diluent: mixtures.map((d) => d.value).join(","), limit: 1 });
      const words = { N2: "nitrogen only", "N2+CO2": "carbon dioxide", "N2+He": "helium" };
      const per = [];
      for (const mixture of mixtures) {
        need(words[mixture.value], `a plain name for ${mixture.value}`);
        const q = await call("query_tests", { diluent: mixture.value, limit: 1 });
        const o2 = q.ranges_of_matching_tests?.o2_mole_fraction;
        need(o2, `oxygen values for ${mixture.value}`);
        per.push({ gas: words[mixture.value], value: mixture.value, max: o2.max, test: o2.tests_at_max[0], count: o2.tests_at_max_count });
      }
      const added = per.filter((p) => p.value !== "N2").sort((a, b) => b.max - a.max);
      need(added.length >= 1, "an added gas besides nitrogen");
      const investigations = withGas.counts.psi_id.map((f) => f.value);
      const lines = [
        `Only ${named.toLocaleString("en-US")} of the ${overall.total.toLocaleString("en-US")} test rows in PSI's tables name the gas mixed into the air [${investigations.join(", ")}].`,
        ...added.map((p) => `With ${p.gas} added, oxygen went up to ${pct(p.max)} (${p.count} test${p.count === 1 ? "" : "s"} at that level, for example [${p.test}]).`),
      ];
      const best = added[0];
      if (added.length > 1 && added[1].max === best.max) lines.push(`So ${added[0].gas} and ${added[1].gas} share the highest level.`);
      else lines.push(`So ${best.gas} was tested at the highest oxygen level of the added gases.`);
      const nitrogen = per.find((p) => p.value === "N2");
      if (nitrogen) lines.push(`For comparison, with nitrogen only it went up to ${pct(nitrogen.max)} [${nitrogen.test}].`);
      lines.push(`No test with an added gas ran above ${pct(best.max)} oxygen, so the data cannot say how these gases act at higher oxygen levels.`);
      return lines.join(" ");
    },
  },
  {
    id: "limits",
    chip: "Limits of the data",
    question: "What can this data not tell me?",
    async write(call) {
      const flame = await call("get_findings", { analysis_id: "flame-temperature" });
      const video = await call("get_findings", { analysis_id: "video-to-data" });
      const rank = await call("rank_investigations", { air: "station" });
      const pick = (lines, pattern, what) => {
        const line = lines.find((l) => pattern.test(l));
        need(line, what);
        return line;
      };
      const items = [
        `${pick(flame.analysis.cannot_tell, /Moon or Mars gravity/, "the gravity limit")} [PSI-69]`,
        `${pick(flame.analysis.cannot_tell, /^Single liquid droplets/, "the droplet limit")} [PSI-69]`,
        `${pick(flame.analysis.cannot_tell, /calculated, not measured/, "the computed-temperature limit")} [PSI-69]`,
        `${pick(video.analysis.cannot_tell, /not a cabin fire/, "the cabin-fire limit")} [PSI-25]`,
        `${pick(video.analysis.cannot_tell, /pixels/, "the pixel limit")} [PSI-25]`,
        rank.cannot_tell,
      ];
      return `Some limits the data and the site's analyses state:\n${items.map((i) => `- ${i}`).join("\n")}\nEach investigation's page also lists what its own record cannot tell.`;
    },
  },
];

async function main() {
  const args = process.argv.slice(2);
  const flag = args.indexOf("--origin");
  const origin = (flag >= 0 ? args[flag + 1] : process.env.API_ORIGIN ?? "").replace(/\/+$/, "");
  if (!origin) throw new Error("no data service: pass --origin <url> or set API_ORIGIN");

  const outDir = mkdtempSync(join(tmpdir(), "burnrate-stored-"));
  try {
    const tools = await importTs("assistant/tools.ts", outDir);
    const grounding = await importTs("assistant/ground.ts", outDir);
    const answers = [];
    for (const spec of ANSWERS) {
      // Live data service only: a stored answer is never written from the saved copy.
      const toolbox = tools.createToolbox(tools.createDataFetcher({ apiOrigin: origin, siteOrigin: null }));
      const calls = [];
      const call = async (toolName, toolArgs) => {
        const result = await toolbox.run(toolName, toolArgs);
        if (!result.ok) throw new Error(`${spec.id}: ${toolName} failed: ${result.error}`);
        calls.push({ name: toolName, label: tools.toolLabel(toolName, toolArgs), result });
        return result.data;
      };
      const text = await spec.write(call);
      const grounded = grounding.ground(text, grounding.collectKnownIds(calls.map((c) => c.result)));
      if (grounded.removed.length) throw new Error(`${spec.id}: cites IDs no tool returned: ${grounded.removed.join(", ")}`);
      answers.push({
        id: spec.id,
        chip: spec.chip,
        question: spec.question,
        answer: grounded.text,
        sources: grounded.sources,
        tools: calls.map(({ name: toolName, label }) => ({ name: toolName, label })),
        saved_copy: calls.some((c) => c.result.from !== "live"),
      });
      console.log(`stored answer ${spec.id}: ${grounded.text.split(/\s+/).length} words, ${grounded.sources.length} sources`);
    }
    const day = new Date().toISOString().slice(0, 10);
    const file = {
      note: `Stored answers, written from the data on ${day} by scripts/make-stored-answers.mjs: the assistant's tools were run against the data service and their results filled sentence templates. No language model wrote these answers. Code written with SI assistance (Claude Code).`,
      generated_on: day,
      answers,
    };
    writeFileSync(OUT, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`wrote ${relative(WEB, OUT)}`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`make-stored-answers: ${error.message}`);
  process.exit(1);
});
