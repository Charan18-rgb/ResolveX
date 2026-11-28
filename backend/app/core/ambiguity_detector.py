"""
Ambiguity detector — calls Gemini with structured output, coordinates stateful
material-dispatch and document/relationship/pronoun resolvers, normalizes questions,
and falls back deterministically when AI is unavailable.
"""

import logging
import re
from dataclasses import dataclass
from typing import Any, Optional

from app.core.clarification_engine import (
    normalize_and_prioritize_questions,
    sanitize_clarification_question,
)
from app.core.dispatch_resolver import resolve_material_dispatch_with_meta
from app.core.local_analyzer import (
    _looks_like_random_or_nonsense,
    clarify_locally,
    match_local,
    offline_fallback,
)
from app.core.send_resolver import resolve_document_or_fact_turn
from app.models.ai_schemas import GeminiAnalysisOutput
from app.services import gemini_service
from app.services.prompts import build_analysis_prompt, build_clarification_prompt

logger = logging.getLogger(__name__)

AnalysisSource = str  # "gemini" | "local" | "offline_fallback" | "system"


def _reconcile_communication(
    instruction: str, result: GeminiAnalysisOutput
) -> GeminiAnalysisOutput:
    """Deterministic validation layer for person-directed messaging."""
    try:
        from app.core.communication_parser import communication_analysis

        comm = communication_analysis(instruction)
    except Exception:
        logger.exception("Communication reconciliation failed")
        return result
    if comm is None:
        return result
    if comm.needs_clarification == result.needs_clarification:
        if comm.classification == "context_dependent" and result.classification != "context_dependent":
            return comm
        return result
    return comm


_ANAPHORIC_OPENER = re.compile(
    r"^\s*(yes|yeah|yep|no|do|does|did|repeat|reply|use|apply|proceed|undo|"
    r"the opposite|that one|this one|it|that|those|same|let)\b",
    re.IGNORECASE,
)


def _relabel_anaphoric(
    instruction: str, result: GeminiAnalysisOutput
) -> GeminiAnalysisOutput:
    if result.classification != "ambiguous" or result.needs_clarification is False:
        return result
    if len(instruction.strip().split()) <= 8 and _ANAPHORIC_OPENER.match(instruction):
        return result.model_copy(update={"classification": "context_dependent"})
    return result


def _clean_analysis_questions(
    instruction: str, result: GeminiAnalysisOutput
) -> GeminiAnalysisOutput:
    """Normalize and deduplicate clarification questions returned by any engine."""
    if not result.clarification_questions:
        return result
    m_verb = re.search(r"\b(send|email|forward|share|ship|dispatch|transfer|draft)\b", instruction, re.IGNORECASE)
    verb = m_verb.group(1).lower() if m_verb else None
    sanitized = [
        sanitize_clarification_question(q, action=verb)
        for q in result.clarification_questions
    ]
    cleaned = [q for q in sanitized if q]
    if not cleaned:
        cleaned = result.clarification_questions[:1]
    elif len(cleaned) > 1:
        cleaned = normalize_and_prioritize_questions(cleaned, single_turn=True, action=verb)
    return result.model_copy(update={"clarification_questions": cleaned})


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
    matched = match_local(
        instruction, context_summary, multi_intent_authoritative=multi_intent_authoritative
    )
    if matched is not None and matched.authoritative:
        return matched.analysis
    return None


def _extract_user_turns_from_summary(context_summary: str) -> list[str]:
    turns: list[str] = []
    for line in (context_summary or "").splitlines():
        m = re.match(r"^\[Turn\s+\d+\]\s+User:\s*(.+)$", line)
        if m:
            turns.append(m.group(1).strip())
    return turns


def detect_ambiguity_full(
    db_path: str,
    instruction: str,
    conversation_id: str,
    context_summary: str,
    session_entities: Optional[list[Any]] = None,
) -> tuple[GeminiAnalysisOutput, bool, Optional[str], AnalysisSource, Optional[dict[str, Any]]]:
    """Full detection pipeline returning analysis + fallback flags + slot metadata."""
    # 1. Material dispatch workflow
    dispatch = resolve_material_dispatch_with_meta(
        db_path,
        instruction,
        [instruction],
        conversation_id=conversation_id,
        session_entities=session_entities,
    )
    if dispatch is not None:
        analysis_d, meta_d = dispatch
        return analysis_d, False, None, "local", meta_d

    # 2. Identity fact assertions & targeted pronoun/relationship/document send
    doc_or_fact = resolve_document_or_fact_turn(
        db_path,
        conversation_id=conversation_id,
        original_instruction=instruction,
        new_response=None,
        session_entities=session_entities or [],
        force_fallback=False,
    )
    if doc_or_fact is not None:
        analysis_s, meta_s = doc_or_fact
        return analysis_s, False, None, "local", meta_s

    # 2b. Random / gibberish / non-actionable input guard (never waste LLM calls or invent actions)
    if _looks_like_random_or_nonsense(instruction):
        return offline_fallback(instruction), False, None, "local", None

    # 3. Gemini structured analysis
    prompt = build_analysis_prompt(instruction, context_summary)
    result, error = gemini_service.call_gemini_structured(
        prompt, GeminiAnalysisOutput
    )

    if error or result is None:
        doc_fb = resolve_document_or_fact_turn(
            db_path,
            conversation_id=conversation_id,
            original_instruction=instruction,
            new_response=None,
            session_entities=session_entities or [],
            force_fallback=True,
        )
        if doc_fb is not None:
            analysis_fb, meta_fb = doc_fb
            return analysis_fb, True, error or "Deterministic local resolver active.", "local", meta_fb

        local = _prefer_local(instruction, context_summary)
        if local is not None:
            return _clean_analysis_questions(instruction, local), True, error or "Deterministic local resolver active.", "local", None
        matched = match_local(instruction, context_summary)
        if matched is not None:
            return _clean_analysis_questions(instruction, matched.analysis), True, error or "Deterministic local resolver active.", "local", None
        return (
            offline_fallback(instruction),
            True,
            error or "Gemini returned empty analysis.",
            "offline_fallback",
            None,
        )

    if result.classification == "clear":
        result = result.model_copy(
            update={"needs_clarification": False, "clarification_questions": []}
        )

    local = _prefer_local(instruction, context_summary)
    if local is not None and result.needs_clarification and not local.needs_clarification:
        result = local

    reconciled = _reconcile_communication(instruction, result)
    relabeled = _relabel_anaphoric(instruction, reconciled)
    return _clean_analysis_questions(instruction, relabeled), False, None, "gemini", None


def detect_ambiguity_with_status(
    db_path: str,
    instruction: str,
    conversation_id: str,
    context_summary: str,
) -> tuple[GeminiAnalysisOutput, bool, Optional[str], AnalysisSource]:
    a, b, c, d, _meta = detect_ambiguity_full(
        db_path, instruction, conversation_id, context_summary
    )
    return a, b, c, d


def detect_ambiguity(
    db_path: str,
    instruction: str,
    conversation_id: str,
    context_summary: str,
) -> DetectionResult:
    result, _is_fallback, _err, source = detect_ambiguity_with_status(
        db_path, instruction, conversation_id, context_summary
    )
    return DetectionResult(result, source)


def clarify_ambiguity_full(
    db_path: str,
    original_instruction: str,
    conversation_history: str,
    new_response: str,
    pending_questions: list[str],
    *,
    conversation_id: Optional[str] = None,
    session_entities: Optional[list[Any]] = None,
) -> tuple[GeminiAnalysisOutput, bool, Optional[str], AnalysisSource, Optional[dict[str, Any]]]:
    """Re-analyze after a clarification turn preserving active slot workflows."""
    prior_user_turns = _extract_user_turns_from_summary(conversation_history) or [original_instruction]

    dispatch = resolve_material_dispatch_with_meta(
        db_path,
        original_instruction=original_instruction,
        prior_user_turns=prior_user_turns,
        latest_turn=new_response,
        conversation_id=conversation_id,
        session_entities=session_entities,
    )
    if dispatch is not None:
        analysis_d, meta_d = dispatch
        return analysis_d, False, None, "local", meta_d

    doc_turn = resolve_document_or_fact_turn(
        db_path,
        conversation_id=conversation_id,
        original_instruction=original_instruction,
        new_response=new_response,
        session_entities=session_entities or [],
        force_fallback=False,
    )
    if doc_turn is not None:
        analysis_s, meta_s = doc_turn
        return analysis_s, False, None, "local", meta_s

    from app.models.ai_schemas import InterpretationOutput, ResolvedIntentOutput

    # Handle explicit clickable interpretation selection ("Use interpretation: Keep cancel", etc.)
    interp_m = re.match(r"^\s*use\s+interpretation\s*:\s*(.+)$", new_response.strip(), re.IGNORECASE)
    if interp_m:
        chosen = interp_m.group(1).strip()
        resolved_out = GeminiAnalysisOutput(
            classification="context_dependent",
            ambiguity_types=[],
            needs_clarification=False,
            reasoning=f"User selected explicit interpretation: '{chosen}'.",
            interpretations=[
                InterpretationOutput(label=chosen, description="Selected by user during clarification.")
            ],
            missing_required_info=[],
            clarification_questions=[],
            resolved_intent=ResolvedIntentOutput(
                action="execute_resolved_interpretation",
                parameters={"selected_interpretation": chosen, "original_instruction": original_instruction},
                resolved_instruction=f"{original_instruction.strip()} — Interpretation: {chosen}",
                direct_answer=f"Resolved: \"{chosen}\" applied to \"{original_instruction.strip()}\". Recorded safely — no external action was executed automatically.",
            ),
        )
        return resolved_out, False, None, "local", None

    user_only_context = "\n".join(prior_user_turns)
    local = _prefer_local(
        f"{original_instruction}\n{new_response}",
        user_only_context,
        multi_intent_authoritative=False,
    )
    if local is not None:
        return _clean_analysis_questions(original_instruction, local), False, None, "local", None

    prompt = build_clarification_prompt(
        original_instruction, conversation_history, new_response, pending_questions
    )
    result, error = gemini_service.call_gemini_structured(
        prompt, GeminiAnalysisOutput
    )

    if error or result is None:
        doc_fb = resolve_document_or_fact_turn(
            db_path,
            conversation_id=conversation_id,
            original_instruction=original_instruction,
            new_response=new_response,
            session_entities=session_entities or [],
            force_fallback=True,
        )
        if doc_fb is not None:
            analysis_fb, meta_fb = doc_fb
            return analysis_fb, True, error or "Deterministic local resolver active.", "local", meta_fb

        analysis, source = clarify_locally(
            original_instruction, new_response, pending_questions
        )
        return _clean_analysis_questions(original_instruction, analysis), True, error or "Gemini unavailable during clarification.", source, None

    if result.classification == "clear":
        result = result.model_copy(
            update={"needs_clarification": False, "clarification_questions": []}
        )

    return _clean_analysis_questions(original_instruction, result), False, None, "gemini", None


def detect_ambiguity_with_clarification_status(
    db_path: str,
    original_instruction: str,
    conversation_history: str,
    new_response: str,
    pending_questions: list[str],
) -> tuple[GeminiAnalysisOutput, bool, Optional[str], AnalysisSource]:
    a, b, c, d, _meta = clarify_ambiguity_full(
        db_path,
        original_instruction,
        conversation_history,
        new_response,
        pending_questions,
    )
    return a, b, c, d
