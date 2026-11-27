"""
Unit and API tests for Feature 9: Risk-Aware Intent Resolution.
Verifies risk classification (Low, Medium, High), detection of high-impact ambiguity
(payments, deletion, permissions, sensitive recipients), explicit confirmation requirements,
and turn-by-turn risk recalculation.
"""

from app.core.risk_engine import evaluate_intent_risk
from app.database.connection import init_db
from app.main import create_app
from app.services.conversation_service import continue_conversation, start_conversation
from fastapi.testclient import TestClient
import pytest


def test_classify_low_risk_informational_query() -> None:
    assessment = evaluate_intent_risk(
        action="search_documentation",
        target="API reference guide",
        raw_text="Show me the API documentation for authentication.",
        unresolved_questions_count=0,
    )
    assert assessment.risk_level == "Low"
    assert assessment.requires_explicit_confirmation is False
    assert assessment.safe_to_resolve is True
    assert assessment.reversibility == "reversible"
    assert assessment.high_impact_ambiguities == []


def test_detect_high_impact_deletion_and_broad_scope() -> None:
    assessment = evaluate_intent_risk(
        action="delete_resources",
        target="all production tables and database clusters",
        raw_text="Delete all unused tables in prod database.",
        unresolved_questions_count=1,
    )
    assert assessment.risk_level == "High"
    assert assessment.requires_explicit_confirmation is True
    assert assessment.safe_to_resolve is False
    assert assessment.reversibility == "irreversible"
    assert any("deletion" in amb.lower() for amb in assessment.high_impact_ambiguities)
    assert "Explicit confirmation is required" in (assessment.confirmation_reason or "")


def test_detect_financial_payment_and_recalculate_after_clarification() -> None:
    # Turn 1: Ambiguous financial payment without specific recipient or amount
    turn1_assessment = evaluate_intent_risk(
        action="transfer_funds",
        target="bonus payout",
        raw_text="Wire some money for the vendor invoice.",
        unresolved_questions_count=2,
    )
    assert turn1_assessment.risk_level == "High"
    assert turn1_assessment.requires_explicit_confirmation is True
    assert turn1_assessment.safe_to_resolve is False
    assert any("financial" in amb.lower() for amb in turn1_assessment.high_impact_ambiguities)

    # Turn 2: Clarification provides exact invoice and amount, narrowing ambiguity
    turn2_assessment = evaluate_intent_risk(
        action="transfer_funds",
        target="Vendor Invoice INV-9901 for $4,500 USD",
        raw_text="Wire some money for the vendor invoice. Clarification: Pay $4,500 to Acme Corp for INV-9901.",
        clarification_responses=["Pay $4,500 to Acme Corp for INV-9901"],
        unresolved_questions_count=0,
        user_confirmed=True,
    )
    assert turn2_assessment.requires_explicit_confirmation is True
    assert turn2_assessment.safe_to_resolve is True  # user_confirmed=True satisfies requirement


def test_detect_permission_elevation_and_sensitive_recipients() -> None:
    assessment = evaluate_intent_risk(
        action="grant_access",
        target="all employees and public investors",
        raw_text="Grant admin privileges and email the credentials to all employees.",
        unresolved_questions_count=1,
    )
    assert assessment.risk_level == "High"
    assert assessment.requires_explicit_confirmation is True
    dimensions = {factor.dimension for factor in assessment.risk_factors}
    assert "permission_access" in dimensions
    assert "sensitive_recipient" in dimensions


def test_analyze_and_clarify_api_returns_risk_assessment(tmp_path: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch) -> None:
    db_file = tmp_path / "test_risk_flow.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_file))
    init_db(str(db_file))
    from app.config import get_settings
    get_settings.cache_clear()
    try:
        app = create_app()
        client = TestClient(app)

        # 1. High risk prompt via POST /api/analyze (returns 201 Created)
        resp = client.post(
            "/api/analyze",
            json={"instruction": "Purge all customer data and transfer remaining funds to external wallet."},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["risk_assessment"] is not None
        assert data["risk_assessment"]["risk_level"] == "High"
        assert data["risk_assessment"]["requires_explicit_confirmation"] is True
        assert data["risk_assessment"]["safe_to_resolve"] is False
        conv_id = data["conversation_id"]

        # 2. Check that GET /api/conversations includes risk_assessment
        get_resp = client.get(f"/api/conversations?conversation_id={conv_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["risk_assessment"] is not None
        assert get_resp.json()["risk_assessment"]["risk_level"] == "High"
    finally:
        get_settings.cache_clear()
