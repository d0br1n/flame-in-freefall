"use client";

// The full ranking (Linear DOB-78, moved from the home page on 14 November 2026): the 24
// investigations ranked for the chosen cabin air, the reason for each place and how the ranking
// works. Every number comes from GET /catalog/rank; the air comes only from useAir().
import type { ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import { Loading, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import { SourceNote } from "@/components/SourceNote";
import { useAir } from "@/lib/air";
import { useApi } from "@/lib/api";
import { PILLAR_LABEL } from "@/lib/filters";
import { barWidth, PART_LABEL, partSummary, partValue, RANK_PARTS, rankPath, scoreText, weightsText } from "@/lib/home";
import { stagePage } from "@/lib/nav";
import { stageLabel } from "@/lib/pillar";
import type { RankItem, RankResponse, TestsResponse } from "@/lib/types";

// ---------------------------------------------------------------- the ranking

export function RankingView() {
  const air = useAir();
  const choice = air.status === "ok" ? air.choice : null;
  const rank = useApi<RankResponse>(rankPath(choice));
  // Which investigations have rows in the PSI tables (the facet of one unfiltered request), so a
  // row only offers "See its tests" when there are tests to see.
  const tests = useApi<TestsResponse>("/catalog/tests?limit=1");
  const withTests = tests.status === "ok" ? new Set((tests.data.facets.psi_id ?? []).map((facet) => facet.value)) : null;

  let body: ReactNode;
  if (air.status === "error") body = <Unreachable error={air.error} onRetry={air.retry} what="the ranking" />;
  else if (air.status === "ok" && !air.air) body = <p className="text-ink-2">The data service lists no cabin air to rank for.</p>;
  else if (air.status === "loading" || rank.status === "loading") body = <Loading label="Ranking the investigations…" rows={6} />;
  else if (rank.status === "error") body = <Unreachable error={rank.error} onRetry={rank.retry} what="the ranking" />;
  else
    body = (
      <>
        <SavedCopyNote source={rank.source} savedAt={rank.savedAt} />
        <HowItWorks data={rank.data} />
        <ol data-testid="rank-list" data-air={rank.data.air} className="mt-4 overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
          {rank.data.items.map((item) => (
            <RankRow key={item.psi_id} item={item} hasTests={withTests ? withTests.has(item.psi_id) : true} />
          ))}
        </ol>
      </>
    );

  const count = rank.status === "ok" ? rank.data.items.length : null;
  const airLabel = air.status === "ok" && air.air ? air.air.label : null;
  return (
    <section aria-labelledby="ranking" data-testid="ranking">
      <h2 id="ranking" className="text-[18px] font-semibold">
        {count !== null ? `The ${count} investigations` : "The investigations"}, ranked for {airLabel ?? "the chosen cabin air"}
      </h2>
      <p className="mt-1 max-w-[70ch] text-[16px] text-ink">Ordered by how much usable data each holds for this cabin air.</p>
      <div className="mt-4">{body}</div>
    </section>
  );
}

function HowItWorks({ data }: { data: RankResponse }) {
  return (
    <details data-testid="rank-method" className="group max-w-[70ch] rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer rounded-lg px-4 py-2.5 font-semibold transition-colors duration-150 hover:bg-surface-sunk">How this ranking works</summary>
      <div className="space-y-2 border-t border-line px-4 py-3 text-ink-2">
        <p>
          This ranking is this site&apos;s own. It is not a NASA ranking. It scores how well each investigation&apos;s PSI data
          covers this cabin air.
        </p>
        <p>
          Formula: <code data-testid="rank-formula" className="font-mono text-[0.875rem]">{data.formula}</code>.
        </p>
        <p>
          Four parts: the pillar, the tests that ran in this air (evidence), the data in PSI and the kind of fuel. Weights:{" "}
          <span data-testid="rank-weights" className="font-mono text-[0.875rem]">
            {weightsText(data.weights)}
          </span>
          .
        </p>
        {data.weights_are_default ? (
          <p data-testid="rank-default-weights">
            Default weights, equal for every part and not tuned for any investigation.
          </p>
        ) : null}
        <SourceNote>GET /api/v1/catalog/rank of this site&apos;s data service, from NASA&apos;s PSI records and tables.</SourceNote>
      </div>
    </details>
  );
}

function RankRow({ item, hasTests }: { item: RankItem; hasTests: boolean }) {
  const page = stagePage(item.stage);
  const name = item.acronym || item.psi_id;
  return (
    <li
      data-testid="rank-row"
      data-psi-id={item.psi_id}
      className="grid gap-x-8 gap-y-3 border-b border-line px-4 py-5 last:border-b-0 sm:px-5 md:grid-cols-[minmax(0,1fr)_17rem] lg:grid-cols-[2.5rem_minmax(0,1fr)_19rem]"
    >
      <p className="hidden font-display text-[20px] font-semibold tabular-nums text-ink-2 lg:block" aria-hidden="true">
        {item.rank}
      </p>
      <div className="min-w-0">
        <h3 className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
          <span className="tabular-nums lg:sr-only">{item.rank}. </span>
          <span className="font-mono text-[14px]">{item.psi_id}</span> {item.acronym ?? ""}
        </h3>
        <p className="text-[15px] text-ink-2">
          {PILLAR_LABEL[item.pillar] ?? item.pillar}
          {page && item.stage && item.stage !== "detect" ? (
            <>
              , analysis: <AppLink href={page}>{stageLabel(item.stage)}</AppLink>
            </>
          ) : null}
        </p>
        <p data-testid="rank-reason" className="mt-2 max-w-[65ch]">
          {item.reason}
        </p>
        <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem]">
          <AppLink href={`/investigations/${encodeURIComponent(item.psi_id)}`}>
            About {name}
            <span className="sr-only"> ({item.psi_id})</span>
          </AppLink>
          {hasTests ? (
            <AppLink data-testid="rank-tests-link" href={`/tests?psi_id=${encodeURIComponent(item.psi_id)}`}>
              See its tests in this air<span className="sr-only"> ({name})</span>
            </AppLink>
          ) : (
            <span className="text-ink-2">No experimental table in PSI</span>
          )}
        </p>
      </div>
      <Parts item={item} />
    </li>
  );
}

function Parts({ item }: { item: RankItem }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.9375rem]">
        Score <span data-testid="rank-score" className="font-semibold tabular-nums">{scoreText(item.score)}</span>{" "}
        <span className="text-ink-2">of 1</span>
      </p>
      <dl className="mt-1.5 space-y-1">
        {RANK_PARTS.map((key) => {
          const part = item.parts[key];
          return (
            <div key={key} data-part={key} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-x-2 text-[0.875rem]">
              <dt className="text-ink-2">{PART_LABEL[key]}</dt>
              <dd aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-surface-sunk">
                <div className="grow-x h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: barWidth(part.score) }} />
              </dd>
              <dd className="text-right tabular-nums" data-testid={`part-${key}`}>
                <span className="sr-only">{partSummary(key, part)} </span>
                <span aria-hidden="true">{partValue(key, part)}</span>
              </dd>
            </div>
          );
        })}
      </dl>
      <details data-testid="rank-why" className="mt-1.5 text-[0.875rem]">
        <summary className="cursor-pointer py-3 font-semibold text-brand hover:underline">Why these parts</summary>
        <ul className="space-y-1.5 pb-1">
          {RANK_PARTS.map((key) => (
            <li key={key} data-testid={`reason-${key}`}>
              <span className="font-medium">{PART_LABEL[key]}:</span> {item.parts[key].reason}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
