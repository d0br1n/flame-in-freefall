import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixtureFor } from "../../scripts/stub-api.mjs";

describe("stub backend fixtures", () => {
  it("serves the catalog list with the 24 investigations", () => {
    const file = fixtureFor("/api/v1/catalog/investigations");
    expect(file).not.toBeNull();
    const body = JSON.parse(readFileSync(file as string, "utf8"));
    expect(body.count).toBe(24);
    expect(body.items).toHaveLength(24);
    expect(new Set(body.items.map((item: { psi_id: string }) => item.psi_id)).size).toBe(24);
  });

  it("keeps the numbers measured in docs/PSI_VERIFICATION_REPORT.md", () => {
    const list = JSON.parse(readFileSync(fixtureFor("/api/v1/catalog/investigations") as string, "utf8"));
    const total = list.items.reduce((sum: number, item: { files_count: number }) => sum + item.files_count, 0);
    expect(total).toBe(16354);
    const flex = JSON.parse(readFileSync(fixtureFor("/api/v1/catalog/investigations/PSI-69") as string, "utf8"));
    expect(flex.files.count).toBe(0);
    expect((flex.files.listed_bytes / 1e9).toFixed(2)).toBe("923.83");
    expect(flex.files.tables).toHaveLength(1);
  });

  it("has a cannot-tell line and a PSI link for every investigation", () => {
    const list = JSON.parse(readFileSync(fixtureFor("/api/v1/catalog/investigations") as string, "utf8"));
    for (const item of list.items) {
      const detail = JSON.parse(readFileSync(fixtureFor(`/api/v1/catalog/investigations/${item.psi_id}`) as string, "utf8"));
      expect(detail.cannot_tell.length, item.psi_id).toBeGreaterThan(0);
      expect(detail.psi_url, item.psi_id).toMatch(/^https:\/\//);
    }
  });

  it("answers nothing outside the fixtures folder", () => {
    expect(fixtureFor("/api/v1/../../package")).toBeNull();
    expect(fixtureFor("/other")).toBeNull();
    expect(fixtureFor("/api/v1/catalog/investigations/PSI-1")).toBeNull();
  });
});
