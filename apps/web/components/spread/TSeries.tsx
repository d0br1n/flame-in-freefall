"use client";

// The T-series outcomes (DOB-86, DOB-126): how a fabric-strip test ended, as graded by SI from
// brightened frames and the fan voltage history, beside NASA's published outcome (Summary Report
// Table 7.1). GradePanel is what a T-series row of the list opens to; TSeriesNote is the count
// line under the list. Nothing is shown when the index has no t_series block.
import type { ReactNode } from "react";
import { useEvidencePanel } from "@/components/evidence/EvidencePanel";
import { Mark, ProvenanceBadge } from "@/components/evidence/ProvenanceBadge";
import { gradeWord, matchWord, tCheckLine, tSeriesCountLine, type TSeries, type TSeriesRow } from "@/lib/spread";
import type { Evidence } from "@/lib/types";

// Marks on a 16 x 16 grid, one stroke weight. The word beside each one carries the meaning.
export const MATCH_MARK: Record<string, string> = {
  yes: "M3 8.5l3.5 3.5L13 4.5",
  no: "M4 4l8 8 M12 4l-8 8",
  undecided: "M6 6a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.8 M8 12.2v.3",
  not_graded: "M4 8h8",
};

export const TERM = "text-[14px] font-semibold text-ink-2";
export const VALUE = "mt-0.5 text-[15px] text-ink";

export function EvidenceButton({ record, example, children, testId }: { record: Evidence | null; example: boolean; children: ReactNode; testId: string }) {
  const panel = useEvidencePanel();
  if (!record || !panel) return <span>{children}</span>;
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={(event) => panel.open(record, { opener: event.currentTarget, status: example ? "example" : undefined })}
      className="cursor-pointer rounded-sm text-left font-medium text-brand underline decoration-dotted underline-offset-[3px] hover:decoration-solid"
    >
      {children}
      <span className="sr-only">, show where this comes from</span>
    </button>
  );
}

/** One T-series test: NASA's outcome, the SI grade, whether they match, and the reason. */
export function GradePanel({ row, evidence, example }: { row: TSeriesRow; evidence: readonly Evidence[]; example: boolean }) {
  const published = evidence.find((r) => r.id === row.published_evidence_id) ?? null;
  const graded = evidence.find((r) => r.id === row.evidence_id) ?? null;
  const mark = MATCH_MARK[row.match];
  return (
    <div data-testid="t-series-row" data-test={row.label}>
      <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className={TERM}>NASA&apos;s published outcome</dt>
          <dd className={VALUE}>
            {row.nasa_outcome ? (
              <EvidenceButton record={published} example={example} testId="t-series-published">
                {row.nasa_outcome}
              </EvidenceButton>
            ) : (
              <span className="text-ink-2">not given</span>
            )}
          </dd>
        </div>
        <div>
          <dt className={TERM}>SI grade</dt>
          <dd className={`${VALUE} flex flex-wrap items-center gap-2`}>
            {row.si_grade !== null ? (
              <>
                <EvidenceButton record={graded} example={example} testId="t-series-grade">
                  {gradeWord(row.si_grade)}
                </EvidenceButton>
                <ProvenanceBadge tag={graded?.provenance ?? "SI_EXTRACTED"} />
              </>
            ) : (
              <span className="text-ink-2">{gradeWord(null)}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className={TERM}>Confidence</dt>
          <dd className={VALUE}>{row.confidence ?? <span className="text-ink-2">not given</span>}</dd>
        </div>
        <div>
          <dt className={TERM}>Match</dt>
          <dd className={VALUE}>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap" data-testid="t-series-match" data-match={row.match}>
              <Mark path={mark ?? "M8 2.5a5.5 5.5 0 1 0 0.01 0z"} />
              {matchWord(row.match)}
            </span>
          </dd>
        </div>
      </dl>
      <p className="mt-4 max-w-[75ch] text-[15px] leading-[23px] text-ink">{row.reason ?? "No reason is given."}</p>
      {row.fan_history ? <p className="mt-2 max-w-[75ch] text-[14px] text-ink-2">Fan voltage x10: {row.fan_history}</p> : null}
    </div>
  );
}

/** Under the list: how the SI grades compare with NASA's table, and who graded. */
export function TSeriesNote({ tSeries }: { tSeries: TSeries | null }) {
  if (!tSeries || tSeries.tests.length === 0) return null;
  const checkLine = tCheckLine(tSeries.tests);
  return (
    <div data-testid="t-series" className="max-w-[75ch]">
      <p className="text-[15px] font-semibold text-ink" data-testid="t-series-count">
        {tSeriesCountLine(tSeries.tests)}
      </p>
      {checkLine ? (
        <p className="mt-1 text-[15px] font-semibold text-ink" data-testid="t-series-check-count">
          {checkLine}
        </p>
      ) : null}
      <p className="mt-1 text-[15px] leading-[23px] text-ink-2">
        {tSeries.note ?? "SI graded the T-series outcomes from brightened frames and the fan voltage history."}
        {checkLine ? "" : " A person should check these grades."}
      </p>
      {tSeries.graded_by ? <p className="mt-1 text-[13px] text-ink-3">Graded by: {tSeries.graded_by}.</p> : null}
    </div>
  );
}
