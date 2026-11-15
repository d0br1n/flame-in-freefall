"use client";

// The top bar's search: investigations by PSI ID, acronym and title, plus "Search tests for ..."
// when the text names something the tests page can filter by (lib/search.ts). Results sit in a
// popover; the arrows move, Enter opens, Escape closes; "/" anywhere focuses the field.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { useApi } from "@/lib/api";
import { withAir } from "@/lib/links";
import { searchInvestigations, testsTarget } from "@/lib/search";
import type { InvestigationList, TestsResponse } from "@/lib/types";

const FIELD =
  "flex h-10 min-w-0 items-center gap-2 rounded-md bg-surface-sunk px-3 text-[14px] text-ink-3 max-sm:h-11";

export function SearchBox({ className = "" }: { className?: string }) {
  return (
    <Suspense
      fallback={
        <div className={`${FIELD} ${className}`} aria-hidden="true">
          <Icon name="search" size="sm" />
          <span className="truncate">Search tests and investigations</span>
        </div>
      }
    >
      <SearchField className={className} />
    </Suspense>
  );
}

interface Option {
  key: string;
  href: string;
  title: string;
  hint: string;
}

function SearchField({ className }: { className: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  // Only asked for once the visitor types (both are cached and shared with the sidebar).
  const wanted = query.trim() !== "";
  const catalog = useApi<InvestigationList>(wanted ? "/catalog/investigations" : null);
  const tests = useApi<TestsResponse>(wanted ? "/catalog/tests?limit=1" : null);

  const options = useMemo<Option[]>(() => {
    if (!wanted) return [];
    const items = catalog.status === "ok" ? catalog.data.items : [];
    const found: Option[] = searchInvestigations(items, query).map(({ item }) => ({
      key: item.psi_id,
      href: `/investigations/${encodeURIComponent(item.psi_id)}`,
      title: `${item.psi_id}${item.acronym ? ` · ${item.acronym}` : ""}`,
      hint: item.title,
    }));
    const target = testsTarget(query, tests.status === "ok" ? tests.data.facets : null);
    if (target) {
      const hint =
        target.kind === "test"
          ? "Open this test on the tests page"
          : target.kind === "investigation"
            ? "The tests of this investigation"
            : target.kind === "fuel"
              ? "Tests with this fuel"
              : "Tests with this outcome";
      found.push({ key: `tests:${target.href}`, href: target.href, title: target.label, hint });
    }
    return found;
  }, [wanted, query, catalog, tests]);

  // "/" focuses the field from anywhere, unless the visitor is typing somewhere else.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      event.preventDefault();
      input.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function go(option: Option) {
    setOpen(false);
    setQuery("");
    input.current?.blur();
    router.push(withAir(option.href, searchParams));
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      const option = options[active];
      if (option) {
        event.preventDefault();
        go(option);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (open && query) setOpen(false);
      else {
        setQuery("");
        input.current?.blur();
      }
    }
  }

  const loading = wanted && (catalog.status === "loading" || tests.status === "loading");
  const showPopover = open && wanted;
  const activeOption = showPopover && options[active] ? `${id}-opt-${active}` : undefined;

  return (
    <div ref={root} className={`relative min-w-0 ${className}`}>
      <label className={`${FIELD} w-full cursor-text focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand`}>
        <Icon name="search" size="sm" />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label="Search tests and investigations"
          aria-expanded={showPopover}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={activeOption}
          placeholder="Search tests and investigations"
          autoComplete="off"
          spellCheck={false}
          value={query}
          data-testid="search-input"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[14px] text-ink outline-none hover:border-0 focus-visible:outline-none"
        />
        <kbd className="rounded-[5px] border border-line bg-surface px-1.5 py-px font-mono text-[13px] text-ink-3 max-sm:hidden" aria-hidden="true">
          /
        </kbd>
      </label>
      {showPopover ? (
        <div
          data-testid="search-results"
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-1.5 shadow-pop"
        >
          <ul id={`${id}-list`} role="listbox" aria-label="Search results">
            {options.map((option, index) => (
              <li
                key={option.key}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                onPointerEnter={() => setActive(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => go(option)}
                className={`grid cursor-pointer gap-0.5 rounded-sm px-3 py-2.5 ${index === active ? "bg-surface-sunk" : ""}`}
              >
                <span className="text-[14px] font-semibold text-ink">{option.title}</span>
                <span className="line-clamp-2 text-[13px] leading-4 text-ink-2">{option.hint}</span>
              </li>
            ))}
          </ul>
          {options.length === 0 ? (
            <p role="status" className="px-3 py-2.5 text-[14px] text-ink-2">
              {loading
                ? "Searching…"
                : `Nothing matches “${query.trim()}”. Try a PSI ID (PSI-69), a test ID (PSI-69/114), an acronym (FLEX) or a fuel.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
