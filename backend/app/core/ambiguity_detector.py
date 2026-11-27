"""
Ambiguity detector — calls Gemini with structured output and falls back
deterministically when the AI is unavailable.
"""

from app.models.ai_schemas import GeminiAnalysisOutput, InterpretationOutput
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
    prompt = build_analysis_prompt(instruction, context_summary)
    result, error = gemini_service.call_gemini_structured(
        prompt, GeminiAnalysisOutput
    )

    if error or result is None:
        return _FALLBACK_ANALYSIS

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
    prompt = build_clarification_prompt(
        original_instruction, conversation_history, new_response, pending_questions
    )
    result, error = gemini_service.call_gemini_structured(
        prompt, GeminiAnalysisOutput
    )

    if error or result is None:
        # Safe fallback: mark as resolved with minimal content
        from app.models.ai_schemas import ResolvedIntentOutput

        return GeminiAnalysisOutput(
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

    if result.classification == "clear":
        result = result.model_copy(
            update={"needs_clarification": False, "clarification_questions": []}
        )

    return result
