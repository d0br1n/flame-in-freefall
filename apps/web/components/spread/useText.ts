"use client";

// Loads one text file of the analysis (a CSV table) from the data service. A file that is absent
// or does not load is "absent": the page then shows what it has and never crashes.
import { useEffect, useState } from "react";

export type TextState = { status: "idle" | "loading" | "absent" } | { status: "ok"; text: string };

const cache = new Map<string, Promise<string | null>>();

function load(url: string): Promise<string | null> {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => (response.ok ? response.text() : null))
      .catch(() => null);
    cache.set(url, pending);
  }
  return pending;
}

export function useText(url: string | null): TextState {
  const [state, setState] = useState<{ url: string | null; value: TextState }>({ url: null, value: { status: "idle" } });
  useEffect(() => {
    if (url === null) return;
    let cancelled = false;
    load(url).then((text) => {
      if (!cancelled) setState({ url, value: text === null ? { status: "absent" } : { status: "ok", text } });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (url === null) return { status: "idle" };
  return state.url === url ? state.value : { status: "loading" };
}
