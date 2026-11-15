import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Shared by the browser tests: they run on the real backend, so expected numbers are read from
// the same API the page reads (through the site's own /api/v1 forwarding), never typed in.

/** GET one API path (below /api/v1) and return its JSON. */
export async function api<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`/api/v1${path}`);
  expect(response.ok(), `GET /api/v1${path} answers`).toBe(true);
  return (await response.json()) as T;
}

/** The count line of the tests explorer: "2,001 tests match". */
export function matchText(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "test" : "tests"} match`;
}

/** The tests a chart accounts for: the dots drawn plus those above its default pressure view. */
export async function chartedTests(page: Page): Promise<number> {
  const dots = await page.getByTestId("chart-dots").locator("path").count();
  const view = page.getByTestId("chart-view");
  const off = (await view.count()) > 0 ? Number(await view.getAttribute("data-off-view")) : 0;
  return dots + off;
}

/** Wait until the chart accounts for exactly `count` tests. */
export async function expectCharted(page: Page, count: number): Promise<void> {
  await expect(page.getByTestId("chart-dots")).toBeAttached();
  await expect.poll(() => chartedTests(page)).toBe(count);
}

/** Choose a cabin-air preset in the top bar's dropdown (a listbox, not a native select). */
export async function chooseAir(page: Page, id: string): Promise<void> {
  await page.getByRole("button", { name: /^Cabin air:/ }).click();
  await page.getByRole("listbox", { name: "Cabin air" }).locator(`[role="option"][data-value="${id}"]`).click();
}

/** The air the top bar's dropdown shows as chosen. */
export function airControl(page: Page) {
  return page.getByTestId("air-control");
}
