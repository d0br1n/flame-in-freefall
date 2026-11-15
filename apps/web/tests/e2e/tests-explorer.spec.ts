import { expect, test, type Page } from "@playwright/test";
import { PROVENANCE } from "../../lib/provenance";
import { facetLabel, noChartNote, searchFacetOptions } from "../../lib/tests";
import type { AirPresets, Provenance, TestRow, TestsResponse } from "../../lib/types";
import { api, chartedTests, expectCharted, matchText } from "./helpers";

// DOB-77: the tests explorer, on the real backend (every row of the 22 PSI tables). Expected
// counts are read from the API, except the anchor the issue states: FLEX (PSI-69) has 186 tests
// that end in extinction.
// Guard: rename the outcome parameter in lib/tests.ts and the first test goes red (the count
// stays at FLEX's total instead of 186).

const facet = (page: Page, key: string, value: string) => page.locator(`input[data-facet="${key}"][data-value="${value}"]`);
const FLEX_EXTINCTIONS = 186;

test("filter to FLEX extinctions, open a row and find its source file", async ({ page, request }) => {
  const all = await api<TestsResponse>(request, "/catalog/tests?limit=1");
  const flex = await api<TestsResponse>(request, "/catalog/tests?psi_id=PSI-69&limit=1");
  const extinctions = await api<TestsResponse>(request, "/catalog/tests?psi_id=PSI-69&outcome=Extinction&limit=1&include=points");
  expect(extinctions.total).toBe(FLEX_EXTINCTIONS);
  expect(flex.total).toBeGreaterThan(FLEX_EXTINCTIONS);

  await page.goto("/tests");
  await expect(page.getByTestId("result-count")).toHaveText(matchText(all.total));

  await facet(page, "psi_id", "PSI-69").check();
  await expect(page).toHaveURL(/[?&]psi_id=PSI-69/);
  await expect(page.getByTestId("result-count")).toHaveText(matchText(flex.total));
  await facet(page, "outcome", "Extinction").check();
  await expect(page).toHaveURL(/[?&]outcome=Extinction/);
  await expect(page.getByTestId("result-count")).toHaveText(matchText(FLEX_EXTINCTIONS));
  await expectCharted(page, extinctions.points!.items.length);

  const firstRow = page.getByTestId("test-row").first();
  await expect(firstRow).toContainText("Extinction");
  await firstRow.getByRole("button").click();
  const dialog = page.getByTestId("test-dialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/[?&]test=PSI-69/);
  await expect(dialog.getByTestId("test-source-file")).toHaveText("PSI-69_Experimental table_FLEX.csv");
  await expect(dialog.getByTestId("test-raw")).toContainText("Test end");
  await expect(dialog.getByRole("link", { name: /About this investigation \(FLEX, PSI-69\)/ })).toHaveAttribute(
    "href",
    /^\/investigations\/PSI-69/,
  );
  await expect(dialog.getByRole("link", { name: "Open this record on psi.nasa.gov" })).toHaveAttribute(
    "href",
    /^https:\/\/doi\.org\//,
  );

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]test=/);
  await expect(page).toHaveURL(/outcome=Extinction/);
});

test("a linked test opens with its row as published and its flags in words", async ({ page, request }) => {
  const suspect = await api<TestRow>(request, "/catalog/tests/PSI-69/114");
  expect(suspect.flags).toContain("suspect_pressure");

  await page.goto("/tests?test=PSI-69%2F114");
  const dialog = page.getByTestId("test-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2 })).toContainText("PSI-69/114");
  await expect(dialog).toContainText("0 kPa (0 mmHg as published)");
  await expect(dialog.getByTestId("test-flags")).toContainText("suspect pressure");
  if (suspect.flags.includes("co_header_assumed_co2")) {
    await expect(dialog.getByTestId("test-flags")).toContainText("CO column read as CO2");
  }
  await expect(dialog.getByTestId("test-raw")).toContainText("Ambient pressure; mmHg");
  await expect(dialog.getByTestId("test-source-file")).toHaveText(suspect.source_file);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  // A test ID with "#" (a table with no test number) reaches the one-test route whole.
  const hashed = await api<TestRow>(request, "/catalog/tests/PSI-20/%231");
  await page.goto("/tests?test=PSI-20%2F%231");
  await expect(dialog.getByRole("heading", { level: 2 })).toContainText("PSI-20/#1");
  await expect(dialog.getByTestId("test-source-file")).toHaveText(hashed.source_file);
  await expect(dialog.getByTestId("test-comparable")).toContainText(hashed.comparable ? "Yes." : "No.");
});

test("a test's analysis numbers open the evidence panel with their badge", async ({ page, request }) => {
  const row = await api<TestRow>(request, "/catalog/tests/PSI-69/1");
  const evidence = row.evidence ?? [];
  expect(evidence.length, "an analysis has evidence for FLEX test 1").toBeGreaterThan(0);

  await page.goto("/tests?test=PSI-69%2F1");
  const dialog = page.getByTestId("test-dialog");
  await expect(dialog.getByTestId("test-evidence-row")).toHaveCount(evidence.length);
  const tags = new Set(evidence.map((record) => PROVENANCE[record.provenance as Provenance].label));
  for (const tag of tags) {
    await expect(dialog.getByTestId("test-evidence").getByTestId("provenance-badge").filter({ hasText: tag }).first()).toBeVisible();
  }
  const number = dialog.getByTestId("test-evidence-row").first().getByTestId("evidence-number");
  await number.click();
  const panel = page.getByTestId("evidence-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Where this number comes from" })).toBeVisible();
  await expect(panel.getByTestId("provenance-badge").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(dialog).toBeVisible(); // the test stays open under the panel
  await expect(number).toBeFocused();
});

test("the unfiltered chart draws every test with the cabin-air window and stays responsive", async ({ page, request }) => {
  const all = await api<TestsResponse>(request, "/catalog/tests?limit=1&include=points");
  const presets = await api<AirPresets>(request, "/air/presets");
  const station = presets.presets.find((preset) => preset.id === presets.default)!;
  const plotted = all.points!.items.length;
  const investigations = new Set(all.points!.items.map((point) => point[1]));

  await page.goto("/tests");
  await expectCharted(page, plotted);
  await expect(page.getByTestId("air-window")).toBeVisible();
  await expect(page.getByTestId("air-window-label")).toHaveText(`Chosen cabin air: ${station.label}`);
  await expect(page.getByTestId("chart-summary")).toContainText(`${plotted.toLocaleString("en-US")} tests state both oxygen and pressure`);
  await expect(page.getByTestId("inside-count")).toContainText(`of these ${plotted.toLocaleString("en-US")} tests fall inside the chosen cabin air`);
  await expect(page.getByTestId("no-average-note")).toBeVisible();

  // The legend names every investigation on the chart once; past the eighth they share one "other" entry.
  const legend = page.getByTestId("chart-legend").locator("[data-legend]");
  await expect(legend).toHaveCount(Math.min(investigations.size, 8) + (investigations.size > 8 ? 1 : 0));

  // A few tests far above the rest stay honest: counted, named, one click away.
  const view = page.getByTestId("chart-view");
  if ((await view.count()) > 0 && Number(await view.getAttribute("data-off-view")) > 0) {
    await view.getByRole("button", { name: "Show every pressure" }).click();
    await expect(page.getByTestId("chart-dots").locator("path")).toHaveCount(plotted);
    await expect(view).toHaveAttribute("data-off-view", "0");
    await view.getByRole("button", { name: "Show the usual pressure range" }).click();
  }
  expect(await chartedTests(page)).toBe(plotted);

  // The FLEX test at 0 kPa is a known suspect value: it must be on the chart, not cut off.
  await page.getByTestId("chart-summary").scrollIntoViewIfNeeded();
  const svg = await page.getByTestId("tests-chart").locator("svg").boundingBox();
  const suspect = await page.getByTestId("chart-dots").locator('[data-test-id="PSI-69/114"]').boundingBox();
  expect(svg && suspect).toBeTruthy();
  expect(suspect!.y + suspect!.height).toBeLessThanOrEqual(svg!.y + svg!.height);
  expect(suspect!.y).toBeGreaterThanOrEqual(svg!.y);

  // Responsive: hovering a dot shows its test at once, and a filter still ticks at once.
  await page.mouse.move(suspect!.x + suspect!.width / 2, suspect!.y + suspect!.height / 2);
  await expect(page.getByTestId("chart-tooltip")).toBeVisible({ timeout: 1000 });
  const fuel = page.locator('input[data-facet="fuel"]').first();
  const started = Date.now();
  await fuel.check();
  await expect(fuel).toBeChecked({ timeout: 1000 });
  expect(Date.now() - started).toBeLessThan(2000);

  // Keyboard: focus the chart, move to a dot, open it.
  await page.getByTestId("tests-chart").focus();
  await page.keyboard.press("Home");
  await expect(page.getByTestId("chart-tooltip")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("test-dialog")).toBeVisible();
});

test("an inverse flame is named once in its row, by its flag", async ({ page, request }) => {
  const rows = await api<TestsResponse>(request, "/catalog/tests?psi_id=PSI-10&limit=500");
  const inverse = rows.items.find((row) => !row.comparable && row.flags.includes("oxygen_is_burner_stream"));
  expect(inverse, "Flame Design lists inverse flames").toBeTruthy();

  await page.goto("/tests?psi_id=PSI-10&limit=500");
  const row = page.locator(`[data-testid="test-row"][data-test-id="${inverse!.test_id}"]`);
  await expect(row.locator('[data-flag="oxygen_is_burner_stream"]')).toHaveText("Inverse flame");
  await expect(row.getByTestId("not-comparable")).toHaveCount(0); // the badge says it once
  const comparable = rows.items.find((item) => item.comparable)!;
  await expect(page.locator(`[data-testid="test-row"][data-test-id="${comparable.test_id}"]`).getByTestId("not-comparable")).toHaveCount(0);
});

test("a long value list folds to its largest counts and opens in full", async ({ page, request }) => {
  const all = await api<TestsResponse>(request, "/catalog/tests?limit=1");
  const fuels = all.facets.fuel ?? [];
  test.skip(fuels.length <= 12, "the tables name few fuels");

  await page.goto("/tests");
  const options = page.locator('input[data-facet="fuel"]');
  await expect(options).toHaveCount(10);
  await expect(options.first()).toHaveAttribute("data-value", fuels[0].value);
  await page.getByTestId("facet-more-fuel").click();
  await expect(options).toHaveCount(fuels.length);
  // Every investigation stays listed.
  await expect(page.locator('input[data-facet="psi_id"]')).toHaveCount((all.facets.psi_id ?? []).length);
});

test("an investigation whose tests state no oxygen or no pressure gets a note, not an empty chart", async ({ page, request }) => {
  // DOB-153. Guard: draw the chart whatever the points are (components/tests/TestsExplorer.tsx)
  // and the empty chart is back, so the "no chart" checks go red.
  for (const psiId of ["PSI-107", "PSI-26"]) {
    const answer = await api<TestsResponse>(request, `/catalog/tests?psi_id=${psiId}&limit=1&include=points`);
    expect(answer.total, `${psiId} has tests`).toBeGreaterThan(0);
    expect(answer.points!.items.length, `${psiId} has no test with both oxygen and pressure`).toBe(0);
    expect(answer.points!.not_plotted).toBe(answer.total);

    await page.goto(`/tests?psi_id=${psiId}`);
    await expect(page.getByTestId("result-count")).toHaveText(matchText(answer.total));
    await expect(page.getByTestId("chart-empty")).toHaveText(noChartNote(answer.total));
    await expect(page.getByTestId("tests-chart")).toHaveCount(0);
    await expect(page.getByTestId("no-average-note")).toHaveCount(0);
    // The tests are still there, in the table.
    await expect(page.getByTestId("test-row").first()).toBeVisible();
  }

  // Taking the filter off brings the chart back.
  await facet(page, "psi_id", "PSI-26").uncheck();
  await expect(page.getByTestId("chart-dots")).toBeAttached();
  await expect(page.getByTestId("chart-empty")).toHaveCount(0);
  await expect(page.getByTestId("no-average-note")).toBeVisible();
});

test("the Fuel filter can be searched by name", async ({ page, request }) => {
  // DOB-154. Guard: drop searchFacetOptions from components/tests/TestsRail.tsx and typing no
  // longer narrows the list, so the count after typing goes red.
  const all = await api<TestsResponse>(request, "/catalog/tests?limit=1");
  const fuels = all.facets.fuel ?? [];
  expect(fuels.length, "the tables name many fuels").toBeGreaterThan(12);
  const label = (option: { value: string; label?: string | null }) => facetLabel("fuel", option);
  // A fuel past the first ten (hidden until searched), with a plain name.
  const target = fuels.slice(10).find((fuel) => /^[A-Za-z0-9 ,.()-]{5,}$/.test(fuel.value))!;
  expect(target, "a fuel past the first ten").toBeTruthy();
  const typed = label(target).slice(0, 5).toUpperCase();
  const matches = searchFacetOptions(fuels, [], typed, label);
  expect(matches.length).toBeLessThan(fuels.length);

  await page.goto("/tests");
  const options = page.locator('input[data-facet="fuel"]');
  await expect(options).toHaveCount(10);
  await expect(facet(page, "fuel", target.value)).toHaveCount(0);

  const box = page.getByRole("searchbox", { name: "Search fuels" });
  await box.fill(typed);
  await expect(options).toHaveCount(matches.length);
  await expect(facet(page, "fuel", target.value)).toBeVisible();
  await expect(page.getByTestId("facet-more-fuel")).toHaveCount(0);

  // Nothing matches: the list says so.
  await box.fill("no such fuel 123");
  await expect(options).toHaveCount(0);
  await expect(page.getByTestId("facet-none-fuel")).toBeVisible();

  // The found fuel can be ticked, and the filter applies.
  await box.fill(typed);
  await facet(page, "fuel", target.value).check();
  await expect(page).toHaveURL(/[?&]fuel=/);
  const filtered = await api<TestsResponse>(request, `/catalog/tests?fuel=${encodeURIComponent(target.value)}&limit=1`);
  await expect(page.getByTestId("result-count")).toHaveText(matchText(filtered.total));
  await expect(facet(page, "fuel", target.value)).toBeChecked();

  // The Investigation list is short and fixed: it has no search box.
  await expect(page.getByTestId("facet-search-psi_id")).toHaveCount(0);
});

test("no match says so and offers a way out; no data service shows the error state", async ({ page, request }) => {
  const none = await api<TestsResponse>(request, "/catalog/tests?psi_id=PSI-10&outcome=Extinction&limit=1");
  const all = await api<TestsResponse>(request, "/catalog/tests?limit=1");
  expect(none.total).toBe(0);

  await page.goto("/tests?psi_id=PSI-10&outcome=Extinction");
  await expect(page.getByTestId("no-results")).toContainText("No test matches these filters");
  await expect(page.getByTestId("result-count")).toHaveText(matchText(0));
  await page.getByTestId("no-results").getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByTestId("result-count")).toHaveText(matchText(all.total));
  await expect(page).toHaveURL(/\/tests$/);

  await page.route("**/api/v1/**", (route) => route.abort());
  await page.route("**/snapshot/**", (route) => route.abort());
  await page.goto("/tests");
  const error = page.getByTestId("error-state");
  await expect(error).toBeVisible();
  await expect(error).toContainText("The data service is not answering");
  await expect(error.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByTestId("test-row")).toHaveCount(0);
});

test("a range filter says how many tests it leaves out and pages through the rest", async ({ page, request }) => {
  const all = await api<TestsResponse>(request, "/catalog/tests?limit=1");
  const rich = await api<TestsResponse>(request, "/catalog/tests?o2_min=0.3&limit=1");

  await page.goto("/tests");
  await page.getByLabel("Oxygen from, in percent").fill("30");
  await page.getByRole("button", { name: "Apply ranges" }).click();
  await expect(page).toHaveURL(/[?&]o2_min=0\.3(&|$)/);
  await expect(page.getByLabel("Oxygen from, in percent")).toHaveValue("30");
  await expect(page.getByTestId("result-count")).toHaveText(matchText(rich.total));
  if (rich.excluded.o2 > 0) {
    await expect(page.getByTestId("excluded")).toContainText(
      `${rich.excluded.o2.toLocaleString("en-US")} tests are left out because their table states no oxygen.`,
    );
  }

  await page.goto("/tests");
  await expect(page.getByTestId("test-row")).toHaveCount(50);
  await page.getByRole("button", { name: "Next 50" }).click();
  await expect(page).toHaveURL(/[?&]offset=50/);
  await expect(page.getByTestId("paging")).toContainText(`Showing 51 to 100 of ${all.total.toLocaleString("en-US")} tests`);
});

test("screenshots of the tests explorer", async ({ page, request }) => {
  const all = await api<TestsResponse>(request, "/catalog/tests?limit=1&include=points");
  for (const [width, height, suffix] of [
    [1366, 768, "1366"],
    [390, 844, "390"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/tests");
    await expectCharted(page, all.points!.items.length);
    await page.screenshot({ path: `test-results/screens/tests-${suffix}.png` });
    await page.screenshot({ path: `test-results/screens/tests-full-${suffix}.png`, fullPage: true });
    await page.goto("/tests?psi_id=PSI-69&outcome=Extinction&test=PSI-69%2F114");
    await expect(page.getByTestId("test-source-file")).toBeVisible();
    await page.screenshot({ path: `test-results/screens/tests-open-${suffix}.png` });
    await page.goto("/tests?test=PSI-69%2F1");
    await expect(page.getByTestId("test-evidence-row").first()).toBeVisible();
    await page.screenshot({ path: `test-results/screens/tests-open-evidence-${suffix}.png` });
    await page.keyboard.press("Escape");
    await page.goto("/tests?psi_id=PSI-69&outcome=Extinction");
    await expectCharted(page, FLEX_EXTINCTIONS);
    await page.screenshot({ path: `test-results/screens/tests-flex-extinction-${suffix}.png`, fullPage: true });
    await page.goto("/?air=exploration");
    await expect(page.getByTestId("air-control")).toBeVisible();
    await page.screenshot({ path: `test-results/screens/header-${suffix}.png`, clip: { x: 0, y: 0, width, height: 260 } });
  }
});
