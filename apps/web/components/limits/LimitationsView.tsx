"use client";

// The Limitations page (DOB-128): the one place that states what the data cannot tell. Three
// sections, one shown at a time: the site's own lines (components/limits/siteLimits.ts, sourced to
// the challenge page and docs/ARCHITECTURE.md), each analysis's `cannot_tell` (its module.json) and
// each investigation's own lines (the catalog record). The lines of the analyses and of the
// investigations are shown word for word.
// Other pages link here by id: /limitations#PSI-69 opens Investigations at that row,
// /limitations#video-to-data opens Analyses at that block.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { AppLink } from "@/components/AppLink";
import { Loading, Unreachable } from "@/components/LoadStates";
import { CARD } from "@/components/ui/Card";
import { SectionNav, type SectionItem } from "@/components/ui/SectionNav";
import { useApi } from "@/lib/api";
import { NAV, STAGE_HREF } from "@/lib/nav";
import type { EngineModule, InvestigationDetail, InvestigationList, InvestigationSummary, ModuleSummary } from "@/lib/types";
import { CANNOT_TELL, LINES_SHOWN, limitAnchor, matchesInvestigation, shownLines } from "./siteLimits";

const LINE = "text-[16px] leading-[25px] text-ink";
const META = "text-[14px] leading-[21px] text-ink-2";

export function LimitationsView() {
  const modules = useApi<ModuleSummary[]>("/modules");
  const catalog = useApi<InvestigationList>("/catalog/investigations");
  const marked = useHashName();

  const analyses = modules.status === "ok" ? modules.data.filter((row) => row.status !== "not_built" && !row.id.startsWith("_")) : [];
  const investigations = catalog.status === "ok" ? catalog.data.items : [];

  const sections: SectionItem[] = [
    { id: "site", label: "Whole site", count: CANNOT_TELL.length, content: <SiteLimits /> },
    {
      id: "analyses",
      label: "Analyses",
      count: modules.status === "ok" ? analyses.length : null,
      aliases: analyses.map((row) => row.id),
      content:
        modules.status === "loading" ? (
          <Loading label="Loading the analyses…" rows={2} />
        ) : modules.status === "error" ? (
          <Unreachable error={modules.error} onRetry={modules.retry} what="the analyses" />
        ) : (
          <AnalysesLimits rows={analyses} marked={marked} />
        ),
    },
    {
      id: "investigations",
      label: "Investigations",
      count: catalog.status === "ok" ? investigations.length : null,
      aliases: investigations.map((item) => item.psi_id),
      content:
        catalog.status === "loading" ? (
          <Loading label="Loading the investigations…" rows={3} />
        ) : catalog.status === "error" ? (
          <Unreachable error={catalog.error} onRetry={catalog.retry} what="the investigations" />
        ) : (
          <InvestigationLimits items={investigations} marked={marked} />
        ),
    },
  ];

  return (
    <div className="mx-auto grid w-full max-w-[84rem] gap-6">
      <header>
        <h2 className="font-display text-[26px] leading-[32px] font-semibold tracking-[-0.02em] text-ink">What the data cannot tell</h2>
        <p className="mt-1.5 max-w-[64ch] text-[17px] leading-[26px] text-ink-2">
          Every limit we know of, stated in the open: for the whole site, each analysis and each NASA investigation, with
          its source. Where the evidence stops is part of the answer.
        </p>
      </header>

      <SectionNav sections={sections} label="Sections of the limits" />

      <p className={META}>
        <AppLink href="/about#about-numbers">How each number was obtained</AppLink>
      </p>
    </div>
  );
}

/** The name in the address fragment (#PSI-69 gives "PSI-69"), kept current as the fragment changes. */
function useHashName(): string {
  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => "",
  );
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return "";
  }
}

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * Brings the marked block to the top of the view, and again each time a block finishes loading
 * (the ones above it grow), until the visitor scrolls, clicks or types.
 */
function useScrollToMarked<T extends HTMLElement>(marked: string | null, settled: number): RefObject<T | null> {
  const target = useRef<T | null>(null);
  const following = useRef(true);
  useEffect(() => {
    following.current = true;
  }, [marked]);
  useEffect(() => {
    const stop = () => {
      following.current = false;
    };
    const events = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
    for (const name of events) window.addEventListener(name, stop, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, stop);
    };
  }, []);
  useEffect(() => {
    if (marked && following.current) target.current?.scrollIntoView({ block: "start" });
  }, [marked, settled]);
  return target;
}

/** Counts the blocks that finished loading: `settle` is called once by each of them. */
function useSettled(): [number, () => void] {
  const [settled, setSettled] = useState(0);
  const settle = useCallback(() => setSettled((count) => count + 1), []);
  return [settled, settle];
}

function SiteLimits() {
  return (
    <ul className="grid gap-4 md:grid-cols-2" data-testid="limits-site">
      {CANNOT_TELL.map((line) => (
        <li key={line.text} className={`${CARD} p-5 sm:p-6`}>
          <p className="text-[17px] leading-[26px] text-ink">{line.text}</p>
          <p className={`mt-3 ${META}`}>Source: {line.source}</p>
        </li>
      ))}
    </ul>
  );
}

function AnalysesLimits({ rows, marked }: { rows: readonly ModuleSummary[]; marked: string }) {
  const target = rows.some((row) => row.id === marked) ? marked : null;
  const [settled, settle] = useSettled();
  const markRef = useScrollToMarked<HTMLElement>(target, settled);
  if (rows.length === 0) return <p className={META}>No analysis is published yet.</p>;
  return (
    <div className="grid gap-4" data-testid="limits-analyses">
      {rows.map((row) => (
        <AnalysisLimits key={row.id} row={row} marked={row.id === target} markRef={markRef} onSettled={settle} />
      ))}
    </div>
  );
}

function AnalysisLimits({
  row,
  marked,
  markRef,
  onSettled,
}: {
  row: ModuleSummary;
  marked: boolean;
  markRef: RefObject<HTMLElement | null>;
  onSettled: () => void;
}) {
  const engine = useApi<EngineModule>(`/modules/${encodeURIComponent(row.id)}`);
  // A visitor sent here from the analysis's page sees its whole list, until they fold it.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const all = chosen ?? marked;
  const done = engine.status !== "loading";
  useEffect(() => {
    if (done) onSettled();
  }, [done, onSettled]);

  const stage = engine.status === "ok" ? engine.data.stage : row.stage;
  const href = stage ? STAGE_HREF[stage] : null;
  const title = engine.status === "ok" ? engine.data.title : (row.title ?? row.id);
  // The name the visitor knows: the analysis's page in the sidebar.
  const page = NAV.find((entry) => entry.href === href)?.label ?? title;
  const lines = engine.status === "ok" ? engine.data.cannot_tell : [];
  const shown = shownLines(lines, all);

  return (
    <article
      ref={marked ? markRef : undefined}
      id={limitAnchor(row.id)}
      aria-current={marked ? "true" : undefined}
      data-testid="limits-analysis"
      className={`${CARD} scroll-mt-4 p-5 sm:p-6 ${marked ? "outline-2 -outline-offset-1 outline-brand" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-[20px] leading-[28px] font-semibold text-ink">{page}</h3>
        {href ? <AppLink href={href}>Open the analysis</AppLink> : null}
      </div>
      {page.toLowerCase() !== title.toLowerCase() ? <p className={META}>Analysis: {title}</p> : null}

      {engine.status === "loading" ? (
        <p role="status" className={`mt-3 ${META}`}>Loading…</p>
      ) : engine.status === "error" ? (
        <p className={`mt-3 ${META}`}>
          Not available right now.{" "}
          <button type="button" onClick={engine.retry} className="cursor-pointer text-brand underline underline-offset-[3px]">
            Try again
          </button>
        </p>
      ) : lines.length === 0 ? (
        <p className={`mt-3 ${META}`}>The analysis states no limit.</p>
      ) : (
        <>
          <ul className={`mt-3 max-w-[78ch] list-disc space-y-2 pl-5 marker:text-ink-3 ${LINE}`}>
            {shown.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {lines.length > LINES_SHOWN ? (
            <button type="button" aria-expanded={all} onClick={() => setChosen(!all)} className="btn btn-secondary mt-4">
              {all ? "Show fewer" : `Show all ${lines.length}`}
            </button>
          ) : null}
          <p className={`mt-4 ${META}`}>
            Source: <code className="font-mono">module.json</code> of <span className="font-mono">{row.id}</span>
          </p>
        </>
      )}
    </article>
  );
}

function InvestigationLimits({ items, marked }: { items: readonly InvestigationSummary[]; marked: string }) {
  const target = items.some((item) => item.psi_id === marked) ? marked : null;
  const [query, setQuery] = useState("");
  const [settled, settle] = useSettled();
  const markRef = useScrollToMarked<HTMLLIElement>(target, settled);
  const shown = items.filter((item) => matchesInvestigation(item, query));

  return (
    <section aria-label="Limits of each investigation" className={`${CARD} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="grid w-full max-w-[26rem] gap-1.5">
          <span className={META}>Search by PSI ID, acronym or title</span>
          <input
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-testid="limits-search"
            className="h-11 w-full px-3 text-[16px]"
          />
        </label>
        <p role="status" className={`pb-2.5 ${META}`} data-testid="limits-count">
          {shown.length} of {items.length} investigations
        </p>
      </div>

      {shown.length === 0 ? (
        <p className={`mt-5 ${LINE}`}>No investigation matches this search.</p>
      ) : (
        <ul className="mt-4" data-testid="limits-investigations">
          {shown.map((item) => (
            <InvestigationLine key={item.psi_id} item={item} marked={item.psi_id === target} markRef={markRef} onSettled={settle} />
          ))}
        </ul>
      )}
    </section>
  );
}

function InvestigationLine({
  item,
  marked,
  markRef,
  onSettled,
}: {
  item: InvestigationSummary;
  marked: boolean;
  markRef: RefObject<HTMLLIElement | null>;
  onSettled: () => void;
}) {
  const detail = useApi<InvestigationDetail>(`/catalog/investigations/${encodeURIComponent(item.psi_id)}`);
  const done = detail.status !== "loading";
  useEffect(() => {
    if (done) onSettled();
  }, [done, onSettled]);
  const lines = detail.status === "ok" ? detail.data.cannot_tell : [];

  return (
    <li
      ref={marked ? markRef : undefined}
      id={limitAnchor(item.psi_id)}
      aria-current={marked ? "true" : undefined}
      data-testid="limits-investigation"
      className={`group relative -mx-3 grid scroll-mt-4 gap-x-4 gap-y-1 border-t border-line px-3 py-4 transition-colors duration-150 sm:grid-cols-[6.5rem_minmax(0,1fr)] ${
        marked ? "bg-brand-soft" : "hover:bg-brand-soft/50"
      }`}
    >
      {/* The whole card opens the investigation (DOB-155): the one link is stretched over it, as in the Investigations list. */}
      <AppLink
        href={`/investigations/${encodeURIComponent(item.psi_id)}`}
        className="font-mono text-[15px] leading-[25px] after:absolute after:inset-0 after:content-['']"
      >
        {item.psi_id}
      </AppLink>
      <div className="min-w-0">
        <p className="text-[16px] leading-[25px] font-semibold text-ink">
          {item.acronym ?? item.title}
          {item.acronym ? <span className="ml-2 text-[14px] font-normal text-ink-2">{item.title}</span> : null}
        </p>
        {detail.status === "loading" ? (
          <p role="status" className={`mt-1 ${META}`}>Loading…</p>
        ) : detail.status === "error" ? (
          <p className={`mt-1 ${META}`}>Not available right now.</p>
        ) : lines.length ? (
          lines.map((line) => (
            <p key={line} className={`mt-1 max-w-[78ch] ${LINE}`}>
              {line}
            </p>
          ))
        ) : (
          <p className={`mt-1 ${META}`}>The record states no limit.</p>
        )}
      </div>
    </li>
  );
}
