# Assessment Harness

A top-of-funnel hiring assessment for SDE/FDE roles at AI-native companies. A
candidate reviews and extends an AI agent's pre-authored work and decides whether
it's ready to ship. We capture the full action trace and hand-score their
**supervisory judgment over an AI agent** — not the code they produce.

v1 is a single ~10-minute assessment with **no live AI calls** (the agent's work is
frozen and scoring is manual). See [CLAUDE.md](./CLAUDE.md) for full context.

## Stack

- **Frontend:** Next.js 16 (App Router, React 19, React Compiler on, StrictMode off) + TypeScript + Tailwind v4, deployed on Vercel. Embedded sandbox via `@codesandbox/sandpack-react`.
- **Backend:** FastAPI (Python 3.12, managed by `uv`), deployed on Render
- **DB:** Supabase (Postgres + RLS). Local dev runs a local Supabase stack in Docker.
- **AI:** Anthropic API — **not used in v1** (zero inference cost; hosting only)

## Layout

```
frontend/   Next.js app (src/app, src/components, src/lib, src/types)
backend/    FastAPI service (app/routes, services, models, clients, core; tests/)
tasks/      Hand-authored assessment tasks (v1-cart-discount)
supabase/   Schema migrations
docs/       Design docs and ADRs
CLAUDE.md   Project context (read this first)
```

## Run it

A `Makefile` wraps local dev. Supabase runs in Docker (via the CLI); the backend
and frontend run natively for a fast reload loop. **Docker Desktop must be running.**

```bash
make install   # install backend (uv sync) + frontend (npm install) deps
make dev       # start everything: Supabase + backend (:8000) + frontend (:3000)
```

`make dev` starts the local Supabase stack, then runs the backend and frontend
together — Ctrl-C stops both. (Bare `uvicorn` does NOT start Supabase; a
`ConnectError` to `127.0.0.1:54321` means Supabase is down — use `make dev`.)

Other targets:

```bash
make supabase        # start only the local Supabase stack (idempotent)
make backend         # run only the backend (:8000)
make frontend        # run only the frontend (:3000)
make db-reset        # re-apply migrations to the LOCAL db (wipes local data)
make test            # backend (pytest) + frontend tests
make health          # check backend + Supabase are reachable
make stop            # stop Supabase and any stray dev servers
make help            # list all targets
```

Health check: `curl localhost:8000/health` should return `{"status":"ok"}`.

## First-time setup

1. Clone the repo
2. Copy `.env.example` → `.env.local` in `frontend/`, fill in Supabase + API URL
3. Copy `.env.example` → `.env` in `backend/`, fill in Supabase keys (Anthropic key not needed for v1)
4. `make install`
5. Start the local stack with `make dev`

See [docs/secrets.md](./docs/secrets.md) and
[docs/admin-and-environments.md](./docs/admin-and-environments.md) for what each
env var is and where it lives. Supabase keys use the new naming
(`sb_publishable_` frontend / `sb_secret_` backend).

## Deploy

Both auto-deploy on push to `main`.

- Frontend → Vercel (root dir: `frontend`)
- Backend → Render (root dir: `backend`, build: `pip install uv && uv sync --frozen`, start: `uv run uvicorn main:app --host 0.0.0.0 --port $PORT`)
