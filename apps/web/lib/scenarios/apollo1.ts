// The Apollo 1 scenario (27 January 1967): what burnrate would have shown for that cabin air.
// The historical facts below come from the Apollo 204 Review Board report (NASA, 1967) and are
// the only numbers on the page not read from the API; each carries its source. The research
// behind them is research/apollo1-fire-1967/report.md. The tested oxygen and pressure range is
// read from GET /air/presets (field `custom`), never typed here. Pure, unit tested
// (tests/unit/apollo1.test.ts).
// Code generated with SI assistance (Claude Code), reviewed by the team.
import type { CustomAirRange } from "@/lib/types";

export const BOARD_FINDINGS_URL = "https://www.nasa.gov/wp-content/uploads/static/history/Apollo204/find.html";
export const BOARD_CHRONOLOGY_URL = "https://www.nasa.gov/wp-content/uploads/static/history/Apollo204/chro.html";
export const BOARD_SOURCE = "Apollo 204 Review Board, 1967";

/** One psi in kPa (exact by definition of the pound-force and the inch). */
export const KPA_PER_PSI = 6.894757;

/** The cabin air during the test: 100% oxygen at 16.7 psia (Board findings). */
export const APOLLO1_AIR = { o2MoleFraction: 1, pressurePsia: 16.7 } as const;

export function psiaToKpa(psia: number): number {
  return Number((psia * KPA_PER_PSI).toFixed(1));
}

/** Seconds from midnight GMT for "hh:mm:ss.s". */
export function gmtSeconds(time: string): number {
  const [h, m, s] = time.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

export interface TimelineEvent {
  id: string;
  /** The Board's GMT time. */
  gmt: string;
  label: string;
}

/** The Board's clock of the fire, GMT (EST is GMT minus 5 h). Wording follows the Board. */
export const TIMELINE: readonly TimelineEvent[] = [
  { id: "transient", gmt: "23:30:54.8", label: "A brief power surge. Most probable start: an electrical arc low in the left equipment bay" },
  { id: "call", gmt: "23:31:04.7", label: "First report of a fire from the cabin" },
  { id: "rupture", gmt: "23:31:19.4", label: "The cabin wall splits under the pressure" },
  { id: "silence", gmt: "23:31:22.4", label: "All voice and data from the cabin end" },
];

/** Seconds after the first event, rounded to 0.1 s. Pure. */
export function offsets(events: readonly TimelineEvent[] = TIMELINE): number[] {
  const start = gmtSeconds(events[0].gmt);
  return events.map((event) => Number((gmtSeconds(event.gmt) - start).toFixed(1)));
}

export type RangeVerdict = "inside" | "above" | "below";

/** Where a value sits against a tested range. Pure. */
export function verdict(value: number, min: number, max: number): RangeVerdict {
  if (value > max) return "above";
  if (value < min) return "below";
  return "inside";
}

export interface AirCheck {
  o2: RangeVerdict;
  pressure: RangeVerdict;
  /** True only when both oxygen and pressure fall inside the tested range. */
  tested: boolean;
}

/** The Apollo 1 air against the range of the catalogued PSI tests (from GET /air/presets). Pure. */
export function checkAir(range: Pick<CustomAirRange, "o2_min" | "o2_max" | "pressure_kpa_min" | "pressure_kpa_max">): AirCheck {
  const o2 = verdict(APOLLO1_AIR.o2MoleFraction, range.o2_min, range.o2_max);
  const pressure = verdict(psiaToKpa(APOLLO1_AIR.pressurePsia), range.pressure_kpa_min, range.pressure_kpa_max);
  return { o2, pressure, tested: o2 === "inside" && pressure === "inside" };
}

/** A mole fraction as a percentage with at most 1 decimal ("40", "100"). Pure. */
export function percent(fraction: number): string {
  return String(Number((fraction * 100).toFixed(1)));
}

/** How many times richer in oxygen `value` is than `max`, at most 1 decimal ("2.5"). Pure. */
export function richer(value: number, max: number): string {
  return String(Number((value / max).toFixed(1)));
}
