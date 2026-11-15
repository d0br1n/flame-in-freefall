// Number formatting for the site. Decimal units (1 GB = 1,000,000,000 bytes), as PSI's sizes
// are compared in docs/PSI_VERIFICATION_REPORT.md. Pure, unit tested.

const UNITS = ["kB", "MB", "GB", "TB", "PB"];

/** 923832535657 -> "923.83 GB"; 734 -> "734 bytes". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
  if (bytes < 1000) return bytes === 1 ? "1 byte" : `${Math.round(bytes)} bytes`;
  let value = bytes;
  let unit = -1;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  // Rounding can carry into the next unit (999.996 kB -> "1000.00 kB"): step up instead.
  if (Number(value.toFixed(2)) >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(2)} ${UNITS[unit]}`;
}

/** 16354 -> "16,354". */
export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

/** "1 file", "342 files". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

export type FileGap =
  | { kind: "not_listed" }
  | { kind: "none_offered"; listed: number }
  | { kind: "partial"; offered: number; listed: number; percent: string }
  | { kind: "complete"; offered: number; listed: number };

/** A percentage that never rounds a real gap away: 0.000004 -> "less than 0.01%". */
export function formatPercent(fraction: number): string {
  const percent = fraction * 100;
  if (percent > 0 && percent < 0.01) return "less than 0.01%";
  if (percent < 1) return `${percent.toFixed(2)}%`;
  if (percent < 10) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

/**
 * One short line for a list row: what can be downloaded, and the listed size when it differs.
 * (0, 0, 923832535657) -> "No files to download; PSI lists 923.83 GB"
 */
export function holdingsLine(count: number, bytes: number, listed: number | null): string {
  const gap = fileGap(bytes, listed);
  if (count === 0) {
    return gap.kind === "not_listed" ? "No files to download" : `No files to download; PSI lists ${formatBytes(listed ?? 0)}`;
  }
  const offered = `${plural(count, "file")}, ${formatBytes(bytes)}`;
  return gap.kind === "partial" ? `${offered} of ${formatBytes(gap.listed)} listed` : offered;
}

/**
 * How the downloadable files compare with the size PSI lists for the record.
 * "complete" when the files reach 99.9% of the listed size or more (PSI's totals often differ by a
 * few kB from the sum of the files it offers).
 */
export function fileGap(offered: number, listed: number | null): FileGap {
  if (listed === null || listed <= 0) return { kind: "not_listed" };
  if (offered <= 0) return { kind: "none_offered", listed };
  if (offered / listed >= 0.999) return { kind: "complete", offered, listed };
  return { kind: "partial", offered, listed, percent: formatPercent(offered / listed) };
}

/** The first `limit` characters of `text` (cut at a word), whole text on demand. Pure (used by components/ShowMore.tsx). */
export function cutText(text: string, limit: number): string | null {
  if (text.length <= limit + 80) return null; // not worth a button for a few words
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > limit * 0.6 ? lastSpace : limit).trimEnd()}…`;
}
