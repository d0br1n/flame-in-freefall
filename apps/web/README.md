# The web app (`apps/web/`)

The site a visitor and the judges open. Next.js with TypeScript and Tailwind. It reads the one
backend (`apps/api/`) and nothing else; see `docs/ARCHITECTURE.md`.

**Design:** every page follows [`DESIGN.md`](DESIGN.md) (palette, type, the source margin, bans).
Read it before any UI change.

## Where things are

- `app/layout.tsx`: the shell (blue header band with the burnrate mark, navigation, cabin-air selector, footer).
- `lib/nav.ts`: the navigation. A page that is not built is hidden (`built: false`), never a dead link.
- `components/AppLink.tsx`: the one internal link; it carries `?air=<id>` between pages (`lib/links.ts`).
- `components/SourceNote.tsx`: the source margin (`MarginRow` + `SourceNote`), reused for every sourced value.
- `components/LoadStates.tsx`: loading skeleton, "data service is not answering" with Try again, "Showing a saved copy".
- `/` (the home page, `components/home/OverviewView.tsx`, logic in `lib/home.ts`): for the chosen cabin
  air, the two questions (will it spread, what puts it out) and the 24 investigations ranked
  for that air (`GET /catalog/rank`).
- `/investigations` (filters in the URL, `lib/filters.ts`) and `/investigations/[psiId]`.
- `/tests` (`components/tests/`, logic in `lib/tests.ts` and `lib/chart.ts`): every test of the
  PSI tables, filtered by the backend; one test opens from `GET /catalog/tests/{test_id}`.
- `/spread` (named "Video to Data") and `/suppress` (named "Suppression test bench"): one pillar page template (`components/pillar/PillarPage.tsx`, logic in `lib/pillar.ts`) filled by the analysis whose `module.json` names that stage. An analysis-specific main view or lead sections register in `components/pillar/mainViews.ts`.
- `components/ui/SectionNav.tsx`: a long page shown one section at a time (the investigation page, both analysis pages, Limitations); the section is kept in the address (`#files`).
- `/limitations`: the only place that lists what the data cannot tell; other pages link to it.
- `components/evidence/`: the evidence panel (mounted once in `app/layout.tsx`), `EvidenceNumber` (every number is a button that opens it) and the provenance badges (`lib/provenance.ts`).

## How it talks to the backend

- The browser only calls this site's own address, `/api/v1/...`. The site forwards those calls
  to the backend. The backend address is one environment variable, `API_ORIGIN`, read at build
  time (default `http://127.0.0.1:8000`). See `next.config.ts`.
- `lib/api.ts` is the only file that fetches. If the backend does not answer, it uses the saved
  copy bundled with the build (`public/snapshot/`) and tells the page so. A page never shows a
  blank screen: it shows loading, the data, or a readable error.
- The shapes the site expects are in `fixtures/README.md` and `lib/types.ts`. Every route the
  site reads is real (`apps/api/`, see `docs/ENGINE_API_CONTRACT.md`).

## Run it

```
npm ci
API_ORIGIN=http://127.0.0.1:8000 npm run dev      # with the real backend (see docs/ENGINE_API_CONTRACT.md)
npm run stub                                      # or, without Python: a stand-in on port 8787 that serves fixtures/
API_ORIGIN=http://127.0.0.1:8787 npm run dev
```

The stub and the fixtures are only for working on the UI without Python. They are not the
source of truth: the tests and cabin-air fixtures are a small development stand-in (two tables,
shape-only coverage, no ranking), so counts on the stub differ from the real site.

## Check it

```
npm run lint
npm test             # type check + unit tests (this is what CI runs)
npm run test:e2e     # builds, then runs the browser tests on the REAL backend (local only)
```

`npm run test:e2e` starts the real backend itself (from the repo root:
`FIF_DEV=1 .venv/bin/uvicorn --app-dir apps/api app.main:app --port 8787`) and reads the expected
counts from it, so the tests follow the data. It needs the Python environment `.venv` at the
repo root; create it once (from the repo root, see `docs/ENGINE_API_CONTRACT.md`, "Run it"):

```
uv venv -p 3.12 .venv && uv pip install --python .venv/bin/python -r apps/api/requirements.txt
```

The config stops with that instruction if `.venv` is missing.

Run one heavy command at a time on a laptop: the build, the dev server and the browser tests
each take a few hundred MB.

## The assistant

"Ask burnrate" answers questions about the PSI experiments by calling tools over this site's own
data service, and cites the PSI investigation and test IDs it used. It never answers from
memory: every number comes from a tool result of the same conversation.

- **Where:** the dock (`components/assistant/AssistantDock.tsx`, mounted by the shell) and the
  page `/assistant`; both use `AssistantPanel`, and the conversation lives in
  `AssistantProvider` (mount it once so it survives closing the dock). The browser calls only
  `POST /api/ask` (`lib/assistant/client.ts`); the route is `app/api/ask/route.ts`.
- **How:** `lib/assistant/run.ts` runs a tool loop on the server with Claude through the
  Anthropic SDK (`lib/assistant/model.ts`): at most 6 rounds, at most 4 tool calls per round
  (run together, all results in one message), adaptive thinking, effort `medium`, tools declared
  `strict`, the system prompt and tools cached. The 11 tools (`lib/assistant/tools.ts`) read
  `${API_ORIGIN}/api/v1/...` with a 6 s limit, fall back to the saved copy (`public/snapshot/`),
  take only validated IDs and listed values, and return small results with their sources.
  The answer streams to the browser as newline-delimited JSON events (`lib/assistant/stream.ts`).
- **Grounding check** (`lib/assistant/ground.ts`): every `[PSI-…]` citation is checked against
  the tool results before the visitor sees it; an ID no tool returned is removed and the answer
  says "One reference could not be verified and was removed." The sources row lists only cited
  IDs that a tool returned. An answer with numbers and no tool call behind it is not shown.
- **Stored answers:** five example questions answered ahead of time from the data, with no
  model (`lib/assistant/stored-answers.json`, labelled "Stored answer, written from the data on
  <date>"). Shown when there is no key, when the model fails or refuses, or at the rate limit.
  Regenerate them against a running backend (from `apps/web/`):
  `node scripts/make-stored-answers.mjs --origin http://127.0.0.1:8000`.
  The script runs the real tools, fills templates that check their own claims, and stops if
  the data no longer supports a sentence.
- **Limits** (`lib/assistant/limits.ts`): a question of at most 800 characters, the last 8
  messages of history, 8 questions per address per 10 minutes (in memory, per server instance).
  The hard spend cap is the spend limit of the Anthropic workspace that owns the key (Console).
- **A visitor's own key** (`lib/assistant/key.ts`, DOB-161): a visitor can enter their own
  Anthropic API key in the panel ("Use your API key"). Live answers then run on that key and
  are billed to them; it wins over the site's key, and with neither the answers are the stored
  ones. Where the key is, and nowhere else: the page's memory in the browser (no localStorage,
  sessionStorage, cookie or URL; a reload forgets it), the `x-assistant-key` header of the
  same-site `POST /api/ask` (redirects refused), and the one Anthropic client of that one
  request on the server. It is checked for shape before use, never stored, never logged and
  never written into a response. A key Anthropic refuses is forgotten by the browser at once.
  On their own key a visitor may ask 40 questions per 10 minutes.

Environment (server only, see `.env.example`):

| Name | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | The site's own Claude API key. Missing: stored answers only, unless the visitor enters their own key. |
| `ASSISTANT_MODEL` | `claude-sonnet-5-5` (default, chosen by the team), `claude-opus-5-5` (dearer) or `claude-haiku-5-5` (cheaper). The choice is the owner's. Each gets only the parameters it accepts (`modelOptions` in `lib/assistant/model.ts`); Haiku 5.5 has no server-side refusal fallback. |
| `API_ORIGIN` | The data service, also used by the tools. |

## Fixtures

`npm run fixtures -- --raw <path to data/raw>` regenerates `fixtures/api/v1/catalog/` from the
PSI records and the curation file. Every value is copied or counted from NASA's PSI data; none
is invented.

*Code and text generated with SI assistance (Claude Code), reviewed by the team; see
`submission/SI_USAGE.md`.*
