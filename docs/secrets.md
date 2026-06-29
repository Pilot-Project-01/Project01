# Secrets & env vars — what lives where

Every secret belongs to **exactly one of two app processes** — the backend
(FastAPI) or the frontend (Next.js) — and is set per environment (local / prod).
Nothing secret is ever committed; `.env` files are gitignored.

## The mental model

- **Supabase is a *source* of secrets, not a place you paste app secrets into.**
  You copy values *out* of the Supabase dashboard into the backend/frontend.
- **`SUPABASE_SECRET_KEY` (`sb_secret_…`) is backend-only.** It bypasses RLS, so
  it must never appear in the frontend or in any `NEXT_PUBLIC_*` var.
- **`ADMIN_API_TOKEN` is the one value that must be IDENTICAL in two places** —
  the backend (validates it) and the frontend (sends it). Same value, one per
  environment; different between local and prod.
- **`NEXT_PUBLIC_*` is shipped to the browser.** Only put non-secret values
  there (the API URL, the publishable key). Never a secret key or admin token.

## Where each value comes from

| Value | Source |
|-------|--------|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, publishable key | Supabase dashboard → Project Settings → **API** (or `supabase status` for the local stack) |
| `ADMIN_API_TOKEN` | generate: `python3 -c "import secrets; print('sk_admin_' + secrets.token_urlsafe(48))"` |
| `ADMIN_USER` / `ADMIN_PASS` | you choose; generate the pass: `python3 -c "import secrets; print(secrets.token_urlsafe(24))"` |
| `NEXT_PUBLIC_API_URL` | the backend's URL for that environment |
| `FRONTEND_URL` | the frontend's URL for that environment (backend CORS) |

## Local (`backend/.env` and `frontend/.env.local`)

These are already set up. For reference:

**`backend/.env`**
```
SUPABASE_URL=http://127.0.0.1:54321        # local stack (supabase status)
SUPABASE_SECRET_KEY=sb_secret_…            # local stack SECRET_KEY
ANTHROPIC_API_KEY=…                        # unused in v1; fine to leave as-is
FRONTEND_URL=http://localhost:3000
ADMIN_API_TOKEN=sk_admin_dev_…             # DEV token
```

**`frontend/.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:8000  # local backend
NEXT_PUBLIC_SUPABASE_URL=…                 # unused in v1
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…     # unused in v1
ADMIN_API_TOKEN=sk_admin_dev_…             # MUST equal backend/.env's value
ADMIN_USER=                                # blank → Basic Auth OFF in dev
ADMIN_PASS=                                # blank → Basic Auth OFF in dev
```

## Production

Generate **fresh** prod values (do NOT reuse the dev token). Then paste into the
hosting dashboards — never into committed files.

### Render → backend service → Environment
```
SUPABASE_URL=https://<your-prod-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_<prod>        # from Supabase dashboard → API
ANTHROPIC_API_KEY=<your key>                # unused in v1
FRONTEND_URL=https://<your-vercel-domain>   # enables CORS for the prod frontend
ADMIN_API_TOKEN=sk_admin_<prod>             # generate one; reuse the SAME in Vercel
```

### Vercel → frontend project → Settings → Environment Variables (Production)
```
NEXT_PUBLIC_API_URL=https://<your-render-backend-url>
NEXT_PUBLIC_SUPABASE_URL=https://<your-prod-ref>.supabase.co   # unused in v1
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<prod>     # unused in v1
ADMIN_API_TOKEN=sk_admin_<prod>             # MUST equal Render's value
ADMIN_USER=<pick a username>                # set BOTH to turn the gate ON
ADMIN_PASS=<strong password>
```

### Supabase (prod project)
You don't paste app secrets here. You only:
1. Apply the schema: `supabase/migrations/` (via `supabase db push` after
   `supabase link`, or paste the migration in the SQL editor).
2. Copy the Project URL + `sb_secret_` + `sb_publishable_` keys out, into the
   Render/Vercel vars above.

## Rules of thumb
- `sb_secret_…` → backend / Render **only**. Never frontend, never `NEXT_PUBLIC_`.
- `ADMIN_API_TOKEN` → same value in backend **and** frontend, per environment.
- `ADMIN_USER` + `ADMIN_PASS` → set **both** in prod (gate on); leave blank in dev.
- Rotate a secret by changing it in **both** places for that environment at once.
