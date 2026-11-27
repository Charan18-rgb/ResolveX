"""Unit and API tests for Milestone 4: Procurement proposals and HITL approval gate."""

from pathlib import Path
from fastapi.testclient import TestClient
import pytest

from app.database.connection import get_connection, init_db
from app.inventory.allocation_engine import recalculate_allocations
from app.inventory.order_risk_engine import evaluate_order_risks
from app.inventory.purchase_order_engine import generate_proposals_from_shortages, list_proposals
from app.inventory.seed import seed_demo_data
from app.inventory.shortage_detector import sync_inventory_alerts
from app.services.approval_service import decide_proposal
from app.main import create_app


def setup_db(db_path: str) -> None:
    init_db(db_path)
    seed_demo_data(db_path)
    recalculate_allocations(db_path)
    evaluate_order_risks(db_path)
    sync_inventory_alerts(db_path)


def test_proposal_generation_from_shortage(tmp_path: Path) -> None:
    """Proposals are auto-generated for each shortage, idempotently."""
    db_path = str(tmp_path / "m4_proposals.db")
    setup_db(db_path)
    proposals = generate_proposals_from_shortages(db_path)
    assert len(proposals) >= 1
    # Idempotency: re-running must not create duplicate proposals
    proposals2 = generate_proposals_from_shortages(db_path)
    assert len(proposals2) == 0


def test_hitl_approval_gate_role_enforcement(tmp_path: Path) -> None:
    """Only PROCUREMENT_MANAGER or ADMIN can approve; planner is rejected."""
    db_path = str(tmp_path / "m4_hitl.db")
    setup_db(db_path)
    generate_proposals_from_shortages(db_path)
    proposals = list_proposals(db_path, status_filter="PENDING_APPROVAL")
    assert len(proposals) >= 1
    pid = proposals[0].id

    # Unauthorized role must raise PermissionError at business-logic level
    with pytest.raises(PermissionError):
        decide_proposal(db_path, pid, "APPROVED", actor="Alice", actor_role="INVENTORY_PLANNER")

    # PROCUREMENT_MANAGER must succeed
    result = decide_proposal(
        db_path, pid, "APPROVED", actor="Charlie", actor_role="PROCUREMENT_MANAGER"
    )
    assert result["decision"] == "APPROVED"
    assert result["decided_by"] == "Charlie"

    # Cannot approve twice
    with pytest.raises(ValueError, match="already in status"):
        decide_proposal(
            db_path, pid, "APPROVED", actor="Charlie", actor_role="PROCUREMENT_MANAGER"
        )

    # Verify audit log
    with get_connection(db_path) as conn:
        log = conn.execute(
            "SELECT * FROM system_audit_logs WHERE entity_id = ?;", (pid,)
        ).fetchone()
    assert log is not None
    assert log["actor_role"] == "PROCUREMENT_MANAGER"


def test_procurement_api_endpoints(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify procurement and alerts REST API endpoints."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "m4_api.db"))
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            # Generate proposals via POST
            gen = client.post("/api/purchase-orders/proposals")
            assert gen.status_code == 200
            proposals_created = gen.json()
            assert len(proposals_created) >= 1
            pid = proposals_created[0]["id"]

            # List proposals
            lst = client.get("/api/purchase-orders/proposals")
            assert lst.status_code == 200

            # Non-manager role must get 403
            reject_unauth = client.post(
                f"/api/purchase-orders/proposals/{pid}/approve",
                json={},
                headers={"x-user-role": "INVENTORY_PLANNER", "x-user-name": "Bob"},
            )
            assert reject_unauth.status_code == 403

            # Manager approves
            approve = client.post(
                f"/api/purchase-orders/proposals/{pid}/approve",
                json={"comment": "Approved for hackathon demo."},
                headers={"x-user-role": "PROCUREMENT_MANAGER", "x-user-name": "Charlie"},
            )
            assert approve.status_code == 200
            assert approve.json()["decision"] == "APPROVED"

            # Alerts
            alerts = client.get("/api/alerts")
            assert alerts.status_code == 200

            # Briefing
            briefing = client.get("/api/briefings?role=INVENTORY_PLANNER")
            assert briefing.status_code == 200
            assert briefing.json()["data_source"] == "deterministic_database"
    finally:
        get_settings.cache_clear()
