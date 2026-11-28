"""
Context analyzer & Session Context Memory engine.

Maintains strictly isolated per-conversation memory of people, objects, dates,
actions, and references with exact source-message attribution. Resolves
pronouns and ordinals ("him", "that file", "the second one") using prior session
messages and flags conflicting or unclear references for targeted clarification.
"""

import re
from typing import Optional

from app.database.connection import get_connection
from app.models.schemas import (
    ContextMemoryEntity,
    ReferenceResolutionItem,
    SessionContextMemory,
)

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_NAMED_PERSON_RE = re.compile(
    r"\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b"
)
_PREPOSITION_PERSON_RE = re.compile(
    r"\b(?:to|from|with|for|ask|tell|email|notify|cc)\s+([A-Z][a-z]{2,})(?!\s+[A-Z][a-z]{2,})\b"
)
_FILE_OR_ID_RE = re.compile(
    r"\b(?:MAT-[A-Z0-9-]+|ORD-[0-9]+|[A-Za-z0-9_.-]+\.(?:pdf|xlsx|csv|json|yaml|yml|md|txt|docx|py|ts))\b",
    re.IGNORECASE,
)
_REPORT_OBJECT_RE = re.compile(
    r"\b((?:Q[1-4]\s+)?(?:[A-Z][a-z]+\s+){0,2}(?:report|document|file|spreadsheet|sheet|proposal|deployment|cluster|service|order|allocation))\b",
    re.IGNORECASE,
)
_DATE_RE = re.compile(
    r"\b(?:\d{4}-\d{2}-\d{2}|today|tomorrow|yesterday|next week|next month|next friday|monday|tuesday|wednesday|thursday|friday|\d{1,2}:\d{2}\s*(?:AM|PM|UTC)?|Q[1-4](?:\s+20\d{2})?)\b",
    re.IGNORECASE,
)
_ACTION_RE = re.compile(
    r"\b(send|forward|email|deploy|migrate|restrict|allocate|reallocate|reorder|draft|approve|export|update|schedule|rollback|review)\b",
    re.IGNORECASE,
)

_NON_PERSON_PAIRS = {
    "q3 report",
    "q4 report",
    "q3 finance",
    "finance report",
    "status review",
    "resolve x",
    "legacy auth",
    "initial context",
    "emergency override",
    "purchase order",
}


def extract_entities_from_text(
    session_id: str,
    text: str,
    turn_number: int,
    source_role: str,
) -> list[ContextMemoryEntity]:
    """Extract typed entities (people, objects, dates, actions) attributed to their source message."""
    cleaned = text.strip()
    if not cleaned:
        return []

    entities: list[ContextMemoryEntity] = []
    seen_vals: set[tuple[str, str]] = set()

    def _push(category: str, label: str, val: str) -> None:
        v = val.strip()
        if not v:
            return
        key = (category, v.lower())
        if key in seen_vals:
            return
        seen_vals.add(key)
        entities.append(
            ContextMemoryEntity(
                id=f"{session_id}-t{turn_number}-{category}-{len(entities) + 1}",
                session_id=session_id,
                category=category,  # type: ignore[arg-type]
                label=label,
                value=v,
                source_turn=turn_number,
                source_role=source_role,
                source_message=cleaned,
            )
        )

    # 1. People (emails, full names, or single names after communication verbs/prepositions)
    for m in _EMAIL_RE.findall(cleaned):
        _push("person", "Email / Person", m)
    for m in _NAMED_PERSON_RE.findall(cleaned):
        if m.lower() not in _NON_PERSON_PAIRS:
            _push("person", "Person", m)
    for m in _PREPOSITION_PERSON_RE.findall(cleaned):
        if m.lower() not in {"today", "tomorrow", "friday", "monday", "report", "staging", "production"}:
            _push("person", "Person Reference", m)

    # 2. Objects (files, SKU/ORD IDs, named documents/services)
    for m in _FILE_OR_ID_RE.findall(cleaned):
        _push("object", "File / Identifier", m)
    for m in _REPORT_OBJECT_RE.findall(cleaned):
        phrase = re.sub(r"\s+", " ", m).strip()
        stripped = re.sub(
            r"^(?:(?:please|send|email|forward|share|prepare|draft|check|update|review|export)\s+)+",
            "",
            phrase,
            flags=re.IGNORECASE,
        ).strip()
        stripped_no_art = re.sub(r"^(?:the|that|this|a|an)\s+", "", stripped, flags=re.IGNORECASE).strip()
        if (
            len(stripped_no_art) >= 4
            and stripped_no_art.lower()
            not in {"report", "document", "file", "sheet", "spreadsheet", "proposal", "invoice", "deployment", "allocation"}
            and stripped.lower()
            not in {"the report", "that report", "the file", "that file", "the sheet", "the document"}
        ):
            _push("object", "Artifact / Object", stripped)

    # 3. Dates / Timing
    for m in _DATE_RE.findall(cleaned):
        _push("date", "Date / Window", m)

    # 4. Actions
    for m in _ACTION_RE.findall(cleaned):
        _push("action", "Action", m.lower())

    return entities


def resolve_session_references(
    latest_instruction: str,
    prior_entities: list[ContextMemoryEntity],
) -> tuple[list[ReferenceResolutionItem], list[ReferenceResolutionItem]]:
    """
    Resolve pronouns and ordinal references ('him', 'her', 'that file', 'the second one', 'then')
    against prior entities stored exclusively in this session.
    Returns (resolved_references, conflicting_or_unclear_references).
    """
    text = latest_instruction.strip()
    lower = text.lower()
    if not lower:
        return [], []

    resolved: list[ReferenceResolutionItem] = []
    conflicts: list[ReferenceResolutionItem] = []

    def _dedup_entities(cat: str) -> list[ContextMemoryEntity]:
        by_val: dict[str, ContextMemoryEntity] = {}
        for ent in prior_entities:
            if ent.category == cat:
                by_val[ent.value.lower()] = ent
        return list(by_val.values())

    person_cands = _dedup_entities("person")
    object_cands = _dedup_entities("object")
    date_cands = _dedup_entities("date")

    # 1. Personal pronouns ('him', 'her') with gender compatibility checking
    if re.search(r"\b(him|her)\b", lower):
        token = "him" if re.search(r"\bhim\b", lower) else "her"
        expected_gender = "male" if token == "him" else "female"
        compatible_cands: list[ContextMemoryEntity] = []
        try:
            from app.config import get_settings
            from app.core.identity_memory import search_people

            db_for_gender = get_settings().database_path
            for pc in person_cands:
                hits, _ = search_people(db_for_gender, pc.value)
                if len(hits) == 1 and hits[0].gender in ("male", "female") and hits[0].gender != expected_gender:
                    continue
                compatible_cands.append(pc)
        except Exception:
            compatible_cands = list(person_cands)

        if len(compatible_cands) == 1:
            match = compatible_cands[0]
            resolved.append(
                ReferenceResolutionItem(
                    reference_token=token,
                    category="person",
                    status="resolved",
                    resolved_value=match.value,
                    candidates=[match.value],
                    source_turn=match.source_turn,
                    source_message=match.source_message,
                    explanation=f"Resolved “{token}” to “{match.value}” from Turn {match.source_turn}.",
                )
            )
        elif len(compatible_cands) > 1:
            names = [c.value for c in compatible_cands]
            conflicts.append(
                ReferenceResolutionItem(
                    reference_token=token,
                    category="person",
                    status="conflicting",
                    resolved_value=None,
                    candidates=names,
                    explanation=f"Found multiple people in session memory ({', '.join(names)}); “{token}” could refer to more than one person.",
                    clarification_question=f"Session memory includes multiple people ({', '.join(names)}). Who does “{token}” refer to?",
                )
            )
        else:
            conflicts.append(
                ReferenceResolutionItem(
                    reference_token=token,
                    category="person",
                    status="unclear",
                    resolved_value=None,
                    candidates=[],
                    explanation=f"No compatible person exists in current session memory to bind “{token}”.",
                    clarification_question=f"Who does “{token}” refer to in this request?",
                )
            )

    # 2. Ordinal references ('the first one', 'the second one', 'the latter')
    ord_match = re.search(
        r"\b(the\s+first\s+one|the\s+second\s+one|the\s+1st\s+one|the\s+2nd\s+one|the\s+latter|the\s+former)\b",
        lower,
    )
    if ord_match:
        token = ord_match.group(1)
        idx = 1 if ("second" in token or "2nd" in token or "latter" in token) else 0
        # Prefer objects (e.g., two files/reports/SKUs), otherwise people
        pool = object_cands if len(object_cands) >= 2 else (person_cands if len(person_cands) >= 2 else object_cands or person_cands)
        if len(pool) > idx and len(pool) >= 2:
            chosen = pool[idx]
            resolved.append(
                ReferenceResolutionItem(
                    reference_token=token,
                    category="ordinal",
                    status="resolved",
                    resolved_value=chosen.value,
                    candidates=[c.value for c in pool],
                    source_turn=chosen.source_turn,
                    source_message=chosen.source_message,
                    explanation=f"Resolved ordinal “{token}” to item #{idx + 1} (“{chosen.value}”) from Turn {chosen.source_turn}.",
                )
            )
        else:
            cands = [c.value for c in pool]
            conflicts.append(
                ReferenceResolutionItem(
                    reference_token=token,
                    category="ordinal",
                    status="unclear",
                    resolved_value=None,
                    candidates=cands,
                    explanation=f"Cannot resolve “{token}” reliably because session memory has {len(pool)} candidate(s).",
                    clarification_question=f"Which specific item do you mean by “{token}”?",
                )
            )

    # 3. Object references ('that file', 'that report', 'that document', 'the sheet', 'it')
    obj_ref_match = re.search(
        r"\b(that\s+file|that\s+report|that\s+document|that\s+sheet|the\s+second\s+file|this\s+file)\b",
        lower,
    )
    if obj_ref_match:
        token = obj_ref_match.group(1)
        if len(object_cands) == 1:
            match = object_cands[0]
            resolved.append(
                ReferenceResolutionItem(
                    reference_token=token,
                    category="object",
                    status="resolved",
                    resolved_value=match.value,
                    candidates=[match.value],
                    source_turn=match.source_turn,
                    source_message=match.source_message,
                    explanation=f"Resolved “{token}” to “{match.value}” from Turn {match.source_turn}.",
                )
            )
        elif len(object_cands) > 1:
            vals = [c.value for c in object_cands]
            conflicts.append(
                ReferenceResolutionItem(
                    reference_token=token,
                    category="object",
                    status="conflicting",
                    resolved_value=None,
                    candidates=vals,
                    explanation=f"Multiple objects remembered ({', '.join(vals)}); “{token}” is ambiguous without selection.",
                    clarification_question=f"Which object does “{token}” refer to: {', '.join(vals)}?",
                )
            )
        else:
            conflicts.append(
                ReferenceResolutionItem(
                    reference_token=token,
                    category="object",
                    status="unclear",
                    resolved_value=None,
                    candidates=[],
                    explanation=f"No matching file or artifact found in current session memory for “{token}”.",
                    clarification_question=f"Which file or document do you mean by “{token}”?",
                )
            )

    # 4. Date references ('then', 'that date', 'that window')
    date_ref_match = re.search(r"\b(that\s+date|that\s+window|same\s+time)\b", lower)
    if date_ref_match:
        token = date_ref_match.group(1)
        if len(date_cands) == 1:
            match = date_cands[0]
            resolved.append(
                ReferenceResolutionItem(
                    reference_token=token,
                    category="date",
                    status="resolved",
                    resolved_value=match.value,
                    candidates=[match.value],
                    source_turn=match.source_turn,
                    source_message=match.source_message,
                    explanation=f"Resolved “{token}” to “{match.value}” from Turn {match.source_turn}.",
                )
            )
        elif len(date_cands) > 1:
            vals = [c.value for c in date_cands]
            conflicts.append(
                ReferenceResolutionItem(
                    reference_token=token,
                    category="date",
                    status="conflicting",
                    resolved_value=None,
                    candidates=vals,
                    explanation=f"Multiple dates/windows remembered ({', '.join(vals)}).",
                    clarification_question=f"Which date does “{token}” refer to: {', '.join(vals)}?",
                )
            )

    return resolved, conflicts


def build_session_memory_bundle(
    db_path: str,
    conversation_id: str,
    focus_text: Optional[str] = None,
) -> tuple[SessionContextMemory, str, int, list[str]]:
    """
    Build strictly session-isolated context memory, formatted prompt summary,
    turn_count, and asked_questions list for a single conversation_id.
    """
    with get_connection(db_path) as conn:
        conv_row = conn.execute(
            "SELECT turn_count, initial_context, original_instruction FROM conversations WHERE id = ?;",
            (conversation_id,),
        ).fetchone()
        turn_count: int = int(conv_row["turn_count"]) if conv_row else 1
        initial_context: Optional[str] = conv_row["initial_context"] if conv_row else None
        original_instruction: str = conv_row["original_instruction"] if conv_row else ""

        msg_rows = conn.execute(
            """
            SELECT role, content, turn_number
            FROM messages
            WHERE conversation_id = ?
            ORDER BY turn_number ASC, id ASC;
            """,
            (conversation_id,),
        ).fetchall()

        q_rows = conn.execute(
            """
            SELECT question_text, answered, turn_number
            FROM clarification_questions
            WHERE conversation_id = ?
            ORDER BY turn_number ASC, id ASC;
            """,
            (conversation_id,),
        ).fetchall()

    lines: list[str] = []
    all_entities: list[ContextMemoryEntity] = []

    if initial_context and initial_context.strip():
        lines.append(f"Initial Context: {initial_context.strip()}")
        all_entities.extend(
            extract_entities_from_text(
                conversation_id, initial_context.strip(), turn_number=0, source_role="context"
            )
        )

    user_texts: list[tuple[int, str]] = []
    for row in msg_rows:
        prefix = "User" if row["role"] == "user" else "ResolveX"
        lines.append(f"[Turn {row['turn_number']}] {prefix}: {row['content']}")
        if row["role"] == "user":
            t_num = int(row["turn_number"])
            user_texts.append((t_num, str(row["content"])))

    # Extract entities from all prior turns before resolving references inside the latest turn
    target = focus_text or (user_texts[-1][1] if user_texts else original_instruction)
    if len(user_texts) > 1:
        prior_pool: list[ContextMemoryEntity] = list(all_entities)
        for t_num, content in user_texts[:-1]:
            extracted = extract_entities_from_text(conversation_id, content, t_num, "user")
            prior_pool.extend(extracted)
            all_entities.extend(extracted)
        latest_t, latest_content = user_texts[-1]
        latest_extracted = extract_entities_from_text(
            conversation_id, latest_content, latest_t, "user"
        )
        all_entities.extend(latest_extracted)
    else:
        prior_pool = list(all_entities)
        for t_num, content in user_texts:
            all_entities.extend(
                extract_entities_from_text(conversation_id, content, t_num, "user")
            )

    resolved_refs, ref_conflicts = resolve_session_references(target, prior_pool)

    if resolved_refs:
        lines.append(
            "Resolved Session References: "
            + "; ".join(f"{r.reference_token} -> {r.resolved_value} (Turn {r.source_turn})" for r in resolved_refs)
        )
    if ref_conflicts:
        lines.append(
            "Reference Conflicts Requiring Clarification: "
            + "; ".join(c.explanation for c in ref_conflicts)
        )

    context_summary = "\n".join(lines) if lines else "No prior context."
    asked_questions: list[str] = [dict(r)["question_text"] for r in q_rows]

    memory = SessionContextMemory(
        session_id=conversation_id,
        entities=all_entities,
        resolved_references=resolved_refs,
        reference_conflicts=ref_conflicts,
        turn_count=turn_count,
    )
    return memory, context_summary, turn_count, asked_questions


def build_context_summary(
    db_path: str,
    conversation_id: str,
) -> tuple[str, int, list[str]]:
    """
    Retrieve messages and prior Q&A for a conversation and format them into
    a compact history string suitable for injection into a Gemini prompt.

    Returns:
        (context_summary_str, turn_count, asked_questions_list)
    """
    _memory, context_summary, turn_count, asked_questions = build_session_memory_bundle(
        db_path, conversation_id
    )
    return context_summary, turn_count, asked_questions
