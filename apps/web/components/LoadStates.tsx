// The states every data-driven page shows: loading, no answer, and "saved copy".
import type { ReactNode } from "react";
import type { ApiError } from "@/lib/api";

/** Skeleton rows in the shape of a list while data loads: never a blank page. */
export function Loading({ label = "Loading…", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" data-testid="loading" className="py-2">
      <p className="text-[14px] text-ink-2">{label}</p>
      <ul aria-hidden="true" className="mt-3 space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="flex gap-5 rounded-lg border border-line bg-surface p-4">
            <div className="h-6 w-16 shrink-0 animate-pulse rounded-sm bg-surface-sunk" />
            <div className="flex-1 space-y-2.5">
              <div className="h-4 w-2/3 animate-pulse rounded-sm bg-surface-sunk" />
              <div className="h-3 w-1/2 animate-pulse rounded-sm bg-surface-sunk" />
              <div className="h-3 w-5/6 animate-pulse rounded-sm bg-surface-sunk" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The backend did not answer and no saved copy was found. */
export function Unreachable({ error, onRetry, what = "this page" }: { error: ApiError; onRetry: () => void; what?: string }) {
  return (
    <div role="alert" data-testid="error-state" className="my-4 max-w-[70ch] rounded-lg border border-danger/35 bg-danger-soft px-5 py-4">
      <h2 className="font-sans text-[15px] font-bold text-danger">The data service is not answering</h2>
      <p className="mt-1.5 text-ink">
        {what[0].toUpperCase() + what.slice(1)} cannot be shown. Check your connection.
      </p>
      <p className="mt-1 text-[14px] text-ink-2">Details: {error.message}</p>
      <button type="button" onClick={onRetry} className="btn btn-danger mt-4">
        Try again
      </button>
    </div>
  );
}

/** Shown when the answer came from the copy saved with the site, not from the live service. */
export function SavedCopyNote({ source, savedAt }: { source: "live" | "saved"; savedAt: string | null }) {
  if (source !== "saved") return null;
  return (
    <p
      data-testid="saved-copy"
      className="my-3 inline-flex items-center gap-2 rounded-full bg-warn-soft px-3 py-1 text-[14px] font-medium text-warn"
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      Saved copy{savedAt ? ` from ${savedAt}` : ""}. The live data service did not answer.
    </p>
  );
}

/** A plain message box (no results, unknown ID). */
export function Notice({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="my-4 max-w-[70ch] rounded-lg border border-line bg-surface px-5 py-4 shadow-sm">
      <h2 className="text-[18px] font-semibold">{title}</h2>
      <div className="mt-1.5 space-y-2 text-ink-2">{children}</div>
    </div>
  );
}
