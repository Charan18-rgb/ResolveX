"""Comprehensive regression tests for identity memory, relationship resolution,
pronouns, normalized clarification questions, slot persistence, and offline fallbacks.
"""

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import pytest

from app.config import get_settings
from app.core.clarification_engine import sanitize_clarification_question
from app.core.identity_memory import search_people
from app.main import create_app
from app.models.ai_schemas import GeminiAnalysisOutput


def _client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "identity_test.db"))
    get_settings.cache_clear()
    return TestClient(create_app())


def test_distinct_ravi_identities_and_city_disambiguation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ravi, Ravi Shetty, Ravi K, Business Ravi, Mangalore vs Bangalore remain distinct."""
    try:
        with _client(tmp_path, monkeypatch) as client:
            db = str(tmp_path / "identity_test.db")
            bare, _ = search_people(db, "Ravi")
            assert {p.id for p in bare} == {"PER-RAVI-SHETTY", "PER-RAVI-BIZ", "PER-RAVI-K"}
            assert all(p.data_origin == "SEEDED_DEMO" for p in bare)

            mang, _ = search_people(db, "Ravi from Mangalore")
            assert [p.id for p in mang] == ["PER-RAVI-SHETTY"]

            bang, _ = search_people(db, "Ravi from Bangalore")
            assert [p.id for p in bang] == ["PER-RAVI-K"]

            biz, _ = search_people(db, "Business Ravi")
            assert [p.id for p in biz] == ["PER-RAVI-BIZ"]
            assert biz[0].supplier_id == "SUP-04"

            # Aliases & spelling variations
            assert [p.id for p in search_people(db, "Ravee Shetty")[0]] == ["PER-RAVI-SHETTY"]
            assert [p.id for p in search_people(db, "Raahul Kumar")[0]] == ["PER-RAHUL-KUMAR"]
            assert [p.id for p in search_people(db, "Suresh Gauda")[0]] == ["PER-SURESH-GOWDA"]
            assert [p.id for p in search_people(db, "Charran")[0]] == ["PER-CHARAN-RAO"]
    finally:
        get_settings.cache_clear()


def test_journey_a_send_stock_to_ravi_person_ravi_step_by_step(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Journey A: Send stock to Ravi -> Screw jack -> Person Ravi -> Yes -> 5-ton -> 5 -> destination."""
    try:
        with _client(tmp_path, monkeypatch) as client:
            # Ensure ops router hands 'Send stock to Ravi' to unified NLU workflow cleanly
            ops = client.post("/api/ops/query", json={"question": "Send stock to Ravi"}).json()
            assert ops["card_type"] == "help"

            t1 = client.post("/api/analyze", json={"instruction": "Send stock to Ravi"}).json()
            assert t1["status"] == "NEEDS_CLARIFICATION"
            cid = t1["conversation_id"]
            assert len(t1["clarification_questions"]) == 1
            assert "material" in t1["clarification_questions"][0].lower() or "stock" in t1["clarification_questions"][0].lower()

            t2 = client.post("/api/clarify", json={"conversation_id": cid, "response": "Screw jack"}).json()
            assert t2["conversation_id"] == cid
            assert t2["status"] == "NEEDS_CLARIFICATION"
            assert t2.get("inventory_insight") is None
            assert "which ravi" in t2["clarification_questions"][0].lower()
            cand_labels = [c["label"] for c in t2["candidate_options"]]
            assert any("Person Ravi" in lbl and "Ravi Shetty" in lbl for lbl in cand_labels)
            assert any("Business Ravi" in lbl for lbl in cand_labels)
            assert any("Ravi K" in lbl for lbl in cand_labels)

            # Check reload persistence preserves pending question & candidate cards
            reloaded = client.get(f"/api/conversations?conversation_id={cid}").json()
            assert reloaded["pending_slot"] == "recipient"
            assert len(reloaded["candidate_options"]) == 3

            t3 = client.post("/api/clarify", json={"conversation_id": cid, "response": "Person Ravi"}).json()
            assert t3["status"] == "NEEDS_CLARIFICATION"
            assert "ravi shetty" in t3["clarification_questions"][0].lower()
            assert "mangalore" in t3["clarification_questions"][0].lower()

            t4 = client.post("/api/clarify", json={"conversation_id": cid, "response": "Yes"}).json()
            assert t4["status"] == "NEEDS_CLARIFICATION"
            assert t4["pending_slot"] == "material_variant"
            assert len(t4["candidate_options"]) == 2

            t5 = client.post("/api/clarify", json={"conversation_id": cid, "response": "5-Ton Mechanical Screw Jack"}).json()
            assert t5["status"] == "NEEDS_CLARIFICATION"
            assert t5["pending_slot"] == "quantity"

            t6 = client.post("/api/clarify", json={"conversation_id": cid, "response": "5"}).json()
            assert t6["status"] == "NEEDS_CLARIFICATION"
            assert t6["pending_slot"] == "destination"

            t7 = client.post("/api/clarify", json={"conversation_id": cid, "response": "Bejai, Mangalore"}).json()
            assert t7["status"] == "RESOLVED"
            intent = t7["resolved_intent"]
            assert intent["action"] == "prepare_material_dispatch"
            assert intent["parameters"]["sku"] == "SKU-LFT-05"
            assert intent["parameters"]["quantity"] == "5"
            assert intent["parameters"]["recipient_person_id"] == "PER-RAVI-SHETTY"
            assert intent["parameters"]["stock_sufficient"] == "true"
            assert intent["parameters"]["execution_status"] == "PENDING_OPERATOR_CONFIRMATION"
            assert "no physical shipment" in intent["direct_answer"].lower()
    finally:
        get_settings.cache_clear()


def test_word_quantity_and_missing_destination_for_known_person(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Section 8: 'Send five screw jacks to Ravi Shetty.' asks variant/destination cleanly."""
    try:
        with _client(tmp_path, monkeypatch) as client:
            r1 = client.post("/api/analyze", json={"instruction": "Send five screw jacks to Ravi Shetty."}).json()
            assert r1["status"] == "NEEDS_CLARIFICATION"
            assert r1["resolved_slots"]["quantity"] == 5.0
            assert r1["resolved_slots"]["recipient_person_id"] == "PER-RAVI-SHETTY"
            cid = r1["conversation_id"]
            r2 = client.post("/api/clarify", json={"conversation_id": cid, "response": "5-ton"}).json()
            assert r2["status"] == "NEEDS_CLARIFICATION"
            assert r2["pending_slot"] == "destination"
            r3 = client.post("/api/clarify", json={"conversation_id": cid, "response": "Mangalore"}).json()
            assert r3["status"] == "RESOLVED"
            assert r3["resolved_intent"]["parameters"]["quantity"] == "5"
    finally:
        get_settings.cache_clear()


def test_clarification_question_sanitization_and_send_report_to_him_tomorrow(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Requirement 5: Fix malformed questions & handle 'Send the report to him tomorrow.' cleanly."""
    bad = "I need a bit more detail to continue this request. who should I receive it?please give the person's full name and team"
    assert sanitize_clarification_question(bad, action="send", obj="the report") == "Who should I send the report to?"

    try:
        with _client(tmp_path, monkeypatch) as client:
            with patch("app.services.gemini_service.call_gemini_structured", return_value=(None, "offline")):
                # Empty session pronoun -> clean single question, no date question
                r1 = client.post("/api/analyze", json={"instruction": "Send the report to him tomorrow."}).json()
                assert r1["status"] == "NEEDS_CLARIFICATION"
                assert r1["clarification_questions"] == ["Who should I send the report to?"]
                cid = r1["conversation_id"]

                # Clarify recipient -> asks which report
                r2 = client.post("/api/clarify", json={"conversation_id": cid, "response": "Ravi Shetty"}).json()
                assert r2["status"] == "NEEDS_CLARIFICATION"
                assert r2["clarification_questions"] == ["Which report should I send to Ravi Shetty?"]

                r3 = client.post("/api/clarify", json={"conversation_id": cid, "response": "Q3 Finance Report"}).json()
                assert r3["status"] == "RESOLVED"
                assert "Ravi Shetty" in r3["resolved_intent"]["direct_answer"]
                assert "Q3 Finance Report" in r3["resolved_intent"]["direct_answer"]
                assert "tomorrow" in r3["resolved_intent"]["direct_answer"].lower()
    finally:
        get_settings.cache_clear()


def test_malformed_gemini_question_is_normalized(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Validate & normalize Gemini-generated malformed clarification questions."""
    malformed = GeminiAnalysisOutput(
        classification="ambiguous",
        ambiguity_types=["referential"],
        needs_clarification=True,
        reasoning="Missing recipient.",
        interpretations=[],
        missing_required_info=["recipient"],
        clarification_questions=[
            "I need a bit more detail to continue: who should I receive it?please give the person's full name and team"
        ],
        resolved_intent=None,
    )
    try:
        with _client(tmp_path, monkeypatch) as client:
            with patch("app.services.gemini_service.call_gemini_structured", return_value=(malformed, None)):
                resp = client.post("/api/analyze", json={"instruction": "Forward the memo soon."}).json()
                assert resp["status"] == "NEEDS_CLARIFICATION"
                assert resp["clarification_questions"] == ["Who should I forward it to?"]
    finally:
        get_settings.cache_clear()


def test_relationships_pronouns_gender_and_fact_teaching(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test Ravi's friend, Rahul's classmate, him/her/them/their, warehouse manager, supplier, and user facts."""
    try:
        with _client(tmp_path, monkeypatch) as client:
            # 1. Section 4 exact scenario: teach relationship then resolve 'his friend'
            f1 = client.post(
                "/api/analyze",
                json={"instruction": "Ravi Shetty is my friend. Rahul is his college friend."},
            ).json()
            assert f1["status"] == "RESOLVED"
            assert f1["resolved_intent"]["action"] == "store_relationship_fact"

            f2 = client.post(
                "/api/analyze",
                json={"instruction": "Send the Q3_Finance_Report.pdf to his friend tomorrow."},
            ).json()
            # In a fresh session with no male anchor, "his friend" MUST ask rather than guess blindly!
            assert f2["status"] == "NEEDS_CLARIFICATION"

            # When answered within same session OR using 'Ravi Shetty's friend'
            f3 = client.post(
                "/api/analyze",
                json={"instruction": "Send Q3_Finance_Report.pdf to Ravi's friend."},
            ).json()
            assert f3["status"] == "RESOLVED"
            assert f3["resolved_intent"]["parameters"]["recipient"] == "Rahul Kumar"

            # 2. Rahul's classmate -> Deepak Hegde
            rc = client.post(
                "/api/analyze",
                json={"instruction": "Send Q3_Finance_Report.pdf to Rahul's classmate."},
            ).json()
            assert rc["status"] == "RESOLVED"
            assert rc["resolved_intent"]["parameters"]["recipient"] == "Deepak Hegde"

            # 3. Charan's classmate -> ambiguous (Ravi Shetty & Ananya Sharma)
            cc = client.post(
                "/api/analyze",
                json={"instruction": "Send Q3_Finance_Report.pdf to Charan's classmate."},
            ).json()
            assert cc["status"] == "NEEDS_CLARIFICATION"
            assert {c["metadata"]["person_id"] for c in cc["candidate_options"]} == {
                "PER-RAVI-SHETTY",
                "PER-ANANYA-SHARMA",
            }

            # 4. Gender-aware pronouns: 'her' must not bind male Ravi Shetty
            g1 = client.post(
                "/api/analyze",
                json={"instruction": "Ravi Shetty is waiting for Q3_Finance_Report.pdf."},
            )
            # Even inside same conv via context memory
            with patch("app.services.gemini_service.call_gemini_structured", return_value=(None, "offline")):
                her_conv = client.post(
                    "/api/analyze",
                    json={"instruction": "Prepare Q3_Finance_Report.pdf for Ravi Shetty."},
                ).json()
                her_reply = client.post(
                    "/api/clarify",
                    json={"conversation_id": her_conv["conversation_id"], "response": "Email the report to her."},
                ).json()
                # If Ravi Shetty is male and user asks for 'her', compatibility prevents binding her -> Ravi Shetty
                assert (her_reply.get("resolved_intent") or {}).get("parameters", {}).get("recipient") != "Ravi Shetty"

            # 5. Warehouse manager & discussed-earlier supplier
            wm = client.post(
                "/api/analyze",
                json={"instruction": "Send Q3_Finance_Report.pdf to the warehouse manager."},
            ).json()
            assert wm["status"] == "RESOLVED"
            assert wm["resolved_intent"]["parameters"]["recipient"] == "Suresh Gowda"

            sup_c = client.post(
                "/api/analyze",
                json={"instruction": "Send the Q3_Finance_Report.pdf to our supplier."},
            ).json()
            assert sup_c["status"] == "NEEDS_CLARIFICATION"
            assert len(sup_c["candidate_options"]) >= 2

            # Session earlier supplier
            s1 = client.post(
                "/api/analyze",
                json={"instruction": "Review Titan Industrial Drives with Business Ravi."},
            ).json()
            # In same conv clarify with "Send the supplier we discussed earlier Q3_Finance_Report.pdf"
            # Wait - when Business Ravi was discussed, force document follow-up:
            s2 = client.post(
                "/api/analyze",
                json={"instruction": "Email the supplier we discussed earlier about the report."},
            ).json()
            assert s2["status"] == "NEEDS_CLARIFICATION"
    finally:
        get_settings.cache_clear()


def test_conversation_switching_isolation_and_ops_relevance(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Ensure switching between conversations never leaks slots/candidates and inventory cards appear only when relevant."""
    try:
        with _client(tmp_path, monkeypatch) as client:
            a1 = client.post("/api/analyze", json={"instruction": "Send stock to Ravi"}).json()
            b1 = client.post("/api/analyze", json={"instruction": "Send the report to him tomorrow."}).json()
            a_id, b_id = a1["conversation_id"], b1["conversation_id"]
            assert a_id != b_id

            # Advance A with screw jack -> B must NOT see screw jack
            a2 = client.post("/api/clarify", json={"conversation_id": a_id, "response": "Screw jack"}).json()
            assert len(a2["candidate_options"]) == 3

            b_detail = client.get(f"/api/conversations?conversation_id={b_id}").json()
            assert b_detail["workflow_type"] == "document_send"
            assert b_detail["candidate_options"] == []
            assert "screw jack" not in str(b_detail["resolved_slots"]).lower()

            # Journey C: shortages query returns shortages card via ops router cleanly
            short_card = client.post("/api/ops/query", json={"question": "Show current inventory shortages"}).json()
            assert short_card["card_type"] == "shortages"
            assert len(short_card["data"]) == 5

            # Existing communication card still works cleanly & resolves DB relationships
            msg_card = client.post(
                "/api/ops/query",
                json={"question": "Message Ravi that tomorrow is the last date for payment for stock."},
            ).json()
            assert msg_card["card_type"] == "message_draft"
            assert msg_card["data"]["delivery_status"] == "DRAFT_ONLY"
            assert len(msg_card["data"].get("candidate_options", [])) == 3

            # Rahul's classmate resolves authoritatively to Deepak Hegde via /api/ops/query
            rahul_cls = client.post(
                "/api/ops/query",
                json={"question": "Email Rahul's classmate that I am coming tomorrow."},
            ).json()
            assert rahul_cls["card_type"] == "message_draft"
            assert rahul_cls["data"]["recipient"] == "Deepak Hegde"
            assert rahul_cls["data"]["delivery_status"] == "DRAFT_ONLY"

            # Charan's classmate remains ambiguous and includes clickable candidate options
            charan_cls = client.post(
                "/api/ops/query",
                json={"question": "Email Charan's classmate that I will be absent tomorrow."},
            ).json()
            assert charan_cls["card_type"] == "message_draft"
            assert charan_cls["data"]["requires_clarification"] is True
            assert len(charan_cls["data"].get("candidate_options", [])) == 2

            charan_cls2 = client.post(
                "/api/ops/query",
                json={"conversation_id": charan_cls["conversation_id"], "question": "Ravi Shetty"},
            ).json()
            assert charan_cls2["card_type"] == "message_draft"
            assert charan_cls2["data"]["recipient"] == "Ravi Shetty"
            assert charan_cls2["data"]["delivery_status"] == "DRAFT_ONLY"
            assert "absent tomorrow" in charan_cls2["data"]["body"].lower()

            # Lowercase "email charan's classmate that i will be absent tommorow" asks for classmate instead of drafting to Charan
            lc_charan = client.post(
                "/api/ops/query",
                json={"question": "email charan's classmate that i will be absent tommorow"},
            ).json()
            assert lc_charan["card_type"] == "message_draft"
            assert lc_charan["data"]["requires_clarification"] is True
            assert len(lc_charan["data"].get("candidate_options", [])) == 2

            # "Send the report to him tomorrow." inside a previous Deepak draft conversation must route out ("help"), NOT emit "Him tomorrow." draft
            rep_after = client.post(
                "/api/ops/query",
                json={"conversation_id": rahul_cls["conversation_id"], "question": "Send the report to him tomorrow."},
            ).json()
            assert rep_after["card_type"] == "help"

            # Lowercase clarification replies "ravi" and "ravi shetty" on "Send the report to him tomorrow."
            rep0 = client.post("/api/analyze", json={"instruction": "Send the report to him tomorrow."}).json()
            rep_ravi = client.post("/api/clarify", json={"conversation_id": rep0["conversation_id"], "response": "ravi"}).json()
            assert rep_ravi["status"] == "NEEDS_CLARIFICATION"
            assert len(rep_ravi["candidate_options"]) == 3
            rep_rs = client.post("/api/clarify", json={"conversation_id": rep0["conversation_id"], "response": "ravi shetty"}).json()
            assert rep_rs["status"] == "NEEDS_CLARIFICATION"
            assert "which report" in rep_rs["clarification_questions"][0].lower()

            # Verify Person Ravi candidate reply_text triggers Mangalore confirmation step
            ravi_btn = next(c for c in a2["candidate_options"] if "Person Ravi" in c["label"])
            assert ravi_btn["reply_text"] == "Person Ravi"

            # Random gibberish & off-topic sentences must NEVER leak inventory cards or resolve blindly
            for junk in ("asdfghjkl", "banana pizza", "I need some space", "blabla foo bar"):
                oq = client.post("/api/ops/query", json={"question": junk}).json()
                assert oq["card_type"] == "help", f"{junk} leaked into {oq}"
                aq = client.post("/api/analyze", json={"instruction": junk}).json()
                assert aq["status"] == "NEEDS_CLARIFICATION"
                assert aq["interpretations"] == []
            for off_topic in ("create a poem", "order pizza tonight"):
                oq = client.post("/api/ops/query", json={"question": off_topic}).json()
                assert oq["card_type"] == "help"
                aq = client.post("/api/analyze", json={"instruction": off_topic}).json()
                assert aq["status"] == "NEEDS_CLARIFICATION"

            # Valid unit conversion & bare catalog lookup still resolve cleanly directly on /api/analyze
            conv_q = client.post("/api/analyze", json={"instruction": "10 km to miles"}).json()
            assert conv_q["status"] == "RESOLVED"
            assert "6.2137" in conv_q["resolved_intent"]["direct_answer"]
            bare_mat = client.post("/api/analyze", json={"instruction": "Cold-Rolled Steel Sheet"}).json()
            assert bare_mat["status"] == "RESOLVED"
            assert bare_mat["resolved_intent"]["action"] == "check_material_availability"

            # Contradictions & lexical ambiguities route cleanly into PS6 disambiguation
            con = client.post("/api/ops/query", json={"question": "Cancel and ship order ORD-1001"}).json()
            assert con["card_type"] == "help"
            con_a = client.post("/api/analyze", json={"instruction": "Cancel and ship order ORD-1001"}).json()
            assert con_a["status"] == "NEEDS_CLARIFICATION"
            assert "semantic" in con_a["ambiguity_types"]
            con_b = client.post(
                "/api/clarify",
                json={"conversation_id": con_a["conversation_id"], "response": "Use interpretation: Keep cancel"},
            ).json()
            assert con_b["status"] == "RESOLVED"
            assert "Keep cancel" in con_b["resolved_intent"]["resolved_instruction"]

            with patch("app.services.gemini_service.call_gemini_structured", return_value=(None, "quota")):
                lex = client.post("/api/analyze", json={"instruction": "Check the charge on it"}).json()
                assert lex["status"] == "NEEDS_CLARIFICATION"
                assert "lexical" in lex["ambiguity_types"]
                assert len(lex["interpretations"]) >= 2
    finally:
        get_settings.cache_clear()
