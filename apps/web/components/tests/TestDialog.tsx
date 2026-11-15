"use client";

// One test opened (GET /catalog/tests/{test_id}): its cells as published, the source file
// and row, its flags explained, what the analyses computed for it (each number opens the evidence
// panel), and links to the investigation. A native <dialog>, a side panel 480 px wide on the right,
// over the page: keyboard reachable, closes with Escape (or a click beside it) and returns focus to
// what opened it. The URL holds the open test (?test=PSI-69/114), so it is linkable.
// The <dialog> is the scroll area and has no padding, so the sticky title bar sits flush with its
// top edge and no row shows through above it.
import { useEffect, useRef, type ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import { EvidenceNumber } from "@/components/evidence/EvidenceNumber";
import { ProvenanceBadge } from "@/components/evidence/ProvenanceBadge";
import { Notice, Unreachable } from "@/components/LoadStates";
import { SourceNote } from "@/components/SourceNote";
import { useApi } from "@/lib/api";
import { quantityLabel } from "@/lib/evidence";
import { sortEvidence } from "@/lib/pillar";
import { FUEL_LABEL } from "@/lib/filters";
import {
  flagExplanation,
  flagLabel,
  investigationLabel,
  notComparableReason,
  testApiPath,
  textOrNotStated,
  valueWithOriginal,
} from "@/lib/tests";
import type { Evidence, InvestigationSummary, ModuleSummary, TestRow } from "@/lib/types";

export function TestDialog({
  testId,
  investigations,
  onClose,
}: {
  testId: string | null;
  /** The catalog list, for the psi.nasa.gov link; null while it loads or if it failed. */
  investigations: InvestigationSummary[] | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const openFor = useRef<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    openFor.current = testId;
    if (testId && !dialog.open) dialog.showModal();
    if (!testId && dialog.open) dialog.close();
  }, [testId]);

  return (
    <dialog
      ref={ref}
      data-testid="test-dialog"
      aria-labelledby="test-dialog-title"
      onClose={() => {
        // Escape, the Close button, or a click on the backdrop: drop ?test= from the URL.
        if (openFor.current) {
          openFor.current = null;
          onClose();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="my-0 ml-auto mr-0 h-full max-h-full w-full max-w-[30rem] overflow-y-auto border-l border-rule bg-card p-0 text-ink shadow-dialog backdrop:bg-ink/40"
    >
      {testId ? <TestDetail testId={testId} investigations={investigations} onClose={() => ref.current?.close()} /> : null}
    </dialog>
  );
}

function TestDetail({
  testId,
  investigations,
  onClose,
}: {
  testId: string;
  investigations: InvestigationSummary[] | null;
  onClose: () => void;
}) {
  const answer = useApi<TestRow>(testApiPath(testId));
  const row = answer.status === "ok" && answer.data?.test_id ? answer.data : null;

  return (
    <div className="px-6 pb-6">
      <div className="sticky top-0 z-10 -mx-6 flex items-center justify-between gap-4 border-b border-rule bg-wash px-6 py-2">
        <h2 id="test-dialog-title" className="text-[1.125rem] font-semibold">
          Test <span className="font-mono">{testId}</span>
        </h2>
        <button type="button" onClick={onClose} className="btn btn-secondary shrink-0">
          Close
        </button>
      </div>

      {answer.status === "loading" ? (
        <div role="status" data-testid="loading" className="mt-4 space-y-2.5">
          <p className="text-ink-2">Loading this test…</p>
          <div aria-hidden="true" className="h-4 w-2/3 animate-pulse rounded-sm bg-wash" />
          <div aria-hidden="true" className="h-4 w-1/2 animate-pulse rounded-sm bg-wash" />
          <div aria-hidden="true" className="h-24 w-full animate-pulse rounded-sm bg-wash" />
        </div>
      ) : answer.status === "error" ? (
        answer.error.kind === "unreachable" ? (
          <Unreachable error={answer.error} onRetry={answer.retry} what="this test" />
        ) : (
          <Notice title="No test with this ID" testId="test-not-found">
            <p>The data service has no test {testId}.</p>
          </Notice>
        )
      ) : row === null ? (
        <Notice title="No test with this ID" testId="test-not-found">
          <p>The data service did not return the test {testId}.</p>
        </Notice>
      ) : (
        <Detail row={row} psiUrl={investigations?.find((item) => item.psi_id === row.psi_id)?.psi_url ?? null} />
      )}
    </div>
  );
}

function Detail({ row, psiUrl }: { row: TestRow; psiUrl: string | null }) {
  const raw = row.raw ? Object.entries(row.raw) : [];
  const notComparable = notComparableReason(row);
  return (
    <>
      <dl className="mt-5 grid gap-x-4 gap-y-1.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <Item term="Investigation">
          {row.acronym ? `${row.acronym}, ` : ""}
          <span className="font-mono text-[0.875rem]">{row.psi_id}</span>
        </Item>
        <Item term="Table">{textOrNotStated(row.table_name)}</Item>
        <Item term="Fuel">
          {textOrNotStated(row.fuel)}
          {row.fuel_phase ? <span className="text-ink-2"> ({(FUEL_LABEL[row.fuel_phase] ?? row.fuel_phase).toLowerCase()})</span> : null}
        </Item>
        <Item term="Oxygen">{valueWithOriginal(row, "o2_mole_fraction", row.o2_mole_fraction)}</Item>
        <Item term="Pressure">{valueWithOriginal(row, "pressure_kpa", row.pressure_kpa)}</Item>
        <Item term="Airflow">{valueWithOriginal(row, "flow_cm_s", row.flow_cm_s)}</Item>
        <Item term="Added gas (diluent)">{textOrNotStated(row.diluent)}</Item>
        <Item term="How it ended">{textOrNotStated(row.outcome)}</Item>
        <Item term="On the chart">
          <span data-testid="test-comparable">
            {notComparable ? `No. ${notComparable}.` : "Yes. Its table states oxygen and pressure."}
          </span>
        </Item>
      </dl>

      {row.flags.length > 0 ? (
        <div data-testid="test-flags" className="mt-6 rounded-md border border-warn bg-warn-wash px-4 py-3 text-ink">
          <h3 className="font-semibold text-warn">Flags on this test</h3>
          <ul className="mt-1 space-y-1">
            {row.flags.map((flag) => (
              <li key={flag}>
                <span className="font-medium">{flagLabel(flag)}:</span> {flagExplanation(flag)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <TestEvidence records={row.evidence ?? []} />

      <h3 className="mt-8 text-[1.125rem] font-semibold">The row as published</h3>
      <div className="mt-1">
        <SourceNote>
          <span className="font-mono" data-testid="test-source-file">
            {row.source_file}
          </span>
          , row {row.source_row} ({investigationLabel(row.psi_id, row.acronym)})
        </SourceNote>
      </div>
      {raw.length > 0 ? (
        <table data-testid="test-raw" className="mt-3 w-full border-collapse text-[0.875rem]">
          <caption className="sr-only">Every cell of this row as the source file writes it</caption>
          <thead className="border-b border-line bg-surface-sunk">
            <tr>
              <th scope="col" className="px-3 py-1.5 text-left font-semibold">Column</th>
              <th scope="col" className="px-3 py-1.5 text-left font-semibold">Cell</th>
            </tr>
          </thead>
          <tbody>
            {raw.map(([column, cell]) => (
              <tr key={column} className="border-b border-rule">
                <th scope="row" className="px-3 py-1.5 text-left align-top font-normal">
                  {column}
                </th>
                <td className="break-all px-3 py-1.5 align-top font-mono text-[0.875rem]">
                  {cell === "" ? <span className="font-sans text-ink-2">empty in the source</span> : cell}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-ink-2">The data service did not send the cells of this row.</p>
      )}

      <ul className="mt-6 space-y-1">
        <li>
          <AppLink href={`/investigations/${row.psi_id}`}>
            About this investigation ({investigationLabel(row.psi_id, row.acronym)})
          </AppLink>
        </li>
        {psiUrl ? (
          <li>
            <a href={psiUrl} target="_blank" rel="noopener noreferrer">
              Open this record on psi.nasa.gov
            </a>
          </li>
        ) : null}
      </ul>
    </>
  );
}

/** What the analyses computed or measured for this test. Every value opens the evidence panel. */
function TestEvidence({ records }: { records: Evidence[] }) {
  const modules = useApi<ModuleSummary[]>("/modules");
  const example = new Set(modules.status === "ok" ? modules.data.filter((m) => m.status === "example").map((m) => m.id) : []);
  const cell = "border-b border-rule px-3 py-2 align-top";
  return (
    <section data-testid="test-evidence" aria-labelledby="test-evidence-title" className="mt-8">
      <h3 id="test-evidence-title" className="text-[1.125rem] font-semibold">
        What the analyses found for this test
      </h3>
      {records.length === 0 ? (
        <p className="mt-1 text-ink-2">No analysis has a number for this test yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse bg-card text-[0.875rem]">
            <caption className="sr-only">Numbers the analyses give for this test. A value opens its source.</caption>
            <thead className="border-b border-line bg-surface-sunk">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left font-semibold">Quantity</th>
                <th scope="col" className="px-3 py-1.5 text-right font-semibold">Value</th>
                <th scope="col" className="px-3 py-1.5 text-left font-semibold">How it was obtained</th>
              </tr>
            </thead>
            <tbody>
              {sortEvidence(records).map((record) => (
                <tr key={record.id} data-testid="test-evidence-row">
                  <td className={cell}>
                    {quantityLabel(record.quantity)}
                    {record.segment ? <span className="text-ink-2"> ({record.segment})</span> : null}
                    <span className="mt-0.5 block font-mono text-[0.875rem] text-ink-2">
                      <span className="sr-only">Analysis: </span>
                      {record.module}
                    </span>
                  </td>
                  <td className={`${cell} text-right`}>
                    <EvidenceNumber record={record} example={example.has(record.module)} />
                  </td>
                  <td className={cell}>
                    <ProvenanceBadge tag={record.provenance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-medium text-ink-2">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
