"use client";

// One small chart of a test: one or two panels that share the time axis (test seconds) with the
// other charts of the page. Plain SVG, no chart package. A vertical cursor marks the moment the
// video shows; a click or a drag on the chart moves it (and so the video). Drawn at its real
// pixel width. The arithmetic is in lib/chart.ts and lib/spread.ts (unit tested).
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { linearScale, niceDomain, ticks } from "@/lib/chart";
import type { Band } from "@/lib/spread";

export interface ChartLine {
  id: string;
  color: string;
  /** SVG dash pattern; every line has its own, so colour is never the only signal. */
  dash?: string;
  /** A step line holds each value until the next one (a read-out number). */
  step?: boolean;
  points: { t: number; y: number | null }[];
}

export interface ChartPanel {
  id: string;
  /** The label above the panel, with its unit. */
  title: string;
  lines: ChartLine[];
  /** A shaded stretch of time (the fitted window). */
  shade?: { from: number; to: number; label: string };
  /** A straight line to draw on top (the fitted line). */
  segment?: { t0: number; y0: number; t1: number; y1: number; color: string; dash?: string };
  /** Keep zero on the axis. */
  zero?: boolean;
}

export type MarkerKind = "ignition" | "extinction" | "faint" | "fan" | "si_seen" | "si_gone" | "person_seen" | "person_gone";

export interface ChartMarker {
  t: number;
  kind: MarkerKind;
}

export const MARKER_STYLE: Record<MarkerKind, { color: string; dash: string; label: string }> = {
  ignition: { color: "var(--color-accent)", dash: "5 3", label: "ignition" },
  // Not a state colour: a flame going out is data here, not an error.
  extinction: { color: "var(--color-ink)", dash: "2 3", label: "flame gone" },
  faint: { color: "var(--color-ember)", dash: "1 3", label: "last faint light" },
  fan: { color: "var(--color-ink-2)", dash: "7 2 1 2", label: "fan read-out changes" },
  // T-series: the SI grader's times and the person's times. Colour and dash both differ.
  si_seen: { color: "var(--color-series-1)", dash: "6 3", label: "flame seen, SI" },
  si_gone: { color: "var(--color-series-1)", dash: "2 3", label: "flame gone, SI" },
  person_seen: { color: "var(--color-ember)", dash: "6 3", label: "flame seen, person" },
  person_gone: { color: "var(--color-ember)", dash: "2 3", label: "flame gone, person" },
};

/** Stage band tints, by position in the stage list (design tokens, with a letter label in the band). */
export const BAND_COLORS = ["var(--color-series-1)", "var(--color-series-3)", "var(--color-series-4)", "var(--color-series-7)", "var(--color-series-5)"];

const MARGIN = { top: 16, right: 12, bottom: 4, left: 58 };
const AXIS_ROOM = 30;
const TITLE_LINE = 16;
const TITLE_PAD = 10;

/** A tick label that fits the left margin at 13 px: 2000000 reads "2M", 15000 reads "15k". */
export function tickText(tick: number): string {
  const size = Math.abs(tick);
  if (size >= 1e6) return `${Number((tick / 1e6).toPrecision(3))}M`;
  if (size >= 1e4) return `${Number((tick / 1e3).toPrecision(3))}k`;
  return String(Number(tick.toPrecision(4)));
}
const CHAR_W = 7;

/** A panel title cut into lines that fit the chart's width (breaks at spaces). */
export function wrapTitle(title: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of title.split(" ")) {
    if (line !== "" && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else line = line === "" ? word : `${line} ${word}`;
  }
  if (line !== "") lines.push(line);
  return lines;
}

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A line as SVG path text: a gap (null) lifts the pen; a step line holds values. */
export function linePath(
  points: ChartLine["points"],
  x: (t: number) => number,
  y: (value: number) => number,
  step = false,
): string {
  let d = "";
  let pen = false;
  for (const point of points) {
    if (point.y === null || !Number.isFinite(point.y)) {
      pen = false;
      continue;
    }
    const px = x(point.t).toFixed(1);
    const py = y(point.y).toFixed(1);
    if (!pen) d += `M${px} ${py}`;
    else d += step ? `H${px}V${py}` : `L${px} ${py}`;
    pen = true;
  }
  return d;
}

export interface TimeChartProps {
  /** data-chart value, and the base of the element ids. */
  id: string;
  /** What the chart shows, as its accessible name. */
  label: string;
  panels: ChartPanel[];
  range: [number, number];
  bands: Band[];
  markers: ChartMarker[];
  /** The moment shown, in test seconds. Null draws no cursor. */
  cursor: number | null;
  onSeek: (testTime: number) => void;
  panelHeight?: number;
  /** The stretch over which the fan voltage fell, shaded on every panel. */
  fall?: { from: number; to: number } | null;
}

export function TimeChart({ id, label, panels, range, bands, markers, cursor, onSeek, panelHeight = 96, fall = null }: TimeChartProps) {
  const [ref, width] = useWidth(640);
  const plotW = Math.max(100, width - MARGIN.left - MARGIN.right);
  const x = linearScale(range, [MARGIN.left, MARGIN.left + plotW]);
  const maxChars = Math.max(20, Math.floor((plotW + MARGIN.left) / CHAR_W));
  const titles = panels.map((panel) => wrapTitle(panel.title, maxChars));
  const tops: number[] = [];
  let cursorY = MARGIN.top - 8;
  titles.forEach((lines, index) => {
    cursorY += lines.length * TITLE_LINE + TITLE_PAD;
    tops[index] = cursorY;
    cursorY += panelHeight + (index < panels.length - 1 ? TITLE_PAD : 0);
  });
  const height = cursorY + AXIS_ROOM + MARGIN.bottom;
  const panelTop = (index: number) => tops[index];
  const axisTicks = ticks(range[0], range[1], Math.max(3, Math.floor(plotW / 90)));
  const dragging = useRef(false);

  const seekFrom = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * width;
    const fraction = Math.min(1, Math.max(0, (px - MARGIN.left) / plotW));
    onSeek(range[0] + fraction * (range[1] - range[0]));
  };

  return (
    <div ref={ref} data-testid="spread-chart" data-chart={id} className="w-full">
      <svg
        role="img"
        aria-label={label}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block max-w-full cursor-col-resize select-none bg-card"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFrom(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) seekFrom(event);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        {panels.map((panel, index) => {
          const top = panelTop(index);
          const values = panel.lines.flatMap((line) => line.points.flatMap((p) => (p.y === null ? [] : [p.y])));
          if (panel.segment) values.push(panel.segment.y0, panel.segment.y1);
          const hasData = values.length > 0;
          const domain = hasData ? niceDomain(values, panel.zero ? [0] : [], 3) : ([0, 1] as [number, number]);
          const y = linearScale(domain, [top + panelHeight, top]);
          const yTicks = ticks(domain[0], domain[1], 3);
          return (
            <g key={panel.id} data-panel={panel.id}>
              <text className="fill-ink" fontSize={13} fontWeight={600}>
                {titles[index].map((line, n) => (
                  <tspan key={n} x={4} y={top - 11 - (titles[index].length - 1 - n) * TITLE_LINE}>
                    {line}
                  </tspan>
                ))}
              </text>
              <rect x={MARGIN.left} y={top} width={plotW} height={panelHeight} fill="none" stroke="var(--color-rule)" />
              {bands.map((band) => (
                <rect
                  key={`${band.stage}-${band.index}`}
                  x={x(band.start_s)}
                  y={top}
                  width={Math.max(0, x(band.end_s) - x(band.start_s))}
                  height={panelHeight}
                  fill={BAND_COLORS[band.index % BAND_COLORS.length]}
                  opacity={0.13}
                  data-band={band.stage}
                />
              ))}
              {fall ? (
                <rect
                  data-fall="fan-voltage"
                  x={x(fall.from)}
                  y={top}
                  width={Math.max(1.5, x(fall.to) - x(fall.from))}
                  height={panelHeight}
                  fill="var(--color-ink-2)"
                  opacity={0.28}
                />
              ) : null}
              {panel.shade ? (
                <g data-shade="fitted-window">
                  <rect
                    x={x(panel.shade.from)}
                    y={top}
                    width={Math.max(1, x(panel.shade.to) - x(panel.shade.from))}
                    height={panelHeight}
                    fill="var(--color-ink)"
                    opacity={0.09}
                  />
                </g>
              ) : null}
              {yTicks.map((tick) => (
                <g key={tick}>
                  <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(tick)} y2={y(tick)} stroke="var(--color-rule)" strokeWidth={0.5} />
                  <text x={MARGIN.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={13} className="fill-ink-2">
                    {tickText(tick)}
                  </text>
                </g>
              ))}
              {hasData ? (
                panel.lines.map((line) => (
                  <path
                    key={line.id}
                    d={linePath(line.points, x, y, line.step)}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={1.8}
                    strokeDasharray={line.dash}
                    strokeLinejoin="round"
                    data-line={line.id}
                  />
                ))
              ) : (
                <text x={MARGIN.left + plotW / 2} y={top + panelHeight / 2} textAnchor="middle" fontSize={13} className="fill-ink-2">
                  no values in the data
                </text>
              )}
              {panel.segment ? (
                <line
                  x1={x(panel.segment.t0)}
                  y1={y(panel.segment.y0)}
                  x2={x(panel.segment.t1)}
                  y2={y(panel.segment.y1)}
                  stroke={panel.segment.color}
                  strokeWidth={1.5}
                  strokeDasharray={panel.segment.dash}
                  data-line="fitted"
                />
              ) : null}
            </g>
          );
        })}
        {markers.map((marker, index) => {
          const style = MARKER_STYLE[marker.kind];
          return (
            <g key={`${marker.kind}-${index}`} data-marker={marker.kind}>
              {panels.map((panel, p) => (
                <line
                  key={panel.id}
                  x1={x(marker.t)}
                  x2={x(marker.t)}
                  y1={panelTop(p)}
                  y2={panelTop(p) + panelHeight}
                  stroke={style.color}
                  strokeWidth={1.3}
                  strokeDasharray={style.dash}
                />
              ))}
            </g>
          );
        })}
        {axisTicks.map((tick) => (
          <text
            key={tick}
            x={x(tick)}
            y={panelTop(panels.length - 1) + panelHeight + 17}
            textAnchor="middle"
            fontSize={13}
            className="fill-ink-2"
          >
            {tick}
          </text>
        ))}
        <text
          x={MARGIN.left + plotW}
          y={height - 2}
          textAnchor="end"
          fontSize={13}
          className="fill-ink-2"
        >
          test time (s)
        </text>
        {cursor !== null && cursor >= range[0] && cursor <= range[1] ? (
          <line
            data-testid="chart-cursor"
            x1={x(cursor)}
            x2={x(cursor)}
            y1={panelTop(0) - 2}
            y2={panelTop(panels.length - 1) + panelHeight}
            stroke="var(--color-ink)"
            strokeWidth={1.6}
          />
        ) : null}
      </svg>
    </div>
  );
}
