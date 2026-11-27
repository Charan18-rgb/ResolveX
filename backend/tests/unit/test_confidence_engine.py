"""
Unit and API integration tests for Feature 6:
Confidence & Uncertainty Intelligence Engine.
"""

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import pytest

from app.database.connection import init_db
from app.main import create_app
from app.models.ai_schemas import (
    GeminiAnalysisOutput,
    InterpretationOutput,
    ResolvedIntentOutput,
)
from app.services.conversation_service import (
    continue_conversation,
    get_resolved_intent,
    start_conversation,
)


def _clear_analysis() -> GeminiAnalysisOutput:
    return GeminiAnalysisOutput(
        classification="clear",
        ambiguity_types=[],
        needs_clarification=False,
        reasoning="All entities and targets are explicitly specified.",
        interpretations=[
            InterpretationOutput(
                label="Email Q3 Finance Report",
                description="Send Q3_Finance_Report.pdf to rahul.sharma@acme.com today.",
            )
        ],
        missing_required_info=[],
        clarification_questions=[],
        resolved_intent=ResolvedIntentOutput(
            action="send_document",
            parameters={
                "recipient": "rahul.sharma@acme.com",
                "document": "Q3 Finance Report",
                "deadline": "2026-11-27",
            },
            resolved_instruction="Send Q3 Finance Report to rahul.sharma@acme.com on 2026-11-27.",
        ),
    )


def _ambiguous_analysis() -> GeminiAnalysisOutput:
    return GeminiAnalysisOutput(
        classification="ambiguous",
        ambiguity_types=["referential", "contextual"],
        needs_clarification=True,
        reasoning="Pronoun 'it' and person 'Rahul' have multiple valid targets.",
        interpretations=[
            InterpretationOutput(
                label="Finance Q3 to Rahul Sharma",
                description="Send the Q3 Finance summary to Rahul Sharma.",
            ),
            InterpretationOutput(
                label="Engineering Sprint Notes to Rahul Verma",
                description="Forward sprint notes to Rahul Verma.",
            ),
        ],
        missing_required_info=["Target document artifact"],
        clarification_questions=["Which Rahul and which document should be sent?"],
        resolved_intent=None,
    )


def _insufficient_evidence_analysis() -> GeminiAnalysisOutput:
    return GeminiAnalysisOutput(
        classification="incomplete",
        ambiguity_types=["referential", "underspecification"],
        needs_clarification=True,
        reasoning="Minimal input omits actor, target, and schedule.",
        interpretations=[
            InterpretationOutput(label="Update API", description="Modify backend service."),
            InterpretationOutput(label="Update UI", description="Modify frontend view."),
        ],
        missing_required_info=["Target system component", "Execution window", "Owner"],
        clarification_questions=[
            "Which system should be changed?",
            "When should this happen?",
        ],
        resolved_intent=None,
    )


def _resolved_after_clarify() -> GeminiAnalysisOutput:
    return GeminiAnalysisOutput(
        classification="context_dependent",
        ambiguity_types=[],
        needs_clarification=False,
        reasoning="Clarification resolved the document and recipient.",
        interpretations=[
            InterpretationOutput(
                label="Finance Q3 to Rahul Sharma",
                description="Send Q3_Finance_Report.pdf to rahul.sharma@acme.com.",
            )
        ],
        missing_required_info=[],
        clarification_questions=[],
        resolved_intent=ResolvedIntentOutput(
            action="send_document",
            parameters={
                "recipient": "rahul.sharma@acme.com",
                "document": "Q3 Finance Report",
            },
            resolved_instruction="Send Q3 Finance Report to rahul.sharma@acme.com.",
        ),
    )


def test_clear_instruction_has_calibrated_verified_confidence(tmp_path: Path) -> None:
    db_path = str(tmp_path / "conf_clear.db")
    init_db(db_path)

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(_clear_analysis(), None),
    ):
        resp = start_conversation(
            db_path,
            "Send Q3 Finance Report to rahul.sharma@acme.com by 2026-11-27.",
        )

    assert resp.status == "RESOLVED"
    assert resp.confidence_assessment is not None
    conf = resp.confidence_assessment
    assert conf.provenance == "live_backend"
    assert conf.model_confidence_available is False
    assert conf.abstained is False
    assert conf.confidence_score is not None and conf.confidence_score >= 0.78
    assert conf.verified_correctness == "verified"
    assert conf.recommended_action == "proceed_verified"
    assert len(conf.supporting_evidence) >= 2
    assert len(conf.contradicting_evidence) == 0
    assert len(resp.confidence_history) == 1
    assert resp.interpretations[0].confidence_status == "calibrated"
    assert resp.interpretations[0].confidence_score is not None


def test_ambiguous_input_distinguishes_confidence_from_verified_correctness(
    tmp_path: Path,
) -> None:
    db_path = str(tmp_path / "conf_ambig.db")
    init_db(db_path)

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(_ambiguous_analysis(), None),
    ):
        resp = start_conversation(db_path, "Send it to Rahul for Q3 review.")

    conf = resp.confidence_assessment
    assert conf is not None
    assert conf.abstained is False
    assert conf.confidence_score is not None and conf.confidence_score <= 0.72
    # Confidence may be moderate, yet correctness MUST remain unverified
    assert conf.verified_correctness == "unverified"
    assert conf.recommended_action == "request_clarification"
    assert any(not ent.resolved for ent in conf.unresolved_entities)
    assert len(conf.missing_context) >= 1
    assert all(
        item.confidence_status == "calibrated" and item.confidence_score is not None
        for item in resp.interpretations
    )


def test_insufficient_evidence_triggers_abstention(tmp_path: Path) -> None:
    db_path = str(tmp_path / "conf_abstain.db")
    init_db(db_path)

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(_insufficient_evidence_analysis(), None),
    ):
        resp = start_conversation(db_path, "Fix it soon")

    conf = resp.confidence_assessment
    assert conf is not None
    assert conf.abstained is True
    assert conf.confidence_score is None
    assert conf.confidence_band == "abstained"
    assert conf.abstention_reason is not None
    assert conf.verified_correctness == "unverified"
    assert all(item.confidence_status == "abstained" and item.confidence_score is None for item in resp.interpretations)


def test_ai_fallback_abstains_without_fabricating_confidence(tmp_path: Path) -> None:
    db_path = str(tmp_path / "conf_fallback.db")
    init_db(db_path)

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(None, "GEMINI_API_KEY is not configured."),
    ):
        resp = start_conversation(db_path, "Deploy the update")

    conf = resp.confidence_assessment
    assert conf is not None
    assert conf.provenance == "ai_unavailable_abstained"
    assert conf.abstained is True
    assert conf.confidence_score is None
    assert any(ev.source == "fallback_guard" for ev in conf.contradicting_evidence)


def test_contradictory_clarification_drops_and_flags_contradiction(tmp_path: Path) -> None:
    db_path = str(tmp_path / "conf_contra.db")
    init_db(db_path)

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(_ambiguous_analysis(), None),
    ):
        turn1 = start_conversation(db_path, "Deploy it to staging environment immediately.")

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(_ambiguous_analysis(), None),
    ):
        turn2 = continue_conversation(
            db_path,
            turn1.conversation_id,
            "Actually neither — deploy to production next week instead.",
        )

    conf = turn2.confidence_assessment
    assert conf is not None
    assert conf.verified_correctness == "contradictory"
    assert conf.abstained is True
    assert conf.recommended_action == "resolve_conflicts"
    assert len(conf.contradicting_evidence) >= 1
    assert len(turn2.confidence_history) == 2
    assert turn2.confidence_history[1].abstained is True


def test_confidence_increases_across_clarification_turns_via_existing_api(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "conf_api.db"))
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            with patch(
                "app.services.gemini_service.call_gemini_structured",
                return_value=(_ambiguous_analysis(), None),
            ):
                r1 = client.post(
                    "/api/analyze",
                    json={"instruction": "Send the Q3 file to Rahul soon."},
                )
            assert r1.status_code == 201
            d1 = r1.json()
            conv_id = d1["conversation_id"]
            score_t1 = d1["confidence_assessment"]["confidence_score"]
            assert d1["confidence_assessment"]["verified_correctness"] == "unverified"

            with patch(
                "app.services.gemini_service.call_gemini_structured",
                return_value=(_resolved_after_clarify(), None),
            ):
                r2 = client.post(
                    "/api/clarify",
                    json={
                        "conversation_id": conv_id,
                        "response": "Send Q3 Finance Report to rahul.sharma@acme.com today.",
                    },
                )
            assert r2.status_code == 200
            d2 = r2.json()
            score_t2 = d2["confidence_assessment"]["confidence_score"]
            assert d2["status"] == "RESOLVED"
            assert score_t1 is not None and score_t2 is not None
            assert score_t2 > score_t1
            assert d2["confidence_assessment"]["verified_correctness"] == "verified"
            assert len(d2["confidence_history"]) == 2
            assert d2["confidence_history"][1]["delta_from_previous"] > 0

            r3 = client.post("/api/resolve", json={"conversation_id": conv_id})
            assert r3.status_code == 200
            assert len(r3.json()["confidence_history"]) == 2

            r_detail = client.get(f"/api/conversations?conversation_id={conv_id}")
            assert r_detail.status_code == 200
            assert len(r_detail.json()["confidence_history"]) == 2
    finally:
        get_settings.cache_clear()
