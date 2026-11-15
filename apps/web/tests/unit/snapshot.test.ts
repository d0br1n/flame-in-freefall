import { describe, expect, it } from "vitest";
import { fileForPath } from "@/lib/paths.mjs";
import { SERIES_TESTS_PATH } from "@/lib/spread";
import { jsonFilesOf, snapshotPaths } from "../../scripts/snapshot.mjs";

describe("snapshotPaths", () => {
  const paths = snapshotPaths({
    investigations: ["PSI-25", "PSI-69"],
    airs: ["station", "exploration"],
    modules: [{ id: "flame-temperature", jsonFiles: ["flex_tests.json"] }],
    extra: ["/catalog/tests?limit=50", "/modules"],
  });

  it("covers the catalog, every investigation, every air and every analysis", () => {
    expect(paths).toContain("/catalog/investigations");
    expect(paths).toContain("/catalog/investigations/PSI-69");
    expect(paths).toContain("/air/presets");
    expect(paths).toContain("/air/coverage?air=exploration");
    expect(paths).toContain("/catalog/rank?air=station");
    expect(paths).toContain("/modules/flame-temperature/evidence");
    expect(paths).toContain("/modules/flame-temperature/findings");
    expect(paths).toContain("/modules/flame-temperature/files/flex_tests.json");
    expect(paths).toContain("/catalog/tests?limit=50");
    expect(paths).toContain("/catalog/compare?ids=PSI-69,PSI-68");   // the Compare page's demo pair
  });

  it("covers the Video to Data page's list of BASS-II tests, where the page asks for it", () => {
    expect(SERIES_TESTS_PATH).toBe("/catalog/tests?psi_id=PSI-25&limit=200");
    expect(paths).toContain(SERIES_TESTS_PATH);
    expect(fileForPath(SERIES_TESTS_PATH)).toBe("catalog/tests__limit=200&psi_id=PSI-25.json");
  });

  it("asks for each path once", () => {
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("saves each answer where the site's fallback looks for it", () => {
    expect(fileForPath("/air/coverage?air=exploration")).toBe("air/coverage__air=exploration.json");
    expect(fileForPath("/modules/flame-temperature/files/flex_tests.json")).toBe(
      "modules/flame-temperature/files/flex_tests.json.json",
    );
  });
});

describe("jsonFilesOf", () => {
  it("keeps only the files a page reads as JSON", () => {
    expect(jsonFilesOf({ files: [{ name: "flex_grid.json" }, { name: "results.csv" }, { name: "clip.mp4" }] })).toEqual([
      "flex_grid.json",
    ]);
    expect(jsonFilesOf({})).toEqual([]);
  });
});
