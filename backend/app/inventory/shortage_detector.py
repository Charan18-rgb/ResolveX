"""Deterministic shortage detection and proactive alert generation."""

from datetime import datetime, timezone
from typing import Any

from app.database.connection import get_connection
from app.inventory.availability_calculator import compute_net_availability


def detect_shortages(db_path: str) -> list[dict[str, Any]]:
    """
    Detect materials where net availability is negative/below reorder threshold
    or where open orders have unallocated demand.
    """
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT m.id, m.sku, m.name, m.unit, m.reorder_threshold,
                   b.on_hand, b.incoming, b.allocated,
                   s.id AS supplier_id, s.name AS supplier_name, s.lead_time_days
            FROM materials m
            JOIN inventory_balances b ON b.material_id = m.id
            LEFT JOIN suppliers s ON s.id = m.preferred_supplier_id
            ORDER BY m.id ASC;
            """
        ).fetchall()

        shortages: list[dict[str, Any]] = []
        for row in rows:
            mat_id = row["id"]
            unmet_row = conn.execute(
                """
                SELECT COALESCE(SUM(required_qty - allocated_qty), 0.0) AS unmet_qty
                FROM material_allocations
                WHERE material_id = ? AND required_qty > allocated_qty;
                """,
                (mat_id,),
            ).fetchone()
            unmet_qty = float(unmet_row["unmet_qty"])
            net_avail = compute_net_availability(row["on_hand"], row["incoming"], row["allocated"])
            threshold = float(row["reorder_threshold"])

            if unmet_qty > 0 or net_avail <= threshold:
                affected = [
                    r["order_id"]
                    for r in conn.execute(
                        """
                        SELECT order_id FROM material_allocations
                        WHERE material_id = ? AND required_qty > allocated_qty;
                        """,
                        (mat_id,),
                    ).fetchall()
                ]
                # Cover unmet demand not already covered by incoming supply,
                # plus top net availability back up to the reorder threshold.
                unmet_beyond_incoming = max(unmet_qty - float(row["incoming"]), 0.0)
                threshold_gap = max(threshold - max(net_avail, 0.0), 0.0)
                recommended_qty = round(unmet_beyond_incoming + threshold_gap, 2)
                shortages.append(
                    {
                        "material_id": mat_id,
                        "sku": row["sku"],
                        "material_name": row["name"],
                        "unit": row["unit"],
                        "on_hand": float(row["on_hand"]),
                        "incoming": float(row["incoming"]),
                        "allocated": float(row["allocated"]),
                        "net_availability": net_avail,
                        "unmet_order_demand": unmet_qty,
                        "reorder_threshold": threshold,
                        "recommended_purchase_qty": recommended_qty,
                        "supplier_id": row["supplier_id"],
                        "supplier_name": row["supplier_name"],
                        "lead_time_days": row["lead_time_days"],
                        "affected_orders": affected,
                    }
                )
        return shortages


def sync_inventory_alerts(db_path: str) -> None:
    """Create proactive STOCK_OUT / LOW_STOCK alerts when shortages are detected.

    An alert is suppressed while an unacknowledged alert for the same
    type+entity exists, and for 24h after the most recent alert was
    acknowledged, so persistent conditions do not spam the alert feed.
    """
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    renotify_after = now_dt.timestamp() - 24 * 3600
    shortages = detect_shortages(db_path)
    with get_connection(db_path) as conn:
        for item in shortages:
            alert_type = "STOCK_OUT" if item["unmet_order_demand"] > 0 or item["net_availability"] <= 0 else "LOW_STOCK"
            severity = "CRITICAL" if item["unmet_order_demand"] > 0 else "MEDIUM"
            existing = conn.execute(
                """
                SELECT acknowledged, created_at FROM inventory_alerts
                WHERE alert_type = ? AND entity_id = ?
                ORDER BY created_at DESC LIMIT 1;
                """,
                (alert_type, item["material_id"]),
            ).fetchone()
            if existing:
                try:
                    last_ts = datetime.fromisoformat(str(existing["created_at"])).timestamp()
                except (TypeError, ValueError):
                    last_ts = 0.0
                if not existing["acknowledged"] or last_ts > renotify_after:
                    continue
            conn.execute(
                """
                INSERT INTO inventory_alerts (alert_type, severity, entity_id, message, acknowledged, created_at)
                VALUES (?, ?, ?, ?, 0, ?);
                """,
                (
                    alert_type,
                    severity,
                    item["material_id"],
                    f"{item['material_name']} ({item['sku']}): net_avail={item['net_availability']} {item['unit']}, unmet_demand={item['unmet_order_demand']}.",
                    now,
                ),
            )
