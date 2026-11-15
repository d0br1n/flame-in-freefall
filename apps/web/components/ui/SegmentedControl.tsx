"use client";

// A segmented control: a sunk track of buttons, the chosen one raised on the surface. Each
// segment is a toggle button (aria-pressed); arrow keys move between segments.
import { useRef, type KeyboardEvent } from "react";

export interface Segment<T extends string | null> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string | null>({
  label,
  segments,
  value,
  onChange,
  className = "",
  testId,
}: {
  /** The group's accessible name. */
  label: string;
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  testId?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const at = segments.findIndex((segment) => segment.value === value);
    const move = (to: number) => {
      event.preventDefault();
      const next = (to + segments.length) % segments.length;
      onChange(segments[next].value);
      refs.current[next]?.focus();
    };
    if (event.key === "ArrowRight") move(at + 1);
    else if (event.key === "ArrowLeft") move(at - 1);
  }
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testId}
      onKeyDown={onKey}
      className={`inline-flex max-w-full flex-wrap gap-0.5 rounded-md bg-surface-sunk p-[3px] ${className}`}
    >
      {segments.map((segment, index) => {
        const on = segment.value === value;
        return (
          <button
            key={segment.value ?? "all"}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            aria-pressed={on}
            data-value={segment.value ?? ""}
            onClick={() => onChange(segment.value)}
            className={`h-8 cursor-pointer rounded-sm px-3 text-[14px] font-semibold whitespace-nowrap transition-colors duration-150 max-sm:h-10 ${
              on ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"
            }`}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
