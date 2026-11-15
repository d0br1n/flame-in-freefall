// Pure layout helpers of the pillar page (PillarParts.tsx): how a summary splits into sentences,
// which frame of an analysis's files leads the page, and when a finding is a share worth a bar.
// No React, so the unit tests (tests/unit/pillar-layout.test.ts) run them in node.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import type { Finding, ModuleFile } from "@/lib/types";

const naturalOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** A paragraph split at sentence ends, so the first sentence can lead. The words are unchanged. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * The opening clause of a sentence when the whole sentence is too long for a page header: the
 * words up to the last comma, colon or semicolon that fits, closed with a full stop. The words are
 * unchanged, and a sentence that fits (or has no such break) is returned whole.
 */
export function leadClause(sentence: string, max = 140): string {
  if (sentence.length <= max) return sentence;
  const breaks = [...sentence.matchAll(/[,:;](?=\s)/g)].map((match) => match.index ?? 0).filter((at) => at >= 40 && at <= max);
  if (breaks.length === 0) return sentence;
  return `${sentence.slice(0, breaks[breaks.length - 1])}.`;
}

/**
 * The analysis's own frame of a NASA video, if it hands one over: a still with the tracked flame
 * drawn on it (`*_still2.jpg`, the middle of the lit range), first test in natural order.
 */
export function pickStill(files: readonly ModuleFile[]): ModuleFile | null {
  const stills = files
    .filter((file) => file.kind === "image" && /_still\d\.(jpe?g|png|webp)$/i.test(file.name))
    .sort((a, b) => naturalOrder.compare(a.name, b.name));
  return stills.find((file) => /_still2\./i.test(file.name)) ?? stills[0] ?? null;
}

/** "PSI-25_B1_still2.jpg" -> "PSI-25/B1", the site's test ID; null when the name does not say. */
export function testIdOfFile(name: string): string | null {
  const match = /^(PSI-\d+)_([A-Za-z0-9]+)_/.exec(name);
  return match ? `${match[1]}/${match[2]}` : null;
}

/** A count out of a total, when the finding is one: "6 of 18 tests". Otherwise null. */
export function shareOf(finding: Pick<Finding, "value" | "unit" | "n">): { part: number; total: number } | null {
  const value = finding.value;
  if (typeof value !== "number" || !Number.isFinite(value) || finding.n <= 0) return null;
  if (!/^tests?$/i.test(finding.unit.trim())) return null;
  if (value < 0 || value > finding.n) return null;
  return { part: value, total: finding.n };
}
