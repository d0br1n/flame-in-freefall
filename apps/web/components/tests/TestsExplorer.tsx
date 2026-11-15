"use client";

// The tests explorer (/tests, Linear DOB-77). The filter state lives in the URL with the API's
// own parameter names (lib/tests.ts); the backend filters, pages and counts, and this component
// only sends the parameters and draws the answer. The cabin air comes from useAir() only.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Loading, Notice, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import { Callout } from "@/components/ui/Callout";
import { type ApiHandle, useApi } from "@/lib/api";
import { useAir } from "@/lib/air";
import { assignSeries } from "@/lib/chart";
import {
  activeFilterCount,
  clearTestFilters,
  emptyTestsQuery,
  excludedLines,
  noChartNote,
  parseTestsQuery,
  pointsApiPath,
  serializeTestsQuery,
  testsApiPath,
  testsCount,
  toggleTestFacet,
  type TestsQuery,
} from "@/lib/tests";
import type { InvestigationList, TestsResponse } from "@/lib/types";
import { TestDialog } from "./TestDialog";
import { TestsChart } from "./TestsChart";
import { TestsRail } from "./TestsRail";
import { TestsTable } from "./TestsTable";

/**
 * The latest answer of a request, kept on screen while the next one loads, so a filter change
 * dims the chart and the table instead of blanking them (no layout jump).
 */
function useKept<T>(handle: ApiHandle<T>, path: string) {
  const [kept, setKept] = useState<{ path: string; data: T } | null>(null);
  if (handle.status === "ok" && (kept === null || kept.path !== path || kept.data !== handle.data)) {
    setKept({ path, data: handle.data });
  }
  const data = handle.status === "ok" ? handle.data : (kept?.data ?? null);
  return { data, stale: handle.status === "loading" && kept !== null };
}

export function TestsExplorer() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlQuery = searchParams.toString();

  // The URL is the source of truth, but the router updates it asynchronously: keep the visitor's
  // choice locally so a checkbox ticks at once, and re-read the URL whenever it changes.
  const [local, setLocal] = useState(() => ({ url: urlQuery, query: parseTestsQuery(urlQuery) }));
  let query = local.query;
  if (local.url !== urlQuery) {
    query = parseTestsQuery(urlQuery);
    setLocal({ url: urlQuery, query });
  }

  function update(next: TestsQuery) {
    setLocal({ url: urlQuery, query: next });
    const text = serializeTestsQuery(next, urlQuery);
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  const listPath = testsApiPath(query);
  const pointsPath = pointsApiPath(query);
  const list = useApi<TestsResponse>(listPath);
  const points = useApi<TestsResponse>(pointsPath);
  // Every investigation with tests, unfiltered: fixes each one's colour and mark for good.
  const everything = useApi<TestsResponse>(pointsApiPath(emptyTestsQuery()));
  const catalog = useApi<InvestigationList>("/catalog/investigations");
  const air = useAir();

  const keptList = useKept(list, listPath);
  const keptPoints = useKept(points, pointsPath);

  // Colours go to the investigations that have a dot on the unfiltered chart (most of the 20 with
  // tests state no oxygen or no pressure), so the palette is not spent on investigations never drawn.
  const plottedSource = everything.status === "ok" ? everything.data.points?.items : keptPoints.data?.points?.items;
  const series = useMemo(() => assignSeries((plottedSource ?? []).map((point) => point[1])), [plottedSource]);
  const allFacets = everything.status === "ok" ? everything.data.facets.psi_id : undefined;
  const acronyms = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const facet of [...(allFacets ?? []), ...(keptPoints.data?.facets.psi_id ?? []), ...(keptList.data?.facets.psi_id ?? [])]) {
      if (!map.has(facet.value)) map.set(facet.value, facet.label ?? null);
    }
    return map;
  }, [allFacets, keptPoints.data, keptList.data]);

  const open = (testId: string) => update({ ...query, test: testId });
  const dialog = (
    <TestDialog
      testId={query.test}
      investigations={catalog.status === "ok" ? catalog.data.items : null}
      onClose={() => update({ ...query, test: null })}
    />
  );

  const failed = list.status === "error" ? list.error : points.status === "error" ? points.error : null;
  if (failed) {
    return (
      <>
        <Unreachable
          error={failed}
          what="the tests"
          onRetry={() => {
            list.retry();
            points.retry();
          }}
        />
        {dialog}
      </>
    );
  }

  const data = keptList.data;
  if (data === null) {
    return (
      <>
        <Loading label="Loading the tests…" rows={6} />
        {dialog}
      </>
    );
  }

  const chosen = activeFilterCount(query);
  const pageStart = data.total === 0 ? 0 : data.offset + 1;
  const pageEnd = Math.min(data.offset + data.items.length, data.total);
  const excluded = excludedLines(query, data.excluded);
  const goTo = (offset: number) => update({ ...query, offset: Math.max(0, offset), test: null });
  // True when the chart's answer is in and holds no dot at all.
  const noDots = keptPoints.data?.points?.items.length === 0;

  return (
    <>
      <SavedCopyNote source={list.status === "ok" ? list.source : "live"} savedAt={list.status === "ok" ? list.savedAt : null} />
      <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[minmax(0,3fr)_minmax(0,9fr)]">
        <TestsRail
          query={query}
          facets={data.facets}
          chosenCount={chosen}
          onToggle={(facet, value) => update(toggleTestFacet(query, facet, value))}
          onRanges={(ranges) => update({ ...query, ranges, offset: 0, test: null })}
        />

        <section aria-label="Tests" className="min-w-0">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-1.5">
            <p aria-live="polite" data-testid="result-count" className="font-medium tabular-nums">
              {testsCount(data.total)} match
            </p>
            {chosen > 0 ? (
              <button
                type="button"
                onClick={() => update(clearTestFilters(query))}
                className="btn btn-secondary"
              >
                Clear filters
              </button>
            ) : null}
          </div>
          {excluded.length > 0 ? (
            <div data-testid="excluded" className="mt-2 space-y-0.5 text-[15px] text-ink-2">
              {excluded.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}

          {data.total === 0 ? (
            <Notice title="No test matches these filters" testId="no-results">
              <p>Remove a filter or widen a range.</p>
              <button
                type="button"
                onClick={() => update(clearTestFilters(query))}
                className="btn btn-primary"
              >
                Clear filters
              </button>
            </Notice>
          ) : (
            <>
              {keptPoints.data?.points && everything.status !== "loading" ? (
                noDots ? (
                  // No matching test states both axes: say so instead of an empty chart (DOB-153).
                  <Callout tone="info" data-testid="chart-empty" className={`mt-6 max-w-[70ch] ${keptPoints.stale ? "opacity-60" : ""}`}>
                    {noChartNote(keptPoints.data.points.not_plotted || data.total)}
                  </Callout>
                ) : (
                  <TestsChart
                    points={keptPoints.data.points.items}
                    notPlotted={keptPoints.data.points.not_plotted}
                    series={series}
                    acronyms={acronyms}
                    air={air}
                    onOpen={open}
                    stale={keptPoints.stale}
                  />
                )
              ) : keptPoints.data && everything.status !== "loading" ? (
                <p className="mt-6 text-ink-2">The data service sent no points for the chart.</p>
              ) : (
                <div data-testid="chart-loading" aria-hidden="true" className="mt-6 h-[22rem] animate-pulse rounded-md bg-wash" />
              )}

              {noDots ? null : (
                <Callout tone="warn" data-testid="no-average-note" className="mt-4 max-w-[70ch]">
                  Investigations used different hardware and methods. Do not average their dots together.
                </Callout>
              )}

              <h2 className="mt-10 text-[1.125rem] font-semibold">The matching tests</h2>
              <p className="mt-1 max-w-[70ch] text-[15px] text-ink-2">The line under a value is how the source table writes it.</p>
              <TestsTable rows={data.items} onOpen={open} stale={keptList.stale} />

              <nav aria-label="Pages of tests" data-testid="paging" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[0.875rem]">
                <p className="tabular-nums text-ink-2">
                  Showing {pageStart.toLocaleString("en-US")} to {pageEnd.toLocaleString("en-US")} of {testsCount(data.total)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={data.offset <= 0}
                    onClick={() => goTo(data.offset - data.limit)}
                    className="btn btn-secondary"
                  >
                    Previous {data.limit}
                  </button>
                  <button
                    type="button"
                    disabled={data.offset + data.limit >= data.total}
                    onClick={() => goTo(data.offset + data.limit)}
                    className="btn btn-secondary"
                  >
                    Next {data.limit}
                  </button>
                </div>
              </nav>
            </>
          )}
        </section>
      </div>
      {dialog}
    </>
  );
}
