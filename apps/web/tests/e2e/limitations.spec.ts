import { expect, test } from "@playwright/test";

// DOB-155: on the Limitations page, the whole card of an investigation opens that investigation,
// the same way a row of the Investigations list does (one link, stretched over the card).
// Guard: remove the stretched link in components/limits/LimitationsView.tsx and the click on the
// card's far end lands nowhere, so the address check goes red.

test("the whole card of an investigation on Limitations opens it, through one link", async ({ page }) => {
  await page.goto("/limitations#PSI-69");
  const card = page.locator('[data-testid="limits-investigation"][aria-current="true"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("id", "limit-PSI-69");
  // One link per card: the PSI ID, stretched over the card.
  await expect(card.getByRole("link")).toHaveCount(1);
  await expect(card.getByRole("link")).toHaveText("PSI-69");
  // A click away from the PSI ID, at the far end of the card, still opens the investigation.
  const box = (await card.boundingBox())!;
  await card.click({ position: { x: box.width - 12, y: box.height - 10 } });
  await expect(page).toHaveURL(/\/investigations\/PSI-69$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Flame Extinguishment Experiment");
});
