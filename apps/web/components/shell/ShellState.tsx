"use client";

// The shell's own state, kept in the root layout so it survives navigation: is the assistant
// dock open, is the sidebar drawer open (under 1024 px), and the page's title for the top bar.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface ShellState {
  dockOpen: boolean;
  setDockOpen: (open: boolean) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** The title a page set for the top bar, or null (then the section's name is shown). */
  title: string | null;
  setTitle: (title: string | null) => void;
}

const ShellContext = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [dockOpen, setDockOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const value = useMemo(
    () => ({ dockOpen, setDockOpen, drawerOpen, setDrawerOpen, title, setTitle }),
    [dockOpen, drawerOpen, title],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellState {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell() outside <ShellProvider>");
  return value;
}

/**
 * Sets the top bar's title (the page's one h1) while this page is shown. Pages whose title is the
 * section's name ("Tests") need not use it.
 */
export function PageTitle({ title }: { title: string }) {
  const shell = useContext(ShellContext);
  const setTitle = shell?.setTitle;
  useEffect(() => {
    setTitle?.(title);
    return () => setTitle?.(null);
  }, [setTitle, title]);
  return null;
}

/** True from 1024 px (the sidebar is in the page, not a drawer). True before hydration. */
export function useIsDesktop(query = "(min-width: 1024px)"): boolean {
  const [matches, setMatches] = useState(true);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}
