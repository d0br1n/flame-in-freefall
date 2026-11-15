import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterEvidence, listedFile, loadEngine, MODULES_DIR, moduleAnswer } from "../../scripts/stub-modules.mjs";

// Answers from the repo's own data/modules/ folders, as the real backend (apps/api) gives them.
type Row = { id: string; status: string; stage?: string; evidence_count?: number; findings_count?: number };
const body = <T>(url: string) => moduleAnswer(url)?.body as T;
const evidenceOnDisk = (id: string) =>
  JSON.parse(readFileSync(`${MODULES_DIR}/${id}/evidence.json`, "utf8")) as { test_id: string; quantity: string }[];

describe("stub module routes", () => {
  it("lists every engine folder, the mock one included, with its stage and counts", () => {
    const rows = body<Row[]>("/api/v1/modules");
    const ids = rows.map((row) => row.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toEqual(expect.arrayContaining(["_mock", "flame-temperature", "video-to-data"]));
    const mock = rows.find((row) => row.id === "_mock");
    expect(mock).toMatchObject({ status: "example", stage: "spread", evidence_count: 4, findings_count: 2 });
    const flame = rows.find((row) => row.id === "flame-temperature");
    expect(flame).toMatchObject({ stage: "suppress", evidence_count: evidenceOnDisk("flame-temperature").length });
  });

  it("serves one engine's module.json as written", () => {
    const onDisk = JSON.parse(readFileSync(`${MODULES_DIR}/video-to-data/module.json`, "utf8"));
    expect(body("/api/v1/modules/video-to-data")).toEqual(onDisk);
  });

  it("filters evidence by test and by quantity", () => {
    expect(body<unknown[]>("/api/v1/modules/_mock/evidence")).toHaveLength(4);
    expect(body<unknown[]>("/api/v1/modules/_mock/evidence?test_id=PSI-0/MOCK-1")).toHaveLength(2);
    expect(body<unknown[]>("/api/v1/modules/_mock/evidence?test_id=PSI-0%2FMOCK-2&quantity=test_end")).toHaveLength(1);
    expect(body<unknown[]>("/api/v1/modules/_mock/evidence?quantity=nothing")).toHaveLength(0);
    const flame = evidenceOnDisk("flame-temperature");
    expect(body<unknown[]>("/api/v1/modules/flame-temperature/evidence?test_id=PSI-69/1")).toHaveLength(
      filterEvidence(flame, "PSI-69/1").length,
    );
  });

  it("serves findings", () => {
    expect(body<{ kind: string }[]>("/api/v1/modules/_mock/findings").map((f) => f.kind)).toEqual(["headline", "check"]);
  });

  it("serves a file listed in module.json", () => {
    const answer = moduleAnswer("/api/v1/modules/_mock/files/mock_table.csv");
    expect(answer?.status).toBe(200);
    expect(answer?.contentType).toMatch(/^text\/csv/);
    expect(readFileSync(answer?.file as string, "utf8")).toContain("PSI-0/MOCK-1");
  });

  it("refuses a file that is not listed, and any path with ..", () => {
    expect(moduleAnswer("/api/v1/modules/_mock/files/module.json")?.status).toBe(404);
    expect(moduleAnswer("/api/v1/modules/_mock/files/..%2F..%2Fpackage.json")?.status).toBe(404);
    expect(moduleAnswer("/api/v1/modules/_mock/files/%2E%2E/_mock/mock_table.csv")?.status ?? 404).toBe(404);
    const engine = loadEngine(MODULES_DIR, "_mock");
    expect(listedFile(engine, "../_mock/mock_table.csv")).toBeNull();
    expect(listedFile(engine, "mock_table.csv")).not.toBeNull();
  });

  it("answers 404 with a sentence for an unknown engine, and leaves other routes alone", () => {
    const answer = moduleAnswer("/api/v1/modules/nope");
    expect(answer?.status).toBe(404);
    expect((answer?.body as { detail: string }).detail).toMatch(/No engine 'nope'/);
    expect(moduleAnswer("/api/v1/catalog/investigations")).toBeNull();
  });

  it("lists a broken folder as not built, with no numbers", () => {
    const missing = loadEngine(MODULES_DIR, "no-such-folder");
    expect(missing.ok).toBe(false);
    expect(missing.problems).toBe(3);
  });
});
