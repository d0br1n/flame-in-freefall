"use client";

// The Apollo 1 scenario page: the 1967 cabin fire on the Board's clock, then what burnrate would
// have shown for that cabin air. The animation is drawn in code (no generated images, DESIGN.md);
// it is an illustration timed to the Board's times, not a picture of the fire. The tested range
// comes from GET /air/presets; the historical facts from lib/scenarios/apollo1.ts, with sources.
// Kept to lives and what the PSI data shows (Linear DOB-109: no cost argument).
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/AppLink";
import { Loading, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import { PageTitle } from "@/components/shell/ShellState";
import { Card, CardTitle } from "@/components/ui/Card";
import { CHIP } from "@/components/ui/SourceChip";
import { StatusPill } from "@/components/ui/StatusPill";
import { useApi } from "@/lib/api";
import { PRESETS_PATH } from "@/lib/air";
import {
  APOLLO1_AIR,
  BOARD_CHRONOLOGY_URL,
  BOARD_FINDINGS_URL,
  BOARD_SOURCE,
  TIMELINE,
  checkAir,
  offsets,
  percent,
  psiaToKpa,
} from "@/lib/scenarios/apollo1";
import type { AirPresets } from "@/lib/types";
import { Versus, VersusSource } from "./Versus";

/** The animation plays the Board's clock this many times faster. */
const SPEED = 4;
const OFFSETS = offsets();
const END = OFFSETS[OFFSETS.length - 1] + 2;
const RUPTURE = OFFSETS[TIMELINE.findIndex((event) => event.id === "rupture")];
const CALL = OFFSETS[TIMELINE.findIndex((event) => event.id === "call")];

function reducedMotion(): boolean {
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function BoardChip({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={CHIP}>
      {children}
    </a>
  );
}

export function Apollo1Scenario() {
  return (
    <div className="mx-auto grid w-full max-w-[64rem] gap-6">
      <PageTitle title="Apollo 1, 1967" />
      <header>
        <h2 className="font-display text-[26px] leading-[32px] font-semibold tracking-[-0.02em] text-ink">A cabin fire on the launch pad</h2>
        <p className="mt-1.5 max-w-[60ch] text-[17px] leading-[26px] text-ink-2">
          27 January 1967: three astronauts died in a ground test, in a cabin of pure oxygen.
        </p>
      </header>
      <FireTimeline />
      <Apollo1Versus />
      <AirVerdict />
      <Aftermath />
    </div>
  );
}

function FireTimeline() {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);

  const play = useCallback(() => {
    if (reducedMotion() || typeof requestAnimationFrame === "undefined") {
      setT(END);
      return;
    }
    cancelAnimationFrame(frame.current);
    setPlaying(true);
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = ((now - start) / 1000) * SPEED;
      setT(Math.min(END, elapsed));
      if (elapsed < END) frame.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const id = setTimeout(play, 400);
    return () => {
      clearTimeout(id);
      cancelAnimationFrame(frame.current);
    };
  }, [play]);

  // Stage 1: a small flame low on the left grows up the left wall until the rupture.
  const grow = Math.min(1, Math.max(0, t / RUPTURE));
  const growth = grow < CALL / RUPTURE ? grow * 0.35 : 0.12 + Math.pow(grow, 2.2) * 0.88;
  // Stage 2: at the rupture the flames sweep left to right for a few seconds.
  const sweep = Math.min(1, Math.max(0, (t - RUPTURE) / 2.5));
  // Stage 3: smoke.
  const smoke = Math.min(1, Math.max(0, (t - RUPTURE - 1.5) / 2.5));

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>About 25 seconds</CardTitle>
          <p className="mt-1 text-[15px] leading-[23px] text-ink-2">From the first electrical sign to the cabin splitting open.</p>
        </div>
        <button
          type="button"
          onClick={play}
          disabled={playing}
          className="h-9 rounded-md border border-line bg-surface px-3 text-[14px] font-semibold text-ink transition-colors hover:border-brand disabled:opacity-50"
        >
          {playing ? "Playing…" : "Play again"}
        </button>
      </div>

      <div
        data-testid="apollo1-cabin"
        role="img"
        aria-label="Illustration: a flame starts low on the left, climbs the left wall, sweeps left to right when the cabin splits, then smoke fills the cabin"
        className="relative mt-4 w-full overflow-hidden rounded-md bg-[#0b0d12]"
      >
        <CabinSketch t={t} growth={growth} sweep={sweep} smoke={smoke} />
        <span className="absolute top-3 right-3 rounded-sm bg-black/60 px-2 py-1 text-[13px] font-semibold text-white">
          Illustration timed to the Board&apos;s clock · {SPEED}× faster
        </span>
        <span className="absolute bottom-3 left-3 rounded-sm bg-black/60 px-2 py-0.5 font-mono text-[15px] font-semibold text-white" data-testid="apollo1-clock">
          {t.toFixed(1)} s
        </span>
      </div>

      <ol className="mt-4 grid gap-2" data-testid="apollo1-timeline">
        {TIMELINE.map((event, index) => {
          const reached = t >= OFFSETS[index];
          return (
            <li
              key={event.id}
              data-reached={reached}
              className={`flex gap-3 text-[15px] leading-[23px] transition-opacity duration-300 ${reached ? "opacity-100" : "opacity-35"}`}
            >
              <span className="w-[4.5rem] shrink-0 font-mono font-semibold text-ink">{OFFSETS[index].toFixed(1)} s</span>
              <span className="text-ink">{event.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
        Times from <BoardChip href={BOARD_CHRONOLOGY_URL}>{BOARD_SOURCE}</BoardChip>
      </p>
    </Card>
  );
}

/** One flame tongue: a teardrop path rising from (x, base), height h, width w, swaying with the clock. */
function tongue(x: number, base: number, h: number, w: number, sway: number): string {
  const tip = x + sway;
  return `M ${x - w / 2} ${base} C ${x - w / 2} ${base - h * 0.45}, ${tip - w * 0.15} ${base - h * 0.75}, ${tip} ${base - h} C ${tip + w * 0.15} ${base - h * 0.75}, ${x + w / 2} ${base - h * 0.45}, ${x + w / 2} ${base} Z`;
}

/**
 * The cabin as a line sketch seen through the hatch (three couches, the console above them, walls
 * sloping in), with the fire drawn over it in the Board's three stages. Drawn in code.
 */
function CabinSketch({ t, growth, sweep, smoke }: { t: number; growth: number; sweep: number; smoke: number }) {
  const line = "rgba(160,174,200,0.55)";
  const flick = (k: number) => Math.sin(t * 9 + k * 1.7) * 6 + Math.sin(t * 13 + k) * 3;
  // Stage 1: tongues climb the left wall; their number and height grow with `growth`.
  const tongues = Array.from({ length: 6 }, (_, k) => {
    const h = Math.max(0, growth * 260 - k * 26) * (0.8 + 0.2 * Math.sin(t * 7 + k));
    return { x: 70 + k * 22, h, w: 26 + growth * 26 };
  }).filter((f) => f.h > 2);
  return (
    <svg viewBox="0 0 800 300" className="block h-auto w-full" aria-hidden="true">
      <defs>
        <linearGradient id="a1-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff4d6" />
          <stop offset="0.45" stopColor="#ffb547" />
          <stop offset="1" stopColor="#e25d10" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="a1-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffe2a8" stopOpacity="0.95" />
          <stop offset="0.8" stopColor="#ff9a3c" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="a1-glow" cx="0.1" cy="1" r="0.9">
          <stop offset="0" stopColor="#ffb547" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* walls sloping in, console, couches */}
      <path d="M 40 290 L 130 30 L 670 30 L 760 290" fill="none" stroke={line} strokeWidth="2" />
      <path d="M 170 40 Q 400 0 630 40 L 610 110 Q 400 80 190 110 Z" fill="rgba(60,66,80,0.6)" stroke={line} strokeWidth="1.5" />
      {Array.from({ length: 24 }, (_, i) => (
        <circle key={i} cx={215 + (i % 12) * 34} cy={i < 12 ? 62 : 88} r="3" fill="rgba(200,210,230,0.35)" />
      ))}
      {[200, 330, 460].map((x) => (
        <g key={x}>
          <rect x={x} y="150" width="120" height="120" rx="10" fill="rgba(220,214,200,0.12)" stroke={line} strokeWidth="1.5" />
          <line x1={x + 20} y1="175" x2={x + 100} y2="175" stroke={line} strokeWidth="1" />
        </g>
      ))}
      <line x1="325" y1="40" x2="325" y2="290" stroke={line} strokeWidth="5" />
      <line x1="455" y1="40" x2="455" y2="290" stroke={line} strokeWidth="5" />
      <rect x="55" y="215" width="95" height="65" fill="rgba(60,66,80,0.6)" stroke={line} strokeWidth="1.5" />
      {/* stage 1: the glow and the tongues on the left */}
      <rect x="0" y="0" width="800" height="300" fill="url(#a1-glow)" opacity={Math.min(1, growth * 1.4)} />
      {tongues.map((f, k) => (
        <path key={k} d={tongue(f.x, 290, f.h, f.w, flick(k))} fill="url(#a1-flame)" opacity={0.92} />
      ))}
      {growth > 0 && growth < 0.15 ? <circle cx="100" cy="270" r={4 + Math.abs(flick(9)) / 2} fill="#cfe3ff" /> : null}
      {/* stage 2: the sweep left to right over and under the couches */}
      {sweep > 0 ? <rect x="0" y="40" width={sweep * 800} height="250" fill="url(#a1-sweep)" opacity={1 - smoke * 0.7} /> : null}
      {/* stage 3: smoke, one small flame stays low on the left */}
      <rect x="0" y="0" width="800" height="300" fill="#1a120c" opacity={smoke * 0.9} />
      {smoke > 0.6 ? <path d={tongue(100, 285, 40 + flick(3), 22, flick(4) / 2)} fill="url(#a1-flame)" /> : null}
    </svg>
  );
}

/** What happened against what burnrate would have shown, with the tested range from GET /air/presets. */
function Apollo1Versus() {
  const presets = useApi<AirPresets>(PRESETS_PATH);
  if (presets.status !== "ok" || !presets.data.custom) return null;
  const range = presets.data.custom;
  const check = checkAir(range);
  const kpa = psiaToKpa(APOLLO1_AIR.pressurePsia);
  const rupture = OFFSETS[TIMELINE.findIndex((event) => event.id === "rupture")];
  return (
    <Versus
      testId="apollo1-versus"
      then={{
        kicker: "What happened",
        headline: "A sealed cabin of pure oxygen",
        rows: [
          `A ground test on the launch pad. The cabin holds ${percent(APOLLO1_AIR.o2MoleFraction)}% oxygen at ${APOLLO1_AIR.pressurePsia} psi, slightly above sea-level pressure.`,
          "A probable electrical arc low in the left equipment bay. The cabin is lined with nylon nets, Velcro and foam.",
          `${rupture.toFixed(1)} s from the first electrical sign to the cabin wall splitting open.`,
          "The hatch cannot open against the cabin pressure. Rescuers need about 5 minutes.",
          "Gus Grissom, Ed White and Roger Chaffee die.",
        ],
        footer: <VersusSource href={BOARD_FINDINGS_URL}>{BOARD_SOURCE}</VersusSource>,
      }}
      burnrate={{
        kicker: "What burnrate would have shown",
        headline: check.tested ? "Tested air" : "Never tested in this air",
        rows: [
          check.o2 === "above"
            ? `Oxygen ${percent(APOLLO1_AIR.o2MoleFraction)}%: no NASA flame test in the PSI catalog goes above ${percent(range.o2_max)}%.`
            : `Oxygen ${percent(APOLLO1_AIR.o2MoleFraction)}%: inside the tested range.`,
          check.pressure === "inside"
            ? `Pressure ${kpa} kPa: inside the tested range. The gap is the oxygen alone.`
            : `Pressure ${kpa} kPa: outside the tested range too.`,
          "burnrate marks this air in red: Never tested in this air.",
          "Before a crew is sealed inside, the warning is plain: no flame has ever been measured in this air.",
        ],
        footer: <span>A thought experiment: the PSI flame tests came decades later. Tested range from the PSI catalog.</span>,
      }}
    />
  );
}

function AirVerdict() {
  const presets = useApi<AirPresets>(PRESETS_PATH);
  if (presets.status === "loading") return <Loading label="Loading the tested range…" rows={2} />;
  if (presets.status === "error") return <Unreachable error={presets.error} onRetry={presets.retry} what="the tested range" />;
  const range = presets.data.custom;
  if (!range) return null;
  const check = checkAir(range);
  const kpa = psiaToKpa(APOLLO1_AIR.pressurePsia);

  return (
    <Card data-testid="apollo1-verdict">
      <CardTitle>Apollo 1 against the tested range</CardTitle>
      <SavedCopyNote source={presets.source} savedAt={presets.savedAt} />
      <div className="mt-4 grid gap-5">
        <Gauge
          label="Oxygen"
          value={`${percent(APOLLO1_AIR.o2MoleFraction)}%`}
          min={0}
          max={1}
          testedMin={range.o2_min}
          testedMax={range.o2_max}
          point={APOLLO1_AIR.o2MoleFraction}
          testedText={`NASA tested ${percent(range.o2_min)}% to ${percent(range.o2_max)}%`}
        />
        <Gauge
          label="Pressure"
          value={`${kpa} kPa (${APOLLO1_AIR.pressurePsia} psi)`}
          min={0}
          max={Math.max(range.pressure_kpa_max, kpa) * 1.05}
          testedMin={range.pressure_kpa_min}
          testedMax={range.pressure_kpa_max}
          point={kpa}
          testedText={`NASA tested ${range.pressure_kpa_min} to ${range.pressure_kpa_max} kPa`}
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {check.tested ? (
          <StatusPill tone="ok">Tested</StatusPill>
        ) : (
          <StatusPill tone="danger" data-testid="apollo1-never-tested">
            Never tested in this air
          </StatusPill>
        )}
        <span className="text-[15px] leading-[23px] text-ink">
          {check.o2 === "above"
            ? `No NASA flame test in the PSI catalog used more than ${percent(range.o2_max)}% oxygen.`
            : "The tested range covers this air."}
        </span>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
        Cabin air from <BoardChip href={BOARD_FINDINGS_URL}>{BOARD_SOURCE}</BoardChip>
        <span>· Tested range from the PSI catalog</span>
      </p>
    </Card>
  );
}

function Gauge({
  label,
  value,
  min,
  max,
  testedMin,
  testedMax,
  point,
  testedText,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  testedMin: number;
  testedMax: number;
  point: number;
  testedText: string;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), 300);
    return () => clearTimeout(id);
  }, []);
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const inside = point >= testedMin && point <= testedMax;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold text-ink">{label}</span>
        <span className="font-mono text-[15px] font-semibold text-ink">Apollo 1: {value}</span>
      </div>
      <div className="relative mt-2 h-4 rounded-full bg-surface-sunk">
        <div
          className="absolute inset-y-0 rounded-full bg-brand-soft ring-1 ring-brand"
          style={{ left: pos(testedMin), width: `calc(${pos(testedMax)} - ${pos(testedMin)})` }}
        />
        <div
          className={`absolute -top-1 h-6 w-1.5 -translate-x-1/2 rounded-full transition-[left] duration-[1400ms] ease-out ${inside ? "bg-ok" : "bg-danger"}`}
          style={{ left: shown ? pos(point) : pos(testedMin) }}
        />
      </div>
      <p className="mt-1.5 text-[14px] text-ink-2">{testedText}</p>
    </div>
  );
}

function Aftermath() {
  return (
    <Card>
      <figure className="m-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/scenarios/apollo1-S67-21294.jpg"
          alt="The burned interior of the Apollo 1 command module after the fire"
          loading="lazy"
          className="w-full rounded-md"
        />
        <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
          The cabin after the fire, 28 January 1967. Photo: NASA, S67-21294
        </figcaption>
      </figure>
      <p className="mt-4 text-[15px] leading-[23px] text-ink">
        This fire burned in normal gravity, on the launch pad. In orbit, flames behave differently.
      </p>
      <p className="mt-2 text-[14px] text-ink-2">
        <AppLink href="/">Check another cabin air</AppLink>
      </p>
    </Card>
  );
}
