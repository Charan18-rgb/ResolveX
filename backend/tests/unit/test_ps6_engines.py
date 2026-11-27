"""
PS6 unit tests — ambiguity detection, clarification, and intent resolution.
All Gemini calls are mocked; no live API key required.
"""

import tempfile
import os
from unittest.mock import patch, MagicMock

import pytest

from app.database.connection import init_db
from app.models.ai_schemas import (
    GeminiAnalysisOutput,
    InterpretationOutput,
    ResolvedIntentOutput,
)
from app.core.clarification_engine import filter_new_questions, enforce_max_turns, normalize_questions
from app.core.intent_resolver import validate_resolved_intent, build_fallback_resolved_intent
from app.core.task_router import classify_intent_domain
from app.services.conversation_service import start_conversation, continue_conversation


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tmp_db() -> str:
    """Create and initialize a fresh temporary SQLite database."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    return path


def _make_clear_analysis() -> GeminiAnalysisOutput:
    return GeminiAnalysisOutput(
        classification="clear",
        ambiguity_types=[],
        needs_clarification=False,
        reasoning="Instruction is unambiguous.",
        interpretations=[],
        missing_required_info=[],
        clarification_questions=[],
        resolved_intent=ResolvedIntentOutput(
            action="send_document",
            parameters={"recipient": "Rahul Sharma", "document": "Q3 Report"},
            resolved_instruction="Send the Q3 Report to Rahul Sharma.",
            direct_answer=None,
        ),
    )


def _make_ambiguous_analysis() -> GeminiAnalysisOutput:
    return GeminiAnalysisOutput(
        classification="ambiguous",
        ambiguity_types=["referential"],
        needs_clarification=True,
        reasoning="Multiple people named Rahul exist.",
        interpretations=[
            InterpretationOutput(label="Rahul Sharma", description="The marketing Rahul."),
            InterpretationOutput(label="Rahul Verma", description="The engineering Rahul."),
        ],
        missing_required_info=[],
        clarification_questions=["Which Rahul do you mean — Rahul Sharma or Rahul Verma?"],
        resolved_intent=None,
    )


def _make_resolved_analysis() -> GeminiAnalysisOutput:
    return GeminiAnalysisOutput(
        classification="context_dependent",
        ambiguity_types=[],
        needs_clarification=False,
        reasoning="User clarified recipient.",
        interpretations=[],
        missing_required_info=[],
        clarification_questions=[],
        resolved_intent=ResolvedIntentOutput(
            action="send_document",
            parameters={"recipient": "Rahul Sharma"},
            resolved_instruction="Send the report to Rahul Sharma.",
            direct_answer=None,
        ),
    )


# ---------------------------------------------------------------------------
# 1. Clear instruction fast-path: no clarification questions returned
# ---------------------------------------------------------------------------

def test_clear_instruction_resolves_immediately():
    db_path = _tmp_db()
    mock_result = _make_clear_analysis()

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(mock_result, None),
    ):
        response = start_conversation(db_path, "Send the Q3 Report to Rahul Sharma.")

    assert response.status == "RESOLVED"
    assert response.needs_clarification is False
    assert response.clarification_questions == []
    assert response.resolved_intent is not None
    assert response.resolved_intent.action == "send_document"


# ---------------------------------------------------------------------------
# 2. Ambiguous instruction returns interpretations and questions
# ---------------------------------------------------------------------------

def test_ambiguous_instruction_returns_questions():
    db_path = _tmp_db()
    mock_result = _make_ambiguous_analysis()

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(mock_result, None),
    ):
        response = start_conversation(db_path, "Send the report to Rahul.")

    assert response.status == "NEEDS_CLARIFICATION"
    assert response.needs_clarification is True
    assert len(response.clarification_questions) >= 1
    assert len(response.interpretations) == 2
    assert response.classification == "ambiguous"


# ---------------------------------------------------------------------------
# 3. Clarification continuation resolves on second turn
# ---------------------------------------------------------------------------

def test_clarification_continuation_resolves():
    db_path = _tmp_db()
    ambiguous = _make_ambiguous_analysis()
    resolved = _make_resolved_analysis()

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(ambiguous, None),
    ):
        first = start_conversation(db_path, "Send the report to Rahul.")

    assert first.status == "NEEDS_CLARIFICATION"

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(resolved, None),
    ):
        second = continue_conversation(
            db_path, first.conversation_id, "I mean Rahul Sharma."
        )

    assert second.status == "RESOLVED"
    assert second.resolved_intent is not None
    assert "Rahul Sharma" in second.resolved_intent.resolved_instruction


# ---------------------------------------------------------------------------
# 4. validate_resolved_intent rejects placeholder values
# ---------------------------------------------------------------------------

def test_validate_resolved_intent_rejects_placeholders():
    bad_intent = ResolvedIntentOutput(
        action="TBD",
        parameters={},
        resolved_instruction="UNKNOWN",
        direct_answer=None,
    )
    valid, reason = validate_resolved_intent(bad_intent)
    assert valid is False
    assert "placeholder" in reason.lower()


def test_validate_resolved_intent_accepts_valid():
    good_intent = ResolvedIntentOutput(
        action="book_table",
        parameters={"restaurant": "The Grand", "party_size": 4},
        resolved_instruction="Book a table for 4 at The Grand for tomorrow evening.",
        direct_answer=None,
    )
    valid, reason = validate_resolved_intent(good_intent)
    assert valid is True
    assert reason == ""


# ---------------------------------------------------------------------------
# 5. Clarification engine: deduplication and turn limit
# ---------------------------------------------------------------------------

def test_filter_new_questions_deduplicates():
    already = normalize_questions(["Which Rahul do you mean?"])
    proposed = [
        "Which Rahul do you mean?",        # duplicate (should be filtered)
        "What document should be sent?",   # new
    ]
    result = filter_new_questions(proposed, already)
    assert len(result) == 1
    assert "document" in result[0].lower()


def test_enforce_max_turns_triggers_at_limit():
    assert enforce_max_turns(3) is True   # at limit
    assert enforce_max_turns(4) is True   # past limit
    assert enforce_max_turns(2) is False  # under limit


# ---------------------------------------------------------------------------
# 6. Task router classifies inventory vs general correctly
# ---------------------------------------------------------------------------

def test_classify_intent_domain_inventory():
    intent = ResolvedIntentOutput(
        action="check_inventory",
        parameters={},
        resolved_instruction="Check current stock levels for MAT-STEEL.",
    )
    assert classify_intent_domain(intent) == "inventory"


def test_classify_intent_domain_general():
    intent = ResolvedIntentOutput(
        action="send_email",
        parameters={"recipient": "alice@example.com"},
        resolved_instruction="Send an email to Alice.",
    )
    assert classify_intent_domain(intent) == "general"


# ---------------------------------------------------------------------------
# 7. Gemini fallback when API key is missing
# ---------------------------------------------------------------------------

def test_gemini_fallback_when_unavailable():
    db_path = _tmp_db()

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(None, "GEMINI_API_KEY is not configured."),
    ):
        response = start_conversation(db_path, "What is the status of my order?")

    # Fallback returns ambiguous — conversation is non-broken
    assert response.status in ("NEEDS_CLARIFICATION", "RESOLVED", "ANALYZING")
    assert response.conversation_id is not None
