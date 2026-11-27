"""Reproducible fictional manufacturing seed data for ResolveX PS2."""

from datetime import datetime, timedelta, timezone
from app.database.connection import get_connection


def seed_demo_data(db_path: str) -> None:
    """Seed suppliers, materials, balances, BOMs, and orders idempotently."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    d2 = (now + timedelta(days=2)).date().isoformat()
    d4 = (now + timedelta(days=4)).date().isoformat()
    d7 = (now + timedelta(days=7)).date().isoformat()

    with get_connection(db_path) as conn:
        existing = conn.execute("SELECT COUNT(*) FROM materials;").fetchone()[0]
        if existing > 0:
            return

        suppliers = [
            ("SUP-01", "Apex Metals Co.", "orders@apexmetals.example", 4, 0.96, now_iso),
            ("SUP-02", "VoltCore Components", "supply@voltcore.example", 6, 0.91, now_iso),
            ("SUP-03", "Precision Fasteners Ltd.", "sales@precisionfast.example", 3, 0.98, now_iso),
        ]
        conn.executemany(
            """
            INSERT INTO suppliers (id, name, email, lead_time_days, reliability_score, created_at)
            VALUES (?, ?, ?, ?, ?, ?);
            """,
            suppliers,
        )

        materials = [
            ("MAT-STEEL", "SKU-STL-01", "Cold-Rolled Steel Sheet", "2mm industrial steel sheet", "kg", 150.0, "SUP-01", now_iso),
            ("MAT-COPPER", "SKU-COP-02", "Copper Winding Wire", "High-conductivity copper coil", "m", 200.0, "SUP-02", now_iso),
            ("MAT-BOLT", "SKU-BLT-03", "M8 Titanium Bolts", "High-tensile structural bolts", "pcs", 500.0, "SUP-03", now_iso),
            ("MAT-CHIP", "SKU-CHP-04", "ARM Control Module", "Embedded motor controller IC", "pcs", 40.0, "SUP-02", now_iso),
        ]
        conn.executemany(
            """
            INSERT INTO materials (id, sku, name, description, unit, reorder_threshold, preferred_supplier_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            materials,
        )

        balances = [
            ("MAT-STEEL", 120.0, 80.0, 0.0, now_iso),
            ("MAT-COPPER", 500.0, 0.0, 0.0, now_iso),
            ("MAT-BOLT", 300.0, 200.0, 0.0, now_iso),
            ("MAT-CHIP", 15.0, 0.0, 0.0, now_iso),
        ]
        conn.executemany(
            """
            INSERT INTO inventory_balances (material_id, on_hand, incoming, allocated, updated_at)
            VALUES (?, ?, ?, ?, ?);
            """,
            balances,
        )

        boms = [
            ("PROD-MOTOR-X1", "MAT-STEEL", 10.0),
            ("PROD-MOTOR-X1", "MAT-COPPER", 25.0),
            ("PROD-MOTOR-X1", "MAT-BOLT", 20.0),
            ("PROD-MOTOR-X1", "MAT-CHIP", 1.0),
            ("PROD-FRAME-S2", "MAT-STEEL", 15.0),
            ("PROD-FRAME-S2", "MAT-BOLT", 30.0),
        ]
        conn.executemany(
            """
            INSERT INTO bills_of_materials (product_code, material_id, quantity_per_unit)
            VALUES (?, ?, ?);
            """,
            boms,
        )

        orders = [
            ("ORD-1001", "Acme Robotics", "PROD-MOTOR-X1", 10, d2, 1, "OPEN", None, None, None, now_iso, now_iso),
            ("ORD-1002", "Nova Automation", "PROD-MOTOR-X1", 10, d4, 1, "OPEN", None, None, None, now_iso, now_iso),
            ("ORD-1003", "Titan Heavy Ind.", "PROD-FRAME-S2", 8, d7, 2, "OPEN", None, None, None, now_iso, now_iso),
        ]
        conn.executemany(
            """
            INSERT INTO orders (
                id, customer_name, product_code, quantity, customer_request_date,
                processing_days, status, risk_category, projected_ship_date,
                risk_explanation, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            orders,
        )
