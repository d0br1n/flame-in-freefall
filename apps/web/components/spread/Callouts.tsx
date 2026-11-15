"use client";

// "Where the numbers come from" (DOB-86): a thin layer over the clip that marks the area of NASA's
// on-screen read-out and the line brightened in a review clip, and a list under the clip that says
// what each field means and its value at the cursor's time. The boxes are approximate (the text
// grid differs by a few pixels between videos). The layer never takes a pointer event.
import type { ReactNode } from "react";
import {
  BRIGHTEN_FROM_Y,
  curveRowAt,
  fieldBox,
  fieldValueAt,
  FRAME,
  READOUT_FIELDS,
  type CurveRow,
  type ReadoutField,
  type ReadoutRow,
} from "@/lib/spread";

export const CALLOUT_LABELS: Record<ReadoutField, string> = {
  fuel: "FUEL label: by elimination NASA's N2 flow, not used",
  air: "AIR: flow speed, cm/s (slow sensor)",
  fan: "FAN: fan voltage x10",
  rad: "RAD: radiometer, uncalibrated",
  clock: "Clock: NASA's time stamp",
};
const SHORT: Record<ReadoutField, string> = { fuel: "FUEL", air: "AIR", fan: "FAN", rad: "RAD", clock: "Clock" };
export const NOT_READ = "could not be read";
const INK = "#ffd400";

/** The layer: lines and boxes in frame coordinates, scaled with the picture inside the video box. */
export function CalloutLayer({ gain }: { gain?: number | null }) {
  return (
    <svg
      data-testid="callout-layer"
      aria-hidden="true"
      viewBox={`0 0 ${FRAME.w} ${FRAME.h}`}
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {READOUT_FIELDS.map((field) => {
        const b = fieldBox(field);
        const label = SHORT[field];
        const stroke = { stroke: INK, strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" as const };
        return (
          <g key={field} data-callout={field} fill="none">
            <rect x={b.x} y={b.y} width={b.w} height={b.h} {...stroke} strokeDasharray="4 2" />
            {field === "clock" ? (
              <>
                <line x1={72} x2={b.x - 2} y1={b.y + b.h / 2} y2={b.y + b.h / 2} {...stroke} />
                <text x={6} y={b.y + b.h / 2 + 8} fontSize={24} fontWeight={700} fill={INK} stroke="#000" strokeWidth={4} paintOrder="stroke">
                  {label}
                </text>
              </>
            ) : (
              <>
                <line x1={b.x - 3} x2={b.x - 3} y1={b.y} y2={26} {...stroke} />
                <text x={b.x - 3} y={22} fontSize={24} fontWeight={700} fill={INK} stroke="#000" strokeWidth={4} paintOrder="stroke">
                  {label}
                </text>
              </>
            )}
          </g>
        );
      })}
      {gain !== undefined ? (
        <g data-callout="brightened" fill="none">
          <line x1={0} x2={FRAME.w} y1={BRIGHTEN_FROM_Y} y2={BRIGHTEN_FROM_Y} stroke={INK} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeDasharray="8 4" />
          <text x={FRAME.w - 6} y={BRIGHTEN_FROM_Y + 24} textAnchor="end" fontSize={22} fontWeight={700} fill={INK} stroke="#000" strokeWidth={4} paintOrder="stroke">
            {gain === null ? "brightened below" : `brightened x${gain} below`}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function Item({ swatch, children, testId, field }: { swatch: ReactNode; children: ReactNode; testId: string; field: string }) {
  return (
    <li className="flex items-start gap-2" data-testid={testId} data-field={field}>
      <span className="mt-1.5 shrink-0">{swatch}</span>
      <span>{children}</span>
    </li>
  );
}

const box = <svg width="16" height="10" aria-hidden="true"><rect x="1" y="1" width="14" height="8" fill="none" stroke={INK} strokeDasharray="3 2" /></svg>;
const dark = <span className="inline-block rounded-sm bg-ink p-0.5">{box}</span>;

/** The list under the clip: the meaning of every marked field and its value at the cursor's time. */
export function CalloutList({
  readout,
  readoutFile,
  cursor,
  curve,
  gain,
}: {
  readout: readonly ReadoutRow[];
  /** False when the test has no read-out table at all. */
  readoutFile: boolean;
  cursor: number | null;
  /** B clips: the curve table, for the outline and edge values. */
  curve?: readonly CurveRow[];
  /** T clips: the brightening gain (null when the clip does not say). */
  gain?: number | null;
}) {
  const row = curve && cursor !== null ? curveRowAt(curve, cursor) : null;
  const px = (v: number | null | undefined) => (v === null || v === undefined ? "-" : `${Math.round(v)} px`);
  return (
    <div data-testid="callout-list" className="mt-3 text-[0.8125rem] leading-[1.35] text-ink">
      <ul className="space-y-1">
        {READOUT_FIELDS.map((field) => {
          const value = fieldValueAt(readout, field, cursor);
          return (
            <Item key={field} swatch={dark} testId="callout-label" field={field}>
              {CALLOUT_LABELS[field]}
              {field === "fuel" ? null : (
                <>
                  {": "}
                  <strong className="tabular-nums" data-testid="callout-value">
                    {!readoutFile ? NOT_READ : (value ?? "-")}
                  </strong>
                </>
              )}
            </Item>
          );
        })}
        {gain !== undefined ? (
          <Item swatch={dark} testId="callout-label" field="brightened">
            Below the dashed line the picture is brightened {gain === null ? "" : `x${gain}`}
          </Item>
        ) : null}
        {curve ? (
          <>
            <Item swatch={<span className="inline-block h-0.5 w-4 bg-[#00ff00]" />} testId="callout-label" field="outline">
              Outline (green): pixels brighter than the threshold, area{" "}
              <strong className="tabular-nums" data-testid="callout-value">
                {row?.area_px != null ? `${row.area_px} px` : "-"}
              </strong>
            </Item>
            <Item
              swatch={<span className="inline-flex gap-0.5"><i className="inline-block h-3 w-0.5 bg-[#00ffff]" /><i className="inline-block h-3 w-0.5 bg-[#ff00ff]" /></span>}
              testId="callout-label"
              field="edges"
            >
              Edge lines (cyan, magenta): leading edge{" "}
              <strong className="tabular-nums" data-testid="callout-value">{px(row?.leading_edge_px)}</strong>, trailing edge{" "}
              <strong className="tabular-nums">{px(row?.trailing_edge_px)}</strong> (the slope of the leading edge is the spread rate, px/s)
            </Item>
            <Item swatch={<span className="inline-block h-2 w-4 rounded-sm bg-ink-3" />} testId="callout-label" field="light">
              Flame light:{" "}
              <strong className="tabular-nums" data-testid="callout-value">
                {row?.flame_light != null ? Math.round(row.flame_light) : "-"}
              </strong>{" "}
              (relative, says nothing about how hot the flame is)
            </Item>
          </>
        ) : null}
      </ul>
      <p className="mt-1.5 text-[0.75rem] text-ink-2">The boxes mark where NASA&apos;s numbers are on the picture. Their position is approximate.</p>
    </div>
  );
}

/** The button that shows or hides the layer and the list. */
export function CalloutToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      data-testid="callout-toggle"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="mt-2 inline-flex min-h-8 cursor-pointer items-center rounded-sm border border-control bg-surface px-2.5 text-[0.8125rem] font-medium text-brand hover:border-brand hover:bg-brand-soft aria-pressed:border-brand"
    >
      Where the numbers come from: {on ? "on" : "off"}
    </button>
  );
}

/** The button that switches the player between the clip and the three-panel detection clip. */
export function StepsToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      data-testid="steps-toggle"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="mt-2 inline-flex min-h-8 cursor-pointer items-center rounded-sm border border-control bg-surface px-2.5 text-[0.8125rem] font-medium text-brand hover:border-brand hover:bg-brand-soft aria-pressed:border-brand"
    >
      Show how the engine sees it{on ? ": on" : ""}
    </button>
  );
}

export const STEPS_CAPTION =
  "Left: NASA's frame with the outline the engine drew. Middle: the brightness the engine measures in each pixel. Right: the pixels bright enough to count as flame. Brightness is the engine's input signal; it says nothing about how hot the flame is.";
