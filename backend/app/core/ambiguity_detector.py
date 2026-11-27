"""
Ambiguity detector — calls Gemini with structured output and falls back
deterministically when the AI is unavailable, reporting fallback status
honestly so downstream confidence intelligence never fabricates certainty.
"""

import logging
import re
from dataclasses import dataclass
from typing import Optional

from app.core.local_analyzer import clarify_locally, match_local, offline_fallback
from app.models.ai_schemas import GeminiAnalysisOutput
from app.services import gemini_service
from app.services.prompts import build_analysis_prompt, build_clarification_prompt

logger = logging.getLogger(__name__)

AnalysisSource = str  # "gemini" | "local" | "offline_fallback" | "system"


def _reconcile_communication(
    instruction: str, result: GeminiAnalysisOutput
) -> GeminiAnalysisOutput:
    """Deterministic validation layer for person-directed messaging.

    The LLM interprets meaning; this check guarantees communication requests
    are never misrouted to inventory/business intents and never silently assume
    an unidentified recipient. Only overrides the model when the two readings
    disagree on whether clarification is required.
    """
    try:
        from app.core.communication_parser import communication_analysis

        comm = communication_analysis(instruction)
    except Exception:
        logger.exception("Communication reconciliation failed")
        return result
    if comm is None:
        return result
    if comm.needs_clarification == result.needs_clarification:
        # Same posture: keep the richer model output, except adopt the more
        # precise context_dependent label for pronoun/anaphoric follow-ups.
        if comm.classification == "context_dependent" and result.classification != "context_dependent":
            return comm
        return result
    # Disagreement on whether clarification is needed: the deterministic
    # communication reading is authoritative — it never assumes a recipient.
    return comm


_ANAPHORIC_OPENER = re.compile(
    r"^\s*(yes|yeah|yep|no|do|does|did|repeat|reply|use|apply|proceed|undo|"
    r"the opposite|that one|this one|it|that|those|same|let)\b",
    re.IGNORECASE,
)


def _relabel_anaphoric(
    instruction: str, result: GeminiAnalysisOutput
) -> GeminiAnalysisOutput:
    """Short utterances that only make sense against prior context
    ('Do the opposite.', 'Yes, do that one.') are context_dependent, not
    ambiguous — there is a single missing referent, not competing readings."""
    if result.classification != "ambiguous" or result.needs_clarification is False:
        return result
    if len(instruction.strip().split()) <= 8 and _ANAPHORIC_OPENER.match(instruction):
        return result.model_copy(update={"classification": "context_dependent"})
    return result


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
    prompt = build_analysis_prompt(instruction, context_summary)
    result, error = gemini_service.call_gemini_structured(
        prompt, GeminiAnalysisOutput
    )

    if error or result is None:
        local = _prefer_local(instruction, context_summary)
        if local is not None:
            return local, True, error or "Deterministic local resolver active.", "local"
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

    # A deterministic closed-world resolver (unit conversion, inventory lookup,
    # communication draft) is authoritative: it beats a false clarification.
    local = _prefer_local(instruction, context_summary)
    if local is not None and result.needs_clarification and not local.needs_clarification:
        result = local

    reconciled = _reconcile_communication(instruction, result)
    return _relabel_anaphoric(instruction, reconciled), False, None, "gemini"


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
