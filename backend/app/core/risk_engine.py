"""
Risk-Aware Intent Resolution Engine (Backend).

Classifies intent risk (Low, Medium, High) based on action, target, consequences,
and high-impact ambiguity dimensions (payments, deletion, permissions, sensitive recipients).
Detects whether an intent requires explicit confirmation and targeted clarification
before resolution can be considered safe to resolve, while never executing external actions.
"""

from typing import Any, Literal, Optional
import re
from app.models.schemas import IntentRiskAssessment, RiskFactor, RiskLevel


# High-impact regex patterns
PAYMENT_PATTERNS = [
    re.compile(r"\b(?:pay|transfer|wire|refund|charge|invoice|disburse|payout|settle|remit|\$|usd|inr|eur)\b", re.IGNORECASE),
    re.compile(r"\b(?:credit\s*card|bank\s*account|routing|wallet|crypto|payment)\b", re.IGNORECASE),
    re.compile(r"\b\d+(?:\.\d{1,2})?\s*(?:usd|dollars|inr|rupees|eur|euros|k|m)\b", re.IGNORECASE),
]

DELETION_PATTERNS = [
    re.compile(r"\b(?:delete|drop|purge|truncate|destroy|remove|wipe|erase|terminate|cancel|revoke|tear\s*down)\b", re.IGNORECASE),
    re.compile(r"\b(?:database|table|prod(?:uction)?|cluster|account|repo|repository|bucket|volume|namespace)\b", re.IGNORECASE),
]

PERMISSION_PATTERNS = [
    re.compile(r"\b(?:grant|elevate|admin|root|superuser|sudo|iam|role|privilege|access|unrestricted|bypass)\b", re.IGNORECASE),
    re.compile(r"\b(?:permission|policy|auth\s*rule|security\s*group|firewall)\b", re.IGNORECASE),
]

SENSITIVE_RECIPIENT_PATTERNS = [
    re.compile(r"\b(?:all\s*employees|everyone|company-wide|public|external|all\s*customers|all\s*users|board|executives)\b", re.IGNORECASE),
    re.compile(r"\b(?:investor|auditor|regulator|legal|press|journalist)\b", re.IGNORECASE),
]

HIGH_MUTATION_PATTERNS = [
    re.compile(r"\b(?:deploy|push\s*to\s*prod|publish|broadcast|reallocate|bulk\s*update|override)\b", re.IGNORECASE),
]


def evaluate_intent_risk(
    action: str,
    target: str,
    raw_text: str,
    ambiguity_types: Optional[list[str]] = None,
    clarification_responses: Optional[list[str]] = None,
    unresolved_questions_count: int = 0,
    has_conflicts: bool = False,
    user_confirmed: bool = False,
) -> IntentRiskAssessment:
    """
    Classify intent risk as Low, Medium, or High based on action, target, and consequences.
    Detects high-impact ambiguity (payments, deletion, permissions, sensitive recipients),
    recalculating risk as clarifications arrive and determining whether explicit confirmation is required.
    """
    combined_text = f"{action} {target} {raw_text} {' '.join(clarification_responses or [])}".lower()
    factors: list[RiskFactor] = []
    high_impact_ambiguities: list[str] = []

    # 1. Financial / Payment Dimension
    has_payment = any(p.search(combined_text) for p in PAYMENT_PATTERNS)
    if has_payment:
        has_vague_terms = any(
            token in combined_text for token in ["some money", "funds", "balance", "bonus", "amount", "budget"]
        )
        is_ambiguous_amount_or_target = (has_vague_terms and not (clarification_responses and unresolved_questions_count == 0)) or unresolved_questions_count > 0 or has_conflicts
        level: RiskLevel = "High" if is_ambiguous_amount_or_target else "Medium"
        factors.append(
            RiskFactor(
                dimension="financial_payment",
                level=level,
                label="Financial Transaction or Fund Movement",
                description="Instruction involves financial settlement, payment disbursement, or invoice handling.",
                target_token="payment",
                requires_confirmation=True,
            )
        )
        if is_ambiguous_amount_or_target:
            high_impact_ambiguities.append("Unverified financial recipient, amount, or payment schedule")

    # 2. Data Deletion / Destruction Dimension
    has_deletion = any(p.search(combined_text) for p in DELETION_PATTERNS)
    if has_deletion:
        is_broad_scope = any(
            token in combined_text for token in ["all", "everything", "prod", "production", "old", "unused", "inactive", "cluster", "database"]
        ) or unresolved_questions_count > 0
        level: RiskLevel = "High"
        factors.append(
            RiskFactor(
                dimension="data_deletion",
                level=level,
                label="Destructive Data Deletion or Resource Teardown",
                description="Instruction requests permanent deletion, record purging, or infrastructure termination.",
                target_token="delete",
                requires_confirmation=True,
            )
        )
        if is_broad_scope or unresolved_questions_count > 0:
            high_impact_ambiguities.append("Destructive deletion with broad or ambiguous target scope")

    # 3. Permissions / Access Elevation Dimension
    has_permission = any(p.search(combined_text) for p in PERMISSION_PATTERNS)
    if has_permission:
        is_ambiguous_role = any(
            token in combined_text for token in ["access", "admin", "privilege", "role", "full", "unrestricted"]
        ) or unresolved_questions_count > 0
        level: RiskLevel = "High" if ("admin" in combined_text or "root" in combined_text or "unrestricted" in combined_text) else "Medium"
        factors.append(
            RiskFactor(
                dimension="permission_access",
                level=level,
                label="Security Privilege or Access Rule Mutation",
                description="Instruction grants elevated administrative privileges, modifies IAM roles, or bypasses auth gates.",
                target_token="permission",
                requires_confirmation=level == "High",
            )
        )
        if is_ambiguous_role:
            high_impact_ambiguities.append("Ambiguous security boundary or unspecified access scope")

    # 4. Sensitive Recipient / External Exposure Dimension
    has_sensitive_recipient = any(p.search(combined_text) for p in SENSITIVE_RECIPIENT_PATTERNS)
    if has_sensitive_recipient:
        factors.append(
            RiskFactor(
                dimension="sensitive_recipient",
                level="High",
                label="Broad Public or Sensitive Recipient Reach",
                description="Instruction addresses broad audience, external regulators, press, or all company employees.",
                target_token="recipient",
                requires_confirmation=True,
            )
        )
        if unresolved_questions_count > 0 or has_conflicts:
            high_impact_ambiguities.append("Unconfirmed distribution list with wide blast radius")

    # 5. High-Impact Mutation / Production Deployment
    has_mutation = any(p.search(combined_text) for p in HIGH_MUTATION_PATTERNS)
    if has_mutation:
        level: RiskLevel = "High" if "prod" in combined_text else "Medium"
        factors.append(
            RiskFactor(
                dimension="system_mutation",
                level=level,
                label="Production Environment Mutation",
                description="Instruction mutates live system state, deploys to production, or overrides constraints.",
                target_token="mutation",
                requires_confirmation=level == "High",
            )
        )
        if unresolved_questions_count > 0 and level == "High":
            high_impact_ambiguities.append("Production mutation with unresolved execution constraints")

    # Calculate overall risk score (0 - 100)
    base_score = 15
    if any(f.level == "High" for f in factors):
        base_score = 75
    elif any(f.level == "Medium" for f in factors):
        base_score = 45
    elif factors:
        base_score = 30

    # Adjust based on unresolved ambiguities and conflicts
    ambiguity_penalty = min(20, unresolved_questions_count * 8)
    conflict_penalty = 15 if has_conflicts else 0
    raw_score = min(100, base_score + ambiguity_penalty + conflict_penalty)

    # Classify overall level
    if raw_score >= 65 or any(f.level == "High" for f in factors) or high_impact_ambiguities:
        overall_level: RiskLevel = "High"
    elif raw_score >= 35 or factors:
        overall_level: RiskLevel = "Medium"
    else:
        overall_level = "Low"

    # Reversibility
    if has_deletion or ("purge" in combined_text) or ("wire" in combined_text):
        reversibility: Literal["reversible", "partially_reversible", "irreversible"] = "irreversible"
    elif has_payment or has_permission or has_mutation:
        reversibility = "partially_reversible"
    else:
        reversibility = "reversible"

    # Check whether explicit confirmation is required
    requires_confirmation = (
        overall_level == "High"
        or any(f.requires_confirmation for f in factors)
        or bool(high_impact_ambiguities)
    )

    confirmation_reason: Optional[str] = None
    if requires_confirmation:
        reasons: list[str] = []
        if high_impact_ambiguities:
            reasons.append(f"High-impact ambiguity detected: {'; '.join(high_impact_ambiguities)}")
        if any(f.requires_confirmation for f in factors):
            flagged = [f.label for f in factors if f.requires_confirmation]
            reasons.append(f"Contains high-consequence operations ({', '.join(flagged)})")
        confirmation_reason = (
            " | ".join(reasons)
            + ". Explicit confirmation is required before this intent can be marked safe to resolve."
        )

    # Safe to resolve logic: High risk intents MUST pass required checks AND have explicit confirmation
    safe_to_resolve = True
    if overall_level == "High":
        if (high_impact_ambiguities and not user_confirmed) or unresolved_questions_count > 0 or has_conflicts:
            safe_to_resolve = False
        elif requires_confirmation and not user_confirmed:
            safe_to_resolve = False

    mitigation_guidance = (
        "High-risk operation: Review target scope, verify exact recipients and financial/access boundaries, "
        "and require explicit human confirmation. ResolveX never executes external actions."
        if overall_level == "High"
        else "Medium-risk operation: Confirm parameters and verify acceptance criteria before concluding."
        if overall_level == "Medium"
        else "Low-risk informational or reversible operation with minimal blast radius."
    )

    return IntentRiskAssessment(
        risk_level=overall_level,
        risk_score=raw_score,
        requires_explicit_confirmation=requires_confirmation,
        confirmation_reason=confirmation_reason,
        high_impact_ambiguities=high_impact_ambiguities,
        risk_factors=factors,
        action_type=action or ("destructive_action" if has_deletion else "mutation" if has_mutation else "query"),
        target_summary=target or (raw_text[:60] + "..."),
        reversibility=reversibility,
        mitigation_guidance=mitigation_guidance,
        safe_to_resolve=safe_to_resolve,
    )
