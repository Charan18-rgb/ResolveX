"""Deterministic inventory allocation engine (Earliest Customer Request Date First)."""

from datetime import datetime, timezone
from app.database.connection import get_connection
from app.models.order_schemas import AllocationRecord


def recalculate_allocations(db_path: str) -> list[AllocationRecord]:
    """
    Re-allocate physical on-hand inventory across OPEN orders using:
    Policy: Earliest Customer Request Date (CRD) first, tie-broken by created_at ASC, id ASC.
    Supports partial allocation without over-allocating beyond on-hand stock.
    """
    now = datetime.now(timezone.utc).isoformat()
    records: list[AllocationRecord] = []

    with get_connection(db_path) as conn:
        balances = {
            row["material_id"]: float(row["on_hand"])
            for row in conn.execute("SELECT material_id, on_hand FROM inventory_balances;").fetchall()
        }
        remaining_on_hand = {k: max(0.0, v) for k, v in balances.items()}
        total_allocated: dict[str, float] = {k: 0.0 for k in balances}

        open_orders = conn.execute(
            """
            SELECT id, product_code, quantity, customer_request_date, created_at
            FROM orders
            WHERE status = 'OPEN'
            ORDER BY customer_request_date ASC, created_at ASC, id ASC;
            """
        ).fetchall()

        conn.execute("DELETE FROM material_allocations;")

        for rank, order in enumerate(open_orders, start=1):
            bom_rows = conn.execute(
                """
                SELECT material_id, quantity_per_unit
                FROM bills_of_materials
                WHERE product_code = ?
                ORDER BY material_id ASC;
                """,
                (order["product_code"],),
            ).fetchall()

            for bom in bom_rows:
                mat_id = bom["material_id"]
                req_qty = round(float(order["quantity"]) * float(bom["quantity_per_unit"]), 4)
                avail = remaining_on_hand.get(mat_id, 0.0)
                alloc_qty = round(min(req_qty, avail), 4)
                remaining_on_hand[mat_id] = round(avail - alloc_qty, 4)
                total_allocated[mat_id] = round(total_allocated.get(mat_id, 0.0) + alloc_qty, 4)

                reason = (
                    f"Earliest-CRD priority rank #{rank} (CRD={order['customer_request_date']}, "
                    f"allocated {alloc_qty}/{req_qty})."
                )
                conn.execute(
                    """
                    INSERT INTO material_allocations (
                        order_id, material_id, required_qty, allocated_qty, priority_reason, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?);
                    """,
                    (order["id"], mat_id, req_qty, alloc_qty, reason, now),
                )
                records.append(
                    AllocationRecord(
                        order_id=order["id"],
                        material_id=mat_id,
                        required_qty=req_qty,
                        allocated_qty=alloc_qty,
                        priority_reason=reason,
                        updated_at=now,
                    )
                )

        for mat_id, alloc_total in total_allocated.items():
            conn.execute(
                "UPDATE inventory_balances SET allocated = ?, updated_at = ? WHERE material_id = ?;",
                (alloc_total, now, mat_id),
            )

    return records


def list_allocations(db_path: str) -> list[AllocationRecord]:
    """Return current material allocation records."""
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT order_id, material_id, required_qty, allocated_qty, priority_reason, updated_at
            FROM material_allocations
            ORDER BY order_id ASC, material_id ASC;
            """
        ).fetchall()
    return [AllocationRecord(**dict(r)) for r in rows]
