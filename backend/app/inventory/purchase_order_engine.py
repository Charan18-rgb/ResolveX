"""Purchase Order proposal engine — creates PENDING_APPROVAL proposals from shortage data."""

import uuid
from datetime import datetime, timezone
from typing import Any

from app.database.connection import get_connection
from app.database.operations import DatabaseOperationError
from app.inventory.shortage_detector import detect_shortages
from app.models.procurement_schemas import PurchaseOrderProposal


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_proposals_from_shortages(db_path: str) -> list[PurchaseOrderProposal]:
    """
    For each material shortage detected, create a PENDING_APPROVAL proposal
    if one does not already exist for that material.
    No PO is created and no email is sent here.
    """
    shortages = detect_shortages(db_path)
    created: list[PurchaseOrderProposal] = []
    now = _utc_now()

    with get_connection(db_path) as conn:
        for s in shortages:
            if s["recommended_purchase_qty"] <= 0:
                continue
            existing = conn.execute(
                """
                SELECT id FROM purchase_order_proposals
                WHERE material_id = ? AND status = 'PENDING_APPROVAL';
                """,
                (s["material_id"],),
            ).fetchone()
            if existing:
                continue

            proposal_id = f"PO-{uuid.uuid4().hex[:8].upper()}"
            reason = (
                f"Net availability {s['net_availability']} {s['unit']} is insufficient. "
                f"Unmet order demand: {s['unmet_order_demand']} {s['unit']}. "
                f"Recommended purchase: {s['recommended_purchase_qty']} {s['unit']}."
            )
            affected_json = __import__("json").dumps(s["affected_orders"])
            supporting_json = __import__("json").dumps(
                {
                    "on_hand": s["on_hand"],
                    "incoming": s["incoming"],
                    "allocated": s["allocated"],
                    "net_availability": s["net_availability"],
                    "reorder_threshold": s["reorder_threshold"],
                }
            )
            conn.execute(
                """
                INSERT INTO purchase_order_proposals (
                    id, material_id, material_name, suggested_quantity,
                    supplier_id, supplier_name, reason, affected_orders_json,
                    expected_shortage_date, estimated_impact,
                    supporting_data_json, status, supplier_email_draft,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL', NULL, ?, ?);
                """,
                (
                    proposal_id,
                    s["material_id"],
                    s["material_name"],
                    s["recommended_purchase_qty"],
                    s.get("supplier_id"),
                    s.get("supplier_name"),
                    reason,
                    affected_json,
                    None,
                    f"Affects orders: {', '.join(s['affected_orders']) or 'None listed'}.",
                    supporting_json,
                    now,
                    now,
                ),
            )
            created.append(
                PurchaseOrderProposal(
                    id=proposal_id,
                    material_id=s["material_id"],
                    material_name=s["material_name"],
                    suggested_quantity=s["recommended_purchase_qty"],
                    supplier_id=s.get("supplier_id"),
                    supplier_name=s.get("supplier_name"),
                    reason=reason,
                    affected_orders=s["affected_orders"],
                    expected_shortage_date=None,
                    estimated_impact=f"Affects orders: {', '.join(s['affected_orders']) or 'None'}.",
                    supporting_data={
                        "on_hand": s["on_hand"],
                        "incoming": s["incoming"],
                        "allocated": s["allocated"],
                        "net_availability": s["net_availability"],
                    },
                    status="PENDING_APPROVAL",
                    supplier_email_draft=None,
                    created_at=now,
                    updated_at=now,
                )
            )
    return created


def list_proposals(db_path: str, status_filter: str | None = None) -> list[PurchaseOrderProposal]:
    """List proposals, optionally filtered by status."""
    import json

    with get_connection(db_path) as conn:
        if status_filter:
            rows = conn.execute(
                "SELECT * FROM purchase_order_proposals WHERE status = ? ORDER BY created_at DESC;",
                (status_filter,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM purchase_order_proposals ORDER BY created_at DESC;"
            ).fetchall()

    result = []
    for r in rows:
        d = dict(r)
        result.append(
            PurchaseOrderProposal(
                id=d["id"],
                material_id=d["material_id"],
                material_name=d["material_name"],
                suggested_quantity=float(d["suggested_quantity"]),
                supplier_id=d.get("supplier_id"),
                supplier_name=d.get("supplier_name"),
                reason=d["reason"],
                affected_orders=json.loads(d["affected_orders_json"]),
                expected_shortage_date=d.get("expected_shortage_date"),
                estimated_impact=d["estimated_impact"],
                supporting_data=json.loads(d["supporting_data_json"]),
                status=d["status"],
                supplier_email_draft=d.get("supplier_email_draft"),
                created_at=d["created_at"],
                updated_at=d["updated_at"],
            )
        )
    return result
