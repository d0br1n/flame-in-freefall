import { describe, expect, it } from "vitest";
import {
  assetKind,
  decimalsOf,
  flagLabel,
  formatNumber,
  formatValue,
  isFinding,
  moduleFileUrl,
  opensTheRecord,
  quantityLabel,
  signedDifference,
  sourceHref,
  sourceLinkLabel,
} from "@/lib/evidence";
import { PROVENANCE, PROVENANCE_TAGS, provenanceStyle } from "@/lib/provenance";
import type { Evidence, Finding } from "@/lib/types";

describe("provenance badges", () => {
  const expected = {
    VIDEO_MEASURED: "measured from video",
    HAND_MEASURED: "measured by hand",
    PSI_TABLE: "from NASA's table",
    PUBLISHED: "published by NASA",
    SI_EXTRACTED: "read by SI",
    MODEL: "computed",
  } as const;

  it("covers the six tags of the contract with their plain words", () => {
    expect(PROVENANCE_TAGS.sort()).toEqual(Object.keys(expected).sort());
    for (const [tag, label] of Object.entries(expected)) {
      expect(PROVENANCE[tag as keyof typeof expected].label, tag).toBe(label);
    }
  });

  it("gives every tag its own label and its own mark, so colour is never the only signal", () => {
    const styles = PROVENANCE_TAGS.map((tag) => PROVENANCE[tag]);
    expect(new Set(styles.map((style) => style.label)).size).toBe(6);
    expect(new Set(styles.map((style) => style.mark)).size).toBe(6);
    expect(new Set(styles.map((style) => style.markName)).size).toBe(6);
    // Each tag differs from every other tag of its colour family in mark and border style.
    for (const a of PROVENANCE_TAGS) {
      for (const b of PROVENANCE_TAGS) {
        if (a !== b && PROVENANCE[a].tone === PROVENANCE[b].tone) {
          expect(PROVENANCE[a].border, `${a} and ${b}`).not.toBe(PROVENANCE[b].border);
        }
      }
    }
  });

  it("keeps measured and computed apart", () => {
    expect(PROVENANCE.VIDEO_MEASURED.tone).toBe("measured");
    expect(PROVENANCE.HAND_MEASURED.tone).toBe("measured");
    expect(PROVENANCE.MODEL.tone).toBe("computed");
    expect(PROVENANCE.PSI_TABLE.tone).toBe("nasa");
  });

  it("shows an unknown tag in words rather than hiding it", () => {
    expect(provenanceStyle("NEW_TAG").label).toBe("new tag");
    expect(provenanceStyle("MODEL")).toBe(PROVENANCE.MODEL);
  });
});

describe("values in words", () => {
  it("writes numbers as the data has them, with thousands grouped", () => {
    expect(formatNumber(2220.4)).toBe("2,220.4");
    expect(formatNumber(0.0001727)).toBe("0.0001727");
    expect(formatNumber(273)).toBe("273");
  });

  it("adds the unit, but not for dimensionless or categorical values", () => {
    expect(formatValue(123.4, "mm/s")).toBe("123.4 mm/s");
    expect(formatValue(0.724, "1")).toBe("0.724");
    expect(formatValue("MOCK-Extinction", "")).toBe("MOCK-Extinction");
    expect(formatValue(true, "")).toBe("yes");
  });

  it("names quantities and flags in words", () => {
    expect(quantityLabel("ceiling_temperature")).toBe("ceiling temperature");
    expect(flagLabel("MOCK")).toMatch(/made-up/);
    expect(flagLabel("no_scale")).toMatch(/pixels per second/);
    expect(flagLabel("SOME_NEW_FLAG")).toBe("some new flag");
  });
});

describe("signed difference: value minus the published reference", () => {
  it("counts the decimals as written", () => {
    expect(decimalsOf(123.4)).toBe(1);
    expect(decimalsOf(120)).toBe(0);
    expect(decimalsOf(1.5e-7)).toBe(8);
  });

  it("keeps the sign and the unit and drops floating-point noise", () => {
    expect(signedDifference(123.4, 120, "mm/s")).toEqual({ value: 3.4, text: "+3.4 mm/s" });
    expect(signedDifference(9.98, 10, "s")).toEqual({ value: -0.02, text: "−0.02 s" });
    expect(signedDifference(9.99, 9.99, "mm/s")).toEqual({ value: 0, text: "0 mm/s" });
    expect(signedDifference(2, 1.5, "1")).toEqual({ value: 0.5, text: "+0.5" });
  });

  it("is not computed unless both values are numbers", () => {
    expect(signedDifference("Extinction", 1, "")).toBeNull();
    expect(signedDifference(1, "Extinction", "")).toBeNull();
    expect(signedDifference(true, 1, "")).toBeNull();
  });
});

describe("records, files and links", () => {
  const evidence = { id: "e", module: "m", test_id: "PSI-1/1", quantity: "q", value: 1, unit: "", n: 1, conditions: {}, provenance: "MODEL", source: { psi_id: "PSI-1", file: "f" }, flags: [] } satisfies Evidence;
  const finding = { id: "f", module: "m", kind: "check", text: "t", value: 1, unit: "", n: 1, provenance: "MODEL", source: { psi_id: "PSI-1", file: "f" }, passed: true } satisfies Finding;

  it("tells a finding from an evidence record", () => {
    expect(isFinding(finding)).toBe(true);
    expect(isFinding(evidence)).toBe(false);
  });

  it("shows images inline, video with controls, the rest as links", () => {
    expect(assetKind("PSI-25_B1_still1.png")).toBe("image");
    expect(assetKind("PSI-25_B1_overlay.mp4")).toBe("video");
    expect(assetKind("PSI-25_B1_curve.csv")).toBe("file");
  });

  it("serves an engine's files from its files route", () => {
    expect(moduleFileUrl("_mock", "mock_table.csv")).toBe("/api/v1/modules/_mock/files/mock_table.csv");
    expect(moduleFileUrl("video-to-data", "clips/a b.mp4")).toBe("/api/v1/modules/video-to-data/files/clips/a%20b.mp4");
  });

  it("names psi.nasa.gov only when the link goes there", () => {
    expect(sourceLinkLabel("https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-69")).toBe("Open on psi.nasa.gov");
    expect(sourceLinkLabel("https://doi.org/10.60555/2np7-jv14")).toBe("Open on psi.nasa.gov");
    expect(sourceLinkLabel("https://example.invalid/mock")).toBe("Open the source link");
  });

  it("tells a page a reader can open from the PSI home page and the PSI web service", () => {
    // The engines write these two in evidence.json; neither shows the investigation to a reader.
    expect(opensTheRecord("https://psi.nasa.gov")).toBe(false);
    expect(opensTheRecord("https://psi.nasa.gov/")).toBe(false);
    expect(opensTheRecord("https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-69")).toBe(false);
    expect(opensTheRecord("https://doi.org/10.60555/mbq8-0451")).toBe(true);
    expect(opensTheRecord("https://psi.nasa.gov/physci/repo/data/investigations/PSI-69")).toBe(true);
    expect(opensTheRecord("https://example.invalid/mock")).toBe(true);
    expect(opensTheRecord("not a link")).toBe(false);
  });

  it("opens the investigation's own page when the record's link does not", () => {
    const doi = "https://doi.org/10.60555/mbq8-0451";
    expect(sourceHref("https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-69", doi)).toBe(doi);
    expect(sourceHref("https://psi.nasa.gov", doi)).toBe(doi);
    expect(sourceHref(undefined, doi)).toBe(doi);
    expect(sourceHref(doi, "https://doi.org/10.60555/other")).toBe(doi);
    // No catalog address (still loading, or the catalog failed): show nothing rather than a wrong page.
    expect(sourceHref("https://psi.nasa.gov", undefined)).toBeUndefined();
    expect(sourceHref(undefined, undefined)).toBeUndefined();
  });
});
