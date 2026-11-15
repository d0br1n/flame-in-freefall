"use client";

// The filter rail of the tests explorer: facets with the backend's counts, and three ranges.
// Same vocabulary as the Investigations rail (components/investigations/InvestigationsBrowser.tsx).
import { useState, type FormEvent } from "react";
import {
  FACET_SHORT_LIST,
  RANGES,
  TEST_FACETS,
  facetIsLong,
  facetLabel,
  rangeFromInput,
  rangeToInput,
  searchFacetOptions,
  testFacetOptions,
  visibleFacetOptions,
  type RangeKey,
  type TestsQuery,
} from "@/lib/tests";
import type { FacetCount, TestFacetKey } from "@/lib/types";

export function TestsRail({
  query,
  facets,
  chosenCount,
  onToggle,
  onRanges,
}: {
  query: TestsQuery;
  facets: Partial<Record<TestFacetKey, FacetCount[]>>;
  chosenCount: number;
  onToggle: (facet: TestFacetKey, value: string) => void;
  onRanges: (ranges: TestsQuery["ranges"]) => void;
}) {
  const [railOpen, setRailOpen] = useState(false);
  const [expanded, setExpanded] = useState<TestFacetKey[]>([]);
  // What is typed in a long list's search box, per facet. Not in the URL: it only narrows the list.
  const [typed, setTyped] = useState<Partial<Record<TestFacetKey, string>>>({});
  // A new set of ranges in the URL (a link, Clear filters) resets the inputs.
  const rangesKey = JSON.stringify(query.ranges);

  return (
    <div>
      <button
        type="button"
        aria-expanded={railOpen}
        aria-controls="tests-filter-rail"
        onClick={() => setRailOpen((open) => !open)}
        className="btn btn-secondary w-full justify-start md:hidden"
      >
        Filters
        {chosenCount > 0 ? ` (${chosenCount} chosen)` : ""}
      </button>
      <div
        id="tests-filter-rail"
        className={`${railOpen ? "block" : "hidden"} mt-2 rounded-md bg-wash px-3 py-4 md:mt-0 md:block`}
      >
        <h2 className="sr-only md:not-sr-only md:mb-4 md:block md:px-2 md:text-[1rem] md:font-semibold">Filters</h2>
        <div className="space-y-6">
          {TEST_FACETS.map(({ key, label, search }) => {
            const all = testFacetOptions(facets[key], query.facets[key]);
            if (all.length === 0) return null;
            // A list long enough to fold can be searched; the text narrows it and shows every match.
            const searchable = search !== undefined && facetIsLong(all.length);
            const text = searchable ? (typed[key] ?? "") : "";
            const searching = text.trim() !== "";
            const options = searchFacetOptions(all, query.facets[key], text, (option) => facetLabel(key, option));
            // Every investigation stays listed (about twenty); the long value lists fold.
            const isOpen = key === "psi_id" || expanded.includes(key);
            const { shown, hidden } = visibleFacetOptions(options, query.facets[key], isOpen || searching);
            return (
              <fieldset key={key}>
                <legend className="mb-1 px-2 text-[0.875rem] font-semibold">{label}</legend>
                {searchable ? (
                  <div className="mb-1 px-2">
                    <input
                      type="search"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label={search}
                      placeholder={search}
                      value={text}
                      onChange={(event) => setTyped((current) => ({ ...current, [key]: event.target.value }))}
                      data-testid={`facet-search-${key}`}
                      className="h-11 w-full min-w-0 px-2.5 text-[16px]"
                    />
                  </div>
                ) : null}
                {searching && shown.length === 0 ? (
                  <p role="status" data-testid={`facet-none-${key}`} className="px-2 py-2 text-[0.875rem] text-ink-2">
                    Nothing in this list matches.
                  </p>
                ) : null}
                <ul>
                  {shown.map((option) => {
                    const checked = query.facets[key].includes(option.value);
                    const disabled = !checked && option.count === 0;
                    const id = `tests-filter-${key}-${option.value}`;
                    return (
                      <li key={option.value}>
                        <label
                          htmlFor={id}
                          className={`flex min-h-11 items-center gap-2.5 rounded-sm px-2 py-1 text-[0.875rem] transition-colors duration-150 ${
                            disabled ? "cursor-not-allowed text-ink-2" : "cursor-pointer hover:bg-accent-wash"
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
                          <span className="flex-1 leading-snug">{facetLabel(key, option)}</span>
                          <span className="tabular-nums text-ink-2">{option.count.toLocaleString("en-US")}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {!searching && (hidden > 0 || (key !== "psi_id" && isOpen && options.length > FACET_SHORT_LIST + 2)) ? (
                  <button
                    type="button"
                    data-testid={`facet-more-${key}`}
                    aria-expanded={isOpen}
                    onClick={() => setExpanded((list) => (isOpen ? list.filter((item) => item !== key) : [...list, key]))}
                    className="inline-flex min-h-11 items-center rounded-sm px-2 text-[0.875rem] font-medium text-accent underline underline-offset-[3px] hover:text-accent-hover"
                  >
                    {isOpen
                      ? `Show the first ${FACET_SHORT_LIST}`
                      : `Show all ${options.length.toLocaleString("en-US")} (${hidden.toLocaleString("en-US")} more)`}
                  </button>
                ) : null}
              </fieldset>
            );
          })}
          <RangeForm key={rangesKey} ranges={query.ranges} onApply={onRanges} />
        </div>
      </div>
    </div>
  );
}

function RangeForm({ ranges, onApply }: { ranges: TestsQuery["ranges"]; onApply: (ranges: TestsQuery["ranges"]) => void }) {
  const [text, setText] = useState<Record<RangeKey, string>>(() => {
    const out = {} as Record<RangeKey, string>;
    for (const range of RANGES) {
      out[range.min] = rangeToInput(range.name, ranges[range.min]);
      out[range.max] = rangeToInput(range.name, ranges[range.max]);
    }
    return out;
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = { ...ranges };
    for (const range of RANGES) {
      next[range.min] = rangeFromInput(range.name, text[range.min]);
      next[range.max] = rangeFromInput(range.name, text[range.max]);
    }
    onApply(next);
  }

  return (
    <form onSubmit={submit} className="space-y-4 px-2" aria-label="Ranges">
      {RANGES.map((range) => (
        <fieldset key={range.name}>
          <legend className="mb-1.5 text-[0.875rem] font-semibold">
            {range.label} ({range.unit})
          </legend>
          <div className="flex items-center gap-2 text-[0.875rem]">
            {(["min", "max"] as const).map((side) => {
              const key = range[side];
              return (
                <label key={key} htmlFor={`range-${key}`} className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="text-ink-2">{side === "min" ? "From" : "to"}</span>
                  <input
                    id={`range-${key}`}
                    name={key}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={text[key]}
                    onChange={(event) => setText((current) => ({ ...current, [key]: event.target.value }))}
                    aria-label={`${range.label} ${side === "min" ? "from" : "to"}, in ${range.unit === "%" ? "percent" : range.unit}`}
                    className="min-h-11 w-full min-w-0 px-2 tabular-nums"
                  />
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <button
        type="submit"
        className="btn btn-primary"
      >
        Apply ranges
      </button>
      <p className="text-[15px] leading-snug text-ink-2">
        An empty box means no limit. A range hides tests that state no value for it.
      </p>
    </form>
  );
}
