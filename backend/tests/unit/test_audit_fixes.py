"""Tests verifying security, error envelope, context, and task-router audit fixes."""

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import pytest

from app.core.context_analyzer import build_context_summary
from app.database.connection import init_db
from app.inventory.allocation_engine import recalculate_allocations
from app.inventory.order_risk_engine import evaluate_order_risks
from app.inventory.seed import seed_demo_data
from app.main import create_app
from app.models.ai_schemas import GeminiAnalysisOutput, ResolvedIntentOutput
from app.services.conversation_service import start_conversation


def test_approval_requires_explicit_authorized_role(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Omitting X-User-Role on approve/reject must return 403 in ErrorResponse envelope."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "audit_auth.db"))
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            gen = client.post("/api/purchase-orders/proposals")
            assert gen.status_code == 200
            pid = gen.json()[0]["id"]

            # Missing X-User-Role header must NOT default to ADMIN
            resp = client.post(f"/api/purchase-orders/proposals/{pid}/approve", json={})
            assert resp.status_code == 403
            body = resp.json()
            assert "error" in body
            assert body["error"]["code"] == "FORBIDDEN"

            resp_rej = client.post(f"/api/purchase-orders/proposals/{pid}/reject", json={})
            assert resp_rej.status_code == 403
            assert resp_rej.json()["error"]["code"] == "FORBIDDEN"
    finally:
        get_settings.cache_clear()


def test_http_errors_use_unified_error_envelope(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """404/409/422 errors must use unified ErrorResponse envelope."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "audit_err.db"))
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            r404 = client.get("/api/inventory/materials/DOES-NOT-EXIST")
            assert r404.status_code == 404
            assert r404.json()["error"]["code"] == "NOT_FOUND"

            r422 = client.post("/api/analyze", json={"instruction": "   "})
            assert r422.status_code == 422
            assert r422.json()["error"]["code"] == "VALIDATION_ERROR"
    finally:
        get_settings.cache_clear()


def test_initial_context_included_in_context_summary(tmp_path: Path) -> None:
    """build_context_summary must include initial_context when provided."""
    db_path = str(tmp_path / "audit_ctx.db")
    init_db(db_path)

    mock_clear = GeminiAnalysisOutput(
        classification="clear",
        ambiguity_types=[],
        needs_clarification=False,
        reasoning="Resolved using initial context.",
        interpretations=[],
        missing_required_info=[],
        clarification_questions=[],
        resolved_intent=ResolvedIntentOutput(
            action="send_report",
            parameters={"recipient": "Rahul Sharma"},
            resolved_instruction="Send Q3 report to Rahul Sharma.",
        ),
    )

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(mock_clear, None),
    ):
        resp = start_conversation(
            db_path,
            "Send the report to Rahul.",
            context="Discussing Q3 report with Rahul Sharma.",
        )

    summary, _, _ = build_context_summary(db_path, resp.conversation_id)
    assert "Initial Context: Discussing Q3 report with Rahul Sharma." in summary


def test_resolved_inventory_intent_routes_to_ps2(tmp_path: Path) -> None:
    """Resolved inventory intent must attach deterministic PS2 inventory_insight."""
    db_path = str(tmp_path / "audit_router.db")
    init_db(db_path)
    seed_demo_data(db_path)
    recalculate_allocations(db_path)
    evaluate_order_risks(db_path)

    mock_inv = GeminiAnalysisOutput(
        classification="clear",
        ambiguity_types=[],
        needs_clarification=False,
        reasoning="Clear inventory check request.",
        interpretations=[],
        missing_required_info=[],
        clarification_questions=[],
        resolved_intent=ResolvedIntentOutput(
            action="check_inventory",
            parameters={"material": "MAT-CHIP"},
            resolved_instruction="Check current inventory and shortages for MAT-CHIP.",
        ),
    )

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(mock_inv, None),
    ):
        resp = start_conversation(db_path, "Check stock and shortages for MAT-CHIP.")

    assert resp.status == "RESOLVED"
    assert resp.inventory_insight is not None
    assert resp.inventory_insight["domain"] == "inventory"
    assert resp.inventory_insight["inventory_overview"]["total_materials"] == 4


def test_briefing_respects_x_user_role_header(tmp_path: Path, monkeypatch) -> None:
    """GET /api/briefings without ?role= must honor X-User-Role header."""
    from fastapi.testclient import TestClient
    from app.config import get_settings
    from app.main import app

    db_path = str(tmp_path / "briefing_role.db")
    init_db(db_path)
    seed_demo_data(db_path)
    monkeypatch.setenv("DATABASE_PATH", db_path)
    get_settings.cache_clear()
    try:
        client = TestClient(app)
        with patch("app.services.gemini_service.call_gemini_text", return_value=(None, "offline")):
            resp = client.get("/api/briefings", headers={"X-User-Role": "PROCUREMENT_MANAGER"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "PROCUREMENT_MANAGER"
    finally:
        get_settings.cache_clear()


def test_acknowledge_missing_alert_returns_404(tmp_path: Path, monkeypatch) -> None:
    """POST /api/alerts/{id}/acknowledge must return 404 when alert ID does not exist."""
    from fastapi.testclient import TestClient
    from app.config import get_settings
    from app.main import app

    db_path = str(tmp_path / "alerts_404.db")
    init_db(db_path)
    monkeypatch.setenv("DATABASE_PATH", db_path)
    get_settings.cache_clear()
    try:
        client = TestClient(app)
        resp = client.post("/api/alerts/999999/acknowledge")
        assert resp.status_code == 404
    finally:
        get_settings.cache_clear()
