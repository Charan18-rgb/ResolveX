"""Regression tests for multi-turn material dispatch clarification & expanded industrial catalog."""

from pathlib import Path
from fastapi.testclient import TestClient
import pytest

from app.config import get_settings
from app.inventory.catalog_search import search_materials
from app.inventory.seed import EXPANDED_CATALOG
from app.main import create_app


def _client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "dispatch_catalog.db"))
    get_settings.cache_clear()
    return TestClient(create_app())


def test_clarification_send_material_screw_jack_preserves_intent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Reproduces: 'Send the material to Ravi.' -> 'screw jack.' must NOT dump general inventory."""
    try:
        with _client(tmp_path, monkeypatch) as client:
            r1 = client.post("/api/analyze", json={"instruction": "Send the material to Ravi."})
            assert r1.status_code == 201
            d1 = r1.json()
            assert d1["status"] == "NEEDS_CLARIFICATION"
            cid = d1["conversation_id"]

            r2 = client.post("/api/clarify", json={"conversation_id": cid, "response": "screw jack."})
            assert r2.status_code == 200
            d2 = r2.json()
            assert d2["conversation_id"] == cid
            assert d2["status"] == "NEEDS_CLARIFICATION"
            assert d2.get("inventory_insight") is None
            joined_q = " ".join(d2["clarification_questions"]).lower()
            assert "screw jack" in joined_q
            assert "ravi" in joined_q

            r3 = client.post(
                "/api/clarify",
                json={
                    "conversation_id": cid,
                    "response": "5 pcs of 5-ton mechanical screw jack for Ravi Kumar in Maintenance Bay 2",
                },
            )
            assert r3.status_code == 200
            d3 = r3.json()
            assert d3["conversation_id"] == cid
            assert d3["status"] == "RESOLVED"
            intent = d3["resolved_intent"]
            assert intent["action"] == "prepare_material_dispatch"
            assert intent["parameters"]["material_id"] == "MAT-SJACK-5T"
            assert intent["parameters"]["quantity"] == "5"
            assert intent["parameters"]["stock_sufficient"] == "true"
            assert "nothing" in intent["direct_answer"].lower() or "no physical shipment" in intent["direct_answer"].lower()
    finally:
        get_settings.cache_clear()


def test_dispatch_insufficient_stock_and_unknown_material_honesty(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Never invent missing inventory items or falsely confirm dispatch above physical stock."""
    try:
        with _client(tmp_path, monkeypatch) as client:
            # Unknown product
            u1 = client.post("/api/analyze", json={"instruction": "Send the material to Ravi."}).json()
            u2 = client.post(
                "/api/clarify",
                json={"conversation_id": u1["conversation_id"], "response": "quantum flux capacitor"},
            ).json()
            assert u2["status"] == "NEEDS_CLARIFICATION"
            assert "no material matching" in " ".join(u2["clarification_questions"]).lower()

            # Over-stock request (5-ton screw jack only has 24 pcs on hand)
            o1 = client.post(
                "/api/analyze",
                json={"instruction": "Dispatch 100 pcs of 5-ton screw jack to Ravi Kumar"},
            ).json()
            assert o1["status"] == "RESOLVED"
            assert o1["resolved_intent"]["parameters"]["stock_sufficient"] == "false"
            assert o1["resolved_intent"]["parameters"]["execution_status"] == "BLOCKED_INSUFFICIENT_STOCK"
    finally:
        get_settings.cache_clear()


def test_expanded_catalog_categories_synonyms_typos_and_warehouse_consistency(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify all 24 materials, categories, synonym/typo search, and consistent balances/bins."""
    try:
        with _client(tmp_path, monkeypatch) as client:
            ov = client.get("/api/inventory/overview").json()
            assert ov["total_materials"] == len(EXPANDED_CATALOG)
            cats = {m["category"] for m in ov["materials"]}
            assert {
                "Lifting & Rigging",
                "Fasteners",
                "Bearings & Gears",
                "Machinery & Drives",
                "Raw Metals",
                "Pipes & Fluid Control",
                "Electrical & Wiring",
                "Tools & Equipment",
                "Safety & PPE",
            }.issubset(cats)

            for m in ov["materials"]:
                assert m["data_origin"] == "SEEDED_DEMO"
                assert m["net_availability"] == pytest.approx(m["on_hand"] + m["incoming"] - m["allocated"])
                assert m["physical_available"] == pytest.approx(max(0.0, m["on_hand"] - m["allocated"]))
                assert len(m["warehouse_locations"]) >= 1

            # Synonyms & spelling typos via API
            assert any(m["id"] == "MAT-SJACK-5T" for m in client.get("/api/inventory/search?q=scru%20jack").json())
            assert client.get("/api/inventory/search?q=alumunium%20rod").json()[0]["id"] == "MAT-ALUM-ROD"
            assert client.get("/api/inventory/search?q=baring").json()[0]["id"] == "MAT-BRG-6205"
            assert client.get("/api/inventory/search?q=ball%20valve").json()[0]["id"] == "MAT-VALVE-BV1"
            assert client.get("/api/inventory/search?q=hard%20hat").json()[0]["id"] == "MAT-HELMET-IND"
            assert client.get("/api/inventory/search?q=nonexistent%20widget").json() == []
    finally:
        get_settings.cache_clear()


def test_direct_stock_edit_to_50_and_zero_blocks_dispatch_and_offers_alternatives(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Operator can set any material stock (e.g. 50 -> 0); zero stock prompts to choose another item."""
    try:
        with _client(tmp_path, monkeypatch) as client:
            # 1. Validation rejects negative stock
            bad = client.patch("/api/inventory/materials/MAT-SJACK-2T/stock", json={"on_hand": -5})
            assert bad.status_code == 422

            # 2. Set 2-Ton Scissors Screw Jack to 50 pieces
            up50 = client.patch(
                "/api/inventory/materials/MAT-SJACK-2T/stock",
                json={"on_hand": 50, "reason": "Cycle count 50 pcs", "actor": "INVENTORY_PLANNER"},
            )
            assert up50.status_code == 200
            d50 = up50.json()
            assert d50["on_hand"] == pytest.approx(50.0)
            assert d50["physical_available"] == pytest.approx(50.0)
            assert d50["stock_status"] == "HEALTHY"
            assert d50["data_origin"] == "LIVE_EVENT"

            locs50 = client.get("/api/warehouse/locations?material_id=MAT-SJACK-2T").json()["locations"]
            assert sum(l["stored_qty"] for l in locs50) == pytest.approx(50.0)

            # 3. Edit it down to 0
            up0 = client.patch(
                "/api/inventory/materials/MAT-SJACK-2T/stock",
                json={"on_hand": 0, "reason": "All units issued", "actor": "INVENTORY_PLANNER"},
            )
            assert up0.status_code == 200
            d0 = up0.json()
            assert d0["on_hand"] == pytest.approx(0.0)
            assert d0["physical_available"] == pytest.approx(0.0)
            assert d0["stock_status"] == "OUT_OF_STOCK"

            locs0 = client.get("/api/warehouse/locations?material_id=MAT-SJACK-2T").json()["locations"]
            assert sum(l["stored_qty"] for l in locs0) == pytest.approx(0.0)
            alerts = client.get("/api/alerts").json()["alerts"]
            assert any(a["entity_id"] == "MAT-SJACK-2T" and a["alert_type"] == "STOCK_OUT" for a in alerts)

            # 4. Conversational stock query reflects 0 / finished
            q0 = client.post("/api/ops/query", json={"question": "Check 2-ton screw jack stock"}).json()
            assert q0["card_type"] == "material_detail"
            assert "0 pcs" in q0["summary"]
            assert "finished" in q0["summary"].lower()

            # 5. Asking to send Ravi 2-ton screw jack immediately reports finished/zero & asks to choose another item
            s1 = client.post("/api/analyze", json={"instruction": "Send Ravi 2-ton screw jack"}).json()
            assert s1["status"] == "NEEDS_CLARIFICATION"
            q_text = s1["clarification_questions"][0].lower()
            assert "finished" in q_text
            assert "0" in q_text
            assert "no stock" in q_text
            assert "choose another item" in q_text
            alt_ids = {c["id"] for c in s1["candidate_options"]}
            assert "MAT-SJACK-5T" in alt_ids

            # 6. Choosing the in-stock 5-Ton variant continues the Ravi dispatch cleanly
            conv_id = s1["conversation_id"]
            s2 = client.post(
                "/api/clarify",
                json={"conversation_id": conv_id, "response": "5-Ton Mechanical Screw Jack"},
            ).json()
            assert s2["status"] == "NEEDS_CLARIFICATION"
            assert any("Person Ravi" in c["label"] for c in s2["candidate_options"])

            s3 = client.post("/api/clarify", json={"conversation_id": conv_id, "response": "Person Ravi"}).json()
            assert "Ravi Shetty" in s3["clarification_questions"][0]
            s4 = client.post("/api/clarify", json={"conversation_id": conv_id, "response": "Yes"}).json()
            assert "quantity" in s4["clarification_questions"][0].lower()
            s5 = client.post("/api/clarify", json={"conversation_id": conv_id, "response": "4"}).json()
            assert "where" in s5["clarification_questions"][0].lower()
            s6 = client.post("/api/clarify", json={"conversation_id": conv_id, "response": "Mangalore"}).json()
            assert s6["status"] == "RESOLVED"
            assert s6["resolved_intent"]["parameters"]["sku"] == "SKU-LFT-05"
            assert "Ravi Shetty" in s6["resolved_intent"]["parameters"]["recipient"]
    finally:
        get_settings.cache_clear()


def test_partial_variant_zero_stock_and_all_materials_zero_stock_handling(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Generic zero-stock and single-remaining-variant announcements work for screw jacks AND all other materials."""
    try:
        with _client(tmp_path, monkeypatch) as client:
            # 1. Partial variant zero-stock: 2-Ton screw jack = 0, 5-Ton = 24
            assert client.patch("/api/inventory/materials/MAT-SJACK-2T/stock", json={"on_hand": 0}).status_code == 200
            r = client.post(
                "/api/analyze",
                json={"instruction": "I'm sending screw jack to Ravi personal from UTP"},
            ).json()
            assert r["status"] == "NEEDS_CLARIFICATION"
            rq = r["clarification_questions"][0].lower()
            assert "2-ton scissors screw jack" in rq
            assert "0" in rq
            assert "only 5-ton mechanical screw jack" in rq
            assert any(c["id"] == "MAT-SJACK-5T" for c in r["candidate_options"])

            # Accepting single available option progresses cleanly to Ravi Shetty confirmation
            r_yes = client.post(
                "/api/clarify",
                json={"conversation_id": r["conversation_id"], "response": "Yes"},
            ).json()
            assert r_yes["status"] == "NEEDS_CLARIFICATION"
            assert "Ravi Shetty" in r_yes["clarification_questions"][0]

            # 2. All variants zero-stock (both screw jacks set to 0)
            assert client.patch("/api/inventory/materials/MAT-SJACK-5T/stock", json={"on_hand": 0}).status_code == 200
            r_all0 = client.post(
                "/api/analyze",
                json={"instruction": "Send screw jack to Ravi Shetty"},
            ).json()
            assert r_all0["status"] == "NEEDS_CLARIFICATION"
            assert "0" in r_all0["clarification_questions"][0]
            assert "choose another item" in r_all0["clarification_questions"][0].lower()
            assert all(c["id"] not in {"MAT-SJACK-2T", "MAT-SJACK-5T"} for c in r_all0["candidate_options"])

            # 3. Same partial-variant logic works for OTHER multi-variant products (e.g. Valves)
            assert client.patch("/api/inventory/materials/MAT-VALVE-BV1/stock", json={"on_hand": 0}).status_code == 200
            rv = client.post(
                "/api/analyze",
                json={"instruction": "Send valve to Ravi Shetty"},
            ).json()
            assert rv["status"] == "NEEDS_CLARIFICATION"
            rvq = rv["clarification_questions"][0].lower()
            assert "brass industrial ball valve" in rvq
            assert "only swing check valve" in rvq

            # 4. Works across all single materials across categories (chips, copper wire, bearings, helmets, nuts)
            for mat_id, phrase in (
                ("MAT-CHIP", "Send chip to Ravi Shetty"),
                ("MAT-COPPER", "Send copper wire to Ravi Shetty"),
                ("MAT-BRG-6205", "Send ball bearing to Ravi Shetty"),
                ("MAT-HELMET-IND", "Send safety helmet to Ravi Shetty"),
                ("MAT-NUT-M8", "Send M8 nut to Ravi Shetty"),
            ):
                assert client.patch(f"/api/inventory/materials/{mat_id}/stock", json={"on_hand": 0}).status_code == 200
                rm = client.post("/api/analyze", json={"instruction": phrase}).json()
                assert rm["status"] == "NEEDS_CLARIFICATION"
                rmq = rm["clarification_questions"][0].lower()
                assert "finished" in rmq
                assert "0" in rmq
                assert "choose another item" in rmq
                assert len(rm["candidate_options"]) >= 1

            # 5. Lowercase "send this stock to ravi" + replying in-stock item -> never dumps inventory report or offline message
            st1 = client.post("/api/analyze", json={"instruction": "send this stock to ravi"}).json()
            assert st1["status"] == "NEEDS_CLARIFICATION"
            assert "material" in st1["clarification_questions"][0].lower()
            st2_alloc = client.post(
                "/api/clarify",
                json={"conversation_id": st1["conversation_id"], "response": "Cold-Rolled Steel Sheet"},
            ).json()
            assert st2_alloc["status"] == "NEEDS_CLARIFICATION"
            assert "allocated to open orders" in st2_alloc["clarification_questions"][0].lower()
            st2 = client.post(
                "/api/clarify",
                json={"conversation_id": st1["conversation_id"], "response": "6061-T6 Aluminium Round Rod"},
            ).json()
            assert st2["status"] == "NEEDS_CLARIFICATION"
            assert any("Person Ravi" in c["label"] for c in st2["candidate_options"])

            # 6. Bare product lookup in chat returns material_detail card cleanly
            bare_q = client.post("/api/ops/query", json={"question": "Cold-Rolled Steel Sheet"}).json()
            assert bare_q["card_type"] == "material_detail"
            assert bare_q["data"]["sku"] == "SKU-STL-01"
            assert bare_q["data"]["on_hand"] == pytest.approx(120.0)
    finally:
        get_settings.cache_clear()
