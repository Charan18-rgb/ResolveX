"""Role-based briefing and alerts API routes (PS2)."""

from typing import Any
from fastapi import APIRouter, Depends, Header, Query

from app.config import Settings, get_settings
from app.database.connection import get_connection
from app.inventory.availability_calculator import get_inventory_overview
from app.inventory.order_risk_engine import evaluate_order_risks
from app.inventory.purchase_order_engine import list_proposals
from app.inventory.shortage_detector import detect_shortages

alerts_router = APIRouter(prefix="/api", tags=["PS2 Alerts & Briefings"])

ROLE_BRIEFING_FOCUS = {
    "INVENTORY_PLANNER": ["inventory", "shortages", "orders", "alerts"],
    "PROCUREMENT_MANAGER": ["proposals", "shortages", "alerts"],
    "OPERATIONS_MANAGER": ["orders", "alerts"],
    "ADMIN": ["inventory", "shortages", "orders", "proposals", "alerts"],
}


@alerts_router.get("/alerts")
def get_alerts(
    acknowledged: bool | None = Query(default=None),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Return proactive inventory and feed-failure alerts."""
    with get_connection(settings.database_path) as conn:
        query = "SELECT * FROM inventory_alerts"
        params: list = []
        if acknowledged is not None:
            query += " WHERE acknowledged = ?"
            params.append(int(acknowledged))
        query += " ORDER BY severity DESC, created_at DESC;"
        rows = conn.execute(query, params).fetchall()
    alerts = [
        {
            **dict(r),
            "acknowledged": bool(r["acknowledged"]),
        }
        for r in rows
    ]
    return {"alerts": alerts, "count": len(alerts)}


@alerts_router.post("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int, settings: Settings = Depends(get_settings)) -> dict:
    """Mark an alert as acknowledged."""
    from fastapi import HTTPException

    with get_connection(settings.database_path) as conn:
        cur = conn.execute(
            "UPDATE inventory_alerts SET acknowledged = 1 WHERE id = ?;", (alert_id,)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found.")
    return {"alert_id": alert_id, "acknowledged": True}


@alerts_router.get("/briefings")
def get_briefing(
    role: str | None = Query(default=None),
    x_user_role: str = Header(default="INVENTORY_PLANNER"),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """
    Return a role-based, data-grounded briefing assembled from deterministic SQLite data.
    Gemini explanation layer is added in Milestone 5. Numbers here are always from Python.
    """
    effective_role = (role or x_user_role or "INVENTORY_PLANNER").upper()
    focus = ROLE_BRIEFING_FOCUS.get(effective_role, ROLE_BRIEFING_FOCUS["ADMIN"])

    briefing: dict[str, Any] = {"role": effective_role, "sections": []}

    if "inventory" in focus:
        overview = get_inventory_overview(settings.database_path)
        briefing["sections"].append(
            {
                "section": "Inventory Overview",
                "data": {
                    "total_materials": overview.total_materials,
                    "low_stock": overview.low_stock_count,
                    "out_of_stock": overview.out_of_stock_count,
                    "materials": [m.model_dump() for m in overview.materials],
                },
            }
        )

    if "shortages" in focus:
        shortages = detect_shortages(settings.database_path)
        briefing["sections"].append(
            {"section": "Material Shortages", "data": {"shortages": shortages, "count": len(shortages)}}
        )

    if "orders" in focus:
        from app.inventory.allocation_engine import recalculate_allocations
        recalculate_allocations(settings.database_path)
        risks = evaluate_order_risks(settings.database_path)
        at_risk = [r for r in risks if r.risk_category != "ON_TRACK"]
        briefing["sections"].append(
            {
                "section": "Order CRD Risk",
                "data": {
                    "total_orders": len(risks),
                    "at_risk_or_delayed": len(at_risk),
                    "risks": [r.model_dump() for r in risks],
                },
            }
        )

    if "proposals" in focus:
        proposals = list_proposals(settings.database_path, status_filter="PENDING_APPROVAL")
        briefing["sections"].append(
            {
                "section": "Pending PO Approvals",
                "data": {
                    "pending_count": len(proposals),
                    "proposals": [p.model_dump() for p in proposals],
                },
            }
        )

    if "alerts" in focus:
        with get_connection(settings.database_path) as conn:
            rows = conn.execute(
                "SELECT * FROM inventory_alerts WHERE acknowledged = 0 ORDER BY severity DESC LIMIT 10;"
            ).fetchall()
        briefing["sections"].append(
            {"section": "Active Alerts", "data": {"alerts": [dict(r) for r in rows]}}
        )

    briefing["data_source"] = "deterministic_sqlite"
    briefing["ai_enriched"] = False

    # Attempt AI enrichment via Gemini (graceful fallback)
    try:
        from app.services.gemini_service import call_gemini_text
        from app.services.prompts import build_briefing_prompt
        import json

        verified_sections = []
        for s in briefing["sections"]:
            verified_sections.append({
                "section": s["section"],
                "data": json.dumps(s["data"], default=str)[:2000],
            })

        prompt = build_briefing_prompt(effective_role, verified_sections)
        ai_text, error = call_gemini_text(prompt)

        if ai_text and not error:
            briefing["ai_summary"] = ai_text
            briefing["ai_enriched"] = True
        else:
            briefing["ai_summary"] = None
            briefing["ai_note"] = (
                "AI narrative unavailable right now (Gemini key missing or rate limit reached). "
                "Deterministic SQLite inventory metrics below remain fully authoritative."
            )
    except Exception:
        briefing["ai_summary"] = None
        briefing["ai_note"] = (
            "AI narrative unavailable right now. Deterministic SQLite inventory metrics remain authoritative."
        )

    return briefing
