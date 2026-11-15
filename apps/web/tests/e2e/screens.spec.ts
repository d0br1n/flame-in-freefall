import { expect, test, type Page } from "@playwright/test";

// Screenshots of the redesign for a visual check against the approved mockup
// (design/mockup-2026-11-14/app.html): the Overview in day and night, with the dock open and
// closed, at 1440 x 900 and 390 x 844; each section page; the drawer on a phone.
// Written to test-results/screens/redesign-*.png. No assertion beyond "the page rendered".

async function setTheme(page: Page, theme: "day" | "night") {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("burnrate-theme", value);
    } catch {
      // storage blocked: the default theme is shot
    }
  }, theme);
}

async function settle(page: Page) {
  await expect(page.getByTestId("page-title")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  for (const theme of ["day", "night"] as const) {
    test(`overview screenshots ${width} ${theme}`, async ({ page }) => {
      await setTheme(page, theme);
      await page.setViewportSize({ width, height });
      await page.goto("/");
      // Two analyses since the detection page was removed: Video to Data and the Suppression test bench.
      await expect(page.getByTestId("stage-card")).toHaveCount(2);
      await expect(page.getByTestId("in-air-count")).toBeVisible();
      await settle(page);
      const tag = `${width}-${theme}`;
      await page.screenshot({ path: `test-results/screens/redesign-${tag}-overview.png` });
      await page.getByTestId("ask-button").click();
      await page.waitForTimeout(450);
      await page.screenshot({ path: `test-results/screens/redesign-${tag}-overview-dock.png` });
      await page.getByRole("button", { name: "Close assistant" }).click();
      await page.waitForTimeout(350);
      // The rest of the Overview, scrolled.
      await page.locator("#main").evaluate((element) => element.scrollTo(0, element.scrollHeight / 2));
      await page.waitForTimeout(250);
      await page.screenshot({ path: `test-results/screens/redesign-${tag}-overview-mid.png` });
      await page.locator("#main").evaluate((element) => element.scrollTo(0, element.scrollHeight));
      await page.waitForTimeout(250);
      await page.screenshot({ path: `test-results/screens/redesign-${tag}-overview-end.png` });

      for (const path of ["/spread", "/suppress", "/scenarios", "/compare", "/limitations", "/investigations", "/investigations?sort=rank", "/investigations/PSI-69", "/tests", "/about", "/assistant"]) {
        await page.goto(path);
        await settle(page);
        const name = path.replace(/^\//, "").replace(/[/?=]/g, "-") || "home";
        await page.screenshot({ path: `test-results/screens/redesign-${tag}-${name}.png` });
      }

      if (width < 1024) {
        await page.goto("/");
        await settle(page);
        await page.getByRole("button", { name: "Open menu" }).click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `test-results/screens/redesign-${tag}-drawer.png` });
      } else {
        await page.goto("/");
        await settle(page);
        await page.getByRole("button", { name: /^Cabin air:/ }).click();
        await page.screenshot({ path: `test-results/screens/redesign-${tag}-airmenu.png` });
        await page.keyboard.press("Escape");
        await page.getByTestId("search-input").fill("flex");
        await page.waitForTimeout(400);
        await page.screenshot({ path: `test-results/screens/redesign-${tag}-search.png` });
      }
    });
  }
}
