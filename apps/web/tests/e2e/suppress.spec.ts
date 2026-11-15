import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { GapsFile } from "../../lib/suppress";

// DOB-87, DOB-127, DOB-140: the suppression test bench, four sections of the /suppress page shown one at a
// time, served by the stub backend from the repo's data/modules/flame-temperature/ folder.
// Expected text is read from those same files.
// Code generated with SI assistance (Claude Code), reviewed by the team.
const ENGINE = resolve(process.cwd(), "..", "..", "data", "modules", "flame-temperature");
const gaps = JSON.parse(readFileSync(resolve(ENGINE, "flex_gaps.json"), "utf8")) as GapsFile;
const openSection = (page: Page, name: string) => page.getByTestId("section-nav").getByRole("tab", { name, exact: true }).click();

test("the suppress page shows the finding, the measured plot, its tables and the next tests to fly", async ({ page }) => {
  await page.goto("/suppress");
  // DOB-140: the plain answer opens the page, counted from flex_tests.json.
  await expect(page.getByTestId("section-nav").getByRole("tab", { name: "What works", exact: true })).toHaveAttribute("aria-selected", "true");
  const works = page.getByTestId("what-works");
  await expect(works.getByTestId("works-levers")).toContainText("30 of 33 flames went out at 12 to 15% oxygen. At 30 to 34%, 2 of 24 did.");
  await expect(works.getByTestId("works-levers")).toContainText("At 19 to 21% oxygen, 32 of 41 went out. With nitrogen only, 17 of 34.");
  await expect(works.getByTestId("works-levers")).toContainText("No FLEX test adds a gas above 25% oxygen.");
  await expect(works.getByTestId("works-table").getByText("Never tested")).toHaveCount(3);
  await works.screenshot({ path: "test-results/suppress-works.png" });

  // Its button opens the mixture sliders; the other sections wait in the section list.
  await works.getByRole("link", { name: "Try a mixture" }).click();
  await expect(page).toHaveURL(/#mixture$/);
  const bench = page.getByTestId("suppress-bench");
  await expect(bench).toBeVisible();
  await expect(bench.getByTestId("bench-sliders")).toBeVisible();
  await expect(page.getByTestId("section-nav").getByRole("tab", { name: "Try a mixture", exact: true })).toHaveAttribute("aria-selected", "true");

  // The measured plot: a dot per FLEX test, and the same counts as a table.
  await openSection(page, "What was tested");
  await expect(page.getByTestId("outcome-plot")).toBeVisible();
  const outcomes = page.getByTestId("outcome-table");
  await expect(outcomes.getByRole("row", { name: /Extinction/ })).toContainText("186");
  await expect(outcomes.getByRole("row", { name: /Disruption/ })).toContainText("61");
  await expect(outcomes.getByRole("row", { name: /Completion/ })).toContainText("27");

  // The headline in numbers: carbon dioxide stops at 25% oxygen, nitrogen only reaches 34%.
  const summary = page.getByTestId("gas-summary");
  await expect(summary.getByRole("row", { name: /With carbon dioxide/ })).toContainText("25%");
  await expect(summary.getByRole("row", { name: /Nitrogen only/ })).toContainText("34%");

  await page.getByTestId("outcome-plot").screenshot({ path: "test-results/suppress-plot.png" });

  await openSection(page, "Never tested");
  await expect(page).toHaveURL(/#never-tested$/);
  await expect(page.getByTestId("bench-headline")).toHaveText(gaps.header.headline);
  await page.getByTestId("bench-headline").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/suppress-top.png" });

  // Next test to fly: ten rows, then all of them.
  const table = page.getByTestId("gap-table");
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await page.getByRole("button", { name: `Show all ${gaps.rows.length}` }).click();
  await expect(table.locator("tbody tr")).toHaveCount(gaps.rows.length);
  await expect(page.getByTestId("gap-groups")).toContainText("model fails here");

});

test("a nearest-test link opens that test in the explorer", async ({ page }) => {
  await page.goto("/suppress#never-tested");
  const first = page.getByTestId("gap-table").getByRole("link").first();
  const testId = await first.textContent();
  await first.click();
  await expect(page).toHaveURL(new RegExp(`/tests\\?.*test=${encodeURIComponent(testId!.trim())}`));
});

test("the mixture sliders show a computed answer, and say when there is none", async ({ page }) => {
  // The overview's older link (#bench) opens the mixture section.
  await page.goto("/suppress#bench");
  const sliders = page.getByTestId("bench-sliders");
  await expect(sliders.getByTestId("provenance-badge")).toHaveText("computed");

  // Normal air: methanol, 21% oxygen, nitrogen only, 1 atm.
  await expect(page.getByTestId("slider-o2")).toHaveText("21%");
  await expect(page.getByTestId("slider-temperature")).toContainText(" K");
  await expect(page.getByTestId("slider-prediction").locator("[data-state=predicted]")).toContainText("%");
  await expect(page.getByTestId("slider-nearest").getByRole("link").first()).toHaveText(/^PSI-69\/\d+$/);

  // DOB-142: the same cell as an animated droplet flame, labelled as an illustration.
  const flame = page.getByTestId("flame-sim");
  await expect(flame).toHaveAttribute("data-state", "predicted");
  await expect(flame).toContainText("Illustration driven by the model");
  await expect(flame).toContainText("CFI test FLEX-1393, PSI-39");
  await expect(flame).toContainText("Time and flame size are not measured.");
  await expect(flame).toContainText("Droplet, backlit");
  // The picture waits for Play, and changing a slider sends it back to waiting (no restart).
  await expect(flame.getByRole("button", { name: "Play" })).toBeVisible();
  await flame.getByRole("button", { name: "Play" }).click();
  await expect(flame.getByRole("button", { name: "Pause" })).toBeVisible();
  await sliders.getByLabel(/^Oxygen/).focus();
  await page.keyboard.press("ArrowRight");
  await expect(flame.getByRole("button", { name: "Play" })).toBeVisible();

  // DOB-141: what would put it out sooner here. Heptane in station air: carbon dioxide lowers the
  // predicted burn, and the button moves the sliders to that share.
  const levers = page.getByTestId("put-out-here");
  await sliders.getByRole("radio", { name: "Heptane" }).check();
  const sentence = await levers.getByTestId("lever-co2-sentence").textContent();
  const told = /^With (\d+(?:\.\d+)?%) carbon dioxide the predicted burn falls from about \d+% to about \d+% of the droplet\.$/.exec(sentence ?? "");
  expect(told, sentence ?? "no sentence").not.toBeNull();
  await expect(levers.getByTestId("lever-o2-sentence")).toContainText("oxygen the predicted burn falls from about");
  await levers.getByRole("button", { name: `Set carbon dioxide to ${told![1]}` }).click();
  await expect(page.getByTestId("slider-added")).toHaveText(told![1]);
  await levers.screenshot({ path: "test-results/suppress-levers.png" });

  // Helium: the model fails there, so no prediction is shown and no oxygen curve is drawn.
  await sliders.getByRole("radio", { name: "Helium" }).check();
  await expect(page.getByTestId("slider-prediction").locator("[data-state=model-fails]")).toContainText("no prediction shown");
  await expect(levers.getByTestId("lever-o2-sentence")).toHaveText("No curve with helium: model fails here.");
  await expect(flame).toHaveAttribute("data-state", "model-fails");
  await expect(flame).toContainText("No flame is drawn with helium: model fails here.");
  await expect(flame.getByRole("button")).toHaveCount(0);

  // Carbon dioxide at its highest share and the highest oxygen: no such mixture.
  await sliders.getByRole("radio", { name: "Carbon dioxide" }).check();
  await sliders.getByLabel(/Carbon dioxide share/).focus();
  await page.keyboard.press("End");
  await sliders.getByLabel(/^Oxygen/).focus();
  await page.keyboard.press("End");
  await expect(page.getByTestId("slider-o2")).toHaveText("34%");
  await expect(page.getByTestId("slider-result")).toHaveAttribute("data-state", "impossible");

  await page.keyboard.press("Home");
  await sliders.screenshot({ path: "test-results/suppress-sliders.png" });
});
