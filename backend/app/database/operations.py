"""Parameterized SQLite CRUD operations for ResolveX."""

from datetime import datetime, timezone
import json
import sqlite3
from typing import Any, Optional

from app.database.connection import get_connection


class DatabaseOperationError(Exception):
    """Raised when a SQLite database operation fails."""


def _utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


def create_conversation(
    db_path: str,
    conversation_id: str,
    original_instruction: str,
    initial_context: Optional[str] = None,
    status: str = "ANALYZING",
    classification: Optional[str] = None,
) -> dict[str, Any]:
    """Insert a new conversation record."""
    now = _utc_now_iso()
    try:
        with get_connection(db_path) as conn:
            conn.execute(
                """
                INSERT INTO conversations (
                    id, original_instruction, initial_context, status,
                    classification, turn_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 1, ?, ?);
                """,
                (
                    conversation_id,
                    original_instruction,
                    initial_context,
                    status,
                    classification,
                    now,
                    now,
                ),
            )
        return {
            "id": conversation_id,
            "original_instruction": original_instruction,
            "initial_context": initial_context,
            "status": status,
            "classification": classification,
            "turn_count": 1,
            "created_at": now,
            "updated_at": now,
        }
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to create conversation.") from exc


def get_conversation(db_path: str, conversation_id: str) -> Optional[dict[str, Any]]:
    """Fetch a single conversation by ID, or None if not found."""
    try:
        with get_connection(db_path) as conn:
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?;",
                (conversation_id,),
            ).fetchone()
        return dict(row) if row else None
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to fetch conversation.") from exc


def list_conversations(
    db_path: str, limit: int = 20, offset: int = 0
) -> tuple[list[dict[str, Any]], int]:
    """List conversations ordered by most recently updated, plus total count."""
    try:
        with get_connection(db_path) as conn:
            total_row = conn.execute("SELECT COUNT(*) AS cnt FROM conversations;").fetchone()
            rows = conn.execute(
                """
                SELECT * FROM conversations
                ORDER BY updated_at DESC
                LIMIT ? OFFSET ?;
                """,
                (limit, offset),
            ).fetchall()
        return [dict(r) for r in rows], int(total_row["cnt"])
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to list conversations.") from exc


def update_conversation_state(
    db_path: str,
    conversation_id: str,
    status: str,
    classification: Optional[str] = None,
    turn_count: Optional[int] = None,
) -> None:
    """Update conversation status, optional classification, and optional turn_count."""
    now = _utc_now_iso()
    try:
        with get_connection(db_path) as conn:
            conn.execute(
                """
                UPDATE conversations
                SET status = ?,
                    classification = COALESCE(?, classification),
                    turn_count = COALESCE(?, turn_count),
                    updated_at = ?
                WHERE id = ?;
                """,
                (status, classification, turn_count, now, conversation_id),
            )
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to update conversation state.") from exc


def add_message(
    db_path: str,
    conversation_id: str,
    role: str,
    content: str,
    turn_number: int,
    card_json: Optional[str] = None,
) -> int:
    """Append a message to a conversation and return its row ID."""
    now = _utc_now_iso()
    try:
        with get_connection(db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO messages (conversation_id, role, content, turn_number, card_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?);
                """,
                (conversation_id, role, content, turn_number, card_json, now),
            )
            return int(cursor.lastrowid)
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to add message.") from exc


def get_messages(db_path: str, conversation_id: str) -> list[dict[str, Any]]:
    """Retrieve chronological messages for a conversation."""
    try:
        with get_connection(db_path) as conn:
            rows = conn.execute(
                """
                SELECT id, conversation_id, role, content, turn_number, card_json, created_at
                FROM messages
                WHERE conversation_id = ?
                ORDER BY turn_number ASC, id ASC;
                """,
                (conversation_id,),
            ).fetchall()
        return [dict(r) for r in rows]
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to fetch messages.") from exc


def add_clarification_questions(
    db_path: str,
    conversation_id: str,
    questions: list[str],
    turn_number: int,
) -> None:
    """Persist clarification questions with normalized text for anti-repetition."""
    if not questions:
        return
    now = _utc_now_iso()
    rows = [
        (conversation_id, q.strip(), q.strip().lower(), turn_number, 0, now)
        for q in questions
        if q.strip()
    ]
    try:
        with get_connection(db_path) as conn:
            conn.executemany(
                """
                INSERT INTO clarification_questions (
                    conversation_id, question_text, normalized_text,
                    turn_number, answered, created_at
                ) VALUES (?, ?, ?, ?, ?, ?);
                """,
                rows,
            )
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to save clarification questions.") from exc


def get_asked_questions(db_path: str, conversation_id: str) -> list[dict[str, Any]]:
    """Return previously asked clarification questions for a conversation."""
    try:
        with get_connection(db_path) as conn:
            rows = conn.execute(
                """
                SELECT id, question_text, normalized_text, turn_number, answered, created_at
                FROM clarification_questions
                WHERE conversation_id = ?
                ORDER BY turn_number ASC, id ASC;
                """,
                (conversation_id,),
            ).fetchall()
        return [dict(r) for r in rows]
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to fetch clarification questions.") from exc


def mark_questions_answered(db_path: str, conversation_id: str) -> None:
    """Mark all pending clarification questions in a conversation as answered."""
    try:
        with get_connection(db_path) as conn:
            conn.execute(
                """
                UPDATE clarification_questions
                SET answered = 1
                WHERE conversation_id = ? AND answered = 0;
                """,
                (conversation_id,),
            )
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to mark questions answered.") from exc


def add_interpretations(
    db_path: str,
    conversation_id: str,
    interpretations: list[dict[str, str]],
    turn_number: int,
) -> None:
    """Persist candidate interpretations for a conversation turn."""
    if not interpretations:
        return
    now = _utc_now_iso()
    rows = [
        (conversation_id, turn_number, item["label"], item["description"], now)
        for item in interpretations
    ]
    try:
        with get_connection(db_path) as conn:
            conn.executemany(
                """
                INSERT INTO interpretations (
                    conversation_id, turn_number, label, description, created_at
                ) VALUES (?, ?, ?, ?, ?);
                """,
                rows,
            )
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to save interpretations.") from exc


def save_resolved_intent(
    db_path: str,
    conversation_id: str,
    action: str,
    parameters: dict[str, Any],
    resolved_instruction: str,
    direct_answer: Optional[str] = None,
) -> None:
    """Persist the final resolved intent (1:1 with conversation)."""
    now = _utc_now_iso()
    try:
        with get_connection(db_path) as conn:
            conn.execute(
                """
                INSERT INTO resolved_intents (
                    conversation_id, action, parameters_json,
                    resolved_instruction, direct_answer, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(conversation_id) DO UPDATE SET
                    action = excluded.action,
                    parameters_json = excluded.parameters_json,
                    resolved_instruction = excluded.resolved_instruction,
                    direct_answer = excluded.direct_answer,
                    created_at = excluded.created_at;
                """,
                (
                    conversation_id,
                    action,
                    json.dumps(parameters),
                    resolved_instruction,
                    direct_answer,
                    now,
                ),
            )
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to save resolved intent.") from exc


def get_resolved_intent(db_path: str, conversation_id: str) -> Optional[dict[str, Any]]:
    """Retrieve the resolved intent for a conversation, if present."""
    try:
        with get_connection(db_path) as conn:
            row = conn.execute(
                "SELECT * FROM resolved_intents WHERE conversation_id = ?;",
                (conversation_id,),
            ).fetchone()
        if not row:
            return None
        data = dict(row)
        data["parameters"] = json.loads(data.pop("parameters_json"))
        return data
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to fetch resolved intent.") from exc


def save_evaluation_record(
    db_path: str,
    run_id: str,
    model_name: str,
    dataset_size: int,
    precision: float,
    recall: float,
    f1_score: float,
    resolution_accuracy: float,
    false_clarification_rate: float,
) -> None:
    """Persist an evaluation benchmark run record."""
    now = _utc_now_iso()
    try:
        with get_connection(db_path) as conn:
            conn.execute(
                """
                INSERT INTO evaluation_records (
                    run_id, model_name, dataset_size, precision, recall,
                    f1_score, resolution_accuracy, false_clarification_rate, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    run_id,
                    model_name,
                    dataset_size,
                    precision,
                    recall,
                    f1_score,
                    resolution_accuracy,
                    false_clarification_rate,
                    now,
                ),
            )
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to save evaluation record.") from exc


def get_latest_evaluation_record(db_path: str) -> Optional[dict[str, Any]]:
    """Retrieve the most recent evaluation run record."""
    try:
        with get_connection(db_path) as conn:
            row = conn.execute(
                "SELECT * FROM evaluation_records ORDER BY id DESC LIMIT 1;"
            ).fetchone()
        return dict(row) if row else None
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to fetch latest evaluation record.") from exc


def save_confidence_snapshot(
    db_path: str,
    conversation_id: str,
    turn_number: int,
    snapshot: dict[str, Any],
    assessment: dict[str, Any],
) -> None:
    """Persist a turn-level confidence history point and full assessment."""
    now = _utc_now_iso()
    try:
        with get_connection(db_path) as conn:
            conn.execute(
                """
                INSERT INTO confidence_snapshots (
                    conversation_id, turn_number, snapshot_json, assessment_json, created_at
                ) VALUES (?, ?, ?, ?, ?);
                """,
                (
                    conversation_id,
                    turn_number,
                    json.dumps(snapshot),
                    json.dumps(assessment),
                    now,
                ),
            )
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to save confidence snapshot.") from exc


def get_confidence_history(
    db_path: str, conversation_id: str
) -> tuple[list[dict[str, Any]], Optional[dict[str, Any]]]:
    """Return chronological confidence snapshots and latest assessment for a conversation."""
    try:
        with get_connection(db_path) as conn:
            rows = conn.execute(
                """
                SELECT snapshot_json, assessment_json
                FROM confidence_snapshots
                WHERE conversation_id = ?
                ORDER BY turn_number ASC, id ASC;
                """,
                (conversation_id,),
            ).fetchall()
        history = [json.loads(r["snapshot_json"]) for r in rows]
        latest_assessment = json.loads(rows[-1]["assessment_json"]) if rows else None
        return history, latest_assessment
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to fetch confidence history.") from exc


def delete_conversation(db_path: str, conversation_id: str) -> bool:
    """Delete a conversation and all dependent rows (cascade). Returns False if absent."""
    try:
        with get_connection(db_path) as conn:
            cur = conn.execute("DELETE FROM conversations WHERE id = ?;", (conversation_id,))
            return cur.rowcount > 0
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to delete conversation.") from exc


def upsert_message_draft(
    db_path: str, conversation_id: str, draft: dict[str, Any], status: str = "DRAFT"
) -> None:
    """Create or replace the persisted draft for a conversation."""
    import json as _json

    now = _utc_now_iso()
    try:
        with get_connection(db_path) as conn:
            conn.execute(
                """
                INSERT INTO message_drafts (conversation_id, draft_json, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(conversation_id) DO UPDATE SET
                    draft_json = excluded.draft_json,
                    status = excluded.status,
                    updated_at = excluded.updated_at;
                """,
                (conversation_id, _json.dumps(draft), status, now, now),
            )
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to save message draft.") from exc


def get_message_draft(db_path: str, conversation_id: str) -> Optional[dict[str, Any]]:
    """Return the persisted draft for a conversation, or None."""
    import json as _json

    try:
        with get_connection(db_path) as conn:
            row = conn.execute(
                "SELECT draft_json, status, updated_at FROM message_drafts WHERE conversation_id = ?;",
                (conversation_id,),
            ).fetchone()
        if not row:
            return None
        return {
            "draft": _json.loads(row["draft_json"]),
            "status": row["status"],
            "updated_at": row["updated_at"],
        }
    except (sqlite3.Error, ValueError) as exc:
        raise DatabaseOperationError("Failed to fetch message draft.") from exc


def clear_message_draft(db_path: str, conversation_id: str) -> None:
    """Remove the persisted draft for a conversation (e.g. superseded by another card)."""
    try:
        with get_connection(db_path) as conn:
            conn.execute("DELETE FROM message_drafts WHERE conversation_id = ?;", (conversation_id,))
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to clear message draft.") from exc


def rename_conversation(db_path: str, conversation_id: str, title: str) -> bool:
    """Rename a conversation's displayed title (original_instruction)."""
    try:
        with get_connection(db_path) as conn:
            cur = conn.execute(
                "UPDATE conversations SET original_instruction = ?, updated_at = ? WHERE id = ?;",
                (title.strip()[:200], _utc_now_iso(), conversation_id),
            )
            return cur.rowcount > 0
    except sqlite3.Error as exc:
        raise DatabaseOperationError("Failed to rename conversation.") from exc
