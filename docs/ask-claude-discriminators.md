# Brief to paste into Claude (browser) — designing stronger weak/strong discriminators

Copy everything below the line into a fresh Claude conversation. It's self-contained.

---

I'm building a top-of-funnel hiring assessment for SDE/FDE roles at AI-native
companies. The thesis: instead of testing whether someone can write code, test
their **supervisory judgment over an AI agent** — they review an AI agent's
completed work, decide whether it's ready to ship, and we capture their action
trace and score the *judgment*, not the code.

## The current task (single, calibrated, ~10 min)
A candidate is shown an AI agent's implementation of promo-code discounts for a
shopping cart. The agent's note confidently claims it's done, validated, and
tested. The code *looks* clean and the one provided test passes — but it has
five intentional "moments," weighted toward judgment rather than debugging:

1. **Float-money bug** — does float math on dollars; SAVE10 on $19.99 returns
   17.990999…, not 17.99. Invisible on the happy-path test ($10 → 9).
2. **Ignored helper (taste)** — a correct integer-cents money helper already
   exists in money.ts; the agent reinvented it badly with inline float math.
3. **False "I tested it" claim** — invalid promo codes are silently ignored (no
   validation); the single "test" covers no edges.
4. **Dangerous shortcut** — the function mutates the caller's input object
   (cart.total = …), a hidden side effect.
5. **Silent product decision** — an over-discount is silently capped at $0, so a
   $20-off code on a $15 cart makes the item free. No "right" code answer; the
   point is whether they *surface* the decision.

## What we capture (the trace)
An ordered event log per session: assessment_started, agent_note_viewed (with
dwell time), file_opened, file_edited (diffs), code_run (they have a live
scratchpad that runs the code and shows console output), test_run (pass/fail),
marked_ready (final code snapshot + a forced trust-vs-verify radio: "did you run
the tests / read but didn't run / trusted the note" + a free-text reflection:
"what did you change/check/flag"), and timed_out. Order and timing are signal
(did they run before shipping? add a test before or after a fix?).

Scoring is **manual** for now. A dashboard shows, per candidate: verification
checks (ran tests? ran the code? opened money.ts? read the note + dwell?
self-report contradicts the trace?), per-moment heuristic hints
(missed → noticed → acted), the agent-vs-shipped code diff, and the reflection.

## The problem I want help with
My worry: a **weak** engineer won't do *nothing*. They'll still run the one
test, skim each file, and click "ship." So "opened nothing / ran nothing" won't
separate weak from strong. I need **finer discriminators** that distinguish a
genuinely strong supervisor of AI work from a competent-but-shallow one —
WITHOUT (a) making the bugs obvious (which gives away the answers) or (b) making
the code more broken (which turns it into a debugging test, measures the wrong
thing, and is easy to game with raw skill).

## What I'm asking you
1. What are the highest-signal, hardest-to-fake behavioral discriminators
   between strong and weak *supervisors* of AI-generated code — especially ones
   visible in an action trace + a short written reflection?
2. Concretely, how should I change what I *capture* or *prompt for* at submit
   time to surface those discriminators, without leading the witness or
   revealing the planted issues?
3. Is the written reflection / a PR-style review comment the richest signal, and
   if so how do I elicit and (eventually) score it so it discriminates rather
   than collecting "looks good"?
4. Are there judgment/decision framings better than a binary "mark ready" —
   e.g., ship / ship-with-caveats / block + rationale, or a confidence rating
   cross-referenced against what they actually verified?
5. What failure modes should I watch for (gaming, coaching effects, candidates
   who verify performatively vs. substantively)?

Constraints: single task, ~10 minutes, no live AI agent in this version,
manual scoring, and I do NOT want to turn it into a debugging exercise. Push
back on anything weak in my framing. Give concrete, specific suggestions I can
implement, not generic advice.
