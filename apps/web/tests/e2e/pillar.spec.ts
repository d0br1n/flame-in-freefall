import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { leadClause, splitSentences } from "../../components/pillar/layout";
import { checkVerdict } from "../../lib/pillar";
import { PROVENANCE } from "../../lib/provenance";
import type { EngineModule, Finding, Provenance } from "../../lib/types";

// DOB-74 and DOB-85: the pillar pages and the evidence panel. The stub backend
// (scripts/stub-api.mjs + scripts/stub-modules.mjs) serves the repo's data/modules/ folders, so
// the expected text is read from those same files: when an analysis hands over new output, these
// tests follow it.
const MODULES = resolve(process.cwd(), "..", "..", "data", "modules");
const read = <T>(id: string, file: string): T => JSON.parse(readFileSync(resolve(MODULES, id, file), "utf8")) as T;
const label = (tag: Provenance) => PROVENANCE[tag].label;
// The page shows one section at a time (DOB-127): a section is opened from the section list.
const openSection = (page: Page, name: string | RegExp) => page.getByTestId("section-nav").getByRole("tab", { name, exact: true }).click();

test("the Video to Data page shows its question, answer, checks and the link to its limits, and a number opens the panel", async ({ page }) => {
  const m = read<EngineModule>("video-to-data", "module.json");
  const findings = read<Finding[]>("video-to-data", "findings.json");
  const headline = findings.find((f) => f.kind === "headline");
  const checks = findings.filter((f) => f.kind === "check");
  expect(headline, "video-to-data has a headline").toBeTruthy();

  await page.goto("/spread");
  // The page's one h1 is the section name in the top bar; the analysis's question heads the page.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Video to Data");
  await expect(page.getByRole("heading", { level: 2, name: m.question })).toBeVisible();
  // The header carries the lead clause of the summary's first sentence (leadClause); the rest of
  // the summary is in the findings section.
  const [lead, ...rest] = splitSentences(m.summary);
  await expect(page.getByTestId("question-summary")).toHaveText(leadClause(lead));

  // What the data cannot tell is listed on the Limitations page only: this page links to it.
  await expect(page.getByTestId("cannot-tell")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Limits of this analysis" })).toHaveAttribute(
    "href",
    new RegExp(`/limitations(\\?[^#]*)?#${m.id}$`),
  );

  if (m.status === "example") {
    await expect(page.getByTestId("example-banner")).toContainText("Example data, not results");
    await expect(page.getByTestId("example-marker").first()).toBeVisible();
  } else {
    await expect(page.getByTestId("example-banner")).toHaveCount(0);
  }

  await openSection(page, "Checks and sources");
  await expect(page.getByTestId("check")).toHaveCount(checks.length);
  for (const check of checks) {
    const row = page.getByTestId("check").filter({ hasText: check.text });
    // The page's own rule (lib/pillar.ts): a check that ran zero comparisons is "being measured", not "failed".
    const expected = checkVerdict(check.passed, m.status, check).word;
    await expect(row.getByTestId("check-verdict")).toHaveText(expected);
  }

  await openSection(page, "Findings");
  if (rest.length > 0) await expect(page.getByTestId("about-analysis")).toContainText(rest.join(" "));
  const first = page.getByTestId("headline").first();
  await expect(first).toContainText(headline!.text);
  await expect(first.getByTestId("finding-n")).toHaveText(`n = ${headline!.n.toLocaleString("en-US")}`);
  await expect(first.getByTestId("provenance-badge")).toHaveText(label(headline!.provenance));

  await expect(page.getByTestId("air-coverage").or(page.getByTestId("air-coverage-unavailable"))).toBeVisible();

  // The panel: opened from the number, with its badge and its PSI source; Escape gives focus back.
  const number = first.getByTestId("evidence-number");
  await number.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByTestId("evidence-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Where this number comes from" })).toBeVisible();
  await expect(panel.getByTestId("provenance-badge").first()).toHaveText(label(headline!.provenance));
  await expect(panel.getByRole("link", { name: headline!.source.psi_id, exact: true })).toBeVisible();
  await expect(panel).toContainText(headline!.source.file);
  if (m.status === "example") await expect(panel.getByTestId("panel-example")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(number).toBeFocused();

  // The close button works too, and a mouse click opens the same panel.
  await number.click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toBeHidden();
  await expect(number).toBeFocused();
});

test("the suppress page shows its question and its numbers", async ({ page }) => {
  const m = read<EngineModule>("flame-temperature", "module.json");
  await page.goto("/suppress");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Suppression test bench");
  await expect(page.getByRole("heading", { level: 2, name: m.question })).toBeVisible();
  await expect(page.getByRole("link", { name: "Limits of this analysis" })).toHaveAttribute(
    "href",
    new RegExp(`/limitations(\\?[^#]*)?#${m.id}$`),
  );
  await openSection(page, "Findings");
  await expect(page.getByTestId("headline").first().getByTestId("evidence-number")).toBeVisible();
  await openSection(page, /^Evidence/);
  await expect(page.getByTestId("evidence-table").getByTestId("evidence-number").first()).toBeVisible();
  await openSection(page, "Checks and sources");
  for (const psiId of m.psi_ids) {
    await expect(page.getByTestId("psi-ids").getByRole("link", { name: new RegExp(`^${psiId}\\b`) })).toBeVisible();
  }
});

test("with no data service and no saved copy, a pillar page shows the error state", async ({ page }) => {
  await page.route("**/api/v1/**", (route) => route.abort());
  await page.route("**/snapshot/**", (route) => route.abort());
  await page.goto("/spread");
  const error = page.getByTestId("error-state");
  await expect(error).toBeVisible();
  await expect(error).toContainText("The data service is not answering");
  await expect(error.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByTestId("evidence-number")).toHaveCount(0);
});

test("computed and video-measured numbers carry their own badges, in the table and in the panel", async ({ page }) => {
  await page.goto("/suppress#evidence");
  const table = page.getByTestId("evidence-table");
  const computedRow = table.getByTestId("evidence-row").filter({ has: page.getByText(label("MODEL"), { exact: true }) }).first();
  await expect(computedRow.getByTestId("provenance-badge")).toHaveText(label("MODEL"));
  await computedRow.getByTestId("evidence-number").click();
  const panel = page.getByTestId("evidence-panel");
  await expect(panel.getByTestId("provenance-badge").first()).toHaveText("computed");
  await page.keyboard.press("Escape");

  // The spread page's main view (DOB-86) has no evidence table: a video-measured number in its
  // numbers section opens the same panel with the same badge.
  await page.goto("/spread?test=B1");
  await page.getByTestId("numbers-section").getByTestId("evidence-number").first().click();
  await expect(panel.getByTestId("provenance-badge").first()).toHaveText("measured from video");
});
