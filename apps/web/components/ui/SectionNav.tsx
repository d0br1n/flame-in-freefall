"use client";

// A long page split into sections, one shown at a time (DOB-122): a short list of sections beside
// the content, like a settings page. The chosen section lives in the address (#files), so a link
// to a section and the back button work. A section is mounted the first time it is opened and then
// kept, so what the visitor set inside it (a slider, a filter) is still there on return.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface SectionItem {
  /** The address fragment of the section: /suppress#mixture. */
  id: string;
  label: string;
  /** A count shown beside the label (from data, never typed in). */
  count?: number | string | null;
  /** Older fragments that must open this section (#holdings, #bench). */
  aliases?: readonly string[];
  content: ReactNode;
}

/** The section a fragment names, by id or alias; null when it names none. */
export function sectionForHash(sections: readonly Pick<SectionItem, "id" | "aliases">[], hash: string): string | null {
  const name = decodeURIComponent(hash.replace(/^#/, ""));
  if (!name) return null;
  return sections.find((section) => section.id === name || section.aliases?.includes(name))?.id ?? null;
}

export function SectionNav({
  sections,
  label,
  className = "",
}: {
  sections: readonly SectionItem[];
  /** The accessible name of the section list: "Sections of this investigation". */
  label: string;
  className?: string;
}) {
  const uid = useId();
  const first = sections[0]?.id ?? "";
  const [active, setActive] = useState(first);
  const [opened, setOpened] = useState<readonly string[]>([first]);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef(new Map<string, HTMLButtonElement>());

  const show = useCallback((id: string) => {
    setActive(id);
    setOpened((seen) => (seen.includes(id) ? seen : [...seen, id]));
  }, []);

  // The address decides the section, on load and on back/forward. Keyed on the ids, so a parent
  // that builds a new `sections` array on every render does not re-run it.
  const ids = sections.map((section) => [section.id, ...(section.aliases ?? [])].join(",")).join("|");
  const latest = useRef(sections);
  useEffect(() => {
    latest.current = sections;
  });
  useEffect(() => {
    const read = () => {
      // No fragment is the page's own address: the first section (back from a section opened by a link).
      const id = sectionForHash(latest.current, window.location.hash) ?? (window.location.hash === "" ? latest.current[0]?.id : null);
      if (id) show(id);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [ids, show]);

  // A list that changes (data arrived) must not leave a section that no longer exists selected.
  const current = sections.some((section) => section.id === active) ? active : first;

  function choose(id: string) {
    show(id);
    // pushState, so the back button returns to the section before (it fires hashchange).
    if (window.location.hash !== `#${id}`) window.history.pushState(null, "", `#${id}`);
    // The new section starts at its top, not where the last one was scrolled to.
    const top = root.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) root.current?.scrollIntoView({ block: "start" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = sections.findIndex((section) => section.id === current);
    const last = sections.length - 1;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? Math.min(index + 1, last)
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? Math.max(index - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (next < 0 || next === index) return;
    event.preventDefault();
    const id = sections[next].id;
    choose(id);
    tabs.current.get(id)?.focus();
  }

  if (sections.length === 0) return null;

  return (
    <div ref={root} className={`grid scroll-mt-4 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-6 ${className}`}>
      <div
        role="tablist"
        aria-label={label}
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        data-testid="section-nav"
        className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:grid lg:content-start lg:self-start lg:overflow-visible lg:pb-0"
      >
        {sections.map((section) => {
          const selected = section.id === current;
          return (
            <button
              key={section.id}
              ref={(node) => {
                if (node) tabs.current.set(section.id, node);
                else tabs.current.delete(section.id);
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${section.id}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${section.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(section.id)}
              className={`flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md px-3 text-left text-[15px] leading-5 whitespace-nowrap transition-colors duration-150 lg:whitespace-normal ${
                selected ? "bg-brand-soft font-semibold text-ink" : "font-medium text-ink-2 hover:bg-surface-sunk hover:text-ink"
              }`}
            >
              <span className="min-w-0 flex-1">{section.label}</span>
              {section.count !== undefined && section.count !== null ? (
                <span className="font-mono text-[13px] font-normal text-ink-3 tabular-nums">{section.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="min-w-0">
        {sections.map((section) =>
          opened.includes(section.id) || section.id === current ? (
            <div
              key={section.id}
              role="tabpanel"
              id={`${uid}-panel-${section.id}`}
              aria-labelledby={`${uid}-tab-${section.id}`}
              hidden={section.id !== current}
              data-section={section.id}
              className={section.id === current ? "grid grid-cols-[minmax(0,1fr)] gap-5" : undefined}
            >
              {section.content}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
