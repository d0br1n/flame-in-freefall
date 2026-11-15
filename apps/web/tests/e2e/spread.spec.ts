import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// DOB-86, DOB-126: the main view of the Video to Data page (/spread): one list of every test. The
// stub backend serves a fixed index.json (fixtures/modules/video-to-data/, shape of the engine
// contract) and the real engine's evidence. Its table of tests has no BASS-II row, so the list
// here is the 19 tests the index names, unless a test routes the table itself (useTable).
const MODULES = resolve(process.cwd(), "..", "..", "data", "modules");
const evidence = JSON.parse(readFileSync(resolve(MODULES, "video-to-data", "evidence.json"), "utf8")) as {
  test_id: string;
  quantity: string;
  source: { file: string };
}[];

// Every test here reads the fixture index (fixtures/modules/video-to-data/, three tests) through a
// route, so none depends on what the engine has written so far. Tests may override the route.
const FIXTURES = resolve(process.cwd(), "fixtures", "modules", "video-to-data");
async function useFixtureIndex(page: Page) {
  const index = readFileSync(resolve(FIXTURES, "index.json"), "utf8");
  const extra = JSON.parse(readFileSync(resolve(FIXTURES, "evidence-extra.json"), "utf8"));
  await page.route("**/api/v1/modules/video-to-data/files/index.json", (route) => route.fulfill({ contentType: "application/json", body: index }));
  await page.route("**/api/v1/modules/video-to-data/evidence**", async (route) => {
    const response = await route.fetch();
    const records = (await response.json()) as unknown[];
    await route.fulfill({ response, json: [...records, ...extra] });
  });
}

// NASA's table of the series, cut to a few rows, in the shape of GET /catalog/tests.
async function useTable(page: Page, numbers: string[]) {
  const items = numbers.map((number, i) => ({
    test_id: `PSI-25/${number}`,
    psi_id: "PSI-25",
    test_number: number,
    fuel: "100 micron PMMA film   2 cm wide",
    o2_mole_fraction: 0.222,
    source_file: "PSI-25_Experimental table_BASS-II.csv",
    source_row: i + 1,
  }));
  await page.route(/\/api\/v1\/catalog\/tests\?.*psi_id=PSI-25/, (route) =>
    route.fulfill({ json: { total: items.length, limit: 200, offset: 0, items, facets: {}, excluded: { o2: 0, pressure: 0, flow: 0 } } }),
  );
}

test.beforeEach(async ({ page }) => {
  await useFixtureIndex(page);
});

// The list is NASA's table joined with the index. The real table now lists every BASS-II test, so the
// tests that count rows route an empty table: the list is then the tests the index names, and the
// expected count comes from the fixture index itself.
const FIXTURE_INDEX = JSON.parse(readFileSync(resolve(FIXTURES, "index.json"), "utf8")) as {
  tests: { test_id: string }[];
  t_series: { tests: { test_id: string }[] };
  not_measurable: { test_id: string | null }[];
};
const INDEX_ROWS = new Set([
  ...FIXTURE_INDEX.tests.map((t) => t.test_id),
  ...FIXTURE_INDEX.t_series.tests.map((t) => t.test_id),
  ...FIXTURE_INDEX.not_measurable.flatMap((n) => (n.test_id ? [n.test_id] : [])),
]).size;

test("pick a test: the clip, three charts, the numbers and the warnings", async ({ page }) => {
  await useTable(page, []);
  await page.goto("/spread");
  await expect(page.getByTestId("spread-view")).toBeVisible();
  await expect(page.getByTestId("spread-count")).toHaveText(`3 of ${INDEX_ROWS} tests processed`);

  // B1 leads the list, and no test is open until one is chosen.
  const rows = page.getByTestId("spread-row");
  await expect(rows.first()).toContainText("B1");
  await expect(page.getByTestId("test-detail")).toHaveCount(0);

  // A test opens on its own page (DOB-156).
  await rows.filter({ hasText: "B1" }).getByRole("link", { name: "Show test B1" }).click();
  await expect(page).toHaveURL(/\/spread\/B1$/);
  const detail = page.getByTestId("test-detail");
  await expect(detail).toContainText("B1");
  await expect(detail.getByTestId("spread-clip")).toBeAttached();
  await expect(detail.getByTestId("spread-chart")).toHaveCount(3);
  await expect(detail.locator('[data-chart="edges"]')).toBeVisible();
  // The panel titles wrap onto several lines (tspans) when the chart is narrow, so match without the line breaks.
  await expect(detail.locator('[data-panel="fan"]')).toContainText(/FAN: fan voltage x10 \(NASA read-out\); not an\s*air speed/);
  await expect(detail.locator('[data-panel="rad"]')).toContainText(/RAD: NASA's radiometer read-out, uncalibrated,\s*relative/);
  await expect(detail.locator('[data-panel="air"]')).toContainText(/AIR: air flow speed in the duct, cm\/s \(NASA\s*sensor, takes about a minute to\s*respond\)/);
  await expect(detail.locator("[data-fall='fan-voltage']")).toHaveCount(6);
  await expect(detail.getByTestId("fall-legend")).toContainText("fan voltage falling");
  await expect(detail.getByText("Flame light (relative units, uncalibrated)")).toBeVisible();
  await expect(detail.getByTestId("stage-legend")).toHaveCount(3);
  await expect(detail.getByTestId("stage-source")).toContainText("NIST");
  await expect(detail.getByTestId("stage-note")).toContainText("the limits between stages are our own rule");
  await expect(detail.getByTestId("chart-legend")).toContainText("not the hazard of a cabin fire");
  await expect(detail.getByTestId("steps-caption").locator("li")).toHaveCount(4);
  await expect(detail.getByTestId("flag-list")).toContainText("in pixels: no scale reference is visible in the video");
  await expect(detail.getByTestId("numbers-section")).toContainText("Ignition is the first light in the video, the igniter spark included");
  await expect(detail.getByTestId("viewing-note")).toContainText("not a hand measurement");
  await expect(detail.getByTestId("numbers-section")).toContainText("Positive means the flame left the video after the fan voltage began to fall");

  // The cursor follows the slider and a click on a chart.
  const cursor = detail.locator('[data-chart="edges"]').getByTestId("chart-cursor");
  const before = await cursor.getAttribute("x1");
  const svg = detail.locator('[data-chart="edges"] svg');
  await svg.scrollIntoViewIfNeeded();
  const box = await svg.boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.8, box!.y + 30);
  await expect.poll(async () => cursor.getAttribute("x1")).not.toBe(before);
  await expect(detail.getByTestId("cursor-time")).not.toHaveText("10.4 s");
});

test("a rate opens the evidence panel with the PSI file", async ({ page }) => {
  await page.goto("/spread");
  await page.getByRole("link", { name: "Show test B1" }).click();
  const numbers = page.getByTestId("numbers-section");
  await expect(numbers.getByTestId("rate-text")).toContainText("px/s");
  const row = numbers.getByRole("row").filter({ hasText: "Spread rate" });
  await row.getByTestId("evidence-number").click();
  const panel = page.getByTestId("evidence-panel");
  await expect(panel).toBeVisible();
  const record = evidence.find((r) => r.test_id === "PSI-25/B1" && r.quantity === "spread_rate")!;
  await expect(panel).toContainText(record.source.file);
  await expect(panel.getByRole("link", { name: "PSI-25", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  // The fan voltage fall time opens the panel through its own evidence record, with the video it was read from.
  await numbers.getByRole("row").filter({ hasText: "Time the fan voltage began to fall" }).getByTestId("evidence-number").click();
  await expect(panel).toContainText("PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4");
});

test("the status filter narrows the list and the count line stays", async ({ page }) => {
  await useTable(page, []);
  await page.goto("/spread");
  const filters = page.getByTestId("spread-filters");
  const rows = page.getByTestId("spread-row");
  await expect(rows).toHaveCount(INDEX_ROWS);
  await filters.getByRole("button", { name: "Processed (3)" }).click();
  await expect(rows).toHaveCount(3);
  await filters.getByRole("button", { name: "Outcome graded (11)" }).click();
  await expect(rows).toHaveCount(11);
  await expect(rows.first()).toContainText("T4");
  await expect(page.getByTestId("spread-count")).toHaveText(`3 of ${INDEX_ROWS} tests processed`);
  await filters.getByRole("button", { name: `All (${INDEX_ROWS})` }).click();
  await expect(rows).toHaveCount(INDEX_ROWS);
});

test("a test of NASA's table with no entry in the index reads not processed yet and cannot be opened", async ({ page }) => {
  await useTable(page, ["B1", "B2", "B3", "M1", "T4"]);
  await page.goto("/spread");
  await expect(page.getByTestId("spread-count")).toHaveText("3 of 20 tests processed");
  const m1 = page.getByTestId("spread-row").filter({ has: page.getByText("M1", { exact: true }) });
  await expect(m1.getByTestId("spread-status")).toHaveText("Video not processed yet");
  await expect(m1.getByRole("button")).toHaveCount(0);
  await expect(m1.getByRole("link", { name: "PSI-25 files" })).toHaveAttribute("href", /\/investigations\/PSI-25.*#holdings/);
  await expect(m1).toContainText("22.2");
  await page.getByTestId("spread-filters").getByRole("button", { name: "Not processed yet (1)" }).click();
  await expect(page.getByTestId("spread-row")).toHaveCount(1);
});

test("an older link that names a test in the query is forwarded to the test's own page, with the chosen cabin air", async ({ page }) => {
  await page.goto("/spread?test=B3");
  await expect(page).toHaveURL(/\/spread\/B3$/);
  await expect(page.getByTestId("test-detail")).toHaveCount(1);
  await expect(page.getByTestId("spread-test-head")).toContainText("B3");
  // A whole test id and a cabin air in the old link: the page is named by the label, the air is kept.
  await page.goto("/spread?test=PSI-25%2FB1&air=exploration");
  await expect(page).toHaveURL(/\/spread\/B1\?air=exploration$/);
  await expect(page.getByTestId("test-detail")).toContainText("B1");
});

// DOB-156: each test on its own page, with a way back. Guard: make the row a button that opens
// the detail in the list again (components/spread/SpreadView.tsx) and the address checks go red.
test("a test's page: its own address, the row's facts, the back link and the browser's Back button", async ({ page }) => {
  await page.goto("/spread");
  await expect(page.getByTestId("spread-list")).toBeVisible();
  await page.getByRole("link", { name: "Show test B1" }).click();
  await expect(page).toHaveURL(/\/spread\/B1$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Video to Data");
  const head = page.getByTestId("spread-test-head");
  await expect(head.getByRole("heading", { level: 2 })).toHaveText("Test B1");
  await expect(head.getByTestId("spread-status")).toHaveText("Processed");
  await expect(head).toContainText("PSI-25");
  await expect(page.getByTestId("test-detail")).toHaveCount(1);
  // The list is not on this page.
  await expect(page.getByTestId("spread-list")).toHaveCount(0);

  // The back link returns to the list, on the row of the test just seen.
  await page.getByTestId("spread-back").click();
  await expect(page).toHaveURL(/\/spread$/);
  await expect(page.getByTestId("spread-list")).toBeVisible();
  await expect(page.getByTestId("test-detail")).toHaveCount(0);
  await expect(page.locator('[data-testid="spread-row"][data-returned="true"]')).toContainText("B1");

  // The browser's Back button does the same from a graded test.
  await page.getByRole("link", { name: "Show the outcome of test T12" }).click();
  await expect(page).toHaveURL(/\/spread\/T12$/);
  await expect(page.locator('[data-test="T12"]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/spread$/);
  await expect(page.locator('[data-testid="spread-row"][data-returned="true"]')).toContainText("T12");
  await page.goForward();
  await expect(page).toHaveURL(/\/spread\/T12$/);
  await expect(page.locator('[data-test="T12"]')).toBeVisible();
});

test("a test's page for a name that is not in the list, or a test with nothing to show, says so and links back", async ({ page }) => {
  await page.goto("/spread/Z99");
  const none = page.getByTestId("spread-test-none");
  await expect(none).toContainText("No test is named Z99");
  await expect(page.getByTestId("test-detail")).toHaveCount(0);
  await none.getByRole("link", { name: "Back to the list of tests" }).click();
  await expect(page).toHaveURL(/\/spread$/);
  await expect(page.getByTestId("spread-list")).toBeVisible();

  // A test of NASA's table that the engine has not processed has no page content of its own.
  await useTable(page, ["B1", "M1"]);
  await page.goto("/spread/M1");
  await expect(page.getByTestId("spread-test-none")).toContainText("Test M1: video not processed yet");
});

test("a test with no clip and an unknown flag still renders, with a slider", async ({ page }) => {
  await page.goto("/spread");
  await page.getByRole("link", { name: "Show test B2" }).click();
  const detail = page.getByTestId("test-detail");
  await expect(detail.getByTestId("clip-absent")).toBeVisible();
  await expect(detail.getByTestId("flag-list")).toContainText("unknown_new_flag");
  await expect(detail.getByTestId("still-burning")).toHaveText("still burning when the video ended");
});

test("every test that could not be measured is listed with its reason", async ({ page }) => {
  await page.goto("/spread");
  await page.getByTestId("spread-filters").getByRole("button", { name: "Could not be measured (5)" }).click();
  const rows = page.getByTestId("spread-row");
  await expect(rows).toHaveCount(5);
  const b14 = rows.filter({ hasText: "B14" });
  await expect(b14.getByTestId("spread-status")).toHaveText("Could not be measured");
  await expect(b14).toContainText("main video does not open");
  // The video whose test is not resolved has no row: it is named under the list.
  await expect(page.getByTestId("loose-video")).toHaveCount(1);
  await expect(page.getByTestId("loose-video")).toContainText("test identity not resolved");
});

test("with no index.json the page falls back to a table of the evidence records", async ({ page }) => {
  await page.route("**/api/v1/modules/video-to-data/files/index.json", (route) => route.fulfill({ status: 404, json: { detail: "no" } }));
  await page.goto("/spread");
  await expect(page.getByTestId("spread-fallback")).toBeVisible();
  await expect(page.getByTestId("evidence-row").first().getByTestId("evidence-number").first()).toBeVisible();
  await expect(page.getByTestId("spread-view")).toHaveCount(0);
});

test("with the engine folder absent the page says it is not built yet", async ({ page }) => {
  await page.route("**/api/v1/modules", (route) => route.fulfill({ json: [{ id: "video-to-data", status: "not_built", problems: 3 }] }));
  await page.goto("/spread");
  await expect(page.getByTestId("not-built")).toContainText("This analysis is not built yet");
  await expect(page.getByTestId("spread-view")).toHaveCount(0);
});

test("a T-series row opens to the SI grade beside NASA's outcome, with a count line under the list", async ({ page }) => {
  await page.goto("/spread");
  const note = page.getByTestId("t-series");
  await expect(note.getByTestId("t-series-count")).toHaveText(
    "10 of 11 graded tests match NASA's published outcome; 1 could not be decided; 0 contradict it",
  );
  // Two fixture rows carry a check by a person: the line comes from the rows.
  await expect(note.getByTestId("t-series-check-count")).toHaveText("2 checked by a person; 2 of 2 match NASA's published outcome");
  const filters = page.getByTestId("spread-filters");
  await filters.getByRole("button", { name: "Outcome graded (11)" }).click();
  await expect(page.getByTestId("spread-row")).toHaveCount(11);
  // No outcome is open until a row is chosen.
  await expect(page.getByTestId("t-series-row")).toHaveCount(0);
  await page.getByRole("link", { name: "Show the outcome of test T12" }).click();
  // Match is an icon and a word, never colour alone.
  const t12 = page.locator('[data-test="T12"]');
  await expect(t12.getByTestId("t-series-match")).toHaveText("undecided");
  await expect(t12.getByTestId("t-series-match").locator("svg")).toBeVisible();
  await expect(t12).toContainText("could not tell");
  await page.goBack();
  await page.getByRole("link", { name: "Show the outcome of test T15" }).click();
  await expect(page.locator('[data-test="T15"]')).toContainText("no blow-off");
  await page.goBack();
  // T20 has no grade and no clip: it is listed as could not be measured, says why, and still shows NASA's outcome.
  await filters.getByRole("button", { name: "Could not be measured (5)" }).click();
  await page.getByRole("link", { name: "Show the outcome of test T20" }).click();
  const t20 = page.locator('[data-test="T20"]');
  await expect(t20).toContainText("not graded");
  await expect(t20).toContainText("no plain main video on PSI");
  await expect(t20.getByTestId("t-series-grade")).toHaveCount(0);
  await expect(t20.getByTestId("t-series-published")).toBeVisible();
  await expect(t20.getByTestId("t-series-published")).toHaveText(/quenched/);
});

test("a T-series grade opens its evidence record, marked as read by SI; NASA's outcome opens the published one", async ({ page }) => {
  await page.goto("/spread");
  await page.getByRole("link", { name: "Show the outcome of test T4" }).click();
  const row = page.locator('[data-test="T4"]');
  await expect(row.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "SI_EXTRACTED");
  await row.getByTestId("t-series-grade").click();
  const panel = page.getByTestId("evidence-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "SI_EXTRACTED");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await row.getByTestId("t-series-published").click();
  await expect(panel.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "PUBLISHED");
  await expect(panel).toContainText("Summary Report Table 7.1");
});

test("the last faint light row and marker appear for B3 only", async ({ page }) => {
  await page.goto("/spread");
  await page.getByRole("link", { name: "Show test B3" }).click();
  const detail = page.getByTestId("test-detail");
  const row = detail.getByTestId("numbers-section").getByRole("row").filter({ hasText: "Last faint light" });
  await expect(row).toContainText("49.6 s");
  await expect(row).toContainText("it is not the time the flame went out");
  await expect(detail.getByTestId("chart-legend")).toContainText("last faint light");
  await expect(detail.locator('[data-marker="faint"]').first()).toBeAttached();
  await row.getByTestId("evidence-number").click();
  await expect(page.getByTestId("evidence-panel")).toContainText("PSI-25_Raw Data_BASS_TEST_B3.mp4");
  await page.keyboard.press("Escape");

  await page.goBack();
  await page.getByRole("link", { name: "Show test B1" }).click();
  await expect(detail.getByTestId("numbers-section")).not.toContainText("Last faint light");
  await expect(detail.getByTestId("chart-legend")).not.toContainText("last faint light");
  await expect(detail.locator('[data-marker="faint"]')).toHaveCount(0);
});

test("with no t_series block the page shows no T-series note", async ({ page }) => {
  await page.route("**/api/v1/modules/video-to-data/files/index.json", (route) => {
    const index = JSON.parse(readFileSync(resolve(FIXTURES, "index.json"), "utf8"));
    delete index.t_series;
    return route.fulfill({ json: index });
  });
  await page.goto("/spread");
  await expect(page.getByTestId("spread-view")).toBeVisible();
  await expect(page.getByTestId("t-series")).toHaveCount(0);
});

// T-series detail (DOB-86): the review clip, the fan voltage chart with its cursor, the marks and the
// outcome three ways. The engine's clip and read-out are served from the fixtures through routes.
async function useTFiles(page: Page) {
  // A video seek needs byte ranges, as the real backend answers them.
  await page.route(/\/files\/PSI-25_T\d+_review\.mp4$/, (route) => {
    const body = readFileSync(resolve(FIXTURES, "PSI-25_T4_review.mp4"));
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()["range"] ?? "");
    if (!range) return route.fulfill({ contentType: "video/mp4", headers: { "accept-ranges": "bytes" }, body });
    const from = Number(range[1]);
    const to = range[2] ? Number(range[2]) : body.length - 1;
    return route.fulfill({
      status: 206,
      contentType: "video/mp4",
      headers: { "accept-ranges": "bytes", "content-range": `bytes ${from}-${to}/${body.length}` },
      body: body.subarray(from, to + 1),
    });
  });
  await page.route(/\/files\/PSI-25_T4_readout\.csv$/, (route) =>
    route.fulfill({ contentType: "text/csv", body: readFileSync(resolve(FIXTURES, "PSI-25_T4_readout.csv"), "utf8") }),
  );
}

test("a T row with a clip opens to the brightened video, the chart with marks and the outcome three ways", async ({ page }) => {
  await useTFiles(page);
  await page.goto("/spread");
  await page.getByTestId("spread-filters").getByRole("button", { name: "Outcome graded (11)" }).click();
  // The person's check sits in the status cell of the row; a row nobody checked shows none.
  const rowOf = (label: string) => page.getByTestId("spread-row").filter({ has: page.getByRole("link", { name: `Show the outcome of test ${label}` }) });
  await expect(rowOf("T4").getByTestId("spread-checked")).toHaveText("Checked by a person: quenched");
  await expect(rowOf("T12").getByTestId("spread-checked")).toHaveCount(0);
  await page.getByRole("link", { name: "Show the outcome of test T4" }).click();
  const detail = page.locator('[data-test="T4"]');
  await expect(detail.getByTestId("t-clip")).toBeAttached();
  await expect(detail.getByTestId("t-clip-caption")).toHaveText(
    "NASA's video, brightened x6 so the dim flame can be seen. The on-screen numbers are as recorded.",
  );
  const cursorX = () => detail.getByTestId("chart-cursor").first().getAttribute("x1");
  await expect(detail.locator('[data-chart="t-readout"]')).toBeVisible();
  await expect(detail.locator('[data-panel="fan"]')).toBeAttached();
  await expect(detail.locator('[data-panel="air"]')).toBeAttached();
  for (const kind of ["si_seen", "si_gone", "person_seen", "person_gone"]) await expect(detail.locator(`[data-marker="${kind}"]`)).toBeAttached();
  await expect(detail.getByTestId("t-chart-legend")).toContainText("flame seen, SI");
  await expect(detail.getByTestId("t-chart-legend")).toContainText("flame gone, person");
  await expect(detail.getByTestId("t-outcome-si")).toContainText("quenched");
  await expect(detail.getByTestId("t-outcome-person")).toContainText("agrees with SI");
  await expect(detail.getByTestId("t-outcome-nasa")).toContainText("SI grade matches:");
  await expect(detail.getByTestId("t-outcome-nasa")).toContainText("Person's check matches:");
  await expect(detail.getByTestId("t-check-note")).toContainText("Fixture text: checked by one team member");
  await expect(detail.getByTestId("t-limits")).toHaveText("Dim flames: times are approximate, about 1 to 2 s. The check was made by one team member, without looking at NASA's outcomes.");
  // The cursor follows the slider, which moves the clip.
  const before = Number(await cursorX());
  await detail.getByTestId("time-slider").fill("20");
  await expect(detail.getByTestId("cursor-time")).toHaveText("20.0 s");
  await expect.poll(async () => Number(await cursorX())).toBeGreaterThan(before + 20);
  // Seeking the video moves the cursor too (video time 5 s is test time 20 s at speed 4).
  await detail.getByTestId("t-clip").evaluate((v: HTMLVideoElement) => {
    v.currentTime = 10;
  });
  await expect(detail.getByTestId("cursor-time")).toHaveText("40.0 s");
  await expect.poll(async () => Number(await cursorX())).toBeGreaterThan(before + 60);
});

test("a T row whose read-out could not be read says so instead of a chart", async ({ page }) => {
  await useTFiles(page);
  await page.goto("/spread?test=T9");
  const detail = page.locator('[data-test="T9"]');
  await expect(detail.getByTestId("t-clip")).toBeAttached();
  await expect(detail.getByTestId("t-readout-absent")).toHaveText("The on-screen numbers of this video could not be read automatically.");
  await expect(detail.locator('[data-chart="t-readout"]')).toHaveCount(0);
});

test("a read-out file that fails to load says so, not that it could not be read", async ({ page }) => {
  await useTFiles(page);
  await page.route(/\/files\/PSI-25_T4_readout\.csv$/, (route) => route.fulfill({ status: 500, body: "no" }));
  await page.goto("/spread?test=T4");
  const detail = page.locator('[data-test="T4"]');
  await expect(detail.getByTestId("t-readout-absent")).toHaveText("The read-out table did not load.");
});

test("the T detail stacks at phone width with no sideways page scroll", async ({ page }) => {
  await useTFiles(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/spread?test=T4");
  await expect(page.locator('[data-test="T4"]').getByTestId("t-clip")).toBeAttached();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(wide).toBe(false);
});

// The video stays in view while the charts scroll past (the page scrolls inside <main>).
async function videoInView(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const video = document.querySelector(sel)!.getBoundingClientRect();
    const main = document.querySelector("main")!.getBoundingClientRect();
    return { top: video.top - main.top, bottom: main.bottom - video.bottom, height: video.height, vh: window.innerHeight };
  }, selector);
}

// Scrolls the page to its end and reports whether the pinned block covers the last chart or the notes under it.
async function endOverlap(page: Page, chartSel: string, notesSel: string) {
  return page.evaluate(
    ([chartSel, notesSel]) => {
      const main = document.querySelector("main")!;
      main.scrollTop = main.scrollHeight;
      return new Promise<{ chart: boolean; notes: boolean; pinned: boolean }>((done) =>
        setTimeout(() => {
          const pinnedEl = document.querySelector<HTMLElement>('[data-testid="pinned-video"]')!;
          const p = pinnedEl.getBoundingClientRect();
          const hit = (sel: string, last: boolean) => {
            const all = document.querySelectorAll(sel);
            const r = (last ? all[all.length - 1] : all[0]).getBoundingClientRect();
            return r.bottom > p.top + 1 && r.top < p.bottom - 1 && r.right > p.left + 1 && r.left < p.right - 1;
          };
          done({ chart: hit(chartSel, true), notes: hit(notesSel, false), pinned: pinnedEl.dataset.pinned === "true" });
        }, 300),
      );
    },
    [chartSel, notesSel],
  );
}

for (const width of [1440, 390]) {
  test(`B1: the video stays in view at the last chart, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/spread?test=B1");
    const detail = page.getByTestId("test-detail");
    await expect(detail.getByTestId("spread-clip")).toBeAttached();
    const charts = detail.locator('[data-testid="spread-chart"]');
    await charts.last().scrollIntoViewIfNeeded();
    await expect.poll(async () => (await videoInView(page, '[data-testid="test-detail"] [data-testid="spread-clip"]')).top).toBeGreaterThanOrEqual(-1);
    const box = await videoInView(page, '[data-testid="test-detail"] [data-testid="spread-clip"]');
    expect(box.bottom).toBeGreaterThanOrEqual(-1);
    expect(box.height).toBeLessThanOrEqual(width < 1024 ? box.vh * 0.4 : box.vh);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    if (width < 1024) {
      // At the very end of the scroll the pinned video must not cover the last chart or its legend.
      await expect.poll(() => endOverlap(page, '[data-testid="test-detail"] [data-testid="spread-chart"]', '[data-testid="test-detail"] [data-testid="chart-legend"]')).toEqual({ chart: false, notes: false, pinned: true });
    }
  });

  test(`T4: the video is in view at the last chart, at ${width} px${width < 1024 ? " (the pin engages)" : ""}`, async ({ page }) => {
    await useTFiles(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/spread?test=T4");
    const detail = page.locator('[data-test="T4"]');
    await expect(detail.getByTestId("t-clip")).toBeAttached();
    await detail.locator('[data-testid="spread-chart"]').last().scrollIntoViewIfNeeded();
    await expect.poll(async () => (await videoInView(page, '[data-test="T4"] [data-testid="t-clip"]')).top).toBeGreaterThanOrEqual(-1);
    const box = await videoInView(page, '[data-test="T4"] [data-testid="t-clip"]');
    expect(box.bottom).toBeGreaterThanOrEqual(-1);
    expect(box.height).toBeLessThanOrEqual(width < 1024 ? box.vh * 0.4 : box.vh);
    if (width < 1024) {
      await expect.poll(() => endOverlap(page, '[data-test="T4"] [data-testid="spread-chart"]', '[data-test="T4"] [data-testid="t-chart-legend"]')).toEqual({ chart: false, notes: false, pinned: true });
    }
  });
}

// "Where the numbers come from": the layer over the clip and the labels with the read-out value at the cursor's time.
test("T4: the callout layer marks NASA's read-out, shows the value at the cursor's time and can be hidden", async ({ page }) => {
  await useTFiles(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/spread?test=T4");
  const detail = page.locator('[data-test="T4"]');
  await expect(detail.getByTestId("t-clip")).toBeAttached();
  const layer = detail.getByTestId("callout-layer");
  await expect(layer).toBeAttached();
  expect(await layer.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await expect(layer.locator("[data-callout]")).toHaveCount(6);
  const label = (field: string) => detail.getByTestId("callout-list").filter({ visible: true }).locator(`[data-field="${field}"]`);
  await expect(label("fan")).toContainText("FAN: fan voltage x10");
  await expect(label("air")).toContainText("AIR: flow speed, cm/s (slow sensor)");
  await expect(label("rad")).toContainText("RAD: radiometer, uncalibrated");
  await expect(label("clock")).toContainText("Clock: NASA's time stamp");
  await expect(label("fuel")).toContainText("FUEL label: by elimination NASA's N2 flow, not used");
  await expect(label("brightened")).toContainText("brightened x6");
  // The fixture read-out falls from 80 by 1.2 per second after 6 s: at 20 s the fan reads 56.
  await detail.getByTestId("time-slider").fill("20");
  await expect(label("fan").getByTestId("callout-value")).toHaveText("56");
  await detail.getByTestId("time-slider").fill("2");
  await expect(label("fan").getByTestId("callout-value")).toHaveText("80");
  await detail.getByTestId("callout-toggle").click();
  await expect(detail.getByTestId("callout-layer")).toHaveCount(0);
  await expect(detail.getByTestId("callout-list")).toHaveCount(0);
  await detail.getByTestId("callout-toggle").click();
  await expect(detail.getByTestId("callout-layer")).toBeAttached();
});

test("a test without a read-out says its numbers could not be read", async ({ page }) => {
  await useTFiles(page);
  await page.goto("/spread?test=T9");
  const detail = page.locator('[data-test="T9"]');
  await expect(detail.getByTestId("callout-list").filter({ visible: true }).locator('[data-field="fan"]')).toContainText("could not be read");
});

for (const width of [1440, 390]) {
  test(`B1: the callout layer and the outline legend, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/spread?test=B1");
    const detail = page.getByTestId("test-detail");
    await expect(detail.getByTestId("spread-clip")).toBeAttached();
    await expect(detail.getByTestId("callout-layer")).toBeAttached();
    const list = detail.getByTestId("callout-list").filter({ visible: true });
    await expect(list.locator('[data-field="outline"]')).toContainText("Outline (green): pixels brighter than the threshold, area");
    await expect(list.locator('[data-field="edges"]')).toContainText("the slope of the leading edge is the spread rate, px/s");
    await expect(list.locator('[data-field="light"]')).toContainText("(relative, says nothing about how hot the flame is)");
    await detail.getByTestId("time-slider").fill("20.01");
    await expect(list.locator('[data-field="outline"]').getByTestId("callout-value")).toHaveText(/^\d+ px$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  });
}

test("the pinned block stays shorter than the page on a 768 px high laptop and the label list stays reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 768 });
  await page.goto("/spread?test=B1");
  const detail = page.getByTestId("test-detail");
  await expect(detail.getByTestId("callout-layer")).toBeAttached();
  const heights = await page.evaluate(() => ({
    pinned: document.querySelector('[data-testid="pinned-video"]')!.getBoundingClientRect().height,
    main: document.querySelector("main")!.getBoundingClientRect().height,
  }));
  expect(heights.pinned).toBeLessThan(heights.main);
  const last = detail.getByTestId("callout-list").locator("li").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  // The list is not inside the pinned block.
  await expect(detail.getByTestId("pinned-video").getByTestId("callout-list")).toHaveCount(0);
});

test("a read-out file that fails to load shows could not be read in the labels", async ({ page }) => {
  await useTFiles(page);
  await page.route(/\/files\/PSI-25_T4_readout\.csv$/, (route) => route.fulfill({ status: 500, body: "no" }));
  await page.goto("/spread?test=T4");
  await expect(page.locator('[data-test="T4"]').getByTestId("callout-list").locator('[data-field="fan"]')).toContainText("could not be read");
});

// "Show how the engine sees it": the three-panel detection clip, with the clip's timing.
async function useStepsClip(page: Page) {
  await page.route(/\/files\/PSI-25_B1_stepsclip\.mp4$/, (route) => {
    const body = readFileSync(resolve(FIXTURES, "PSI-25_B1_stepsclip.mp4"));
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()["range"] ?? "");
    if (!range) return route.fulfill({ contentType: "video/mp4", headers: { "accept-ranges": "bytes" }, body });
    const from = Number(range[1]);
    const to = range[2] ? Number(range[2]) : body.length - 1;
    return route.fulfill({ status: 206, contentType: "video/mp4", headers: { "accept-ranges": "bytes", "content-range": `bytes ${from}-${to}/${body.length}` }, body: body.subarray(from, to + 1) });
  });
}

test("the engine's three-panel clip: the button only where the file exists, the same test time, the caption, the boxes hide", async ({ page }) => {
  await useStepsClip(page);
  await page.setViewportSize({ width: 1440, height: 768 });
  // Without files.steps_clip in the index there is no button.
  const withoutSteps = JSON.parse(readFileSync(resolve(FIXTURES, "index.json"), "utf8"));
  for (const t of withoutSteps.tests) delete t.files.steps_clip;
  await page.route("**/api/v1/modules/video-to-data/files/index.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(withoutSteps) }));
  await page.goto("/spread?test=B1");
  await expect(page.getByTestId("test-detail").getByTestId("callout-toggle")).toBeVisible();
  await expect(page.getByTestId("steps-toggle")).toHaveCount(0);
  await page.unroute("**/api/v1/modules/video-to-data/files/index.json");
  await useFixtureIndex(page);

  await page.goto("/spread?test=B1");
  const detail = page.getByTestId("test-detail");
  const clip = detail.getByTestId("spread-clip");
  await expect(clip).toHaveAttribute("data-source", "clip");
  await detail.getByTestId("time-slider").fill("20.01");
  await expect(detail.getByTestId("cursor-time")).toHaveText("20.0 s");
  await detail.getByTestId("steps-toggle").click();
  await expect(clip).toHaveAttribute("data-source", "steps");
  await expect(detail.getByTestId("steps-caption-line")).toHaveText(
    "Left: NASA's frame with the outline the engine drew. Middle: the brightness the engine measures in each pixel. Right: the pixels bright enough to count as flame. Brightness is the engine's input signal; it says nothing about how hot the flame is.",
  );
  await expect(detail.getByTestId("callout-layer")).toHaveCount(0);
  await expect(detail.getByTestId("callout-list")).toBeVisible();
  await expect.poll(async () => Number((await detail.getByTestId("cursor-time").innerText()).replace(" s", ""))).toBeGreaterThan(19.7);
  const timeAfter = Number((await detail.getByTestId("cursor-time").innerText()).replace(" s", ""));
  expect(Math.abs(timeAfter - 20)).toBeLessThan(0.3);
  // Full width: each of the three panels is at least 270 px; the pinned block is shorter than the visible page.
  const sizes = await page.evaluate(() => ({
    video: document.querySelector('[data-testid="spread-clip"]')!.getBoundingClientRect().width,
    pinned: document.querySelector('[data-testid="pinned-video"]')!.getBoundingClientRect().height,
    main: document.querySelector("main")!.getBoundingClientRect().height,
  }));
  expect(sizes.video / 3).toBeGreaterThanOrEqual(270);
  expect(sizes.pinned).toBeLessThan(sizes.main);
  // Back: the same time, the boxes return.
  await detail.getByTestId("steps-toggle").click();
  await expect(clip).toHaveAttribute("data-source", "clip");
  await expect(detail.getByTestId("callout-layer")).toBeAttached();
  await expect.poll(async () => Number((await detail.getByTestId("cursor-time").innerText()).replace(" s", ""))).toBeGreaterThan(19.7);
  await expect(detail.getByTestId("steps-caption-line")).toHaveCount(0);
});

test("the three-panel clip at phone width: no sideways page scroll", async ({ page }) => {
  await useStepsClip(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/spread?test=B1");
  await page.getByTestId("test-detail").getByTestId("steps-toggle").click();
  await expect(page.getByTestId("spread-clip")).toHaveAttribute("data-source", "steps");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test("a three-panel clip that fails to load returns to the normal clip with a message, and the button works again", async ({ page }) => {
  await page.route(/\/files\/PSI-25_B1_stepsclip\.mp4$/, (route) => route.fulfill({ status: 404, body: "no" }));
  await page.setViewportSize({ width: 1440, height: 768 });
  await page.goto("/spread?test=B1");
  const detail = page.getByTestId("test-detail");
  await detail.getByTestId("time-slider").fill("20.01");
  await detail.getByTestId("steps-toggle").click();
  await expect(detail.getByTestId("steps-failed")).toContainText("could not be loaded");
  await expect(detail.getByTestId("spread-clip")).toHaveAttribute("data-source", "clip");
  await expect(detail.getByTestId("steps-toggle")).toHaveCount(1);
  await expect(detail.getByTestId("callout-toggle")).toBeVisible();
  await expect.poll(async () => Number((await detail.getByTestId("cursor-time").innerText()).replace(" s", ""))).toBeGreaterThan(19.7);
  await detail.getByTestId("steps-toggle").click();
  await expect(detail.getByTestId("steps-failed")).toBeVisible();
});

test("in three-panel mode at 1440 x 768 the pinned block does not cover the last chart at the end of the scroll", async ({ page }) => {
  await useStepsClip(page);
  await page.setViewportSize({ width: 1440, height: 768 });
  await page.goto("/spread?test=B1");
  const detail = page.getByTestId("test-detail");
  await detail.getByTestId("steps-toggle").click();
  await expect(detail.getByTestId("spread-clip")).toHaveAttribute("data-source", "steps");
  await expect.poll(() => endOverlap(page, '[data-testid="test-detail"] [data-testid="spread-chart"]', '[data-testid="test-detail"] [data-testid="chart-legend"]')).toEqual({ chart: false, notes: false, pinned: true });
});

test("two quick switches keep the test time, and a playing clip keeps playing after a switch", async ({ page }) => {
  await useStepsClip(page);
  await page.setViewportSize({ width: 1440, height: 768 });
  await page.goto("/spread?test=B1");
  const detail = page.getByTestId("test-detail");
  const time = async () => Number((await detail.getByTestId("cursor-time").innerText()).replace(" s", ""));
  await detail.getByTestId("time-slider").fill("20.01");
  await expect(detail.getByTestId("cursor-time")).toHaveText("20.0 s");
  // Two switches in quick succession, before the new source has loaded.
  await detail.getByTestId("steps-toggle").dispatchEvent("click");
  await detail.getByTestId("steps-toggle").dispatchEvent("click");
  await expect(detail.getByTestId("spread-clip")).toHaveAttribute("data-source", "clip");
  await expect.poll(time).toBeGreaterThan(19.7);
  expect(Math.abs((await time()) - 20)).toBeLessThan(0.5);
  // Playing: still playing on the other source.
  await detail.getByTestId("spread-clip").evaluate((v: HTMLVideoElement) => v.play());
  await detail.getByTestId("steps-toggle").click();
  await expect(detail.getByTestId("spread-clip")).toHaveAttribute("data-source", "steps");
  await expect.poll(() => detail.getByTestId("spread-clip").evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
  expect(await time()).toBeGreaterThan(19.7);
});

// DOB-159: the tracker's check against SI markings is shown under the list, read from the engine's
// own validation.json, with its verdict against the file's own rule. Guard: drop TrackerCheckNote
// from components/spread/SpreadView.tsx and this goes red.
test("the tracker check against SI markings is shown with the file's numbers and its verdict", async ({ page, request }) => {
  const response = await request.get("/api/v1/modules/video-to-data/files/validation.json");
  expect(response.ok()).toBe(true);
  const file = (await response.json()) as {
    pass_rule: string;
    comparisons: { id: string; n: number; mean_abs_error: number; mean_abs_percent_error: number; pairs: { test_id: string }[] }[];
  };
  const source = file.comparisons.find((item) => item.id === "val-si-px")!;
  const percent = source.mean_abs_percent_error * 100;

  await page.goto("/spread");
  const check = page.getByTestId("tracker-check");
  await expect(check).toBeVisible();
  await expect(check.getByTestId("tracker-check-line")).toHaveText(
    `${source.n} tests: mean difference ${source.mean_abs_error.toFixed(2)} px/s (${percent.toFixed(2)}%)`,
  );
  await expect(check.getByTestId("tracker-check-verdict")).toHaveText(percent <= 25 ? "Within our 25% limit" : "Above our 25% limit: not passed");
  await expect(check).toHaveAttribute("data-passes", String(percent <= 25));
  await expect(check).toContainText(file.pass_rule);
  await expect(check.getByTestId("tracker-check-row")).toHaveCount(source.pairs.length);
  await expect(check.locator('[data-testid="tracker-check-row"][data-worst="true"]')).toHaveCount(1);
  await expect(check.getByTestId("provenance-badge")).toHaveAttribute("data-provenance", "SI_EXTRACTED");
  await expect(check.getByTestId("tracker-check-flags")).toContainText("not an independent human measurement");
  await expect(check.getByRole("link", { name: "validation.json" })).toHaveAttribute("href", "/api/v1/modules/video-to-data/files/validation.json");
});
