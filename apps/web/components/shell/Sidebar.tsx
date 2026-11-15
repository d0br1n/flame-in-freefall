"use client";

// The sidebar (DESIGN.md, "Shell"): the logo, the fire stages, the data, the tools and the data
// credit. 248 px wide from 1024 px; below that an off-canvas drawer opened from the top bar
// (focus kept inside while open, Escape closes, the menu button gets focus back).
// Counts come from the API (GET /catalog/investigations, GET /catalog/tests?limit=1), never
// typed in; while they load no count is shown.
import { usePathname } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { AppLink } from "@/components/AppLink";
import { Icon } from "@/components/ui/Icon";
import { useApi } from "@/lib/api";
import { NAV_GROUPS, isCurrent, navCounts, navGroup, type NavEntry } from "@/lib/nav";
import { PSI_HOME, SITE_NAME, TEAM_NAME, TEAM_PLACE } from "@/lib/site";
import type { InvestigationList, TestsResponse } from "@/lib/types";
import { BrandMark } from "./BrandMark";
import { useIsDesktop, useShell } from "./ShellState";
import { ThemeToggle } from "./ThemeToggle";

export const NAV_ITEM =
  "flex h-10 items-center gap-2.5 rounded-sm px-3 text-[14px] font-medium text-ink-2 no-underline transition-colors duration-150 hover:bg-surface-sunk hover:text-ink max-lg:h-11";

export function Sidebar() {
  const pathname = usePathname();
  const { drawerOpen, setDrawerOpen } = useShell();
  const desktop = useIsDesktop();
  const aside = useRef<HTMLElement>(null);
  const investigations = useApi<InvestigationList>("/catalog/investigations");
  const tests = useApi<TestsResponse>("/catalog/tests?limit=1");
  const counts = navCounts(
    investigations.status === "ok" ? investigations.data.items : null,
    tests.status === "ok" ? tests.data.total : null,
  );
  const drawer = !desktop;
  const hidden = drawer && !drawerOpen;

  // The drawer closes when the page changes.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setDrawerOpen(false);
    }
  }, [pathname, setDrawerOpen]);

  // Opening the drawer moves focus into it.
  useEffect(() => {
    if (drawer && drawerOpen) aside.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [drawer, drawerOpen]);

  function close() {
    setDrawerOpen(false);
    document.getElementById("menu-button")?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!drawer || !drawerOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !aside.current) return;
    const focusables = [...aside.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const item = (entry: NavEntry) => {
    const current = isCurrent(entry.href, pathname);
    const count = entry.count ? counts[entry.count] : undefined;
    return (
      <AppLink
        key={entry.href}
        href={entry.href}
        aria-current={current ? "page" : undefined}
        className={`${NAV_ITEM} relative ${current ? "bg-brand-soft font-semibold text-ink before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-brand hover:bg-brand-soft" : ""}`}
      >
        <Icon name={entry.icon} className={current ? "text-brand" : ""} />
        <span>{entry.label}</span>
        {count !== undefined ? (
          <span
            className="ml-auto font-mono text-[13px] font-normal text-ink-3"
            data-testid="nav-count"
            data-count={entry.count}
            data-source={entry.count === "investigations" && investigations.status === "ok" ? investigations.source : undefined}
          >
            <span className="sr-only">, </span>
            {count.toLocaleString("en-US")}
          </span>
        ) : null}
      </AppLink>
    );
  };

  return (
    <>
      {drawer && drawerOpen ? (
        <div aria-hidden="true" onClick={() => setDrawerOpen(false)} className="fixed inset-0 z-40 bg-[var(--backdrop)] lg:hidden" />
      ) : null}
      <aside
        ref={aside}
        id="sidebar"
        aria-label="Sidebar"
        inert={hidden}
        onKeyDown={onKeyDown}
        data-open={drawer ? String(drawerOpen) : undefined}
        className={`flex w-[248px] shrink-0 flex-col gap-6 overflow-y-auto px-3 pb-4 pt-6 max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:w-[min(280px,85vw)] max-lg:border-r max-lg:border-line max-lg:bg-canvas max-lg:shadow-pop max-lg:transition-transform max-lg:duration-300 max-lg:ease-[cubic-bezier(.2,.8,.2,1)] ${
          drawerOpen ? "max-lg:translate-x-0" : "max-lg:invisible max-lg:-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <AppLink
            href="/"
            aria-label={`${SITE_NAME}, Overview`}
            className="inline-flex items-center gap-2 rounded-sm px-3 font-wordmark text-[19px] font-semibold tracking-[-0.03em] text-ink no-underline hover:text-ink"
          >
            <BrandMark size={26} />
            <span aria-hidden="true">{SITE_NAME}</span>
          </AppLink>
          {drawer ? (
            <button type="button" aria-label="Close menu" onClick={close} className="btn btn-ghost w-11 px-0">
              <Icon name="close" />
            </button>
          ) : null}
        </div>

        <div className="grid gap-5">
          {NAV_GROUPS.filter(({ group }) => group !== "tools").map(({ group, label }) => (
            <nav key={group} aria-label={label} className="grid gap-0.5">
              <p className="px-3 pb-1 text-[13px] font-semibold tracking-[0.02em] text-ink-3">{label}</p>
              {navGroup(group).map(item)}
            </nav>
          ))}
        </div>

        <div className="mt-auto grid gap-2">
          <nav aria-label="Tools" className="grid gap-0.5">
            {navGroup("tools").map(item)}
            <ThemeToggle className={NAV_ITEM} />
          </nav>
          <p className="px-3 text-[13px] leading-4 text-ink-3">
            Data:{" "}
            <a href={PSI_HOME} target="_blank" rel="noopener noreferrer" className="text-ink-2 hover:text-ink">
              NASA Physical Sciences Informatics
            </a>
            . Built by {TEAM_NAME}, {TEAM_PLACE}.
          </p>
        </div>
      </aside>
    </>
  );
}
