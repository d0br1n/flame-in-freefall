"use client";

// The investigations list with its filter rail. The filter state lives in the URL
// (lib/filters.ts); the list is filtered in the browser from GET /catalog/investigations.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loading, Notice, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import { useApi } from "@/lib/api";
import {
  FACETS,
  activeCount,
  applyFilters,
  emptyFilters,
  facetOptions,
  parseFilters,
  serializeFilters,
  toggleFilter,
  type FacetKey,
  type Filters,
} from "@/lib/filters";
import type { InvestigationList, InvestigationSummary } from "@/lib/types";
import { InvestigationRow } from "./InvestigationRow";

export function InvestigationsBrowser() {
  const list = useApi<InvestigationList>("/catalog/investigations");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlQuery = searchParams.toString();

  // The URL is the source of truth, but the router updates it asynchronously: keep the visitor's
  // choice locally so a checkbox ticks at once, and re-read the URL whenever it changes
  // (back button, a shared link).
  const [local, setLocal] = useState(() => ({ query: urlQuery, filters: parseFilters(urlQuery) }));
  let filters = local.filters;
  if (local.query !== urlQuery) {
    filters = parseFilters(urlQuery);
    setLocal({ query: urlQuery, filters });
  }

  function setFilters(next: Filters) {
    setLocal({ query: urlQuery, filters: next });
    const query = serializeFilters(next, urlQuery);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  if (list.status === "loading") return <Loading label="Loading the investigations…" rows={6} />;
  if (list.status === "error") return <Unreachable error={list.error} onRetry={list.retry} what="the list of investigations" />;

  return (
    <>
      <SavedCopyNote source={list.source} savedAt={list.savedAt} />
      <Browser
        items={list.data.items}
        total={list.data.count}
        filters={filters}
        onToggle={(facet, value) => setFilters(toggleFilter(filters, facet, value))}
        onClear={() => setFilters(emptyFilters())}
      />
    </>
  );
}

function Browser({
  items,
  total,
  filters,
  onToggle,
  onClear,
}: {
  items: InvestigationSummary[];
  total: number;
  filters: Filters;
  onToggle: (facet: FacetKey, value: string) => void;
  onClear: () => void;
}) {
  const [railOpen, setRailOpen] = useState(false);
  const shown = applyFilters(items, filters);
  const chosen = activeCount(filters);

  return (
    <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[minmax(0,3fr)_minmax(0,9fr)]">
      <div>
        <button
          type="button"
          aria-expanded={railOpen}
          aria-controls="filter-rail"
          onClick={() => setRailOpen((open) => !open)}
          className="btn btn-secondary w-full justify-start md:hidden"
        >
          Filters
          {chosen > 0 ? ` (${chosen} chosen)` : ""}
        </button>
        <div
          id="filter-rail"
          className={`${railOpen ? "block" : "hidden"} mt-2 rounded-md bg-wash px-3 py-4 md:mt-0 md:block`}
        >
          <h2 className="sr-only md:not-sr-only md:mb-4 md:block md:px-2 md:text-[1rem] md:font-semibold">Filters</h2>
          <div className="space-y-6">
            {FACETS.map(({ key, label }) => (
              <fieldset key={key}>
                <legend className="mb-1 px-2 text-[0.875rem] font-semibold">{label}</legend>
                <ul>
                  {facetOptions(items, filters, key).map((option) => {
                    const checked = filters[key].includes(option.value);
                    const disabled = !checked && option.count === 0;
                    const id = `filter-${key}-${option.value}`;
                    return (
                      <li key={option.value}>
                        <label
                          htmlFor={id}
                          className={`flex min-h-11 items-center gap-2.5 rounded-sm px-2 py-1 text-[0.875rem] transition-colors duration-150 ${
                            disabled ? "cursor-not-allowed text-ink-3" : "cursor-pointer hover:bg-accent-wash"
                          } ${checked ? "bg-accent-wash font-medium" : ""}`}
                        >
                          <input
                            id={id}
                            type="checkbox"
                            className="shrink-0"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => onToggle(key, option.value)}
                            data-facet={key}
                            data-value={option.value}
                          />
                          <span className="flex-1 leading-snug">{option.label}</span>
                          <span className="tabular-nums text-ink-2">{option.count}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
        </div>
      </div>

      <section aria-label="Investigations">
        {/* Sticky under the top bar. It is 8 px wider than the list on each side and opaque, so no
            row edge shows beside or behind it. It stays in the flow, so the first row starts below it. */}
        <div className="sticky top-0 z-10 -mx-2 flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-2 py-1.5">
          <p aria-live="polite" data-testid="result-count" className="font-medium tabular-nums">
            {shown.length} of {total} investigations
          </p>
          {chosen > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="btn btn-secondary"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {shown.length === 0 ? (
          <Notice title="No investigation matches these filters" testId="no-results">
            <p>Remove a filter or clear them all.</p>
            <button
              type="button"
              onClick={onClear}
              className="btn btn-primary"
            >
              Clear filters
            </button>
          </Notice>
        ) : (
          <ul className="mt-4 overflow-hidden rounded-md border border-rule bg-card">
            {shown.map((item) => (
              <InvestigationRow key={item.psi_id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
