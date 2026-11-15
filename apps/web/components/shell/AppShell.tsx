"use client";

// The app frame (DESIGN.md, "Shell"): the sidebar on the canvas, the main panel (a rounded
// surface with the top bar and the scrolling page) and the assistant dock on the right.
// <main> scrolls and has no top padding (app/template.tsx carries it), so a `sticky top-0` bar
// sits flush under the top bar and no row shows through above it (DOB-117).
import type { ReactNode } from "react";
import { EvidencePanelProvider } from "@/components/evidence/EvidencePanel";
import { Dock } from "./Dock";
import { ShellProvider } from "./ShellState";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ShellProvider>
      <EvidencePanelProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-md focus:bg-surface focus:px-4 focus:font-semibold focus:text-brand focus:shadow-pop"
        >
          Skip to content
        </a>
        <div className="flex h-dvh overflow-hidden bg-canvas">
          <Sidebar />
          <div className="m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm lg:my-2.5 lg:ml-0 lg:mr-2.5">
            <TopBar />
            <main id="main" tabIndex={-1} className="@container min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-5 outline-none sm:px-6 sm:pb-6">
              {children}
            </main>
          </div>
          <Dock />
        </div>
      </EvidencePanelProvider>
    </ShellProvider>
  );
}
