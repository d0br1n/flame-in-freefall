import { expect, test } from "@playwright/test";

// The site reaches the backend through its own /api/v1 forwarding rule.
// Guard: build with a wrong API_ORIGIN (for example http://127.0.0.1:9) and the first test goes
// red: the sidebar's investigation count never reports a live answer.
test("the home page loads and the backend answers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
  const count = page.locator('[data-testid="nav-count"][data-count="investigations"]');
  await expect(count).toHaveAttribute("data-source", "live");
  await expect(count).toHaveText(/24$/);
});

test("the catalog list is served through the site's own address", async ({ request }) => {
  const response = await request.get("/api/v1/catalog/investigations");
  expect(response.ok()).toBe(true);
  expect((await response.json()).count).toBe(24);
});
