"""Operations API routes — warehouse storage, supplier performance, order timelines, and the
conversational ops-query endpoint that powers contextual chat cards."""

from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.database.connection import get_connection
from app.inventory.purchase_order_engine import list_proposals
from app.inventory.shortage_detector import detect_shortages
from app.ops.order_service import get_order_timeline
from app.ops.supplier_service import (
    compare_suppliers,
    get_supplier_detail,
    get_supplier_performance,
)
from app.ops.warehouse_service import (
    get_material_location,
    get_storage_locations,
    get_warehouse_overview,
)

ops_router = APIRouter(prefix="/api", tags=["Operations"])

OPERATOR_ROLES = {"ADMIN", "OPERATOR"}


def _audit_operator_access(db_path: str, role: str, action: str, detail: str) -> None:
    """Record operator-area access attempts in system_audit_logs (best-effort)."""
    try:
        from datetime import datetime, timezone
        import json
        with get_connection(db_path) as conn:
            conn.execute(
                """
                INSERT INTO system_audit_logs (actor, actor_role, action, entity_type, entity_id, details_json, created_at)
                VALUES (?, ?, ?, 'operator_area', ?, ?, ?);
                """,
                ("anonymous-demo-user", role, action, "evaluation", json.dumps({"detail": detail}),
                 datetime.now(timezone.utc).isoformat()),
            )
    except Exception:
        pass  # audit must never break the request path


def require_operator(
    request: Request,
    x_user_role: str = Header(default="VIEWER"),
    settings: Settings = Depends(get_settings),
) -> str:
    """
    Gate for operator-only analytics endpoints.

    NOTE (demo scope): authorization uses the X-User-Role header, which is
    client-controlled and suitable only for the hackathon demo. Production
    deployments must replace this with verified authentication (e.g. JWT/OIDC
    validated server-side). All decisions are written to system_audit_logs.
    """
    role = (x_user_role or "VIEWER").upper()
    path = request.url.path
    if role not in OPERATOR_ROLES:
        _audit_operator_access(settings.database_path, role, "OPERATOR_ACCESS_DENIED", path)
        raise HTTPException(
            status_code=403,
            detail=f"Role '{role}' is not authorized to access operator analytics. Required: {sorted(OPERATOR_ROLES)}.",
        )
    _audit_operator_access(settings.database_path, role, "OPERATOR_ACCESS_GRANTED", path)
    return role


# --- Warehouse ---

@ops_router.get("/warehouse/overview")
def warehouse_overview(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Warehouse capacity summary by zone (deterministic from storage_locations)."""
    return get_warehouse_overview(settings.database_path)


@ops_router.get("/warehouse/locations")
def warehouse_locations(
    material_id: str | None = Query(default=None),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """All storage bins, optionally filtered to one material."""
    return {"locations": get_storage_locations(settings.database_path, material_id)}


@ops_router.get("/warehouse/materials/{material_ref}/location")
def material_location(material_ref: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Storage bins holding a material (by material id or SKU)."""
    result = get_material_location(settings.database_path, material_ref)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Material '{material_ref}' not found.")
    return result


# --- Suppliers ---

@ops_router.get("/suppliers")
def suppliers_list(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Supplier performance computed from recorded delivery history."""
    return {"suppliers": get_supplier_performance(settings.database_path)}


@ops_router.get("/suppliers/compare")
def suppliers_compare(
    a: str = Query(...),
    b: str = Query(...),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Side-by-side delivery performance for two suppliers."""
    result = compare_suppliers(settings.database_path, a, b)
    if result is None:
        raise HTTPException(status_code=404, detail="One or both suppliers not found.")
    return result


@ops_router.get("/suppliers/{supplier_ref}")
def supplier_detail(supplier_ref: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Supplier profile, performance stats, and recent delivery history."""
    result = get_supplier_detail(settings.database_path, supplier_ref)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Supplier '{supplier_ref}' not found.")
    return result


# --- Order timeline ---

@ops_router.get("/orders/{order_id}/timeline")
def order_timeline(order_id: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Evidence-based fulfilment timeline for a single order."""
    result = get_order_timeline(settings.database_path, order_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Order '{order_id}' not found.")
    return result


# --- Operator audit trail ---

@ops_router.get("/operator/audit-logs")
def operator_audit_logs(
    limit: int = Query(default=50, le=200),
    _role: str = Depends(require_operator),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Recent operator-area access and approval audit records (operator only)."""
    with get_connection(settings.database_path) as conn:
        rows = conn.execute(
            "SELECT * FROM system_audit_logs ORDER BY created_at DESC LIMIT ?;", (limit,)
        ).fetchall()
    return {"logs": [dict(r) for r in rows]}


# --- Conversational ops query (contextual chat cards) ---

class OpsQueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)


_CARD_TYPES = Literal[
    "inventory_summary",
    "shortages",
    "material_detail",
    "warehouse",
    "material_location",
    "suppliers",
    "supplier_compare",
    "order_risks",
    "order_detail",
    "purchase_orders",
    "help",
]


def _first_match(text: str, patterns: list[str]) -> bool:
    return any(p in text for p in patterns)


@ops_router.post("/ops/query")
def ops_query(body: OpsQueryRequest, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """
    Deterministically route a business question to the right verified dataset
    and return a typed card payload for the conversational UI.
    """
    q = body.question.lower()
    db = settings.database_path

    # Supplier comparison first ("compare X and Y", "which supplier")
    if _first_match(q, ["compare", " vs ", " versus "]) and ("supplier" in q or "deliver" in q):
        names = [w for w in q.replace("compare", " ").replace("supplier", " ").split() if len(w) > 2]
        suppliers = get_supplier_performance(db)
        if len(names) >= 2:
            # fuzzy match supplier names
            def _find(token: str) -> Optional[str]:
                for s in suppliers:
                    if token in s["supplier_name"].lower() or token in s["supplier_id"].lower():
                        return s["supplier_id"]
                return None
            a_id, b_id = _find(names[0]), _find(names[-1])
            if a_id and b_id and a_id != b_id:
                return {"card_type": "supplier_compare", "title": "Supplier Comparison", "data": compare_suppliers(db, a_id, b_id)}
        return {"card_type": "suppliers", "title": "Supplier Performance", "data": {"suppliers": suppliers}}

    if _first_match(q, ["supplier", "vendor", "delivery history", "on-time", "on time", "reliable", "late delivery"]):
        if _first_match(q, ["which", "best", "most reliable", "compare", "who"]):
            ranked = sorted(
                get_supplier_performance(db),
                key=lambda s: (s["on_time_rate"] if s["on_time_rate"] is not None else -1),
                reverse=True,
            )
            return {
                "card_type": "suppliers",
                "title": "Supplier Reliability Ranking",
                "summary": (
                    f"{ranked[0]['supplier_name']} has the best on-time rate "
                    f"({ranked[0]['on_time_rate']}%) across {ranked[0]['total_deliveries']} recorded deliveries."
                    if ranked and ranked[0]["on_time_rate"] is not None else "Insufficient delivery history to rank suppliers."
                ),
                "data": {"suppliers": ranked},
            }
        return {"card_type": "suppliers", "title": "Supplier Performance", "data": {"suppliers": get_supplier_performance(db)}}

    # Warehouse / storage questions
    if _first_match(q, ["warehouse", "storage", "space", "zone", "rack", "shelf", "bin", "where is", "where are", "located", "stored"]):
        # material-specific location?
        material_ref = None
        for tok in q.replace("?", " ").replace(".", " ").split():
            t = tok.strip(",")
            if t.upper().startswith("MAT-") or t.upper().startswith("SKU-"):
                material_ref = t.upper()
                break
        if material_ref:
            loc = get_material_location(db, material_ref)
            if loc:
                return {
                    "card_type": "material_location",
                    "title": f"Storage Location — {loc['material']['name']}",
                    "summary": (
                        f"{loc['material']['name']} is stored in {len(loc['locations'])} bin(s): "
                        + ", ".join(
                            f"{b['zone_code']} / {b['rack_code']} / {b['shelf_code']} ({b['stored_qty']:g} {loc['material']['unit']} stored)"
                            for b in loc["locations"]
                        )
                        + "."
                    ),
                    "data": loc,
                }
        if _first_match(q, ["where", "stored", "located", "find"]):
            return {"card_type": "warehouse", "title": "Warehouse Storage Map", "data": {"locations": get_storage_locations(db), "overview": get_warehouse_overview(db)}}
        return {"card_type": "warehouse", "title": "Warehouse Capacity", "data": get_warehouse_overview(db)}

    # Order-specific question ("explain why ORD-1002 is delayed")
    order_ref = None
    for tok in q.replace("?", " ").replace(".", " ").split():
        t = tok.strip(",")
        if t.upper().startswith("ORD-"):
            order_ref = t.upper()
            break
    if order_ref:
        tl = get_order_timeline(db, order_ref)
        if tl:
            return {"card_type": "order_detail", "title": f"Order {order_ref} — Fulfilment Timeline", "data": tl}

    if _first_match(q, ["order", "delay", "deliver", "dispatch", "shipment", "crd", "late"]):
        risks = []
        from app.inventory.order_risk_engine import evaluate_order_risks
        risks = evaluate_order_risks(db)
        return {
            "card_type": "order_risks",
            "title": "Order Delivery Risk",
            "summary": (
                f"{sum(1 for r in risks if str(r.risk_category) != 'ON_TRACK')} of {len(risks)} open orders have delivery risk."
            ),
            "data": {"orders": [r.model_dump() for r in risks]},
        }

    # Purchase orders / procurement
    if _first_match(q, ["purchase order", " po ", "procurement", "reorder", "order materials", "missing materials", "shortage"]):
        proposals = list_proposals(db)
        shortages = detect_shortages(db)
        return {
            "card_type": "purchase_orders",
            "title": "Procurement Status",
            "summary": f"{len(shortages)} material shortage(s); {sum(1 for p in proposals if p.status == 'PENDING_APPROVAL')} proposal(s) awaiting approval.",
            "data": {"shortages": shortages, "proposals": [p.model_dump() for p in proposals]},
        }

    # Stock / inventory
    if _first_match(q, ["stock", "inventory", "available", "quantity", "how much", "running low", "low stock", "out of stock"]):
        from app.inventory.availability_calculator import get_inventory_overview
        ov = get_inventory_overview(db)
        return {
            "card_type": "inventory_summary",
            "title": "Inventory Summary",
            "summary": (
                f"{ov.total_materials} products tracked: {ov.low_stock_count} low-stock, "
                f"{ov.out_of_stock_count} out-of-stock."
            ),
            "data": ov.model_dump(),
        }

    return {
        "card_type": "help",
        "title": "How can I help?",
        "summary": "I can check stock levels, storage locations, supplier reliability, order risks, and purchase orders.",
        "data": {},
    }
