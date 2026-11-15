"use client";

// The suppression test bench (Linear DOB-87, DOB-127, DOB-140): four sections of the pillar page,
// one shown at a time (LEAD_SECTIONS in components/pillar/mainViews.ts). Each loads its own file
// when it is first opened:
//  0. BenchWhatWorks: the plain answer that opens the page, FLEX tests counted by oxygen and
//     added gas (WhatWorks, flex_tests.json).
//  1. BenchMixture: the model view, sliders over flex_grid.json (BenchSliders).
//  2. BenchTested: measured, how every FLEX test ended against oxygen, by added gas (OutcomePlot),
//     with the highest oxygen each gas reached and the counts as tables (flex_tests.json).
//  3. BenchNeverTested: the 30 to 34% oxygen cells farthest from any real droplet test
//     (flex_gaps.json), headline checked by the engine.
// Every computed number, test by test, is in the page's evidence section.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useMemo, useState, type ReactNode } from "react";
import { useApi } from "@/lib/api";
import {
  GASES,
  OUTCOMES,
  OUTCOME_PLAIN,
  designedBatch,
  engineFilePath,
  gapGroups,
  gasInfo,
  gasOf,
  gasSummaries,
  outcomePoints,
  outcomeTable,
  percent,
  rankedGaps,
  testHref,
  type Batch,
  type Campaign,
  type FlexTestsFile,
  type GapsFile,
} from "@/lib/suppress";
import { Loading, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import { SourceNote } from "@/components/SourceNote";
import { AppLink } from "@/components/AppLink";
import { CARD } from "@/components/ui/Card";
import { GapCurve } from "./GapCurve";
import { OutcomePlot } from "./OutcomePlot";
import { BenchSliders } from "./BenchSliders";
import { WhatWorks } from "./WhatWorks";

const FIRST_ROWS = 10;

/** A bench card: the display title, an optional line under it, then the body. */
function BenchCard({ id, title, lead, aside, children, testId }: { id: string; title: string; lead?: ReactNode; aside?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section aria-labelledby={id} className={`${CARD} p-5 sm:p-7`} data-testid={testId}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h2 id={id} className="font-display text-[22px] leading-[28px] font-semibold tracking-[-0.015em] text-ink">
          {title}
        </h2>
        {aside}
      </div>
      {lead ? <div className="mt-2 max-w-[68ch] text-[15px] leading-[23px] text-ink">{lead}</div> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Section "What works": the plain answer, counted from the FLEX table. It opens the page. */
export function BenchWhatWorks() {
  const tests = useApi<FlexTestsFile>(engineFilePath("flex_tests.json"));
  if (tests.status === "loading") return <Loading label="Loading the FLEX tests…" rows={4} />;
  if (tests.status === "error") return <Unreachable error={tests.error} onRetry={tests.retry} what="the FLEX tests" />;
  return (
    <>
      <SavedCopyNote source={tests.source} savedAt={tests.savedAt} />
      <WhatWorks file={tests.data} />
    </>
  );
}

/** Section "Try a mixture": the model view. It carries the bench's test id. */
export function BenchMixture() {
  return (
    <div data-testid="suppress-bench">
      <BenchSliders />
    </div>
  );
}

/** Section "What was tested": the measured outcomes of the FLEX table. */
export function BenchTested() {
  const tests = useApi<FlexTestsFile>(engineFilePath("flex_tests.json"));
  if (tests.status === "loading") return <Loading label="Loading the FLEX tests…" rows={4} />;
  if (tests.status === "error") return <Unreachable error={tests.error} onRetry={tests.retry} what="the FLEX tests" />;
  return (
    <>
      <SavedCopyNote source={tests.source} savedAt={tests.savedAt} />
      <Measured file={tests.data} />
    </>
  );
}

/** Section "Never tested": the gap headline, the next test to fly and the ranked conditions. */
export function BenchNeverTested() {
  const gaps = useApi<GapsFile>(engineFilePath("flex_gaps.json"));
  if (gaps.status === "loading") return <Loading label="Loading the gap list…" rows={4} />;
  if (gaps.status === "error") return <Unreachable error={gaps.error} onRetry={gaps.retry} what="the gap list" />;
  return (
    <>
      <SavedCopyNote source={gaps.source} savedAt={gaps.savedAt} />
      <NeverTested gaps={gaps.data} />
    </>
  );
}

// ------------------------------------------------------------------ measured outcomes

const TABLE = "w-full border-collapse text-[14px]";
const TH = "px-3 py-2 text-[14px] font-semibold text-ink-2";
const TD = "border-t border-line px-3 py-2";

function Measured({ file }: { file: FlexTestsFile }) {
  const { points, leftOut } = useMemo(() => outcomePoints(file.tests), [file]);
  const summaries = useMemo(() => gasSummaries(points), [points]);
  const table = useMemo(() => outcomeTable(points), [points]);

  return (
    <BenchCard
      id="bench-measured"
      title="How each FLEX test ended"
      lead={<>Measured outcomes from the FLEX table (PSI-69). One dot per test, by oxygen and added gas. Click a dot to open its test.</>}
    >
      <OutcomePlot points={points} />

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-[15px] leading-[22px] sm:grid-cols-3">
        {OUTCOMES.map((o) => (
          <div key={o}>
            <dt className="inline font-semibold text-ink">{o}: </dt>
            <dd className="inline text-ink-2">{OUTCOME_PLAIN[o]}.</dd>
          </div>
        ))}
      </dl>
      {leftOut > 0 ? <p className="mt-2 text-[14px] text-ink-2">{leftOut} test(s) state no oxygen or outcome and are not drawn.</p> : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <div className="min-w-0 overflow-x-auto rounded-md border border-line">
          <table className={`${TABLE} min-w-[28rem]`} data-testid="gas-summary">
            <caption className="px-3 pt-3 pb-1 text-left text-[14px] font-semibold text-ink">Highest oxygen each added gas reached in FLEX</caption>
            <thead className="text-left">
              <tr>
                <th scope="col" className={TH}>Added gas</th>
                <th scope="col" className={`${TH} text-right`}>Tests</th>
                <th scope="col" className={`${TH} text-right`}>Highest oxygen</th>
                <th scope="col" className={TH}>Tests at that oxygen</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.gas}>
                  <th scope="row" className={`${TD} text-left font-normal`}>{gasInfo(s.gas).label}</th>
                  <td className={`${TD} text-right tabular-nums`}>{s.tests}</td>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>{Number.isFinite(s.maxO2) ? percent(s.maxO2) : "none"}</td>
                  <td className={`${TD} font-mono text-[13px] leading-[20px]`}>
                    {s.atMax.slice(0, 6).map((id, i) => (
                      <span key={id}>
                        {i > 0 ? ", " : ""}
                        <AppLink href={testHref(id)} className="text-accent underline underline-offset-[3px]">{id}</AppLink>
                      </span>
                    ))}
                    {s.atMax.length > 6 ? ` and ${s.atMax.length - 6} more` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="min-w-0 overflow-x-auto rounded-md border border-line">
          <table className={`${TABLE} min-w-[24rem]`} data-testid="outcome-table">
            <caption className="px-3 pt-3 pb-1 text-left text-[14px] font-semibold text-ink">Tests per outcome and added gas</caption>
            <thead className="text-left">
              <tr>
                <th scope="col" className={TH}>Ended</th>
                {GASES.map((g) => (
                  <th key={g.key} scope="col" className={`${TH} text-right`}>{g.label}</th>
                ))}
                <th scope="col" className={`${TH} text-right`}>All</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row) => (
                <tr key={row.outcome}>
                  <th scope="row" className={`${TD} text-left font-normal`}>{row.outcome}</th>
                  {GASES.map((g) => (
                    <td key={g.key} className={`${TD} text-right tabular-nums`}>{row.counts[g.key]}</td>
                  ))}
                  <td className={`${TD} text-right font-semibold tabular-nums`}>{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-3">
        <SourceNote>
          FLEX table (PSI-69), columns for oxygen, nitrogen, carbon dioxide and helium and &ldquo;Test end&rdquo;. The column the
          table heads &ldquo;CO&rdquo; is read as carbon dioxide: the file does not say so.
        </SourceNote>
      </div>
    </BenchCard>
  );
}

// ------------------------------------------------------------------ never tested, next test to fly

function NeverTested({ gaps }: { gaps: GapsFile }) {
  const [all, setAll] = useState(false);
  const ranked = useMemo(() => rankedGaps(gaps), [gaps]);
  const groups = useMemo(() => gapGroups(gaps), [gaps]);
  const batch = useMemo(() => designedBatch(gaps), [gaps]);
  const rows = all ? ranked : ranked.slice(0, FIRST_ROWS);
  const region = gaps.header.region.split(" (")[0];

  return (
    <BenchCard id="bench-next" title="Never tested">
      <div className="rounded-md border-l-4 border-brand bg-brand-soft px-4 py-3.5 sm:px-5">
        <p className="max-w-[72ch] text-[16px] leading-[25px] font-medium text-ink" data-testid="bench-headline">
          {gaps.header.headline}
        </p>
      </div>
      <div className="mt-2 space-y-1">
        <SourceNote>
          FLEX (PSI-69) and CFI (PSI-39) per-test tables, FLEX-2 (PSI-68) planned range; counted by the flame temperature engine
          (<span className="font-mono">flex_gaps.json</span>).
        </SourceNote>
        <SourceNote label="Scope">{gaps.header.scope.replace(/^Scope:\s*/i, "")}</SourceNote>
      </div>

      <h3 className="mt-7 text-[16px] font-semibold text-ink">Next test to fly</h3>
      <p className="mt-1 max-w-[68ch] text-[15px] leading-[23px] text-ink">
        Conditions at {region}, ranked by distance from the nearest real droplet test. A larger distance means PSI data says less
        about the condition.
      </p>
      <p className="mt-1 max-w-[68ch] text-[14px] leading-[20px] text-ink-2">{gaps.header.not_a_prediction}</p>

      <ul className="mt-4 grid gap-3 md:grid-cols-3" data-testid="gap-groups">
        {groups.map((g) => (
          <li key={g.gas} className={`flex flex-col rounded-md border p-4 ${g.gas === "helium" ? "border-warn/40 bg-warn-soft" : "border-line bg-surface"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-semibold text-ink">{gasInfo(g.gas).label}</p>
              {g.gas === "helium" ? (
                <span className="inline-block rounded-sm border border-warn bg-surface px-1.5 text-[13px] font-medium leading-snug text-warn">
                  model fails here
                </span>
              ) : null}
            </div>
            <p className="mt-2 font-display text-[30px] leading-[34px] font-semibold tracking-[-0.02em] tabular-nums text-ink">
              {g.cells}
              <span className="ml-1.5 font-sans text-[14px] font-normal tracking-normal text-ink-2">conditions</span>
            </p>
            {g.notes.map((note) => (
              <p key={note} className="mt-2 text-[15px] leading-[22px] text-ink-2">{note}</p>
            ))}
          </li>
        ))}
      </ul>

      {batch ? <NextBatch batch={batch} campaign={gaps.header.campaign!} /> : null}

      <div className="mt-6 min-w-0 overflow-x-auto rounded-md border border-line">
        <table className={`${TABLE} min-w-[44rem]`} data-testid="gap-table">
          <caption className="px-3 pt-3 pb-1 text-left text-[14px] font-semibold text-ink">
            {all ? `All ${ranked.length} conditions` : `The ${FIRST_ROWS} conditions farthest from any real test`}
          </caption>
          <thead className="text-left">
            <tr>
              <th scope="col" className={`${TH} text-right`}>Rank</th>
              <th scope="col" className={TH}>Fuel</th>
              <th scope="col" className={TH}>Added gas</th>
              <th scope="col" className={`${TH} text-right`}>Oxygen</th>
              <th scope="col" className={`${TH} text-right`}>Pressure</th>
              <th scope="col" className={TH}>Distance</th>
              <th scope="col" className={TH}>Nearest real test</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const gas = gasOf(r.added_gas);
              return (
                <tr key={`${r.rank}`}>
                  <td className={`${TD} text-right tabular-nums text-ink-3`}>{r.rank}</td>
                  <td className={TD}>{r.fuel}</td>
                  <td className={TD}>
                    {gas === "nitrogen" ? "none (nitrogen only)" : `${r.added_gas} ${percent(r.x_added)}`}
                    {r.model_fails_here ? <span className="ml-1 text-[13px] text-warn">(model fails here)</span> : null}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{percent(r.x_o2)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{r.pressure_atm} atm</td>
                  <td className={TD}>
                    <DistanceBar distance={r.distance} />
                  </td>
                  <td className={`${TD} font-mono text-[13px]`}>
                    <AppLink href={testHref(r.nearest_test_id)} className="text-accent underline underline-offset-[3px]">
                      {r.nearest_test_id}
                    </AppLink>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2">
        {ranked.length > FIRST_ROWS ? (
          <button type="button" onClick={() => setAll((value) => !value)} aria-expanded={all} className="btn btn-secondary">
            {all ? `Show the first ${FIRST_ROWS}` : `Show all ${ranked.length}`}
          </button>
        ) : null}
        <div className="min-w-0 flex-1 basis-[28rem]">
          <SourceNote label="Distance">{gaps.header.distance}</SourceNote>
        </div>
      </div>
    </BenchCard>
  );
}

/**
 * The designed batch (DOB-114): the tests the engine would fly together, each chosen for being far
 * from the real tests and from the picks before it, and the gap curve against the ranked list.
 * Every number and every sentence about the method is the engine's own (flex_gaps.json).
 */
function NextBatch({ batch, campaign }: { batch: Batch; campaign: Campaign }) {
  return (
    <section className="mt-7" aria-labelledby="bench-batch-title" data-testid="bench-batch">
      <h3 id="bench-batch-title" className="text-[16px] font-semibold text-ink">
        {batch.size} tests to fly first
      </h3>
      <p className="mt-1 max-w-[68ch] text-[15px] leading-[23px] text-ink" data-testid="batch-gain">
        Flown together, these {batch.size} tests cut the largest gap in the region from{" "}
        <span className="font-semibold tabular-nums">{batch.start.toFixed(2)}</span> to{" "}
        <span className="font-semibold tabular-nums">{batch.designed.toFixed(2)}</span>. The first {batch.size} conditions of the
        ranked list would leave <span className="font-semibold tabular-nums">{batch.ranked.toFixed(2)}</span>.
      </p>
      <p className="mt-1 max-w-[68ch] text-[14px] leading-[20px] text-ink-2">{campaign.why}</p>

      <div className="mt-4 space-y-5">
        <div className="min-w-0 overflow-x-auto rounded-md border border-line">
          <table className={`${TABLE} min-w-[36rem]`} data-testid="batch-table">
            <caption className="sr-only">The designed batch, in the order the engine picked the tests</caption>
            <thead className="text-left">
              <tr>
                <th scope="col" className={`${TH} text-right`}>Pick</th>
                <th scope="col" className={TH}>Added gas</th>
                <th scope="col" className={`${TH} text-right`}>Oxygen</th>
                <th scope="col" className={`${TH} text-right`}>Pressure</th>
                <th scope="col" className={TH}>Gap it closes</th>
                <th scope="col" className={TH}>Nearest real test</th>
              </tr>
            </thead>
            <tbody>
              {batch.picks.map((pick) => (
                <tr key={pick.pick} title={pick.note}>
                  <td className={`${TD} text-right tabular-nums text-ink-3`}>{pick.pick}</td>
                  <td className={TD}>
                    {pick.added_gas} {percent(pick.x_added)}
                    {pick.model_fails_here ? <span className="ml-1 text-[13px] text-warn">(model fails here)</span> : null}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{percent(pick.x_o2)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{pick.pressure_atm} atm</td>
                  <td className={TD}>
                    <DistanceBar distance={pick.gap_when_picked} />
                  </td>
                  <td className={`${TD} font-mono text-[13px]`}>
                    <AppLink href={testHref(pick.nearest_test_id)} className="text-accent underline underline-offset-[3px]">
                      {pick.nearest_test_id}
                    </AppLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <GapCurve curve={batch.curve} size={batch.size} />
      </div>

      <div className="mt-3 space-y-1">
        <SourceNote label="Method">{campaign.method}</SourceNote>
        <SourceNote label="Fuel">{campaign.fuel}</SourceNote>
      </div>
    </section>
  );
}

/**
 * A distance from the nearest real test, printed and drawn: the bar is one whole slider width at
 * 1.0 (the distance's own unit, flex_gaps.json), capped there.
 */
function DistanceBar({ distance }: { distance: number }) {
  const share = Math.min(1, Math.max(0, distance));
  return (
    <span className="flex items-center gap-2">
      <span className="tabular-nums">{distance.toFixed(2)}</span>
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunk" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded-full bg-brand/70" style={{ width: `${share * 100}%` }} />
      </span>
    </span>
  );
}
