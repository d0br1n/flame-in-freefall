// The logic of the pillar pages (DOB-74): which analysis answers a fire stage, how a check reads,
// how the chosen cabin air's coverage is put into words, and the order of the evidence table.
// Pure, unit tested. components/pillar/PillarPage.tsx is the caller.
import { NAV, STAGE_HREF } from "./nav";
import type { AirPreset, Evidence, ModuleSummary, Stage, StageCoverage } from "./types";

export const MOCK_ID = "_mock";

/** The page's own name for a stage, from the navigation. Detection has no page, so it is named here. */
export function stageLabel(stage: Stage): string {
  const href = STAGE_HREF[stage];
  return NAV.find((entry) => entry.href === href)?.label ?? (stage === "detect" ? "Detection" : stage);
}

const STATUS_RANK: Record<ModuleSummary["status"], number> = { built: 0, example: 1, not_built: 2 };

/**
 * The analysis that answers a stage, from GET /modules: built over example over not_built, and the
 * mock analysis only when nothing else answers that stage. Null when no row names the stage.
 */
export function chooseEngine(rows: readonly ModuleSummary[], stage: Stage): ModuleSummary | null {
  const candidates = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.stage === stage)
    .sort(
      (a, b) =>
        Number(a.row.id === MOCK_ID) - Number(b.row.id === MOCK_ID) ||
        STATUS_RANK[a.row.status] - STATUS_RANK[b.row.status] ||
        a.index - b.index,
    );
  return candidates[0]?.row ?? null;
}

export type CheckWord = "passed" | "failed" | "being measured";

export interface CheckVerdict {
  word: CheckWord;
  tone: "ok" | "danger" | "warn";
}

/**
 * A check in words. A check that did not pass on an analysis whose values are still examples has
 * not been run for real yet: it reads "being measured", never "failed" (the video team's rule).
 */
export function checkVerdict(
  passed: boolean | undefined,
  status: "example" | "built" | undefined,
  finding?: { value?: unknown; unit?: string | null },
): CheckVerdict {
  if (passed === true) return { word: "passed", tone: "ok" };
  // A check that compared nothing (zero comparisons run) has not failed: it is still being measured.
  const notRun = finding?.unit === "comparisons" && finding.value === 0;
  if (status === "example" || passed === undefined || notRun) return { word: "being measured", tone: "warn" };
  return { word: "failed", tone: "danger" };
}

/** The air named in words: "Station cabin (About 21% oxygen at 14.7 psi, like air at sea level)". */
export function airName(air: Pick<AirPreset, "label" | "plain">): string {
  return `${air.label} (${air.plain})`;
}

const tests = (count: number) => `${count.toLocaleString("en-US")} ${count === 1 ? "test" : "tests"}`;

/**
 * What the chosen air covers for this stage, in one sentence. Null when the backend says nothing
 * about the stage (the page then says the coverage is not available).
 */
export function coverageSentence(coverage: StageCoverage | null): string | null {
  if (!coverage) return null;
  switch (coverage.status) {
    case "tested":
      return `${(coverage.inside ?? 0).toLocaleString("en-US")} of ${tests(coverage.stated)} of this stage ran inside this air.`;
    case "never_tested":
      return `Never tested in this air: none of the ${tests(coverage.stated)} of this stage ran inside it.`;
    case "not_stated":
      return "This stage's tables do not state oxygen or pressure, so it does not vary with the cabin air.";
    default:
      return null;
  }
}

const naturalOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Evidence grouped by test (natural order: PSI-69/2 before PSI-69/10), file order within a test. */
export function sortEvidence(records: readonly Evidence[]): Evidence[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => naturalOrder.compare(a.record.test_id, b.record.test_id) || a.index - b.index)
    .map(({ record }) => record);
}

/** How many distinct tests a list of records covers. */
export function testCount(records: readonly Evidence[]): number {
  return new Set(records.map((record) => record.test_id)).size;
}
