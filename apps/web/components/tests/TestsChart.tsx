"use client";

import type React from "react";

// Oxygen against pressure, one dot per matching test (all of them, not one page), coloured (steps
// of the blue scale, each dot with a thin dark edge) and shaped by investigation, with the chosen cabin air's window drawn behind the dots.
// Plain SVG, no chart package. The arithmetic is in lib/chart.ts (unit tested).
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  assignSeries,
  countInside,
  legendEntries,
  linearScale,
  nearestPoint,
  niceDomain,
  pressureView,
  shapePath,
  ticks,
  windowBounds,
  windowLimitsFlow,
  windowRect,
  type Series,
  type Shape,
} from "@/lib/chart";
import type { AirState } from "@/lib/air";
import { investigationLabel, testsCount, toPercent, trimNumber } from "@/lib/tests";
import type { AirPreset, TestPoint } from "@/lib/types";
import { seriesFill } from "./series";

const MARGIN = { top: 14, right: 18, bottom: 46, left: 58 };
const MARK_R = 4.5;
const HIT_RADIUS = 14;

/** The width of an element, following resizes (the chart is drawn at its real pixel size). */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
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

export interface ChartProps {
  points: TestPoint[];
  notPlotted: number;
  /** Colour and shape per investigation (lib/chart.ts assignSeries over every investigation). */
  series: Map<string, Series>;
  /** Acronym per PSI ID, for the legend and the tooltip. */
  acronyms: Map<string, string | null>;
  air: AirState;
  onOpen: (testId: string) => void;
  /** True while a new answer loads: the previous dots stay, dimmed. */
  stale?: boolean;
  /** The chart's heading; null when the card around it already has one (then `labelledBy` names it). */
  heading?: string | null;
  labelledBy?: string;
  className?: string;
}

export function TestsChart({
  points: allPoints,
  notPlotted,
  series,
  acronyms,
  air,
  onOpen,
  stale = false,
  heading = "Oxygen and pressure of the matching tests",
  labelledBy,
  className = "mt-6",
}: ChartProps) {
  const [ref, width] = useWidth(720);
  // The pressure axis: a default view that keeps the bulk of the tests readable, or every pressure.
  const [allPressures, setAllPressures] = useState(false);
  const height = Math.round(Math.min(380, Math.max(270, width * 0.42)));
  const chosenAir: AirPreset | null = air.status === "ok" ? air.air : null;
  // An investigation missing from `series` (should not happen) still gets a mark of its own.
  const seriesOf = useMemo(() => {
    const fallback = assignSeries(allPoints.map((point) => point[1]));
    return (psiId: string): Series =>
      series.get(psiId) ?? fallback.get(psiId) ?? { psi_id: psiId, slot: null, shape: "circle" };
  }, [allPoints, series]);

  const view = useMemo(() => {
    const bounds = chosenAir ? windowBounds(chosenAir.window) : { x: [], y: [] };
    const pressure = pressureView(allPoints.map((point) => point[3]), bounds.y);
    const cut = pressure.cut && !allPressures;
    const yDomain = cut ? pressure.domain : niceDomain(allPoints.map((point) => point[3]), bounds.y);
    const shown = cut ? allPoints.filter((point) => point[3] <= yDomain[1]) : allPoints;
    const above = new Map<string, number>();
    for (const point of allPoints) if (point[3] > yDomain[1]) above.set(point[1], (above.get(point[1]) ?? 0) + 1);
    return { bounds, yDomain, shown, above, canCut: pressure.cut };
  }, [allPoints, chosenAir, allPressures]);
  const points = view.shown;
  const offView = allPoints.length - points.length;

  const geometry = useMemo(() => {
    const xDomain = niceDomain(points.map((point) => toPercent(point[2])), view.bounds.x);
    const yDomain = view.yDomain;
    const plot = { left: MARGIN.left, right: width - MARGIN.right, top: MARGIN.top, bottom: height - MARGIN.bottom };
    const x = linearScale(xDomain, [plot.left, plot.right]);
    const y = linearScale(yDomain, [plot.bottom, plot.top]);
    const pixels = points.map((point) => ({ x: x(toPercent(point[2])), y: y(point[3]) }));
    // Keyboard order: left to right, then bottom to top.
    const order = pixels.map((_, index) => index).sort((a, b) => pixels[a].x - pixels[b].x || pixels[b].y - pixels[a].y);
    return { xDomain, yDomain, plot, x, y, pixels, order };
  }, [points, width, height, view]);

  const [active, setActive] = useState<{ index: number; byKey: boolean } | null>(null);
  const activeIndex = active && active.index < points.length ? active.index : -1;

  const rect = chosenAir ? windowRect(chosenAir.window, geometry.xDomain, geometry.yDomain) : null;
  // Counted over every point, also those above the default view: the count does not depend on the view.
  const inside = chosenAir ? countInside(allPoints, chosenAir.window) : null;
  const perInvestigation = new Map<string, number>();
  for (const point of allPoints) perInvestigation.set(point[1], (perInvestigation.get(point[1]) ?? 0) + 1);
  const legend = legendEntries(perInvestigation, seriesOf);
  const nameOf = (psiId: string) => investigationLabel(psiId, acronyms.get(psiId));

  function pointerAt(event: { currentTarget: Element; clientX: number; clientY: number }) {
    const box = event.currentTarget.getBoundingClientRect();
    return nearestPoint(geometry.pixels, event.clientX - box.left, event.clientY - box.top, HIT_RADIUS);
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    const position = activeIndex >= 0 ? geometry.order.indexOf(activeIndex) : -1;
    const move = (to: number) => {
      event.preventDefault();
      const clamped = Math.max(0, Math.min(geometry.order.length - 1, to));
      setActive({ index: geometry.order[clamped], byKey: true });
    };
    if (event.key === "ArrowRight" || event.key === "ArrowUp") move(position + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") move(position < 0 ? 0 : position - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(geometry.order.length - 1);
    else if ((event.key === "Enter" || event.key === " ") && activeIndex >= 0) {
      event.preventDefault();
      onOpen(points[activeIndex][0]);
    } else if (event.key === "Escape") setActive(null);
  }

  const { plot, x, y, xDomain, yDomain } = geometry;
  const xTicks = ticks(xDomain[0], xDomain[1], Math.max(3, Math.round((plot.right - plot.left) / 90)));
  const yTicks = ticks(yDomain[0], yDomain[1], Math.max(3, Math.round((plot.bottom - plot.top) / 60)));
  const activePoint = activeIndex >= 0 ? points[activeIndex] : null;
  const activePixel = activeIndex >= 0 ? geometry.pixels[activeIndex] : null;

  return (
    <figure className={className} aria-labelledby={heading === null ? labelledBy : "chart-title"}>
      {heading !== null ? (
        <h2 id="chart-title" className="text-[18px] font-semibold">
          {heading}
        </h2>
      ) : null}
      <div ref={ref} className={`relative w-full rounded-lg border border-line bg-surface ${heading !== null ? "mt-3" : ""}`}>
        <div
          tabIndex={0}
          role="group"
          aria-label={`Chart of ${testsCount(points.length)}${offView > 0 ? ` (${offView} more above the view)` : ""}: oxygen against pressure. Use the arrow keys to move from dot to dot and Enter to open a test.`}
          onKeyDown={onKey}
          onBlur={() => setActive((current) => (current?.byKey ? null : current))}
          data-testid="tests-chart"
          data-stale={stale ? "true" : undefined}
          className={`rounded-sm transition-opacity duration-200 ${stale ? "opacity-50" : ""}`}
        >
          <svg
            width={width}
            height={height}
            className="block cursor-crosshair select-none"
            aria-hidden="true"
            onPointerMove={(event) => {
              const index = pointerAt(event);
              setActive(index >= 0 ? { index, byKey: false } : null);
            }}
            onPointerLeave={() => setActive((current) => (current?.byKey ? current : null))}
            onClick={(event) => {
              const index = pointerAt(event);
              if (index >= 0) onOpen(points[index][0]);
            }}
          >
            <defs>
              <clipPath id="plot-clip">
                <rect x={plot.left} y={plot.top} width={Math.max(0, plot.right - plot.left)} height={Math.max(0, plot.bottom - plot.top)} />
              </clipPath>
            </defs>

            {/* Grid and axes: hairlines, recessive. */}
            {yTicks.map((tick) => (
              <g key={`y${tick}`}>
                <line x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} className="stroke-rule" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={plot.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-ink-3 font-mono text-[13px] tabular-nums">
                  {trimNumber(tick)}
                </text>
              </g>
            ))}
            {xTicks.map((tick) => (
              <g key={`x${tick}`}>
                <line x1={x(tick)} x2={x(tick)} y1={plot.top} y2={plot.bottom} className="stroke-rule" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={x(tick)} y={plot.bottom + 18} textAnchor="middle" className="fill-ink-3 font-mono text-[13px] tabular-nums">
                  {trimNumber(tick)}
                </text>
              </g>
            ))}
            <line x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} className="stroke-control" strokeWidth={1} shapeRendering="crispEdges" />
            <line x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} className="stroke-control" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={(plot.left + plot.right) / 2} y={height - 8} textAnchor="middle" className="fill-ink-2 text-[13px] font-semibold">
              Oxygen (% of the gas)
            </text>
            <text
              transform={`translate(15 ${(plot.top + plot.bottom) / 2}) rotate(-90)`}
              textAnchor="middle"
              className="fill-ink-2 text-[13px] font-semibold"
            >
              Pressure (kPa)
            </text>

            {/* The chosen cabin air: a light window, clipped to the plot. */}
            {chosenAir && rect ? (
              <g data-testid="air-window" data-air={chosenAir.id} clipPath="url(#plot-clip)">
                <rect
                  x={x(rect.x0)}
                  y={y(rect.y1)}
                  width={Math.max(1, x(rect.x1) - x(rect.x0))}
                  height={Math.max(1, y(rect.y0) - y(rect.y1))}
                  // Geometry also as CSS, so a new cabin air glides the window instead of jumping.
                  style={
                    {
                      x: x(rect.x0),
                      y: y(rect.y1),
                      width: Math.max(1, x(rect.x1) - x(rect.x0)),
                      height: Math.max(1, y(rect.y0) - y(rect.y1)),
                      transition: "x 320ms var(--ease-out), y 320ms var(--ease-out), width 320ms var(--ease-out), height 320ms var(--ease-out)",
                    } as React.CSSProperties
                  }
                  className="fill-brand-soft/90 stroke-brand"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  rx={6}
                />
              </g>
            ) : null}

            <Dots points={points} pixels={geometry.pixels} seriesOf={seriesOf} />

            {chosenAir && rect ? (
              <WindowLabel
                text={`Chosen cabin air: ${chosenAir.label}`}
                x={x(rect.x0)}
                y={y(rect.y1)}
                plotLeft={plot.left}
                plotRight={plot.right}
                plotTop={plot.top}
              />
            ) : null}

            {activePoint && activePixel ? (
              <path
                d={shapePath(seriesOf(activePoint[1]).shape, MARK_R + 2.5)}
                transform={`translate(${activePixel.x} ${activePixel.y})`}
                className={`${seriesFill(seriesOf(activePoint[1]).slot)} stroke-ink`}
                strokeWidth={2}
              />
            ) : null}
          </svg>
        </div>

        {activePoint && activePixel ? (
          <div
            role="status"
            data-testid="chart-tooltip"
            className="pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-md border border-line bg-surface px-3 py-2 text-[13px] leading-[17px] text-ink-2 shadow-pop"
            style={{
              left: Math.min(Math.max(activePixel.x + 12, 4), width - 200),
              top: Math.max(activePixel.y - 70, 4),
            }}
          >
            <p className="font-mono font-medium text-ink">{activePoint[0]}</p>
            <p className="tabular-nums text-ink">
              {trimNumber(toPercent(activePoint[2]))}% oxygen, {trimNumber(activePoint[3])} kPa
            </p>
            <p className="text-ink-2">{investigationLabel(activePoint[1], acronyms.get(activePoint[1]))}</p>
            <p className="text-ink-2">{active?.byKey ? "Press Enter to open this test" : "Click to open this test"}</p>
          </div>
        ) : null}
      </div>

      <figcaption className="mt-3 space-y-2 text-[13px] leading-[17px] text-ink-2">
        <ul aria-label="Legend" data-testid="chart-legend" className="flex flex-wrap gap-x-6 gap-y-1">
          {legend.map((entry) => (
            <li key={entry.key} data-legend={entry.key} className="flex items-center gap-2">
              <MarkKey shape={entry.shape} slot={entry.slot} />
              <span>
                {entry.key === "other"
                  ? `Other investigations (grey): ${entry.psiIds.map(nameOf).join("; ")}`
                  : nameOf(entry.key)}{" "}
                <span className="tabular-nums text-ink-2">({entry.count === 1 ? "1 test" : `${entry.count.toLocaleString("en-US")} tests`})</span>
              </span>
            </li>
          ))}
          {chosenAir ? (
            <li className="flex items-center gap-2">
              <svg width="16" height="12" aria-hidden="true" className="shrink-0">
                <rect x="0.75" y="0.75" width="14.5" height="10.5" className="fill-brand-soft stroke-brand" strokeWidth={1.5} strokeDasharray="2 2" />
              </svg>
              <span>
                Chosen cabin air: {chosenAir.label} ({chosenAir.plain})
              </span>
            </li>
          ) : null}
        </ul>
        <p data-testid="chart-summary" className="max-w-[70ch] text-[15px] leading-[22px] tabular-nums">
          {testsCount(allPoints.length)} {allPoints.length === 1 ? "states" : "state"} both oxygen and pressure.{" "}
          {notPlotted > 0
            ? `${notPlotted.toLocaleString("en-US")} more ${notPlotted === 1 ? "lacks oxygen or pressure, so it is" : "lack oxygen or pressure, so they are"} off the chart. `
            : null}
          {chosenAir && inside !== null ? (
            <span data-testid="inside-count">
              {inside.toLocaleString("en-US")} of these {allPoints.length.toLocaleString("en-US")} tests fall inside the chosen cabin air
              ({chosenAir.label}), edges included.
              {windowLimitsFlow(chosenAir.window) ? " The count ignores airflow." : ""}
            </span>
          ) : null}
          {air.status === "error" ? "The cabin airs did not load, so no window is drawn." : null}
        </p>
        {view.canCut ? (
          <div data-testid="chart-view" data-off-view={offView} className="flex max-w-[70ch] flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[15px] leading-[22px] tabular-nums">
              {offView > 0 ? (
                <>
                  {testsCount(offView)} above {trimNumber(geometry.yDomain[1])} kPa {offView === 1 ? "is" : "are"} off this view:{" "}
                  {[...view.above.entries()].map(([psiId, count]) => `${nameOf(psiId)} (${count.toLocaleString("en-US")})`).join("; ")}.
                </>
              ) : (
                <>Every pressure is on the chart.</>
              )}
            </p>
            <button
              type="button"
              aria-pressed={allPressures}
              onClick={() => setAllPressures((value) => !value)}
              className="btn btn-secondary"
            >
              {allPressures ? "Show the usual pressure range" : "Show every pressure"}
            </button>
          </div>
        ) : null}
      </figcaption>
    </figure>
  );
}

/** The dots. Memoised: hovering redraws only the highlight, not every dot. */
const Dots = memo(function Dots({
  points,
  pixels,
  seriesOf,
}: {
  points: TestPoint[];
  pixels: { x: number; y: number }[];
  seriesOf: (psiId: string) => Series;
}) {
  const paths = new Map<Shape, string>();
  const pathOf = (shape: Shape) => {
    let d = paths.get(shape);
    if (!d) {
      d = shapePath(shape, MARK_R);
      paths.set(shape, d);
    }
    return d;
  };
  return (
    <g data-testid="chart-dots">
      {points.map((point, index) => {
        const s = seriesOf(point[1]);
        return (
          <g key={point[0]} transform={`translate(${pixels[index].x.toFixed(1)} ${pixels[index].y.toFixed(1)})`}>
            {/* The mark pops in where it sits, sweeping left to right (redesign motion; off with reduced motion). */}
            <path
              data-test-id={point[0]}
              d={pathOf(s.shape)}
              className={`mark-in ${seriesFill(s.slot)} stroke-surface`}
              style={{ ["--d" as string]: Math.min(700, Math.round(pixels[index].x * 0.45)) }}
              fillOpacity={0.8}
              strokeWidth={0.75}
            />
          </g>
        );
      })}
    </g>
  );
});

/** The window's name, at its top-left corner, kept inside the plot and readable over dots. */
function WindowLabel({
  text,
  x,
  y,
  plotLeft,
  plotRight,
  plotTop,
}: {
  text: string;
  x: number;
  y: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
}) {
  // Above the window's top edge when there is room, otherwise just inside it.
  const estimated = text.length * 6.6;
  const left = Math.max(plotLeft + 6, Math.min(x, plotRight - estimated - 6));
  const top = y - 6 >= plotTop + 12 ? y - 6 : Math.max(plotTop + 14, y + 16);
  return (
    <text
      data-testid="air-window-label"
      x={left}
      y={top}
      className="fill-brand stroke-surface text-[13px] font-semibold"
      strokeWidth={3}
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {text}
    </text>
  );
}

/** A legend key: the investigation's mark, in its colour. */
export function MarkKey({ shape, slot }: { shape: Shape; slot: number | null }) {
  return (
    <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true" className="shrink-0">
      <path d={shapePath(shape, MARK_R)} className={`${seriesFill(slot)} stroke-surface`} strokeWidth={0.75} />
    </svg>
  );
}
