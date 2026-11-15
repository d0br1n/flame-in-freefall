"use client";

// The Investigations page has two views: the filterable list, and the ranking for the chosen
// cabin air (?sort=rank, linked from the Overview's "Ranked for this air").
import { useSearchParams } from "next/navigation";
import { AirIndependentNote } from "@/components/AirIndependentNote";
import { AppLink } from "@/components/AppLink";
import { InvestigationsBrowser } from "./InvestigationsBrowser";
import { RankingView } from "./RankingView";

const TAB = "inline-flex h-8 items-center rounded-sm px-3 text-[14px] font-semibold no-underline transition-colors duration-150 max-sm:h-10";

export function InvestigationsSections() {
  const searchParams = useSearchParams();
  const ranked = searchParams.get("sort") === "rank";
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Investigations views" className="inline-flex gap-0.5 rounded-md bg-surface-sunk p-[3px]">
          <AppLink
            href="/investigations"
            aria-current={ranked ? undefined : "page"}
            className={`${TAB} ${ranked ? "text-ink-2 hover:text-ink" : "bg-surface text-ink shadow-sm hover:text-ink"}`}
          >
            All investigations
          </AppLink>
          <AppLink
            href="/investigations?sort=rank"
            aria-current={ranked ? "page" : undefined}
            className={`${TAB} ${ranked ? "bg-surface text-ink shadow-sm hover:text-ink" : "text-ink-2 hover:text-ink"}`}
          >
            Ranked for this air
          </AppLink>
        </nav>
        {ranked ? null : <AirIndependentNote />}
      </div>
      {ranked ? (
        <RankingView />
      ) : (
        <>
          <p className="max-w-[70ch] text-[16px] text-ink">
            Every combustion investigation in NASA&apos;s Physical Sciences Informatics (PSI) repository, each with a
            plain-words summary, its files and its part in fire safety. Filter them, or rank them for your cabin air.
          </p>
          <InvestigationsBrowser />
        </>
      )}
    </div>
  );
}
