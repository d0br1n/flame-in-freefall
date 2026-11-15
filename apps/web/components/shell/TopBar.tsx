"use client";

// The top bar (DESIGN.md, "Shell"): the page title (the page's one h1), the cabin-air dropdown,
// the search and the "Ask" button that opens the assistant dock. Under 1024 px a menu button opens
// the sidebar drawer; on phones the dropdown and the search take a second row.
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { sectionTitle } from "@/lib/nav";
import { SITE_NAME } from "@/lib/site";
import { AirPill } from "./AirPill";
import { SearchBox } from "./SearchBox";
import { useShell } from "./ShellState";

export function TopBar() {
  const pathname = usePathname();
  const { title, dockOpen, setDockOpen, drawerOpen, setDrawerOpen } = useShell();
  const text = title ?? sectionTitle(pathname) ?? SITE_NAME;
  const long = text.length > 36;
  return (
    <header className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-6 md:h-[68px] md:flex-nowrap md:py-0">
      <button
        id="menu-button"
        type="button"
        aria-label="Open menu"
        aria-controls="sidebar"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(!drawerOpen)}
        className="btn btn-ghost -ml-2 w-11 px-0 lg:hidden"
      >
        <Icon name="menu" />
      </button>
      <h1
        data-testid="page-title"
        title={long ? text : undefined}
        className={`mr-auto min-w-0 flex-1 font-display font-[650] tracking-[-0.02em] text-ink ${
          long
            ? "line-clamp-2 text-[17px] leading-[21px] md:text-[18px] md:leading-[22px]"
            : "line-clamp-2 text-[20px] leading-[24px] md:line-clamp-1 md:text-[24px] md:leading-[30px]"
        }`}
      >
        {text}
      </h1>
      <div className="order-last flex w-full min-w-0 gap-2 md:order-none md:w-auto md:shrink-0 md:gap-3">
        <AirPill className="min-w-0 flex-1 md:max-w-[22rem] md:flex-none" />
        <SearchBox className="min-w-0 flex-1 md:w-[220px] md:flex-none" />
      </div>
      <button
        type="button"
        aria-expanded={dockOpen}
        aria-controls="assistant-dock"
        data-testid="ask-button"
        onClick={() => setDockOpen(!dockOpen)}
        className="btn btn-primary shrink-0"
      >
        <Icon name="assistant" size="sm" />
        Ask
      </button>
    </header>
  );
}
