"""
Context analyzer — retrieves and formats conversation history for Gemini prompts.
Never calls Gemini itself; purely a data-preparation layer.
"""

from typing import Optional
from app.database.connection import get_connection


def build_context_summary(
    db_path: str,
    conversation_id: str,
) -> tuple[str, int, list[str]]:
    """
    Retrieve messages and prior Q&A for a conversation and format them into
    a compact history string suitable for injection into a Gemini prompt.

    Returns:
        (context_summary_str, turn_count, asked_questions_list)
    """
    with get_connection(db_path) as conn:
        conv_row = conn.execute(
            "SELECT turn_count, initial_context FROM conversations WHERE id = ?;",
            (conversation_id,),
        ).fetchone()
        turn_count: int = int(conv_row["turn_count"]) if conv_row else 1
        initial_context: Optional[str] = conv_row["initial_context"] if conv_row else None

        msg_rows = conn.execute(
            """
            SELECT role, content, turn_number
            FROM messages
            WHERE conversation_id = ?
            ORDER BY turn_number ASC, id ASC;
            """,
            (conversation_id,),
        ).fetchall()

        q_rows = conn.execute(
            """
            SELECT question_text, answered, turn_number
            FROM clarification_questions
            WHERE conversation_id = ?
            ORDER BY turn_number ASC, id ASC;
            """,
            (conversation_id,),
        ).fetchall()

    # Build human-readable turn history
    lines: list[str] = []
    if initial_context and initial_context.strip():
        lines.append(f"Initial Context: {initial_context.strip()}")
    for row in msg_rows:
        prefix = "User" if row["role"] == "user" else "ResolveX"
        lines.append(f"[Turn {row['turn_number']}] {prefix}: {row['content']}")

    context_summary = "\n".join(lines) if lines else "No prior context."

    asked_questions: list[str] = [dict(r)["question_text"] for r in q_rows]

    return context_summary, turn_count, asked_questions
