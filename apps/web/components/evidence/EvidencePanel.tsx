"use client";

// The evidence panel (DOB-85): clicking any number, on any page, opens this one panel, which says
// where the number comes from. Mounted once in the shell (app/layout.tsx). A page opens it with
// useEvidencePanel().open(record, context), usually through <EvidenceNumber>.
// It is a modal <dialog>, a side panel 480 px wide on the right, over the page: the browser traps
// focus inside it and closes it with Escape; on close the focus goes back to the number that opened it.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import { useApi } from "@/lib/api";
import {
  assetKind,
  conditionText,
  flagLabel,
  formatNumber,
  formatValue,
  isFinding,
  moduleFileUrl,
  opensTheRecord,
  quantityLabel,
  signedDifference,
  sourceHref,
  sourceLinkLabel,
  unitText,
  type PanelRecord,
} from "@/lib/evidence";
import { builtHref } from "@/lib/nav";
import { checkVerdict } from "@/lib/pillar";
import { provenanceStyle } from "@/lib/provenance";
import type { EngineModule, Evidence, Finding, InvestigationList, Source } from "@/lib/types";
import { ExampleCallout, VerdictMark } from "./Markers";
import { ProvenanceBadge } from "./ProvenanceBadge";

export interface PanelContext {
  /** The analysis's status, when the caller knows it. The panel also reads it from the backend. */
  status?: "example" | "built";
  /** The element to give focus back to on close. Defaults to the focused element at open time. */
  opener?: HTMLElement | null;
}

interface EvidencePanelApi {
  open: (record: PanelRecord, context?: PanelContext) => void;
}

const EvidencePanelContext = createContext<EvidencePanelApi | null>(null);

/** The panel's opener, or null outside the provider (then numbers render as plain text). */
export function useEvidencePanel(): EvidencePanelApi | null {
  return useContext(EvidencePanelContext);
}

export function EvidencePanelProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<{ record: PanelRecord; context: PanelContext } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const open = useCallback((record: PanelRecord, context: PanelContext = {}) => {
    if (!dialogRef.current?.open) {
      const active = typeof document !== "undefined" ? document.activeElement : null;
      openerRef.current = context.opener ?? (active instanceof HTMLElement ? active : null);
    }
    setItem({ record, context });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (item && dialog && !dialog.open) dialog.showModal();
  }, [item]);

  const close = useCallback(() => dialogRef.current?.close(), []);

  const onClose = useCallback(() => {
    setItem(null);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && opener.isConnected) opener.focus();
  }, []);

  const api = useMemo(() => ({ open }), [open]);

  return (
    <EvidencePanelContext.Provider value={api}>
      {children}
      <dialog
        ref={dialogRef}
        onClose={onClose}
        aria-labelledby="evidence-panel-title"
        data-testid="evidence-panel"
        className="my-0 ml-auto mr-0 h-full max-h-full w-full max-w-[30rem] overflow-y-auto border-l border-rule bg-card p-0 text-ink shadow-dialog backdrop:bg-ink/40"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-rule bg-wash px-6 py-2">
          <h2 id="evidence-panel-title" className="text-[1.125rem] font-semibold">
            Where this number comes from
          </h2>
          <button
            type="button"
            onClick={close}
            className="btn btn-secondary shrink-0"
          >
            Close
          </button>
        </div>
        {item ? <PanelBody record={item.record} context={item.context} /> : null}
      </dialog>
    </EvidencePanelContext.Provider>
  );
}

function PanelBody({ record, context }: { record: PanelRecord; context: PanelContext }) {
  const engine = useApi<EngineModule>(`/modules/${encodeURIComponent(record.module)}`);
  const status = engine.status === "ok" ? engine.data.status : context.status;
  const example = status === "example";

  return (
    <div className="space-y-6 px-6 py-5">
      {example ? (
        <ExampleCallout testId="panel-example">
          This number belongs to an analysis whose values are still placeholders. It is not a measurement and not a
          result.
        </ExampleCallout>
      ) : null}
      {isFinding(record) ? <FindingBody finding={record} status={status} /> : <EvidenceBody record={record} />}
      <p className="text-[0.875rem] text-muted">
        Analysis: {engine.status === "ok" ? engine.data.title : null}{" "}
        <span className="font-mono">{record.module}</span>. Record <span className="break-all font-mono">{record.id}</span>.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-0.5 border-b border-rule py-2 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Provenance({ tag }: { tag: string }) {
  return (
    <>
      <ProvenanceBadge tag={tag} />
      <span className="mt-1 block text-[0.875rem] text-muted">{provenanceStyle(tag).meaning}</span>
    </>
  );
}

function SourceRow({ source }: { source: Source }) {
  // The record's link is used only when it opens the source for a reader; else the catalog's
  // address of the investigation on psi.nasa.gov (DOB-110).
  const direct = source.link && opensTheRecord(source.link) ? source.link : null;
  const catalog = useApi<InvestigationList>(direct ? null : "/catalog/investigations");
  const link = sourceHref(
    direct,
    catalog.status === "ok" ? catalog.data.items.find((item) => item.psi_id === source.psi_id)?.psi_url : undefined,
  );
  return (
    <Row label="NASA source">
      <AppLink href={`/investigations/${encodeURIComponent(source.psi_id)}`} className="font-mono font-medium">
        {source.psi_id}
      </AppLink>
      <span className="mt-0.5 block break-all font-mono text-[0.875rem]">{source.file}</span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block text-[0.875rem]">
          {sourceLinkLabel(link)}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
    </Row>
  );
}

/** A test ID: a link to the tests explorer once that page is built, plain text before. */
export function TestId({ testId }: { testId: string }) {
  const tests = builtHref("/tests");
  return tests ? (
    <AppLink href={`${tests}?test=${encodeURIComponent(testId)}`} className="font-mono">
      {testId}
    </AppLink>
  ) : (
    <span className="font-mono">{testId}</span>
  );
}

function EvidenceBody({ record }: { record: Evidence }) {
  const conditions = Object.entries(record.conditions ?? {});
  const difference = record.reference ? signedDifference(record.value, record.reference.value, record.unit) : null;
  const unit = unitText(record.unit);
  return (
    <>
      <dl className="border-t border-rule text-[0.9375rem]">
        <Row label="Quantity">{quantityLabel(record.quantity)}</Row>
        <Row label="Value">
          <span className="font-semibold tabular-nums">{formatValue(record.value, record.unit)}</span>
        </Row>
        <Row label="Uncertainty">
          {record.uncertainty ? (
            <>
              <span className="tabular-nums">
                {formatNumber(record.uncertainty.interval[0])} to {formatNumber(record.uncertainty.interval[1])}
                {unit ? ` ${unit}` : ""}
              </span>
              <span className="block text-[0.875rem] text-muted">Method: {record.uncertainty.method}</span>
            </>
          ) : (
            <span className="text-muted">Not given</span>
          )}
        </Row>
        <Row label="Tests or samples">
          <span className="tabular-nums">n = {record.n.toLocaleString("en-US")}</span>
        </Row>
        <Row label="How it was obtained">
          <Provenance tag={record.provenance} />
        </Row>
        <Row label="Test">
          <TestId testId={record.test_id} />
        </Row>
        {record.segment ? <Row label="Part of the test">{record.segment}</Row> : null}
        <Row label="Conditions">
          {conditions.length > 0 ? (
            <ul className="space-y-0.5">
              {conditions.map(([key, value]) => (
                <li key={key}>
                  <span className="font-mono text-[0.875rem]">{key}</span>: <span className="tabular-nums">{conditionText(value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted">None stated</span>
          )}
        </Row>
        <SourceRow source={record.source} />
        <Row label="Published value">
          {record.reference ? (
            <>
              <span className="tabular-nums">{formatValue(record.reference.value, record.unit)}</span>
              <span className="block text-[0.875rem] text-muted">Citation: {record.reference.citation}</span>
              {difference ? (
                <span className="mt-0.5 block" data-testid="signed-difference">
                  This value minus the published one: <span className="font-medium tabular-nums">{difference.text}</span>
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted">None to compare with</span>
          )}
        </Row>
        <Row label="Flags">
          {record.flags.length > 0 ? (
            <ul className="space-y-0.5">
              {record.flags.map((flag) => (
                <li key={flag}>
                  {flagLabel(flag)} <span className="font-mono text-[0.875rem] text-muted">({flag})</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted">None</span>
          )}
        </Row>
      </dl>
      {record.assets && record.assets.length > 0 ? <Assets moduleId={record.module} names={record.assets} /> : null}
    </>
  );
}

function Assets({ moduleId, names }: { moduleId: string; names: string[] }) {
  return (
    <section aria-labelledby="panel-assets">
      <h3 id="panel-assets" className="mb-2 font-semibold">
        What shows this number
      </h3>
      <ul className="space-y-4">
        {names.map((name) => {
          const url = moduleFileUrl(moduleId, name);
          const kind = assetKind(name);
          return (
            <li key={name}>
              {kind === "image" ? (
                // A file served as is by the backend: next/image would need its size and a loader.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={`File ${name} of this analysis`} className="max-h-80 w-auto max-w-full border border-rule" />
              ) : kind === "video" ? (
                <video src={url} controls preload="metadata" className="max-h-80 w-full border border-rule bg-ink">
                  <a href={url}>Download the clip {name}</a>
                </video>
              ) : null}
              <a href={url} className="mt-1 inline-block break-all font-mono text-[0.875rem]">
                {name}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FindingBody({ finding, status }: { finding: Finding; status: "example" | "built" | undefined }) {
  const ids = finding.evidence_ids ?? [];
  return (
    <>
      <p className="max-w-[60ch] text-[1.0625rem] leading-relaxed">{finding.text}</p>
      <dl className="border-t border-rule text-[0.9375rem]">
        <Row label="Value">
          <span className="font-semibold tabular-nums">{formatValue(finding.value, finding.unit)}</span>
        </Row>
        <Row label="Tests or samples">
          <span className="tabular-nums">n = {finding.n.toLocaleString("en-US")}</span>
        </Row>
        <Row label="How it was obtained">
          <Provenance tag={finding.provenance} />
        </Row>
        {finding.kind === "check" ? (
          <Row label="Check">
            <VerdictMark verdict={checkVerdict(finding.passed, status, finding)} />
          </Row>
        ) : null}
        <SourceRow source={finding.source} />
      </dl>
      <LinkedEvidence moduleId={finding.module} ids={ids} />
    </>
  );
}

function LinkedEvidence({ moduleId, ids }: { moduleId: string; ids: string[] }) {
  const evidence = useApi<Evidence[]>(ids.length > 0 ? `/modules/${encodeURIComponent(moduleId)}/evidence` : null);
  return (
    <section aria-labelledby="panel-linked">
      <h3 id="panel-linked" className="mb-2 font-semibold">
        Evidence records it rests on
      </h3>
      {ids.length === 0 ? (
        <p className="text-muted">This finding lists no evidence record.</p>
      ) : evidence.status === "loading" ? (
        <p className="text-muted" role="status">
          Loading the evidence records…
        </p>
      ) : evidence.status === "error" ? (
        <p className="text-muted">
          The evidence records cannot be loaded right now ({evidence.error.message}).{" "}
          <button type="button" onClick={evidence.retry} className="btn btn-secondary mt-2">
            Try again
          </button>
        </p>
      ) : (
        <ul className="border-t border-rule text-[0.9375rem]">
          {ids.map((id) => {
            const record = evidence.data.find((item) => item.id === id);
            return (
              <li key={id} className="border-b border-rule py-2">
                {record ? (
                  <>
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <TestId testId={record.test_id} />
                      <span>{quantityLabel(record.quantity)}</span>
                      {record.segment ? <span className="text-muted">({record.segment})</span> : null}
                      <span className="font-medium tabular-nums">{formatValue(record.value, record.unit)}</span>
                      <ProvenanceBadge tag={record.provenance} />
                    </p>
                    <p className="text-[0.875rem] text-muted">
                      <span className="font-mono">{record.source.psi_id}</span>, <span className="break-all font-mono">{record.source.file}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-muted">
                    Record <span className="font-mono">{id}</span> is not in this analysis&apos;s evidence.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
