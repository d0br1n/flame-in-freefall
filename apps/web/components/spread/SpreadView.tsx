"use client";

// The main view of the Video to Data page (DOB-86, DOB-126), registered for the video-to-data
// analysis in components/pillar/mainViews.ts: one list of every BASS-II test. NASA's table gives
// the tests and their conditions; the engine's index gives each test's status. A processed or
// graded test links to its own page, /spread/B1 (DOB-156, SpreadTestPage.tsx), which shows its
// clip, charts and numbers. An older link that names a test in the query (/spread?test=B1) is
// forwarded to that page. Without index.json it falls back to a table built from the evidence records.
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLink } from "@/components/AppLink";
import { EvidenceNumber } from "@/components/evidence/EvidenceNumber";
import { TestId } from "@/components/evidence/EvidencePanel";
import { Loading, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import type { MainViewProps } from "@/components/pillar/mainViews";
import { Icon } from "@/components/ui/Icon";
import { SegmentedControl, type Segment } from "@/components/ui/SegmentedControl";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { useApi } from "@/lib/api";
import { flagLabel } from "@/lib/evidence";
import {
  canOpen,
  fallbackRows,
  filterStatus,
  gradeWord,
  joinTests,
  parseCatalogTests,
  parseIndex,
  processedLine,
  SERIES_FILES_HREF,
  SERIES_PSI_ID,
  SERIES_TESTS_PATH,
  STATUS_FILTER_WORDS,
  STATUS_WORDS,
  statusCounts,
  takeOpenedTest,
  testPageHref,
  VIDEO_STATUSES,
  type CatalogTest,
  type SeriesRow,
  type SpreadIndex,
  type VideoStatus,
} from "@/lib/spread";
import type { Evidence } from "@/lib/types";
import { withAir } from "@/lib/links";
import { TrackerCheckNote } from "./TrackerCheck";
import { TSeriesNote } from "./TSeries";

// Tables are ruled between rows only; the head sits on the sunk surface.
const CELL = "border-b border-line px-3 py-1.5 align-middle";
const HEAD = "border-b border-line bg-surface-sunk text-left text-[14px] text-ink";
const TABLE_BOX = "mt-3 overflow-x-auto rounded-md border border-line bg-surface";
/** The URL parameter that older links name a test with: /spread?test=B1. */
const TEST_PARAM = "test";

export const STATUS_TONE: Record<VideoStatus, PillTone> = {
  processed: "ok",
  graded: "brand",
  not_measurable: "warn",
  not_processed: "neutral",
};

export function SpreadView(props: MainViewProps) {
  // The open test is read from the URL, which is only known in the browser.
  return (
    <Suspense fallback={<Loading label="Loading the tests…" rows={3} />}>
      <ForwardOldLink />
      <Loader {...props} />
    </Suspense>
  );
}

/** Sends an older link, /spread?test=B1, on to the test's own page, keeping the chosen cabin air. */
function ForwardOldLink() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const named = searchParams.get(TEST_PARAM);
  const target = named && named.trim() ? withAir(testPageHref(named), searchParams) : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [router, target]);
  return null;
}

function Loader({ module: m, evidence }: MainViewProps) {
  const raw = useApi<unknown>(`/modules/${encodeURIComponent(m.id)}/files/index.json`);
  const table = useApi<unknown>(SERIES_TESTS_PATH);
  const example = m.status === "example";
  if (raw.status === "loading") return <Loading label="Loading the tests…" rows={3} />;
  const index = raw.status === "ok" ? parseIndex(raw.data) : null;
  if (!index) return <FallbackTable evidence={evidence} example={example} />;
  if (table.status === "loading") return <Loading label="Loading the tests…" rows={3} />;
  const catalog = table.status === "ok" ? parseCatalogTests(table.data) : null;
  // The page already says so when the whole analysis comes from the saved copy.
  const onlyTableSaved = table.status === "ok" && table.source === "saved" && raw.status === "ok" && raw.source === "live";
  return (
    <div data-testid="spread-view">
      {table.status === "error" ? (
        <Unreachable error={table.error} onRetry={table.retry} what="NASA's table of BASS-II tests" />
      ) : null}
      {onlyTableSaved ? <SavedCopyNote source="saved" savedAt={table.savedAt} /> : null}
      <TestList moduleId={m.id} index={index} catalog={catalog} />
    </div>
  );
}

// ------------------------------------------------------------------ the list

function TestList({
  moduleId,
  index,
  catalog,
}: {
  moduleId: string;
  index: SpreadIndex;
  /** NASA's table of the series, or null when it did not load. */
  catalog: { total: number; items: CatalogTest[] } | null;
}) {
  const { rows, loose } = useMemo(() => joinTests(catalog?.items ?? [], index), [catalog, index]);
  const counts = useMemo(() => statusCounts(rows), [rows]);
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const visible = useMemo(() => filterStatus(rows, status), [rows, status]);

  // Back from a test's page: bring that test's row into view, once.
  const [returned] = useState(() => (typeof window === "undefined" ? null : takeOpenedTest()));

  const segments: Segment<VideoStatus | null>[] = [
    { value: null, label: `All (${rows.length})` },
    ...VIDEO_STATUSES.filter((value) => counts[value] > 0).map((value) => ({
      value,
      label: `${STATUS_FILTER_WORDS[value]} (${counts[value]})`,
    })),
  ];
  const cut = catalog !== null && catalog.total > catalog.items.length;

  return (
    <>
      <p className="max-w-[75ch] text-[15px] leading-[23px] text-ink-2">
        Every test in NASA&apos;s BASS-II table ({SERIES_PSI_ID}). Positions and rates are in pixels because no scale is visible in the
        videos.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <SegmentedControl label="Status" segments={segments} value={status} onChange={setStatus} testId="spread-filters" />
        <p className="text-[15px] font-semibold tabular-nums text-ink" data-testid="spread-count">
          {processedLine(rows, catalog !== null)}
        </p>
      </div>

      {visible.length === 0 ? (
        <p data-testid="spread-empty" className="mt-4 text-[15px] text-ink">
          No test is listed for this series.
        </p>
      ) : (
        <div className={TABLE_BOX}>
          <table
            data-testid="spread-list"
            className="w-full min-w-[54rem] table-fixed border-collapse text-[15px] text-ink [&_tbody_tr:last-child>*]:border-b-0"
          >
            <caption className="sr-only">BASS-II tests</caption>
            <colgroup>
              <col className="w-[6.5rem]" />
              <col className="w-[21%]" />
              <col className="w-[6.5rem]" />
              <col />
              <col className="w-[12.5rem]" />
            </colgroup>
            <thead className={HEAD}>
              <tr>
                <th scope="col" className={`${CELL} font-semibold`}>Test</th>
                <th scope="col" className={`${CELL} font-semibold`}>Material</th>
                <th scope="col" className={`${CELL} text-right font-semibold`}>Oxygen (%)</th>
                <th scope="col" className={`${CELL} font-semibold`}>Video</th>
                <th scope="col" className={`${CELL} font-semibold`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <Row key={row.test_id} row={row} scroll={returned !== null && row.label === returned} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {cut && catalog ? (
          <p className="text-[15px] text-ink-2" data-testid="spread-cut">
            NASA&apos;s table has {catalog.total} tests. The first {catalog.items.length} are listed.
          </p>
        ) : null}
        <TSeriesNote tSeries={index.t_series} />
        <TrackerCheckNote moduleId={moduleId} />
        {loose.length > 0 ? (
          <div data-testid="loose-videos" className="max-w-[75ch]">
            <p className="text-[15px] font-semibold text-ink">Videos with no test assigned</p>
            <ul className="mt-1 space-y-1 text-[15px] leading-[23px] text-ink-2">
              {loose.map((entry, i) => (
                <li key={`${entry.file_name ?? entry.test_id ?? "entry"}-${i}`} data-testid="loose-video">
                  <span className="break-all font-mono text-[13px] text-ink">{entry.file_name ?? entry.test_id ?? "no file named"}</span>
                  : {entry.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Row({
  row,
  scroll,
}: {
  row: SeriesRow;
  /** Bring the row into view once: the visitor came back from this test's page. */
  scroll: boolean;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (scroll) ref.current?.scrollIntoView({ block: "center" });
  }, [scroll]);
  const opens = canOpen(row);
  return (
    <tr
      ref={ref}
      data-testid="spread-row"
      data-status={row.status}
      data-returned={scroll}
      className={`scroll-mt-24 transition-colors duration-150 ${opens ? "hover:bg-surface-sunk" : ""}`}
    >
      <th scope="row" className={`${CELL} text-left font-normal`}>
        {opens ? (
          <AppLink
            href={testPageHref(row.label)}
            aria-label={row.test ? `Show test ${row.label}` : `Show the outcome of test ${row.label}`}
            className="inline-flex h-8 min-w-[4.75rem] items-center justify-between gap-1.5 rounded-sm border border-control bg-surface px-2.5 font-mono text-[14px] font-semibold text-brand no-underline transition-colors duration-150 hover:border-brand hover:bg-brand-soft"
          >
            {row.label}
            <Icon name="arrow-right" size="sm" />
          </AppLink>
        ) : (
          <span className="inline-flex h-8 items-center px-2.5 font-mono text-[14px] font-medium text-ink">{row.label}</span>
        )}
      </th>
      <td className={CELL}>{row.material ?? <span className="text-ink-2">not stated</span>}</td>
      <td className={`${CELL} text-right tabular-nums`}>{row.oxygen_pct ?? <span className="text-ink-2">not stated</span>}</td>
      <td className={CELL}>
        {row.video_file ? (
          <span className="font-mono text-[13px] leading-snug text-ink [overflow-wrap:anywhere]">
            {row.video_file.split("_").map((part, n, parts) => (
              <Fragment key={n}>
                {part}
                {n < parts.length - 1 ? (
                  <>
                    _<wbr />
                  </>
                ) : null}
              </Fragment>
            ))}
          </span>
        ) : row.status === "not_processed" ? (
          <AppLink href={SERIES_FILES_HREF} className="text-[14px]">
            {SERIES_PSI_ID} files
          </AppLink>
        ) : (
          <span className="text-ink-2">no file named</span>
        )}
      </td>
      <td className={CELL}>
        <StatusPill tone={STATUS_TONE[row.status]} data-testid="spread-status">
          {STATUS_WORDS[row.status]}
        </StatusPill>
        {row.reason ? <span className="mt-1.5 block text-[14px] leading-snug text-ink-2">{row.reason}</span> : null}
        {row.outcome?.checked?.grade ? (
          <span className="mt-1.5 block text-[14px] leading-snug text-ink-2" data-testid="spread-checked">
            Checked by a person: {gradeWord(row.outcome.checked.grade)}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------ without index.json

function FallbackTable({ evidence, example }: { evidence: Evidence[]; example: boolean }) {
  const rows = fallbackRows(evidence);
  const cell = (row: (typeof rows)[number], quantity: string) =>
    row.quantities[quantity] ? <EvidenceNumber record={row.quantities[quantity]} example={example} /> : <span className="text-ink-2">not given</span>;
  return (
    <div data-testid="spread-fallback">
      <p className="max-w-[75ch] text-[15px] text-ink-2">The engine&apos;s index of tests did not load. These are its evidence records.</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-[15px] text-ink">This analysis has no evidence record yet.</p>
      ) : (
        <div className={TABLE_BOX}>
          <table className="w-full border-collapse text-[15px] text-ink" data-testid="evidence-table">
            <thead className={HEAD}>
              <tr>
                <th scope="col" className={`${CELL} font-semibold`}>Test</th>
                <th scope="col" className={`${CELL} font-semibold`}>Ignition time</th>
                <th scope="col" className={`${CELL} font-semibold`}>Extinction time</th>
                <th scope="col" className={`${CELL} font-semibold`}>Burn duration</th>
                <th scope="col" className={`${CELL} font-semibold`}>Spread rate</th>
                <th scope="col" className={`${CELL} font-semibold`}>Warnings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.test_id} data-testid="evidence-row">
                  <td className={`${CELL} whitespace-nowrap font-mono text-[14px]`}>
                    <TestId testId={row.test_id} />
                  </td>
                  <td className={CELL}>{cell(row, "ignition_time")}</td>
                  <td className={CELL}>{cell(row, "extinction_time")}</td>
                  <td className={CELL}>{cell(row, "burn_duration")}</td>
                  <td className={CELL}>{cell(row, "spread_rate")}</td>
                  <td className={`${CELL} text-[14px]`}>
                    {row.flags.length > 0 ? row.flags.map(flagLabel).join("; ") : <span className="text-ink-2">none</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
