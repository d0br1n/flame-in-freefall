"use client";

// The Compare page (Linear DOB-75): two to four investigations in aligned rows, every value from
// GET /api/v1/catalog/compare (apps/api/app/catalog.py, Catalog.compare). The page only lays the
// answer out: a null value prints "Not stated", ranges stay per investigation (each drawn on the
// row's own axis, never merged into one), suspect values are named, and planned ranges show as PSI
// wrote them. The choice lives in the URL (?ids=PSI-69,PSI-68), so a comparison can be shared.
// The API's "cannot_tell" row is left out (compareModel.shownRows): limits live on /limitations.
// Count wording ("Stated in 12 of 30 tests") comes from compareModel, unit tested.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppLink } from "@/components/AppLink";
import { Loading, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import { SourceNote } from "@/components/SourceNote";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Icon } from "@/components/ui/Icon";
import { useApi } from "@/lib/api";
import { COMPARE_STARTS, comparePath } from "@/lib/compareDefaults.mjs";
import { formatBytes, formatCount, plural } from "@/lib/format";
import type { CompareCell, CompareResponse, CompareRow, InvestigationList } from "@/lib/types";
import { caveatLine, notStatedLine, notStatedScope, parseIds, rangeAxis, shownRows, statedLine, type RangeValue } from "./compareModel";

const MIN = 2;
const MAX = 4;

// Column widths. Each investigation column stays between 17rem and 26rem, so its text is not lost
// in empty space; on a phone the label column and one investigation column fit the screen together.
const LABEL_MIN = "clamp(8.5rem, 22vw, 10rem)";
const LABEL_MAX = "14rem";
const COLUMN_MIN = "clamp(14rem, 60vw, 17rem)";
const COLUMN_MAX_REM = 26;
/** The widest the table gets with n investigations: the page is capped to it and sits left. */
const tableMaxWidth = (n: number) => `${14 + Math.min(Math.max(n, MIN), MAX) * COLUMN_MAX_REM}rem`;

type RowFilter = "all" | "different" | "same";

export function CompareView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ids = parseIds(params.get("ids"));
  const [filter, setFilter] = useState<RowFilter>("all");
  const catalog = useApi<InvestigationList>("/catalog/investigations");
  const ready = ids.length >= MIN && ids.length <= MAX;
  const answer = useApi<CompareResponse>(ready ? comparePath(ids) : null);

  function choose(next: string[]) {
    const query = new URLSearchParams(params.toString());
    if (next.length) query.set("ids", next.join(","));
    else query.delete("ids");
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }

  const options = catalog.status === "ok" ? catalog.data.items : [];
  const name = (psiId: string) => {
    const item = options.find((row) => row.psi_id === psiId);
    return item?.acronym ?? item?.title ?? psiId;
  };

  return (
    <div className="mx-auto w-full max-w-[100rem]">
      <div className="grid w-full grid-cols-[minmax(0,1fr)] gap-5" style={{ maxWidth: tableMaxWidth(ids.length) }}>
        <section className="reveal-self rounded-lg border border-line bg-surface p-5 shadow-sm sm:p-7" aria-labelledby="compare-pick">
          <h2 id="compare-pick" className="font-display text-[26px] leading-[32px] font-semibold tracking-[-0.02em] sm:text-[32px] sm:leading-[38px]">
            Put investigations side by side
          </h2>
          <p className="mt-2 max-w-[70ch] text-[16px] leading-[25px] text-ink-2">
            Pick two to four investigations to see where they match and where they differ.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="compare-chosen">
            {ids.map((psiId) => (
              <span key={psiId} className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand-soft py-1 pr-1 pl-3 text-[14px] font-medium text-ink">
                <span className="font-mono text-[14px]">{psiId}</span>
                <span className="text-ink-2">{name(psiId)}</span>
                <button
                  type="button"
                  onClick={() => choose(ids.filter((id) => id !== psiId))}
                  className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-ink-2 hover:bg-surface hover:text-ink"
                  aria-label={`Remove ${psiId}`}
                >
                  <Icon name="close" className="size-4" />
                </button>
              </span>
            ))}
            {ids.length < MAX ? (
              <label className="inline-flex min-w-0 max-w-full items-center gap-2">
                <span className="sr-only">Add an investigation</span>
                <select
                  value=""
                  onChange={(event) => event.target.value && choose([...ids, event.target.value])}
                  className="min-h-10 w-[22rem] max-w-full cursor-pointer rounded-full border border-dashed border-control bg-surface px-3 text-[14px] text-ink"
                  data-testid="compare-add"
                  disabled={catalog.status !== "ok"}
                >
                  <option value="">{ids.length === 0 ? "Choose an investigation…" : "Add an investigation…"}</option>
                  {options
                    .filter((row) => !ids.includes(row.psi_id))
                    .map((row) => (
                      <option key={row.psi_id} value={row.psi_id}>
                        {row.psi_id} {row.acronym ? `${row.acronym}: ` : ""}
                        {row.title}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <span className="text-[14px] text-ink-2">Four is the maximum.</span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px]">
            <span className="text-ink-2">Start from:</span>
            {COMPARE_STARTS.map((start) => (
              <button
                key={start.label}
                type="button"
                onClick={() => choose([...start.ids])}
                className="cursor-pointer rounded-full border border-line bg-surface-sunk px-3 py-1 font-medium text-ink-2 transition-colors duration-150 hover:border-control hover:text-ink"
                data-testid="compare-start"
              >
                {start.label}
              </button>
            ))}
          </div>
        </section>

        {!ready ? (
          <section className="rounded-lg border border-dashed border-control bg-surface px-6 py-10 text-center" data-testid="compare-empty">
            <p className="font-display text-[20px] font-semibold text-ink">
              {ids.length < MIN ? "Choose at least two investigations." : "Choose at most four investigations."}
            </p>
          </section>
        ) : answer.status === "loading" ? (
          <Loading label="Loading the comparison…" rows={6} />
        ) : answer.status === "error" ? (
          <Unreachable error={answer.error} onRetry={answer.retry} what="the comparison" />
        ) : (
          <Comparison data={answer.data} filter={filter} setFilter={setFilter} source={answer.source} savedAt={answer.savedAt} />
        )}
      </div>
    </div>
  );
}

function Comparison({
  data,
  filter,
  setFilter,
  source,
  savedAt,
}: {
  data: CompareResponse;
  filter: RowFilter;
  setFilter: (value: RowFilter) => void;
  source: "live" | "saved";
  savedAt: string | null;
}) {
  const shown = shownRows(data.rows);
  const rows = shown.filter((row) => (filter === "all" ? true : filter === "same" ? row.same : !row.same));
  const differing = shown.filter((row) => !row.same).length;
  const n = data.investigations.length;
  const columns = `minmax(${LABEL_MIN}, ${LABEL_MAX}) repeat(${n}, minmax(${COLUMN_MIN}, ${COLUMN_MAX_REM}rem))`;
  const minWidth = `calc(${LABEL_MIN} + ${n} * ${COLUMN_MIN})`;

  return (
    <section className="rounded-lg border border-line bg-surface shadow-sm" aria-labelledby="compare-result" data-testid="compare-result">
      <SavedCopyNote source={source} savedAt={savedAt} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-7">
        <h2 id="compare-result" className="font-display text-[20px] font-semibold text-ink">
          {formatCount(differing)} of {formatCount(shown.length)} rows differ
        </h2>
        <SegmentedControl<RowFilter>
          label="Rows to show"
          value={filter}
          onChange={setFilter}
          segments={[
            { value: "all", label: "All rows" },
            { value: "different", label: "Only differences" },
            { value: "same", label: "Only what they share" },
          ]}
          testId="compare-filter"
        />
      </div>

      <div className="overflow-x-auto">
        <div className="w-full" style={{ minWidth }} role="table" aria-label="Investigations side by side">
          <div role="row" className="grid border-b border-line bg-surface" style={{ gridTemplateColumns: columns }}>
            <div role="columnheader" className="py-3 pr-3 pl-4 sm:pr-4 sm:pl-7">
              <span className="sr-only">Row</span>
            </div>
            {data.investigations.map((inv, index) => (
              <div role="columnheader" key={inv.psi_id} className="reveal-self min-w-0 border-l border-line px-4 py-3" style={{ ["--i" as string]: index }}>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[14px] text-ink-2">{inv.psi_id}</span>
                  <span className="font-display text-[20px] font-semibold text-ink">{inv.acronym ?? inv.psi_id}</span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-[14px] leading-[20px] text-ink-2">{inv.title}</p>
                <p className="mt-1.5 flex flex-wrap gap-x-3 text-[14px]">
                  <AppLink href={`/investigations/${encodeURIComponent(inv.psi_id)}`}>Details</AppLink>
                  <a href={inv.psi_url} target="_blank" rel="noopener noreferrer">
                    psi.nasa.gov<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </p>
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="px-4 py-8 text-[16px] text-ink-2 sm:px-7">No rows match this filter.</p>
          ) : (
            rows.map((row, index) => <Row key={`${filter}-${row.key}`} row={row} columns={columns} index={index} notStated={data.not_stated} />)
          )}
        </div>
      </div>
      <div className="grid gap-2 border-t border-line px-4 py-4 sm:px-7">
        <p className="text-[14px] leading-[20px] text-ink-2">
          Each range is what that investigation tested, from its own PSI table rows. Ranges are never merged.
        </p>
        <p className="text-[14px] leading-[20px]">
          <AppLink href="/limitations#investigations" data-testid="compare-limits-link">
            Limits of each investigation
          </AppLink>
        </p>
        <SourceNote>
          NASA PSI records and experimental tables of each investigation (<span className="font-mono">GET /api/v1/catalog/compare</span>).
        </SourceNote>
      </div>
    </section>
  );
}

function Row({ row, columns, index, notStated }: { row: CompareRow; columns: string; index: number; notStated: string }) {
  const axis = useMemo(() => rangeAxis(row), [row]);
  return (
    <div role="row" className="reveal-self grid border-b border-line last:border-b-0 hover:bg-surface-sunk/50" style={{ gridTemplateColumns: columns, ["--i" as string]: Math.min(index, 10) }} data-testid="compare-row" data-key={row.key} data-same={row.same}>
      <div role="rowheader" className="min-w-0 py-3 pr-3 pl-4 sm:pr-4 sm:pl-7">
        <p className="text-[15px] font-semibold leading-[21px] text-ink hyphens-auto [overflow-wrap:anywhere]">{row.label}</p>
        {row.unit ? <p className="mt-0.5 text-[14px] leading-[20px] text-ink-2">{row.unit}</p> : null}
        <p className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-px text-[13px] font-semibold ${row.same ? "bg-ok-soft text-ok" : "bg-brand-soft text-brand"}`}>
          {row.same ? "Same" : "Differs"}
        </p>
      </div>
      {row.cells.map((cell, i) => (
        <div role="cell" key={i} className="min-w-0 border-l border-line px-4 py-3 text-[16px] leading-[24px] text-ink">
          <Cell rowKey={row.key} cell={cell} axis={axis} notStated={notStated} />
        </div>
      ))}
    </div>
  );
}

/** Notes and extras under a cell's value. */
const NOTE = "text-[14px] leading-[20px] text-ink-2";

/** "Not stated" once, in its dashed box; `scope` adds where ("in any of the 18 tests"). */
function NotStated({ text, scope }: { text: string; scope?: string | null }) {
  const label = text.replace(/^./, (first) => first.toUpperCase());
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="inline-block rounded-sm border border-dashed border-control px-2 py-0.5 text-ink-2">{label}</span>
      {scope ? <span className={NOTE}>{scope}</span> : null}
    </p>
  );
}

function Chips({ items }: { items: ReactNode[] }) {
  return <div className="flex flex-wrap gap-1.5">{items}</div>;
}

const CHIP = "inline-flex max-w-full items-baseline gap-1.5 rounded-sm bg-surface-sunk px-2 py-0.5 [overflow-wrap:anywhere]";

function Cell({ rowKey, cell, axis, notStated }: { rowKey: string; cell: CompareCell; axis: [number, number] | null; notStated: string }) {
  const value = cell.value;
  const extras: ReactNode[] = [];

  if (rowKey === "oxygen" || rowKey === "pressure" || rowKey === "flow") {
    const range = value as RangeValue | null;
    const stated = Number(cell.rows_stated ?? 0);
    const notGiven = Number(cell.rows_not_stated ?? 0);
    const excluded = cell.excluded as { test_ids?: string[]; reason?: string } | undefined;
    const leftOut = excluded?.test_ids ?? [];
    const line = statedLine(stated, notGiven, leftOut.length);
    return (
      <div className="grid gap-2">
        {range ? (
          <>
            <p className="font-display text-[20px] leading-[26px] font-semibold tabular-nums">
              {fmt(range.min)} <span className="font-sans text-[14px] font-normal text-ink-2">to</span> {fmt(range.max)}
            </p>
            {axis ? <RangeBar range={range} axis={axis} /> : null}
          </>
        ) : (
          <NotStated text={notStated} scope={line ? null : notStatedScope(notGiven)} />
        )}
        {line ? <p className={`${NOTE} tabular-nums`}>{line}</p> : null}
        {leftOut.length ? (
          <p className="text-[14px] leading-[20px] text-warn [overflow-wrap:anywhere]">
            Left out: {leftOut.join(", ")}
            {excluded?.reason ? ` (${excluded.reason.split(";")[0]})` : ""}
          </p>
        ) : null}
        {cell.caveats
          ? Object.entries(cell.caveats as Record<string, number>).map(([flag, n]) => (
              <p key={flag} className={NOTE}>
                {caveatLine(flag, n)}
              </p>
            ))
          : null}
        {Array.isArray(cell.as_written) ? (
          <div className="rounded-md bg-surface-sunk px-2.5 py-1.5">
            <p className={NOTE}>Range or list in the PSI table</p>
            <p className="font-mono text-[14px] leading-[20px] text-ink [overflow-wrap:anywhere]">{(cell.as_written as string[]).join(" | ")}</p>
          </div>
        ) : null}
      </div>
    );
  }

  const missing = typeof cell.rows_not_stated === "number" ? cell.rows_not_stated : 0;
  let body: ReactNode;
  if (value === null || value === undefined) {
    body = <NotStated text={notStated} scope={notStatedScope(missing)} />;
  } else if (Array.isArray(value) && value.length && typeof value[0] === "object") {
    body = (
      <Chips
        items={(value as { name: string; count: number }[]).map((item) => (
          <span key={item.name} className={CHIP}>
            {item.name}
            <span className="font-mono text-[14px] text-ink-2">{formatCount(item.count)}</span>
          </span>
        ))}
      />
    );
  } else if (Array.isArray(value)) {
    body = (
      <Chips
        items={(value as string[]).map((item) => (
          <span key={item} className={CHIP}>
            {String(item).replace(/_/g, " ")}
          </span>
        ))}
      />
    );
  } else if (typeof value === "number") {
    body = <p className="font-display text-[22px] leading-[28px] font-semibold tabular-nums">{formatCount(value)}</p>;
  } else {
    body = <p className="[overflow-wrap:anywhere]">{String(value)}</p>;
  }

  if (typeof cell.group === "string") extras.push(<p key="group" className={NOTE}>{cell.group}</p>);
  if (Array.isArray(cell.tables) && cell.tables.length) {
    extras.push(
      <p key="tables" className="font-mono text-[13px] leading-[18px] break-all text-ink-2">
        {(cell.tables as string[]).join(", ")}
      </p>,
    );
  }
  if (rowKey === "downloadable") {
    extras.push(
      <p key="dl" className={`${NOTE} tabular-nums`}>
        {plural(Number(cell.tables ?? 0), "experimental table")}, {plural(Number(cell.files ?? 0), "other file")}
        {typeof cell.listed_bytes === "number" ? `; PSI lists ${formatBytes(cell.listed_bytes)}` : ""}
      </p>,
    );
  }
  const missingLine = value === null || value === undefined ? null : notStatedLine(missing);
  if (missingLine) {
    extras.push(
      <p key="nst" className={`${NOTE} tabular-nums`}>
        {missingLine}
      </p>,
    );
  }
  if (typeof cell.source === "string" && cell.source) {
    extras.push(
      <SourceNote key="src">
        <span className="[overflow-wrap:anywhere]">{cell.source}</span>
      </SourceNote>,
    );
  }
  return (
    <div className="grid gap-1.5">
      {body}
      {extras}
    </div>
  );
}

function fmt(value: number): string {
  return Number.isInteger(value) ? formatCount(value) : String(Math.round(value * 1000) / 1000);
}

/** One investigation's tested range on the row's axis (the axis spans the row's ranges; each bar is its own). */
function RangeBar({ range, axis }: { range: RangeValue; axis: [number, number] }) {
  const [lo, hi] = axis;
  const span = hi - lo || 1;
  const left = ((range.min - lo) / span) * 100;
  const width = Math.max(1.5, ((range.max - range.min) / span) * 100);
  return (
    <div className="relative h-2 rounded-full bg-surface-sunk" aria-hidden="true">
      <div className="grow-x absolute inset-y-0 rounded-full bg-brand" style={{ left: `${left}%`, width: `${width}%` }} />
    </div>
  );
}
