# Deploying burnrate

Two parts. The site is on Vercel, the backend on the team's Oracle server. The browser only
talks to the site; the site forwards `/api/v1/*` to the backend (`apps/web/next.config.ts`).

| Part | Where | Address |
|---|---|---|
| Site (`apps/web/`) | Vercel, team `alfex`, project `burnrate-psi` | https://burnrate-psi-rosy.vercel.app |
| Backend (`apps/api/`) | Oracle server, service `burnrate-api`, port 8000 | http://<backend-host>:8000 (reached through the site, not directly) |

## The site

One-time setup (already done): `vercel login`, then in `apps/web/`
`vercel link --project burnrate-psi --scope alfex`. The project has one setting,
`API_ORIGIN = http://<backend-host>:8000` (Production), and `apps/web/vercel.json` tells Vercel it
is a Next.js app.

Redeploy, from `apps/web/` on a clean checkout of `main`:

```
# 1. the saved copy of the backend's answers (the site shows it if the backend does not answer)
node scripts/snapshot.mjs --origin http://<backend-host>:8000
#    backend not reachable from your machine? run it locally first (docs/ENGINE_API_CONTRACT.md,
#    "Run it", WITHOUT FIF_DEV) and pass --origin http://127.0.0.1:8000
# 2. upload and build on Vercel
vercel deploy --prod --scope alfex
```

`public/snapshot/` is git-ignored but uploaded (`apps/web/.vercelignore`). The snapshot step
fails if a route does not answer, so a deploy never ships a half-empty copy.

Roll back: `vercel rollback --scope alfex` puts the previous production deploy back
(`vercel ls burnrate-psi --scope alfex` lists them).

What works without the backend: every page's first view, from the saved copy, marked "Showing a
saved copy". What needs the live backend: filtering in the tests explorer beyond its first view,
and the video clips, images and CSV curves of the analyses.

## The backend

Files in `apps/api/deploy/`. One-time install on the server, as `opc`:
`bash apps/api/deploy/setup.sh` (a clean copy of the repo in `~/burnrate-api`, the service, and a
timer that follows `origin/main` every 5 minutes). The Oracle Cloud security list must allow TCP
8000 inbound.

Redeploy: nothing to do, the timer follows `main`. By hand:
`ssh nasa 'bash ~/burnrate-api/apps/api/deploy/update.sh'`.

Roll back: revert the commit on `main` (the timer follows it), or on the server
`cd ~/burnrate-api && git reset --hard <commit> && sudo systemctl restart burnrate-api`
(the timer moves it forward again at the next change of `main`).

Check: `curl http://<backend-host>:8000/api/v1/health` and
`curl https://burnrate-psi-rosy.vercel.app/api/v1/health`.

*Written with SI assistance (Claude Code); see `submission/SI_USAGE.md`.*
