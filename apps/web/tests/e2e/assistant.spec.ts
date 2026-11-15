import { expect, test } from "@playwright/test";

// The assistant with no Anthropic key (the default for these tests): it says so, shows the stored
// answers written from the data, and every source chip opens a page of the site. The stored
// answers' text and sources are read from GET /api/ask and the committed file, never typed here.
import stored from "../../lib/assistant/stored-answers.json";

test.beforeEach(async ({ request }) => {
  // playwright.config.ts starts the site with no model key, so this must hold.
  const status = await (await request.get("/api/ask")).json();
  expect(status.live, "the test server must run without ANTHROPIC_API_KEY").toBe(false);
});

test("with no key: stored answers only, a suggested question shows its stored answer and its sources open the site", async ({ page }) => {
  await page.goto("/assistant");
  const panel = page.getByRole("region", { name: "Assistant" });
  await expect(panel.getByTestId("assistant-status")).toHaveText("Stored answers only");
  await expect(panel.getByText("Answers are written by a language model from this site's data. Check the sources.")).toBeVisible();

  const first = stored.answers[0];
  await panel.getByRole("group", { name: "Suggested questions" }).getByRole("button", { name: first.chip }).click();

  const answer = panel.getByTestId("assistant-answer").last();
  await expect(answer).toHaveAttribute("data-kind", "stored");
  await expect(answer.getByText(`Stored answer, written from the data on ${stored.generated_on}`)).toBeVisible();
  await expect(answer.getByText("Sources", { exact: true })).toBeVisible();

  const source = first.sources.find((s) => s.kind === "investigation");
  expect(source, "the first stored answer cites an investigation").toBeTruthy();
  await answer.getByRole("link", { name: new RegExp(`^${source!.id}\\b`) }).last().click();
  await expect(page).toHaveURL(new RegExp(`/investigations/${source!.id}(\\?|$)`));
});

test("a typed question with no key says live answers are not available and offers the stored ones", async ({ page }) => {
  await page.goto("/assistant");
  const panel = page.getByRole("region", { name: "Assistant" });
  await expect(panel.getByTestId("assistant-status")).toHaveText("Stored answers only");
  const input = panel.getByRole("textbox", { name: "Ask the assistant" });
  await input.fill("What burned in SAFFIRE-II?");
  await input.press("Enter");
  const answer = panel.getByTestId("assistant-answer").last();
  await expect(answer).toHaveAttribute("data-kind", "notice");
  await expect(answer).toContainText("Live answers are not available right now.");
  await answer.getByRole("button", { name: stored.answers[1].question }).click();
  await expect(panel.getByTestId("assistant-answer").last()).toHaveAttribute("data-kind", "stored");
});

test("the input refuses an over-long question with a message", async ({ page }) => {
  await page.goto("/assistant");
  const panel = page.getByRole("region", { name: "Assistant" });
  const input = panel.getByRole("textbox", { name: "Ask the assistant" });
  await input.fill("a".repeat(801));
  await expect(panel.getByRole("alert")).toHaveText("Questions can be at most 800 characters. This one has 801.");
  await expect(panel.getByRole("button", { name: "Send" })).toBeDisabled();
  await input.press("Enter");
  await expect(panel.getByTestId("assistant-answer")).toHaveCount(0);
});

// A visitor's own API key (DOB-161). The site under test has no key, and POST /api/ask is
// answered here, so no model is called: these tests check what the browser does with the key.
// The key is built in pieces so the repository's key scanner does not take it for a real one.
const VISITOR_KEY = "sk-" + "ant-" + "visitor0".repeat(6);
const LIVE_ANSWER =
  '{"type":"text","delta":"FLEX burned fuel droplets."}\n{"type":"done","model":"claude-sonnet-5-5","saved_copy":false}\n';

test("a visitor's own key: entered once, sent only in the request header, kept nowhere, gone after a reload", async ({ page, context }) => {
  const requests: { url: string; header: string | null; body: string }[] = [];
  await page.route("**/api/ask", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    requests.push({ url: request.url(), header: await request.headerValue("x-assistant-key"), body: request.postData() ?? "" });
    await route.fulfill({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body: LIVE_ANSWER });
  });

  await page.goto("/assistant");
  const panel = page.getByRole("region", { name: "Assistant" });
  await expect(panel.getByTestId("assistant-status")).toHaveText("Stored answers only");
  await expect(panel.getByTestId("assistant-key")).toContainText("Live answers need an Anthropic API key.");

  await panel.getByRole("button", { name: "Use your API key" }).click();
  const field = panel.getByLabel("Your Anthropic API key");
  await expect(field).toHaveAttribute("type", "password");
  await expect(field).toHaveAttribute("autocomplete", "off");
  await expect(panel.getByTestId("assistant-key")).toContainText("does not store or log it");
  await field.fill(VISITOR_KEY);
  await panel.getByRole("button", { name: "Use key" }).click();

  await expect(panel.getByTestId("assistant-status")).toHaveText("Live, your key");
  await expect(panel.getByTestId("assistant-key")).toContainText("Live answers run on your API key");
  // The field is gone, and the key is nowhere in the page.
  await expect(field).toHaveCount(0);
  expect(await page.content()).not.toContain(VISITOR_KEY);

  // Two questions, one key entry.
  const input = panel.getByRole("textbox", { name: "Ask the assistant" });
  for (const question of ["What did FLEX burn?", "And in which air?"]) {
    await input.fill(question);
    await input.press("Enter");
    await expect(panel.getByTestId("assistant-answer").last()).toHaveAttribute("data-kind", "live");
  }
  expect(requests).toHaveLength(2);
  for (const sent of requests) {
    expect(sent.header).toBe(VISITOR_KEY);
    expect(sent.body).not.toContain(VISITOR_KEY);
    expect(sent.url).not.toContain(VISITOR_KEY);
    expect(new URL(sent.url).origin).toBe(new URL(page.url()).origin);
  }

  // Not in any browser storage, not in a cookie, not in the address.
  const kept = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie, location.href]));
  expect(kept).not.toContain("sk-");
  expect(JSON.stringify(await context.cookies())).not.toContain("sk-");

  // A reload forgets it.
  await page.reload();
  await expect(panel.getByTestId("assistant-status")).toHaveText("Stored answers only");
});

test("a visitor's own key: a wrong shape is refused in the browser, and Remove key goes back to stored answers", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/ask", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts += 1;
    return route.fulfill({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body: LIVE_ANSWER });
  });
  await page.goto("/assistant");
  const panel = page.getByRole("region", { name: "Assistant" });
  await panel.getByRole("button", { name: "Use your API key" }).click();
  const field = panel.getByLabel("Your Anthropic API key");
  await field.fill("not-a-key");
  await field.press("Enter");
  await expect(panel.getByRole("alert")).toHaveText("That does not look like an Anthropic API key. Keys start with sk-ant-.");
  await expect(panel.getByTestId("assistant-status")).toHaveText("Stored answers only");

  await field.fill(VISITOR_KEY);
  await field.press("Enter");
  await expect(panel.getByTestId("assistant-status")).toHaveText("Live, your key");
  await panel.getByRole("button", { name: "Remove key" }).click();
  await expect(panel.getByTestId("assistant-status")).toHaveText("Stored answers only");
  expect(posts, "entering and removing a key sends nothing").toBe(0);
});

test("a visitor's own key: when the key is refused the panel says so, forgets it and asks again", async ({ page }) => {
  await page.route("**/api/ask", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: '{"type":"error","message":"Anthropic refused this API key, so it was removed. Check the key and enter it again, or read the stored answers.","stored":true,"reason":"key"}\n',
    });
  });
  await page.goto("/assistant");
  const panel = page.getByRole("region", { name: "Assistant" });
  await panel.getByRole("button", { name: "Use your API key" }).click();
  await panel.getByLabel("Your Anthropic API key").fill(VISITOR_KEY);
  await panel.getByRole("button", { name: "Use key" }).click();
  const input = panel.getByRole("textbox", { name: "Ask the assistant" });
  await input.fill("What did FLEX burn?");
  await input.press("Enter");
  const answer = panel.getByTestId("assistant-answer").last();
  await expect(answer).toHaveAttribute("data-kind", "notice");
  await expect(answer).toContainText("Anthropic refused this API key");
  await expect(panel.getByTestId("assistant-status")).toHaveText("Stored answers only");
  await expect(panel.getByRole("button", { name: "Use your API key" })).toBeVisible();
});
