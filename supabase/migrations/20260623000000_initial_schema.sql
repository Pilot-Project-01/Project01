-- v1 assessment harness — trace storage.
-- Apply with `supabase db push` after linking the project, or paste this file
-- into the Supabase SQL editor for a quick manual apply. Idempotent (safe to re-run).
--
-- RLS is enabled on both tables with NO policies, so the anon / publishable
-- key can read or write nothing. All access goes through the FastAPI backend
-- using the sb_secret_ (service role) key, which bypasses RLS. v1 has no
-- candidate auth, so there is no auth.uid() to scope per-row policies to — the
-- deny-all + trusted-backend pattern is the deliberate resolution of the
-- "RLS everywhere" + "secret key only in trusted server code" conventions.

create extension if not exists "pgcrypto";

-- One row per assessment session.
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  task_id       text not null,
  candidate_name text not null,         -- human name; the only candidate identifier in v1
  started_at    timestamptz,            -- set when the clock starts (assessment_started)
  ended_at      timestamptz,
  status        text not null default 'created'
                  check (status in ('created', 'in_progress', 'submitted', 'timed_out')),
  marked_ready  boolean not null default false,
  final_files   jsonb                   -- {path: content} snapshot captured at marked_ready
);

-- Ordered event log. Order + timing ARE the signal, so we sort by a
-- client-supplied monotonic counter (seq), not by server receipt time.
create table if not exists public.trace_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),  -- server receipt time
  session_id  uuid not null references public.sessions(id) on delete cascade,
  seq         integer not null,                    -- monotonic per session; primary sort key
  client_ts   timestamptz not null,                -- when it happened in the browser
  type        text not null,
  payload     jsonb not null default '{}'::jsonb
);

create index if not exists trace_events_session_seq_idx
  on public.trace_events (session_id, seq);

-- A session's (session_id, seq) pair is unique so duplicate flushes are idempotent.
create unique index if not exists trace_events_session_seq_uniq
  on public.trace_events (session_id, seq);

-- Keep updated_at fresh on sessions.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- RLS on, no policies → anon/publishable key denied; backend secret key bypasses.
alter table public.sessions enable row level security;
alter table public.trace_events enable row level security;

-- The backend authenticates as service_role (bypasses RLS) but still needs
-- table privileges. Hosted Supabase grants these by default; a local
-- `supabase start` stack does not, so grant explicitly to keep the schema
-- self-contained across every environment. anon/authenticated get nothing.
grant all on public.sessions to service_role;
grant all on public.trace_events to service_role;
