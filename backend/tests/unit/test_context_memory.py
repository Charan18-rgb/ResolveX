"""
Unit and API tests for Feature 8: Context Memory & Conversation Intelligence.
Verifies entity tracking with source attribution, pronoun/ordinal resolution,
conflicting reference detection, and strict session isolation (no leakage).
"""

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import pytest

from app.core.context_analyzer import (
    build_session_memory_bundle,
    extract_entities_from_text,
    resolve_session_references,
)
from app.database.connection import init_db
from app.main import create_app
from app.models.ai_schemas import GeminiAnalysisOutput, ResolvedIntentOutput
from app.services.conversation_service import continue_conversation, start_conversation


def test_extracts_people_objects_dates_actions_with_source_message() -> None:
    msg = "Send Q3_Finance_Report.pdf and Budget_2026.xlsx to Rahul Sharma by tomorrow."
    entities = extract_entities_from_text("sess-1", msg, turn_number=1, source_role="user")

    categories = {e.category for e in entities}
    values = {e.value for e in entities}

    assert {"person", "object", "date", "action"}.issubset(categories)
    assert "Rahul Sharma" in values
    assert "Q3_Finance_Report.pdf" in values
    assert "Budget_2026.xlsx" in values
    assert "tomorrow" in values
    assert "send" in values
    assert all(e.source_message == msg and e.source_turn == 1 for e in entities)


def test_resolves_pronoun_and_ordinal_from_prior_session_messages() -> None:
    msg1 = "Review Q3_Finance_Report.pdf and Budget_2026.xlsx with Rahul Sharma tomorrow."
    prior_entities = extract_entities_from_text("sess-2", msg1, turn_number=1, source_role="user")

    resolved, conflicts = resolve_session_references(
        "Email him the second one.", prior_entities
    )
    assert conflicts == []
    by_token = {r.reference_token: r for r in resolved}
    assert by_token["him"].status == "resolved"
    assert by_token["him"].resolved_value == "Rahul Sharma"
    assert by_token["him"].source_message == msg1
    assert by_token["the second one"].status == "resolved"
    assert by_token["the second one"].resolved_value == "Budget_2026.xlsx"


def test_detects_conflicting_references_when_multiple_candidates_exist() -> None:
    entities_t1 = extract_entities_from_text(
        "sess-3",
        "Share Q3_Finance_Report.pdf with Rahul Sharma today.",
        turn_number=1,
        source_role="user",
    )
    entities_t2 = extract_entities_from_text(
        "sess-3",
        "Also include Rahul Verma and Budget_2026.xlsx.",
        turn_number=2,
        source_role="user",
    )

    resolved, conflicts = resolve_session_references(
        "Send that file to him immediately.",
        entities_t1 + entities_t2,
    )
    assert len(conflicts) == 2
    tokens = {c.reference_token for c in conflicts}
    assert {"him", "that file"} == tokens
    assert all(c.status == "conflicting" and c.clarification_question for c in conflicts)


def test_strict_session_isolation_prevents_memory_leakage(tmp_path: Path) -> None:
    db_path = str(tmp_path / "memory_isolation.db")
    init_db(db_path)

    mock_clear = GeminiAnalysisOutput(
        classification="clear",
        ambiguity_types=[],
        needs_clarification=False,
        reasoning="Clear request.",
        interpretations=[],
        missing_required_info=[],
        clarification_questions=[],
        resolved_intent=ResolvedIntentOutput(
            action="send_document",
            parameters={"recipient": "Rahul Sharma", "document": "Q3_Finance_Report.pdf"},
            resolved_instruction="Send Q3_Finance_Report.pdf to Rahul Sharma.",
        ),
    )

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(mock_clear, None),
    ):
        sess_a = start_conversation(
            db_path, "Send Q3_Finance_Report.pdf to Rahul Sharma tomorrow."
        )
        # Separate Session B must NOT inherit Rahul Sharma or Q3_Finance_Report.pdf from Session A
        sess_b = start_conversation(db_path, "Email that file to him now.")

    assert sess_a.context_memory is not None
    assert any(e.value == "Rahul Sharma" for e in sess_a.context_memory.entities)

    assert sess_b.context_memory is not None
    assert not any(e.value == "Rahul Sharma" for e in sess_b.context_memory.entities)
    assert len(sess_b.context_memory.reference_conflicts) >= 2
    assert sess_b.status == "NEEDS_CLARIFICATION"
    assert sess_b.needs_clarification is True


def test_context_memory_returned_across_analyze_clarify_and_conversations_api(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "memory_api.db"))
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            t1_ai = GeminiAnalysisOutput(
                classification="ambiguous",
                ambiguity_types=["underspecification"],
                needs_clarification=True,
                reasoning="Need action timing.",
                interpretations=[],
                missing_required_info=["Execution time"],
                clarification_questions=["When should Q3_Finance_Report.pdf be sent to Rahul Sharma?"],
            )
            t2_ai = GeminiAnalysisOutput(
                classification="context_dependent",
                ambiguity_types=[],
                needs_clarification=False,
                reasoning="Resolved via session memory.",
                interpretations=[],
                missing_required_info=[],
                clarification_questions=[],
                resolved_intent=ResolvedIntentOutput(
                    action="send_document",
                    parameters={"recipient": "Rahul Sharma", "document": "Q3_Finance_Report.pdf"},
                    resolved_instruction="Send Q3_Finance_Report.pdf to Rahul Sharma tomorrow.",
                ),
            )

            with patch(
                "app.services.gemini_service.call_gemini_structured",
                return_value=(t1_ai, None),
            ):
                r1 = client.post(
                    "/api/analyze",
                    json={"instruction": "Prepare Q3_Finance_Report.pdf for Rahul Sharma."},
                )
            assert r1.status_code == 201
            d1 = r1.json()
            conv_id = d1["conversation_id"]
            assert d1["context_memory"]["session_id"] == conv_id
            assert any(e["value"] == "Rahul Sharma" for e in d1["context_memory"]["entities"])

            with patch(
                "app.services.gemini_service.call_gemini_structured",
                return_value=(t2_ai, None),
            ):
                r2 = client.post(
                    "/api/clarify",
                    json={
                        "conversation_id": conv_id,
                        "response": "Send that file to him tomorrow.",
                    },
                )
            assert r2.status_code == 200
            d2 = r2.json()
            resolved_tokens = {
                r["reference_token"]: r["resolved_value"]
                for r in d2["context_memory"]["resolved_references"]
            }
            assert resolved_tokens["him"] == "Rahul Sharma"
            assert resolved_tokens["that file"] == "Q3_Finance_Report.pdf"

            detail = client.get(f"/api/conversations?conversation_id={conv_id}")
            assert detail.status_code == 200
            assert len(detail.json()["context_memory"]["entities"]) >= 3
    finally:
        get_settings.cache_clear()
