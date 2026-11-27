"""Idempotent SQLite schema migrations for PS2 Inventory Intelligence entities."""

from app.database.connection import get_connection

PS2_MIGRATIONS_SQL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    lead_time_days INTEGER NOT NULL DEFAULT 5,
    reliability_score REAL NOT NULL DEFAULT 0.95,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL,
    reorder_threshold REAL NOT NULL DEFAULT 0.0,
    preferred_supplier_id TEXT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (preferred_supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS inventory_balances (
    material_id TEXT PRIMARY KEY,
    on_hand REAL NOT NULL DEFAULT 0.0,
    incoming REAL NOT NULL DEFAULT 0.0,
    allocated REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    entity_ref TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT NULL,
    simulated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    product_code TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    customer_request_date TEXT NOT NULL,
    processing_days INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'OPEN',
    risk_category TEXT NULL,
    projected_ship_date TEXT NULL,
    risk_explanation TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bills_of_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_code TEXT NOT NULL,
    material_id TEXT NOT NULL,
    quantity_per_unit REAL NOT NULL,
    UNIQUE(product_code, material_id),
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS material_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    material_id TEXT NOT NULL,
    required_qty REAL NOT NULL,
    allocated_qty REAL NOT NULL,
    priority_reason TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(order_id, material_id),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS purchase_order_proposals (
    id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL,
    material_name TEXT NOT NULL,
    suggested_quantity REAL NOT NULL,
    supplier_id TEXT NULL,
    supplier_name TEXT NULL,
    reason TEXT NOT NULL,
    affected_orders_json TEXT NOT NULL,
    expected_shortage_date TEXT NULL,
    estimated_impact TEXT NOT NULL,
    supporting_data_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    supplier_email_draft TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS approval_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    decided_by TEXT NOT NULL,
    decided_role TEXT NOT NULL,
    comment TEXT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (proposal_id) REFERENCES purchase_order_proposals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    message TEXT NOT NULL,
    acknowledged INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON inventory_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_crd ON orders(customer_request_date ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_alerts_type_ack ON inventory_alerts(alert_type, acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON purchase_order_proposals(status, created_at DESC);
"""

OPS_MIGRATIONS_SQL = """
CREATE TABLE IF NOT EXISTS warehouses (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_locations (
    id TEXT PRIMARY KEY,
    warehouse_id TEXT NOT NULL,
    zone_code TEXT NOT NULL,
    rack_code TEXT NOT NULL,
    shelf_code TEXT NOT NULL,
    position_index INTEGER NOT NULL DEFAULT 0,
    capacity_units REAL NOT NULL DEFAULT 0.0,
    material_id TEXT NULL,
    stored_qty REAL NOT NULL DEFAULT 0.0,
    incoming_qty REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    created_at TEXT NOT NULL,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS supplier_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id TEXT NOT NULL,
    delivery_ref TEXT NOT NULL UNIQUE,
    material_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    expected_date TEXT NOT NULL,
    actual_date TEXT NULL,
    status TEXT NOT NULL,
    delay_days REAL NOT NULL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_locations_zone ON storage_locations(warehouse_id, zone_code, rack_code, shelf_code);
CREATE INDEX IF NOT EXISTS idx_locations_material ON storage_locations(material_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_supplier ON supplier_deliveries(supplier_id, expected_date DESC);
"""

DRAFT_MIGRATIONS_SQL = """
CREATE TABLE IF NOT EXISTS message_drafts (
    conversation_id TEXT PRIMARY KEY,
    draft_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_drafts_updated ON message_drafts(updated_at DESC);
"""


def run_migrations(db_path: str) -> None:
    """Apply PS2 schema migrations idempotently without dropping existing data."""
    with get_connection(db_path) as conn:
        conn.executescript(PS2_MIGRATIONS_SQL)
        conn.execute(
            """
            INSERT OR IGNORE INTO schema_migrations (version, description, applied_at)
            VALUES (1, 'Initial PS2 inventory, orders, procurement, alerts, and audit tables', datetime('now'));
            """
        )
        conn.executescript(OPS_MIGRATIONS_SQL)
        conn.execute(
            """
            INSERT OR IGNORE INTO schema_migrations (version, description, applied_at)
            VALUES (2, 'Warehouse storage locations and supplier delivery history', datetime('now'));
            """
        )
        conn.executescript(DRAFT_MIGRATIONS_SQL)
        conn.execute(
            """
            INSERT OR IGNORE INTO schema_migrations (version, description, applied_at)
            VALUES (3, 'Per-conversation message draft persistence', datetime('now'));
            """
        )
        # v4: structured card payloads on assistant messages (ops result cards).
        msg_cols = {row[1] for row in conn.execute("PRAGMA table_info(messages)")}
        if "card_json" not in msg_cols:
            conn.execute("ALTER TABLE messages ADD COLUMN card_json TEXT NULL;")
        conn.execute(
            """
            INSERT OR IGNORE INTO schema_migrations (version, description, applied_at)
            VALUES (4, 'Structured card payloads on messages', datetime('now'));
            """
        )
