"""
Ambiguity detector — calls Gemini with structured output and falls back
deterministically when the AI is unavailable.
"""

from app.core.local_analyzer import clarify_locally, match_local, offline_fallback
from app.models.ai_schemas import GeminiAnalysisOutput
from app.services import gemini_service
from app.services.prompts import build_analysis_prompt, build_clarification_prompt


def _prefer_local(instruction: str, context_summary: str) -> GeminiAnalysisOutput | None:
    """Closed-world tasks are answered without waiting on Gemini."""
    matched = match_local(instruction, context_summary)
    if matched is not None and matched.authoritative:
        return matched.analysis
    return None


def detect_ambiguity(
    db_path: str,
    instruction: str,
    conversation_id: str,
    context_summary: str,
) -> GeminiAnalysisOutput:
    """
    Call Gemini to classify and analyse the instruction.
    Falls back to a safe deterministic response if Gemini is unavailable.

    Post-condition: if classification=="clear", forces needs_clarification=False.
    """
    local = _prefer_local(instruction, context_summary)
    if local is not None:
        return local

    prompt = build_analysis_prompt(instruction, context_summary)
    result, error = gemini_service.call_gemini_structured(
        prompt, GeminiAnalysisOutput
    )

    if error or result is None:
        matched = match_local(instruction, context_summary)
        return matched.analysis if matched is not None else offline_fallback(instruction)

    # Enforce consistency: a "clear" classification must not ask for clarification
    if result.classification == "clear":
        result = result.model_copy(
            update={"needs_clarification": False, "clarification_questions": []}
        )

    return result


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
    local = _prefer_local(
        f"{original_instruction}\n{new_response}",
        conversation_history,
    )
    if local is not None:
        return local

    prompt = build_clarification_prompt(
        original_instruction, conversation_history, new_response, pending_questions
    )
    result, error = gemini_service.call_gemini_structured(
        prompt, GeminiAnalysisOutput
    )

    if error or result is None:
        return clarify_locally(original_instruction, new_response, pending_questions)

    if result.classification == "clear":
        result = result.model_copy(
            update={"needs_clarification": False, "clarification_questions": []}
        )

    return result
