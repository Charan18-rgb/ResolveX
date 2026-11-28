""" Inventory, Orders, Allocation, and Shortage API routes."""

from typing import Any
from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings, get_settings
from app.database.connection import get_connection
from app.inventory.allocation_engine import list_allocations, recalculate_allocations
from app.inventory.availability_calculator import (
    get_inventory_overview,
    get_material_detail,
    update_material_stock,
)
from app.inventory.event_processor import process_raw_event
from app.inventory.order_risk_engine import evaluate_order_risks
from app.inventory.shortage_detector import detect_shortages, sync_inventory_alerts
from app.models.inventory_schemas import (
    EventIngestionResponse,
    InventoryOverviewResponse,
    MaterialOverview,
    MaterialStockUpdateRequest,
)
from app.models.order_schemas import AllocationRecord, OrderRiskItem

inventory_router = APIRouter(prefix="/api", tags=["Inventory Intelligence"])


@inventory_router.get("/inventory/overview", response_model=InventoryOverviewResponse)
def inventory_overview(settings: Settings = Depends(get_settings)) -> InventoryOverviewResponse:
    """Return deterministic inventory overview with net availability per material."""
    return get_inventory_overview(settings.database_path)


@inventory_router.get("/inventory/materials", response_model=list[MaterialOverview])
def list_materials(settings: Settings = Depends(get_settings)) -> list[MaterialOverview]:
    """List all raw materials and their deterministic net availability."""
    return get_inventory_overview(settings.database_path).materials


@inventory_router.get("/inventory/search", response_model=list[MaterialOverview])
def search_inventory_materials(
    q: str = "",
    category: str | None = None,
    limit: int = 24,
    settings: Settings = Depends(get_settings),
) -> list[MaterialOverview]:
    """Search inventory by common name, synonym, typo, SKU, or category."""
    from app.inventory.catalog_search import search_materials

    return search_materials(settings.database_path, q, category=category, limit=limit)


@inventory_router.get("/inventory/materials/{material_id}", response_model=MaterialOverview)
def get_material(material_id: str, settings: Settings = Depends(get_settings)) -> MaterialOverview:
    """Fetch a single material by ID or SKU."""
    item = get_material_detail(settings.database_path, material_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Material '{material_id}' not found.")
    return item


@inventory_router.patch("/inventory/materials/{material_id}/stock", response_model=MaterialOverview)
@inventory_router.put("/inventory/materials/{material_id}/stock", response_model=MaterialOverview)
def edit_material_stock(
    material_id: str,
    body: MaterialStockUpdateRequest,
    settings: Settings = Depends(get_settings),
) -> MaterialOverview:
    """Directly set stock supply levels (on_hand, incoming, reorder_threshold) for a material."""
    try:
        return update_material_stock(
            settings.database_path,
            material_id,
            on_hand=body.on_hand,
            incoming=body.incoming,
            reorder_threshold=body.reorder_threshold,
            reason=body.reason,
            actor=body.actor,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Material '{material_id}' not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@inventory_router.post("/inventory/events", response_model=EventIngestionResponse)
def ingest_event(
    payload: dict[str, Any], settings: Settings = Depends(get_settings)
) -> EventIngestionResponse:
    """
    Ingest an inventory or order event idempotently.
    Malformed payloads are quarantined and trigger a FEED_FAILURE alert.
    """
    result = process_raw_event(settings.database_path, payload)
    if result.status == "PROCESSED":
        recalculate_allocations(settings.database_path)
        evaluate_order_risks(settings.database_path)
        sync_inventory_alerts(settings.database_path)
    return result


@inventory_router.get("/inventory/events")
def list_events(limit: int = 50, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """List recent inventory and order events."""
    with get_connection(settings.database_path) as conn:
        rows = conn.execute(
            "SELECT * FROM inventory_events ORDER BY id DESC LIMIT ?;", (limit,)
        ).fetchall()
    return {"events": [dict(r) for r in rows], "count": len(rows)}


@inventory_router.get("/orders")
def list_orders(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """List all orders."""
    with get_connection(settings.database_path) as conn:
        rows = conn.execute(
            "SELECT * FROM orders ORDER BY customer_request_date ASC, created_at ASC;"
        ).fetchall()
    return {"orders": [dict(r) for r in rows], "count": len(rows)}


@inventory_router.get("/orders/risks", response_model=list[OrderRiskItem])
def get_order_risks(settings: Settings = Depends(get_settings)) -> list[OrderRiskItem]:
    """Evaluate and return CRD risk & projected ship date for all OPEN orders."""
    recalculate_allocations(settings.database_path)
    return evaluate_order_risks(settings.database_path)


@inventory_router.get("/orders/{order_id}")
def get_order(order_id: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Fetch a single order and its material allocations."""
    with get_connection(settings.database_path) as conn:
        order = conn.execute("SELECT * FROM orders WHERE id = ?;", (order_id,)).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail=f"Order '{order_id}' not found.")
        allocs = conn.execute(
            "SELECT * FROM material_allocations WHERE order_id = ?;", (order_id,)
        ).fetchall()
    return {"order": dict(order), "allocations": [dict(a) for a in allocs]}


@inventory_router.get("/inventory/allocations", response_model=list[AllocationRecord])
def get_allocations(settings: Settings = Depends(get_settings)) -> list[AllocationRecord]:
    """Return current material allocations."""
    return list_allocations(settings.database_path)


@inventory_router.post("/inventory/allocations/recalculate", response_model=list[AllocationRecord])
def trigger_recalculate_allocations(
    settings: Settings = Depends(get_settings),
) -> list[AllocationRecord]:
    """Recalculate allocations using Earliest-CRD-First and refresh order risks."""
    records = recalculate_allocations(settings.database_path)
    evaluate_order_risks(settings.database_path)
    sync_inventory_alerts(settings.database_path)
    return records


@inventory_router.get("/inventory/shortages")
def get_shortages(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Detect and return material shortages and recommended purchase quantities."""
    recalculate_allocations(settings.database_path)
    shortages = detect_shortages(settings.database_path)
    return {"shortages": shortages, "count": len(shortages)}
