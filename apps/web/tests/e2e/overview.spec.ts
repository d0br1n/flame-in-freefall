import { expect, test } from "@playwright/test";
import { inAirSummary, statusPill } from "../../lib/overview";
import type { AirCoverage, AirPresets, InvestigationList, TestsResponse } from "../../lib/types";
import { airControl, api } from "./helpers";

// The redesigned shell and Overview (approved mockup of 14 November 2026). Every expected number
// is read from the real backend, never typed in.

test("the sidebar shows the sections with counts read from the API", async ({ page, request }) => {
  const catalog = await api<InvestigationList>(request, "/catalog/investigations");
  const tests = await api<TestsResponse>(request, "/catalog/tests?limit=1");
  await page.goto("/");
  const expected: Record<string, number> = {
    spread: catalog.items.filter((item) => item.stage === "spread").length,
    suppress: catalog.items.filter((item) => item.stage === "suppress").length,
    investigations: catalog.count,
    tests: tests.total,
  };
  for (const [key, value] of Object.entries(expected)) {
    await expect(page.locator(`[data-testid="nav-count"][data-count="${key}"]`)).toHaveText(new RegExp(`${value.toLocaleString("en-US")}$`));
  }
  // The groups are named Start, Data, Analyses, About and Tools, and there is no Detection link.
  for (const name of ["Start", "Data", "Analyses", "About", "Tools"]) await expect(page.getByRole("navigation", { name, exact: true })).toBeVisible();
  await expect(page.locator("#sidebar").getByRole("link", { name: /Detection/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Start", exact: true }).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
});

test("switching a preset changes In this air and the analysis cards, as the API says", async ({ page, request }) => {
  const presets = await api<AirPresets>(request, "/air/presets");
  const catalog = await api<InvestigationList>(request, "/catalog/investigations");
  const other = presets.presets.find((preset) => preset.id === "exploration") ?? presets.presets.find((p) => p.id !== presets.default)!;
  const [a, b] = await Promise.all([
    api<AirCoverage>(request, `/air/coverage?air=${presets.default}`),
    api<AirCoverage>(request, `/air/coverage?air=${other.id}`),
  ]);
  const sa = inAirSummary(a, catalog.items);
  const sb = inAirSummary(b, catalog.items);
  expect(`${sa.inside}/${sa.stated}`).not.toBe(`${sb.inside}/${sb.stated}`);

  await page.goto("/");
  const count = page.getByTestId("in-air-count");
  await expect(count).toHaveAttribute("data-inside", String(sa.inside));
  await expect(count).toHaveAttribute("data-stated", String(sa.stated));
  await expect(page.getByTestId("in-air-row").first()).toHaveAttribute("data-psi-id", sa.rows[0].psi_id);
  await expect(page.getByTestId("stage-card")).toHaveCount(2);
  const suppress = page.locator('[data-testid="stage-card"][data-stage="suppress"]').getByTestId("stage-status");
  await expect(suppress).toHaveText(statusPill(a.stages.suppress!.status)!.word);

  await page.locator(`[data-testid="preset-chip"][data-air="${other.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`[?&]air=${other.id}`));
  await expect(count).toHaveAttribute("data-inside", String(sb.inside));
  await expect(count).toHaveAttribute("data-stated", String(sb.stated));
  await expect(suppress).toHaveText(statusPill(b.stages.suppress!.status)!.word);
  await expect(page.getByTestId("air-badge")).toHaveText("Preset");
  await expect(airControl(page)).toHaveAttribute("data-value", other.id);

  // A PSI chip leads to its investigation, "Open tests" to the tests in this air.
  await page.getByTestId("open-tests").click();
  await expect(page).toHaveURL(new RegExp(`/tests\\?air=${other.id}$`));
});

test("the custom air: live sliders when the backend offers it, a quiet note when it does not", async ({ page, request }) => {
  const presets = await api<AirPresets>(request, "/air/presets");
  const catalog = await api<InvestigationList>(request, "/catalog/investigations");
  await page.goto("/");
  await expect(page.getByTestId("cabin-air")).toHaveAttribute("data-air", presets.default);

  if (!presets.custom) {
    await expect(page.getByTestId("custom-unavailable")).toContainText("Custom air is not available yet");
    await expect(page.getByTestId("slider-o2")).toHaveCount(0);
    return;
  }

  // Move the oxygen slider with the keyboard: the URL becomes a custom air after the debounce.
  const o2 = page.getByTestId("slider-o2");
  await o2.focus();
  for (let i = 0; i < 4; i += 1) await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("air-badge")).toHaveText("Custom");
  await expect(page).toHaveURL(/[?&]air=custom&o2=[\d.]+&p=[\d.]+/);
  const url = new URL(page.url());
  const point = { o2: url.searchParams.get("o2")!, p: url.searchParams.get("p")! };
  const windowAnswer = await api<{ label: string; plain: string }>(request, `/air/window?o2=${point.o2}&pressure_kpa=${point.p}`);
  const coverage = await api<AirCoverage>(request, `/air/coverage?o2=${point.o2}&pressure_kpa=${point.p}`);
  expect(coverage.air).toBe("custom");
  const summary = inAirSummary(coverage, catalog.items);
  await expect(page.getByTestId("cabin-air")).toHaveAttribute("data-air", "custom");
  await expect(page.getByTestId("air-plain")).toHaveText(windowAnswer.plain);
  await expect(page.getByTestId("in-air-count")).toHaveAttribute("data-inside", String(summary.inside));
  await expect(page.getByTestId("in-air")).toHaveAttribute("data-air", "custom");
  await expect(page.getByTestId("top-rank")).toHaveAttribute("data-air", "custom");
  if (presets.custom_plain) await expect(page.getByTestId("slider-note")).toContainText(presets.custom_plain);

  // The custom air travels with the links and survives a reload.
  await page.reload();
  await expect(page.getByTestId("air-badge")).toHaveText("Custom");
  await page.getByRole("navigation", { name: "Data" }).getByRole("link", { name: /^Tests/ }).click();
  await expect(page).toHaveURL(new RegExp(`/tests\\?air=custom&o2=${point.o2}&p=${point.p}$`));
  await expect(airControl(page)).toHaveAttribute("data-value", "custom");
  await expect(page.getByTestId("air-window")).toHaveAttribute("data-air", "custom");

  // A preset chip goes back to ?air=<id>, with no point in the URL.
  await page.goto(`/?air=custom&o2=${point.o2}&p=${point.p}`);
  await page.locator(`[data-testid="preset-chip"][data-air="${presets.default}"]`).click();
  await expect(page).toHaveURL(new RegExp(`\\?air=${presets.default}$`));
});

test("without backend support for a custom air, the sliders give way to a quiet note", async ({ page }) => {
  // Simulate the older backend: presets without slider ranges, no /air/window route.
  await page.route("**/api/v1/air/presets", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as AirPresets;
    delete body.custom;
    delete body.custom_plain;
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/v1/air/window**", (route) => route.fulfill({ status: 404, json: { detail: "Not Found" } }));
  await page.goto("/");
  await expect(page.getByTestId("custom-unavailable")).toContainText("Custom air is not available yet");
  await expect(page.getByTestId("slider-o2")).toHaveCount(0);
  await expect(page.getByTestId("preset-chip").first()).toBeVisible();

  // A copied custom link still shows a result: the default preset, and the same note (with no
  // slider range the page has no sliders to try again with, DOB-147).
  await page.goto("/?air=custom&o2=0.3&p=70");
  await expect(page.getByTestId("custom-unavailable")).toContainText("Custom air is not available yet");
  await expect(page.getByTestId("in-air-count")).toBeVisible();
});

test("night mode is applied before paint and survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
  const dayBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect(page.getByTestId("theme-toggle")).toHaveAccessibleName("Day mode");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect(page.getByTestId("theme-toggle")).toHaveAccessibleName("Day mode");
  // Different colours, really applied: the night background is not the day one, and it is dark.
  // (The palette's own values are in app/globals.css; a redesign must not break this test.)
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).not.toBe(dayBg);
  const [r, g, b] = bg.match(/\d+/g)!.map(Number);
  expect(Math.max(r, g, b)).toBeLessThan(60);
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
});

test("with nothing stored, the system's dark preference picks night", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await context.close();
});

test("the search finds an investigation and a test, and opens them", async ({ page }) => {
  await page.goto("/");
  // Wait until the page is interactive (the data has arrived), then "/" focuses the search.
  await expect(page.getByTestId("in-air-count")).toBeVisible();
  await page.keyboard.press("/");
  const input = page.getByTestId("search-input");
  await expect(input).toBeFocused();
  await input.fill("flex");
  const results = page.getByTestId("search-results");
  await expect(results.getByRole("option").first()).toContainText("PSI-69");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/investigations\/PSI-69/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Flame Extinguishment Experiment");

  await page.getByTestId("search-input").fill("qqqq");
  await expect(page.getByTestId("search-results")).toContainText("Nothing matches");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("search-results")).toHaveCount(0);

  await page.getByTestId("search-input").fill("PSI-69/114");
  await page.getByRole("option", { name: /Search tests for “PSI-69\/114”/ }).click();
  await expect(page).toHaveURL(/\/tests\?test=PSI-69%2F114/);
  await expect(page.getByRole("dialog")).toContainText("PSI-69/114");
});

test("the Ask button opens and closes the assistant dock, which stays open across pages", async ({ page }) => {
  await page.goto("/");
  const ask = page.getByTestId("ask-button");
  const dock = page.getByTestId("assistant-dock");
  await expect(dock).toHaveAttribute("data-open", "false");
  await ask.click();
  await expect(ask).toHaveAttribute("aria-expanded", "true");
  await expect(dock).toHaveAttribute("data-open", "true");
  await expect(dock.getByRole("button", { name: "Close assistant" })).toBeVisible();
  await page.getByRole("navigation", { name: "Data" }).getByRole("link", { name: /^Investigations/ }).click();
  await expect(page).toHaveURL(/\/investigations/);
  await expect(dock).toHaveAttribute("data-open", "true");
  await dock.getByRole("button", { name: "Close assistant" }).click();
  await expect(dock).toHaveAttribute("data-open", "false");
  await expect(ask).toBeFocused();
  await ask.click();
  await expect(dock.getByRole("button", { name: "Close assistant" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dock).toHaveAttribute("data-open", "false");
});

test("on a phone the drawer opens, keeps focus inside, and closes with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.click();
  // Located by id: once closed, the drawer is inert and leaves the accessibility tree.
  const sidebar = page.locator("#sidebar");
  await expect(sidebar).toHaveAttribute("data-open", "true");
  for (let i = 0; i < 20; i += 1) await page.keyboard.press("Tab");
  expect(await sidebar.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sidebar).toHaveAttribute("data-open", "false");
  await expect(menu).toBeFocused();

  // The dock is a full-screen sheet on a phone.
  await page.getByTestId("ask-button").click();
  const box = await page.getByTestId("assistant-dock").boundingBox();
  expect(Math.round(box!.width)).toBe(390);
});

// DOB-147: the first move away from a preset used to swap the sliders for a loading state, which
// dropped a drag and took the keyboard focus. Each key press must move the slider, keep the focus
// and reach the address.
test("the cabin air sliders keep working after their first move", async ({ page }) => {
  await page.goto("/");
  const oxygen = page.getByTestId("air-sliders").locator("input[type=range]").first();
  await oxygen.focus();
  const start = Number(await oxygen.inputValue());
  const step = Number(await oxygen.getAttribute("step"));
  for (let press = 1; press <= 3; press += 1) {
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(new RegExp(`o2=${((start + press * step) / 100).toFixed(4).replace(/0+$/, "").replace(/\\.$/, "")}(&|$)`));
    await expect(oxygen).toBeFocused();
    await expect(oxygen).toHaveValue(String(start + press * step));
  }
  await expect(page.getByTestId("air-badge")).toHaveText("Custom");
});

test("the sliders mark where tests exist, and one button jumps to the nearest tested air", async ({ page }) => {
  await page.goto("/");
  const jump = page.getByTestId("jump-nearest");
  await expect(jump).toBeVisible();
  // Marks under both sliders, drawn from the catalogued tests that state oxygen and pressure.
  expect(await page.getByTestId("slider-o2-marks").locator("span").count()).toBeGreaterThan(5);
  expect(await page.getByTestId("slider-pressure-marks").locator("span").count()).toBeGreaterThan(2);
  await expect(page.getByTestId("tested-air-note")).toContainText("catalogued tests that state");

  // An air far from most tests, then the jump: the sliders move onto a real test, which is named and linked.
  await page.getByTestId("slider-o2").fill("36");
  await page.getByTestId("slider-pressure").fill("250");
  await expect(page).toHaveURL(/o2=0\.36/);
  await jump.click();
  const note = page.getByTestId("tested-air-note");
  await expect(note).toContainText("Nearest test:");
  await expect(note.getByRole("link")).toHaveAttribute("href", /\/tests\?test=PSI-/);
  await expect(page).not.toHaveURL(/o2=0\.36&p=250/);
  await expect(page.getByTestId("air-badge")).toHaveText("Custom");

  // A preset clears the note again.
  await page.getByTestId("preset-chip").first().click();
  await expect(note).toContainText("catalogued tests that state");
});
