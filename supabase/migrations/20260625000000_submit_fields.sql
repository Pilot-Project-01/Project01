-- v1 assessment harness — submit decision fields.
-- Replaces the binary "mark ready" with a structured submit: a ship/caveat/block
-- decision, a confidence level, and a required free-text team summary (the
-- primary evidence source for the Scope moments). Idempotent (safe to re-run).
--
-- All columns are nullable: rows created before a submit (and sessions that time
-- out without submitting) simply leave them null. marked_ready stays the
-- "a decision was submitted" flag, regardless of which decision was chosen.

alter table public.sessions
  add column if not exists decision     text
    check (decision in ('ship', 'ship_with_caveats', 'block')),
  add column if not exists confidence   text
    check (confidence in ('low', 'medium', 'high')),
  add column if not exists team_summary text;
