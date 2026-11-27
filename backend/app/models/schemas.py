"""Initial Pydantic schemas matching API_CONTRACT.md."""

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class ErrorDetail(BaseModel):
    """Structured error payload."""

    code: str
    message: str
    details: Optional[Any] = None


class ErrorResponse(BaseModel):
    """Standard error envelope."""

    error: ErrorDetail


class HealthResponse(BaseModel):
    """Response model for GET /health."""

    status: Literal["ok", "degraded"]
    service: str
    database: Literal["connected", "disconnected"]
    ai_configured: bool


class InterpretationItem(BaseModel):
    """Candidate interpretation of an ambiguous input."""

    label: str
    description: str
    confidence_score: Optional[float] = None
    confidence_status: Literal["calibrated", "abstained"] = "calibrated"
    supporting_signals: list[str] = Field(default_factory=list)
    contradicting_signals: list[str] = Field(default_factory=list)
    missing_requirements: list[str] = Field(default_factory=list)
    risk_level: Optional[Literal["Low", "Medium", "High"]] = None


class EvidenceItem(BaseModel):
    """Concrete supporting or contradicting evidence derived from backend signals."""

    id: str
    polarity: Literal["supporting", "contradicting"]
    category: str
    label: str
    detail: str
    source: Literal[
        "backend_analysis",
        "user_context",
        "clarification_turn",
        "intent_validator",
        "inventory_db",
        "contradiction_detector",
        "fallback_guard",
    ]
    impact_weight: float


class UnresolvedEntityItem(BaseModel):
    """Entity or reference tracked across turns until disambiguated."""

    token: str
    kind: str
    reason: str
    resolved: bool = False
    resolved_value: Optional[str] = None


class ConfidenceHistoryPoint(BaseModel):
    """Turn-by-turn confidence trajectory entry explaining deltas."""

    turn_number: int = Field(..., ge=1)
    timestamp: str
    event_label: str
    trigger_input: str
    confidence_score: Optional[float] = None
    confidence_band: Literal["high", "moderate", "low", "abstained"]
    verified_correctness: Literal[
        "verified", "partially_verified", "unverified", "contradictory"
    ]
    abstained: bool = False
    delta_from_previous: Optional[float] = None
    change_reasons: list[str] = Field(default_factory=list)
    change_summary: str
    evidence_count_supporting: int = 0
    evidence_count_contradicting: int = 0


class ConfidenceAssessment(BaseModel):
    """Honest, backend-grounded confidence and uncertainty report."""

    provenance: Literal["live_backend", "ai_unavailable_abstained"]
    model_confidence_available: bool = False
    confidence_basis: Literal[
        "backend_evidence_calibrated",
        "deterministic_db_grounded",
        "insufficient_evidence_abstained",
    ]
    confidence_score: Optional[float] = None
    confidence_band: Literal["high", "moderate", "low", "abstained"]
    uncertainty_score: float = Field(..., ge=0.0, le=1.0)
    evidence_sufficiency_score: float = Field(..., ge=0.0, le=1.0)
    verified_correctness: Literal[
        "verified", "partially_verified", "unverified", "contradictory"
    ]
    verification_explanation: str
    abstained: bool = False
    abstention_reason: Optional[str] = None
    recommended_action: Literal[
        "request_clarification", "resolve_conflicts", "proceed_verified"
    ] = "request_clarification"
    recommendation_reason: str = (
        "Request targeted clarification instead of forcing an uncertain interpretation."
    )
    supporting_evidence: list[EvidenceItem] = Field(default_factory=list)
    contradicting_evidence: list[EvidenceItem] = Field(default_factory=list)
    missing_context: list[str] = Field(default_factory=list)
    unresolved_entities: list[UnresolvedEntityItem] = Field(default_factory=list)
    calibration_note: str


class ResolvedIntentPayload(BaseModel):
    """Structured final intent once ambiguity is resolved."""

    action: str = Field(..., min_length=1)
    parameters: dict[str, Any] = Field(default_factory=dict)
    resolved_instruction: str = Field(..., min_length=1)
    direct_answer: Optional[str] = None


class AnalyzeRequest(BaseModel):
    """Request payload for POST /api/analyze."""

    instruction: str = Field(..., min_length=1, max_length=2000)
    context: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("instruction")
    @classmethod
    def instruction_must_not_be_blank(cls, value: str) -> str:
        """Reject whitespace-only instructions."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("instruction must not be empty or whitespace-only.")
        return stripped


class ClarifyRequest(BaseModel):
    """Request payload for POST /api/clarify."""

    conversation_id: str = Field(..., min_length=1)
    response: str = Field(..., min_length=1, max_length=2000)

    @field_validator("response")
    @classmethod
    def response_must_not_be_blank(cls, value: str) -> str:
        """Reject whitespace-only clarification responses."""
        stripped = value.strip()
        if not stripped:
            raise ValueError("response must not be empty or whitespace-only.")
        return stripped


class ResolveRequest(BaseModel):
    """Request payload for POST /api/resolve."""

    conversation_id: str = Field(..., min_length=1)


class ContextMemoryEntity(BaseModel):
    """Typed entity remembered within an isolated conversation session."""

    id: str
    session_id: str
    category: Literal["person", "object", "date", "action", "reference"]
    label: str
    value: str
    source_turn: int
    source_role: str
    source_message: str


class ReferenceResolutionItem(BaseModel):
    """Coreference or ordinal resolution attempt grounded in session memory."""

    reference_token: str
    category: Literal["person", "object", "date", "action", "ordinal"]
    status: Literal["resolved", "conflicting", "unclear"]
    resolved_value: Optional[str] = None
    candidates: list[str] = Field(default_factory=list)
    source_turn: Optional[int] = None
    source_message: Optional[str] = None
    explanation: str
    clarification_question: Optional[str] = None


class SessionContextMemory(BaseModel):
    """Session-isolated remembered context and reference resolution state."""

    session_id: str
    entities: list[ContextMemoryEntity] = Field(default_factory=list)
    resolved_references: list[ReferenceResolutionItem] = Field(default_factory=list)
    reference_conflicts: list[ReferenceResolutionItem] = Field(default_factory=list)
    turn_count: int = 1


RiskLevel = Literal["Low", "Medium", "High"]


class RiskFactor(BaseModel):
    """Specific signal that contributes to overall risk or flags high-impact ambiguity."""

    dimension: Literal[
        "financial_payment",
        "data_deletion",
        "permission_access",
        "sensitive_recipient",
        "system_mutation",
    ]
    level: Literal["Low", "Medium", "High"]
    label: str
    description: str
    target_token: Optional[str] = None
    requires_confirmation: bool = False


class IntentRiskAssessment(BaseModel):
    """Complete risk evaluation of an intent, recalculated across clarification turns."""

    risk_level: Literal["Low", "Medium", "High"]
    risk_score: int = Field(..., ge=0, le=100)
    requires_explicit_confirmation: bool
    confirmation_reason: Optional[str] = None
    high_impact_ambiguities: list[str] = Field(default_factory=list)
    risk_factors: list[RiskFactor] = Field(default_factory=list)
    action_type: str
    target_summary: str
    reversibility: Literal["reversible", "partially_reversible", "irreversible"]
    mitigation_guidance: str
    safe_to_resolve: bool


class AnalyzeResponse(BaseModel):
    """Response payload for POST /api/analyze and POST /api/clarify."""

    conversation_id: str
    status: Literal["ANALYZING", "NEEDS_CLARIFICATION", "RESOLVED", "FAILED"]
    classification: Optional[Literal["clear", "ambiguous", "incomplete", "context_dependent"]] = None
    ambiguity_types: list[str] = Field(default_factory=list)
    needs_clarification: bool
    interpretations: list[InterpretationItem] = Field(default_factory=list)
    missing_required_info: list[str] = Field(default_factory=list)
    clarification_questions: list[str] = Field(default_factory=list)
    resolved_intent: Optional[ResolvedIntentPayload] = None
    inventory_insight: Optional[dict[str, Any]] = None
    turn_count: int = Field(..., ge=1)
    confidence_assessment: Optional[ConfidenceAssessment] = None
    confidence_history: list[ConfidenceHistoryPoint] = Field(default_factory=list)
    context_memory: Optional[SessionContextMemory] = None
    risk_assessment: Optional[IntentRiskAssessment] = None
