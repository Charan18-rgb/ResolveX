"""Regression tests for /api/ops/query intent routing — especially communication
requests that must never fall through to inventory cards."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def _client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "ops_query.db"))
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    return TestClient(create_app())


def _query(client: TestClient, question: str, context: dict | None = None) -> dict:
    resp = client.post("/api/ops/query", json={"question": question, "context": context})
    assert resp.status_code == 200, resp.text
    return resp.json()


COMMS_CASES = [
    "Message Ravi that tomorrow is the last date for payment for stock.",
    "Remind Ravi to pay for the stock.",
    "Send a payment reminder to Ravi.",
]


@pytest.mark.parametrize("question", COMMS_CASES)
def test_communication_requests_return_message_draft(tmp_path, monkeypatch, question):
    with _client(tmp_path, monkeypatch) as client:
        card = _query(client, question)
    assert card["card_type"] == "message_draft"
    assert card["data"]["delivery_status"] == "DRAFT_ONLY"
    assert "NOT been sent" in card["summary"] or "NOT sent" in card["summary"]


def test_communication_never_routes_to_inventory(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        for q in COMMS_CASES:
            assert _query(client, q)["card_type"] != "inventory_summary"


def test_payment_deadline_message_extracts_recipient_and_body(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        card = _query(client, "Message Ravi that tomorrow is the last date for payment for stock.")
    data = card["data"]
    assert data["recipient"] == "Ravi"
    assert "last date" in data["raw_body"].lower() or "payment" in data["raw_body"].lower()
    # Single first name → recipient must be flagged unconfirmed
    assert data["recipient_confirmed"] is False
    assert "confirm" in card["summary"].lower()


def test_inventory_questions_still_route_correctly(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        assert _query(client, "Which products are low in stock?")["card_type"] == "shortages"
        assert _query(client, "Where is MAT-CHIP stored?")["card_type"] == "material_location"
        assert _query(client, "How much stock do I have?")["card_type"] == "inventory_summary"


def test_followup_make_more_polite_edits_draft(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        first = _query(client, "Message Ravi Sharma that payment is due tomorrow.")
        assert first["card_type"] == "message_draft"
        ctx = {"last_message_draft": first["data"]}
        second = _query(client, "Make that message more polite.", context=ctx)
    assert second["card_type"] == "message_draft"
    assert second["data"]["tone"] == "polite"
    assert "Dear Ravi Sharma" in second["data"]["body"]
    assert second["data"]["delivery_status"] == "DRAFT_ONLY"


def test_followup_send_still_draft_only(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        first = _query(client, "Remind Ravi to pay for the stock.")
        second = _query(client, "Send it tomorrow.", context={"last_message_draft": first["data"]})
    assert second["card_type"] == "message_draft"
    assert second["data"]["delivery_status"] == "DRAFT_ONLY"
    assert "NOT been sent" in second["data"]["delivery_note"]


def test_classmate_recipient_extracted(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        card = _query(client, "email my classmate Charan that i am not attending tomorrow's class")
    assert card["card_type"] == "message_draft"
    data = card["data"]
    assert data.get("recipient") == "Charan" or "Charan" in str(data.get("recipient", ""))
    assert data["delivery_status"] == "DRAFT_ONLY"


def test_possessive_relationship_requires_clarification(tmp_path, monkeypatch):
    """'Email Charan's classmate...' — recipient is the unnamed classmate, not Charan."""
    with _client(tmp_path, monkeypatch) as client:
        card = _query(client, "Email Charan's classmate that I will be absent tomorrow.")
    assert card["card_type"] == "message_draft"
    # either clarification requested or recipient is not plain "Charan"
    assert card["data"].get("requires_clarification") or card["data"].get("recipient") != "Charan"


def test_pronoun_followup_updates_same_draft(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        first = _query(client, "Email Charan Kumar that I will not attend college tomorrow.")
        ctx = {"last_message_draft": first["data"]}
        second = _query(client, "Tell him I will share the notes later.", context=ctx)
    assert second["card_type"] == "message_draft"
    assert second["data"]["recipient"] == "Charan Kumar"
    assert "notes" in second["data"].get("raw_body", second["data"].get("body", "")).lower()


def test_shipping_request_not_hijacked_by_comms(tmp_path, monkeypatch):
    """'Send the material to Ravi.' has no messaging keywords → falls through to
    the language pipeline (help card), preserving PS6 ambiguity handling."""
    with _client(tmp_path, monkeypatch) as client:
        card = _query(client, "Send the material to Ravi.")
    assert card["card_type"] == "help"
