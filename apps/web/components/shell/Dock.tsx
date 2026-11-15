"use client";

// The assistant dock (DESIGN.md, "Assistant dock"): 384 px on the right. From 1280 px it pushes
// the page aside; narrower, it floats over the page; on phones it is a full-screen sheet. It stays
// open (or closed) across navigation. The assistant itself is components/assistant/AssistantDock.tsx.
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AssistantDock } from "@/components/assistant/AssistantDock";
import { useShell } from "./ShellState";

export function Dock() {
  const { dockOpen, setDockOpen } = useShell();
  const pathname = usePathname();
  const aside = useRef<HTMLElement>(null);
  // Mounted on first open and kept, so a conversation survives closing and opening the dock.
  const [mounted, setMounted] = useState(false);
  if (dockOpen && !mounted) setMounted(true);
  // The full assistant page has no dock.
  const onAssistantPage = pathname === "/assistant";
  const open = dockOpen && !onAssistantPage;

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      // Focus the first control of the dock (its close button) once it slides in.
      const timer = window.setTimeout(() => aside.current?.querySelector<HTMLElement>("button, a[href], input, textarea")?.focus(), 30);
      wasOpen.current = true;
      return () => window.clearTimeout(timer);
    }
    if (!open && wasOpen.current) {
      wasOpen.current = false;
      const active = document.activeElement;
      if (!active || active === document.body || aside.current?.contains(active)) {
        document.querySelector<HTMLElement>('[data-testid="ask-button"]')?.focus();
      }
    }
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setDockOpen(false);
    }
  }

  return (
    <aside
      ref={aside}
      id="assistant-dock"
      aria-label="Assistant"
      data-testid="assistant-dock"
      data-open={String(open)}
      inert={!open}
      onKeyDown={onKeyDown}
      className={`fixed inset-0 z-50 transition-[transform,opacity] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] sm:inset-auto sm:top-2 sm:right-2 sm:bottom-2 sm:w-[384px] xl:static xl:z-auto xl:flex-none xl:overflow-hidden xl:transition-[width] ${
        open
          ? "translate-x-0 opacity-100 xl:w-[394px]"
          : "pointer-events-none invisible translate-x-[calc(100%+1rem)] opacity-0 xl:visible xl:w-0 xl:translate-x-0 xl:opacity-100"
      }`}
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-surface shadow-pop sm:rounded-xl sm:border sm:border-line xl:my-2.5 xl:mr-2.5 xl:h-[calc(100%-20px)] xl:w-[384px] xl:shadow-sm">
        {mounted ? <AssistantDock onClose={() => setDockOpen(false)} /> : null}
      </div>
    </aside>
  );
}
