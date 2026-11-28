"""Deterministic net availability calculator (ON-HAND + INCOMING - ALLOCATED)."""

from datetime import datetime, timezone
import json
from typing import Literal, Optional
import uuid
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
            SELECT m.id, m.sku, m.name, m.description, m.category, m.aliases_json, m.data_origin,
                   m.unit, m.reorder_threshold,
                   b.on_hand, b.incoming, b.allocated,
                   s.id AS supplier_id, s.lead_time_days, s.name AS supplier_name
            FROM materials m
            JOIN inventory_balances b ON b.material_id = m.id
            LEFT JOIN suppliers s ON s.id = m.preferred_supplier_id
            ORDER BY m.category ASC, m.id ASC;
            """
        ).fetchall()

        loc_rows = conn.execute(
            """
            SELECT material_id, zone_code, rack_code, shelf_code, stored_qty, status
            FROM storage_locations
            WHERE material_id IS NOT NULL
            ORDER BY zone_code, rack_code, shelf_code;
            """
        ).fetchall()

    loc_map: dict[str, list[str]] = {}
    for lr in loc_rows:
        loc_map.setdefault(lr["material_id"], []).append(
            f"{lr['zone_code']}/{lr['rack_code']}/{lr['shelf_code']}"
        )

    materials: list[MaterialOverview] = []
    low_count = 0
    out_count = 0

    for row in rows:
        on_hand = float(row["on_hand"])
        incoming = float(row["incoming"])
        allocated = float(row["allocated"])
        phys_avail = round(max(0.0, on_hand - allocated), 4)
        net = compute_net_availability(on_hand, incoming, allocated)
        status = classify_stock_status(net, float(row["reorder_threshold"]))
        if status == "LOW_STOCK":
            low_count += 1
        elif status == "OUT_OF_STOCK":
            out_count += 1
        try:
            aliases = json.loads(row["aliases_json"] or "[]")
            if not isinstance(aliases, list):
                aliases = []
        except ValueError:
            aliases = []
        materials.append(
            MaterialOverview(
                id=row["id"],
                sku=row["sku"],
                name=row["name"],
                description=row["description"] or "",
                category=row["category"] or "General",
                aliases=[str(a) for a in aliases],
                data_origin=row["data_origin"] or "SEEDED_DEMO",
                unit=row["unit"],
                on_hand=on_hand,
                incoming=incoming,
                allocated=allocated,
                reserved=allocated,
                physical_available=phys_avail,
                net_availability=net,
                projected_availability=net,
                reorder_threshold=float(row["reorder_threshold"]),
                stock_status=status,
                lead_time_days=row["lead_time_days"],
                supplier_id=row["supplier_id"],
                supplier_name=row["supplier_name"],
                warehouse_locations=loc_map.get(row["id"], []),
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


def update_material_stock(
    db_path: str,
    material_ref: str,
    *,
    on_hand: Optional[float] = None,
    incoming: Optional[float] = None,
    reorder_threshold: Optional[float] = None,
    reason: Optional[str] = None,
    actor: Optional[str] = None,
) -> MaterialOverview:
    """Directly set on-hand/incoming/threshold supply levels and synchronize bins,
    allocations, CRD order risks, alerts, and audit records.
    """
    if on_hand is None and incoming is None and reorder_threshold is None:
        raise ValueError("Provide at least one field to update (on_hand, incoming, reorder_threshold).")
    for label, val in (("on_hand", on_hand), ("incoming", incoming), ("reorder_threshold", reorder_threshold)):
        if val is not None and float(val) < 0:
            raise ValueError(f"{label} cannot be negative.")

    now = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        row = conn.execute(
            """
            SELECT m.id, m.sku, m.name, m.reorder_threshold, b.on_hand, b.incoming
            FROM materials m
            JOIN inventory_balances b ON b.material_id = m.id
            WHERE UPPER(m.id) = UPPER(?) OR UPPER(m.sku) = UPPER(?)
            LIMIT 1;
            """,
            (material_ref.strip(), material_ref.strip()),
        ).fetchone()
        if not row:
            raise KeyError(material_ref)

        mat_id = str(row["id"])
        prev_on_hand = float(row["on_hand"])
        prev_incoming = float(row["incoming"])
        prev_threshold = float(row["reorder_threshold"])

        new_on_hand = round(float(on_hand), 4) if on_hand is not None else prev_on_hand
        new_incoming = round(float(incoming), 4) if incoming is not None else prev_incoming
        new_threshold = round(float(reorder_threshold), 4) if reorder_threshold is not None else prev_threshold

        conn.execute(
            """
            UPDATE inventory_balances
            SET on_hand = ?, incoming = ?, updated_at = ?
            WHERE material_id = ?;
            """,
            (new_on_hand, new_incoming, now, mat_id),
        )
        conn.execute(
            """
            UPDATE materials
            SET reorder_threshold = ?, data_origin = 'LIVE_EVENT'
            WHERE id = ?;
            """,
            (new_threshold, mat_id),
        )

        # Keep warehouse storage bins consistent with the updated supply levels.
        bin_rows = conn.execute(
            """
            SELECT id FROM storage_locations
            WHERE material_id = ?
            ORDER BY position_index ASC, id ASC;
            """,
            (mat_id,),
        ).fetchall()
        for idx, br in enumerate(bin_rows):
            bin_qty = new_on_hand if idx == 0 else 0.0
            bin_inc = new_incoming if idx == 0 else 0.0
            if bin_qty > 0:
                bin_status = "OCCUPIED"
            elif bin_inc > 0:
                bin_status = "INCOMING"
            else:
                bin_status = "AVAILABLE"
            conn.execute(
                """
                UPDATE storage_locations
                SET stored_qty = ?, incoming_qty = ?, status = ?
                WHERE id = ?;
                """,
                (bin_qty, bin_inc, bin_status, br["id"]),
            )

        delta = round(new_on_hand - prev_on_hand, 4)
        event_payload = {
            "quantity": delta,
            "previous_on_hand": prev_on_hand,
            "new_on_hand": new_on_hand,
            "previous_incoming": prev_incoming,
            "new_incoming": new_incoming,
            "previous_threshold": prev_threshold,
            "reorder_threshold": new_threshold,
            "reason": (reason or "Manual operator stock control update").strip(),
            "actor": (actor or "OPERATOR").strip(),
        }
        conn.execute(
            """
            INSERT INTO inventory_events (
                event_id, event_type, entity_ref, payload_json, status, error_message, simulated, created_at
            ) VALUES (?, 'STOCK_ADJUSTED', ?, ?, 'PROCESSED', NULL, 0, ?);
            """,
            (
                f"MANUAL-STK-{uuid.uuid4().hex[:10].upper()}",
                mat_id,
                json.dumps(event_payload),
                now,
            ),
        )
        conn.execute(
            """
            INSERT INTO system_audit_logs (
                actor, actor_role, action, entity_type, entity_id, details_json, created_at
            ) VALUES (?, ?, ?, 'material', ?, ?, ?);
            """,
            (
                (actor or "OPERATOR").strip(),
                (actor or "OPERATOR").strip(),
                "MANUAL_STOCK_UPDATE",
                mat_id,
                json.dumps(event_payload),
                now,
            ),
        )

    from app.inventory.allocation_engine import recalculate_allocations
    from app.inventory.order_risk_engine import evaluate_order_risks
    from app.inventory.shortage_detector import sync_inventory_alerts

    recalculate_allocations(db_path)
    evaluate_order_risks(db_path)
    sync_inventory_alerts(db_path)

    updated = get_material_detail(db_path, mat_id)
    assert updated is not None
    return updated
