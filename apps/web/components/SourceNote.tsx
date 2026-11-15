// Every claim carries its source (DESIGN.md, "Sources"). Since the redesign of 14 November 2026
// the source is a quiet caption directly under its item (no margin column).
import type { ReactNode } from "react";

/** Text with `backtick` spans set in the mono face (PSI field names, file names). */
export function Ticked({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={index} className="font-mono text-[1em]">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** One margin note: small, muted. `label` defaults to "Source". */
export function SourceNote({ children, label = "Source" }: { children: ReactNode; label?: string }) {
  return (
    <p data-testid="source-note" className="text-[13px] leading-[19px] text-ink-3">
      {label ? <span className="font-medium">{label}: </span> : null}
      {children}
    </p>
  );
}

/** An item with its source caption directly under it. `note={null}` leaves the item alone. */
export function MarginRow({
  children,
  note,
  className = "",
}: {
  children: ReactNode;
  note: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid gap-y-1 ${className}`}>
      <div className="min-w-0">{children}</div>
      {note ? <div className="min-w-0 max-w-[70ch]">{note}</div> : null}
    </div>
  );
}

/**
 * Where a cabin air's window comes from (the preset's `source` sentence from the backend). The
 * sentence is long, so it sits behind a "Why this window" disclosure in the source margin.
 */
export function AirSourceNote({ air }: { air: { label: string; source?: string | null } }) {
  if (!air.source) return null;
  return (
    <details data-testid="air-source" className="text-[14px] leading-[18px] text-ink-2">
      <summary className="inline-flex min-h-8 cursor-pointer items-center font-semibold text-brand hover:underline max-sm:min-h-11">
        Why this window<span className="sr-only"> ({air.label})</span>
      </summary>
      <div className="pb-1">
        <SourceNote label={`Source of "${air.label}"`}>
          <Ticked text={air.source} />
        </SourceNote>
      </div>
    </details>
  );
}
