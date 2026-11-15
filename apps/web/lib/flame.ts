// The rules of the animated droplet flame on the suppression test bench (Linear DOB-142). The
// picture is an illustration driven by the flame temperature engine's numbers for one mixture:
//  - the predicted share burned decides when the flame goes out and how big the droplet left is,
//    by the engine's own rule (flex_tests.json header): share = 1 - (diameter left / start)^3;
//  - the flame ceiling temperature decides how bright the flame is drawn;
//  - the droplet size at the start decides the size of the droplet.
// The time axis is illustration time: the droplet shrinks by the d-squared law (the square of the
// diameter falls in a straight line), and nothing here is a measured time. Pure, unit tested in
// tests/unit/flame.test.ts; components/suppress/FlameSim.tsx draws it.
// Code generated with SI assistance (Claude Code), reviewed by the team.

/** Seconds a droplet would take to burn away in the illustration. */
export const FULL_BURN_SECONDS = 4.2;
/** A flame is on screen at least this long, so a very early flame-out is still seen. */
export const MIN_BURN_SECONDS = 0.55;
export const IGNITE_SECONDS = 0.5;
export const FADE_SECONDS = 0.8;
/** The droplet left stays on screen this long before the next ignition. */
export const HOLD_SECONDS = 2.6;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (p: number) => 1 - (1 - clamp01(p)) ** 3;

/** Diameter left over diameter at the start, after `share` of the droplet has burned. */
export function diameterRatio(share: number): number {
  return Math.cbrt(1 - clamp01(share));
}

/** The share burned at fraction `tau` of a full burn, by the d-squared law. */
export function shareAt(tau: number): number {
  return 1 - (1 - clamp01(tau)) ** 1.5;
}

/** The fraction of a full burn at which `share` has burned (the inverse of shareAt). */
export function tauFor(share: number): number {
  return 1 - (1 - clamp01(share)) ** (2 / 3);
}

/** Seconds the flame burns in the illustration before it goes out at `share`. */
export function burnSeconds(share: number): number {
  return Math.max(MIN_BURN_SECONDS, tauFor(share) * FULL_BURN_SECONDS);
}

/** Seconds of one loop: ignition, burning, the flame going out, then the droplet left. */
export function cycleSeconds(share: number): number {
  return IGNITE_SECONDS + burnSeconds(share) + FADE_SECONDS + HOLD_SECONDS;
}

export type FlamePhase = "igniting" | "burning" | "going-out" | "out";

export interface FlameFrame {
  phase: FlamePhase;
  /** Share of the droplet burned so far, 0 up to the prediction. */
  share: number;
  /** The droplet's diameter over its diameter at the start. */
  ratio: number;
  /** How strong the flame is drawn, 0 (none) to 1. */
  flame: number;
  /** Seconds since the flame began to go out; 0 before that. */
  sinceOut: number;
}

/** The picture at `seconds` into a loop for a mixture whose predicted share burned is `share`. */
export function frameAt(seconds: number, share: number): FlameFrame {
  const final = clamp01(share);
  const burning = burnSeconds(final);
  const t = ((seconds % cycleSeconds(final)) + cycleSeconds(final)) % cycleSeconds(final);
  if (t < IGNITE_SECONDS) {
    return { phase: "igniting", share: 0, ratio: 1, flame: easeOut(t / IGNITE_SECONDS), sinceOut: 0 };
  }
  if (t < IGNITE_SECONDS + burning) {
    const now = shareAt(((t - IGNITE_SECONDS) / burning) * tauFor(final));
    return { phase: "burning", share: Math.min(final, now), ratio: diameterRatio(Math.min(final, now)), flame: 1, sinceOut: 0 };
  }
  const sinceOut = t - IGNITE_SECONDS - burning;
  const left = { share: final, ratio: diameterRatio(final), sinceOut };
  if (sinceOut < FADE_SECONDS) return { phase: "going-out", ...left, flame: 1 - easeOut(sinceOut / FADE_SECONDS) };
  return { phase: "out", ...left, flame: 0 };
}

/** The still picture for visitors who ask for reduced motion: the flame out, the droplet left. */
export function restFrame(share: number): FlameFrame {
  const final = clamp01(share);
  return { phase: "out", share: final, ratio: diameterRatio(final), flame: 0, sinceOut: FADE_SECONDS + HOLD_SECONDS };
}

/** Where a ceiling temperature sits between the coldest and hottest mixture on the bench, 0 to 1. */
export function heat(temperatureK: number | null, coldestK: number, hottestK: number): number {
  if (temperatureK === null || !(hottestK > coldestK)) return 0.5;
  return clamp01((temperatureK - coldestK) / (hottestK - coldestK));
}

/**
 * The flame radius that fits around a centre in a stage of the given height: `wanted`, cut to the
 * room there is, and never below zero (a hidden stage has no width, so its centre can sit at or
 * left of zero; DOB-146).
 */
export function fitRadius(wanted: number, cx: number, cy: number, height: number, margin = 10): number {
  return Math.max(0, Math.min(wanted, Math.min(cx, cy, height - cy) - margin));
}

export const PHASE_WORD: Record<FlamePhase, string> = {
  igniting: "Igniting",
  burning: "Burning",
  "going-out": "Going out",
  out: "Flame out",
};
