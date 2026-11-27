"""Deterministic net availability calculator (ON-HAND + INCOMING - ALLOCATED)."""

from typing import Literal, Optional
from app.database.connection import get_connection
from app.models.inventory_schemas import InventoryOverviewResponse, MaterialOverview


def compute_net_availability(on_hand: float, incoming: float, allocated: float) -> float:
    """Compute Net Availability = On-hand + Incoming - Allocated."""
    return round(float(on_hand) + float(incoming) - float(allocated), 4)


def classify_stock_status(
    net_availability: float, reorder_threshold: float
) -> Literal["HEALTHY", "LOW_STOCK", "OUT_OF_STOCK"]:
    """Classify material stock status deterministically."""
    if net_availability <= 0:
        return "OUT_OF_STOCK"
    if net_availability <= reorder_threshold:
        return "LOW_STOCK"
    return "HEALTHY"


def get_inventory_overview(db_path: str) -> InventoryOverviewResponse:
    """Return full deterministic inventory overview across all materials."""
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT m.id, m.sku, m.name, m.unit, m.reorder_threshold,
                   b.on_hand, b.incoming, b.allocated,
                   s.lead_time_days, s.name AS supplier_name
            FROM materials m
            JOIN inventory_balances b ON b.material_id = m.id
            LEFT JOIN suppliers s ON s.id = m.preferred_supplier_id
            ORDER BY m.id ASC;
            """
        ).fetchall()

    materials: list[MaterialOverview] = []
    low_count = 0
    out_count = 0

    for row in rows:
        net = compute_net_availability(row["on_hand"], row["incoming"], row["allocated"])
        status = classify_stock_status(net, float(row["reorder_threshold"]))
        if status == "LOW_STOCK":
            low_count += 1
        elif status == "OUT_OF_STOCK":
            out_count += 1
        materials.append(
            MaterialOverview(
                id=row["id"],
                sku=row["sku"],
                name=row["name"],
                unit=row["unit"],
                on_hand=float(row["on_hand"]),
                incoming=float(row["incoming"]),
                allocated=float(row["allocated"]),
                net_availability=net,
                reorder_threshold=float(row["reorder_threshold"]),
                stock_status=status,
                lead_time_days=row["lead_time_days"],
                supplier_name=row["supplier_name"],
            )
        )

    return InventoryOverviewResponse(
        total_materials=len(materials),
        low_stock_count=low_count,
        out_of_stock_count=out_count,
        materials=materials,
    )


def get_material_detail(db_path: str, material_id: str) -> Optional[MaterialOverview]:
    """Return deterministic overview for a single material_id or None."""
    overview = get_inventory_overview(db_path)
    for item in overview.materials:
        if item.id == material_id or item.sku == material_id:
            return item
    return None
