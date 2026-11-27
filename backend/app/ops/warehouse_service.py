"""Deterministic warehouse storage queries — zones, bins, capacity, product locations."""

from typing import Any

from app.database.connection import get_connection


def get_warehouse_overview(db_path: str) -> dict[str, Any]:
    """Aggregate warehouse capacity by zone with per-status bin counts."""
    with get_connection(db_path) as conn:
        wh = conn.execute("SELECT * FROM warehouses ORDER BY code LIMIT 1;").fetchone()
        if not wh:
            return {"warehouse": None, "zones": [], "totals": {}}
        zones = conn.execute(
            """
            SELECT zone_code,
                   COUNT(*) AS bin_count,
                   SUM(capacity_units) AS capacity_units,
                   SUM(stored_qty) AS stored_units,
                   SUM(incoming_qty) AS incoming_units,
                   SUM(CASE WHEN status = 'AVAILABLE' THEN capacity_units - stored_qty ELSE 0 END) AS free_units
            FROM storage_locations
            WHERE warehouse_id = ?
            GROUP BY zone_code
            ORDER BY zone_code;
            """,
            (wh["id"],),
        ).fetchall()
        totals_row = conn.execute(
            """
            SELECT COUNT(*) AS bin_count,
                   SUM(capacity_units) AS capacity_units,
                   SUM(stored_qty) AS stored_units,
                   SUM(incoming_qty) AS incoming_units
            FROM storage_locations WHERE warehouse_id = ?;
            """,
            (wh["id"],),
        ).fetchone()
    zones_out = []
    for z in zones:
        cap = float(z["capacity_units"] or 0)
        stored = float(z["stored_units"] or 0)
        zones_out.append(
            {
                "zone_code": z["zone_code"],
                "bin_count": z["bin_count"],
                "capacity_units": cap,
                "stored_units": stored,
                "incoming_units": float(z["incoming_units"] or 0),
                "free_units": float(z["free_units"] or 0),
                "utilization_pct": round(stored / cap * 100, 1) if cap else 0.0,
            }
        )
    totals = dict(totals_row) if totals_row else {}
    cap = float(totals.get("capacity_units") or 0)
    stored = float(totals.get("stored_units") or 0)
    return {
        "warehouse": dict(wh),
        "zones": zones_out,
        "totals": {
            "bin_count": totals.get("bin_count") or 0,
            "capacity_units": cap,
            "stored_units": stored,
            "incoming_units": float(totals.get("incoming_units") or 0),
            "utilization_pct": round(stored / cap * 100, 1) if cap else 0.0,
        },
    }


def get_storage_locations(db_path: str, material_id: str | None = None) -> list[dict[str, Any]]:
    """Return storage bins, optionally filtered to a material, with material names."""
    sql = """
        SELECT sl.*, m.name AS material_name, m.sku AS material_sku, m.unit AS material_unit
        FROM storage_locations sl
        LEFT JOIN materials m ON m.id = sl.material_id
    """
    params: tuple = ()
    if material_id:
        sql += " WHERE sl.material_id = ?"
        params = (material_id,)
    sql += " ORDER BY sl.zone_code, sl.rack_code, sl.shelf_code, sl.position_index;"
    with get_connection(db_path) as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def get_material_location(db_path: str, material_ref: str) -> dict[str, Any] | None:
    """Find all bins holding a material (by material id or SKU)."""
    with get_connection(db_path) as conn:
        mat = conn.execute(
            "SELECT * FROM materials WHERE id = ? OR sku = ?;", (material_ref, material_ref)
        ).fetchone()
        if not mat:
            return None
        bins = conn.execute(
            """
            SELECT sl.*, m.name AS material_name, m.sku AS material_sku, m.unit AS material_unit
            FROM storage_locations sl
            JOIN materials m ON m.id = sl.material_id
            WHERE sl.material_id = ?
            ORDER BY sl.zone_code, sl.rack_code, sl.shelf_code;
            """,
            (mat["id"],),
        ).fetchall()
        bal = conn.execute(
            "SELECT * FROM inventory_balances WHERE material_id = ?;", (mat["id"],)
        ).fetchone()
    return {
        "material": dict(mat),
        "balance": dict(bal) if bal else None,
        "locations": [dict(b) for b in bins],
    }
