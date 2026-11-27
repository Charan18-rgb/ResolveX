"""Milestone 2 tests: configuration hardening, SQLite WAL/FK, and CRUD persistence."""

from pathlib import Path
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.database.connection import get_connection, init_db
from app.database.operations import (
    DatabaseOperationError,
    add_clarification_questions,
    add_interpretations,
    add_message,
    create_conversation,
    get_asked_questions,
    get_conversation,
    get_latest_evaluation_record,
    get_messages,
    get_resolved_intent,
    list_conversations,
    mark_questions_answered,
    save_evaluation_record,
    save_resolved_intent,
    update_conversation_state,
)


def test_config_rejects_blank_required_fields() -> None:
    """Blank gemini_model or database_path must raise a validation error."""
    with pytest.raises(ValidationError):
        Settings(_env_file=None, gemini_model="   ")

    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_path=" ")


def test_require_gemini_api_key_behaviour() -> None:
    """require_gemini_api_key raises clear error when missing/placeholder, returns key when set."""
    missing = Settings(_env_file=None, gemini_api_key="")
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        missing.require_gemini_api_key()

    placeholder = Settings(_env_file=None, gemini_api_key="your_gemini_api_key_here")
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        placeholder.require_gemini_api_key()

    configured = Settings(_env_file=None, gemini_api_key="test-key-123", gemini_model="gemini-3.8-flash")
    assert configured.require_gemini_api_key() == "test-key-123"
    assert configured.gemini_model == "gemini-3.8-flash"


def test_init_db_idempotent_and_wal_mode(tmp_path: Path) -> None:
    """Calling init_db twice preserves data and configures WAL mode."""
    db_path = str(tmp_path / "hardened.db")
    init_db(db_path)

    create_conversation(db_path, "conv-1", "Send the report to Rahul.")
    init_db(db_path)  # Must be idempotent

    conv = get_conversation(db_path, "conv-1")
    assert conv is not None
    assert conv["original_instruction"] == "Send the report to Rahul."

    with get_connection(db_path) as conn:
        mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
    assert mode.lower() == "wal"


def test_foreign_key_enforcement_and_rollback(tmp_path: Path) -> None:
    """Inserting message for non-existent conversation fails with DatabaseOperationError."""
    db_path = str(tmp_path / "fk_test.db")
    init_db(db_path)

    with pytest.raises(DatabaseOperationError):
        add_message(db_path, "non-existent-id", "user", "hello", turn_number=1)


def test_full_database_persistence_lifecycle(tmp_path: Path) -> None:
    """Verify parameterized CRUD across all 6 tables."""
    db_path = str(tmp_path / "lifecycle.db")
    init_db(db_path)

    create_conversation(
        db_path,
        conversation_id="conv-abc",
        original_instruction="Send the report to Rahul.",
        initial_context="Work workspace",
        status="NEEDS_CLARIFICATION",
        classification="ambiguous",
    )
    add_message(db_path, "conv-abc", "user", "Send the report to Rahul.", turn_number=1)
    add_interpretations(
        db_path,
        "conv-abc",
        [{"label": "Recipient", "description": "Multiple Rahuls exist."}],
        turn_number=1,
    )
    add_clarification_questions(
        db_path, "conv-abc", ["Which Rahul should receive the report?"], turn_number=1
    )

    asked = get_asked_questions(db_path, "conv-abc")
    assert len(asked) == 1
    assert asked[0]["normalized_text"] == "which rahul should receive the report?"
    assert asked[0]["answered"] == 0

    mark_questions_answered(db_path, "conv-abc")
    assert get_asked_questions(db_path, "conv-abc")[0]["answered"] == 1

    add_message(db_path, "conv-abc", "user", "Rahul Sharma", turn_number=2)
    save_resolved_intent(
        db_path,
        "conv-abc",
        action="send_document",
        parameters={"recipient": "Rahul Sharma"},
        resolved_instruction="Send the report to Rahul Sharma.",
        direct_answer=None,
    )
    update_conversation_state(db_path, "conv-abc", status="RESOLVED", classification="clear", turn_count=2)

    conv = get_conversation(db_path, "conv-abc")
    assert conv is not None
    assert conv["status"] == "RESOLVED"
    assert conv["turn_count"] == 2
    assert conv["initial_context"] == "Work workspace"

    items, total = list_conversations(db_path)
    assert total == 1
    assert len(items) == 1

    msgs = get_messages(db_path, "conv-abc")
    assert [m["role"] for m in msgs] == ["user", "user"]

    intent = get_resolved_intent(db_path, "conv-abc")
    assert intent is not None
    assert intent["action"] == "send_document"
    assert intent["parameters"] == {"recipient": "Rahul Sharma"}

    save_evaluation_record(
        db_path,
        run_id="eval-01",
        model_name="gemini-3.8-flash",
        dataset_size=48,
        precision=0.9,
        recall=0.85,
        f1_score=0.87,
        resolution_accuracy=0.88,
        false_clarification_rate=0.05,
    )
    latest = get_latest_evaluation_record(db_path)
    assert latest is not None
    assert latest["run_id"] == "eval-01"
