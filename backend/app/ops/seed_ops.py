"""Idempotent seed data for warehouse storage locations and supplier delivery history."""

from datetime import datetime, timedelta, timezone

from app.database.connection import get_connection


def seed_ops_data(db_path: str) -> None:
    """Seed warehouses, storage bins, and supplier delivery records idempotently."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    with get_connection(db_path) as conn:
        if conn.execute("SELECT COUNT(*) FROM warehouses;").fetchone()[0] > 0:
            return

        conn.execute(
            "INSERT INTO warehouses (id, code, name, created_at) VALUES (?, ?, ?, ?);",
            ("WH-01", "BLR-HUB-01", "Bengaluru Central Warehouse", now_iso),
        )

        # Storage bins: zone/rack/shelf -> capacity, material, stored qty.
        # position_index drives the 3D layout ordering.
        bins = [
            # zone, rack, shelf, capacity, material, stored, incoming, status, pos
            ("ZONE-A", "RACK-01", "SHELF-01", 500.0, "MAT-STEEL", 120.0, 80.0, "INCOMING", 0),
            ("ZONE-A", "RACK-01", "SHELF-02", 500.0, "MAT-STEEL", 0.0, 0.0, "AVAILABLE", 1),
            ("ZONE-A", "RACK-02", "SHELF-01", 400.0, "MAT-COPPER", 500.0, 0.0, "OCCUPIED", 2),
            ("ZONE-A", "RACK-02", "SHELF-02", 400.0, None, 0.0, 0.0, "AVAILABLE", 3),
            ("ZONE-B", "RACK-03", "SHELF-01", 300.0, "MAT-BOLT", 300.0, 200.0, "INCOMING", 4),
            ("ZONE-B", "RACK-03", "SHELF-02", 300.0, "MAT-BOLT", 0.0, 0.0, "AVAILABLE", 5),
            ("ZONE-B", "RACK-04", "SHELF-01", 120.0, "MAT-CHIP", 15.0, 0.0, "OCCUPIED", 6),
            ("ZONE-B", "RACK-04", "SHELF-02", 120.0, "MAT-CHIP", 0.0, 0.0, "RESERVED", 7),
            ("ZONE-C", "RACK-05", "SHELF-01", 600.0, None, 0.0, 0.0, "AVAILABLE", 8),
            ("ZONE-C", "RACK-05", "SHELF-02", 600.0, None, 0.0, 0.0, "AVAILABLE", 9),
            ("ZONE-C", "RACK-06", "SHELF-01", 250.0, None, 0.0, 0.0, "RESTRICTED", 10),
            ("ZONE-C", "RACK-06", "SHELF-02", 250.0, None, 0.0, 0.0, "AVAILABLE", 11),
        ]
        for zone, rack, shelf, cap, mat, stored, incoming, status, pos in bins:
            conn.execute(
                """
                INSERT OR IGNORE INTO storage_locations (
                    id, warehouse_id, zone_code, rack_code, shelf_code,
                    position_index, capacity_units, material_id, stored_qty,
                    incoming_qty, status, created_at
                ) VALUES (?, 'WH-01', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    f"LOC-{zone}-{rack}-{shelf}", zone, rack, shelf, pos,
                    cap, mat, stored, incoming, status, now_iso,
                ),
            )

        # Supplier delivery history: ~120 days of records per supplier.
        # status: DELIVERED_ON_TIME | DELIVERED_LATE | FAILED | CANCELLED | PENDING
        materials_cycle = ["MAT-STEEL", "MAT-COPPER", "MAT-BOLT", "MAT-CHIP"]
        refs = []
        for sup_idx, sup in enumerate(["SUP-01", "SUP-02", "SUP-03"]):
            # deterministic pseudo-varied history
            for i in range(14):
                mat = materials_cycle[(i + sup_idx) % len(materials_cycle)]
                qty = 50.0 + ((i * 37 + sup_idx * 11) % 200)
                days_ago = 5 + i * 8 + sup_idx * 3
                expected = (now - timedelta(days=days_ago)).date()
                # supplier-specific lateness profile (deterministic):
                # SUP-01 rarely late, SUP-02 occasionally, SUP-03 almost never
                late_mod = (i + sup_idx) % (4 + sup_idx)
                if late_mod == 0 and sup_idx == 1:
                    status = "DELIVERED_LATE"
                    delay = 1.0 + (i % 3)
                    actual = expected + timedelta(days=int(delay))
                elif i == 12 and sup_idx == 1:
                    status = "FAILED"
                    delay = 0.0
                    actual = None
                elif i == 10 and sup_idx == 2:
                    status = "CANCELLED"
                    delay = 0.0
                    actual = None
                elif i >= 13:
                    status = "PENDING"
                    delay = 0.0
                    actual = None
                else:
                    status = "DELIVERED_ON_TIME"
                    delay = 0.0
                    actual = expected + timedelta(days=0)
                refs.append(
                    (
                        sup,
                        f"DLV-{sup}-{i:03d}",
                        mat,
                        qty,
                        expected.isoformat(),
                        actual.isoformat() if actual else None,
                        status,
                        delay,
                        (now - timedelta(days=days_ago)).isoformat(),
                    )
                )
        conn.executemany(
            """
            INSERT OR IGNORE INTO supplier_deliveries (
                supplier_id, delivery_ref, material_id, quantity,
                expected_date, actual_date, status, delay_days, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            refs,
        )
