"""
Intent resolver — validates resolved intent before it is returned to callers.
Pure Python; no database or Gemini calls.
"""

from app.models.ai_schemas import ResolvedIntentOutput

_PLACEHOLDER_VALUES = {"tbd", "unknown", "n/a", "none", "", "null", "undefined"}


def validate_resolved_intent(intent: ResolvedIntentOutput) -> tuple[bool, str]:
    """
    Check that the resolved intent contains meaningful, non-placeholder content.

    Returns:
        (valid: bool, reason: str) — reason is empty string when valid.
    """
    action = (intent.action or "").strip().lower()
    resolved = (intent.resolved_instruction or "").strip().lower()

    if not action:
        return False, "resolved_intent.action is empty."

    if action in _PLACEHOLDER_VALUES:
        return False, f"resolved_intent.action contains placeholder value: '{intent.action}'."

    if not resolved:
        return False, "resolved_intent.resolved_instruction is empty."

    if resolved in _PLACEHOLDER_VALUES:
        return (
            False,
            f"resolved_intent.resolved_instruction contains placeholder value: '{intent.resolved_instruction}'.",
        )

    return True, ""


def build_fallback_resolved_intent(
    original_instruction: str,
    conversation_history: str,
) -> ResolvedIntentOutput:
    """
    Build a minimal valid resolved intent when Gemini cannot resolve cleanly.
    Used only as a last-resort after max turns are exhausted.
    """
    return ResolvedIntentOutput(
        action="execute_instruction",
        parameters={"original_instruction": original_instruction},
        resolved_instruction=original_instruction.strip(),
        direct_answer=None,
    )
