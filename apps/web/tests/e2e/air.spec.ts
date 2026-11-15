import { expect, test } from "@playwright/test";
import type { AirPresets, TestsResponse } from "../../lib/types";
import { airControl, api, chooseAir, expectCharted, matchText } from "./helpers";

// DOB-84: the visitor sets the cabin air once, in the top bar; every page shows the same air and a
// copied link carries it. Presets and counts come from the real backend (GET /air/presets, /catalog/tests).
// Guard: make the tests page keep its own air instead of useAir() and the first test goes red.

test("the air chosen on the home page is the air of the tests page, after a reload and in a copied link", async ({
  page,
  context,
  request,
}) => {
  const presets = await api<AirPresets>(request, "/air/presets");
  const exploration = presets.presets.find((preset) => preset.id === "exploration")!;
  expect(exploration, "the backend lists the exploration atmosphere").toBeTruthy();
  expect(presets.default).not.toBe("exploration"); // otherwise the switch below proves nothing

  await page.goto("/");
  await expect(airControl(page)).toHaveAttribute("data-value", presets.default); // the backend's default, shown as chosen
  await chooseAir(page, "exploration");
  await expect(page).toHaveURL(/[?&]air=exploration/);
  await expect(page.getByTestId("air-plain")).toHaveText(exploration.plain);
  await expect(page.getByTestId("air-tolerance")).toHaveText(exploration.tolerance_plain);
  // The preset's source sentence is never dropped: the home page shows it as the air's source note.
  await expect(page.getByTestId("air-source")).toContainText(exploration.source);

  await page.getByRole("navigation", { name: "Data" }).getByRole("link", { name: /^Tests/ }).click();
  await expect(page).toHaveURL(/\/tests\?air=exploration$/);
  const check = async (target: typeof page) => {
    await expect(airControl(target)).toHaveAttribute("data-value", "exploration");
    await expect(target.getByTestId("air-window")).toHaveAttribute("data-air", "exploration");
    await expect(target.getByTestId("air-window-label")).toHaveText(`Chosen cabin air: ${exploration.label}`);
    await expect(target.getByTestId("inside-count")).toContainText(`(${exploration.label})`);
  };
  await check(page);

  await page.reload();
  await check(page);

  const copied = await context.newPage();
  await copied.goto(page.url());
  await check(copied);
  await copied.close();
});

test("changing the air keeps the page's filters", async ({ page, request }) => {
  const flex = await api<TestsResponse>(request, "/catalog/tests?psi_id=PSI-69&limit=1");
  const presets = await api<AirPresets>(request, "/air/presets");
  const highOxygen = presets.presets.find((preset) => preset.id === "high_oxygen")!;

  await page.goto("/tests?psi_id=PSI-69");
  await expect(page.getByTestId("result-count")).toHaveText(matchText(flex.total));
  await chooseAir(page, "high_oxygen");
  await expect(page).toHaveURL(/psi_id=PSI-69/);
  await expect(page).toHaveURL(/air=high_oxygen/);
  await expect(page.getByTestId("air-window-label")).toHaveText(`Chosen cabin air: ${highOxygen.label}`);
  await expect(page.getByTestId("result-count")).toHaveText(matchText(flex.total));
});

test("with no cabin airs, the control says so and the pages still render", async ({ page, request }) => {
  const all = await api<TestsResponse>(request, "/catalog/tests?limit=1&include=points");
  await page.route("**/api/v1/air/**", (route) => route.abort());
  await page.route("**/snapshot/api/v1/air/**", (route) => route.abort());

  await page.goto("/investigations");
  await expect(page.getByTestId("air-error")).toContainText("Cabin air unavailable");
  await expect(page.getByTestId("investigation-row")).toHaveCount(24);
  await expect(page.getByTestId("air-independent")).toHaveText("The list is the same for every cabin air.");

  await page.goto("/tests");
  await expect(page.getByTestId("air-error")).toContainText("Cabin air unavailable");
  await expectCharted(page, all.points!.items.length);
  await expect(page.getByTestId("air-window")).toHaveCount(0);
  await expect(page.getByTestId("chart-summary")).toContainText("no window is drawn");
});
