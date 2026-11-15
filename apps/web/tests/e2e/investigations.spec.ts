import { expect, test } from "@playwright/test";

// DOB-68: list the investigations, narrow them, open one, see where every value came from.
// Counts come from the real backend; its catalog answers equal the generated catalog fixtures
// (tests/api/test_catalog.py fails if they differ).

test("filter the list, open SAME-R and find its sources and limits", async ({ page }) => {
  await page.goto("/investigations");
  const rows = page.getByTestId("investigation-row");
  await expect(rows).toHaveCount(24);
  await expect(page.getByTestId("result-count")).toHaveText("24 of 24 investigations");

  await page.getByRole("checkbox", { name: /^Detection/ }).check();
  await expect(page).toHaveURL(/[?&]pillar=detection/);
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId("result-count")).toHaveText("4 of 24 investigations");

  await page.getByRole("link", { name: "Smoke Aerosol Measurement Experiment-Reflight" }).click();
  await expect(page).toHaveURL(/\/investigations\/PSI-101$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Smoke Aerosol Measurement Experiment-Reflight");

  const psiLink = page.getByRole("link", { name: /Open this record on psi\.nasa\.gov/ });
  await expect(psiLink).toHaveAttribute("href", "https://doi.org/10.60555/2np7-jv14");
  await expect(psiLink).toHaveAttribute("target", "_blank");
  await expect(psiLink).toHaveAttribute("rel", "noopener noreferrer");

  // What the data cannot tell is on the Limitations page only (DOB-120): this page links to its entry there.
  await expect(page.getByTestId("cannot-tell")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Limits of this data" })).toHaveAttribute("href", /\/limitations#PSI-101$/);

  // One section at a time (DOB-123). Summary is the first one.
  const sections = page.getByRole("tablist", { name: "Sections of this investigation" });
  await expect(sections.getByRole("tab")).toHaveText([/^Summary/, /^NASA's description/, /^Data and files/, /^Conditions/, /^Publications/, /^Related/]);
  await expect(sections.getByRole("tab", { name: /^Summary/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "In plain words" })).toBeVisible();
  await expect(page.getByText("SI-written summary", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("source-note").first()).toBeVisible();

  await sections.getByRole("tab", { name: /^NASA's description/ }).click();
  await expect(page).toHaveURL(/\/investigations\/PSI-101#nasa$/);
  await expect(page.getByText("Text of the NASA PSI record, copied unchanged.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "In plain words" })).toBeHidden();
});

test("the cabin air choice survives navigation, filters do not", async ({ page }) => {
  await page.goto("/investigations?air=station&pillar=detection");
  await expect(page.getByTestId("investigation-row")).toHaveCount(4);
  await page.getByRole("link", { name: "Smoke Aerosol Measurement Experiment-Reflight" }).click();
  await expect(page).toHaveURL(/\/investigations\/PSI-101\?air=station$/);
  await page.getByRole("link", { name: "All investigations" }).click();
  await expect(page).toHaveURL(/\/investigations\?air=station$/);
  await expect(page.getByTestId("investigation-row")).toHaveCount(24);
});

test("a filter combination with no match says so and offers a way out", async ({ page }) => {
  await page.goto("/investigations?pillar=detection&fuel=solid");
  await expect(page.getByTestId("no-results")).toContainText("No investigation matches these filters");
  await expect(page.getByTestId("result-count")).toHaveText("0 of 24 investigations");
  await page.getByTestId("no-results").getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByTestId("investigation-row")).toHaveCount(24);
  await expect(page).toHaveURL(/\/investigations$/);
});

test("with no data service and no saved copy, the list shows the error state", async ({ page }) => {
  await page.route("**/api/v1/**", (route) => route.abort());
  await page.route("**/snapshot/**", (route) => route.abort());
  await page.goto("/investigations");
  const error = page.getByTestId("error-state");
  await expect(error).toBeVisible();
  await expect(error).toContainText("The data service is not answering");
  await expect(error.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByTestId("investigation-row")).toHaveCount(0);
});

test("an unknown PSI ID says so and links back to the list", async ({ page }) => {
  await page.goto("/investigations/PSI-1");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No investigation with this ID");
  await page.getByTestId("not-found").getByRole("link", { name: "See the list of investigations" }).click();
  await expect(page).toHaveURL(/\/investigations$/);
});

test("PSI-69 makes the gap between listed and offered data obvious", async ({ page }) => {
  // The older fragment #holdings opens the "Data and files" section.
  await page.goto("/investigations/PSI-69#holdings");
  const sections = page.getByRole("tablist", { name: "Sections of this investigation" });
  await expect(sections.getByRole("tab", { name: /^Data and files/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/PSI lists 923\.83 GB for this record, but offers no files to download/)).toBeVisible();
  await expect(page.getByText("PSI-69_Experimental table_FLEX.csv")).toBeVisible();
  await sections.getByRole("tab", { name: /^Publications/ }).click();
  await expect(page).toHaveURL(/\/investigations\/PSI-69#publications$/);
  await expect(page.getByRole("button", { name: "Show all 51 publications" })).toBeVisible();
});

test("the sidebar holds the sections with their counts, marks the current page, and the logo leads to the Overview", async ({ page }) => {
  await page.goto("/investigations");
  // The groups of lib/nav.ts: Start, Data, Analyses, About (and Tools at the foot).
  const start = page.getByRole("navigation", { name: "Start" });
  const data = page.getByRole("navigation", { name: "Data" });
  const analyses = page.getByRole("navigation", { name: "Analyses" });
  const about = page.getByRole("navigation", { name: "About", exact: true });
  await expect(start.getByRole("link")).toHaveCount(2);
  await expect(analyses.getByRole("link")).toHaveCount(2);
  for (const [nav, name] of [
    [start, "Overview"],
    [start, "Scenarios"],
    [data, "Investigations"],
    [data, "Compare"],
    [data, "Tests"],
    [analyses, "Video to Data"],
    [analyses, "Suppression test bench"],
    [about, "Limitations"],
    [about, "About the data"],
  ] as const) {
    await expect(nav.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  await expect(data.getByRole("link", { name: /^Investigations/ })).toHaveAttribute("aria-current", "page");
  await expect(data.getByRole("link", { name: /^Tests/ })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Tools" }).getByRole("link", { name: "Assistant" })).toHaveAttribute("href", /^\/assistant/);

  // The data credit and the quiet "About the data" link replace the old footer.
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  await expect(sidebar.getByRole("link", { name: "NASA Physical Sciences Informatics" })).toHaveAttribute(
    "href",
    "https://psi.nasa.gov/physci/repo",
  );
  await expect(sidebar).toContainText("Built by The Overfitters, Cluj-Napoca.");
  await sidebar.getByRole("link", { name: "About the data" }).click();
  await expect(page).toHaveURL(/\/about/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("About the data");
  await expect(page.getByRole("link", { name: /Every use of SI, listed/ })).toHaveAttribute("href", /\/blob\/main\/submission\/SI_USAGE\.md$/);
  await expect(page.locator("body")).not.toContainText("Not a certified safety tool");

  const logo = page.getByRole("link", { name: "burnrate, Overview" });
  await expect(logo).toHaveAttribute("href", /^\/(\?|$)/);
  await logo.click();
  await expect(page).toHaveURL(/\/(\?[^/]*)?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
});

test("on a phone the sidebar is a drawer and the cabin air stays reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/investigations");
  const menu = page.getByRole("button", { name: "Open menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("navigation", { name: "Data" }).getByRole("link", { name: /^Tests/ })).toBeHidden();
  await expect(page.getByTestId("air-control")).toBeVisible();

  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Data" }).getByRole("link", { name: /^Tests/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();

  await menu.click();
  await page.getByRole("navigation", { name: "Data" }).getByRole("link", { name: /^Tests/ }).click();
  await expect(page).toHaveURL(/\/tests/);
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
});

test("screenshots for a visual check", async ({ page }) => {
  for (const [width, height, suffix] of [
    [1366, 768, "1366"],
    [390, 844, "390"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/investigations");
    await expect(page.getByTestId("investigation-row")).toHaveCount(24);
    await page.screenshot({ path: `test-results/screens/list-${suffix}.png` });
    for (const id of ["PSI-69", "PSI-101"]) {
      await page.goto(`/investigations/${id}`);
      await expect(page.getByRole("link", { name: "Limits of this data" })).toBeVisible();
      await page.screenshot({ path: `test-results/screens/${id}-${suffix}.png` });
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await expect(page.locator('[data-testid="nav-count"][data-count="investigations"]')).toHaveAttribute("data-source", "live");
  await page.screenshot({ path: "test-results/screens/home-1366.png" });
  await page.goto("/investigations?pillar=detection&fuel=solid");
  await expect(page.getByTestId("no-results")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/no-results-1366.png" });
});

test("the whole row of the list opens its investigation, through one link", async ({ page }) => {
  await page.goto("/investigations");
  const row = page.locator('[data-testid="investigation-row"][data-psi-id="PSI-69"]');
  await expect(row).toBeVisible();
  // One link per row: the title, stretched over the row.
  await expect(row.getByRole("link")).toHaveCount(1);
  // A click away from the title, on the holdings line at the far end of the row, still opens it.
  const box = (await row.boundingBox())!;
  await row.click({ position: { x: box.width - 12, y: box.height - 10 } });
  await expect(page).toHaveURL(/\/investigations\/PSI-69$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Flame Extinguishment Experiment");
});
