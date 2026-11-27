"""Deterministic supplier delivery performance — computed only from recorded deliveries."""

from typing import Any

from app.database.connection import get_connection


def _performance_row(row: Any) -> dict[str, Any]:
    total = int(row["total"] or 0)
    delivered = int(row["delivered"] or 0)
    on_time = int(row["on_time"] or 0)
    late = int(row["late"] or 0)
    failed = int(row["failed"] or 0)
    cancelled = int(row["cancelled"] or 0)
    pending = int(row["pending"] or 0)
    avg_delay = float(row["avg_delay"] or 0.0)
    return {
        "supplier_id": row["supplier_id"],
        "supplier_name": row["supplier_name"],
        "lead_time_days": row["lead_time_days"],
        "total_deliveries": total,
        "delivered": delivered,
        "on_time": on_time,
        "late": late,
        "failed": failed,
        "cancelled": cancelled,
        "pending": pending,
        "on_time_rate": round(on_time / delivered * 100, 1) if delivered else None,
        "avg_delay_days": round(avg_delay, 2),
        "last_delivery_date": row["last_delivery_date"],
        "sample_note": f"Based on {total} recorded deliveries.",
    }


def get_supplier_performance(db_path: str) -> list[dict[str, Any]]:
    """Per-supplier delivery statistics computed from supplier_deliveries history."""
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT s.id AS supplier_id, s.name AS supplier_name, s.lead_time_days,
                   COUNT(d.id) AS total,
                   SUM(CASE WHEN d.status IN ('DELIVERED_ON_TIME','DELIVERED_LATE') THEN 1 ELSE 0 END) AS delivered,
                   SUM(CASE WHEN d.status = 'DELIVERED_ON_TIME' THEN 1 ELSE 0 END) AS on_time,
                   SUM(CASE WHEN d.status = 'DELIVERED_LATE' THEN 1 ELSE 0 END) AS late,
                   SUM(CASE WHEN d.status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
                   SUM(CASE WHEN d.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
                   SUM(CASE WHEN d.status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
                   AVG(CASE WHEN d.status = 'DELIVERED_LATE' THEN d.delay_days ELSE 0 END) AS avg_delay,
                   MAX(CASE WHEN d.actual_date IS NOT NULL THEN d.actual_date END) AS last_delivery_date
            FROM suppliers s
            LEFT JOIN supplier_deliveries d ON d.supplier_id = s.id
            GROUP BY s.id
            ORDER BY s.name;
            """
        ).fetchall()
    return [_performance_row(r) for r in rows]


def get_supplier_detail(db_path: str, supplier_ref: str) -> dict[str, Any] | None:
    """Supplier profile plus recent delivery history."""
    with get_connection(db_path) as conn:
        sup = conn.execute(
            "SELECT * FROM suppliers WHERE id = ? OR name LIKE ?;",
            (supplier_ref, f"%{supplier_ref}%"),
        ).fetchone()
        if not sup:
            return None
        deliveries = conn.execute(
            """
            SELECT d.*, m.name AS material_name, m.sku AS material_sku, m.unit AS material_unit
            FROM supplier_deliveries d
            JOIN materials m ON m.id = d.material_id
            WHERE d.supplier_id = ?
            ORDER BY d.expected_date DESC
            LIMIT 50;
            """,
            (sup["id"],),
        ).fetchall()
    perf = next(
        (p for p in get_supplier_performance(db_path) if p["supplier_id"] == sup["id"]), None
    )
    return {
        "supplier": dict(sup),
        "performance": perf,
        "deliveries": [dict(d) for d in deliveries],
    }


def compare_suppliers(db_path: str, ref_a: str, ref_b: str) -> dict[str, Any] | None:
    """Side-by-side performance for two suppliers (by id fragment or name)."""
    a = get_supplier_detail(db_path, ref_a)
    b = get_supplier_detail(db_path, ref_b)
    if not a or not b:
        return None
    return {"a": a, "b": b}
