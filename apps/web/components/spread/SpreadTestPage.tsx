"use client";

// One test of the Video to Data page on its own page: /spread/B1 (DOB-156). It loads what the
// list loads (the analysis, its evidence, the engine's index and NASA's table of the series),
// finds the test by its label and shows the same detail the list used to open in place:
// TestDetail for a measured test, TSeriesDetail or GradePanel for a graded T-series test.
// A link at the top returns to the list; the browser's Back button does the same.
import { useEffect, type ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import { Loading, Notice, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import { CARD } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { useApi } from "@/lib/api";
import { chooseEngine } from "@/lib/pillar";
import {
  canOpen,
  gradeWord,
  joinTests,
  namesRow,
  parseCatalogTests,
  parseIndex,
  rememberOpenedTest,
  SERIES_PSI_ID,
  SERIES_TESTS_PATH,
  SPREAD_LIST_HREF,
  STATUS_WORDS,
  type SeriesRow,
} from "@/lib/spread";
import type { EngineModule, Evidence, ModuleSummary } from "@/lib/types";
import { STATUS_TONE } from "./SpreadView";
import { TestDetail } from "./TestDetail";
import { GradePanel } from "./TSeries";
import { TSeriesDetail } from "./TSeriesDetail";

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[76rem]" data-testid="spread-test-page">
      <AppLink
        href={SPREAD_LIST_HREF}
        data-testid="spread-back"
        className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium no-underline hover:underline"
      >
        <Icon name="arrow-right" size="sm" className="rotate-180" />
        Video to Data
      </AppLink>
      {children}
    </div>
  );
}

export function SpreadTestPage({ name }: { name: string }) {
  const modules = useApi<ModuleSummary[]>("/modules");
  if (modules.status === "loading") {
    return (
      <Frame>
        <Loading label="Loading the test…" rows={3} />
      </Frame>
    );
  }
  if (modules.status === "error") {
    return (
      <Frame>
        <Unreachable error={modules.error} onRetry={modules.retry} what="this test" />
      </Frame>
    );
  }
  const chosen = chooseEngine(modules.data, "spread");
  if (!chosen || chosen.status === "not_built") {
    return (
      <Frame>
        <Notice title="This analysis is not built yet" testId="not-built">
          <p>This analysis has not handed over its results yet.</p>
        </Notice>
      </Frame>
    );
  }
  return <Loaded id={chosen.id} name={name} />;
}

function Loaded({ id, name }: { id: string; name: string }) {
  const base = `/modules/${encodeURIComponent(id)}`;
  const engine = useApi<EngineModule>(base);
  const evidence = useApi<Evidence[]>(`${base}/evidence`);
  const raw = useApi<unknown>(`${base}/files/index.json`);
  const table = useApi<unknown>(SERIES_TESTS_PATH);

  if (engine.status === "loading" || evidence.status === "loading" || raw.status === "loading" || table.status === "loading") {
    return (
      <Frame>
        <Loading label="Loading the test…" rows={3} />
      </Frame>
    );
  }
  const failed = engine.status === "error" ? engine : evidence.status === "error" ? evidence : raw.status === "error" ? raw : null;
  if (failed) {
    return (
      <Frame>
        <Unreachable
          error={failed.error}
          onRetry={() => {
            engine.retry();
            evidence.retry();
            raw.retry();
          }}
          what="this test"
        />
      </Frame>
    );
  }
  // The three answers are in: the narrowing below is for the type checker.
  if (engine.status !== "ok" || evidence.status !== "ok" || raw.status !== "ok") return null;

  const index = parseIndex(raw.data);
  if (!index) {
    return (
      <Frame>
        <Notice title="The engine's index of tests did not load" testId="spread-test-none">
          <p>
            <AppLink href={SPREAD_LIST_HREF}>Back to the list of tests</AppLink>
          </p>
        </Notice>
      </Frame>
    );
  }
  // NASA's table adds the material and the oxygen; without it the index still names the test.
  const catalog = table.status === "ok" ? parseCatalogTests(table.data) : null;
  const { rows } = joinTests(catalog?.items ?? [], index);
  const row = rows.find((item) => namesRow(item, name)) ?? null;
  if (!row || !canOpen(row)) {
    return (
      <Frame>
        <Notice title={row ? `Test ${row.label}: ${STATUS_WORDS[row.status].toLowerCase()}` : `No test is named ${name}`} testId="spread-test-none">
          <p>{row ? (row.reason ?? "This test has no video-derived numbers to show.") : `NASA's BASS-II table (${SERIES_PSI_ID}) and the engine's index list no test with this name.`}</p>
          <p>
            <AppLink href={SPREAD_LIST_HREF}>Back to the list of tests</AppLink>
          </p>
        </Notice>
      </Frame>
    );
  }

  const saved = [engine.source, evidence.source, raw.source].includes("saved");
  const example = engine.data.status === "example";
  return (
    <Frame>
      {saved ? <SavedCopyNote source="saved" savedAt={raw.savedAt ?? engine.savedAt} /> : null}
      <Head row={row} />
      {/* The page's heading already names the test: the detail's own "Test B1" line stays for screen readers only. */}
      <div className={`${CARD} mt-3 px-4 pb-6 pt-5 sm:px-5 [&_article>h3:first-child]:sr-only [&_article>h3:first-child+*]:mt-0`}>
        {row.test ? <TestDetail moduleId={id} test={row.test} index={index} evidence={evidence.data} example={example} /> : null}
        {row.outcome ? (
          <div className={row.test ? "mt-8" : ""}>
            {row.outcome.clip ? (
              <TSeriesDetail moduleId={id} row={row.outcome} tSeries={index.t_series} evidence={evidence.data} example={example} />
            ) : (
              <GradePanel row={row.outcome} evidence={evidence.data} example={example} />
            )}
          </div>
        ) : null}
      </div>
    </Frame>
  );
}

/** What the list's row says about the test: material, oxygen, the video file and the status. */
function Head({ row }: { row: SeriesRow }) {
  // The list scrolls back to this test when the visitor returns to it.
  useEffect(() => rememberOpenedTest(row.label), [row.label]);
  return (
    <div data-testid="spread-test-head" data-status={row.status} className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <h2 className="font-display text-[26px] leading-[32px] font-semibold tracking-[-0.02em]">
        Test <span className="font-mono">{row.label}</span>
      </h2>
      <StatusPill tone={STATUS_TONE[row.status]} data-testid="spread-status">
        {STATUS_WORDS[row.status]}
      </StatusPill>
      <p className="basis-full text-[15px] leading-[23px] text-ink-2">
        NASA BASS-II ({SERIES_PSI_ID}). Material: {row.material ?? "not stated"}. Oxygen: {row.oxygen_pct ?? "not stated"}
        {row.oxygen_pct === null || row.oxygen_pct === undefined ? "" : " %"}.
        {row.video_file ? (
          <>
            {" "}
            Video: <span className="font-mono text-[13px] text-ink [overflow-wrap:anywhere]">{row.video_file}</span>.
          </>
        ) : null}
        {row.outcome?.checked?.grade ? ` Checked by a person: ${gradeWord(row.outcome.checked.grade)}.` : ""}
      </p>
    </div>
  );
}
