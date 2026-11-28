"""Reproducible industrial manufacturing & warehouse seed data for ResolveX."""

from datetime import datetime, timedelta, timezone
import json
from app.database.connection import get_connection


# Catalog items organized into industrial categories with common names & synonyms.
# Preserves the core 4 scenario items (MAT-STEEL, MAT-COPPER, MAT-BOLT, MAT-CHIP)
# plus 20 realistic industrial materials, components, tools, machinery parts & PPE.
EXPANDED_CATALOG: list[tuple[str, str, str, str, str, list[str], str, float, str, float, float]] = [
    # (id, sku, name, description, category, aliases, unit, threshold, supplier_id, on_hand, incoming)
    (
        "MAT-STEEL", "SKU-STL-01", "Cold-Rolled Steel Sheet",
        "2mm industrial structural cold-rolled steel sheet (4x8 ft)",
        "Raw Metals", ["steel sheet", "cold rolled steel", "sheet metal", "metal sheet", "steel plate", "steel"],
        "kg", 150.0, "SUP-01", 120.0, 80.0,
    ),
    (
        "MAT-COPPER", "SKU-COP-02", "Copper Winding Wire",
        "Enamelled high-conductivity magnet copper coil wire",
        "Electrical & Wiring", ["copper wire", "winding wire", "copper coil", "magnet wire", "copper"],
        "m", 200.0, "SUP-02", 500.0, 0.0,
    ),
    (
        "MAT-BOLT", "SKU-BLT-03", "M8 Titanium Bolts",
        "High-tensile M8 hex head structural titanium fasteners",
        "Fasteners", ["bolt", "bolts", "m8 bolt", "m8 bolts", "titanium bolt", "hex bolt", "fasteners"],
        "pcs", 500.0, "SUP-03", 300.0, 200.0,
    ),
    (
        "MAT-CHIP", "SKU-CHP-04", "ARM Control Module",
        "32-bit embedded motor controller IC board",
        "Electrical & Wiring", ["arm chip", "control module", "controller ic", "microcontroller", "chip", "mcu"],
        "pcs", 40.0, "SUP-02", 15.0, 0.0,
    ),
    # --- Expanded Realistic Industrial Catalog ---
    (
        "MAT-SJACK-5T", "SKU-LFT-05", "5-Ton Mechanical Screw Jack",
        "Heavy-duty bell-base mechanical lifting screw jack with ratcheting lever",
        "Lifting & Rigging", ["screw jack", "screwjack", "screw jacks", "jack screw", "mechanical jack", "5 ton jack", "lifting jack", "machinery jack", "scru jack"],
        "pcs", 5.0, "SUP-04", 24.0, 6.0,
    ),
    (
        "MAT-SJACK-2T", "SKU-LFT-06", "2-Ton Scissors Screw Jack",
        "Portable compact ACME-thread scissor screw jack for light equipment maintenance",
        "Lifting & Rigging", ["scissor jack", "scissors screw jack", "2 ton screw jack", "compact screw jack", "screw jack", "screwjack", "screw jacks", "jack"],
        "pcs", 6.0, "SUP-04", 18.0, 0.0,
    ),
    (
        "MAT-NUT-M8", "SKU-FST-07", "M8 Stainless Hex Nuts",
        "A2-70 corrosion-resistant M8 hexagonal lock nuts (pack unit: pcs)",
        "Fasteners", ["nut", "nuts", "hex nut", "hex nuts", "m8 nut", "stainless nut", "lock nut"],
        "pcs", 400.0, "SUP-03", 2400.0, 500.0,
    ),
    (
        "MAT-WASH-M8", "SKU-FST-08", "M8 Spring & Flat Washers",
        "Hardened zinc-plated M8 flat and split lock washer assortment",
        "Fasteners", ["washer", "washers", "flat washer", "spring washer", "lock washer", "m8 washer"],
        "pcs", 500.0, "SUP-03", 3200.0, 0.0,
    ),
    (
        "MAT-BRG-6205", "SKU-BRG-09", "6205-2RS Deep Groove Ball Bearing",
        "Double-sealed radial ball bearing (25x52x15mm) for electric motors",
        "Bearings & Gears", ["bearing", "bearings", "ball bearing", "ball bearings", "6205 bearing", "baring", "roller bearing"],
        "pcs", 30.0, "SUP-04", 140.0, 40.0,
    ),
    (
        "MAT-GEAR-SP24", "SKU-GER-10", "24T Hardened Spur Gear",
        "CNC-machined Module 2.5 alloy steel 24-tooth transmission spur gear",
        "Bearings & Gears", ["gear", "gears", "spur gear", "24t gear", "transmission gear", "pinion gear"],
        "pcs", 15.0, "SUP-04", 65.0, 0.0,
    ),
    (
        "MAT-MOTOR-3HP", "SKU-MTR-11", "3HP Three-Phase Induction Motor",
        "TEFC 1440 RPM 415V AC squirrel-cage industrial drive motor",
        "Machinery & Drives", ["motor", "motors", "induction motor", "3hp motor", "electric motor", "ac motor", "drive motor"],
        "pcs", 4.0, "SUP-02", 14.0, 4.0,
    ),
    (
        "MAT-PUMP-CP2", "SKU-PMP-12", "Centrifugal Transfer Pump (2-Inch)",
        "Cast-iron industrial coolant and water centrifugal transfer pump",
        "Machinery & Drives", ["pump", "pumps", "centrifugal pump", "transfer pump", "water pump", "coolant pump"],
        "pcs", 3.0, "SUP-04", 10.0, 2.0,
    ),
    (
        "MAT-ALUM-ROD", "SKU-ALM-13", "6061-T6 Aluminium Round Rod (25mm)",
        "Precision extruded 6061-T6 aluminium bar stock, 25mm diameter",
        "Raw Metals", ["aluminium rod", "aluminum rod", "alu rod", "aluminium bar", "aluminum bar", "6061 rod", "alumunium"],
        "m", 60.0, "SUP-01", 260.0, 80.0,
    ),
    (
        "MAT-PIPE-SS2", "SKU-PIP-14", "Seamless Stainless Steel Pipe (2-Inch)",
        "Schedule 40 SS304 seamless industrial fluid pipe",
        "Pipes & Fluid Control", ["pipe", "pipes", "steel pipe", "ss pipe", "stainless pipe", "fluid pipe"],
        "m", 40.0, "SUP-01", 180.0, 50.0,
    ),
    (
        "MAT-VALVE-BV1", "SKU-VLV-15", "Brass Industrial Ball Valve (1-Inch)",
        "Full-port threaded BSP forged brass quarter-turn shutoff valve",
        "Pipes & Fluid Control", ["valve", "valves", "ball valve", "brass valve", "shutoff valve", "shut-off valve"],
        "pcs", 20.0, "SUP-04", 85.0, 20.0,
    ),
    (
        "MAT-VALVE-CHK", "SKU-VLV-16", "Swing Check Valve (2-Inch)",
        "Bronze non-return swing check valve for process piping lines",
        "Pipes & Fluid Control", ["valve", "valves", "check valve", "non return valve", "nrv", "swing valve", "one way valve"],
        "pcs", 12.0, "SUP-04", 42.0, 0.0,
    ),
    (
        "MAT-REL-24V", "SKU-ELC-17", "24V DIN-Rail Control Relay",
        "DPDT 8-pin industrial panel control relay with LED indicator",
        "Electrical & Wiring", ["relay", "relays", "24v relay", "control relay", "din relay", "electrical relay"],
        "pcs", 25.0, "SUP-02", 110.0, 30.0,
    ),
    (
        "MAT-MCB-32A", "SKU-ELC-18", "32A Double-Pole Circuit Breaker (MCB)",
        "DIN-mount C-curve 10kA miniature circuit breaker for panel boards",
        "Electrical & Wiring", ["breaker", "mcb", "circuit breaker", "switchgear", "electrical breaker", "32a mcb"],
        "pcs", 20.0, "SUP-02", 90.0, 0.0,
    ),
    (
        "MAT-CABLE-4C", "SKU-ELC-19", "4-Core Armoured Power Cable",
        "XLPE insulated steel-wire armoured 4-core 6 sqmm industrial power cable",
        "Electrical & Wiring", ["cable", "cables", "power cable", "armoured cable", "armored cable", "4 core cable"],
        "m", 100.0, "SUP-02", 450.0, 100.0,
    ),
    (
        "MAT-WRENCH-TRQ", "SKU-TLS-20", "Digital Torque Wrench (20-200 Nm)",
        "1/2-inch drive calibrated digital torque wrench with buzzer alert",
        "Tools & Equipment", ["torque wrench", "wrench", "spanner", "digital wrench", "hand tool", "tools"],
        "pcs", 4.0, "SUP-05", 16.0, 0.0,
    ),
    (
        "MAT-SEAL-KIT", "SKU-MNT-21", "Hydraulic Cylinder Seal Kit",
        "Viton & polyurethane rod/piston seal and O-ring overhaul kit",
        "Tools & Equipment", ["seal kit", "hydraulic seal", "o-ring kit", "gasket kit", "cylinder seal"],
        "kits", 15.0, "SUP-04", 10.0, 0.0,
    ),
    (
        "MAT-HELMET-IND", "SKU-PPE-22", "HDPE Industrial Safety Helmet",
        "Ventilated ratchet-suspension ANSI/EN-397 industrial hard hat",
        "Safety & PPE", ["helmet", "helmets", "safety helmet", "hard hat", "hardhat", "ppe", "safety gear"],
        "pcs", 25.0, "SUP-05", 120.0, 40.0,
    ),
    (
        "MAT-GLOVE-CUT", "SKU-PPE-23", "Cut-Resistant Work Gloves (Level 5)",
        "HPPE nitrile-coated ANSI A5 cut-resistant industrial safety gloves",
        "Safety & PPE", ["gloves", "glove", "safety gloves", "work gloves", "cut resistant gloves", "ppe"],
        "pairs", 40.0, "SUP-05", 190.0, 50.0,
    ),
    (
        "MAT-GOGGLE-SAF", "SKU-PPE-24", "Anti-Fog Chemical Safety Goggles",
        "Polycarbonate indirect-vent splash and impact protective eye goggles",
        "Safety & PPE", ["goggles", "safety goggles", "safety glasses", "eye protection", "ppe"],
        "pcs", 30.0, "SUP-05", 150.0, 0.0,
    ),
]


def ensure_expanded_catalog(db_path: str) -> None:
    """Idempotently ensure all suppliers and expanded industrial materials exist."""
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_connection(db_path) as conn:
        suppliers = [
            ("SUP-01", "Apex Metals Co.", "orders@apexmetals.example", 4, 0.96, now_iso),
            ("SUP-02", "VoltCore Components", "supply@voltcore.example", 6, 0.91, now_iso),
            ("SUP-03", "Precision Fasteners Ltd.", "sales@precisionfast.example", 3, 0.98, now_iso),
            ("SUP-04", "Titan Industrial Drives", "dispatch@titanindustrial.example", 5, 0.94, now_iso),
            ("SUP-05", "SafeGuard Tools & PPE", "orders@safeguardppe.example", 2, 0.99, now_iso),
        ]
        conn.executemany(
            """
            INSERT OR IGNORE INTO suppliers (id, name, email, lead_time_days, reliability_score, created_at)
            VALUES (?, ?, ?, ?, ?, ?);
            """,
            suppliers,
        )

        for mat_id, sku, name, desc, category, aliases, unit, threshold, sup_id, on_hand, incoming in EXPANDED_CATALOG:
            aliases_json = json.dumps(aliases)
            conn.execute(
                """
                INSERT OR IGNORE INTO materials (
                    id, sku, name, description, category, aliases_json, data_origin,
                    unit, reorder_threshold, preferred_supplier_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'SEEDED_DEMO', ?, ?, ?, ?);
                """,
                (mat_id, sku, name, desc, category, aliases_json, unit, threshold, sup_id, now_iso),
            )
            # Keep category and searchable aliases up to date even on pre-existing DB rows
            conn.execute(
                """
                UPDATE materials
                SET category = CASE WHEN category = 'General' OR category = '' THEN ? ELSE category END,
                    aliases_json = CASE WHEN data_origin = 'SEEDED_DEMO' OR aliases_json = '[]' OR aliases_json = '' THEN ? ELSE aliases_json END
                WHERE id = ?;
                """,
                (category, aliases_json, mat_id),
            )
            conn.execute(
                """
                INSERT OR IGNORE INTO inventory_balances (material_id, on_hand, incoming, allocated, updated_at)
                VALUES (?, ?, ?, 0.0, ?);
                """,
                (mat_id, on_hand, incoming, now_iso),
            )


def seed_demo_data(db_path: str) -> None:
    """Seed suppliers, materials, balances, BOMs, and orders idempotently."""
    now = datetime.now(timezone.utc)
    d2 = (now + timedelta(days=2)).date().isoformat()
    d4 = (now + timedelta(days=4)).date().isoformat()
    d7 = (now + timedelta(days=7)).date().isoformat()

    ensure_expanded_catalog(db_path)

    with get_connection(db_path) as conn:
        existing_orders = conn.execute("SELECT COUNT(*) FROM orders;").fetchone()[0]
        if existing_orders > 0:
            return

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
            INSERT OR IGNORE INTO bills_of_materials (product_code, material_id, quantity_per_unit)
            VALUES (?, ?, ?);
            """,
            boms,
        )

        # Creation order intentionally differs from CRD order so that
        # earliest-CRD-first allocation is distinguishable from naive FIFO.
        created_early = (now - timedelta(days=3)).isoformat()
        created_mid = (now - timedelta(days=2)).isoformat()
        created_late = (now - timedelta(days=1)).isoformat()
        orders = [
            ("ORD-1001", "Acme Robotics", "PROD-MOTOR-X1", 10, d2, 1, "OPEN", None, None, None, created_late, created_late),
            ("ORD-1002", "Nova Automation", "PROD-MOTOR-X1", 10, d4, 1, "OPEN", None, None, None, created_mid, created_mid),
            ("ORD-1003", "Titan Heavy Ind.", "PROD-FRAME-S2", 8, d7, 2, "OPEN", None, None, None, created_early, created_early),
        ]
        conn.executemany(
            """
            INSERT OR IGNORE INTO orders (
                id, customer_name, product_code, quantity, customer_request_date,
                processing_days, status, risk_category, projected_ship_date,
                risk_explanation, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            orders,
        )
