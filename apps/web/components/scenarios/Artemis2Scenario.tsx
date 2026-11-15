"use client";

// The Artemis II scenario page (April 2026): a fire alarm about 80,000 miles from home, set
// against what burnrate would have shown. The flame times come from the video engine's evidence
// (PSI-25, BASS-II), the Moon-base air check from GET /air/coverage; the mission facts from
// lib/scenarios/artemis2.ts, with sources. The animation is drawn in code (no generated images,
// DESIGN.md): each flame goes out at the time measured from its NASA video.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/AppLink";
import { EvidenceNumber } from "@/components/evidence/EvidenceNumber";
import { useEvidencePanel } from "@/components/evidence/EvidencePanel";
import { Loading, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import { CountUp } from "@/components/motion/CountUp";
import { PageTitle } from "@/components/shell/ShellState";
import { Card, CardTitle } from "@/components/ui/Card";
import { SourceChip } from "@/components/ui/SourceChip";
import { StatusPill } from "@/components/ui/StatusPill";
import { useApi } from "@/lib/api";
import { PRESETS_PATH } from "@/lib/air";
import {
  EVIDENCE_PATH,
  EXPLORATION_AIR,
  EXPLORATION_COVERAGE_PATH,
  FAN_FINDING_ID,
  FINDINGS_PATH,
  GUIDE_SOURCE,
  GUIDE_URL,
  MILES_FROM_HOME,
  PRESS_SOURCE,
  PRESS_URL,
  QUOTE,
  QUOTE_SOURCE,
  QUOTE_URL,
  burningCount,
  fanCounts,
  fanTests,
  moonBaseAnswer,
  secondsText,
  type FanTest,
} from "@/lib/scenarios/artemis2";
import type { AirCoverage, AirPresets, Evidence, Finding } from "@/lib/types";
import { Versus, VersusSource } from "./Versus";

function reducedMotion(): boolean {
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Artemis2Scenario() {
  const evidence = useApi<Evidence[]>(EVIDENCE_PATH);
  const findings = useApi<Finding[]>(FINDINGS_PATH);
  const coverage = useApi<AirCoverage>(EXPLORATION_COVERAGE_PATH);
  const presets = useApi<AirPresets>(PRESETS_PATH);

  return (
    <div className="mx-auto grid w-full max-w-[64rem] gap-6">
      <PageTitle title="Artemis II, 2026" />
      <Hero />
      {evidence.status === "loading" || findings.status === "loading" || coverage.status === "loading" ? (
        <Loading label="Loading the flight tests…" rows={4} />
      ) : evidence.status === "error" ? (
        <Unreachable error={evidence.error} onRetry={evidence.retry} what="the flight tests" />
      ) : findings.status === "error" ? (
        <Unreachable error={findings.error} onRetry={findings.retry} what="the findings" />
      ) : coverage.status === "error" ? (
        <Unreachable error={coverage.error} onRetry={coverage.retry} what="the tested air" />
      ) : (
        <Loaded
          evidence={evidence.data}
          finding={findings.data.find((item) => item.id === FAN_FINDING_ID) ?? null}
          coverage={coverage.data}
          moonAir={presets.status === "ok" ? (presets.data.presets.find((preset) => preset.id === EXPLORATION_AIR)?.plain ?? null) : null}
          source={evidence.source}
          savedAt={evidence.savedAt}
        />
      )}
    </div>
  );
}

function Hero() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setOn(true), 200);
    return () => clearTimeout(id);
  }, []);
  return (
    <section
      data-testid="artemis2-hero"
      className="relative overflow-hidden rounded-xl bg-[#05070f] px-6 py-10 text-white sm:px-10 sm:py-14"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {Array.from({ length: 40 }, (_, i) => (
          <span
            key={i}
            className="absolute h-px w-px rounded-full bg-white"
            style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, opacity: 0.25 + ((i * 7) % 10) / 20 }}
          />
        ))}
        <span className={`absolute top-1/2 right-[12%] h-40 w-40 -translate-y-1/2 rounded-full bg-[#ff3b1f]/25 blur-2xl ${on ? "animate-pulse" : ""}`} />
      </div>
      <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-[13px] font-semibold tracking-[0.14em] text-[#ff9b85] uppercase">April 2026 · Artemis II · crew of four</p>
          <h2 className="mt-3 font-display text-[34px] leading-[40px] font-semibold tracking-[-0.02em] sm:text-[44px] sm:leading-[50px]">
            The fire alarm goes off,
            <br />
            <span className="text-[#ffb4a3]">
              <CountUp value={MILES_FROM_HOME} duration={1800} /> miles from home.
            </span>
          </h2>
          <blockquote className="mt-5 max-w-[56ch] border-l-2 border-[#ff6a4d] pl-4 text-[17px] leading-[26px] text-[#e8e1e0]">
            &ldquo;{QUOTE}&rdquo;
            <footer className="mt-2 text-[14px] text-[#b9adab]">
              The mission&apos;s commander, quoted on the{" "}
              <VersusSource href={QUOTE_URL}>{QUOTE_SOURCE}</VersusSource>
            </footer>
          </blockquote>
        </div>
        <AlarmLight on={on} />
      </div>
    </section>
  );
}

/** A pulsing alarm lamp, drawn in code. */
function AlarmLight({ on }: { on: boolean }) {
  return (
    <div aria-hidden="true" className="relative mx-auto h-36 w-36">
      {[0, 1, 2].map((ring) => (
        <span
          key={ring}
          className={`absolute inset-0 rounded-full border-2 border-[#ff4a2e] ${on ? "animate-ping" : "opacity-0"}`}
          style={{ animationDelay: `${ring * 0.45}s`, animationDuration: "1.8s" }}
        />
      ))}
      <span className="absolute inset-6 flex items-center justify-center rounded-full bg-gradient-to-b from-[#ff6a4d] to-[#a3170a] text-[13px] font-bold tracking-[0.12em] text-white shadow-[0_0_60px_#ff3b1f]">
        ALARM
      </span>
    </div>
  );
}

function Loaded({
  evidence,
  finding,
  coverage,
  moonAir,
  source,
  savedAt,
}: {
  evidence: Evidence[];
  finding: Finding | null;
  coverage: AirCoverage;
  moonAir: string | null;
  source: "live" | "saved";
  savedAt: string | null;
}) {
  const tests = fanTests(evidence);
  const counts = fanCounts(tests);
  const moon = moonBaseAnswer(coverage);
  const panel = useEvidencePanel();
  const openFinding = finding && panel ? (event: React.MouseEvent<HTMLButtonElement>) => panel.open(finding, { opener: event.currentTarget }) : null;

  if (counts.total === 0) {
    return (
      <Card>
        <CardTitle>What burnrate would have shown</CardTitle>
        <p className="mt-2 text-[15px] text-ink-2">The fan-drop tests are not in the data yet.</p>
      </Card>
    );
  }

  const fanCount = (text: string) =>
    openFinding ? (
      <button type="button" onClick={openFinding} className="font-semibold underline decoration-dotted underline-offset-[3px] hover:decoration-solid">
        {text}
      </button>
    ) : (
      <strong>{text}</strong>
    );

  return (
    <>
      <SavedCopyNote source={source} savedAt={savedAt} />
      <Versus
        testId="artemis2-versus"
        then={{
          kicker: "What happened",
          headline: "An alarm with no quick way home",
          rows: [
            "A smoke detector goes off aboard Integrity, the crew's Orion capsule.",
            "The crew is about 80,000 miles from Earth. No fire crew to call, no quick way back.",
            "A tense few minutes, until Mission Control in Houston steps in.",
            "The question in those minutes: if something is burning, what does a flame do up here?",
          ],
          footer: (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              <VersusSource href={QUOTE_URL}>{QUOTE_SOURCE}</VersusSource>
              <VersusSource href={PRESS_URL}>{PRESS_SOURCE}</VersusSource>
            </span>
          ),
        }}
        burnrate={{
          kicker: "What burnrate would have shown",
          headline: `NASA already ran this in orbit: ${counts.total} flames, then the fan turned down`,
          rows: [
            <>
              {fanCount(`${counts.withFan} of ${counts.total}`)} flames went out within{" "}
              {counts.slowestWithFan !== null ? secondsText(counts.slowestWithFan) : "seconds"} of the fan slowing.
            </>,
            counts.longest && counts.keptBurning > 0 ? (
              <>
                {counts.keptBurning === 1 ? "One kept burning" : `${counts.keptBurning} kept burning`}: test {counts.longest.label}, still alight{" "}
                <strong>{secondsText(counts.longest.seconds)}</strong> after the fan began to fall.
              </>
            ) : (
              "None kept burning past the fan drop."
            ),
            <>
              {counts.before} had already gone out before the fan changed.
            </>,
            moon ? (
              <>
                The Moon-base air crews are expected to breathe{moonAir ? ` (${moonAir.toLowerCase()})` : ""}:{" "}
                <strong>
                  {moon.inside} of {moon.stated}
                </strong>{" "}
                suppression tests ran in it. {moon.tested ? "" : "Never tested."}
              </>
            ) : (
              "The Moon-base air: no suppression test states its air."
            ),
          ],
          footer: (
            <span className="flex flex-wrap items-center gap-2">
              <span>Flight data:</span>
              <SourceChip psiId="PSI-25">PSI-25 BASS-II</SourceChip>
              {moon?.investigations.map((item) => (
                <SourceChip key={item.psi_id} psiId={item.psi_id} />
              ))}
            </span>
          ),
        }}
      />
      <FlameRace tests={tests} />
      <Honest />
    </>
  );
}

const T_START = -3;

/** The 15 flames on one clock: zero is the moment the fan voltage begins to fall. */
function FlameRace({ tests }: { tests: FanTest[] }) {
  const end = Math.ceil(Math.max(3, ...tests.map((test) => test.seconds))) + 1.5;
  const [t, setT] = useState(T_START);
  const [playing, setPlaying] = useState(false);
  const frame = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const play = useCallback(() => {
    if (reducedMotion() || typeof requestAnimationFrame === "undefined") {
      setT(end);
      return;
    }
    cancelAnimationFrame(frame.current);
    setPlaying(true);
    const start = performance.now();
    const tick = (now: number) => {
      const value = T_START + (now - start) / 1000;
      setT(Math.min(end, value));
      if (value < end) frame.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
  }, [end]);

  // Start when the card scrolls into view.
  useEffect(() => {
    const node = box.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      const id = setTimeout(play, 400);
      return () => clearTimeout(id);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          play();
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [play]);

  const burning = burningCount(tests, t);
  const fanFalling = t >= 0;

  return (
    <Card>
      <div ref={box} className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{tests.length} flames, one fan</CardTitle>
          <p className="mt-1 text-[15px] leading-[23px] text-ink-2">Each flame goes out at the time measured from its NASA video.</p>
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
        className="relative mt-4 overflow-hidden rounded-md bg-[#05070f] p-4 sm:p-6"
        data-testid="artemis2-race"
        style={{ "--color-accent": "#9fb3ff", "--color-accent-hover": "#ffffff" } as React.CSSProperties}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-white">
          <div className="flex items-center gap-3">
            <FanIcon spinning={!fanFalling} />
            <span className={`text-[15px] font-semibold ${fanFalling ? "text-[#ff9b85]" : "text-[#9fb3ff]"}`}>
              {fanFalling ? "Fan turned down" : "Fan on: air flowing over the flames"}
            </span>
          </div>
          <div className="flex items-baseline gap-4 font-mono">
            <span className="text-[15px] text-[#c9d2f0]" data-testid="artemis2-clock">
              {t >= 0 ? "+" : ""}
              {t.toFixed(1)} s
            </span>
            <span className="text-[22px] font-semibold text-white" data-testid="artemis2-burning">
              {burning} <span className="text-[14px] font-normal text-[#c9d2f0]">burning</span>
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {tests.map((test) => (
            <FlameCell key={test.testId} test={test} t={t} />
          ))}
        </div>
        <span className="mt-4 block text-[13px] text-[#9aa6c8]">Illustration drawn in code · real time · times from PSI-25 videos</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-ink-2">
        <StatusPill tone="brand">Went out with the fan</StatusPill>
        <StatusPill tone="danger">Kept burning</StatusPill>
        <StatusPill tone="neutral">Gone before the fan changed</StatusPill>
      </div>
    </Card>
  );
}

function FanIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-7 w-7 text-white ${spinning ? "animate-spin" : ""}`} style={{ animationDuration: "0.6s" }} aria-hidden="true">
      {[0, 120, 240].map((angle) => (
        <path key={angle} d="M12 12 C 13 6, 18 5, 17 9 Z" fill="currentColor" transform={`rotate(${angle} 12 12)`} opacity="0.9" />
      ))}
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function FlameCell({ test, t }: { test: FanTest; t: number }) {
  const alive = test.seconds > t;
  const before = test.outcome === "before";
  const kept = test.outcome === "kept_burning";
  // A flame that is past its time shrinks to nothing over 0.4 s.
  const fade = alive ? 1 : Math.max(0, 1 - (t - test.seconds) / 0.4);
  const scale = fade;
  const flicker = 0.92 + 0.08 * Math.sin(t * 11 + test.seconds * 3);
  const colour = kept ? "#ff7a4d" : "#7d95ff";
  return (
    <div
      data-testid="artemis2-flame"
      data-outcome={test.outcome}
      className={`flex flex-col items-center gap-1 rounded-md border px-2 py-3 transition-colors ${
        before ? "border-white/10" : alive ? (kept && t >= 0 ? "border-[#ff7a4d]/70" : "border-[#3b5bff]/50") : "border-white/15"
      }`}
    >
      <svg viewBox="0 0 40 48" className="h-12 w-10" aria-hidden="true">
        <defs>
          <radialGradient id={`fc-${test.label}`} cx="0.5" cy="0.6" r="0.6">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.35" stopColor={colour} />
            <stop offset="1" stopColor={colour} stopOpacity="0" />
          </radialGradient>
        </defs>
        {!alive ? <circle cx="20" cy="28" r="9" fill="none" stroke="rgba(255,255,255,0.18)" strokeDasharray="2 3" /> : null}
        {scale > 0 ? (
          <g transform={`translate(20 28) scale(${scale * flicker}) translate(-20 -28)`}>
            <ellipse cx="20" cy="26" rx="13" ry="17" fill={`url(#fc-${test.label})`} />
          </g>
        ) : null}
      </svg>
      <span className="font-mono text-[13px] font-semibold text-white">{test.label}</span>
      <span className="text-[13px] text-[#c9d2f0]">
        <EvidenceNumber record={test.record} />
      </span>
    </div>
  );
}

function Honest() {
  return (
    <Card>
      <CardTitle>What this data cannot tell</CardTitle>
      <ul className="mt-3 grid gap-2 text-[15px] leading-[23px] text-ink">
        <li>What set off the Artemis II alarm. No PSI test burned anything from that cabin.</li>
        <li>BASS-II burned thin plastic (PMMA) films in a small chamber on the space station, in air close to normal.</li>
        <li>
          Stopping the air is no guarantee. NASA&apos;s guide to space station combustion research rejects the idea that a fire goes out by itself
          without airflow.{" "}
          <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="text-accent underline decoration-dotted underline-offset-[3px]">
            {GUIDE_SOURCE}
          </a>
        </li>
        <li>burnrate did not exist on the flight. This page is a thought experiment on the data NASA has published.</li>
      </ul>
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[14px]">
        <AppLink href="/spread">See the flame videos</AppLink>
        <AppLink href="/?air=exploration">Check the Moon-base air</AppLink>
        <AppLink href="/scenarios">More scenarios</AppLink>
      </p>
    </Card>
  );
}
