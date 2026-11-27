"""Unit tests for Milestone 2: PS2 migrations, seed data, and event processor."""

from pathlib import Path
from app.database.connection import get_connection, init_db
from app.inventory.event_processor import process_raw_event
from app.inventory.seed import seed_demo_data


def test_ps2_migrations_and_seed_idempotency(tmp_path: Path) -> None:
    """Verify PS2 tables are created and seed_demo_data is idempotent."""
    db_path = str(tmp_path / "ps2_seed.db")
    init_db(db_path)
    seed_demo_data(db_path)
    seed_demo_data(db_path)  # Must not duplicate

    with get_connection(db_path) as conn:
        mat_count = conn.execute("SELECT COUNT(*) FROM materials;").fetchone()[0]
        ord_count = conn.execute("SELECT COUNT(*) FROM orders;").fetchone()[0]
    assert mat_count == 4
    assert ord_count == 3


def test_event_idempotency_and_malformed_quarantine(tmp_path: Path) -> None:
    """Verify duplicate events are ignored and malformed events trigger FEED_FAILURE alert."""
    db_path = str(tmp_path / "ps2_events.db")
    init_db(db_path)
    seed_demo_data(db_path)

    evt = {
        "event_id": "EVT-100",
        "event_type": "STOCK_RECEIVED",
        "entity_ref": "MAT-CHIP",
        "payload": {"quantity": 25},
        "simulated": True,
    }
    res1 = process_raw_event(db_path, evt)
    assert res1.status == "PROCESSED"

    # Replay same event_id -> must be DUPLICATE and not add +25 again
    res2 = process_raw_event(db_path, evt)
    assert res2.status == "DUPLICATE"

    with get_connection(db_path) as conn:
        on_hand = conn.execute(
            "SELECT on_hand FROM inventory_balances WHERE material_id = 'MAT-CHIP';"
        ).fetchone()[0]
    assert on_hand == 40.0  # 15 initial + 25 once

    # Malformed event -> quarantined + FEED_FAILURE alert
    bad_evt = {
        "event_id": "EVT-BAD-1",
        "event_type": "STOCK_RECEIVED",
        "entity_ref": "MAT-CHIP",
        "payload": {"quantity": -10},
    }
    res_bad = process_raw_event(db_path, bad_evt)
    assert res_bad.status == "MALFORMED"

    with get_connection(db_path) as conn:
        alerts = conn.execute(
            "SELECT alert_type, entity_id FROM inventory_alerts WHERE alert_type = 'FEED_FAILURE';"
        ).fetchall()
    assert len(alerts) == 1
    assert alerts[0]["entity_id"] == "EVT-BAD-1"
