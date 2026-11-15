"use client";

// The Overview (DESIGN.md, "Overview"; the approved mockup of 14 November 2026): the cabin air
// (presets and sliders), what ran in it, the two analyses (Video to Data, Suppression test bench),
// the flame map and the top of the ranking. Every number comes from the backend: GET /air/presets and /air/window (lib/air.ts),
// /air/coverage, /catalog/investigations, /modules (+ an analysis's findings), /catalog/tests
// (points) and /catalog/rank. The air comes only from useAir(), so changing it anywhere (the
// card, the top bar) updates every card without a reload.
import { useRouter, useSearchParams } from "next/navigation";
import { Hero } from "./Hero";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import { EvidenceNumber } from "@/components/evidence/EvidenceNumber";
import { ProvenanceBadge } from "@/components/evidence/ProvenanceBadge";
import { SavedCopyNote } from "@/components/LoadStates";
import { AirSourceNote } from "@/components/SourceNote";
import { TestsChart } from "@/components/tests/TestsChart";
import { ButtonLink } from "@/components/ui/Button";
import { CARD, CardTitle, SectionCard } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton, SkeletonLines } from "@/components/ui/Skeleton";
import { Slider } from "@/components/ui/Slider";
import { SourceChip } from "@/components/ui/SourceChip";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  type AirChoice,
  type AirState,
  CUSTOM_ID,
  type TestedAir,
  coveragePath,
  nearestTestedAir,
  snap,
  testedMarks,
  useAir,
  useSetAir,
  windowPoint,
} from "@/lib/air";
import { type ApiError, useApi, useKeptApi } from "@/lib/api";
import { assignSeries } from "@/lib/chart";
import { formatCount } from "@/lib/format";
import { barWidth, rankPath, scoreText } from "@/lib/home";
import { withAir } from "@/lib/links";
import { stagePage } from "@/lib/nav";
import { inAirSummary, phaseOptions, share, statusPill, topRanked } from "@/lib/overview";
import { chooseEngine, coverageSentence, stageLabel } from "@/lib/pillar";
import type { AirCoverage, Finding, InvestigationList, ModuleSummary, RankResponse, Stage, TestsResponse } from "@/lib/types";

export function OverviewView() {
  const air = useAir();
  const choice = air.status === "ok" ? air.choice : null;
  const coverage = useKeptApi<AirCoverage>(coveragePath(choice));
  const catalog = useApi<InvestigationList>("/catalog/investigations");
  const items = catalog.status === "ok" ? catalog.data.items : null;
  const saved = [air.status === "ok" ? air.source : "live", coverage.status === "ok" ? coverage.source : "live"].includes("saved");

  return (
    <div className="reveal grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6">
      <Hero />
      {saved ? <SavedCopyNote source="saved" savedAt={coverage.status === "ok" ? coverage.savedAt : null} /> : null}
      <div className="pt-2">
        <h2 className="font-display text-[26px] leading-[32px] font-semibold tracking-[-0.02em] text-ink sm:text-[30px] sm:leading-[36px]">
          Is your cabin air tested?
        </h2>
        <p className="mt-1 max-w-[70ch] text-[16px] text-ink">
          Set the oxygen and pressure your crew will breathe. See the NASA tests that ran in that air, and where none did.
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6 @2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <CabinAirCard air={air} />
        <InThisAirCard air={air} coverage={coverage} items={items} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:gap-6 @2xl:grid-cols-2" data-testid="stages">
        <StageCard stage="spread" coverage={coverage.kept} stale={coverage.stale} />
        <StageCard stage="suppress" coverage={coverage.kept} stale={coverage.stale} />
      </div>
      <FlameMapCard air={air} />
      <RankedCard air={air} />
    </div>
  );
}

// ---------------------------------------------------------------- shared bits

/** A failed request inside a card: what failed, why, and "Try again". */
function CardError({ error, onRetry, what }: { error: ApiError; onRetry: () => void; what: string }) {
  return (
    <div role="alert" data-testid="card-error" className="rounded-md border border-danger/35 bg-danger-soft px-4 py-3 text-[15px]">
      <p className="font-semibold text-danger">The data service is not answering.</p>
      <p className="mt-0.5 text-ink-2">
        {what} cannot be shown. Details: {error.message}
      </p>
      <button type="button" onClick={onRetry} className="btn btn-danger mt-3">
        Try again
      </button>
    </div>
  );
}

/** A number that just changed rises in (off with reduced motion). */
function Changing({ value, children }: { value: string | number; children: ReactNode }) {
  return (
    <span key={String(value)} className="rise inline-block">
      {children}
    </span>
  );
}

function Bar({ value, tone = "bg-brand", label }: { value: number; tone?: string; label?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunk" aria-hidden={label ? undefined : true} aria-label={label}>
      <div className={`grow-x h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${tone}`} style={{ width: barWidth(value) }} />
    </div>
  );
}

// ---------------------------------------------------------------- cabin air

const o2Percent = (fraction: number) => Number((fraction * 100).toFixed(4));

/** Every catalogued test that states both oxygen and pressure, as points (the flame map and the slider marks). */
const TESTED_POINTS_PATH = "/catalog/tests?limit=1&include=points";

function choiceKey(choice: AirChoice | null): string {
  if (!choice) return "";
  return choice.kind === "preset" ? `preset:${choice.id}` : `custom:${choice.o2}:${choice.p}`;
}

function CabinAirCard({ air }: { air: AirState }) {
  const setAir = useSetAir();
  const ok = air.status === "ok" && air.air ? air : null;
  const range = ok?.custom ?? null;
  const current = ok?.air ?? null;
  const key = choiceKey(ok?.choice ?? null);

  // Where the thumbs sit: the custom point, or a point inside the preset's window (never written
  // to the URL: a preset stays ?air=<id> until a slider moves).
  const target = useMemo(() => {
    if (!current || !range) return null;
    if (current.point) return { o2: o2Percent(current.point.o2_mole_fraction), p: current.point.pressure_kpa, isRange: false };
    const point = windowPoint(current.window, range);
    return {
      o2: o2Percent(point.o2 ?? (range.o2_min + range.o2_max) / 2),
      p: point.p ?? (range.pressure_kpa_min + range.pressure_kpa_max) / 2,
      isRange: point.isRange,
    };
  }, [current, range]);

  const [local, setLocal] = useState<{ from: string; o2: number; p: number; dirty: boolean } | null>(null);
  let values = local;
  if (target && (local === null || (local.from !== key && !local.dirty))) {
    values = { from: key, o2: target.o2, p: target.p, dirty: false };
    setLocal(values);
  } else if (local && local.from !== key && local.dirty) {
    // Our own debounced change landed in the URL: keep the thumbs where the visitor left them.
    values = { ...local, from: key };
    setLocal(values);
  }

  // Slider changes reach the URL 250 ms after the last move; the thumb itself moves at once.
  useEffect(() => {
    if (!local?.dirty) return;
    const timer = window.setTimeout(() => {
      // The URL gets the point on the sliders' own grid (the API's ranges and steps).
      const o2 = range ? snap(local.o2, o2Percent(range.o2_min), o2Percent(range.o2_max), o2Percent(range.o2_step)) : local.o2;
      const p = range ? snap(local.p, range.pressure_kpa_min, range.pressure_kpa_max, range.pressure_kpa_step) : local.p;
      setAir({ kind: "custom", o2: Number((o2 / 100).toFixed(4)), p });
      setLocal((value) => (value ? { ...value, dirty: false } : value));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [local, setAir, range]);

  const isCustom = current?.id === CUSTOM_ID || Boolean(values?.dirty);
  const [jumped, setJumped] = useState<TestedAir | null>(null);
  const move = (patch: Partial<{ o2: number; p: number }>) => {
    setJumped(null);
    setLocal((value) => (value ? { ...value, ...patch, dirty: true } : value));
  };

  // Where catalogued tests exist along each slider, and the test nearest to the sliders. The
  // points are the ones the flame map below draws (one request, shared by its address).
  const tested = useApi<TestsResponse>(range ? TESTED_POINTS_PATH : null);
  const testedAirs = useMemo<TestedAir[]>(
    () => (tested.status === "ok" ? (tested.data.points?.items ?? []).map(([testId, , o2, p]) => ({ testId, o2, p })) : []),
    [tested],
  );
  const marks = useMemo(
    () =>
      range
        ? {
            o2: testedMarks(testedAirs.map((t) => o2Percent(t.o2)), o2Percent(range.o2_min), o2Percent(range.o2_max)),
            p: testedMarks(testedAirs.map((t) => t.p), range.pressure_kpa_min, range.pressure_kpa_max),
          }
        : { o2: [], p: [] },
    [testedAirs, range],
  );
  const jump = () => {
    if (!range || !values) return;
    const near = nearestTestedAir({ o2: values.o2 / 100, p: values.p }, testedAirs, range);
    if (!near) return;
    move({
      o2: snap(o2Percent(near.o2), o2Percent(range.o2_min), o2Percent(range.o2_max), o2Percent(range.o2_step)),
      p: snap(near.p, range.pressure_kpa_min, range.pressure_kpa_max, range.pressure_kpa_step),
    });
    setJumped(near);
  };

  return (
    <section aria-labelledby="cabin-air-title" data-testid="cabin-air" data-air={current?.id ?? ""} className={`${CARD} p-5 sm:p-6`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <CardTitle id="cabin-air-title">Cabin air</CardTitle>
        {current ? (
          <StatusPill tone={isCustom ? "ember" : "brand"} data-testid="air-badge">
            {isCustom ? "Custom" : "Preset"}
          </StatusPill>
        ) : null}
      </div>

      {air.status === "loading" ? (
        <SkeletonLines label="Loading the cabin airs…" lines={4} />
      ) : air.status === "error" ? (
        <CardError error={air.error} onRetry={air.retry} what="The list of cabin airs" />
      ) : !current ? (
        <p className="text-ink-2">The data service lists no cabin air.</p>
      ) : (
        <>
          {range && values ? (
            <div data-testid="air-sliders">
              <div className="grid gap-5 @md:grid-cols-2 sm:gap-6">
                <Slider
                  label="Oxygen"
                  testId="slider-o2"
                  value={snap(values.o2, o2Percent(range.o2_min), o2Percent(range.o2_max), o2Percent(range.o2_step))}
                  min={o2Percent(range.o2_min)}
                  max={o2Percent(range.o2_max)}
                  step={o2Percent(range.o2_step)}
                  display={`${values.o2.toFixed(1)} %`}
                  onChange={(o2) => move({ o2 })}
                  marks={marks.o2}
                />
                <Slider
                  label="Pressure"
                  testId="slider-pressure"
                  value={snap(values.p, range.pressure_kpa_min, range.pressure_kpa_max, range.pressure_kpa_step)}
                  min={range.pressure_kpa_min}
                  max={range.pressure_kpa_max}
                  step={range.pressure_kpa_step}
                  display={`${values.p.toFixed(1)} kPa`}
                  onChange={(p) => move({ p })}
                  marks={marks.p}
                />
              </div>
              {testedAirs.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="tested-air">
                  <button type="button" onClick={jump} className="btn btn-secondary" data-testid="jump-nearest">
                    Jump to nearest tested air
                  </button>
                  <p className="min-w-0 flex-1 basis-[16rem] text-[14px] leading-[20px] text-ink-2" data-testid="tested-air-note">
                    {jumped ? (
                      <>
                        Nearest test:{" "}
                        <AppLink href={`/tests?test=${encodeURIComponent(jumped.testId)}`} className="font-mono text-accent underline underline-offset-[3px]">
                          {jumped.testId}
                        </AppLink>
                        , at {o2Percent(jumped.o2).toFixed(1)}% oxygen and {jumped.p.toFixed(1)} kPa.
                      </>
                    ) : (
                      <>
                        The marks under each slider show where the {testedAirs.length.toLocaleString("en-US")} catalogued tests that state
                        oxygen and pressure ran.
                      </>
                    )}
                  </p>
                </div>
              ) : null}
              {air.customUnavailable ? (
                // The sliders stay: moving one asks again (DOB-147: this note used to replace them).
                <p data-testid="custom-unavailable" className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-[14px] leading-[20px] text-ink">
                  This custom air could not be loaded. The default preset is shown. Move a slider to try again.
                </p>
              ) : null}
              <p className="mt-2 text-[14px] leading-[20px] text-ink-2" data-testid="slider-note">
                {!isCustom && target?.isRange ? "This preset covers a range. The sliders sit inside it. " : ""}
                {air.customPlain ?? ""}
              </p>
            </div>
          ) : (
            <p data-testid="custom-unavailable" className="rounded-md bg-surface-sunk px-3 py-2 text-[14px] text-ink-2">
              Custom air is not available yet. Pick a preset.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Cabin air presets">
            {air.presets.map((preset) => {
              const on = !isCustom && preset.id === current.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={on}
                  data-testid="preset-chip"
                  data-air={preset.id}
                  onClick={() => {
                    setLocal(null);
                    setJumped(null);
                    setAir(preset.id);
                  }}
                  className={`inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-[14px] font-medium transition-colors duration-150 max-sm:h-11 ${
                    on ? "border-brand bg-brand-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-control hover:text-ink"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-1 text-[15px] leading-[22px] text-ink-2">
            <p>
              <span className="font-semibold text-ink">{current.label}:</span> <span data-testid="air-plain">{current.plain}</span>.{" "}
              <span data-testid="air-tolerance">{current.tolerance_plain}</span>
            </p>
            <AirSourceNote air={current} />
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- in this air

function InThisAirCard({
  air,
  coverage,
  items,
}: {
  air: AirState;
  coverage: ReturnType<typeof useKeptApi<AirCoverage>>;
  items: InvestigationList["items"] | null;
}) {
  const [all, setAll] = useState(false);
  const data = coverage.kept;
  const summary = useMemo(() => (data ? inAirSummary(data, items) : null), [data, items]);
  const SHOWN = 5;
  const constrains = data?.constrains ?? [];
  const what =
    constrains.includes("o2_mole_fraction") && constrains.includes("pressure_kpa")
      ? "oxygen and pressure"
      : constrains.includes("o2_mole_fraction")
        ? "oxygen"
        : constrains.includes("pressure_kpa")
          ? "pressure"
          : "what this air bounds";

  let body: ReactNode;
  if (air.status === "error") body = <CardError error={air.error} onRetry={air.retry} what="The cabin airs" />;
  else if (coverage.status === "error" && !data) body = <CardError error={coverage.error} onRetry={coverage.retry} what="What ran in this air" />;
  else if (!summary) body = <SkeletonLines label="Counting the tests in this air…" lines={4} />;
  else
    body = (
      <div className={`transition-opacity duration-200 ${coverage.stale ? "opacity-60" : ""}`}>
        <p className="font-display text-[30px] leading-[34px] font-semibold tracking-[-0.02em] tabular-nums" data-testid="in-air-count" data-inside={summary.inside} data-stated={summary.stated}>
          <Changing value={`${summary.inside}/${summary.stated}`}>
            {formatCount(summary.inside)}{" "}
            <span className="text-[16px] font-medium text-ink-2">of {formatCount(summary.stated)} tests</span>
          </Changing>
        </p>
        <p className="mb-4 mt-1 text-[15px] text-ink-2">
          {summary.inside > 0
            ? "ran inside this cabin air window."
            : summary.stated > 0
              ? "None of these tests ran in this air. Try another preset."
              : "No table states what this air bounds."}
        </p>
        <ul className="grid gap-3" aria-label="Tests in this air, per investigation">
          {(all ? summary.rows : summary.rows.slice(0, SHOWN)).map((row) => (
            <li key={row.psi_id} data-testid="in-air-row" data-psi-id={row.psi_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-[14px]">
              <span className="flex min-w-0 items-center gap-2">
                <SourceChip psiId={row.psi_id} label={`${row.psi_id}, ${row.name}: open the investigation`} />
                <span className="truncate text-ink">{row.name}</span>
              </span>
              <span className="tabular-nums text-ink-2" data-testid="in-air-row-count">
                {formatCount(row.inside)} of {formatCount(row.stated)}
              </span>
              <div className="col-span-2">
                <Bar value={share(row.inside, row.stated)} tone={row.fuel_phase === "gas" ? "bg-series-gas" : row.fuel_phase === "liquid" ? "bg-series-droplet" : "bg-brand"} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[14px] leading-[20px] text-ink-2" data-testid="in-air-note">
          Counts only tests whose table states {what}.
          {summary.notStated > 0 ? ` ${summary.notStated} investigations state no ${what} and are left out.` : ""}
        </p>
        {summary.rows.length > SHOWN ? (
          <button type="button" onClick={() => setAll((value) => !value)} className="btn btn-ghost mt-2 -ml-3" aria-expanded={all}>
            {all ? "Show fewer" : `Show all ${summary.rows.length} investigations`}
          </button>
        ) : null}
      </div>
    );

  return (
    <SectionCard
      title="In this air"
      titleId="in-air-title"
      data-testid="in-air"
      data-air={data?.air ?? ""}
      action={
        <ButtonLink href="/tests" variant="secondary" className="h-8 min-h-8 px-3 text-[14px] max-sm:min-h-11" data-testid="open-tests">
          Open tests
        </ButtonLink>
      }
    >
      {body}
    </SectionCard>
  );
}

// ---------------------------------------------------------------- the two analyses

const STAGE_ICON: Record<Stage, IconName> = { spread: "spread", detect: "detect", suppress: "suppress" };

function StageCard({ stage, coverage, stale }: { stage: Stage; coverage: AirCoverage | null; stale: boolean }) {
  const stageCoverage = coverage?.stages[stage] ?? null;
  const pill = statusPill(stageCoverage?.status);
  const href = stagePage(stage);
  const label = stageLabel(stage);
  const sentence = coverageSentence(stageCoverage);
  return (
    <section
      aria-labelledby={`stage-${stage}`}
      data-testid="stage-card"
      data-stage={stage}
      className={`${CARD} grid content-start gap-2.5 p-5 transition-colors duration-150 hover:border-control sm:p-6`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-[10px] bg-surface-sunk text-ink-2">
          <Icon name={STAGE_ICON[stage]} />
        </span>
        <h2 id={`stage-${stage}`} className="mr-auto font-display text-[18px] leading-[26px] font-semibold">
          {href ? (
            <AppLink href={href} className="text-ink no-underline hover:text-brand hover:underline">
              {label}
            </AppLink>
          ) : (
            label
          )}
        </h2>
        {pill ? (
          <span key={stageCoverage?.status} className="rise">
            <StatusPill tone={pill.tone} data-testid="stage-status" data-status={stageCoverage?.status}>
              {pill.word}
            </StatusPill>
          </span>
        ) : coverage === null ? (
          <Skeleton className="h-6 w-20 rounded-full" />
        ) : null}
      </div>

      <AnalysisBody stage={stage} />

      <div className={`grid gap-1.5 border-t border-line pt-3 transition-opacity duration-200 ${stale ? "opacity-60" : ""}`}>
        {sentence ? (
          <>
            <p className="text-[15px] leading-[22px] text-ink-2" data-testid="stage-coverage">
              <Changing value={sentence}>{sentence}</Changing>
            </p>
            {stageCoverage && stageCoverage.stated > 0 ? (
              <Bar value={share(stageCoverage.inside, stageCoverage.stated)} tone={stageCoverage.inside ? "bg-ok" : "bg-danger"} />
            ) : null}
          </>
        ) : coverage === null ? (
          <Skeleton className="h-4 w-3/4" />
        ) : (
          <p className="text-[15px] text-ink-2" data-testid="stage-coverage-unavailable">
            The test count for this air is unavailable.
          </p>
        )}
      </div>
    </section>
  );
}

function AnalysisBody({ stage }: { stage: Stage }) {
  const modules = useApi<ModuleSummary[]>("/modules");
  if (modules.status === "loading") return <SkeletonLines label="Loading this analysis…" lines={3} />;
  if (modules.status === "error") return <CardError error={modules.error} onRetry={modules.retry} what="This analysis" />;
  const row = chooseEngine(modules.data, stage);
  if (!row || row.status === "not_built") {
    return (
      <p data-testid="stage-coming" className="text-[15px] text-ink-2">
        No results yet for this analysis.
      </p>
    );
  }
  return <Headline id={row.id} example={row.status === "example"} />;
}

function Headline({ id, example }: { id: string; example: boolean }) {
  const findings = useApi<Finding[]>(`/modules/${encodeURIComponent(id)}/findings`);
  if (findings.status === "loading") return <SkeletonLines label="Loading this answer…" lines={3} />;
  if (findings.status === "error") return <CardError error={findings.error} onRetry={findings.retry} what="This answer" />;
  const headline = findings.data.find((finding) => finding.kind === "headline");
  if (!headline) return <p className="text-[15px] text-ink-2">This analysis states no answer yet.</p>;
  return (
    <div data-testid="stage-headline" className="grid gap-2">
      <p className="font-display text-[24px] leading-[30px] font-semibold tracking-[-0.02em]">
        <EvidenceNumber record={headline} example={example} />
      </p>
      <p className="line-clamp-4 text-[15px] leading-[22px] text-ink">{headline.text}</p>
      <p className="text-[13px] text-ink-3">
        <span className="tabular-nums" data-testid="stage-n">
          n = {formatCount(headline.n)}
        </span>{" "}
        tests or samples
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SourceChip psiId={headline.source.psi_id} arrow label={`${headline.source.psi_id}: open the investigation`} />
        <ProvenanceBadge tag={headline.provenance} />
      </div>
      {findings.source === "saved" ? <SavedCopyNote source="saved" savedAt={findings.savedAt} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- flame map

function FlameMapCard({ air }: { air: AirState }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<string | null>(null);
  const everything = useApi<TestsResponse>(TESTED_POINTS_PATH);
  const filtered = useKeptApi<TestsResponse>(
    phase ? `/catalog/tests?limit=1&include=points&fuel_phase=${encodeURIComponent(phase)}` : null,
  );
  const source = phase ? filtered.kept : everything.status === "ok" ? everything.data : null;
  const allPoints = everything.status === "ok" ? everything.data.points?.items : undefined;
  const series = useMemo(() => assignSeries((allPoints ?? []).map((point) => point[1])), [allPoints]);
  const acronyms = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const facet of everything.status === "ok" ? (everything.data.facets.psi_id ?? []) : []) map.set(facet.value, facet.label ?? null);
    return map;
  }, [everything]);
  // A fuel phase is offered only when its tests put at least one dot on the map (each answer is
  // the API's own filter, cached, so switching is instant).
  const facets = everything.status === "ok" ? everything.data.facets.fuel_phase : undefined;
  const has = (phase: string) => Boolean(facets?.some((facet) => facet.value === phase && facet.count > 0));
  const pointsPath = (phase: string) => `/catalog/tests?limit=1&include=points&fuel_phase=${encodeURIComponent(phase)}`;
  const gas = useApi<TestsResponse>(has("gas") ? pointsPath("gas") : null);
  const liquid = useApi<TestsResponse>(has("liquid") ? pointsPath("liquid") : null);
  const solid = useApi<TestsResponse>(has("solid") ? pointsPath("solid") : null);
  const aerosol = useApi<TestsResponse>(has("aerosol") ? pointsPath("aerosol") : null);
  const plotted: Record<string, boolean> = {};
  for (const [phase, answer] of [["gas", gas], ["liquid", liquid], ["solid", solid], ["aerosol", aerosol]] as const) {
    plotted[phase] = answer.status === "ok" && (answer.data.points?.items.length ?? 0) > 0;
  }
  const options = phaseOptions(facets).filter((option) => option.value === null || plotted[option.value]);

  let body: ReactNode;
  if (everything.status === "error") body = <CardError error={everything.error} onRetry={everything.retry} what="The flame map" />;
  else if (phase && filtered.status === "error" && !filtered.kept)
    body = <CardError error={filtered.error} onRetry={filtered.retry} what="The flame map" />;
  else if (!source) body = <Skeleton className="h-[300px] w-full rounded-lg" />;
  else
    body = (
      <TestsChart
        heading={null}
        labelledBy="flame-map-title"
        className=""
        points={source.points?.items ?? []}
        notPlotted={source.points?.not_plotted ?? 0}
        series={series}
        acronyms={acronyms}
        air={air}
        stale={phase ? filtered.stale : false}
        onOpen={(testId) => router.push(withAir(`/tests?test=${encodeURIComponent(testId)}`, searchParams))}
      />
    );

  return (
    <SectionCard
      title="Flame map"
      titleId="flame-map-title"
      data-testid="flame-map"
      action={
        options.length > 1 ? (
          <SegmentedControl label="Show fuel" testId="phase-filter" segments={options} value={phase} onChange={setPhase} />
        ) : null
      }
    >
      <p className="-mt-2 mb-3 text-[15px] text-ink-2">Every test that states its oxygen and pressure. Click a dot to open it.</p>
      {body}
    </SectionCard>
  );
}

// ---------------------------------------------------------------- ranking

function RankedCard({ air }: { air: AirState }) {
  const choice = air.status === "ok" ? air.choice : null;
  const rank = useKeptApi<RankResponse>(rankPath(choice));
  const data = rank.kept;
  let body: ReactNode;
  if (air.status === "error") body = <CardError error={air.error} onRetry={air.retry} what="The ranking" />;
  else if (rank.status === "error" && !data) body = <CardError error={rank.error} onRetry={rank.retry} what="The ranking" />;
  else if (!data) body = <SkeletonLines label="Ranking the investigations…" lines={5} />;
  else
    body = (
      <ol
        data-testid="top-rank"
        data-air={data.air}
        className={`grid transition-opacity duration-200 @4xl:grid-flow-col @4xl:grid-cols-2 @4xl:grid-rows-3 @4xl:gap-x-10 ${rank.stale ? "opacity-60" : ""}`}
      >
        {topRanked(data, 5).map((item) => (
          <li
            key={item.psi_id}
            data-testid="top-rank-row"
            data-psi-id={item.psi_id}
            className="grid grid-cols-[1.75rem_minmax(0,1fr)_5.5rem] items-start gap-x-3 border-t border-line py-3"
          >
            <span className="pt-0.5 font-display text-[18px] font-semibold tabular-nums text-ink-2">{item.rank}</span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <SourceChip psiId={item.psi_id} />
                <span className="text-[15px] font-semibold text-ink">{item.acronym ?? ""}</span>
              </p>
              <p className="mt-1 line-clamp-2 text-[15px] leading-[22px] text-ink-2">{item.reason}</p>
            </div>
            <div className="grid gap-1.5 pt-1 text-right">
              <span className="font-mono text-[14px] tabular-nums text-ink" aria-label={`Score ${scoreText(item.score)} of 1`}>
                {scoreText(item.score)}
              </span>
              <Bar value={item.score} />
            </div>
          </li>
        ))}
      </ol>
    );
  return (
    <SectionCard
      title="Ranked for this air"
      titleId="ranked-title"
      data-testid="ranked"
      action={
        <ButtonLink href="/investigations?sort=rank" variant="ghost" className="h-8 min-h-8 px-3 text-[14px] max-sm:min-h-11" data-testid="full-ranking">
          Full ranking
          <Icon name="arrow-right" size="sm" />
        </ButtonLink>
      }
    >
      <p className="-mt-2 mb-4 text-[15px] text-ink-2">This site&apos;s ranking of the investigations with the most usable data for this air.</p>
      {body}
    </SectionCard>
  );
}
