# Admin dashboard & environment isolation

## Admin access — two layers

The trace dashboard (`/admin/sessions`) exposes every candidate's session, so it
is protected by two independent layers. **Layer 1 is the real security boundary;
Layer 2 just keeps strangers off the page.**

### Layer 1 — backend read-token (the data lock)
The FastAPI read endpoints require a bearer token:

- `GET /api/v1/sessions` and `GET /api/v1/sessions/{id}/trace` → require
  `Authorization: Bearer <ADMIN_API_TOKEN>`.
- `POST /api/v1/sessions` and `POST .../events` (candidate writes) stay **public** —
  the browser needs them and they grant no read access.

Implemented in `backend/app/core/security.py` (`require_admin`). It **fails closed**:
if `ADMIN_API_TOKEN` is unset, every admin request is rejected (503), so a
misconfigured deployment serves nothing rather than everything. The compare is
constant-time.

The admin frontend holds the token **server-side only**, in
`frontend/src/lib/admin-api.ts`, which starts with `import "server-only"` — the
build fails if that module is ever pulled into client code, so the token can
never reach a browser. Never give it a `NEXT_PUBLIC_` prefix.

### Layer 2 — Basic Auth on `/admin` (the page lock)
`frontend/src/middleware.ts` gates `/admin/*` with HTTP Basic Auth using
`ADMIN_USER` / `ADMIN_PASS`.

- If **either** is blank → the gate is **off** (convenient for local dev).
- Set **both** in production → browser shows a login prompt.

## Secrets per environment

Each environment has its **own** secrets. Generate fresh ones per environment:

```bash
# admin API token (backend <-> admin frontend)
python3 -c "import secrets; print('sk_admin_' + secrets.token_urlsafe(48))"
# basic-auth password
python3 -c "import secrets; print(secrets.token_urlsafe(24))"
```

| Variable          | Where            | Notes                                            |
|-------------------|------------------|--------------------------------------------------|
| `ADMIN_API_TOKEN` | backend + admin frontend | **Must match** within one environment.   |
| `ADMIN_USER`      | frontend         | Basic Auth user (prod only).                     |
| `ADMIN_PASS`      | frontend         | Basic Auth password (prod only).                 |

The dev and prod `ADMIN_API_TOKEN`s must be **different** values — that is part
of how the environments stay isolated.

## Environment isolation (dev vs prod data)

**Goal:** on localhost you see only local/test data; on the production admin page
you see only production data.

**How it actually works:** the admin page shows whatever the **backend it talks
to** returns, and the backend shows whatever **Supabase project** it points at.
So isolation is achieved purely by configuration — point each environment's
backend at its own database:

```
local frontend ──► local backend ──► DEV  Supabase   (test data only)
prod  frontend ──► prod  backend ──► PROD Supabase   (real data only)
```

No code knows about "dev" or "prod"; the wiring is entirely in env vars.

### Local dev uses a local Supabase stack (already wired)
Dev runs its own database via the Supabase CLI, fully isolated from prod:

```bash
supabase start      # runs Postgres + the API on 127.0.0.1:54321 in Docker
supabase db reset   # (re)applies supabase/migrations/ to the local DB
```

`backend/.env` already points at the local stack
(`SUPABASE_URL=http://127.0.0.1:54321` + the local `SECRET_KEY`), with the prod
values kept as commented lines for reference. `supabase status` reprints the
local URL/keys anytime. Because the local backend talks to the local database,
**localhost only ever shows local test data**.

Stop the stack with `supabase stop` (data persists) or `supabase stop
--no-backup` to wipe it.

> Note: the migration explicitly `GRANT`s the tables to `service_role`. Hosted
> Supabase grants this automatically; a local stack does not, so the grant lives
> in the migration to keep every environment consistent.

### Production
Keep using the hosted Supabase project. Set its secrets in the Render (backend)
and Vercel (frontend) dashboards — never in committed files. A second hosted
`*-dev` project is an option if you ever want a shared (non-local) dev database,
but the local stack above is the default dev path.

## Local dev quick start
1. Ensure `backend/.env` points at a **dev** database (see gap above) and has a
   dev `ADMIN_API_TOKEN`; `frontend/.env.local` has the **same** token and blank
   `ADMIN_USER`/`ADMIN_PASS`.
2. `cd backend && uv run uvicorn main:app --reload --port 8000`
3. `cd frontend && npm run dev`
4. Candidate flow: <http://localhost:3000>. Admin: <http://localhost:3000/admin/sessions>
   (no login prompt in dev).
