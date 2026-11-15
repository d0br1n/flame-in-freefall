// The one place that knows the visitor's chosen cabin air. Every page reads it through useAir();
// no page keeps its own copy (Linear DOB-84). The choice lives in the URL, so a copied link
// carries it: a preset as ?air=<preset id>, a custom air (the Overview's sliders) as
// ?air=custom&o2=<mole fraction>&p=<kPa>. The presets, their windows and the custom window all
// come from the backend (GET /air/presets, GET /air/window); this file holds no window numbers.
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { type ApiError, useApi } from "./api";
import { AIR_PARAM, O2_PARAM, PRESSURE_PARAM } from "./links";
import type { AirCoverage, AirPreset, AirPresets, AirWindow, CustomAirRange, Stage, StageCoverage } from "./types";

export const PRESETS_PATH = "/air/presets";
export const WINDOW_PATH = "/air/window";
/** The `air` value of a custom air in the URL, and the `id` the backend gives it. */
export const CUSTOM_ID = "custom";

/** What the URL asks for: a preset by id, or a custom point (oxygen as a mole fraction, pressure in kPa). */
export type AirChoice = { kind: "preset"; id: string } | { kind: "custom"; o2: number; p: number };

type QueryLike = URLSearchParams | { get(name: string): string | null } | string | null | undefined;

function read(query: QueryLike, name: string): string | null {
  if (query === null || query === undefined) return null;
  if (typeof query === "string") return new URLSearchParams(query.replace(/^\?/, "")).get(name);
  return query.get(name);
}

/** Oxygen as a mole fraction, written with at most 4 decimals (0.245). */
export function roundO2(value: number): number {
  return Number(value.toFixed(4));
}

/** Pressure in kPa, written with at most 2 decimals. */
export function roundKpa(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * The air the URL asks for, or null when it names none. A custom air needs a finite oxygen
 * between 0 and 1 and a positive pressure; otherwise it counts as no choice. Pure, unit tested.
 */
export function parseAirChoice(query: QueryLike): AirChoice | null {
  const air = read(query, AIR_PARAM)?.trim();
  if (!air) return null;
  if (air !== CUSTOM_ID) return { kind: "preset", id: air };
  const o2 = Number(read(query, O2_PARAM));
  const p = Number(read(query, PRESSURE_PARAM));
  if (!Number.isFinite(o2) || !Number.isFinite(p) || o2 <= 0 || o2 > 1 || p <= 0) return null;
  return { kind: "custom", o2: roundO2(o2), p: roundKpa(p) };
}

/**
 * The preset for the `air` value in the URL. An absent or unknown value falls back to the
 * backend's default, then to the first preset, so the first screen always shows a result.
 * Pure, unit tested.
 */
export function resolveAir(presets: AirPresets, param: string | null): { air: AirPreset | null; isDefault: boolean } {
  const byId = (id: string | null) => presets.presets.find((preset) => preset.id === id) ?? null;
  const chosen = byId(param);
  if (chosen) return { air: chosen, isDefault: false };
  return { air: byId(presets.default) ?? presets.presets[0] ?? null, isDefault: true };
}

/** The API query that names an air: air=<id> for a preset, o2=&pressure_kpa= for a custom air. Pure. */
export function airQuery(choice: AirChoice | string | null): string | null {
  if (choice === null || choice === "") return null;
  if (typeof choice === "string") return `${AIR_PARAM}=${encodeURIComponent(choice)}`;
  if (choice.kind === "preset") return choice.id ? `${AIR_PARAM}=${encodeURIComponent(choice.id)}` : null;
  return `o2=${roundO2(choice.o2)}&pressure_kpa=${roundKpa(choice.p)}`;
}

/** The API path of the coverage for one air, or null while the air is not known. Pure. */
export function coveragePath(choice: AirChoice | string | null): string | null {
  const query = airQuery(choice);
  return query ? `/air/coverage?${query}` : null;
}

/** GET /air/window for a custom point. Pure. */
export function windowPath(o2: number, p: number): string {
  return `${WINDOW_PATH}?o2=${roundO2(o2)}&pressure_kpa=${roundKpa(p)}`;
}

/** The URL of the current page with another air chosen; every other parameter is kept. Pure. */
export function urlWithAir(pathname: string, search: string, choice: AirChoice | string): string {
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  params.delete(O2_PARAM);
  params.delete(PRESSURE_PARAM);
  if (typeof choice === "string" || choice.kind === "preset") {
    params.set(AIR_PARAM, typeof choice === "string" ? choice : choice.id);
  } else {
    params.set(AIR_PARAM, CUSTOM_ID);
    params.set(O2_PARAM, String(roundO2(choice.o2)));
    params.set(PRESSURE_PARAM, String(roundKpa(choice.p)));
  }
  return `${pathname}?${params.toString()}`;
}

/**
 * Where the sliders sit for a preset (the URL keeps the preset id; this point is never written
 * to it). A closed window: its middle. An open side is closed by the slider's own range, so the
 * thumb sits inside the window. `isRange` is true when a side was open (the preset is a range,
 * not a point). Null for a quantity with no bound and no slider range. Pure, unit tested.
 */
export function windowPoint(
  window: AirWindow,
  range?: Pick<CustomAirRange, "o2_min" | "o2_max" | "pressure_kpa_min" | "pressure_kpa_max"> | null,
): { o2: number | null; p: number | null; isRange: boolean } {
  let open = false;
  const mid = (lo: number | null, hi: number | null, rlo?: number, rhi?: number) => {
    if (lo === null || hi === null) open = true;
    const a = lo ?? rlo ?? null;
    const b = hi ?? rhi ?? null;
    if (a !== null && b !== null) return (Math.max(a, rlo ?? a) + Math.min(b, rhi ?? b)) / 2;
    return a ?? b;
  };
  const o2 = mid(window.o2_min, window.o2_max, range?.o2_min, range?.o2_max);
  const p = mid(window.pressure_kpa_min, window.pressure_kpa_max, range?.pressure_kpa_min, range?.pressure_kpa_max);
  return { o2, p, isRange: open };
}

const pct = (fraction: number) => String(Number((fraction * 100).toFixed(1)));
const kpa = (value: number) => String(Number(value.toFixed(1)));

/**
 * The air in a few characters, from its window (or a custom air's point): "21% O₂ · 101.4 kPa",
 * "≥30% O₂ · ≤70.3 kPa", "≥40% O₂". Empty when the window bounds neither. Pure, unit tested.
 */
export function airShort(air: Pick<AirPreset, "window" | "point">): string {
  if (air.point) return `${pct(air.point.o2_mole_fraction)}% O₂ · ${kpa(air.point.pressure_kpa)} kPa`;
  const part = (lo: number | null, hi: number | null, fmt: (v: number) => string, unit: string) => {
    if (lo !== null && hi !== null) return `${fmt((lo + hi) / 2)}${unit}`;
    if (lo !== null) return `≥${fmt(lo)}${unit}`;
    if (hi !== null) return `≤${fmt(hi)}${unit}`;
    return null;
  };
  const w = air.window;
  return [part(w.o2_min, w.o2_max, pct, "% O₂"), part(w.pressure_kpa_min, w.pressure_kpa_max, kpa, " kPa")]
    .filter(Boolean)
    .join(" · ");
}

/** A value kept inside [min, max] and on the step grid that starts at min. Pure. */
export function snap(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  if (!(step > 0)) return clamped;
  const steps = Math.round((clamped - min) / step);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Math.min(max, Number((min + steps * step).toFixed(decimals)));
}

/**
 * Where to draw marks under a slider: the positions, as a share of the slider from 0 to 1, at
 * which at least one of `values` falls. Values that share one of `bins` positions give one mark;
 * values off the slider give none. Pure, unit tested.
 */
export function testedMarks(values: number[], min: number, max: number, bins = 120): number[] {
  if (!(max > min) || !(bins > 0)) return [];
  const seen = new Set<number>();
  for (const value of values) {
    if (!Number.isFinite(value) || value < min || value > max) continue;
    seen.add(Math.round(((value - min) / (max - min)) * bins));
  }
  return [...seen].sort((a, b) => a - b).map((bin) => bin / bins);
}

/** One catalogued test that states its air: oxygen as a mole fraction, pressure in kPa. */
export interface TestedAir {
  testId: string;
  o2: number;
  p: number;
}

/**
 * The catalogued test nearest to an air. The distance counts each axis in widths of its slider
 * (oxygen and pressure have different units), so 1 is as far as one whole slider. Of two
 * equally near tests the first in the list wins. Null without a test or a slider range. Pure,
 * unit tested.
 */
export function nearestTestedAir(
  at: { o2: number; p: number },
  tests: TestedAir[],
  range: Pick<CustomAirRange, "o2_min" | "o2_max" | "pressure_kpa_min" | "pressure_kpa_max">,
): (TestedAir & { distance: number }) | null {
  const o2Span = range.o2_max - range.o2_min;
  const pSpan = range.pressure_kpa_max - range.pressure_kpa_min;
  if (!(o2Span > 0) || !(pSpan > 0)) return null;
  let best: (TestedAir & { distance: number }) | null = null;
  for (const test of tests) {
    const distance = Math.hypot((at.o2 - test.o2) / o2Span, (at.p - test.p) / pSpan);
    if (best === null || distance < best.distance) best = { ...test, distance };
  }
  return best;
}

/** True when two choices name the same air. Pure. */
export function sameChoice(a: AirChoice | null, b: AirChoice | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "preset" && b.kind === "preset") return a.id === b.id;
  if (a.kind === "custom" && b.kind === "custom") return roundO2(a.o2) === roundO2(b.o2) && roundKpa(a.p) === roundKpa(b.p);
  return false;
}

/**
 * The air to show while a custom point loads: the last custom air, else the air that was on
 * screen before (a preset). Null only when nothing was shown yet, for example a page opened
 * straight on a custom air. Keeping an air on screen keeps the sliders mounted: a "loading" state
 * here replaced them and dropped the drag on the first move away from a preset (DOB-147). Pure.
 */
export function airWhileLoading<T>(lastCustom: T | null, shownBefore: T | null): T | null {
  return lastCustom ?? shownBefore;
}

export type AirState =
  | { status: "loading" }
  | { status: "error"; error: ApiError; retry: () => void }
  | {
      status: "ok";
      presets: AirPreset[];
      /** The air every page shows. Null only if the backend lists no preset at all. */
      air: AirPreset | null;
      /** The air as API paths name it (a preset, or the custom point). Null with `air`. */
      choice: AirChoice | null;
      /** True when the URL names no (known) air and the default is shown. */
      isDefault: boolean;
      source: "live" | "saved";
      /** The slider ranges of a custom air, or null while the backend offers none. */
      custom: CustomAirRange | null;
      /** The backend's sentence on what the sliders cover, or null. */
      customPlain: string | null;
      /** True when the URL asks for a custom air the backend could not give: the default is shown. */
      customUnavailable: boolean;
    };

/** The chosen cabin air. Call inside a <Suspense> boundary (it reads the URL). */
export function useAir(): AirState {
  const searchParams = useSearchParams();
  const asked = parseAirChoice(searchParams);
  const presets = useApi<AirPresets>(PRESETS_PATH);
  const customPath = asked?.kind === "custom" ? windowPath(asked.o2, asked.p) : null;
  const custom = useApi<AirPreset>(customPath);
  // While a new custom point loads, keep showing the previous custom window (no flash to "loading").
  const [kept, setKept] = useState<{ path: string; air: AirPreset } | null>(null);
  if (custom.status === "ok" && customPath && (kept === null || kept.path !== customPath || kept.air !== custom.data)) {
    setKept({ path: customPath, air: custom.data });
  }
  // The preset shown last: it stays on screen while the first custom point loads (DOB-147).
  const [shownPreset, setShownPreset] = useState<AirPreset | null>(null);

  if (presets.status === "loading") return { status: "loading" };
  if (presets.status === "error") return { status: "error", error: presets.error, retry: presets.retry };
  const base = {
    status: "ok" as const,
    presets: presets.data.presets,
    source: presets.source,
    custom: presets.data.custom ?? null,
    customPlain: presets.data.custom_plain ?? null,
  };

  if (asked?.kind === "custom") {
    const air = custom.status === "ok" ? custom.data : custom.status === "loading" ? airWhileLoading(kept?.air ?? null, shownPreset) : null;
    if (air) {
      // The point is the one asked for. An air kept on screen while this one loads still carries
      // its own point, and using that pulled the thumbs back to where they were (DOB-147).
      const askedPoint = { o2_mole_fraction: asked.o2, pressure_kpa: asked.p };
      const point = custom.status === "ok" ? (air.point ?? askedPoint) : askedPoint;
      return { ...base, air: { ...air, id: CUSTOM_ID, point }, choice: asked, isDefault: false, customUnavailable: false };
    }
    if (custom.status === "loading") return { status: "loading" };
    // The backend has no custom air (yet): show the default, and say so where the sliders are.
    const fallback = resolveAir(presets.data, null);
    return {
      ...base,
      air: fallback.air,
      choice: fallback.air ? { kind: "preset", id: fallback.air.id } : null,
      isDefault: true,
      customUnavailable: true,
    };
  }

  const { air, isDefault } = resolveAir(presets.data, asked?.kind === "preset" ? asked.id : null);
  if (air && shownPreset !== air) setShownPreset(air);
  return { ...base, air, choice: air ? { kind: "preset", id: air.id } : null, isDefault, customUnavailable: false };
}

/** Returns a function that chooses another air (a preset id or a custom point), keeping the page. */
export function useSetAir(): (choice: AirChoice | string) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useCallback(
    (choice: AirChoice | string) => router.replace(urlWithAir(pathname, searchParams.toString(), choice), { scroll: false }),
    [router, pathname, searchParams],
  );
}

export type StageCoverageState =
  | { status: "loading" }
  | { status: "error"; error: ApiError; retry: () => void }
  | { status: "ok"; air: AirPreset; coverage: StageCoverage | null };

/** What the chosen air covers for one stage of a fire (GET /air/coverage). */
export function useStageCoverage(stage: Stage): StageCoverageState {
  const air = useAir();
  const choice = air.status === "ok" ? air.choice : null;
  const coverage = useApi<AirCoverage>(coveragePath(choice));
  if (air.status === "error") return air;
  if (air.status === "loading" || !air.air || coverage.status === "loading") return { status: "loading" };
  if (coverage.status === "error") return { status: "error", error: coverage.error, retry: coverage.retry };
  return { status: "ok", air: air.air, coverage: coverage.data.stages[stage] ?? null };
}
