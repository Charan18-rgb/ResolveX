"""
Clarification engine — deduplication and turn-limit enforcement.
Pure Python; no database or Gemini calls.
"""

MAX_CLARIFICATION_TURNS = 3


def _normalize(question: str) -> str:
    """Normalize a question string for deduplication comparison."""
    return question.strip().lower().rstrip("?").strip()


def filter_new_questions(
    proposed_questions: list[str],
    already_asked_normalized: list[str],
) -> list[str]:
    """
    Return only questions that have not already been asked (deduplicated).
    Comparison is case-insensitive and strips trailing punctuation.
    """
    seen = set(already_asked_normalized)
    new: list[str] = []
    for q in proposed_questions:
        norm = _normalize(q)
        if norm not in seen:
            seen.add(norm)
            new.append(q)
    return new[:3]  # Cap at 3 questions per turn


def enforce_max_turns(turn_count: int, max_turns: int = MAX_CLARIFICATION_TURNS) -> bool:
    """
    Return True if we have reached or exceeded the max clarification turns,
    meaning the conversation must be force-resolved on the next response.
    """
    return turn_count >= max_turns


def normalize_questions(questions: list[str]) -> list[str]:
    """Return a list of normalized question strings for storage and comparison."""
    return [_normalize(q) for q in questions]
