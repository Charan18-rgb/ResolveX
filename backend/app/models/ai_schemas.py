"""
Pydantic output schemas for Gemini structured responses (PS6 and PS2).
These schemas govern what Gemini must return; Python validates all outputs.
"""

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class InterpretationOutput(BaseModel):
    """Single candidate interpretation of an ambiguous instruction."""
    label: str = Field(description="Short title for this interpretation.")
    description: str = Field(description="Plain-English explanation of this interpretation.")


class ParameterEntry(BaseModel):
    """Key-value parameter entry (avoids dict[str, Any] additionalProperties in Gemini Developer API)."""
    key: str = Field(description="Parameter name.")
    value: str = Field(description="Parameter value as string.")


class ResolvedIntentOutput(BaseModel):
    """Final structured intent once ambiguity is resolved."""
    action: str = Field(description="Normalized action verb (e.g., 'send_document', 'book_table', 'unit_conversion').")
    parameters: list[ParameterEntry] = Field(
        default_factory=list,
        description="Key-value resolved parameters.",
    )
    resolved_instruction: str = Field(description="Clean, unambiguous restatement of the user's instruction.")
    direct_answer: Optional[str] = Field(default=None, description="Direct answer for clear informational queries.")

    @field_validator("parameters", mode="before")
    @classmethod
    def coerce_dict_to_entries(cls, value: Any) -> Any:
        """Allow callers/tests to pass a plain dict and convert it to ParameterEntry list."""
        if isinstance(value, dict):
            return [{"key": str(k), "value": str(v)} for k, v in value.items()]
        return value

    def parameters_dict(self) -> dict[str, str]:
        """Return parameters as a plain dict."""
        return {entry.key: entry.value for entry in self.parameters}


class GeminiAnalysisOutput(BaseModel):
    """Structured Gemini response for PS6 ambiguity analysis."""
    classification: Literal["clear", "ambiguous", "incomplete", "context_dependent"] = Field(
        description="Ambiguity classification of the input."
    )
    ambiguity_types: list[str] = Field(
        default_factory=list,
        description="Applicable ambiguity categories: referential, lexical, structural, semantic, contextual, underspecification.",
    )
    needs_clarification: bool = Field(
        description="True only if clarification is strictly necessary to resolve the instruction."
    )
    reasoning: str = Field(description="Brief internal reasoning for the classification.")
    interpretations: list[InterpretationOutput] = Field(
        default_factory=list,
        description="2-4 candidate interpretations when ambiguous/incomplete.",
    )
    missing_required_info: list[str] = Field(
        default_factory=list,
        description="Required information missing to resolve the instruction.",
    )
    clarification_questions: list[str] = Field(
        default_factory=list,
        description="Minimal targeted questions to resolve ambiguity (max 3 per turn).",
    )
    resolved_intent: Optional[ResolvedIntentOutput] = Field(
        default=None,
        description="Populated when the instruction is clear or fully resolved.",
    )
