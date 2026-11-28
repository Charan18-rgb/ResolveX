"""
Clarification engine — question sanitization, priority selection, deduplication,
and turn-limit enforcement. Pure Python; no database or Gemini calls.
"""

import re
from typing import Optional

MAX_CLARIFICATION_TURNS = 3

_BOILERPLATE_PREFIX_RE = re.compile(
    r"^\s*(?:i need a bit more detail(?:s)?(?: to continue(?: this request)?)?[:.\-\s]*|"
    r"please clarify[:.\-\s]*|could you clarify[:.\-\s]*|"
    r"to proceed,\s*please clarify[:.\-\s]*)",
    re.IGNORECASE,
)

_BOILERPLATE_SUFFIX_RE = re.compile(
    r"\s*(?:please give the person'?s full name(?: and (?:team|department))?\.?|"
    r"please provide full name and team\.?)\s*$",
    re.IGNORECASE,
)


def _normalize(question: str) -> str:
    """Normalize a question string for deduplication comparison."""
    return question.strip().lower().rstrip("?").strip()


def sanitize_clarification_question(
    question: str,
    action: Optional[str] = None,
    obj: Optional[str] = None,
) -> str:
    """Normalize Gemini or fallback questions into clean, grammatical, single-question prose.

    - Removes redundant preambles ('I need a bit more detail...')
    - Splits malformed concatenated '?please' fragments
    - Repairs broken phrasing ('who should I receive it?') into grammatical 'Who should I send <obj> to?'
    - Ensures proper sentence casing and trailing '?'
    """
    q = re.sub(r"\s+", " ", (question or "").strip())
    if not q:
        return ""

    q = _BOILERPLATE_PREFIX_RE.sub("", q).strip()
    # Fix missing spaces after punctuation such as "receive it?please give"
    q = re.sub(r"\?(?=[A-Za-z])", "? ", q)
    q = _BOILERPLATE_SUFFIX_RE.sub("", q).strip()

    # Keep only the clean first question sentence if malformed clauses were joined after '?'
    if "?" in q:
        head, tail = q.split("?", 1)
        if tail.strip().lower().startswith(("please give", "please provide full name")):
            q = f"{head.strip()}?"

    verb = (action or "send").strip().lower()
    if verb not in {"send", "email", "forward", "share", "ship", "dispatch", "transfer", "issue", "draft", "deliver"}:
        verb = "send"
    target_obj = (obj or "it").strip()

    # Fix broken grammar like "who should I receive it?" or "who should receive it?"
    if re.search(r"\bwho\s+should\s+(?:i\s+)?receive\s+it\b", q, re.IGNORECASE):
        q = f"Who should I {verb} {target_obj} to?"
    elif re.search(r"\bwho\s+should\s+receive\s+(?:it|this|the\s+\w+)\b", q, re.IGNORECASE):
        q = f"Who should I {verb} {target_obj} to?"

    # Strip leading numbers/bullets left by prompts
    q = re.sub(r"^(?:[-*]|\d+[.)])\s*", "", q).strip()
    if not q:
        return ""
    q = q[0].upper() + q[1:]
    if not q.endswith("?") and not q.endswith("."):
        q += "?"
    return q


def _question_priority(q: str) -> tuple[int, int]:
    """Rank clarification questions so recipient > object/material > quantity > destination > time."""
    ql = q.lower()
    if any(k in ql for k in ("who ", "whom ", "which ravi", "which rahul", "which supplier", "which classmate", "whose ", "do you mean", "recipient")):
        return (0, len(ql))
    if any(k in ql for k in ("which report", "which document", "which stock", "which material", "which product", "which screw jack", "what stock", "what material", "what object", "what item", "no material matching")):
        return (1, len(ql))
    if any(k in ql for k in ("how many", "what quantity", "quantity")):
        return (2, len(ql))
    if any(k in ql for k in ("where ", "destination", "address", "bay", "which location")):
        return (3, len(ql))
    if any(k in ql for k in ("when ", "what time", "what date", "which date")):
        return (4, len(ql))
    return (5, len(ql))


def normalize_and_prioritize_questions(
    questions: list[str],
    *,
    single_turn: bool = True,
    action: Optional[str] = None,
    obj: Optional[str] = None,
) -> list[str]:
    """Sanitize, deduplicate, and pick highest-priority clarification prompt(s)."""
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in questions:
        q = sanitize_clarification_question(raw, action=action, obj=obj)
        if not q:
            continue
        norm = _normalize(q)
        if norm not in seen:
            seen.add(norm)
            cleaned.append(q)
    cleaned.sort(key=_question_priority)
    if single_turn:
        return cleaned[:1]
    return cleaned[:3]


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
        clean_q = sanitize_clarification_question(q) or q
        norm = _normalize(clean_q)
        if norm not in seen:
            seen.add(norm)
            new.append(clean_q)
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
