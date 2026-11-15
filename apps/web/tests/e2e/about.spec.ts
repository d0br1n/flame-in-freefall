import { expect, test } from "@playwright/test";
import { PITFALLS } from "../../lib/giveBack";

// DOB-160: the About page says what the team gives back (the PSI data pitfalls, each under its
// PSI ID) and that SI does not decide the numbers. Guard: remove the "What we give back" card
// from app/about/page.tsx and the list check goes red.
test("About lists the PSI data pitfalls under their PSI IDs and says what SI does not decide", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "What we give back" })).toBeVisible();
  const items = page.getByTestId("about-pitfalls").locator("li");
  await expect(items).toHaveCount(PITFALLS.length);
  for (const [i, item] of PITFALLS.entries()) {
    await expect(items.nth(i).getByRole("link", { name: item.psiId, exact: true })).toHaveAttribute("href", new RegExp(`^/investigations/${item.psiId}`));
    await expect(items.nth(i)).toContainText(item.text);
  }
  await expect(page.getByRole("link", { name: /The full note/ })).toHaveAttribute("href", /submission\/PSI_DATA_NOTE\.md$/);
  await expect(page.getByText("The note has not been sent yet.")).toBeVisible();

  await expect(page.getByTestId("about-si-not")).toContainText("SI does not decide the numbers");
  await expect(page.getByTestId("about-si-not")).toContainText("computed by scripts from NASA's PSI files");
});

// DOB-158: the scenarios say what burnrate would have shown, as thought experiments.
test("the scenarios index says what burnrate would have shown, as thought experiments", async ({ page }) => {
  await page.goto("/scenarios");
  await expect(page.getByRole("heading", { name: "What burnrate would have shown" })).toBeVisible();
  await expect(page.getByText("Each scenario is a thought experiment on the data NASA has published.")).toBeVisible();
  await expect(page.getByText(/would have stopped|in seconds/i)).toHaveCount(0);
  await page.goto("/scenarios/apollo-1");
  await expect(page.getByText(/would have stopped|stop the test/i)).toHaveCount(0);
  await expect(page.getByText("What burnrate would have shown").first()).toBeVisible();
});
