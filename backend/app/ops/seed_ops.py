"""Idempotent seed data for warehouse storage locations and supplier delivery history."""

from datetime import datetime, timedelta, timezone

from app.database.connection import get_connection


STORAGE_BINS_SEED = [
    # zone, rack, shelf, capacity, material, stored, incoming, status, pos
    ("ZONE-A", "RACK-01", "SHELF-01", 500.0, "MAT-STEEL", 120.0, 80.0, "INCOMING", 0),
    ("ZONE-A", "RACK-01", "SHELF-02", 500.0, "MAT-STEEL", 0.0, 0.0, "AVAILABLE", 1),
    ("ZONE-A", "RACK-01", "SHELF-03", 100.0, "MAT-SJACK-5T", 24.0, 6.0, "INCOMING", 12),
    ("ZONE-A", "RACK-01", "SHELF-04", 100.0, "MAT-SJACK-2T", 18.0, 0.0, "OCCUPIED", 13),
    ("ZONE-A", "RACK-02", "SHELF-01", 600.0, "MAT-COPPER", 500.0, 0.0, "OCCUPIED", 2),
    ("ZONE-A", "RACK-02", "SHELF-02", 500.0, "MAT-ALUM-ROD", 260.0, 80.0, "INCOMING", 3),
    ("ZONE-A", "RACK-02", "SHELF-03", 400.0, "MAT-PIPE-SS2", 180.0, 50.0, "INCOMING", 14),
    ("ZONE-A", "RACK-02", "SHELF-04", 600.0, "MAT-CABLE-4C", 450.0, 100.0, "INCOMING", 15),
    ("ZONE-B", "RACK-03", "SHELF-01", 600.0, "MAT-BOLT", 300.0, 200.0, "INCOMING", 4),
    ("ZONE-B", "RACK-03", "SHELF-02", 400.0, None, 0.0, 0.0, "AVAILABLE", 5),
    ("ZONE-B", "RACK-03", "SHELF-03", 3500.0, "MAT-NUT-M8", 2400.0, 500.0, "INCOMING", 16),
    ("ZONE-B", "RACK-03", "SHELF-04", 4000.0, "MAT-WASH-M8", 3200.0, 0.0, "OCCUPIED", 17),
    ("ZONE-B", "RACK-03", "SHELF-05", 200.0, "MAT-VALVE-BV1", 85.0, 20.0, "INCOMING", 18),
    ("ZONE-B", "RACK-03", "SHELF-06", 150.0, "MAT-VALVE-CHK", 42.0, 0.0, "OCCUPIED", 19),
    ("ZONE-B", "RACK-04", "SHELF-01", 120.0, "MAT-CHIP", 15.0, 0.0, "OCCUPIED", 6),
    ("ZONE-B", "RACK-04", "SHELF-02", 120.0, "MAT-CHIP", 0.0, 0.0, "RESERVED", 7),
    ("ZONE-B", "RACK-04", "SHELF-03", 300.0, "MAT-BRG-6205", 140.0, 40.0, "INCOMING", 20),
    ("ZONE-B", "RACK-04", "SHELF-04", 150.0, "MAT-GEAR-SP24", 65.0, 0.0, "OCCUPIED", 21),
    ("ZONE-B", "RACK-04", "SHELF-05", 250.0, "MAT-REL-24V", 110.0, 30.0, "INCOMING", 22),
    ("ZONE-B", "RACK-04", "SHELF-06", 200.0, "MAT-MCB-32A", 90.0, 0.0, "OCCUPIED", 23),
    ("ZONE-C", "RACK-05", "SHELF-01", 60.0, "MAT-MOTOR-3HP", 14.0, 4.0, "INCOMING", 8),
    ("ZONE-C", "RACK-05", "SHELF-02", 60.0, "MAT-PUMP-CP2", 10.0, 2.0, "INCOMING", 9),
    ("ZONE-C", "RACK-06", "SHELF-01", 250.0, None, 0.0, 0.0, "RESTRICTED", 10),
    ("ZONE-C", "RACK-06", "SHELF-02", 100.0, "MAT-WRENCH-TRQ", 16.0, 0.0, "OCCUPIED", 11),
    ("ZONE-C", "RACK-06", "SHELF-03", 100.0, "MAT-SEAL-KIT", 10.0, 0.0, "OCCUPIED", 24),
    ("ZONE-C", "RACK-06", "SHELF-04", 300.0, "MAT-HELMET-IND", 120.0, 40.0, "INCOMING", 25),
    ("ZONE-C", "RACK-06", "SHELF-05", 400.0, "MAT-GLOVE-CUT", 190.0, 50.0, "INCOMING", 26),
    ("ZONE-C", "RACK-06", "SHELF-06", 300.0, "MAT-GOGGLE-SAF", 150.0, 0.0, "OCCUPIED", 27),
]


def seed_ops_data(db_path: str) -> None:
    """Seed warehouses, storage bins, and supplier delivery records idempotently."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    with get_connection(db_path) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO warehouses (id, code, name, created_at) VALUES (?, ?, ?, ?);",
            ("WH-01", "BLR-HUB-01", "Bengaluru Central Warehouse", now_iso),
        )

        # Ensure every catalog bin exists cleanly even on already-seeded databases.
        for zone, rack, shelf, cap, mat, stored, incoming, status, pos in STORAGE_BINS_SEED:
            loc_id = f"LOC-{zone}-{rack}-{shelf}"
            existing_loc = conn.execute(
                "SELECT material_id FROM storage_locations WHERE id = ?;", (loc_id,)
            ).fetchone()
            if existing_loc is None:
                conn.execute(
                    """
                    INSERT INTO storage_locations (
                        id, warehouse_id, zone_code, rack_code, shelf_code,
                        position_index, capacity_units, material_id, stored_qty,
                        incoming_qty, status, created_at
                    ) VALUES (?, 'WH-01', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (loc_id, zone, rack, shelf, pos, cap, mat, stored, incoming, status, now_iso),
                )
            elif existing_loc["material_id"] is None and mat is not None:
                # Assign newly added catalog items to previously empty bins on upgrade
                conn.execute(
                    """
                    UPDATE storage_locations
                    SET material_id = ?, stored_qty = ?, incoming_qty = ?, status = ?, capacity_units = ?
                    WHERE id = ?;
                    """,
                    (mat, stored, incoming, status, cap, loc_id),
                )

        if conn.execute("SELECT COUNT(*) FROM supplier_deliveries;").fetchone()[0] > 0:
            return

        materials_cycle = ["MAT-STEEL", "MAT-COPPER", "MAT-BOLT", "MAT-CHIP", "MAT-SJACK-5T", "MAT-BRG-6205", "MAT-MOTOR-3HP"]
        refs = []
        for sup_idx, sup in enumerate(["SUP-01", "SUP-02", "SUP-03", "SUP-04", "SUP-05"]):
            for i in range(10):
                mat = materials_cycle[(i + sup_idx) % len(materials_cycle)]
                qty = 20.0 + ((i * 23 + sup_idx * 11) % 150)
                days_ago = 5 + i * 7 + sup_idx * 2
                expected = (now - timedelta(days=days_ago)).date()
                late_mod = (i + sup_idx) % (4 + (sup_idx % 3))
                if late_mod == 0 and sup_idx in (1, 3):
                    status = "DELIVERED_LATE"
                    delay = 1.0 + (i % 3)
                    actual = expected + timedelta(days=int(delay))
                elif i == 8 and sup_idx == 1:
                    status = "FAILED"
                    delay = 0.0
                    actual = None
                elif i == 7 and sup_idx == 2:
                    status = "CANCELLED"
                    delay = 0.0
                    actual = None
                elif i >= 9:
                    status = "PENDING"
                    delay = 0.0
                    actual = None
                else:
                    status = "DELIVERED_ON_TIME"
                    delay = 0.0
                    actual = expected
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
