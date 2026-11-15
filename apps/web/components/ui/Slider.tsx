"use client";

// A labelled slider: label and value on top, a 6 px track filled in brand up to the thumb.
// A native range input, so the keyboard (arrows, Page Up/Down, Home, End) works as everywhere.
// Optional marks under the track show where along the slider something exists (on the Overview:
// the oxygen and pressure values of the catalogued tests). They are decoration for the eye: the
// caller says the same in words next to the sliders.
import { useId } from "react";

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  disabled = false,
  testId,
  marks,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as shown, with its unit ("21.0 %"); also the screen reader's value text. */
  display: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  testId?: string;
  /** Positions to mark under the track, each a share of the slider from 0 to 1. */
  marks?: number[];
}) {
  const id = useId();
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
          {label}
        </label>
        <span className="font-mono text-[14px] font-medium tabular-nums text-ink" aria-hidden="true">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ ["--p" as string]: `${Math.min(100, Math.max(0, percent))}%` }}
      />
      {marks && marks.length > 0 ? (
        // The thumb's centre travels from 10 px to 10 px short of the end (a 20 px thumb), so do the marks.
        <div className="relative -mt-2.5 h-2 max-sm:-mt-5" aria-hidden="true" data-testid={testId ? `${testId}-marks` : undefined}>
          {marks.map((share) => (
            <span key={share} className="absolute top-0 h-2 w-px bg-ink-3" style={{ left: `calc(10px + ${share} * (100% - 20px))` }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
