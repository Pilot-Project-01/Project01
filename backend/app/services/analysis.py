"""Scoring aids for the dashboard.

Everything here is a HEURISTIC HINT derived from the trace + the shipped code,
to speed up the human scorer — NOT an automated grade (v1 scoring is manual).
The detectors are specific to the single calibrated task (v1-cart-discount) and
mirror the five moments in tasks/ANSWER_KEY.md.
"""

import difflib

from app.core.events import EventType
from app.models.trace import (
    CodeComparison,
    ComparisonRow,
    MomentSignal,
    SelfReport,
    SessionAnalysis,
    VerificationCheck,
)
from app.services import task_loader, trace_store
from app.services.trace_store import SessionNotFoundError  # re-exported for the route

__all__ = ["build_analysis", "build_comparison", "SessionNotFoundError"]

VERIFY_CLAIM_LABELS = {
    "ran_tests": "Ran the tests myself",
    "read_not_run": "Read the tests but didn't run them",
    "trusted": "Trusted the agent's note",
}

DECISION_LABELS = {
    "ship": "Ship it",
    "ship_with_caveats": "Ship with caveats",
    "block": "Block — not ready",
}


def _norm(path: str) -> str:
    return path.lstrip("/")


def build_comparison() -> list[ComparisonRow]:
    """Compact scoring profile for every session, newest first — for the
    side-by-side compare view. Reuses the same (tested) analysis logic."""
    rows: list[ComparisonRow] = []
    for s in trace_store.list_sessions():
        a = build_analysis(s.id)
        rows.append(ComparisonRow(
            id=a.session.id,
            candidate_name=a.session.candidate_name,
            status=a.session.status,
            created_at=a.session.created_at,
            verify_claim_label=a.self_report.verify_claim_label,
            reflection=a.self_report.reflection,
            decision=a.self_report.decision,
            decision_label=a.self_report.decision_label,
            confidence=a.self_report.confidence,
            team_summary=a.self_report.team_summary,
            verification=a.verification,
            moments=a.moments,
        ))
    return rows


def build_analysis(session_id: str) -> SessionAnalysis:
    export = trace_store.export_trace(session_id)  # raises SessionNotFoundError
    session = export.session
    events = export.events

    task = task_loader.load_task(session.task_id)
    original = {_norm(p): c for p, c in task.files.items()}
    final = {_norm(p): c for p, c in (session.final_files or {}).items()}

    ship = next((e for e in events if e.type == EventType.MARKED_READY), None)
    ship_seq = ship.seq if ship else None

    return SessionAnalysis(
        session=session,
        verification=_verification(events, ship, ship_seq),
        moments=_moments(events, original, final, ship),
        code=_code(original, final),
        self_report=_self_report(ship),
    )


# ---- verification panel ----------------------------------------------------

def _first(events, type_, before_seq=None):
    for e in events:
        if e.type == type_ and (before_seq is None or e.seq < before_seq):
            return e
    return None


def _opened(events, needle: str):
    return next(
        (e for e in events
         if e.type == EventType.FILE_OPENED and needle in str(e.payload.get("path", ""))),
        None,
    )


def _verification(events, ship, ship_seq) -> list[VerificationCheck]:
    checks: list[VerificationCheck] = []

    test_run = _first(events, EventType.TEST_RUN, before_seq=ship_seq)
    checks.append(VerificationCheck(
        key="ran_tests_before_ship",
        label="Ran tests before shipping",
        status="yes" if test_run else "no",
        detail="" if test_run else "no test run recorded before the ship decision",
        evidence_seq=test_run.seq if test_run else None,
    ))

    code_run = _first(events, EventType.CODE_RUN, before_seq=ship_seq)
    checks.append(VerificationCheck(
        key="ran_code",
        label="Ran the code in the scratchpad",
        status="yes" if code_run else "no",
        detail=str(code_run.payload.get("output", ""))[:120] if code_run else "",
        evidence_seq=code_run.seq if code_run else None,
    ))

    helper = _opened(events, "money.ts")
    checks.append(VerificationCheck(
        key="opened_helper",
        label="Opened money.ts (the helper the agent ignored)",
        status="yes" if helper else "no",
        evidence_seq=helper.seq if helper else None,
    ))

    test_file = _opened(events, "cart.test.ts")
    checks.append(VerificationCheck(
        key="opened_test_file",
        label="Opened the test file",
        status="yes" if test_file else "no",
        evidence_seq=test_file.seq if test_file else None,
    ))

    dwell = sum(
        int(e.payload.get("dwell_ms", 0))
        for e in events if e.type == EventType.AGENT_NOTE_VIEWED
    )
    checks.append(VerificationCheck(
        key="read_agent_note",
        label="Read the agent note",
        status="yes" if dwell >= 3000 else ("warn" if dwell > 0 else "no"),
        detail=f"{dwell / 1000:.1f}s total dwell" if dwell else "never viewed",
    ))

    claim = (ship.payload.get("verify_claim") if ship else None)
    ran = any(e.type == EventType.TEST_RUN for e in events)
    contradiction = claim == "ran_tests" and not ran
    checks.append(VerificationCheck(
        key="claim_vs_trace",
        label="Self-report matches the trace",
        status="warn" if contradiction else "yes",
        detail=("claims they ran the tests, but no test run is recorded"
                if contradiction else ""),
        evidence_seq=ship_seq if contradiction else None,
    ))

    return checks


# ---- per-moment hints ------------------------------------------------------

def _moments(events, original, final, ship) -> list[MomentSignal]:
    cart = final.get("src/cart.ts", "")
    test = final.get("src/cart.test.ts", "")
    orig_cart = original.get("src/cart.ts", "")
    orig_test = original.get("src/cart.test.ts", "")
    reflection = (ship.payload.get("reflection", "") if ship else "") or ""
    team_summary = (ship.payload.get("team_summary", "") if ship else "") or ""
    # The two Scope moments rarely show up in the action trace, so their primary
    # evidence is the free text — the team summary first, the reflection second.
    scope_text = f"{team_summary}\n{reflection}".lower()
    scope_has_text = bool(team_summary.strip() or reflection.strip())

    opened_money = bool(_opened(events, "money.ts"))
    opened_test = bool(_opened(events, "cart.test.ts"))
    uses_helper = any(h in cart for h in ("applyPercent", "toCents", "formatPrice", "./money"))
    ran_tests = any(e.type == EventType.TEST_RUN for e in events)
    ran_code = any(e.type == EventType.CODE_RUN for e in events)

    moments: list[MomentSignal] = []

    # 1. Float-money bug
    if uses_helper or "Math.round" in cart:
        s, ev = "acted", "shipped code routes money math through helpers / rounding"
    elif opened_money or ran_tests or ran_code:
        s, ev = "noticed", "explored (opened money.ts, ran tests, or ran the code) but didn't change the math"
    else:
        s, ev = "missed", "no sign they examined or fixed the float math"
    moments.append(MomentSignal(key="float_bug", title="The float-money bug", signal=s, evidence=ev))

    # 2. Ignored money.ts helper
    if uses_helper:
        s, ev = "acted", "shipped code uses the money.ts helpers"
    elif opened_money:
        s, ev = "noticed", "opened money.ts but the shipped code still doesn't use it"
    else:
        s, ev = "missed", "never opened money.ts; shipped code doesn't use it"
    moments.append(MomentSignal(key="ignored_helper", title="Ignored money.ts (wrong shape)", signal=s, evidence=ev))

    # 3. False "validated & tested" claim
    added_tests = _count(test, "it(") + _count(test, "test(") > _count(orig_test, "it(") + _count(orig_test, "test(")
    handles_invalid = "throw" in cart and cart != orig_cart
    if added_tests or handles_invalid:
        s, ev = "acted", "added tests and/or made invalid codes error"
    elif opened_test:
        s, ev = "noticed", "opened the test file but didn't extend coverage"
    else:
        s, ev = "missed", "trusted 'validated and tested' without checking"
    moments.append(MomentSignal(key="false_claim", title="False 'I tested it' claim", signal=s, evidence=ev))

    # 4. Input mutation
    mutates_orig = "cart.total" in orig_cart and "=" in orig_cart
    still_mutates = "cart.total =" in cart or "cart.total=" in cart
    if mutates_orig and not still_mutates:
        s, ev = "acted", "removed the cart.total mutation"
    elif still_mutates:
        s, ev = "missed", "shipped code still mutates the input cart (cart.total = ...)"
    else:
        s, ev = "noticed", "mutation no longer present, but origin unclear"
    moments.append(MomentSignal(key="input_mutation", title="Mutates the input cart (dangerous shortcut)", signal=s, evidence=ev))

    # 5. Silent over-discount (free-text-dependent moment)
    over_hit = any(k in scope_text for k in (
        "exceed", "free", "negative", "more than", "over", "cap", "greater"))
    code_hit = ("throw" in cart and "0" in cart and cart != orig_cart)
    if over_hit or code_hit:
        s, ev = "acted", "surfaced the over-discount decision (in the team summary, reflection, or code)"
    elif scope_has_text:
        s, ev = "noticed", "wrote free text, but didn't clearly flag the over-discount case"
    else:
        s, ev = "missed", "no sign they noticed the silent $0 cap"
    moments.append(MomentSignal(key="silent_overdiscount", title="Silent over-discount cap (judgment)", signal=s, evidence=ev))

    # 6. Silent stacking decision (free-text-dependent moment). The agent combines
    # all promo codes additively with no precedence/order rule; the question is
    # whether the candidate surfaces that this product rule was never specified.
    # Heuristic stops at "noticed" — whether they *proposed a rule* (ladder 2) is
    # a manual call. Kept independent of the over-discount cap above.
    stacking_hit = any(k in scope_text for k in (
        "stack", "combine", "multiple code", "multiple promo", "more than one",
        "precedence", "order", "both codes", "two codes", "additive"))
    if stacking_hit:
        s, ev = "noticed", "free text raises combining/precedence of multiple codes (manual: did they propose a rule?)"
    else:
        s, ev = "missed", "no sign they flagged that stacking multiple codes is unspecified"
    moments.append(MomentSignal(key="silent_stacking", title="Silent stacking decision (judgment)", signal=s, evidence=ev))

    return moments


def _count(s: str, needle: str) -> int:
    return s.count(needle)


# ---- code comparison -------------------------------------------------------

def _code(original, final) -> list[CodeComparison]:
    out: list[CodeComparison] = []
    for path in sorted(set(original) | set(final)):
        o, f = original.get(path, ""), final.get(path, "")
        if not f:
            continue  # no shipped snapshot for this file (e.g. timed out)
        unified = "".join(difflib.unified_diff(
            o.splitlines(keepends=True),
            f.splitlines(keepends=True),
            fromfile=f"{path} (agent)",
            tofile=f"{path} (shipped)",
        ))
        out.append(CodeComparison(path=path, original=o, final=f, unified=unified))
    return out


# ---- self report -----------------------------------------------------------

def _self_report(ship) -> SelfReport:
    if not ship:
        return SelfReport()
    claim = ship.payload.get("verify_claim")
    decision = ship.payload.get("decision")
    return SelfReport(
        verify_claim=claim,
        verify_claim_label=VERIFY_CLAIM_LABELS.get(claim, ""),
        reflection=ship.payload.get("reflection", "") or "",
        decision=decision,
        decision_label=DECISION_LABELS.get(decision, ""),
        confidence=ship.payload.get("confidence"),
        team_summary=ship.payload.get("team_summary", "") or "",
    )
