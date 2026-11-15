// Pure helpers of the Compare page (CompareView.tsx), unit tested in tests/unit/compare.test.ts.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import type { CompareRow } from "@/lib/types";

export interface RangeValue {
  min: number;
  max: number;
}

/** "psi-69, PSI-68,68" -> ["PSI-69", "PSI-68"]: normalised, de-duplicated, order kept, at most four. */
export function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim().toUpperCase();
    if (!value) continue;
    const id = /^\d+$/.test(value) ? `PSI-${value}` : value;
    if (/^PSI-\d+$/.test(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, 4);
}

/**
 * The drawing axis of a range row: from the lowest min to the highest max of the cells that state a
 * range. Only for drawing each investigation's own bar on a common scale; no value is merged.
 */
export function rangeAxis(row: Pick<CompareRow, "cells">): [number, number] | null {
  const ranges = row.cells
    .map((cell) => cell.value as RangeValue | null)
    .filter((value): value is RangeValue => !!value && typeof value.min === "number" && typeof value.max === "number");
  if (ranges.length === 0) return null;
  return [Math.min(...ranges.map((r) => r.min)), Math.max(...ranges.map((r) => r.max))];
}

/** Rows the API sends that the page leaves out: each investigation's limits live on /limitations. */
const HIDDEN_ROWS = new Set(["cannot_tell"]);

/** The rows the table shows. The "rows differ" count and the filter work on these only. */
export function shownRows<T extends Pick<CompareRow, "key">>(rows: T[]): T[] {
  return rows.filter((row) => !HIDDEN_ROWS.has(row.key));
}

const count = (n: number) => n.toLocaleString("en-US");
const tests = (n: number) => (n === 1 ? "test" : "tests");

/**
 * The count line under a tested range. A "test" is one row of the investigation's PSI experimental
 * tables. `excluded` rows state a value the source flags as suspect: they count in the total, so the
 * total equals the investigation's test count, and the cell names them in its own "Left out" line.
 * null: no test, or no test states it (the cell then says "Not stated" once, see notStatedScope).
 */
export function statedLine(stated: number, notStated: number, excluded = 0): string | null {
  const total = stated + notStated + excluded;
  if (total <= 0 || (stated === 0 && excluded === 0)) return null;
  if (stated === total) return total === 1 ? "Stated in the only test" : `Stated in all ${count(total)} tests`;
  return `Stated in ${count(stated)} of ${count(total)} ${tests(total)}`;
}

/** What follows the "Not stated" box when no test states the value: "in any of the 18 tests". */
export function notStatedScope(total: number): string | null {
  if (total <= 0) return null;
  return total === 1 ? "in the only test" : `in any of the ${count(total)} tests`;
}

/** Under a counted value (fuels, outcomes) that some tests leave empty: "Not stated in 5 tests". */
export function notStatedLine(notStated: number): string | null {
  return notStated > 0 ? `Not stated in ${count(notStated)} ${tests(notStated)}` : null;
}

/** A range caveat flag from the API in reader's words, with its test count. */
export function caveatLine(flag: string, n: number): string {
  const label =
    flag === "oxygen_is_burner_stream"
      ? "Inverse flame: oxygen is not the air around the flame"
      : flag.endsWith(":approximate")
        ? "Approximate value"
        : flag.replace(/[_:]/g, " ").replace(/^./, (c) => c.toUpperCase());
  return `${label} (${count(n)} ${tests(n)})`;
}
