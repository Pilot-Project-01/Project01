"""Analysis heuristics: a strong session and a weak one should read differently."""

from datetime import datetime, timedelta, timezone

from app.core.events import EventType
from app.models.trace import EventBatch, SessionCreate, TraceEventIn
from app.services import analysis

BASE = datetime(2026, 6, 24, 12, 0, 0, tzinfo=timezone.utc)


def _ts(secs):
    return BASE + timedelta(seconds=secs)


def _seed(store, events):
    sid = store.create_session(
        SessionCreate(task_id="v1-cart-discount", candidate_name="T")
    )
    store.ingest_events(sid, EventBatch(events=events))
    return sid


def test_weak_session_reads_as_missed(store):
    # Opens nothing, runs nothing, ships trusting the note.
    sid = _seed(store, [
        TraceEventIn(seq=1, client_ts=_ts(1), type=EventType.ASSESSMENT_STARTED),
        TraceEventIn(seq=2, client_ts=_ts(2), type=EventType.MARKED_READY,
                     payload={"files": {}, "verify_claim": "trusted", "reflection": ""}),
    ])
    a = analysis.build_analysis(sid)

    ran = next(c for c in a.verification if c.key == "ran_tests_before_ship")
    assert ran.status == "no"
    opened = next(c for c in a.verification if c.key == "opened_helper")
    assert opened.status == "no"
    assert a.self_report.verify_claim == "trusted"


def test_claim_contradiction_flagged(store):
    # Says "ran tests" but never ran any.
    sid = _seed(store, [
        TraceEventIn(seq=1, client_ts=_ts(1), type=EventType.MARKED_READY,
                     payload={"files": {}, "verify_claim": "ran_tests", "reflection": ""}),
    ])
    a = analysis.build_analysis(sid)
    claim = next(c for c in a.verification if c.key == "claim_vs_trace")
    assert claim.status == "warn"


def test_running_code_counts_as_verification(store):
    # Ran the scratchpad (code_run) but shipped no code changes.
    sid = _seed(store, [
        TraceEventIn(seq=1, client_ts=_ts(1), type=EventType.CODE_RUN,
                     payload={"command": "run index.ts", "output_summary": "SAVE10 -> 17.9909"}),
        TraceEventIn(seq=2, client_ts=_ts(2), type=EventType.MARKED_READY,
                     payload={"files": {}, "verify_claim": "ran_tests", "reflection": ""}),
    ])
    a = analysis.build_analysis(sid)
    assert next(c for c in a.verification if c.key == "ran_code").status == "yes"
    # Running the code (with a real price) counts as noticing the float bug.
    assert next(m for m in a.moments if m.key == "float_bug").signal == "noticed"


def test_strong_session_reads_as_acted(store):
    fixed_cart = (
        'import { applyPercent, toCents } from "./money";\n'
        "export function applyDiscount(cart, code) {\n"
        "  if (!PROMOS[code]) throw new Error('bad code');\n"
        "  return applyPercent(toCents(sub), 10);\n"
        "}\n"
    )
    more_tests = (
        'import { applyDiscount } from "./cart";\n'
        'it("a", () => {}); it("b", () => {}); it("c", () => {});\n'
    )
    sid = _seed(store, [
        TraceEventIn(seq=1, client_ts=_ts(1), type=EventType.ASSESSMENT_STARTED),
        TraceEventIn(seq=2, client_ts=_ts(2), type=EventType.FILE_OPENED,
                     payload={"path": "/src/money.ts"}),
        TraceEventIn(seq=3, client_ts=_ts(3), type=EventType.FILE_OPENED,
                     payload={"path": "/src/cart.test.ts"}),
        TraceEventIn(seq=4, client_ts=_ts(4), type=EventType.AGENT_NOTE_VIEWED,
                     payload={"dwell_ms": 8000}),
        TraceEventIn(seq=5, client_ts=_ts(5), type=EventType.TEST_RUN,
                     payload={"result": {"passed": 3, "failed": 0}}),
        TraceEventIn(seq=6, client_ts=_ts(6), type=EventType.MARKED_READY,
                     payload={"files": {"/src/cart.ts": fixed_cart,
                                        "/src/cart.test.ts": more_tests},
                              "verify_claim": "ran_tests",
                              "reflection": "the discount can exceed the cart and goes free"}),
    ])
    a = analysis.build_analysis(sid)

    assert next(c for c in a.verification if c.key == "ran_tests_before_ship").status == "yes"
    assert next(c for c in a.verification if c.key == "claim_vs_trace").status == "yes"

    by_key = {m.key: m.signal for m in a.moments}
    assert by_key["float_bug"] == "acted"
    assert by_key["ignored_helper"] == "acted"
    assert by_key["false_claim"] == "acted"
    assert by_key["silent_overdiscount"] == "acted"

    # Code comparison includes the shipped cart with a real diff.
    cart = next(c for c in a.code if c.path == "src/cart.ts")
    assert "applyPercent" in cart.final
    assert cart.unified  # non-empty diff vs the agent's original


# ---- the stacking moment + Scope-moment evidence ---------------------------

def _shipped(**payload):
    base = {"files": {}, "verify_claim": "ran_tests", "reflection": ""}
    base.update(payload)
    return [TraceEventIn(seq=1, client_ts=_ts(1), type=EventType.MARKED_READY, payload=base)]


def test_stacking_surfaced_in_team_summary(store):
    sid = _seed(store, _shipped(
        team_summary="Should multiple codes stack? No precedence/order rule is defined.",
    ))
    by = {m.key: m.signal for m in analysis.build_analysis(sid).moments}
    assert by["silent_stacking"] == "noticed"


def test_stacking_missed_when_unmentioned(store):
    sid = _seed(store, _shipped(team_summary="Looks good, shipping it."))
    by = {m.key: m.signal for m in analysis.build_analysis(sid).moments}
    assert by["silent_stacking"] == "missed"


def test_scope_moments_are_independent(store):
    # A stacking-only summary must NOT trip over-discount...
    sid = _seed(store, _shipped(
        team_summary="The codes combine with no defined precedence — should they stack at all?",
    ))
    by = {m.key: m.signal for m in analysis.build_analysis(sid).moments}
    assert by["silent_stacking"] == "noticed"
    assert by["silent_overdiscount"] != "acted"

    # ...and an over-discount-only summary must NOT trip stacking.
    sid2 = _seed(store, _shipped(
        team_summary="If the discount exceeds the cart the customer gets it free — intended?",
    ))
    by2 = {m.key: m.signal for m in analysis.build_analysis(sid2).moments}
    assert by2["silent_overdiscount"] == "acted"
    assert by2["silent_stacking"] == "missed"


def test_overdiscount_reads_team_summary(store):
    # The Scope moment's primary evidence is the team summary (reflection empty).
    sid = _seed(store, _shipped(
        team_summary="A $20 code on a $15 cart silently caps at $0 — is free intended?",
    ))
    by = {m.key: m.signal for m in analysis.build_analysis(sid).moments}
    assert by["silent_overdiscount"] == "acted"


# ---- self-report + comparison surfacing of the submit decision -------------

def test_code_run_detail_uses_output_field(store):
    sid = _seed(store, [
        TraceEventIn(seq=1, client_ts=_ts(1), type=EventType.CODE_RUN,
                     payload={"command": "run index.ts",
                              "source": "console.log(applyDiscount(c, ['SAVE10']))",
                              "output": "SAVE10 -> 17.990999999999996",
                              "truncated": False}),
        TraceEventIn(seq=2, client_ts=_ts(2), type=EventType.MARKED_READY,
                     payload={"files": {}, "verify_claim": "ran_tests", "reflection": ""}),
    ])
    chk = next(c for c in analysis.build_analysis(sid).verification if c.key == "ran_code")
    assert chk.status == "yes"
    assert "17.99" in chk.detail


def test_self_report_includes_decision(store):
    sid = _seed(store, _shipped(
        decision="block", confidence="low", team_summary="not ready — float math is wrong",
    ))
    sr = analysis.build_analysis(sid).self_report
    assert sr.decision == "block"
    assert sr.decision_label == "Block — not ready"
    assert sr.confidence == "low"
    assert sr.team_summary == "not ready — float math is wrong"


def test_comparison_carries_submit_fields(store):
    _seed(store, _shipped(decision="ship", confidence="medium", team_summary="ship it"))
    rows = analysis.build_comparison()
    assert rows[0].decision == "ship"
    assert rows[0].decision_label == "Ship it"
    assert rows[0].confidence == "medium"
    assert rows[0].team_summary == "ship it"
