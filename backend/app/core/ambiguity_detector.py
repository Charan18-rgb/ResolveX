"""
Ambiguity detector — calls Gemini with structured output and falls back
deterministically when the AI is unavailable, reporting fallback status
honestly so downstream confidence intelligence never fabricates certainty.
"""

from dataclasses import dataclass
from typing import Optional

from app.core.local_analyzer import clarify_locally, match_local, offline_fallback
from app.models.ai_schemas import GeminiAnalysisOutput
from app.services import gemini_service
from app.services.prompts import build_analysis_prompt, build_clarification_prompt

AnalysisSource = str  # "gemini" | "local" | "offline_fallback" | "system"


@dataclass
class DetectionResult:
    """Analysis output plus provenance of which engine produced it."""

    analysis: GeminiAnalysisOutput
    source: AnalysisSource


def _prefer_local(
    instruction: str,
    context_summary: str,
    multi_intent_authoritative: bool = True,
) -> GeminiAnalysisOutput | None:
    """Closed-world tasks are answered without waiting on Gemini."""
    matched = match_local(
        instruction, context_summary, multi_intent_authoritative=multi_intent_authoritative
    )
    if matched is not None and matched.authoritative:
        return matched.analysis
    return None


def detect_ambiguity_with_status(
    db_path: str,
    instruction: str,
    conversation_id: str,
    context_summary: str,
) -> tuple[GeminiAnalysisOutput, bool, Optional[str], AnalysisSource]:
    """
    Classify and analyse the instruction.
    Returns (analysis_output, is_ai_fallback, fallback_error_message, analysis_source).
    """
    local = _prefer_local(instruction, context_summary)
    if local is not None:
        return local, True, "Deterministic local resolver active.", "local"

    prompt = build_analysis_prompt(instruction, context_summary)
    result, error = gemini_service.call_gemini_structured(
        prompt, GeminiAnalysisOutput
    )

    if error or result is None:
        matched = match_local(instruction, context_summary)
        if matched is not None:
            return matched.analysis, True, error or "Deterministic local resolver active.", "local"
        return (
            offline_fallback(instruction),
            True,
            error or "Gemini returned empty analysis.",
            "offline_fallback",
        )

    # Enforce consistency: a "clear" classification must not ask for clarification
    if result.classification == "clear":
        result = result.model_copy(
            update={"needs_clarification": False, "clarification_questions": []}
        )

    return result, False, None, "gemini"


def detect_ambiguity(
    db_path: str,
    instruction: str,
    conversation_id: str,
    context_summary: str,
) -> DetectionResult:
    """
    Call Gemini to classify and analyse the instruction.
    Falls back to a safe deterministic response if Gemini is unavailable.
    """
    result, _is_fallback, _err, source = detect_ambiguity_with_status(
        db_path, instruction, conversation_id, context_summary
    )
    return DetectionResult(result, source)


def detect_ambiguity_with_clarification_status(
    db_path: str,
    original_instruction: str,
    conversation_history: str,
    new_response: str,
    pending_questions: list[str],
) -> tuple[GeminiAnalysisOutput, bool, Optional[str], AnalysisSource]:
    """
    Re-analyze after a clarification turn and report whether fallback was used.
    Returns (analysis_output, is_ai_fallback, fallback_error_message, analysis_source).
    """
    local = _prefer_local(
        f"{original_instruction}\n{new_response}",
        conversation_history,
        multi_intent_authoritative=False,
    )
    if local is not None:
        return local, False, None, "local"

    prompt = build_clarification_prompt(
        original_instruction, conversation_history, new_response, pending_questions
    )
    result, error = gemini_service.call_gemini_structured(
        prompt, GeminiAnalysisOutput
    )

    if error or result is None:
        analysis, source = clarify_locally(
            original_instruction, new_response, pending_questions
        )
        return analysis, True, error or "Gemini unavailable during clarification.", source

    if result.classification == "clear":
        result = result.model_copy(
            update={"needs_clarification": False, "clarification_questions": []}
        )

    return result, False, None, "gemini"


def detect_ambiguity_with_clarification(
    db_path: str,
    original_instruction: str,
    conversation_history: str,
    new_response: str,
    pending_questions: list[str],
) -> DetectionResult:
    """
    Re-analyze after a clarification turn. Uses the full conversation history.
    Falls back deterministically if Gemini is unavailable.
    """
    result, _is_fallback, _err, source = detect_ambiguity_with_clarification_status(
        db_path,
        original_instruction,
        conversation_history,
        new_response,
        pending_questions,
    )
    return DetectionResult(result, source)
