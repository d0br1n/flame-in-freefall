import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

// Browser tests. Local only (not in CI). They run against a production build served by
// `next start`, with the REAL backend (apps/api, FastAPI) behind it on port 8787, started from
// the repo root with FIF_DEV=1 (which also serves the _mock analysis). One worker on purpose:
// the laptop runs several other sessions.
//   npm run test:e2e          builds with API_ORIGIN pointing at port 8787, then runs the tests
// The backend needs the Python environment at <repo>/.venv (see README.md, "Check it").
const WEB_PORT = 3100;
const API_PORT = 8787;
const REPO = resolve(__dirname, "..", "..");
const UVICORN = resolve(REPO, ".venv", "bin", "uvicorn");

if (!existsSync(UVICORN)) {
  throw new Error(
    `The browser tests run on the real backend, but ${UVICORN} is missing. Create the Python environment from the repo root:\n` +
      "  uv venv -p 3.12 .venv && uv pip install --python .venv/bin/python -r apps/api/requirements.txt\n" +
      "(docs/ENGINE_API_CONTRACT.md, \"Run it\"). To work on the UI without Python, use `npm run stub` instead.",
  );
}

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, browserName: "chromium", headless: true },
  webServer: [
    {
      command: `.venv/bin/uvicorn --app-dir apps/api app.main:app --host 127.0.0.1 --port ${API_PORT} --log-level warning`,
      cwd: REPO,
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      env: { FIF_DEV: "1" },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `node node_modules/next/dist/bin/next start -p ${WEB_PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      // No model key here on purpose: the browser tests cover the stored-answers path only.
      env: { NODE_OPTIONS: "--max-old-space-size=1024", ANTHROPIC_API_KEY: "" },
      reuseExistingServer: true,
    },
  ],
});
