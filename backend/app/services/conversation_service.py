"""
Conversation service — orchestrates PS6 analysis, clarification, and resolution.
Coordinates between DB operations, PS6 core engines, and Gemini.
"""

import uuid
from typing import Any, Optional

from app.core.ambiguity_detector import detect_ambiguity, detect_ambiguity_with_clarification
from app.core.clarification_engine import (
    filter_new_questions,
    enforce_max_turns,
    normalize_questions,
)
from app.core.context_analyzer import build_context_summary
from app.core.intent_resolver import validate_resolved_intent, build_fallback_resolved_intent
from app.core.task_router import classify_intent_domain, route_to_inventory
from app.database import operations as db_ops
from app.models.ai_schemas import ResolvedIntentOutput
from app.models.schemas import AnalyzeResponse, InterpretationItem, ResolvedIntentPayload


class ConversationError(Exception):
    """Raised for recoverable conversation-level errors (bad state, not found, etc.)."""

    def __init__(self, message: str, http_status: int = 400):
        super().__init__(message)
        self.http_status = http_status


def start_conversation(
    db_path: str,
    instruction: str,
    context: Optional[str] = None,
) -> AnalyzeResponse:
    """
    Create a new conversation, run ambiguity detection, persist results,
    and return the initial AnalyzeResponse.
    """
    conversation_id = str(uuid.uuid4())

    # 1. Persist conversation skeleton and first user message
    db_ops.create_conversation(
        db_path,
        conversation_id,
        original_instruction=instruction,
        initial_context=context,
        status="ANALYZING",
    )
    db_ops.add_message(
        db_path,
        conversation_id,
        role="user",
        content=instruction,
        turn_number=1,
    )

    # 2. Build context summary (turn 1 — only the instruction itself)
    context_summary, turn_count, _ = build_context_summary(db_path, conversation_id)

    # 3. Run Gemini analysis (with graceful fallback)
    analysis = detect_ambiguity(
        db_path, instruction, conversation_id, context_summary
    )

    # 4. Determine new status
    new_status, resolved_intent_payload = _resolve_status_and_intent(
        db_path, conversation_id, analysis, turn_count
    )

    # 5. Persist questions and interpretations
    if analysis.clarification_questions:
        db_ops.add_clarification_questions(
            db_path,
            conversation_id,
            analysis.clarification_questions,
            turn_number=1,
        )
    if analysis.interpretations:
        db_ops.add_interpretations(
            db_path,
            conversation_id,
            [i.model_dump() for i in analysis.interpretations],
            turn_number=1,
        )

    # 6. Persist ResolveX reply message
    _persist_assistant_message(
        db_path, conversation_id, analysis, new_status, turn_number=1
    )

    # 7. Update conversation state
    db_ops.update_conversation_state(
        db_path,
        conversation_id,
        status=new_status,
        classification=analysis.classification,
        turn_count=turn_count,
    )

    inventory_insight = _maybe_route_inventory(db_path, resolved_intent_payload)

    return AnalyzeResponse(
        conversation_id=conversation_id,
        status=new_status,
        classification=analysis.classification,
        ambiguity_types=analysis.ambiguity_types,
        needs_clarification=analysis.needs_clarification,
        interpretations=[
            InterpretationItem(label=i.label, description=i.description)
            for i in analysis.interpretations
        ],
        missing_required_info=analysis.missing_required_info,
        clarification_questions=analysis.clarification_questions,
        resolved_intent=resolved_intent_payload,
        inventory_insight=inventory_insight,
        turn_count=turn_count,
    )


def continue_conversation(
    db_path: str,
    conversation_id: str,
    response: str,
) -> AnalyzeResponse:
    """
    Process a clarification response, re-run analysis with full context,
    and return an updated AnalyzeResponse.
    """
    # 1. Load and validate conversation state
    conv = db_ops.get_conversation(db_path, conversation_id)
    if conv is None:
        raise ConversationError(
            f"Conversation '{conversation_id}' not found.", http_status=404
        )
    if conv["status"] not in ("NEEDS_CLARIFICATION", "ANALYZING"):
        raise ConversationError(
            f"Conversation is in state '{conv['status']}' and cannot accept further clarification.",
            http_status=409,
        )

    new_turn = int(conv["turn_count"]) + 1

    # 2. Mark previous questions as answered and add user message
    db_ops.mark_questions_answered(db_path, conversation_id)
    db_ops.add_message(
        db_path,
        conversation_id,
        role="user",
        content=response,
        turn_number=new_turn,
    )
    db_ops.update_conversation_state(
        db_path, conversation_id, status="ANALYZING", turn_count=new_turn
    )

    # 3. Build full context (now includes prior turns)
    context_summary, turn_count, asked_questions = build_context_summary(
        db_path, conversation_id
    )

    # 4. Force-resolve if max turns exceeded
    if enforce_max_turns(turn_count):
        analysis = _build_force_resolution(conv["original_instruction"], context_summary)
    else:
        analysis = detect_ambiguity_with_clarification(
            db_path,
            original_instruction=conv["original_instruction"],
            conversation_history=context_summary,
            new_response=response,
            pending_questions=asked_questions,
        )

    # 5. Filter duplicate questions
    if analysis.clarification_questions:
        asked_normalized = normalize_questions(asked_questions)
        analysis = analysis.model_copy(
            update={
                "clarification_questions": filter_new_questions(
                    analysis.clarification_questions, asked_normalized
                )
            }
        )

    # 6. Determine status and resolved intent
    new_status, resolved_intent_payload = _resolve_status_and_intent(
        db_path, conversation_id, analysis, turn_count
    )

    # 7. Persist questions and interpretations for this turn
    if analysis.clarification_questions:
        db_ops.add_clarification_questions(
            db_path,
            conversation_id,
            analysis.clarification_questions,
            turn_number=new_turn,
        )
    if analysis.interpretations:
        db_ops.add_interpretations(
            db_path,
            conversation_id,
            [i.model_dump() for i in analysis.interpretations],
            turn_number=new_turn,
        )

    # 8. Persist assistant message
    _persist_assistant_message(
        db_path, conversation_id, analysis, new_status, turn_number=new_turn
    )

    # 9. Update conversation
    db_ops.update_conversation_state(
        db_path,
        conversation_id,
        status=new_status,
        classification=analysis.classification,
        turn_count=turn_count,
    )

    inventory_insight = _maybe_route_inventory(db_path, resolved_intent_payload)

    return AnalyzeResponse(
        conversation_id=conversation_id,
        status=new_status,
        classification=analysis.classification,
        ambiguity_types=analysis.ambiguity_types,
        needs_clarification=analysis.needs_clarification,
        interpretations=[
            InterpretationItem(label=i.label, description=i.description)
            for i in analysis.interpretations
        ],
        missing_required_info=analysis.missing_required_info,
        clarification_questions=analysis.clarification_questions,
        resolved_intent=resolved_intent_payload,
        inventory_insight=inventory_insight,
        turn_count=turn_count,
    )


def get_resolved_intent(
    db_path: str,
    conversation_id: str,
) -> AnalyzeResponse:
    """
    Return the resolved intent for a completed conversation.
    Raises ConversationError if not yet resolved.
    """
    conv = db_ops.get_conversation(db_path, conversation_id)
    if conv is None:
        raise ConversationError(
            f"Conversation '{conversation_id}' not found.", http_status=404
        )
    if conv["status"] != "RESOLVED":
        raise ConversationError(
            f"Conversation is not yet resolved (status: '{conv['status']}').",
            http_status=409,
        )

    intent_row = db_ops.get_resolved_intent(db_path, conversation_id)
    if intent_row is None:
        raise ConversationError(
            "Conversation is marked RESOLVED but no intent record was found.",
            http_status=500,
        )

    resolved_payload = ResolvedIntentPayload(
        action=intent_row["action"],
        parameters=intent_row["parameters"],
        resolved_instruction=intent_row["resolved_instruction"],
        direct_answer=intent_row.get("direct_answer"),
    )

    return AnalyzeResponse(
        conversation_id=conversation_id,
        status="RESOLVED",
        classification=conv.get("classification"),
        ambiguity_types=[],
        needs_clarification=False,
        interpretations=[],
        missing_required_info=[],
        clarification_questions=[],
        resolved_intent=resolved_payload,
        inventory_insight=_maybe_route_inventory(db_path, resolved_payload),
        turn_count=int(conv["turn_count"]),
    )


def _maybe_route_inventory(
    db_path: str,
    resolved_payload: Optional[ResolvedIntentPayload],
) -> Optional[dict[str, Any]]:
    """Attach deterministic PS2 inventory insight when a resolved intent targets inventory."""
    if resolved_payload is None:
        return None
    intent_obj = ResolvedIntentOutput(
        action=resolved_payload.action,
        parameters=resolved_payload.parameters,
        resolved_instruction=resolved_payload.resolved_instruction,
        direct_answer=resolved_payload.direct_answer,
    )
    if classify_intent_domain(intent_obj) != "inventory":
        return None
    try:
        return route_to_inventory(db_path, intent_obj)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _resolve_status_and_intent(
    db_path: str,
    conversation_id: str,
    analysis: Any,
    turn_count: int,
) -> tuple[str, Optional[ResolvedIntentPayload]]:
    """Determine the new conversation status and persist/return resolved intent."""
    if analysis.needs_clarification and analysis.clarification_questions:
        return "NEEDS_CLARIFICATION", None

    # Attempt to extract and validate resolved intent
    if analysis.resolved_intent is not None:
        valid, reason = validate_resolved_intent(analysis.resolved_intent)
        if valid:
            _save_intent(db_path, conversation_id, analysis.resolved_intent)
            return "RESOLVED", ResolvedIntentPayload(
                action=analysis.resolved_intent.action,
                parameters=analysis.resolved_intent.parameters,
                resolved_instruction=analysis.resolved_intent.resolved_instruction,
                direct_answer=analysis.resolved_intent.direct_answer,
            )
        # Fallback if validation fails
        fallback = build_fallback_resolved_intent(
            analysis.resolved_intent.resolved_instruction or "unknown instruction", ""
        )
        _save_intent(db_path, conversation_id, fallback)
        return "RESOLVED", ResolvedIntentPayload(
            action=fallback.action,
            parameters=fallback.parameters,
            resolved_instruction=fallback.resolved_instruction,
            direct_answer=fallback.direct_answer,
        )

    # Clear classification without explicit resolved_intent — build one
    if analysis.classification == "clear" and not analysis.needs_clarification:
        from app.models.ai_schemas import ResolvedIntentOutput

        auto_intent = ResolvedIntentOutput(
            action="execute_instruction",
            parameters={},
            resolved_instruction=analysis.reasoning or "Instruction is clear as stated.",
            direct_answer=None,
        )
        _save_intent(db_path, conversation_id, auto_intent)
        return "RESOLVED", ResolvedIntentPayload(
            action=auto_intent.action,
            parameters=auto_intent.parameters,
            resolved_instruction=auto_intent.resolved_instruction,
            direct_answer=auto_intent.direct_answer,
        )

    return "NEEDS_CLARIFICATION", None


def _save_intent(db_path: str, conversation_id: str, intent: Any) -> None:
    db_ops.save_resolved_intent(
        db_path,
        conversation_id,
        action=intent.action,
        parameters=intent.parameters,
        resolved_instruction=intent.resolved_instruction,
        direct_answer=intent.direct_answer,
    )


def _persist_assistant_message(
    db_path: str,
    conversation_id: str,
    analysis: Any,
    status: str,
    turn_number: int,
) -> None:
    if status == "NEEDS_CLARIFICATION" and analysis.clarification_questions:
        content = "I need clarification:\n" + "\n".join(
            f"- {q}" for q in analysis.clarification_questions
        )
    elif status == "RESOLVED" and analysis.resolved_intent:
        content = f"Resolved: {analysis.resolved_intent.resolved_instruction}"
    else:
        content = f"Analysis complete. Status: {status}."

    db_ops.add_message(
        db_path,
        conversation_id,
        role="assistant",
        content=content,
        turn_number=turn_number,
    )


def _build_force_resolution(
    original_instruction: str, context_summary: str
) -> Any:
    """Build a forced resolution after max clarification turns are exhausted."""
    from app.models.ai_schemas import GeminiAnalysisOutput, ResolvedIntentOutput

    fallback_intent = build_fallback_resolved_intent(original_instruction, context_summary)
    return GeminiAnalysisOutput(
        classification="context_dependent",
        ambiguity_types=[],
        needs_clarification=False,
        reasoning="Max clarification turns reached — forcing resolution with available context.",
        interpretations=[],
        missing_required_info=[],
        clarification_questions=[],
        resolved_intent=ResolvedIntentOutput(
            action=fallback_intent.action,
            parameters=fallback_intent.parameters,
            resolved_instruction=fallback_intent.resolved_instruction,
            direct_answer=None,
        ),
    )
