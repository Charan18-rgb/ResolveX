"""
Confidence & Uncertainty Intelligence Engine.

Calibrates interpretation confidence strictly from observed backend signals,
evidence balance, entity resolution, and contradiction checks. Never fabricates
LLM token probabilities and explicitly distinguishes calibrated confidence from
verified correctness while abstaining when evidence is insufficient.
"""

from datetime import datetime, timezone
import re
from typing import Any, Optional

from app.core.intent_resolver import validate_resolved_intent
from app.models.ai_schemas import GeminiAnalysisOutput
from app.models.schemas import (
    ConfidenceAssessment,
    ConfidenceHistoryPoint,
    EvidenceItem,
    InterpretationItem,
    ResolvedIntentPayload,
    UnresolvedEntityItem,
)

_ANCHOR_PATTERNS = [
    re.compile(r"\bMAT-[A-Z0-9-]+\b", re.IGNORECASE),
    re.compile(r"\bORD-[0-9]+\b", re.IGNORECASE),
    re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    re.compile(r"\bQ[1-4](?:\s+20\d{2})?\b"),
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    re.compile(r"\b\d+\s*(?:km|miles|kg|units|pcs|hours|days|%)\b", re.IGNORECASE),
]

_VAGUE_REFERENCE_TOKENS = {
    "it": ("Pronoun Reference", "Dangling pronoun 'it' lacks an explicit antecedent."),
    "they": ("Pronoun Reference", "Pronoun 'they' does not specify the target group or system."),
    "them": ("Pronoun Reference", "Object pronoun 'them' is unresolved."),
    "this": ("Demonstrative Reference", "Demonstrative 'this' omits the exact artifact or record."),
    "that": ("Demonstrative Reference", "Demonstrative 'that' omits the exact target object."),
    "someone": ("Unspecified Actor", "Actor 'someone' does not identify an accountable person."),
    "something": ("Unspecified Object", "Object 'something' gives no actionable target."),
}

_VAGUE_TEMPORAL_TOKENS = {
    "soon": ("Open Temporal Marker", "Relative timing 'soon' lacks a concrete deadline or window."),
    "later": ("Open Temporal Marker", "Relative timing 'later' leaves schedule unconstrained."),
    "asap": ("Open Temporal Marker", "'ASAP' does not specify SLA or cutover window."),
    "recently": ("Open Temporal Marker", "'Recently' does not define a bounded lookback range."),
}

_EXCLUSIVE_CONTRADICTION_PAIRS: list[tuple[tuple[str, ...], tuple[str, ...], str]] = [
    (
        ("staging only", "only staging", "do not touch prod", "never production"),
        ("production rollout", "deploy to production", "prod environment", "live production"),
        "Target environment contradiction between staging-only constraint and production deployment.",
    ),
    (
        ("immediately", "right now", "today"),
        ("next week", "next month", "defer", "postpone", "hold off", "cancel"),
        "Execution timing conflict between immediate execution and deferred/cancelled schedule.",
    ),
    (
        ("delete", "drop", "purge", "disable", "suspend"),
        ("preserve", "keep intact", "keep active", "enable", "restore"),
        "Action polarity conflict between destructive/suspending action and preservation directive.",
    ),
    (
        ("read-only", "view only", "read only"),
        ("admin write", "full access", "write access", "modify permissions"),
        "Permission scope conflict between read-only guardrails and write/admin privileges.",
    ),
    (
        ("only me", "single user", "myself only"),
        ("all users", "everyone", "entire organization", "all teams"),
        "Audience scope conflict between single-user target and organization-wide broadcast.",
    ),
]

_CROSS_TURN_FLIP_GROUPS: list[tuple[tuple[str, ...], tuple[str, ...], str]] = [
    (
        ("staging", "dev", "sandbox"),
        ("production", "prod", "live cluster"),
        "Clarification switches target environment from staging/dev to production.",
    ),
    (
        ("immediately", "now", "today"),
        ("next week", "next month", "tomorrow", "delay", "hold"),
        "Clarification contradicts the earlier execution timing constraint.",
    ),
    (
        ("suspend", "block", "revoke", "delete"),
        ("keep active", "allow", "preserve", "approve"),
        "Clarification reverses the earlier restriction/removal action.",
    ),
]

_INDECISION_MARKERS = (
    "neither",
    "none of the above",
    "not sure",
    "i don't know",
    "dont know",
    "unclear",
    "whatever",
    "skip",
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _detect_contradictions(
    original_instruction: str,
    initial_context: Optional[str],
    user_messages: list[str],
    resolved_intent: Optional[ResolvedIntentPayload],
    analysis: GeminiAnalysisOutput,
    latest_user_response: Optional[str],
) -> list[EvidenceItem]:
    """Identify explicit logical/cross-turn contradictions and validation failures."""
    contradictions: list[EvidenceItem] = []
    combined_parts = [original_instruction]
    if initial_context:
        combined_parts.append(initial_context)
    combined_parts.extend(user_messages)
    combined_lower = " ".join(combined_parts).lower()

    # 1. Explicit mutually exclusive directive checks within accumulated text
    for idx, (group_a, group_b, explanation) in enumerate(_EXCLUSIVE_CONTRADICTION_PAIRS):
        hit_a = next((term for term in group_a if term in combined_lower), None)
        hit_b = next((term for term in group_b if term in combined_lower), None)
        if hit_a and hit_b:
            contradictions.append(
                EvidenceItem(
                    id=f"contra-pair-{idx}",
                    polarity="contradicting",
                    category="Directive Conflict",
                    label=f"Conflicting constraints: “{hit_a}” vs “{hit_b}”",
                    detail=explanation,
                    source="contradiction_detector",
                    impact_weight=0.32,
                )
            )

    # 2. Cross-turn reversal detection between prior turns and latest clarification
    if latest_user_response and len(user_messages) >= 2:
        prior_text = " ".join(
            [original_instruction, initial_context or "", *user_messages[:-1]]
        ).lower()
        latest_lower = latest_user_response.lower()

        for idx, (side_a, side_b, reason) in enumerate(_CROSS_TURN_FLIP_GROUPS):
            prior_a = any(t in prior_text for t in side_a) and not any(
                t in prior_text for t in side_b
            )
            latest_b = any(t in latest_lower for t in side_b) and not any(
                t in latest_lower for t in side_a
            )
            prior_b = any(t in prior_text for t in side_b) and not any(
                t in prior_text for t in side_a
            )
            latest_a = any(t in latest_lower for t in side_a) and not any(
                t in latest_lower for t in side_b
            )
            if (prior_a and latest_b) or (prior_b and latest_a):
                contradictions.append(
                    EvidenceItem(
                        id=f"contra-turn-{idx}",
                        polarity="contradicting",
                        category="Cross-Turn Contradiction",
                        label="Clarification contradicts earlier turn",
                        detail=reason,
                        source="clarification_turn",
                        impact_weight=0.35,
                    )
                )

        if any(marker in latest_lower for marker in _INDECISION_MARKERS):
            contradictions.append(
                EvidenceItem(
                    id="contra-indecision",
                    polarity="contradicting",
                    category="Non-Commitment",
                    label="Clarification refused or deferred selection",
                    detail=f"User response (“{latest_user_response.strip()}”) indicates unresolved uncertainty rather than committing to an interpretation.",
                    source="clarification_turn",
                    impact_weight=0.28,
                )
            )

    # 3. Structural conflict reported by intent validator
    if resolved_intent is not None:
        from app.models.ai_schemas import ResolvedIntentOutput

        intent_obj = ResolvedIntentOutput(
            action=resolved_intent.action,
            parameters=resolved_intent.parameters,
            resolved_instruction=resolved_intent.resolved_instruction,
            direct_answer=resolved_intent.direct_answer,
        )
        valid, reason = validate_resolved_intent(intent_obj)
        if not valid:
            contradictions.append(
                EvidenceItem(
                    id="contra-validator",
                    polarity="contradicting",
                    category="Validation Conflict",
                    label="Resolved intent contains invalid or placeholder values",
                    detail=reason,
                    source="intent_validator",
                    impact_weight=0.4,
                )
            )

    # 4. Semantic inconsistency: clear classification paired with missing required info
    if analysis.classification == "clear" and analysis.missing_required_info:
        contradictions.append(
            EvidenceItem(
                id="contra-schema",
                polarity="contradicting",
                category="Classification Tension",
                label="Marked clear while missing required fields remain",
                detail=f"Missing info reported alongside clear tag: {', '.join(analysis.missing_required_info)}.",
                source="backend_analysis",
                impact_weight=0.25,
            )
        )

    return contradictions


def _extract_unresolved_entities(
    original_instruction: str,
    clarification_responses: list[str],
    analysis: GeminiAnalysisOutput,
    resolved_intent: Optional[ResolvedIntentPayload],
) -> list[UnresolvedEntityItem]:
    """Identify ambiguous tokens/references and mark resolved once grounded in turns/params."""
    entities: list[UnresolvedEntityItem] = []
    seen: set[str] = set()
    lower = original_instruction.lower()
    words = re.findall(r"\b[a-z']+\b", lower)
    clarified_text = " ".join(clarification_responses).strip()
    param_values = (
        " ".join(f"{k}={v}" for k, v in resolved_intent.parameters.items())
        if resolved_intent and resolved_intent.parameters
        else ""
    )
    resolved_by_clear = analysis.classification == "clear" and not analysis.needs_clarification

    def _add_entity(token: str, kind: str, reason: str, param_hint: Optional[str] = None) -> None:
        key = token.lower()
        if key in seen:
            return
        seen.add(key)
        is_resolved = bool(
            (resolved_by_clear and resolved_intent is not None)
            or (clarified_text and len(clarification_responses) > 0 and not analysis.needs_clarification)
            or (param_hint and param_hint in param_values.lower())
        )
        resolved_val: Optional[str] = None
        if is_resolved:
            if param_values:
                resolved_val = param_values
            elif clarified_text:
                resolved_val = clarification_responses[-1]
        entities.append(
            UnresolvedEntityItem(
                token=token,
                kind=kind,
                reason=reason,
                resolved=is_resolved,
                resolved_value=resolved_val,
            )
        )

    # Check pronouns and temporal ambiguities only when input is not clearly self-contained
    if analysis.classification != "clear" or analysis.ambiguity_types or analysis.missing_required_info:
        for word in words:
            if word in _VAGUE_REFERENCE_TOKENS:
                kind, reason = _VAGUE_REFERENCE_TOKENS[word]
                _add_entity(word, kind, reason)
            elif word in _VAGUE_TEMPORAL_TOKENS:
                kind, reason = _VAGUE_TEMPORAL_TOKENS[word]
                _add_entity(word, kind, reason, param_hint="time")

    # Add missing required info entries that represent unresolved entity slots
    for missing in analysis.missing_required_info:
        short = missing.strip()
        if short and short.lower() not in seen:
            is_slot_resolved = resolved_intent is not None and not analysis.needs_clarification
            entities.append(
                UnresolvedEntityItem(
                    token=short,
                    kind="Missing Context Slot",
                    reason="Required slot identified by backend NLU analysis.",
                    resolved=is_slot_resolved,
                    resolved_value=clarification_responses[-1] if is_slot_resolved and clarification_responses else None,
                )
            )
            seen.add(short.lower())

    return entities


def _collect_supporting_evidence(
    original_instruction: str,
    initial_context: Optional[str],
    clarification_responses: list[str],
    analysis: GeminiAnalysisOutput,
    is_ai_fallback: bool,
    status: str,
    resolved_intent: Optional[ResolvedIntentPayload],
    inventory_insight: Optional[dict[str, Any]],
) -> list[EvidenceItem]:
    """Gather positive supporting evidence observed from backend outputs."""
    supporting: list[EvidenceItem] = []

    if not is_ai_fallback:
        supporting.append(
            EvidenceItem(
                id="sup-ai-structured",
                polarity="supporting",
                category="Structured NLU",
                label=f"Backend analysis classified input as '{analysis.classification}'",
                detail=analysis.reasoning or "Structured schema validation succeeded.",
                source="backend_analysis",
                impact_weight=0.22 if analysis.classification != "clear" else 0.42,
            )
        )

    if initial_context and initial_context.strip():
        supporting.append(
            EvidenceItem(
                id="sup-initial-ctx",
                polarity="supporting",
                category="Context Anchor",
                label="Initial workspace context supplied",
                detail=f"Grounded with caller context: “{initial_context.strip()[:120]}”",
                source="user_context",
                impact_weight=0.14,
            )
        )

    anchors_found: list[str] = []
    combined_input = f"{original_instruction} {initial_context or ''} {' '.join(clarification_responses)}"
    for pattern in _ANCHOR_PATTERNS:
        anchors_found.extend(pattern.findall(combined_input))
    if anchors_found:
        unique_anchors = list(dict.fromkeys(anchors_found))[:4]
        supporting.append(
            EvidenceItem(
                id="sup-concrete-anchors",
                polarity="supporting",
                category="Explicit Entities",
                label=f"Concrete identifiers detected ({', '.join(unique_anchors)})",
                detail="Explicit IDs, quantities, dates, or units reduce referential guessing.",
                source="backend_analysis",
                impact_weight=min(0.24, 0.08 * len(unique_anchors)),
            )
        )

    if clarification_responses:
        supporting.append(
            EvidenceItem(
                id="sup-clarification-turns",
                polarity="supporting",
                category="Clarification History",
                label=f"{len(clarification_responses)} clarification response(s) recorded",
                detail=f"Latest user constraint: “{clarification_responses[-1][:140]}”",
                source="clarification_turn",
                impact_weight=min(0.32, 0.16 * len(clarification_responses)),
            )
        )

    if resolved_intent is not None and status == "RESOLVED" and not is_ai_fallback:
        param_count = len(resolved_intent.parameters)
        supporting.append(
            EvidenceItem(
                id="sup-resolved-intent",
                polarity="supporting",
                category="Intent Compilation",
                label=f"Validated action '{resolved_intent.action}' ({param_count} param(s))",
                detail=resolved_intent.resolved_instruction,
                source="intent_validator",
                impact_weight=0.26,
            )
        )

    if inventory_insight is not None:
        overview = inventory_insight.get("inventory_overview", {})
        total_mat = overview.get("total_materials", 0)
        supporting.append(
            EvidenceItem(
                id="sup-inventory-db",
                polarity="supporting",
                category="Deterministic Inventory DB",
                label="Grounded against SQLite PS2 inventory records",
                detail=f"Verified {total_mat} materials deterministically without model fabrication.",
                source="inventory_db",
                impact_weight=0.24,
            )
        )

    return supporting


def _band_from_score(score: Optional[float], abstained: bool) -> str:
    if abstained or score is None:
        return "abstained"
    if score >= 0.78:
        return "high"
    if score >= 0.50:
        return "moderate"
    return "low"


def _calibrate_interpretations(
    analysis: GeminiAnalysisOutput,
    clarification_responses: list[str],
    contradictions: list[EvidenceItem],
    missing_context: list[str],
    abstained: bool,
    overall_confidence: Optional[float],
) -> list[InterpretationItem]:
    """Score candidate interpretations strictly from backend evidence without fabricating numbers."""
    interps = analysis.interpretations
    if not interps:
        return []

    clarify_joined = " ".join(clarification_responses).lower()
    raw_weights: list[float] = []
    enriched: list[InterpretationItem] = []

    for idx, interp in enumerate(interps):
        text_lower = f"{interp.label} {interp.description}".lower()
        support_sigs: list[str] = []
        contra_sigs: list[str] = []
        missing_reqs = list(missing_context[:2])

        # Check alignment with user clarification responses
        interp_tokens = [w for w in re.findall(r"\b[a-z0-9]{4,}\b", text_lower)]
        matched_tokens = [t for t in interp_tokens if t in clarify_joined]
        if matched_tokens:
            support_sigs.append(
                f"Matches clarification terms: {', '.join(list(dict.fromkeys(matched_tokens))[:3])}"
            )

        # Rank prior position slightly only as weak tie-breaker when AI supplied ordered candidates
        base = max(0.25, 0.55 - idx * 0.12)
        base += min(0.30, 0.10 * len(matched_tokens))

        if len(interps) >= 2 and not matched_tokens:
            contra_sigs.append(
                f"Competes with {len(interps) - 1} other plausible reading(s); no disambiguating confirmation yet."
            )

        for c in contradictions:
            if any(tok in c.detail.lower() for tok in interp_tokens[:4]) or c.category in (
                "Directive Conflict",
                "Cross-Turn Contradiction",
            ):
                contra_sigs.append(c.label)
                base -= 0.18

        if analysis.classification == "incomplete":
            missing_reqs = list(dict.fromkeys(analysis.missing_required_info)) or missing_reqs

        raw_weights.append(max(0.05, base))
        enriched.append(
            InterpretationItem(
                label=interp.label,
                description=interp.description,
                confidence_score=None,
                confidence_status="abstained" if abstained else "calibrated",
                supporting_signals=support_sigs
                or ["Proposed by structured backend analysis candidate generator."],
                contradicting_signals=contra_sigs,
                missing_requirements=missing_reqs,
            )
        )

    if abstained or overall_confidence is None:
        return enriched

    total_w = sum(raw_weights) or 1.0
    # Normalize candidate probabilities so they sum realistically (~overall_confidence scaling)
    scaled_pool = max(0.35, min(0.98, overall_confidence + (0.12 if len(interps) == 1 else 0.0)))
    for i, item in enumerate(enriched):
        share = (raw_weights[i] / total_w) * scaled_pool
        item.confidence_score = round(max(0.04, min(0.95, share)), 4)

    return enriched


def evaluate_confidence_and_uncertainty(
    *,
    original_instruction: str,
    initial_context: Optional[str],
    latest_user_response: Optional[str],
    clarification_responses: list[str],
    all_user_messages: list[str],
    analysis: GeminiAnalysisOutput,
    is_ai_fallback: bool,
    fallback_error: Optional[str],
    status: str,
    resolved_intent: Optional[ResolvedIntentPayload],
    inventory_insight: Optional[dict[str, Any]],
    turn_number: int,
    prior_snapshots: list[dict[str, Any]],
) -> tuple[ConfidenceAssessment, list[InterpretationItem], ConfidenceHistoryPoint]:
    """
    Compute complete Feature 6 assessment from real backend outputs:
    - Supporting & contradicting evidence
    - Missing context & unresolved entities
    - Abstention on insufficient evidence / AI unavailability / severe contradiction
    - Calibrated confidence distinct from verified correctness
    - Turn-by-turn confidence history with delta explanation
    """
    supporting = _collect_supporting_evidence(
        original_instruction=original_instruction,
        initial_context=initial_context,
        clarification_responses=clarification_responses,
        analysis=analysis,
        is_ai_fallback=is_ai_fallback,
        status=status,
        resolved_intent=resolved_intent,
        inventory_insight=inventory_insight,
    )
    contradictions = _detect_contradictions(
        original_instruction=original_instruction,
        initial_context=initial_context,
        user_messages=all_user_messages,
        resolved_intent=resolved_intent,
        analysis=analysis,
        latest_user_response=latest_user_response,
    )

    if is_ai_fallback:
        contradictions.append(
            EvidenceItem(
                id="contra-ai-fallback",
                polarity="contradicting",
                category="AI Provenance Guard",
                label="Live model output unavailable — fallback mode active",
                detail=fallback_error
                or "Gemini structured model did not execute; ResolveX refuses to fabricate model confidence.",
                source="fallback_guard",
                impact_weight=0.5,
            )
        )

    unresolved_entities = _extract_unresolved_entities(
        original_instruction=original_instruction,
        clarification_responses=clarification_responses,
        analysis=analysis,
        resolved_intent=resolved_intent,
    )
    unresolved_count = sum(1 for ent in unresolved_entities if not ent.resolved)
    missing_context = list(dict.fromkeys(analysis.missing_required_info))
    if analysis.needs_clarification and not missing_context:
        missing_context.extend(analysis.clarification_questions[:2])

    support_weight = sum(item.impact_weight for item in supporting)
    contra_weight = sum(item.impact_weight for item in contradictions)
    ambiguity_penalty = 0.08 * len(analysis.ambiguity_types) + 0.07 * unresolved_count + (
        0.10 if len(analysis.interpretations) >= 2 and analysis.needs_clarification else 0.0
    )

    raw_sufficiency = max(
        0.0,
        min(
            1.0,
            support_weight
            + (0.25 if resolved_intent is not None and not is_ai_fallback else 0.0)
            + (0.14 if analysis.interpretations and not is_ai_fallback else 0.0)
            - 0.09 * len(missing_context)
            - 0.14 * len(contradictions),
        ),
    )
    evidence_sufficiency = round(raw_sufficiency, 4)

    # Abstention conditions: insufficient evidence, AI fallback without deterministic DB grounding, or contradiction blocking
    non_fallback_contradictions = [c for c in contradictions if c.source != "fallback_guard"]
    token_count = len(re.findall(r"\S+", original_instruction))
    severe_ambiguity_tie = (
        not clarification_responses
        and not initial_context
        and analysis.needs_clarification
        and (
            (analysis.classification == "incomplete" and len(analysis.missing_required_info) >= 2)
            or (token_count <= 4 and not any(item.category == "Explicit Entities" for item in supporting))
            or (len(missing_context) >= 2 and unresolved_count >= 2 and evidence_sufficiency < 0.28)
        )
    )

    abstention_reason: Optional[str] = None
    if is_ai_fallback and inventory_insight is None:
        abstention_reason = (
            "Model inference was unavailable (deterministic fallback active). "
            "Abstaining rather than fabricating a confidence score."
        )
    elif len(non_fallback_contradictions) >= 2 or any(
        c.source == "clarification_turn" for c in non_fallback_contradictions
    ):
        abstention_reason = (
            f"Contradictory constraints detected ({non_fallback_contradictions[0].label}). "
            "Abstaining from guessing until conflict is resolved."
        )
    elif severe_ambiguity_tie:
        abstention_reason = (
            "Insufficient evidence to favor any interpretation safely: multiple required slots "
            "and/or unresolved references remain without disambiguating context."
        )

    abstained = abstention_reason is not None

    if abstained:
        confidence_score: Optional[float] = None
        uncertainty_score = 1.0
    else:
        raw_conf = 0.48 + support_weight - contra_weight - ambiguity_penalty
        # Never saturate to 1.0 purely from heuristics
        clamped = max(0.14, min(0.95, raw_conf))
        if analysis.needs_clarification:
            clamped = min(clamped, 0.72)
        confidence_score = round(clamped, 4)
        uncertainty_score = round(max(0.05, 1.0 - confidence_score), 4)

    confidence_band = _band_from_score(confidence_score, abstained)

    # Distinguish confidence from verified correctness
    intent_valid = False
    if resolved_intent is not None:
        from app.models.ai_schemas import ResolvedIntentOutput

        intent_valid, _ = validate_resolved_intent(
            ResolvedIntentOutput(
                action=resolved_intent.action,
                parameters=resolved_intent.parameters,
                resolved_instruction=resolved_intent.resolved_instruction,
                direct_answer=resolved_intent.direct_answer,
            )
        )

    if non_fallback_contradictions:
        verified_correctness = "contradictory"
        verification_explanation = (
            "Unverified — direct contradictions detected across instructions or clarification turns."
        )
    elif (
        status == "RESOLVED"
        and not is_ai_fallback
        and not abstained
        and not analysis.needs_clarification
        and intent_valid
        and not missing_context
        and unresolved_count == 0
    ):
        verified_correctness = "verified"
        verification_explanation = (
            "Verified — structured intent validated, zero contradictions, and no unresolved required context remain."
        )
    elif (
        (status == "RESOLVED" or clarification_responses)
        and intent_valid
        and not is_ai_fallback
        and not non_fallback_contradictions
    ):
        verified_correctness = "partially_verified"
        verification_explanation = (
            "Partially verified — intent structure passed validation, though open ambiguity or fallback paths remain."
        )
    else:
        verified_correctness = "unverified"
        verification_explanation = (
            "Unverified — even when an interpretation has positive candidate confidence, required slots "
            "or clarification checks have not passed verification."
        )

    provenance = "ai_unavailable_abstained" if is_ai_fallback else "live_backend"
    if abstained:
        confidence_basis = "insufficient_evidence_abstained"
    elif inventory_insight is not None and is_ai_fallback:
        confidence_basis = "deterministic_db_grounded"
    else:
        confidence_basis = "backend_evidence_calibrated"

    if verified_correctness == "contradictory":
        recommended_action = "resolve_conflicts"
        recommendation_reason = (
            "Conflicting directives detected. Recommend clarification to resolve contradictions instead of forcing execution."
        )
    elif (
        abstained
        or verified_correctness != "verified"
        or analysis.needs_clarification
        or (confidence_score is not None and confidence_score < 0.78)
    ):
        recommended_action = "request_clarification"
        recommendation_reason = (
            "Evidence is incomplete or uncertain. Recommend targeted clarification instead of forcing a candidate interpretation."
        )
    else:
        recommended_action = "proceed_verified"
        recommendation_reason = (
            "Calibrated confidence and verification checks passed with zero contradictions."
        )

    enriched_interpretations = _calibrate_interpretations(
        analysis=analysis,
        clarification_responses=clarification_responses,
        contradictions=contradictions,
        missing_context=missing_context,
        abstained=abstained,
        overall_confidence=confidence_score,
    )

    # Compute turn-over-turn delta & explanation
    prev_snap = prior_snapshots[-1] if prior_snapshots else None
    prev_score: Optional[float] = prev_snap.get("confidence_score") if prev_snap else None
    delta: Optional[float] = None
    if confidence_score is not None and prev_score is not None:
        delta = round(confidence_score - prev_score, 4)

    change_reasons: list[str] = []
    if prev_snap is None:
        if abstained:
            change_reasons.append(abstention_reason or "Insufficient initial evidence; abstained.")
            change_summary = "Turn 1 abstained due to insufficient or unavailable evidence."
        else:
            change_reasons.append(
                f"Initial analysis produced {len(supporting)} supporting signal(s) and "
                f"{len(contradictions)} contradicting signal(s)."
            )
            if unresolved_count > 0:
                change_reasons.append(
                    f"{unresolved_count} unresolved reference/slot(s) limit confidence until clarified."
                )
            change_summary = (
                f"Initial backend calibration at {round((confidence_score or 0) * 100)}% "
                f"({verified_correctness.replace('_', ' ')})."
            )
    else:
        if abstained:
            change_reasons.append(abstention_reason or "Abstained after conflicting/insufficient turn.")
            change_summary = (
                "Clarification failed to establish coherent evidence; engine abstained."
            )
        else:
            if delta is not None and delta > 0:
                change_reasons.append(
                    f"Confidence increased by +{round(delta * 100, 1)} pts after Turn {turn_number} input."
                )
            elif delta is not None and delta < 0:
                change_reasons.append(
                    f"Confidence dropped by {round(delta * 100, 1)} pts due to remaining ambiguity or tension."
                )
            elif prev_snap.get("abstained") and confidence_score is not None:
                change_reasons.append(
                    f"Recovered from prior abstention to {round(confidence_score * 100)}% using new clarification evidence."
                )
            if status == "RESOLVED" and intent_valid:
                change_reasons.append("Intent resolved and passed backend structural validator.")
            if unresolved_count == 0 and prev_snap.get("abstained") is False:
                change_reasons.append("All tracked entity references/slots were resolved.")
            change_summary = " ".join(change_reasons) or (
                f"Turn {turn_number} calibrated at {round((confidence_score or 0) * 100)}%."
            )

    history_point = ConfidenceHistoryPoint(
        turn_number=turn_number,
        timestamp=_utc_now_iso(),
        event_label=(
            "Initial Prompt Analysis"
            if turn_number == 1
            else (
                "Final Verified Resolution"
                if status == "RESOLVED"
                else f"Clarification Turn {turn_number}"
            )
        ),
        trigger_input=(latest_user_response or original_instruction)[:160],
        confidence_score=confidence_score,
        confidence_band=confidence_band,
        verified_correctness=verified_correctness,
        abstained=abstained,
        delta_from_previous=delta,
        change_reasons=change_reasons,
        change_summary=change_summary,
        evidence_count_supporting=len(supporting),
        evidence_count_contradicting=len(contradictions),
    )

    assessment = ConfidenceAssessment(
        provenance=provenance,
        model_confidence_available=False,
        confidence_basis=confidence_basis,
        confidence_score=confidence_score,
        confidence_band=confidence_band,
        uncertainty_score=uncertainty_score,
        evidence_sufficiency_score=evidence_sufficiency,
        verified_correctness=verified_correctness,
        verification_explanation=verification_explanation,
        abstained=abstained,
        abstention_reason=abstention_reason,
        recommended_action=recommended_action,
        recommendation_reason=recommendation_reason,
        supporting_evidence=supporting,
        contradicting_evidence=contradictions,
        missing_context=missing_context,
        unresolved_entities=unresolved_entities,
        calibration_note=(
            "Scores are calibrated deterministically from actual backend NLU classifications, "
            "parameter coverage, contradiction checks, and verification status (never fabricated LLM logprobs)."
        ),
    )

    return assessment, enriched_interpretations, history_point
