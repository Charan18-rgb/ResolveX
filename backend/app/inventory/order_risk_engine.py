"""Deterministic CRD risk & projected ship date engine."""

from datetime import date, datetime, timedelta, timezone
from typing import Literal
from app.database.connection import get_connection
from app.models.order_schemas import MissingMaterialDetail, OrderRiskItem, RiskCategory


def evaluate_order_risks(db_path: str) -> list[OrderRiskItem]:
    """Evaluate CRD risk and projected ship dates for all OPEN orders."""
    from app.inventory.allocation_engine import recalculate_allocations

    # Refresh allocations first so orders created via events are assessed
    # against current inventory rather than stale allocation rows.
    recalculate_allocations(db_path)

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    today = now.date()
    results: list[OrderRiskItem] = []

    with get_connection(db_path) as conn:
        orders = conn.execute(
            """
            SELECT id, customer_name, product_code, quantity, customer_request_date,
                   processing_days, status
            FROM orders
            WHERE status = 'OPEN'
            ORDER BY customer_request_date ASC, created_at ASC, id ASC;
            """
        ).fetchall()

        for order in orders:
            try:
                crd_date = date.fromisoformat(str(order["customer_request_date"]))
                crd_valid = True
            except (TypeError, ValueError):
                crd_date = None
                crd_valid = False
            raw_proc = order["processing_days"]
            proc_days = max(0, int(raw_proc)) if raw_proc is not None else 1

            has_bom = conn.execute(
                "SELECT COUNT(*) AS c FROM bills_of_materials WHERE product_code = ?;",
                (order["product_code"],),
            ).fetchone()["c"] > 0

            alloc_rows = conn.execute(
                """
                SELECT a.material_id, a.required_qty, a.allocated_qty,
                       m.name AS material_name, b.incoming, s.lead_time_days
                FROM material_allocations a
                JOIN materials m ON m.id = a.material_id
                JOIN inventory_balances b ON b.material_id = a.material_id
                LEFT JOIN suppliers s ON s.id = m.preferred_supplier_id
                WHERE a.order_id = ?;
                """,
                (order["id"],),
            ).fetchall()

            missing: list[MissingMaterialDetail] = []
            max_wait_days = 0
            missing_lead_time = False
            has_unbacked_shortage = False

            for row in alloc_rows:
                shortage = round(float(row["required_qty"]) - float(row["allocated_qty"]), 4)
                if shortage > 0:
                    incoming = float(row["incoming"])
                    lead_days = row["lead_time_days"]
                    exp_date = None
                    if lead_days is None:
                        missing_lead_time = True
                    else:
                        exp_date = (today + timedelta(days=int(lead_days))).isoformat()
                        max_wait_days = max(max_wait_days, int(lead_days))
                    if incoming < shortage:
                        has_unbacked_shortage = True

                    missing.append(
                        MissingMaterialDetail(
                            material_id=row["material_id"],
                            material_name=row["material_name"],
                            required_qty=float(row["required_qty"]),
                            allocated_qty=float(row["allocated_qty"]),
                            shortage_qty=shortage,
                            expected_available_date=exp_date,
                        )
                    )

            projected_ship: str | None = None
            ship_status: Literal["CALCULATED", "ESTIMATED", "UNAVAILABLE"] = "CALCULATED"
            risk: RiskCategory

            if not crd_valid:
                ship_status = "UNAVAILABLE"
                risk = "BLOCKED"
                explanation = (
                    f"Customer required date '{order['customer_request_date']}' is missing or invalid; "
                    "projected ship date cannot be assessed against it."
                )
            elif not has_bom:
                ship_status = "UNAVAILABLE"
                risk = "AT_RISK"
                explanation = (
                    f"No bill of materials is defined for product '{order['product_code']}'; "
                    "material requirements could not be verified against inventory."
                )
            elif not missing:
                proj_date = today + timedelta(days=proc_days)
                projected_ship = proj_date.isoformat()
                if proj_date <= crd_date:
                    risk = "ON_TRACK"
                    explanation = f"All required materials allocated; projected ship {projected_ship} meets CRD {order['customer_request_date']}."
                else:
                    risk = "DELAYED"
                    explanation = f"Materials allocated, but {proc_days}d processing pushes ship date ({projected_ship}) past CRD ({order['customer_request_date']})."
            elif missing_lead_time:
                ship_status = "UNAVAILABLE"
                risk = "BLOCKED"
                explanation = "Material shortage detected and supplier lead-time data is missing; projected ship date unavailable."
            else:
                proj_date = today + timedelta(days=max_wait_days + proc_days)
                projected_ship = proj_date.isoformat()
                ship_status = "ESTIMATED" if has_unbacked_shortage else "CALCULATED"
                if has_unbacked_shortage:
                    risk = "BLOCKED" if proj_date > crd_date else "AT_RISK"
                    explanation = (
                        f"Shortage of {len(missing)} material(s) exceeds incoming supply; "
                        f"earliest estimated ship {projected_ship} assuming replenishment in {max_wait_days}d."
                    )
                elif proj_date <= crd_date:
                    risk = "AT_RISK"
                    explanation = f"Shortage covered by incoming supply ({max_wait_days}d lead time); projected ship {projected_ship} meets CRD."
                else:
                    risk = "DELAYED"
                    explanation = f"Incoming supply arrives too late; projected ship {projected_ship} misses CRD {order['customer_request_date']}."

            conn.execute(
                """
                UPDATE orders
                SET risk_category = ?, projected_ship_date = ?, risk_explanation = ?, updated_at = ?
                WHERE id = ?;
                """,
                (risk, projected_ship, explanation, now_iso, order["id"]),
            )

            results.append(
                OrderRiskItem(
                    order_id=order["id"],
                    customer_name=order["customer_name"],
                    product_code=order["product_code"],
                    quantity=int(order["quantity"]),
                    customer_request_date=order["customer_request_date"],
                    status=order["status"],
                    risk_category=risk,
                    projected_ship_date=projected_ship,
                    ship_date_status=ship_status,
                    missing_materials=missing,
                    explanation=explanation,
                    data_timestamp=now_iso,
                )
            )

    return results
