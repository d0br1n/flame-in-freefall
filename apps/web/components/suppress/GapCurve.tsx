"use client";

// The gap curve of the designed batch (Linear DOB-114): the largest distance left between a
// condition in the region and its nearest test, against the number of new tests flown, for the
// designed batch and for the same number of tests taken from the top of the ranked list.
// Every point is read from flex_gaps.json (header.campaign.curve): nothing is computed here.
// Plain SVG, no chart package. Code generated with SI assistance (Claude Code), reviewed by the team.
import { useEffect, useRef, useState } from "react";
import { linearScale } from "@/lib/chart";
import type { BatchCurvePoint } from "@/lib/suppress";

const MAX_WIDTH = 560;
const HEIGHT = 230;

/** The width the chart has on the page, so its text keeps its size on a phone. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function GapCurve({ curve, size }: { curve: BatchCurvePoint[]; size: number }) {
  const [ref, measured] = useWidth(MAX_WIDTH);
  const WIDTH = Math.max(240, Math.min(MAX_WIDTH, measured));
  const PLOT = { left: 46, right: WIDTH - 16, top: 16, bottom: HEIGHT - 44 };
  // On a narrow chart every second tick is labelled, so the numbers do not touch.
  const every = WIDTH < 420 ? 2 : 1;
  const last = curve[curve.length - 1].tests;
  const top = Math.ceil(Math.max(...curve.map((p) => Math.max(p.designed_batch, p.ranked_list))) * 5) / 5;
  const x = linearScale([0, last], [PLOT.left + 8, PLOT.right - 8]);
  const y = linearScale([0, top], [PLOT.bottom, PLOT.top]);
  const yTicks = Array.from({ length: Math.round(top / 0.2) + 1 }, (_, i) => Number((i * 0.2).toFixed(1)));
  const line = (value: (p: BatchCurvePoint) => number) => curve.map((p) => `${x(p.tests)},${y(value(p))}`).join(" ");
  const at = curve.find((p) => p.tests === size);

  return (
    <figure ref={ref} className="min-w-0 max-w-[35rem]" data-testid="gap-curve">
      <svg
        width={WIDTH}
        height={HEIGHT}
        className="block"
        role="img"
        aria-label={`Largest gap left in the region against the number of new tests flown, 0 to ${last}: the designed batch against the top of the ranked list`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={PLOT.left} x2={PLOT.right} y1={y(tick)} y2={y(tick)} className="stroke-line" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={PLOT.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[13px] tabular-nums">
              {tick.toFixed(1)}
            </text>
          </g>
        ))}
        {curve.filter((p) => p.tests % every === 0).map((p) => (
          <text key={p.tests} x={x(p.tests)} y={PLOT.bottom + 17} textAnchor="middle" className="fill-ink-3 text-[13px] tabular-nums">
            {p.tests}
          </text>
        ))}
        <text x={(PLOT.left + PLOT.right) / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-ink-2 text-[13px]">
          New tests flown
        </text>

        {/* The batch size the engine proposes. */}
        {at ? (
          <g>
            <line x1={x(size)} x2={x(size)} y1={PLOT.top} y2={PLOT.bottom} className="stroke-ink-3" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(size) + 6} y={PLOT.top + 4} dy="0.32em" className="fill-ink-2 text-[13px] font-medium">
              {size} tests
            </text>
          </g>
        ) : null}

        <polyline points={line((p) => p.ranked_list)} className="fill-none stroke-ink-3" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
        {curve.map((p) => (
          <circle key={`r${p.tests}`} cx={x(p.tests)} cy={y(p.ranked_list)} r={2.5} className="fill-surface stroke-ink-3" strokeWidth={1.25}>
            <title>{`${p.tests} from the ranked list: largest gap ${p.ranked_list.toFixed(2)}`}</title>
          </circle>
        ))}
        <polyline points={line((p) => p.designed_batch)} className="fill-none stroke-brand" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {curve.map((p) => (
          <circle key={`d${p.tests}`} cx={x(p.tests)} cy={y(p.designed_batch)} r={3} className="fill-brand">
            <title>{`${p.tests} from the designed batch: largest gap ${p.designed_batch.toFixed(2)}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] leading-[19px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <svg width={22} height={10} aria-hidden="true" className="shrink-0">
            <line x1={0} x2={22} y1={5} y2={5} className="stroke-brand" strokeWidth={2} />
            <circle cx={11} cy={5} r={3} className="fill-brand" />
          </svg>
          Designed batch
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={22} height={10} aria-hidden="true" className="shrink-0">
            <line x1={0} x2={22} y1={5} y2={5} className="stroke-ink-3" strokeWidth={2} strokeDasharray="5 4" />
            <circle cx={11} cy={5} r={2.5} className="fill-surface stroke-ink-3" strokeWidth={1.25} />
          </svg>
          Top of the ranked list
        </span>
        <span className="text-ink-3">Vertical: the largest distance from a condition to its nearest test.</span>
      </figcaption>
    </figure>
  );
}
