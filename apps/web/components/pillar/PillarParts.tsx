"use client";

// The visual parts of the pillar page (PillarPage.tsx): the page header, the analysis's own
// description, the answer cards, the check rows and the cabin-air meter. They only lay out what the analysis already hands over
// (module.json, findings.json, evidence.json, /air/coverage): no number is computed here except a
// share drawn as a bar, and every bar prints the two numbers it is drawn from.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import { EvidenceNumber } from "@/components/evidence/EvidenceNumber";
import { VerdictMark } from "@/components/evidence/Markers";
import { ProvenanceBadge } from "@/components/evidence/ProvenanceBadge";
import { SourceNote } from "@/components/SourceNote";
import { useApi } from "@/lib/api";
import { formatValue, moduleFileUrl } from "@/lib/evidence";
import { formatCount, plural } from "@/lib/format";
import { checkVerdict, testCount } from "@/lib/pillar";
import type { EngineModule, Evidence, Finding, InvestigationList, StageCoverage } from "@/lib/types";
import { leadClause, pickStill, shareOf, splitSentences, testIdOfFile } from "./layout";

/** True once the element has been on screen: the bars fill then, once (reduced motion: at once). */
function useSeen<T extends Element>() {
  const ref = useRef<T | null>(null);
  // Without IntersectionObserver (old browsers, tests) the bars start full.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);
  return { ref, seen };
}

/** A share as a bar, with both numbers printed beside it. tone: brand (default) or ok. */
export function ShareBar({ part, total, label, tone = "brand" }: { part: number; total: number; label: ReactNode; tone?: "brand" | "ok" }) {
  const { ref, seen } = useSeen<HTMLDivElement>();
  const share = total > 0 ? Math.min(1, Math.max(0, part / total)) : 0;
  return (
    <div ref={ref} className="mt-3" data-testid="share-bar">
      <div
        className="relative h-2 overflow-hidden rounded-full bg-surface-sunk"
        role="img"
        aria-label={`${formatCount(part)} of ${formatCount(total)}`}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] ${tone === "ok" ? "bg-ok" : "bg-brand"}`}
          style={{ width: seen ? `${share * 100}%` : "0%" }}
        />
      </div>
      <p className="mt-1.5 text-[14px] leading-[18px] text-ink-3 tabular-nums">{label}</p>
    </div>
  );
}

// ------------------------------------------------------------------ the page header

/**
 * The compact header of a pillar page: the analysis's question, the first sentence of its summary,
 * a small strip of facts and the link to its limits (they are listed on the Limitations page only).
 */
export function QuestionHeader({
  module: m,
  evidence,
  findings,
}: {
  module: EngineModule;
  evidence: Evidence[] | null;
  findings: Finding[];
}) {
  const catalog = useApi<InvestigationList>("/catalog/investigations");
  const acronym = new Map(catalog.status === "ok" ? catalog.data.items.map((item) => [item.psi_id, item.acronym]) : []);
  const [first] = splitSentences(m.summary);
  const lead = first ? leadClause(first) : null;
  const headlines = findings.filter((finding) => finding.kind === "headline").length;
  const checks = findings.filter((finding) => finding.kind === "check");
  const passed = checks.filter((finding) => finding.passed === true).length;
  const fact = "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1";

  return (
    <header className="mb-5" data-testid="question-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-display text-[26px] leading-[32px] font-semibold tracking-[-0.02em] text-ink">{m.question}</h2>
        <AppLink href={`/limitations#${encodeURIComponent(m.id)}`} className="text-[14px] font-medium" data-testid="limits-link">
          Limits of this analysis
        </AppLink>
      </div>
      {lead ? (
        <p className="mt-2 max-w-[84ch] text-[15px] leading-[24px] text-ink" data-testid="question-summary">
          {lead}
        </p>
      ) : null}
      <dl className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px] leading-[20px]" data-testid="question-facts">
        <div className={fact}>
          <dt className="text-ink-3">NASA data</dt>
          <dd className="flex flex-wrap gap-1.5">
            {m.psi_ids.map((psiId) => (
              <AppLink
                key={psiId}
                href={`/investigations/${encodeURIComponent(psiId)}`}
                className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-1.5 py-0.5 text-ink no-underline hover:border-control"
              >
                <span className="whitespace-nowrap font-mono text-[13px]">{psiId}</span>
                {acronym.get(psiId) ? <span className="text-[14px] text-ink-2">{acronym.get(psiId)}</span> : null}
              </AppLink>
            ))}
          </dd>
        </div>
        <div className={fact}>
          <dt className="text-ink-3">Evidence</dt>
          <dd className="tabular-nums text-ink">
            {evidence ? (
              <>
                {plural(evidence.length, "record")} from {plural(testCount(evidence), "test")}
              </>
            ) : (
              <span className="text-ink-3">loading…</span>
            )}
          </dd>
        </div>
        <div className={fact}>
          <dt className="text-ink-3">Findings</dt>
          <dd className="tabular-nums text-ink">
            {plural(headlines, "answer")}, {plural(checks.length, "check")}, {formatCount(passed)} passed
          </dd>
        </div>
      </dl>
    </header>
  );
}

/**
 * The analysis's own description (the header shows only its opening; here it is whole, unless the
 * header already showed the first sentence in full) and, when the analysis hands one over, its
 * frame of a NASA video. Nothing when there is neither.
 */
export function AboutAnalysis({ module: m, className = "" }: { module: EngineModule; className?: string }) {
  const sentences = splitSentences(m.summary);
  const rest = sentences[0] && leadClause(sentences[0]) !== sentences[0] ? sentences : sentences.slice(1);
  const still = pickStill(m.files);
  if (rest.length === 0 && !still) return null;
  const testId = still ? testIdOfFile(still.name) : null;

  return (
    <div
      className={`grid gap-6 ${still && rest.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]" : ""} ${className}`}
      data-testid="about-analysis"
    >
      {rest.length > 0 ? (
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold text-ink">About this analysis</h3>
          <p className="mt-1.5 max-w-[68ch] text-[15px] leading-[24px] text-ink-2">{rest.join(" ")}</p>
          <div className="mt-2">
            <SourceNote>
              The analysis&apos;s own description, <code className="font-mono">module.json</code> of{" "}
              <span className="font-mono">{m.id}</span>.
            </SourceNote>
          </div>
        </div>
      ) : null}

      {still ? (
        <figure className="min-w-0 max-w-[24rem] self-start" data-testid="question-still">
          <div className="overflow-hidden rounded-md border border-line bg-surface-sunk">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the backend, size unknown ahead */}
            <img
              src={moduleFileUrl(m.id, still.name)}
              alt={`${still.description} Test ${testId ?? still.name}.`}
              className="block h-auto w-full"
              loading="lazy"
              decoding="async"
            />
          </div>
          <figcaption className="mt-2 text-[13px] leading-[18px] text-ink-3">
            {testId ? <span className="font-medium text-ink-2">Test {testId}. </span> : null}
            {still.description} From NASA&apos;s video, drawn on by this analysis.
            <a href={moduleFileUrl(m.id, still.name)} className="mt-0.5 block font-mono [overflow-wrap:anywhere]">
              {still.name}
            </a>
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ answers and checks

/** The display size of a value: short values large, long ones (a unit with words) smaller. */
function valueSize(text: string): string {
  if (text.length <= 12) return "text-[30px] leading-[36px]";
  if (text.length <= 24) return "text-[22px] leading-[28px]";
  return "text-[17px] leading-[24px]";
}

function FindingSource({ finding }: { finding: Finding }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <ProvenanceBadge tag={finding.provenance} />
      <SourceNote>
        <span className="font-mono">{finding.source.psi_id}</span>, <span className="break-all font-mono">{finding.source.file}</span>
      </SourceNote>
    </div>
  );
}

export function AnswerCards({ findings, example }: { findings: Finding[]; example: boolean }) {
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2" data-testid="headlines">
      {findings.map((finding) => {
        const share = shareOf(finding);
        const text = formatValue(finding.value, finding.unit);
        return (
          <li key={finding.id} data-testid="headline" className="flex min-w-0 flex-col rounded-md border border-line bg-surface p-4 sm:p-5">
            <p className={`font-display font-semibold tracking-[-0.02em] [overflow-wrap:anywhere] [&_span]:whitespace-normal ${valueSize(text)}`}>
              <EvidenceNumber record={finding} example={example} />
            </p>
            {share ? (
              <ShareBar
                part={share.part}
                total={share.total}
                label={
                  <>
                    {formatCount(share.part)} of <span data-testid="finding-n">n = {formatCount(share.total)}</span> tests or samples
                  </>
                }
              />
            ) : (
              <p className="mt-1 text-[14px] text-ink-3 tabular-nums">
                from <span data-testid="finding-n">n = {formatCount(finding.n)}</span> tests or samples
              </p>
            )}
            <p className="mt-3 text-[15px] leading-[24px] text-ink">{finding.text}</p>
            <div className="mt-auto">
              <FindingSource finding={finding} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CheckRows({ findings, example, status }: { findings: Finding[]; example: boolean; status: EngineModule["status"] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-md border border-line" data-testid="checks">
      {findings.map((finding) => (
        <li
          key={finding.id}
          data-testid="check"
          className="grid gap-x-5 gap-y-2 p-4 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-start sm:px-5"
        >
          <div className="sm:pt-0.5">
            <VerdictMark verdict={checkVerdict(finding.passed, status, finding)} />
          </div>
          <div className="min-w-0">
            <p className="max-w-[72ch] text-[15px] leading-[24px] text-ink">{finding.text}</p>
            <FindingSource finding={finding} />
          </div>
          <div className="text-[15px] sm:max-w-[16rem] sm:text-right">
            <p className="font-display text-[18px] leading-[24px] font-semibold [overflow-wrap:anywhere] [&_span]:whitespace-normal">
              <EvidenceNumber record={finding} example={example} />
            </p>
            <p className="mt-0.5 text-[14px] text-ink-3 tabular-nums">n = {formatCount(finding.n)} tests or samples</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ cabin air

/** The stage's tests inside the chosen air, as a bar, when the tables state oxygen and pressure. */
export function CoverageMeter({ coverage }: { coverage: StageCoverage }) {
  if (coverage.status !== "tested" && coverage.status !== "never_tested") return null;
  const inside = coverage.inside ?? 0;
  return (
    <div className="max-w-[34rem]" data-testid="air-coverage-meter">
      <p className="font-display text-[30px] leading-[36px] font-semibold tracking-[-0.02em] tabular-nums">
        {formatCount(inside)}
        <span className="ml-1.5 font-sans text-[15px] font-normal tracking-normal text-ink-2">of {plural(coverage.stated, "test")}</span>
      </p>
      <ShareBar
        part={inside}
        total={coverage.stated}
        tone="ok"
        label={<>ran inside this air, of the tests whose table states oxygen and pressure</>}
      />
    </div>
  );
}
