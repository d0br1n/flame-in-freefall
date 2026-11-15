// How an evidence record or a finding is put into words: values, units, the signed difference
// from a published value, flags and asset kinds. The only arithmetic on this site is the signed
// difference (value minus reference). Pure, unit tested.
import type { Evidence, Finding, Value } from "./types";

export type PanelRecord = Evidence | Finding;

/** True for a finding (findings.json), false for an evidence record (evidence.json). */
export function isFinding(record: PanelRecord): record is Finding {
  return "kind" in record && (record.kind === "headline" || record.kind === "check");
}

/** A number exactly as written in the data, with thousands grouped: 2220.4 -> "2,220.4". */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toLocaleString("en-US", { maximumFractionDigits: 20 });
}

/** The unit as shown after a value: "1" (dimensionless) and "" (categorical) show nothing. */
export function unitText(unit: string): string {
  return unit === "1" ? "" : unit.trim();
}

/** A value with its unit: (123.4, "mm/s") -> "123.4 mm/s"; (true, "") -> "yes". */
export function formatValue(value: Value, unit: string): string {
  const text = typeof value === "number" ? formatNumber(value) : typeof value === "boolean" ? (value ? "yes" : "no") : value;
  const shownUnit = unitText(unit);
  return shownUnit ? `${text} ${shownUnit}` : text;
}

/** Digits after the decimal point as the number is written: 123.4 -> 1, 120 -> 0, 1.5e-7 -> 8. */
export function decimalsOf(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const [mantissa, exponent] = String(value).toLowerCase().split("e");
  const fraction = mantissa.split(".")[1]?.length ?? 0;
  return Math.max(0, fraction - Number(exponent ?? 0));
}

export interface SignedDifference {
  value: number;
  /** "+3.4 mm/s", "−0.2 K", "0 s". */
  text: string;
}

/**
 * Value minus reference, when both are numbers. Rounded to the decimals of the more precise of
 * the two, so floating-point noise never shows (123.4 - 120 is "+3.4", not "+3.4000000000000057").
 */
export function signedDifference(value: Value, reference: Value, unit: string): SignedDifference | null {
  if (typeof value !== "number" || typeof reference !== "number") return null;
  if (!Number.isFinite(value) || !Number.isFinite(reference)) return null;
  const decimals = Math.min(20, Math.max(decimalsOf(value), decimalsOf(reference)));
  const rounded = Number((value - reference).toFixed(decimals));
  const difference = Object.is(rounded, -0) ? 0 : rounded;
  const sign = difference > 0 ? "+" : difference < 0 ? "−" : "";
  const magnitude = formatNumber(Math.abs(difference));
  const shownUnit = unitText(unit);
  return { value: difference, text: `${sign}${magnitude}${shownUnit ? ` ${shownUnit}` : ""}` };
}

/** "spread_rate" -> "spread rate". The quantity names are the engines' own words. */
export function quantityLabel(quantity: string): string {
  return quantity.replace(/_/g, " ").trim();
}

const FLAG_WORDS: Record<string, string> = {
  mock: "made-up value for building the site, not from NASA data",
  example: "example value, not a result",
  no_scale: "no reliable length scale: the rate is in pixels per second",
  outside_tested_range: "outside the range NASA tested",
  suspect_pressure: "the table's pressure value looks wrong",
};

/** A flag in words. Known flags get a sentence; others are shown as written, made readable. */
export function flagLabel(flag: string): string {
  return FLAG_WORDS[flag.toLowerCase()] ?? flag.replace(/_/g, " ").toLowerCase();
}

/** True when a flag marks a placeholder value (the engine's own MOCK or example flag). */
export function isPlaceholderFlag(flag: string): boolean {
  const lower = flag.toLowerCase();
  return lower === "mock" || lower === "example";
}

export type AssetKind = "image" | "video" | "file";

/** How an asset is shown: images inline, video with controls, anything else as a link. */
export function assetKind(name: string): AssetKind {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(extension)) return "image";
  if (["mp4", "webm", "mov", "m4v", "ogv"].includes(extension)) return "video";
  return "file";
}

/** The site address of a file an engine lists in module.json (served by the backend as is). */
export function moduleFileUrl(moduleId: string, name: string): string {
  const path = name.split("/").map(encodeURIComponent).join("/");
  return `/api/v1/modules/${encodeURIComponent(moduleId)}/files/${path}`;
}

/** The words of an outside source link: psi.nasa.gov (or its DOI) is named, any other host is not. */
export function sourceLinkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "psi.nasa.gov" || host.endsWith(".psi.nasa.gov") || host === "doi.org") return "Open on psi.nasa.gov";
  } catch {
    // not a full URL: fall through
  }
  return "Open the source link";
}

/**
 * True when the link shows the source to a reader. The engines also write two PSI addresses that
 * do not: the PSI home page (it forwards to a general NASA page) and the PSI web service (it
 * answers with raw JSON).
 */
export function opensTheRecord(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.toLowerCase();
    if (host !== "psi.nasa.gov" && !host.endsWith(".psi.nasa.gov")) return true;
    return pathname !== "/" && !pathname.startsWith("/geode-py/");
  } catch {
    return false;
  }
}

/**
 * The outside link of a source: the record's own link when it opens the source, else the
 * investigation's page on psi.nasa.gov from the catalog. Undefined when neither is known.
 */
export function sourceHref(recordLink: string | null | undefined, catalogLink: string | null | undefined): string | undefined {
  if (recordLink && opensTheRecord(recordLink)) return recordLink;
  return catalogLink ?? undefined;
}

/** A condition value in words: numbers as written, other values as text. */
export function conditionText(value: unknown): string {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null || value === undefined) return "not stated";
  return JSON.stringify(value);
}
