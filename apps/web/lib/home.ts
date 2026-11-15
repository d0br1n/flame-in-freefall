// The logic of the home page (Linear DOB-78): the ranking request for the chosen cabin air and
// how a ranked investigation's score and its four parts are put on screen. Every number comes
// from GET /catalog/rank; this file only words it. Pure, unit tested (tests/unit/home.test.ts).
import { airQuery, type AirChoice } from "./air";
import type { RankEvidencePart, RankPartKey, RankResponse, Stage } from "./types";

export const RANK_PATH = "/catalog/rank";

/** The two questions of the first screen, in order. Smoke detection was dropped from scope. */
export const HOME_STAGES: readonly Stage[] = ["spread", "suppress"];

/** GET /catalog/rank for one cabin air (a preset id or a custom point), or null while the air is not known. */
export function rankPath(choice: AirChoice | string | null): string | null {
  const query = airQuery(choice);
  return query ? `${RANK_PATH}?${query}` : null;
}

/** The four parts of a score, in the order the backend's formula lists them. */
export const RANK_PARTS: readonly RankPartKey[] = ["pillar", "evidence", "data", "fuel"];

/** A part's name on screen. */
export const PART_LABEL: Record<RankPartKey, string> = {
  pillar: "Pillar",
  evidence: "Tests in this air",
  data: "Data in PSI",
  fuel: "Fuel",
};

/** The width of a part's bar, as a CSS percentage: a score from 0 to 1, clamped. */
export function barWidth(score: number): string {
  const value = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  return `${Number((value * 100).toFixed(1))}%`;
}

/** A score from 0 to 1 with two decimals: 0.75 -> "0.75", 1 -> "1.00". */
export function scoreText(score: number): string {
  return Number.isFinite(score) ? score.toFixed(2) : "not given";
}

/**
 * The evidence part as counts: "49 of 274" tests inside the air, or "not stated" when no table
 * states what the air bounds (the backend then sends stated 0 and inside null).
 */
export function evidenceText(part: Pick<RankEvidencePart, "inside" | "stated">): string {
  if (!part.stated) return "not stated";
  return `${(part.inside ?? 0).toLocaleString("en-US")} of ${part.stated.toLocaleString("en-US")}`;
}

/** What a part shows next to its bar: counts for the evidence part, the score for the others. */
export function partValue(key: RankPartKey, part: { score: number; inside?: number | null; stated?: number }): string {
  if (key === "evidence" && typeof part.stated === "number") return evidenceText({ inside: part.inside ?? null, stated: part.stated });
  return scoreText(part.score);
}

/** The words a screen reader hears for one part: "Tests in this air: 49 of 274, score 0.18 of 1." */
export function partSummary(key: RankPartKey, part: { score: number; inside?: number | null; stated?: number }): string {
  const value = partValue(key, part);
  return key === "evidence" ? `${PART_LABEL[key]}: ${value}, score ${scoreText(part.score)} of 1.` : `${PART_LABEL[key]}: ${value} of 1.`;
}

/** The weights as words: "pillar 0.25, evidence 0.25, data 0.25, fuel 0.25". */
export function weightsText(weights: RankResponse["weights"]): string {
  return RANK_PARTS.map((key) => `${key} ${Number((weights[key] ?? 0).toFixed(4))}`).join(", ");
}
