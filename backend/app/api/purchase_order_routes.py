"""Purchase order proposal and approval API routes (PS2 HITL)."""

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.config import Settings, get_settings
from app.inventory.purchase_order_engine import (
    generate_proposals_from_shortages,
    list_proposals,
)
from app.models.procurement_schemas import ProposalDecisionRequest, PurchaseOrderProposal
from app.services.approval_service import ALLOWED_APPROVAL_ROLES, decide_proposal

procurement_router = APIRouter(prefix="/api", tags=["PS2 Procurement & HITL Approval"])


@procurement_router.get(
    "/purchase-orders/proposals", response_model=list[PurchaseOrderProposal]
)
def get_proposals(
    status: str | None = Query(default=None),
    settings: Settings = Depends(get_settings),
) -> list[PurchaseOrderProposal]:
    """List purchase order proposals, optionally filtered by status."""
    return list_proposals(settings.database_path, status_filter=status)


@procurement_router.post(
    "/purchase-orders/proposals", response_model=list[PurchaseOrderProposal]
)
def create_proposals(settings: Settings = Depends(get_settings)) -> list[PurchaseOrderProposal]:
    """
    Auto-generate PENDING_APPROVAL proposals from current shortage analysis.
    Does NOT create any real PO or contact any supplier.
    """
    return generate_proposals_from_shortages(settings.database_path)


@procurement_router.post("/purchase-orders/proposals/{proposal_id}/approve")
def approve_proposal(
    proposal_id: str,
    body: ProposalDecisionRequest,
    x_user_name: str = Header(default="system"),
    x_user_role: str = Header(default="VIEWER"),
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    Human-in-the-loop approval of a PENDING_APPROVAL purchase order proposal.
    Requires PROCUREMENT_MANAGER or ADMIN role.
    """
    try:
        return decide_proposal(
            settings.database_path,
            proposal_id,
            decision="APPROVED",
            actor=x_user_name,
            actor_role=x_user_role,
            comment=body.comment,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@procurement_router.post("/purchase-orders/proposals/{proposal_id}/reject")
def reject_proposal(
    proposal_id: str,
    body: ProposalDecisionRequest,
    x_user_name: str = Header(default="system"),
    x_user_role: str = Header(default="VIEWER"),
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    Human-in-the-loop rejection of a PENDING_APPROVAL purchase order proposal.
    Requires PROCUREMENT_MANAGER or ADMIN role.
    """
    try:
        return decide_proposal(
            settings.database_path,
            proposal_id,
            decision="REJECTED",
            actor=x_user_name,
            actor_role=x_user_role,
            comment=body.comment,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
