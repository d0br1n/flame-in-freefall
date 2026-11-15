import { expect, test, type Page } from "@playwright/test";
import { stagePage } from "../../lib/nav";
import { coverageSentence } from "../../lib/pillar";
import type { AirCoverage, AirPresets, RankResponse, Stage, TestsResponse } from "../../lib/types";
import { airControl, api, chooseAir, matchText } from "./helpers";

// DOB-78: the first screen and the ranking. On the Overview, for the chosen cabin air: the two
// analyses (one number and its count, the coverage of each), then the top of the ranking;
// since DOB-119 there is no Detection card and no limits box (the limits are on /limitations); the full ranking of the 24 investigations, with the reason for each,
// is on the Investigations page (?sort=rank). Expected text is read from the real backend.
// Guard: hard-code the preset in the rank request (rankPath("station")) and the first test goes
// red at the switch: the evidence reasons stay those of the first air.

const STAGES: Stage[] = ["spread", "suppress"];
const INVESTIGATIONS = 24;

async function expectStages(page: Page, coverage: AirCoverage) {
  for (const stage of STAGES) {
    const card = page.locator(`[data-testid="stage-card"][data-stage="${stage}"]`);
    await expect(card.getByTestId("stage-coverage")).toContainText(coverageSentence(coverage.stages[stage] ?? null)!);
    await expect(card.getByTestId("stage-status")).toHaveAttribute("data-status", coverage.stages[stage]!.status);
  }
}

async function expectRanking(page: Page, rank: RankResponse) {
  const rows = page.getByTestId("rank-row");
  await expect(rows).toHaveCount(rank.items.length);
  await expect(page.getByTestId("rank-list")).toHaveAttribute("data-air", rank.air);
  await expect(rows.first()).toHaveAttribute("data-psi-id", rank.items[0].psi_id);
  for (const item of rank.items) {
    const row = page.locator(`[data-testid="rank-row"][data-psi-id="${item.psi_id}"]`);
    await expect(row.getByTestId("reason-evidence")).toContainText(item.parts.evidence.reason);
  }
}

async function airs(request: Parameters<typeof api>[0]) {
  const presets = await api<AirPresets>(request, "/air/presets");
  const first = presets.default;
  const second =
    presets.presets.find((preset) => preset.id !== first && preset.id === "exploration")?.id ??
    presets.presets.find((preset) => preset.id !== first)!.id;
  return { first, second };
}

test("the Overview answers each stage for the air and follows a change of air", async ({ page, request }) => {
  const { first, second } = await airs(request);
  const [coverageA, rankA, coverageB, rankB] = await Promise.all([
    api<AirCoverage>(request, `/air/coverage?air=${first}`),
    api<RankResponse>(request, `/catalog/rank?air=${first}`),
    api<AirCoverage>(request, `/air/coverage?air=${second}`),
    api<RankResponse>(request, `/catalog/rank?air=${second}`),
  ]);
  // The switch must change something the page shows, or the test below proves nothing.
  expect(STAGES.some((s) => coverageSentence(coverageA.stages[s] ?? null) !== coverageSentence(coverageB.stages[s] ?? null))).toBe(true);

  // A result on first load: no ?air= in the URL, the default air at once.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
  await expect(page.getByTestId("stage-card")).toHaveCount(2);
  await expectStages(page, coverageA);
  await expect(page.getByTestId("top-rank")).toHaveAttribute("data-air", rankA.air);
  await expect(page.getByTestId("top-rank-row")).toHaveCount(Math.min(5, rankA.items.length));
  await expect(page.getByTestId("top-rank-row").first()).toHaveAttribute("data-psi-id", rankA.items[0].psi_id);

  // An analysed stage shows one number that opens the evidence panel, and its count.
  const headline = page.locator('[data-testid="stage-card"][data-stage="spread"]').getByTestId("stage-headline");
  await expect(headline.getByTestId("stage-n")).toContainText("n = ");
  await headline.getByTestId("evidence-number").click();
  await expect(page.getByTestId("evidence-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  // Detection has no analysis, so it has no card.
  await expect(page.locator('[data-testid="stage-card"][data-stage="detect"]')).toHaveCount(0);

  // Switch the air with a preset chip: new coverage and a new ranking, without a reload.
  const asked = page.waitForRequest((req) => req.url().includes(`/api/v1/catalog/rank?air=${second}`));
  await page.locator(`[data-testid="preset-chip"][data-air="${second}"]`).click();
  await asked;
  await expect(page).toHaveURL(new RegExp(`[?&]air=${second}`));
  await expectStages(page, coverageB);
  await expect(page.getByTestId("top-rank")).toHaveAttribute("data-air", rankB.air);
  await expect(airControl(page)).toHaveAttribute("data-value", second);

  // A stage card leads to its page, with the air carried.
  const spreadHref = stagePage("spread")!;
  await page.locator('[data-testid="stage-card"][data-stage="spread"]').getByRole("heading", { level: 2 }).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`${spreadHref}\\?air=${second}$`));
});

test("the full ranking lists the 24 investigations for the air, explains itself and follows a change of air", async ({ page, request }) => {
  const { first, second } = await airs(request);
  const [rankA, rankB] = await Promise.all([
    api<RankResponse>(request, `/catalog/rank?air=${first}`),
    api<RankResponse>(request, `/catalog/rank?air=${second}`),
  ]);
  expect(rankA.items).toHaveLength(INVESTIGATIONS);
  expect(rankB.items.some((item, i) => item.parts.evidence.reason !== rankA.items[i]?.parts.evidence.reason)).toBe(true);

  // From the Overview's "Full ranking".
  await page.goto("/");
  await page.getByTestId("full-ranking").click();
  await expect(page).toHaveURL(/\/investigations\?sort=rank/);
  await expectRanking(page, rankA);

  const method = page.getByTestId("rank-method");
  await method.getByText("How this ranking works").click();
  await expect(method.getByTestId("rank-formula")).toHaveText(rankA.formula);
  await expect(method).toContainText("not a NASA ranking");
  await expect(method.getByTestId("rank-default-weights")).toHaveCount(rankA.weights_are_default ? 1 : 0);

  // Switch the air in the top bar: a new ranking request with the new air.
  const asked = page.waitForRequest((req) => req.url().includes(`/api/v1/catalog/rank?air=${second}`));
  await chooseAir(page, second);
  await asked;
  await expect(page).toHaveURL(new RegExp(`[?&]air=${second}`));
  await expect(page).toHaveURL(/[?&]sort=rank/);
  await expectRanking(page, rankB);

  // A row leads to its tests in this air.
  const withTests = await api<TestsResponse>(request, "/catalog/tests?psi_id=PSI-69&limit=1");
  const row = page.locator('[data-testid="rank-row"][data-psi-id="PSI-69"]');
  await row.getByTestId("rank-tests-link").click();
  await expect(page).toHaveURL(/\/tests\?/);
  await expect(page).toHaveURL(/[?&]psi_id=PSI-69/);
  await expect(page).toHaveURL(new RegExp(`[?&]air=${second}`));
  await expect(airControl(page)).toHaveAttribute("data-value", second);
  await expect(page.locator('input[data-facet="psi_id"][data-value="PSI-69"]')).toBeChecked();
  await expect(page.getByTestId("result-count")).toHaveText(matchText(withTests.total));
});

test("each part of a score shows its number in words, with its reason for screen readers", async ({ page, request }) => {
  const presets = await api<AirPresets>(request, "/air/presets");
  const rank = await api<RankResponse>(request, `/catalog/rank?air=${presets.default}`);
  await page.goto("/investigations?sort=rank");
  const top = rank.items[0];
  const row = page.locator(`[data-testid="rank-row"][data-psi-id="${top.psi_id}"]`);
  await expect(row.getByTestId("rank-score")).toHaveText(top.score.toFixed(2));
  const evidence = row.getByTestId("part-evidence");
  await expect(evidence).toContainText(top.parts.evidence.stated ? `${top.parts.evidence.inside} of ${top.parts.evidence.stated}` : "not stated");
  await row.getByText("Why these parts").click();
  for (const key of ["pillar", "evidence", "data", "fuel"] as const) {
    await expect(row.getByTestId(`reason-${key}`)).toBeVisible();
    await expect(row.getByTestId(`reason-${key}`)).toContainText(top.parts[key].reason);
  }
  await expect(row).toContainText(top.reason);
});

test("with the analyses list unavailable, the stages say so and the ranking still shows", async ({ page }) => {
  await page.route("**/api/v1/modules**", (route) => route.abort());
  await page.route("**/snapshot/api/v1/modules**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByTestId("stage-card")).toHaveCount(2);
  for (const stage of ["spread", "suppress"]) {
    const card = page.locator(`[data-testid="stage-card"][data-stage="${stage}"]`);
    await expect(card.getByTestId("card-error").or(card.getByTestId("stage-coming"))).toBeVisible();
    await expect(card.getByTestId("stage-coverage").or(card.getByTestId("stage-coverage-unavailable"))).toBeVisible();
  }
  await expect(page.getByTestId("top-rank-row")).toHaveCount(5);
  await expect(page.getByTestId("evidence-number")).toHaveCount(0);
  await expect(page.getByTestId("card-error").first().getByRole("button", { name: "Try again" })).toBeVisible();
});

test("with no data service at all, the cards and the ranking show the error state with Try again", async ({ page }) => {
  await page.route("**/api/v1/**", (route) => route.abort());
  await page.route("**/snapshot/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const error = page.getByTestId("card-error");
  await expect(error.first()).toContainText("The data service is not answering");
  await expect(error.first().getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByTestId("top-rank-row")).toHaveCount(0);
  // The limits live only on the Limitations page.
  await expect(page.getByTestId("home-cannot-tell")).toHaveCount(0);

  await page.goto("/investigations?sort=rank");
  await expect(page.getByTestId("error-state").first()).toContainText("The data service is not answering");
  await expect(page.getByTestId("rank-row")).toHaveCount(0);
});
