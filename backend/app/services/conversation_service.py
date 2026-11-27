"""
Conversation service — orchestrates PS6 analysis, clarification, and resolution.
Coordinates between DB operations, PS6 core engines, and Gemini.
"""

import logging
import uuid
from typing import Any, Optional

logger = logging.getLogger(__name__)

from app.core.ambiguity_detector import (
    detect_ambiguity_with_clarification_status,
    detect_ambiguity_with_status,
)
from app.core.clarification_engine import (
    filter_new_questions,
    enforce_max_turns,
    normalize_questions,
)
from app.core.confidence_engine import evaluate_confidence_and_uncertainty
from app.core.context_analyzer import build_context_summary, build_session_memory_bundle
from app.core.intent_resolver import validate_resolved_intent, build_fallback_resolved_intent
from app.core.risk_engine import evaluate_intent_risk
from app.core.task_router import classify_intent_domain, route_to_inventory
from app.database import operations as db_ops
from app.models.ai_schemas import ResolvedIntentOutput
from app.models.schemas import (
    AnalyzeResponse,
    ConfidenceAssessment,
    ConfidenceHistoryPoint,
    InterpretationItem,
    ResolvedIntentPayload,
    SessionContextMemory,
)


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

    # 2. Build session context memory & summary (strictly isolated to conversation_id)
    session_memory, context_summary, turn_count, _ = build_session_memory_bundle(
        db_path, conversation_id, focus_text=instruction
    )

    # 3. Run Gemini analysis (with graceful fallback & provenance tracking)
    analysis, is_ai_fallback, fallback_error, analysis_source = detect_ambiguity_with_status(
        db_path, instruction, conversation_id, context_summary
    )

    # Coordinate reference conflict clarification if session memory detected conflicting/unclear refs
    if session_memory.reference_conflicts and not analysis.needs_clarification:
        conflict_qs = [
            c.clarification_question
            for c in session_memory.reference_conflicts
            if c.clarification_question
        ]
        if conflict_qs:
            analysis = analysis.model_copy(
                update={
                    "classification": "context_dependent",
                    "needs_clarification": True,
                    "clarification_questions": conflict_qs[:3],
                    "ambiguity_types": list(dict.fromkeys([*analysis.ambiguity_types, "referential"])),
                }
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
    resolved_intent_payload = _attach_verified_answer(
        db_path, conversation_id, resolved_intent_payload, inventory_insight
    )

    # 8. Evaluate Confidence & Uncertainty Intelligence from actual backend outputs
    assessment, enriched_interpretations, history_point = (
        evaluate_confidence_and_uncertainty(
            original_instruction=instruction,
            initial_context=context,
            latest_user_response=None,
            clarification_responses=[],
            all_user_messages=[instruction],
            analysis=analysis,
            is_ai_fallback=is_ai_fallback,
            fallback_error=fallback_error,
            status=new_status,
            resolved_intent=resolved_intent_payload,
            inventory_insight=inventory_insight,
            turn_number=1,
            prior_snapshots=[],
        )
    )
    db_ops.save_confidence_snapshot(
        db_path,
        conversation_id,
        turn_number=1,
        snapshot=history_point.model_dump(),
        assessment=assessment.model_dump(),
    )

    # 9. Evaluate Risk-Aware Intent Assessment (Feature 9)
    risk_assessment = evaluate_intent_risk(
        action=resolved_intent_payload.action if resolved_intent_payload else "unresolved_action",
        target=resolved_intent_payload.resolved_instruction if resolved_intent_payload else instruction,
        raw_text=instruction,
        ambiguity_types=analysis.ambiguity_types,
        clarification_responses=[],
        unresolved_questions_count=len(analysis.clarification_questions),
        has_conflicts=bool(session_memory.reference_conflicts),
    )

    # Tag interpretations with risk levels
    risk_tagged_interpretations = [
        interp.model_copy(
            update={
                "risk_level": evaluate_intent_risk(
                    action=interp.label,
                    target=interp.description,
                    raw_text=f"{instruction} {interp.label} {interp.description}",
                ).risk_level
            }
        )
        for interp in enriched_interpretations
    ]

    return AnalyzeResponse(
        conversation_id=conversation_id,
        status=new_status,
        classification=analysis.classification,
        ambiguity_types=analysis.ambiguity_types,
        needs_clarification=analysis.needs_clarification,
        interpretations=risk_tagged_interpretations,
        missing_required_info=analysis.missing_required_info,
        clarification_questions=analysis.clarification_questions,
        resolved_intent=resolved_intent_payload,
        inventory_insight=inventory_insight,
        turn_count=turn_count,
        confidence_assessment=assessment,
        confidence_history=[history_point],
        context_memory=session_memory,
        risk_assessment=risk_assessment,
        analysis_source=analysis_source,
    )


def continue_conversation(
    db_path: str,
    conversation_id: str,
    response: str,
    max_turns: int = 3,
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

    # 3. Build full session memory & context (strictly isolated to conversation_id)
    session_memory, context_summary, turn_count, asked_questions = (
        build_session_memory_bundle(db_path, conversation_id, focus_text=response)
    )

    # 4. Force-resolve if max turns exceeded
    is_ai_fallback = False
    fallback_error: Optional[str] = None
    if enforce_max_turns(turn_count, max_turns):
        analysis = _build_force_resolution(conv["original_instruction"], context_summary)
        is_ai_fallback = True
        fallback_error = "Maximum clarification turns reached; forced deterministic completion."
        analysis_source = "system"
    else:
        (
            analysis,
            is_ai_fallback,
            fallback_error,
            analysis_source,
        ) = detect_ambiguity_with_clarification_status(
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
    resolved_intent_payload = _attach_verified_answer(
        db_path, conversation_id, resolved_intent_payload, inventory_insight
    )

    # 10. Recalculate confidence & append turn snapshot with delta explanation
    msgs = db_ops.get_messages(db_path, conversation_id)
    user_msgs = [m["content"] for m in msgs if m["role"] == "user"]
    clarify_responses = user_msgs[1:]
    prior_history_raw, _ = db_ops.get_confidence_history(db_path, conversation_id)

    assessment, enriched_interpretations, history_point = (
        evaluate_confidence_and_uncertainty(
            original_instruction=conv["original_instruction"],
            initial_context=conv.get("initial_context"),
            latest_user_response=response,
            clarification_responses=clarify_responses,
            all_user_messages=user_msgs,
            analysis=analysis,
            is_ai_fallback=is_ai_fallback,
            fallback_error=fallback_error,
            status=new_status,
            resolved_intent=resolved_intent_payload,
            inventory_insight=inventory_insight,
            turn_number=turn_count,
            prior_snapshots=prior_history_raw,
        )
    )
    db_ops.save_confidence_snapshot(
        db_path,
        conversation_id,
        turn_number=turn_count,
        snapshot=history_point.model_dump(),
        assessment=assessment.model_dump(),
    )
    updated_history = [
        ConfidenceHistoryPoint(**snap) for snap in prior_history_raw
    ] + [history_point]

    # Evaluate Risk-Aware Intent Assessment (Feature 9)
    risk_assessment = evaluate_intent_risk(
        action=resolved_intent_payload.action if resolved_intent_payload else "unresolved_action",
        target=resolved_intent_payload.resolved_instruction if resolved_intent_payload else conv["original_instruction"],
        raw_text=f"{conv['original_instruction']} {' '.join(clarify_responses)}",
        ambiguity_types=analysis.ambiguity_types,
        clarification_responses=clarify_responses,
        unresolved_questions_count=len(analysis.clarification_questions),
        has_conflicts=bool(session_memory.reference_conflicts),
    )

    # Tag interpretations with risk levels
    risk_tagged_interpretations = [
        interp.model_copy(
            update={
                "risk_level": evaluate_intent_risk(
                    action=interp.label,
                    target=interp.description,
                    raw_text=f"{conv['original_instruction']} {interp.label} {interp.description}",
                ).risk_level
            }
        )
        for interp in enriched_interpretations
    ]

    return AnalyzeResponse(
        conversation_id=conversation_id,
        status=new_status,
        classification=analysis.classification,
        ambiguity_types=analysis.ambiguity_types,
        needs_clarification=analysis.needs_clarification,
        interpretations=risk_tagged_interpretations,
        missing_required_info=analysis.missing_required_info,
        clarification_questions=analysis.clarification_questions,
        resolved_intent=resolved_intent_payload,
        inventory_insight=inventory_insight,
        turn_count=turn_count,
        confidence_assessment=assessment,
        confidence_history=updated_history,
        context_memory=session_memory,
        risk_assessment=risk_assessment,
        analysis_source=analysis_source,
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

    history_raw, latest_assessment_raw = db_ops.get_confidence_history(db_path, conversation_id)
    confidence_history = [ConfidenceHistoryPoint(**snap) for snap in history_raw]
    confidence_assessment = (
        ConfidenceAssessment(**latest_assessment_raw) if latest_assessment_raw else None
    )
    session_memory, _, _, _ = build_session_memory_bundle(db_path, conversation_id)

    # Evaluate Risk-Aware Intent Assessment on final resolution (Feature 9)
    risk_assessment = evaluate_intent_risk(
        action=resolved_payload.action,
        target=resolved_payload.resolved_instruction,
        raw_text=f"{conv['original_instruction']} {resolved_payload.resolved_instruction}",
        unresolved_questions_count=0,
        has_conflicts=bool(session_memory.reference_conflicts),
        user_confirmed=True,  # In resolve endpoint, intent is explicitly approved/resolved
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
        confidence_assessment=confidence_assessment,
        confidence_history=confidence_history,
        context_memory=session_memory,
        risk_assessment=risk_assessment,
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


def _attach_verified_answer(
    db_path: str,
    conversation_id: str,
    resolved_payload: Optional[ResolvedIntentPayload],
    inventory_insight: Optional[dict[str, Any]],
) -> Optional[ResolvedIntentPayload]:
    """
    Attach deterministic database-grounded explanation to resolved_intent.direct_answer
    when inventory_insight provides one, and persist it so GET /api/intent/{id} matches.
    """
    if resolved_payload is None or not inventory_insight:
        return resolved_payload
    explanation = inventory_insight.get("explanation")
    if not isinstance(explanation, str) or not explanation.strip():
        return resolved_payload

    updated = resolved_payload.model_copy(update={"direct_answer": explanation.strip()})
    try:
        db_ops.save_resolved_intent(
            db_path,
            conversation_id,
            action=updated.action,
            parameters=updated.parameters,
            resolved_instruction=updated.resolved_instruction,
            direct_answer=updated.direct_answer,
        )
    except Exception as exc:
        logger.warning("Failed to persist verified inventory answer for %s: %s", conversation_id, exc)
    return updated


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
            params_dict = (
                analysis.resolved_intent.parameters_dict()
                if hasattr(analysis.resolved_intent, "parameters_dict")
                else dict(analysis.resolved_intent.parameters)
            )
            _save_intent(db_path, conversation_id, analysis.resolved_intent)
            return "RESOLVED", ResolvedIntentPayload(
                action=analysis.resolved_intent.action,
                parameters=params_dict,
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
            parameters=fallback.parameters_dict(),
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
            parameters=auto_intent.parameters_dict(),
            resolved_instruction=auto_intent.resolved_instruction,
            direct_answer=auto_intent.direct_answer,
        )

    return "NEEDS_CLARIFICATION", None


def _save_intent(db_path: str, conversation_id: str, intent: Any) -> None:
    params_dict = (
        intent.parameters_dict()
        if hasattr(intent, "parameters_dict")
        else dict(intent.parameters)
    )
    db_ops.save_resolved_intent(
        db_path,
        conversation_id,
        action=intent.action,
        parameters=params_dict,
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
