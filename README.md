# Platform

Hiring platform that scores candidate AI fluency from their AI tool artifacts (CLAUDE.md / Memory.md files).

Phase 0. See [CLAUDE.md](./CLAUDE.md) for full context.

## Stack

- **Frontend:** Next.js 16 + TypeScript + Tailwind, deployed on Vercel
- **Backend:** FastAPI (Python 3.12, managed by `uv`), deployed on Render
- **DB / Auth / Storage:** Supabase
- **AI:** Anthropic API (`claude-sonnet-4-20250514`)

## Layout

```
frontend/   Next.js app
backend/    FastAPI service
docs/       Design docs and ADRs
CLAUDE.md   Project context (read this first)
```

## Run it

```bash
# frontend
cd frontend && npm run dev      # localhost:3000

# backend (separate terminal)
cd backend && uv run uvicorn main:app --reload    # localhost:8000
```

Health check: `curl localhost:8000/health` should return `{"status":"ok"}`.

## First-time setup

1. Clone the repo
2. Copy `.env.example` → `.env.local` in `frontend/`, fill in Supabase + API URL
3. Copy `.env.example` → `.env` in `backend/`, fill in Supabase + Anthropic keys
4. `cd frontend && npm install`
5. `cd backend && uv sync`

Real values live in:
- Supabase dashboard → Settings → API Keys
- Anthropic console → API Keys

## Deploy

Both auto-deploy on push to `main`.

- Frontend → Vercel (root dir: `frontend`)
- Backend → Render (root dir: `backend`, build: `pip install uv && uv sync --frozen`, start: `uv run uvicorn main:app --host 0.0.0.0 --port $PORT`)