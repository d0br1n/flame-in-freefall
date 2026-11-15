// The arithmetic of the tests chart (oxygen against pressure): scales, ticks, the cabin-air
// window as a rectangle, and the count of dots inside it. No drawing here. Pure, unit tested
// (tests/unit/chart.test.ts). The window numbers come from the backend (GET /air/presets).
import type { AirWindow, TestPoint } from "./types";
import { toPercent } from "./tests";

export type Domain = [number, number];

/** A tick step of 1, 2 or 5 times a power of ten that gives about `count` ticks (as d3 does). */
export function niceStep(span: number, count = 5): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(count, 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction >= Math.sqrt(50) ? 10 : fraction >= Math.sqrt(10) ? 5 : fraction >= Math.sqrt(2) ? 2 : 1;
  return nice * power;
}

/** Ticks on multiples of the nice step, inside [lo, hi]. */
export function ticks(lo: number, hi: number, count = 5): number[] {
  const step = niceStep(hi - lo, count);
  const first = Math.ceil(lo / step - 1e-9) * step;
  const out: number[] = [];
  for (let value = first; value <= hi + step * 1e-9; value += step) out.push(Number(value.toFixed(10)));
  return out;
}

/**
 * The axis range for some values: their extent (plus `include`, for example the window's sides),
 * padded a little so no dot sits on the frame, then widened to whole tick steps. A range that
 * starts at 0 or above never goes below 0 (a pressure or a share cannot be negative).
 */
export function niceDomain(values: number[], include: number[] = [], count = 5): Domain {
  const all = [...values, ...include].filter(Number.isFinite);
  if (all.length === 0) return [0, 1];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (lo === hi) {
    const half = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= half;
    hi += half;
  }
  const pad = (hi - lo) * 0.04;
  const floor = lo >= 0 ? 0 : -Infinity;
  const paddedLo = Math.max(floor, lo - pad);
  const paddedHi = hi + pad;
  const step = niceStep(paddedHi - paddedLo, count);
  return [Math.max(floor, Math.floor(paddedLo / step) * step), Math.ceil(paddedHi / step) * step];
}

/** The q-quantile (0 to 1) of values sorted from low to high, nearest rank. NaN for no values. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

/** Below this many points the axis always shows every value. */
const VIEW_MIN_POINTS = 20;

/**
 * The default range of the pressure axis. Most tests run near one atmosphere and a few at several;
 * a linear axis up to the highest one squeezes all the others into a strip. When the highest
 * value is above 1.5 times the 98th percentile, the default view stops near that bound (widened
 * to whole ticks, and always covering `include`, the window's sides). The points above it are
 * not dropped: the caller counts them and offers the full range. `cut` is false when every value fits.
 */
export function pressureView(values: number[], include: number[] = [], count = 5): { domain: Domain; cut: boolean } {
  const finite = values.filter(Number.isFinite);
  const full = niceDomain(finite, include, count);
  if (finite.length < VIEW_MIN_POINTS) return { domain: full, cut: false };
  const sorted = [...finite].sort((a, b) => a - b);
  const limit = quantile(sorted, 0.98) * 1.5;
  const max = sorted[sorted.length - 1];
  if (!(limit > 0) || max <= limit) return { domain: full, cut: false };
  const domain = niceDomain(sorted.filter((value) => value <= limit), include, count);
  return domain[1] >= max ? { domain: full, cut: false } : { domain, cut: true };
}

/** A linear map from a data domain to a pixel range. */
export function linearScale([d0, d1]: Domain, [r0, r1]: [number, number]): (value: number) => number {
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/** True when a test's oxygen (mole fraction) and pressure (kPa) are inside the window. Ends count as inside. */
export function insideWindow(o2: number, pressureKpa: number, window: AirWindow): boolean {
  return (
    (window.o2_min === null || o2 >= window.o2_min) &&
    (window.o2_max === null || o2 <= window.o2_max) &&
    (window.pressure_kpa_min === null || pressureKpa >= window.pressure_kpa_min) &&
    (window.pressure_kpa_max === null || pressureKpa <= window.pressure_kpa_max)
  );
}

/** How many of the plotted points fall inside the window (a lookup over the points, not a model). */
export function countInside(points: TestPoint[], window: AirWindow): number {
  return points.reduce((sum, [, , o2, pressure]) => sum + (insideWindow(o2, pressure, window) ? 1 : 0), 0);
}

/** True when the window also limits airflow, which the chart does not show. */
export function windowLimitsFlow(window: AirWindow): boolean {
  return window.flow_cm_s_min !== null || window.flow_cm_s_max !== null;
}

/** The window's finite sides in chart units (oxygen in percent), to keep it on the chart. */
export function windowBounds(window: AirWindow): { x: number[]; y: number[] } {
  const x = [window.o2_min, window.o2_max].filter((v): v is number => v !== null).map(toPercent);
  const y = [window.pressure_kpa_min, window.pressure_kpa_max].filter((v): v is number => v !== null);
  return { x, y };
}

/**
 * The window as a rectangle in chart units (x = oxygen percent, y = kPa), clipped to the plot.
 * An open side runs to the edge of the plot. Null when the window misses the plot entirely.
 */
export function windowRect(
  window: AirWindow,
  xDomain: Domain,
  yDomain: Domain,
): { x0: number; x1: number; y0: number; y1: number } | null {
  const x0 = Math.max(xDomain[0], window.o2_min === null ? -Infinity : toPercent(window.o2_min));
  const x1 = Math.min(xDomain[1], window.o2_max === null ? Infinity : toPercent(window.o2_max));
  const y0 = Math.max(yDomain[0], window.pressure_kpa_min ?? -Infinity);
  const y1 = Math.min(yDomain[1], window.pressure_kpa_max ?? Infinity);
  if (x0 > x1 || y0 > y1) return null;
  return { x0, x1, y0, y1 };
}

// ---------------------------------------------------------------- series

/** Mark shapes, one per investigation, so the series read without colour. */
export const SHAPES = ["circle", "square", "triangle", "diamond", "triangle-down", "plus", "cross", "hexagon"] as const;
export type Shape = (typeof SHAPES)[number];

/** Colour slots in fixed order (CSS tokens --color-series-1..8 in app/globals.css). */
export const SERIES_SLOTS = SHAPES.length;

export interface Series {
  psi_id: string;
  /** 1..8, or null for "other" past the eighth investigation. */
  slot: number | null;
  shape: Shape;
}

function psiNumber(psiId: string): number {
  const match = /(\d+)/.exec(psiId);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Colour and shape per investigation, in PSI-number order over the full list of investigations
 * that have tests, so a filter never repaints the survivors (colour follows the investigation).
 */
export function assignSeries(psiIds: string[]): Map<string, Series> {
  const sorted = [...new Set(psiIds)].sort((a, b) => psiNumber(a) - psiNumber(b) || a.localeCompare(b));
  const map = new Map<string, Series>();
  sorted.forEach((psi_id, index) => {
    const inSlots = index < SERIES_SLOTS;
    map.set(psi_id, { psi_id, slot: inSlots ? index + 1 : null, shape: inSlots ? SHAPES[index] : "circle" });
  });
  return map;
}

/** An SVG path of a mark of radius `r`, centred on 0,0. */
export function shapePath(shape: Shape, r: number): string {
  const f = (n: number) => Number(n.toFixed(2));
  switch (shape) {
    case "circle":
      return `M${f(-r)},0a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`;
    case "square": {
      const s = r * 0.9;
      return `M${f(-s)},${f(-s)}H${f(s)}V${f(s)}H${f(-s)}Z`;
    }
    case "triangle":
      return `M0,${f(-r * 1.15)}L${f(r * 1.1)},${f(r * 0.8)}H${f(-r * 1.1)}Z`;
    case "triangle-down":
      return `M0,${f(r * 1.15)}L${f(r * 1.1)},${f(-r * 0.8)}H${f(-r * 1.1)}Z`;
    case "diamond":
      return `M0,${f(-r * 1.25)}L${f(r * 1.25)},0L0,${f(r * 1.25)}L${f(-r * 1.25)},0Z`;
    case "plus": {
      const a = r * 1.2;
      const b = r * 0.4;
      return `M${f(-b)},${f(-a)}H${f(b)}V${f(-b)}H${f(a)}V${f(b)}H${f(b)}V${f(a)}H${f(-b)}V${f(b)}H${f(-a)}V${f(-b)}H${f(-b)}Z`;
    }
    case "cross": {
      // The plus turned by 45 degrees.
      const a = r * 1.2;
      const b = r * 0.4;
      const pts = [
        [-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b],
      ].map(([x, y]) => [(x - y) * Math.SQRT1_2, (x + y) * Math.SQRT1_2]);
      return `M${pts.map(([x, y]) => `${f(x)},${f(y)}`).join("L")}Z`;
    }
    case "hexagon": {
      const pts = Array.from({ length: 6 }, (_, i) => [r * 1.1 * Math.cos((Math.PI / 3) * i), r * 1.1 * Math.sin((Math.PI / 3) * i)]);
      return `M${pts.map(([x, y]) => `${f(x)},${f(y)}`).join("L")}Z`;
    }
  }
}

/** The index of the point nearest to (x, y) in pixels, within `radius`, or -1. */
export function nearestPoint(pixels: { x: number; y: number }[], x: number, y: number, radius: number): number {
  let best = -1;
  let bestDistance = radius * radius;
  for (let i = 0; i < pixels.length; i += 1) {
    const dx = pixels[i].x - x;
    const dy = pixels[i].y - y;
    const distance = dx * dx + dy * dy;
    if (distance <= bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

export interface LegendEntry {
  /** A PSI ID, or "other" for the investigations past the colour slots. */
  key: string;
  psiIds: string[];
  slot: number | null;
  shape: Shape;
  count: number;
}

/**
 * The legend: one entry per investigation with its own colour, in slot order, then one "other"
 * entry for every investigation without one (grey circles), so the legend never repeats a mark.
 */
export function legendEntries(counts: Map<string, number>, seriesOf: (psiId: string) => Series): LegendEntry[] {
  const own: LegendEntry[] = [];
  const other: LegendEntry = { key: "other", psiIds: [], slot: null, shape: "circle", count: 0 };
  for (const [psiId, count] of counts) {
    const series = seriesOf(psiId);
    if (series.slot === null) {
      other.psiIds.push(psiId);
      other.count += count;
    } else own.push({ key: psiId, psiIds: [psiId], slot: series.slot, shape: series.shape, count });
  }
  own.sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));
  other.psiIds.sort((a, b) => psiNumber(a) - psiNumber(b) || a.localeCompare(b));
  return other.count > 0 ? [...own, other] : own;
}
