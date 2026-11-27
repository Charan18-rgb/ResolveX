"""Deterministic order timeline and fulfilment explanation — only evidenced stages."""

from typing import Any

from app.database.connection import get_connection
from app.inventory.order_risk_engine import evaluate_order_risks

_STAGE_LABELS = {
    "created": "Order Created",
    "requirements": "Requirements Calculated",
    "allocated": "Stock Reserved",
    "awaiting_stock": "Awaiting Stock / Incoming Supply",
    "at_risk": "Delivery Risk Identified",
    "ready": "Ready for Dispatch",
    "dispatched": "Dispatched",
    "delivered": "Delivered",
    "cancelled": "Cancelled",
}


def get_order_timeline(db_path: str, order_id: str) -> dict[str, Any] | None:
    """Build an evidence-based fulfilment timeline for one order."""
    with get_connection(db_path) as conn:
        order = conn.execute("SELECT * FROM orders WHERE id = ?;", (order_id,)).fetchone()
        if not order:
            return None
        allocs = conn.execute(
            "SELECT * FROM material_allocations WHERE order_id = ?;", (order_id,)
        ).fetchall()
        proposals = conn.execute(
            """
            SELECT id, material_id, status, created_at FROM purchase_order_proposals
            WHERE affected_orders_json LIKE ? ORDER BY created_at DESC LIMIT 5;
            """,
            (f"%{order_id}%",),
        ).fetchall()

    risks = {r.order_id: r for r in evaluate_order_risks(db_path)}
    risk = risks.get(order_id)

    stages: list[dict[str, Any]] = [
        {
            "key": "created",
            "label": _STAGE_LABELS["created"],
            "status": "completed",
            "detail": f"Received {order['created_at'][:10]} for {order['quantity']} × {order['product_code']}.",
            "evidence": "orders.created_at",
        },
        {
            "key": "requirements",
            "label": _STAGE_LABELS["requirements"],
            "status": "completed",
            "detail": "Material requirements computed from the product bill of materials.",
            "evidence": "bills_of_materials",
        },
    ]

    total_required = sum(float(a["required_qty"]) for a in allocs)
    total_allocated = sum(float(a["allocated_qty"]) for a in allocs)
    shortage = max(0.0, total_required - total_allocated)

    if shortage <= 0 and allocs:
        stages.append(
            {
                "key": "allocated",
                "label": _STAGE_LABELS["allocated"],
                "status": "completed",
                "detail": f"All {total_required:g} required units reserved across {len(allocs)} material(s).",
                "evidence": "material_allocations",
            }
        )
        stages.append(
            {
                "key": "ready",
                "label": _STAGE_LABELS["ready"],
                "status": "completed" if order["status"] == "OPEN" else "pending",
                "detail": "Stock coverage is complete; order is eligible for dispatch processing.",
                "evidence": "material_allocations + orders.status",
            }
        )
    else:
        stages.append(
            {
                "key": "awaiting_stock",
                "label": _STAGE_LABELS["awaiting_stock"],
                "status": "pending",
                "detail": f"{shortage:g} unit(s) still uncovered; incoming supply or procurement required.",
                "evidence": "material_allocations",
            }
        )

    if risk is not None and str(getattr(risk, "risk_category", "ON_TRACK")) != "ON_TRACK":
        stages.append(
            {
                "key": "at_risk",
                "label": _STAGE_LABELS["at_risk"],
                "status": "warning",
                "detail": getattr(risk, "explanation", "") or "CRD risk detected.",
                "evidence": "order_risk_engine",
            }
        )
    elif risk is not None:
        stages.append(
            {
                "key": "at_risk",
                "label": "Delivery Risk Check",
                "status": "completed",
                "detail": "Projected ship date meets the customer required date.",
                "evidence": "order_risk_engine",
            }
        )

    if order["status"] in ("DISPATCHED", "DELIVERED", "CANCELLED"):
        stages.append(
            {
                "key": order["status"].lower(),
                "label": _STAGE_LABELS.get(order["status"].lower(), order["status"]),
                "status": "completed",
                "detail": f"Order status recorded as {order['status']}.",
                "evidence": "orders.status",
            }
        )

    return {
        "order": dict(order),
        "allocations": [dict(a) for a in allocs],
        "related_proposals": [dict(p) for p in proposals],
        "risk": risk.model_dump() if risk is not None else None,
        "stages": stages,
        "computed_at": None,
    }
