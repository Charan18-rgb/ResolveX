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
