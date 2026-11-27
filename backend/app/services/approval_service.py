"""
Approval service — human-in-the-loop PO approval and rejection.

CRITICAL RULE: No PO is finalized and no supplier email is sent
without explicit human approval via this service.
"""

from datetime import datetime, timezone
from typing import Literal, Optional

from app.database.connection import get_connection
from app.models.procurement_schemas import PurchaseOrderProposal


ALLOWED_APPROVAL_ROLES = {"ADMIN", "PROCUREMENT_MANAGER"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def decide_proposal(
    db_path: str,
    proposal_id: str,
    decision: Literal["APPROVED", "REJECTED"],
    actor: str,
    actor_role: str,
    comment: Optional[str] = None,
) -> dict:
    """
    Approve or reject a PENDING_APPROVAL purchase order proposal.
    Enforces role authorization at business-logic level.
    """
    if actor_role not in ALLOWED_APPROVAL_ROLES:
        raise PermissionError(
            f"Role '{actor_role}' is not authorized to approve or reject purchase orders. "
            f"Required: {ALLOWED_APPROVAL_ROLES}."
        )

    now = _utc_now()
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT status FROM purchase_order_proposals WHERE id = ?;",
            (proposal_id,),
        ).fetchone()
        if not row:
            raise KeyError(f"Proposal '{proposal_id}' not found.")
        if row["status"] != "PENDING_APPROVAL":
            raise ValueError(
                f"Proposal '{proposal_id}' is already in status '{row['status']}'; cannot change."
            )

        conn.execute(
            "UPDATE purchase_order_proposals SET status = ?, updated_at = ? WHERE id = ?;",
            (decision, now, proposal_id),
        )
        conn.execute(
            """
            INSERT INTO approval_records (
                proposal_id, decision, decided_by, decided_role, comment, created_at
            ) VALUES (?, ?, ?, ?, ?, ?);
            """,
            (proposal_id, decision, actor, actor_role, comment, now),
        )
        conn.execute(
            """
            INSERT INTO system_audit_logs (
                actor, actor_role, action, entity_type, entity_id, details_json, created_at
            ) VALUES (?, ?, ?, 'purchase_order_proposal', ?, ?, ?);
            """,
            (
                actor,
                actor_role,
                decision,
                proposal_id,
                __import__("json").dumps({"comment": comment}),
                now,
            ),
        )

    return {
        "proposal_id": proposal_id,
        "decision": decision,
        "decided_by": actor,
        "decided_role": actor_role,
        "timestamp": now,
        "note": (
            "PO approved. Supplier contact is now enabled for this proposal."
            if decision == "APPROVED"
            else "PO rejected. No purchase order created and no supplier notified."
        ),
    }
