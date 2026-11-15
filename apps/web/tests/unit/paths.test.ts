import { describe, expect, it } from "vitest";
import { fileForPath } from "@/lib/paths.mjs";

describe("fileForPath", () => {
  it("maps a plain path to a json file", () => {
    expect(fileForPath("/catalog/investigations")).toBe("catalog/investigations.json");
    expect(fileForPath("/catalog/investigations/PSI-25")).toBe("catalog/investigations/PSI-25.json");
  });

  it("sorts query parameters so one request has one file", () => {
    expect(fileForPath("/catalog/tests?psi_id=PSI-69&outcome=Extinction")).toBe(
      "catalog/tests__outcome=Extinction&psi_id=PSI-69.json",
    );
    expect(fileForPath("/catalog/tests?outcome=Extinction&psi_id=PSI-69")).toBe(
      fileForPath("/catalog/tests?psi_id=PSI-69&outcome=Extinction"),
    );
  });

  it("drops empty parameters and never lets a value leave the folder", () => {
    expect(fileForPath("/air/coverage?air=")).toBe("air/coverage.json");
    expect(fileForPath("/air/coverage?air=../../secret")).toBe("air/coverage__air=.._.._secret.json");
  });
});
