"""Unit and API tests for Milestone 3: Deterministic Inventory, Allocation, and CRD Risk."""

from pathlib import Path
from fastapi.testclient import TestClient
import pytest

from app.database.connection import get_connection, init_db
from app.inventory.allocation_engine import recalculate_allocations
from app.inventory.availability_calculator import compute_net_availability, get_inventory_overview
from app.inventory.order_risk_engine import evaluate_order_risks
from app.inventory.seed import seed_demo_data
from app.inventory.shortage_detector import detect_shortages, sync_inventory_alerts
from app.main import create_app


def test_net_availability_formula() -> None:
    """Verify Net Availability = On-hand + Incoming - Allocated."""
    assert compute_net_availability(120.0, 80.0, 100.0) == 100.0
    assert compute_net_availability(15.0, 0.0, 15.0) == 0.0


def test_earliest_crd_allocation_and_risk_detection(tmp_path: Path) -> None:
    """Verify Earliest-CRD-First allocates ORD-1001 before ORD-1002 and flags shortages."""
    db_path = str(tmp_path / "m3_engine.db")
    init_db(db_path)
    seed_demo_data(db_path)

    allocs = recalculate_allocations(db_path)
    assert len(allocs) > 0

    # MAT-CHIP has 15 on_hand; ORD-1001 needs 10 (CRD +2d), ORD-1002 needs 10 (CRD +4d).
    # Earliest CRD ORD-1001 must get 10, leaving 5 partial for ORD-1002.
    chip_allocs = {a.order_id: a.allocated_qty for a in allocs if a.material_id == "MAT-CHIP"}
    assert chip_allocs["ORD-1001"] == 10.0
    assert chip_allocs["ORD-1002"] == 5.0

    risks = evaluate_order_risks(db_path)
    risk_by_id = {r.order_id: r for r in risks}
    assert risk_by_id["ORD-1001"].risk_category == "ON_TRACK"
    assert risk_by_id["ORD-1002"].risk_category in {"AT_RISK", "BLOCKED"}
    assert len(risk_by_id["ORD-1002"].missing_materials) >= 1

    shortages = detect_shortages(db_path)
    short_ids = {s["material_id"] for s in shortages}
    assert "MAT-CHIP" in short_ids

    sync_inventory_alerts(db_path)
    overview = get_inventory_overview(db_path)
    assert overview.total_materials == 4


def test_missing_lead_time_returns_unavailable_ship_date(tmp_path: Path) -> None:
    """Verify projected_ship_date is UNAVAILABLE when supplier lead time is missing."""
    db_path = str(tmp_path / "m3_no_lead.db")
    init_db(db_path)
    seed_demo_data(db_path)

    with get_connection(db_path) as conn:
        conn.execute("UPDATE materials SET preferred_supplier_id = NULL WHERE id = 'MAT-CHIP';")

    recalculate_allocations(db_path)
    risks = {r.order_id: r for r in evaluate_order_risks(db_path)}
    assert risks["ORD-1002"].ship_date_status == "UNAVAILABLE"
    assert risks["ORD-1002"].projected_ship_date is None
    assert risks["ORD-1002"].risk_category == "BLOCKED"


def test_inventory_api_endpoints(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify Milestone 3 REST API endpoints end-to-end."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "m3_api.db"))
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            ov = client.get("/api/inventory/overview")
            assert ov.status_code == 200
            assert ov.json()["total_materials"] == 4

            risks = client.get("/api/orders/risks")
            assert risks.status_code == 200
            assert len(risks.json()) == 3

            shortages = client.get("/api/inventory/shortages")
            assert shortages.status_code == 200
            assert shortages.json()["count"] >= 1

            evt = client.post(
                "/api/inventory/events",
                json={
                    "event_id": "API-EVT-1",
                    "event_type": "STOCK_RECEIVED",
                    "entity_ref": "MAT-CHIP",
                    "payload": {"quantity": 50},
                    "simulated": True,
                },
            )
            assert evt.status_code == 200
            assert evt.json()["status"] == "PROCESSED"
    finally:
        get_settings.cache_clear()
