"""
Ambiguity detector — calls Gemini with structured output and falls back
deterministically when the AI is unavailable, reporting fallback status
honestly so downstream confidence intelligence never fabricates certainty.
"""

from typing import Optional

from app.core.local_analyzer import clarify_locally, match_local, offline_fallback
from app.models.ai_schemas import GeminiAnalysisOutput, InterpretationOutput, ResolvedIntentOutput
from app.services import gemini_service
from app.services.prompts import build_analysis_prompt, build_clarification_prompt

_FALLBACK_ANALYSIS = GeminiAnalysisOutput(
    classification="ambiguous",
    ambiguity_types=["contextual"],
    needs_clarification=True,
    reasoning="AI unavailable — defaulting to safe ambiguous fallback.",
    interpretations=[
        InterpretationOutput(
            label="Interpretation A",
            description="The instruction may require more context to resolve.",
        )
    ],
    missing_required_info=["Additional context required"],
    clarification_questions=["Could you please provide more details about your request?"],
    resolved_intent=None,
)


def _prefer_local(instruction: str, context_summary: str) -> GeminiAnalysisOutput | None:
    """Closed-world tasks are answered without waiting on Gemini."""
    matched = match_local(instruction, context_summary)
    if matched is not None and matched.authoritative:
        return matched.analysis
    return None


def detect_ambiguity_with_status(
    db_path: str,
    instruction: str,
    conversation_id: str,
    context_summary: str,
) -> tuple[GeminiAnalysisOutput, bool, Optional[str]]:
    """
    Call Gemini to classify and analyse the instruction.
    Returns (analysis_output, is_ai_fallback, fallback_error_message).
    """
    prompt = build_analysis_prompt(instruction, context_summary)
    result, error = gemini_service.call_gemini_structured(
        prompt, GeminiAnalysisOutput
    )

    if error or result is None:
        local = _prefer_local(instruction, context_summary)
        if local is not None:
            return local, True, error or "Deterministic local resolver active."
        matched = match_local(instruction, context_summary)
        fallback = matched.analysis if matched is not None else offline_fallback(instruction)
        return fallback or _FALLBACK_ANALYSIS, True, error or "Gemini returned empty analysis."

    # Enforce consistency: a "clear" classification must not ask for clarification
    if result.classification == "clear":
        result = result.model_copy(
            update={"needs_clarification": False, "clarification_questions": []}
        )

    return result, False, None


def detect_ambiguity(
    db_path: str,
    instruction: str,
    conversation_id: str,
    context_summary: str,
) -> GeminiAnalysisOutput:
    """
    Call Gemini to classify and analyse the instruction.
    Falls back to a safe deterministic response if Gemini is unavailable.
    """
    result, _is_fallback, _err = detect_ambiguity_with_status(
        db_path, instruction, conversation_id, context_summary
    )
    return result


def detect_ambiguity_with_clarification_status(
    db_path: str,
    original_instruction: str,
    conversation_history: str,
    new_response: str,
    pending_questions: list[str],
) -> tuple[GeminiAnalysisOutput, bool, Optional[str]]:
    """
    Re-analyze after a clarification turn and report whether fallback was used.
    Returns (analysis_output, is_ai_fallback, fallback_error_message).
    """
    local = _prefer_local(
        f"{original_instruction}\n{new_response}",
        conversation_history,
    )
    if local is not None:
        return local, False, None

    prompt = build_clarification_prompt(
        original_instruction, conversation_history, new_response, pending_questions
    )
    result, error = gemini_service.call_gemini_structured(
        prompt, GeminiAnalysisOutput
    )

    if error or result is None:
        local_clarified = clarify_locally(original_instruction, new_response, pending_questions)
        if local_clarified is not None:
            return local_clarified, True, error or "Resolved via deterministic local rules."

        fallback_output = GeminiAnalysisOutput(
            classification="context_dependent",
            ambiguity_types=[],
            needs_clarification=False,
            reasoning="AI unavailable — resolving with available context.",
            interpretations=[],
            missing_required_info=[],
            clarification_questions=[],
            resolved_intent=ResolvedIntentOutput(
                action="resolved_from_context",
                parameters={},
                resolved_instruction=f"{original_instruction} (resolved with user clarification)",
                direct_answer=None,
            ),
        )
        return fallback_output, True, error or "Gemini unavailable during clarification."

    if result.classification == "clear":
        result = result.model_copy(
            update={"needs_clarification": False, "clarification_questions": []}
        )

    return result, False, None


def detect_ambiguity_with_clarification(
    db_path: str,
    original_instruction: str,
    conversation_history: str,
    new_response: str,
    pending_questions: list[str],
) -> GeminiAnalysisOutput:
    """
    Re-analyze after a clarification turn. Uses the full conversation history.
    Falls back deterministically if Gemini is unavailable.
    """
    result, _is_fallback, _err = detect_ambiguity_with_clarification_status(
        db_path,
        original_instruction,
        conversation_history,
        new_response,
        pending_questions,
    )
    return result
