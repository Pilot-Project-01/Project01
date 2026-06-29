# v1-cart-discount — Answer key & scoring guide
# INTERNAL — never load this into the candidate's sandbox. Lives in the task
# folder but OUTSIDE task-files/ (the only dir the loader serves), and is not in
# manifest.candidate_files. Two independent guards keep it unreachable.

This task tests supervisory judgment over an AI agent's work, NOT debugging. The agent's
output (cart.ts) looks clean and its note confidently claims it's done, validated, and
tested. Every claim in that note is false or misleading. The signal is whether the candidate
VERIFIES before trusting, and what they do with the gaps they find.

`applyDiscount(cart, codes)` takes an ARRAY of promo codes (the cart supports applying promo
codes; whether codes may combine, and in what order, is left unspecified on purpose — see
moment 6). At submit the candidate gives a structured decision (ship / ship_with_caveats /
block), a confidence level, a required free-text **team summary**, a trust-vs-verify answer,
and optional notes.

> **Evidence sources.** Actions (file_opened, file_edited, test_edited, test_run, code_run
> with verbatim source+output, diffs per edit) cover the correctness/taste moments. The two
> **Scope moments (5 over-discount, 6 stacking) rarely show up in actions — their PRIMARY
> evidence is the team summary** (then the optional notes). Read the team summary first for
> those two.

The six moments, roughly floor -> ceiling:

## 1. The bug — float money (floor / correctness)
The agent does float math on dollar amounts. SAVE10 on a $19.99 item returns
17.990999999999996, not 17.99.
- Strong: runs it (or writes a test) with a realistic price, sees the non-cent total, fixes it.
- Weak: only sees the agent's happy-path test ($10 -> 9, clean) and trusts it.
- Trace evidence: did they run code / a test with a non-round price before shipping?
- **Fork-tag (how they fixed it), DRAFT — verify this matches how you'd score:**
  `none` (didn't touch the math) | `symptom-round` (rounded the OUTPUT, e.g. `.toFixed(2)` /
  `Math.round` on the returned total — patches the symptom) | `root-via-helper` (routed the
  money math through src/money.ts, fixing the root cause — strongest; overlaps moment 2).

## 2. Wrong shape — ignored money.ts (ceiling / taste)
A correct money helper already exists in src/money.ts (integer cents, toCents, applyPercent,
formatPrice). The agent ignored it and did inline float math — the root cause of moment 1.
- Strong: notices the helper exists and that the agent reinvented it badly; routes money math through it.
- Weak: never opens money.ts.
- Trace evidence: file_opened on money.ts; edits that use it.

## 3. False claim — "validates the code" + "tested it" (verification)
Invalid codes (e.g. "NOTACODE") are silently ignored — no validation, no error. The "test"
is a single happy-path case covering none of the edges.
- Strong: tries an invalid code and/or judges the existing test's coverage as weak.
- Weak: reads "validated and tested," believes it.
- Trace evidence: running an invalid code; opening cart.test.ts; test_edited events.

## 4. Dangerous shortcut — mutates the input cart (consequence)
`cart.total = total` writes back into the caller's cart object. The function looks pure but
has a hidden side effect: call it twice, or read cart.total elsewhere, and state is corrupted.
- Strong: notices the side effect; returns a value without mutating the input.
- Weak: doesn't notice.
- Trace evidence: edits removing the mutation.
- **Fork-tag, DRAFT — verify:** `none` (no sign they noticed) | `noticed` (called it out in the
  team summary / notes but left the mutation in) | `fixed` (shipped code no longer assigns
  `cart.total`).

## 5. Silent decision — over-discount capped at $0 (judgment / no right answer)
TAKE20 on a $15 cart: the agent silently caps the total at $0 — the customer gets it free.
There is no correct code answer; the point is that a product decision was made silently.
- Strong: SURFACES it ("what should happen when the discount exceeds the cart? Right now it's
  free — is that intended?") instead of silently accepting the agent's choice.
- Weak: never notices, or accepts the cap without question.
- **Primary evidence: the team summary** (the neutral submit field). Isolate this case with a
  SINGLE code that drives the total negative (e.g. TAKE20 on $15) so it doesn't entangle with
  moment 6.

## 6. Silent decision — stacking multiple codes (judgment / no right answer)  [DRAFT — VERIFY]
The cart accepts an array of codes and the agent applies them ALL, one after another, to the
running total — no precedence, no stated order rule, no "one code per cart" limit. Nothing in
TASK.md says whether codes may combine or in what order; the agent silently decided "all of
them, in array order." This is a defensible-but-unflagged PRODUCT decision, **not a
correctness bug** — the arithmetic is internally consistent; the question is whether combining
should happen at all and under what rule.
- Strong: SURFACES that combining is unspecified ("can codes stack? in what order? right now
  they all apply sequentially — is that intended?") AND proposes a rule or rationale.
- Weak: accepts silently; never mentions multiple codes.
- **Primary evidence: the team summary.** Isolate with codes that do NOT drive the total to $0
  (e.g. SAVE10 + HALFOFF on a normal cart) so it stays independent of moment 5.
- Ladder for this moment (DRAFT):
  `0` accepted silently | `1` surfaced the ambiguity | `2` surfaced it AND proposed a rule or
  rationale.

## Scoring each moment (ladder)
Moments 1–5 use the original ladder:
0 = missed | 1 = noticed but didn't act | 2 = fixed shallowly | 3 = fixed and hardened
(added a test so it can't recur, or surfaced the decision explicitly).
Moment 6 uses its own 0/1/2 ladder above (it has no "right" code answer).
Record the trace event (or the team-summary text) that justifies each score. The submit
decision + confidence are context for the whole review, not a per-moment score.

## What this beta is actually validating
Do not read the totals as a filter score. The question is: do the friends you already know
are strong engineers score higher than the ones you know are weaker? If yes, the construct
has legs — make v1.1 harder and add a live agent. If a known-strong engineer rubber-stamps
and a known-weak one verifies, the signal is noise, and you learned it for the price of one
easy task.
