"""Pydantic schemas for PS2 procurement proposals, approvals, and alerts."""

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


ProposalStatus = Literal["PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"]


class PurchaseOrderProposal(BaseModel):
    """AI/system-proposed purchase order awaiting human approval."""

    id: str
    material_id: str
    material_name: str
    suggested_quantity: float
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    reason: str
    affected_orders: list[str] = Field(default_factory=list)
    expected_shortage_date: Optional[str] = None
    estimated_impact: str
    supporting_data: dict[str, Any] = Field(default_factory=dict)
    status: ProposalStatus
    supplier_email_draft: Optional[str] = None
    created_at: str
    updated_at: str


class ProposalDecisionRequest(BaseModel):
    """Human-in-the-loop approval or rejection payload."""

    comment: Optional[str] = Field(default=None, max_length=500)


class AlertItem(BaseModel):
    """Proactive inventory or feed-failure alert."""

    id: int
    alert_type: Literal["STOCK_OUT", "CRD_RISK", "FEED_FAILURE", "LOW_STOCK"]
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    entity_id: str
    message: str
    acknowledged: bool
    created_at: str
