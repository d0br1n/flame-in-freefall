"use client";

// The pillar page template (DOB-74): one layout shows any analysis folder that passes the
// contract, with no code written for that analysis. The analysis for a stage is found from
// GET /modules (lib/pillar.ts chooseEngine); every value on the page comes from its module.json,
// evidence.json and findings.json, served by the backend. A compact header (the question, one
// sentence, the facts, the link to the analysis's limits), then a list of sections with one shown
// at a time (DOB-127): the analysis's own views, its findings and cabin air, its evidence, its
// checks and sources. What the data cannot tell is listed on the Limitations page only (DOB-120).
import { Suspense, useState, type ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import { EvidenceNumber } from "@/components/evidence/EvidenceNumber";
import { TestId } from "@/components/evidence/EvidencePanel";
import { ExampleCallout } from "@/components/evidence/Markers";
import { ProvenanceBadge } from "@/components/evidence/ProvenanceBadge";
import { Loading, Notice, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import { AirSourceNote, MarginRow, SourceNote } from "@/components/SourceNote";
import { useStageCoverage } from "@/lib/air";
import { useApi } from "@/lib/api";
import { flagLabel, formatNumber, moduleFileUrl, quantityLabel, unitText } from "@/lib/evidence";
import { formatCount, plural } from "@/lib/format";
import { airName, chooseEngine, coverageSentence, sortEvidence, stageLabel, testCount } from "@/lib/pillar";
import type { EngineModule, Evidence, Finding, InvestigationList, ModuleSummary, Stage } from "@/lib/types";
import { CARD } from "@/components/ui/Card";
import { SectionNav, type SectionItem } from "@/components/ui/SectionNav";
import * as views from "./mainViews";
import { AboutAnalysis, AnswerCards, CheckRows, CoverageMeter, QuestionHeader } from "./PillarParts";

const { MAIN_VIEWS, MAIN_SECTION, LEAD_SECTIONS } = views;

const PAGE_ROWS = 50;
const FIRST_FILES = 10;

/** The accessible name of a stage's section list, where the page name does not read well in it. */
const NAV_LABEL: Partial<Record<Stage, string>> = { suppress: "Sections of the test bench" };

function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[76rem]">{children}</div>;
}

/** The page's h1 is the section name in the top bar; this is the analysis's question, below it. */
function Title({ children }: { children: ReactNode }) {
  return <h2 className="max-w-[40ch] font-display text-[26px] leading-[32px] font-semibold tracking-[-0.02em]">{children}</h2>;
}

export function PillarPage({ stage }: { stage: Stage }) {
  const modules = useApi<ModuleSummary[]>("/modules");
  const label = stageLabel(stage);

  if (modules.status === "loading") {
    return (
      <Page>
        <Title>{label}</Title>
        <Loading label="Loading this analysis…" rows={4} />
      </Page>
    );
  }
  if (modules.status === "error") {
    return (
      <Page>
        <Title>{label}</Title>
        <Unreachable error={modules.error} onRetry={modules.retry} what="this analysis" />
      </Page>
    );
  }

  const chosen = chooseEngine(modules.data, stage);
  if (!chosen || chosen.status === "not_built") return <NotBuilt label={label} />;
  return <EngineView id={chosen.id} label={label} stage={stage} listSource={modules.source} listSavedAt={modules.savedAt} />;
}

function NotBuilt({ label }: { label: string }) {
  return (
    <Page>
      <Title>{label}</Title>
      <Notice title="This analysis is not built yet" testId="not-built">
        <p>This analysis has not handed over its results yet.</p>
        <p>
          <AppLink href="/investigations">See the NASA investigations it will read</AppLink>
        </p>
      </Notice>
    </Page>
  );
}

function EngineView({
  id,
  label,
  stage,
  listSource,
  listSavedAt,
}: {
  id: string;
  label: string;
  stage: Stage;
  listSource: "live" | "saved";
  listSavedAt: string | null;
}) {
  const base = `/modules/${encodeURIComponent(id)}`;
  const engine = useApi<EngineModule>(base);
  const findings = useApi<Finding[]>(`${base}/findings`);
  const evidence = useApi<Evidence[]>(`${base}/evidence`);

  if (engine.status === "loading" || findings.status === "loading") {
    return (
      <Page>
        <Title>{label}</Title>
        <Loading label="Loading this analysis…" rows={4} />
      </Page>
    );
  }
  if (engine.status === "error" && engine.error.kind === "not_found") return <NotBuilt label={label} />;
  if (engine.status === "error" || findings.status === "error") {
    const error = engine.status === "error" ? engine.error : findings.status === "error" ? findings.error : null;
    return (
      <Page>
        <Title>{label}</Title>
        {error ? (
          <Unreachable
            error={error}
            onRetry={() => {
              engine.retry();
              findings.retry();
            }}
            what="this analysis"
          />
        ) : null}
      </Page>
    );
  }

  const m = engine.data;
  const example = m.status === "example";
  const headlines = findings.data.filter((finding) => finding.kind === "headline");
  const checks = findings.data.filter((finding) => finding.kind === "check");
  const saved = [listSource, engine.source, findings.source].includes("saved");
  const leadSections = LEAD_SECTIONS[m.id] ?? [];
  // With lead sections the analysis's own view comes first; the evidence section then shows the plain table.
  const MainView = leadSections.length > 0 ? undefined : MAIN_VIEWS[m.id];

  /** A section body that needs the evidence records: its loading and error states, then the body. */
  const withEvidence = (body: (records: Evidence[]) => ReactNode) =>
    evidence.status === "loading" ? (
      <Loading label="Loading the evidence records…" rows={3} />
    ) : evidence.status === "error" ? (
      <Unreachable error={evidence.error} onRetry={evidence.retry} what="the evidence records" />
    ) : (
      body(evidence.data)
    );

  // The section list, from what the template knows about this analysis: its lead sections, its
  // main view, then the three every analysis has. Older fragments (#bench, #answer, #sources)
  // still open the section that now holds their content.
  const sections: SectionItem[] = [
    ...leadSections.map(({ id: sectionId, label: sectionLabel, aliases, View }) => ({
      id: sectionId,
      label: sectionLabel,
      aliases,
      content: <View module={m} findings={findings.data} />,
    })),
    ...(MainView
      ? [
          {
            id: MAIN_SECTION.id,
            label: MAIN_SECTION.label,
            aliases: ["evidence"],
            content: withEvidence((records) => <MainView module={m} evidence={records} findings={findings.data} />),
          },
        ]
      : []),
    {
      id: "findings",
      label: "Findings",
      aliases: ["answer", "air"],
      content: (
        <>
          <Section title="Findings" id="findings-title">
            {headlines.length === 0 ? (
              <p className="text-[15px] text-ink-2">This analysis states no answer yet.</p>
            ) : (
              <AnswerCards findings={headlines} example={example} />
            )}
            <AboutAnalysis module={m} className="mt-6 border-t border-line pt-5" />
          </Section>
          <Section title="In your cabin air" id="air-title">
            <Suspense fallback={<p className="text-[15px] text-ink-2">Loading the cabin air…</p>}>
              <AirCoverage stage={stage} />
            </Suspense>
          </Section>
        </>
      ),
    },
    ...(MainView
      ? []
      : [
          {
            id: "evidence",
            label: "Evidence",
            count: evidence.status === "ok" ? formatCount(evidence.data.length) : null,
            content: (
              <Section title="Evidence" id="evidence-title">
                {withEvidence((records) => (
                  <EvidenceTable records={records} example={example} />
                ))}
              </Section>
            ),
          },
        ]),
    {
      id: "checks",
      label: "Checks and sources",
      aliases: ["sources"],
      content: (
        <>
          <Section title="Checks" id="checks-title">
            {checks.length === 0 ? (
              <p className="text-[15px] text-ink-2">This analysis lists no check yet.</p>
            ) : (
              <CheckRows findings={checks} example={example} status={m.status} />
            )}
          </Section>
          <Sources module={m} />
        </>
      ),
    },
  ];

  return (
    <Page>
      {example ? (
        <div className="mb-6">
          <ExampleCallout />
        </div>
      ) : null}
      {saved ? <SavedCopyNote source="saved" savedAt={engine.savedAt ?? listSavedAt} /> : null}

      <QuestionHeader module={m} evidence={evidence.status === "ok" ? evidence.data : null} findings={findings.data} />

      <SectionNav sections={sections} label={NAV_LABEL[stage] ?? `Sections of ${label}`} />
    </Page>
  );
}

/** One card of a section: its title, then its body. */
function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className={`${CARD} p-5 sm:p-7`}>
      <h2 id={id} className="mb-4 font-display text-[22px] leading-[28px] font-semibold tracking-[-0.015em] text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The generic evidence table: the evidence section of an analysis with no main view of its own. */
export function EvidenceTable({ records, example }: { records: Evidence[]; example: boolean }) {
  const [shown, setShown] = useState(PAGE_ROWS);
  if (records.length === 0) return <p className="text-[15px] text-ink-2">This analysis has no evidence record yet.</p>;
  const sorted = sortEvidence(records);
  const visible = sorted.slice(0, shown);
  const left = sorted.length - visible.length;
  const cell = "border-b border-rule px-3 py-2 align-top";
  return (
    <div>
      <p className="mb-3 text-[15px] leading-[23px] text-ink" data-testid="evidence-count">
        {plural(sorted.length, "record")} from {plural(testCount(sorted), "test")}, grouped by test. Click a value for its source.
      </p>
      <div className="overflow-x-auto bg-card xl:overflow-visible">
        <table data-testid="evidence-table" className="w-full border-collapse bg-card text-[0.9375rem]">
          <thead className="border-b border-line bg-surface-sunk text-left text-[0.875rem]">
            <tr>
              <th scope="col" className={`${cell} font-semibold`}>Test</th>
              <th scope="col" className={`${cell} font-semibold`}>Quantity</th>
              <th scope="col" className={`${cell} font-semibold`}>Part of the test</th>
              <th scope="col" className={`${cell} text-right font-semibold`}>Value</th>
              <th scope="col" className={`${cell} font-semibold`}>Uncertainty</th>
              <th scope="col" className={`${cell} font-semibold`}>How it was obtained</th>
              <th scope="col" className={`${cell} font-semibold`}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((record) => {
              const unit = unitText(record.unit);
              return (
                <tr key={record.id} data-testid="evidence-row" className="transition-colors duration-150 hover:bg-accent-wash">
                  <td className={`${cell} whitespace-nowrap font-mono text-[0.875rem]`}>
                    <TestId testId={record.test_id} />
                  </td>
                  <td className={cell}>{quantityLabel(record.quantity)}</td>
                  <td className={cell}>{record.segment ?? <span className="text-ink-2">whole test</span>}</td>
                  <td className={`${cell} text-right`}>
                    <EvidenceNumber record={record} example={example} />
                  </td>
                  <td className={`${cell} tabular-nums`}>
                    {record.uncertainty ? (
                      `${formatNumber(record.uncertainty.interval[0])} to ${formatNumber(record.uncertainty.interval[1])}${unit ? ` ${unit}` : ""}`
                    ) : (
                      <span className="text-ink-2">not given</span>
                    )}
                  </td>
                  <td className={cell}>
                    <ProvenanceBadge tag={record.provenance} />
                  </td>
                  <td className={cell}>
                    {record.flags.length > 0 ? record.flags.map(flagLabel).join("; ") : <span className="text-ink-2">none</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {left > 0 ? (
        <p className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[14px] text-ink-2">
            Showing {formatCount(visible.length)} of {formatCount(sorted.length)} records.
          </span>
          <button
            type="button"
            onClick={() => setShown((value) => value + PAGE_ROWS)}
            className="btn btn-secondary"
          >
            Show {formatCount(Math.min(PAGE_ROWS, left))} more
          </button>
          <button
            type="button"
            onClick={() => setShown(sorted.length)}
            className="btn btn-secondary"
          >
            Show all {formatCount(sorted.length)}
          </button>
        </p>
      ) : null}
    </div>
  );
}

function AirCoverage({ stage }: { stage: Stage }) {
  const state = useStageCoverage(stage);
  if (state.status === "loading") return <p className="text-[15px] text-ink-2">Loading the cabin air…</p>;
  const sentence = state.status === "ok" ? coverageSentence(state.coverage) : null;
  if (state.status === "error" || sentence === null) {
    return (
      <p className="text-[15px] text-ink-2" data-testid="air-coverage-unavailable">
        Cabin air coverage is not available yet.
        {state.status === "ok" ? ` Chosen cabin air: ${airName(state.air)}.` : ""}
      </p>
    );
  }
  return (
    <MarginRow
      note={
        <div className="space-y-1.5">
          <SourceNote>
            Counted by this site&apos;s data service from the NASA experimental tables, over the tests whose table states what
            the cabin air bounds.
          </SourceNote>
          <AirSourceNote air={state.air} />
        </div>
      }
    >
      <div data-testid="air-coverage" className="max-w-[70ch] text-[15px] leading-[24px] text-ink">
        {state.coverage ? (
          <div className="mb-4">
            <CoverageMeter coverage={state.coverage} />
          </div>
        ) : null}
        <p>
          Chosen cabin air: <span className="font-semibold">{state.air.label}</span> ({state.air.plain}).
        </p>
        <p className="mt-1">{sentence}</p>
        <p className="mt-1 text-[14px] leading-[20px] text-ink-2">{state.air.tolerance_plain}</p>
      </div>
    </MarginRow>
  );
}

function Sources({ module: m }: { module: EngineModule }) {
  const catalog = useApi<InvestigationList>("/catalog/investigations");
  const [allFiles, setAllFiles] = useState(false);
  const byId = new Map(catalog.status === "ok" ? catalog.data.items.map((item) => [item.psi_id, item]) : []);
  const files = allFiles ? m.files : m.files.slice(0, FIRST_FILES);
  const cell = "border-b border-rule px-3 py-2 align-top";
  return (
    <Section title="Where the data comes from" id="sources-title">
      <MarginRow note={<SourceNote>The NASA investigations listed in the analysis&apos;s module.json.</SourceNote>}>
        <h3 className="mb-1.5 text-[16px] font-semibold text-ink">NASA investigations this analysis reads</h3>
        <ul className="max-w-[70ch] space-y-1 text-[15px] leading-[24px]" data-testid="psi-ids">
          {m.psi_ids.map((psiId) => {
            const item = byId.get(psiId);
            return (
              <li key={psiId} className="flex flex-wrap items-baseline gap-x-3">
                <AppLink href={`/investigations/${encodeURIComponent(psiId)}`}>
                  <span className="font-mono text-[0.875rem]">{psiId}</span>
                  {item ? ` ${item.acronym ? `${item.acronym}: ` : ""}${item.title}` : ""}
                </AppLink>
                {item ? (
                  <a href={item.psi_url} target="_blank" rel="noopener noreferrer" className="text-[0.875rem]">
                    Open on psi.nasa.gov<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      </MarginRow>

      <div className="mt-8">
        <h3 className="mb-1.5 text-[16px] font-semibold text-ink">Other files of this analysis</h3>
        {m.files.length === 0 ? (
          <p className="text-[15px] text-ink-2">This analysis lists no other file.</p>
        ) : (
          <>
            <div className="overflow-x-auto bg-card xl:overflow-visible">
              <table className="w-full border-collapse bg-card text-[0.9375rem]" data-testid="module-files">
                <thead className="border-b border-line bg-surface-sunk text-left text-[0.875rem]">
                  <tr>
                    <th scope="col" className={`${cell} font-semibold`}>File</th>
                    <th scope="col" className={`${cell} font-semibold`}>Kind</th>
                    <th scope="col" className={`${cell} font-semibold`}>What it holds</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr key={file.name}>
                      <td className={`${cell} break-all font-mono text-[0.875rem]`}>
                        <a href={moduleFileUrl(m.id, file.name)}>{file.name}</a>
                      </td>
                      <td className={cell}>{file.kind}</td>
                      <td className={cell}>{file.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {m.files.length > FIRST_FILES ? (
              <p className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-[14px] text-ink-2">
                  Showing {formatCount(files.length)} of {formatCount(m.files.length)} files.
                </span>
                <button type="button" onClick={() => setAllFiles((value) => !value)} aria-expanded={allFiles} className="btn btn-secondary">
                  {allFiles ? `Show the first ${FIRST_FILES}` : `Show all ${formatCount(m.files.length)}`}
                </button>
              </p>
            ) : null}
          </>
        )}
      </div>
    </Section>
  );
}
