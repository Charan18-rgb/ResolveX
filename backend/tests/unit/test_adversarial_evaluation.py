"""
Unit and API tests for Feature 7: Adversarial Ambiguity Testing Lab & Evaluator.
"""

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
import pytest

from app.database.connection import init_db
from app.evaluation.ps6_evaluator import _load_dataset, run_ps6_evaluation
from app.main import create_app
from app.models.ai_schemas import (
    GeminiAnalysisOutput,
    InterpretationOutput,
    ResolvedIntentOutput,
)


def _mock_smart_gemini(prompt: str, _schema, _temp: float = 0.1):
    """Deterministic test double simulating varied backend ambiguity outputs."""
    lower = prompt.lower()
    if "export read-only csv metrics" in lower:
        return (
            GeminiAnalysisOutput(
                classification="clear",
                ambiguity_types=[],
                needs_clarification=False,
                reasoning="All IDs, warehouse, date, and read-only constraints are explicit.",
                interpretations=[],
                missing_required_info=[],
                clarification_questions=[],
                resolved_intent=ResolvedIntentOutput(
                    action="export_inventory_metrics",
                    parameters={"order": "ORD-1001", "material": "MAT-CHIP"},
                    resolved_instruction="Export CSV for ORD-1001 and MAT-CHIP.",
                ),
            ),
            None,
        )

    if "user's latest clarification" in lower or "rahul.sharma@acme.com" in lower or "mat-chip allocation" in lower:
        return (
            GeminiAnalysisOutput(
                classification="context_dependent",
                ambiguity_types=[],
                needs_clarification=False,
                reasoning="Follow-up clarification resolved all pending slots.",
                interpretations=[],
                missing_required_info=[],
                clarification_questions=[],
                resolved_intent=ResolvedIntentOutput(
                    action="execute_resolved",
                    parameters={"status": "clarified"},
                    resolved_instruction="Execute clarified instruction safely.",
                ),
            ),
            None,
        )

    detected: list[str] = []
    for key in ("lexical", "referential", "structural", "contextual", "semantic", "underspecification"):
        if key in lower or (
            key == "lexical" and "charge" in lower
        ) or (
            key == "referential" and ("him" in lower or "it" in lower or "rahul" in lower)
        ) or (
            key == "structural" and "bengaluru or chennai" in lower
        ) or (
            key == "contextual" and ("usual" in lower or "staging" in lower or "chip stock" in lower)
        ) or (
            key == "semantic" and ("every regional" in lower or "staging" in lower)
        ) or (
            key == "underspecification" and ("fix it" in lower or "exception" in lower or "sessions" in lower)
        ):
            detected.append(key)

    return (
        GeminiAnalysisOutput(
            classification="incomplete" if ("fix it" in lower or "exception" in lower or "chip stock" in lower) else "ambiguous",
            ambiguity_types=detected or ["contextual"],
            needs_clarification=True,
            reasoning="Multiple adversarial ambiguities detected.",
            interpretations=[
                InterpretationOutput(label="Primary Candidate", description="Candidate meaning A."),
                InterpretationOutput(label="Alternative Candidate", description="Candidate meaning B."),
            ],
            missing_required_info=["Target entity specification"],
            clarification_questions=["Please clarify the exact target and scope."],
            resolved_intent=None,
        ),
        None,
    )


def test_adversarial_dataset_covers_all_required_categories() -> None:
    adversarial = _load_dataset(adversarial_only=True)
    categories = {item.get("ambiguity_category") for item in adversarial}
    tags = {tag for item in adversarial for tag in item.get("tags", [])}

    assert {"lexical", "referential", "structural", "contextual", "semantic", "underspecification"}.issubset(categories)
    assert {"long_sentence", "multi_ambiguity", "missing_context", "contradictory", "multi_turn", "clear_control"}.issubset(tags)


def test_run_ps6_evaluation_adversarial_and_baseline_comparison(tmp_path: Path) -> None:
    db_path = str(tmp_path / "adv_eval.db")
    init_db(db_path)

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        side_effect=_mock_smart_gemini,
    ):
        report = run_ps6_evaluation(db_path, adversarial_only=True)

    assert report["adversarial_only"] is True
    assert report["dataset_size"] >= 12
    assert report["fallback_cases_count"] == 0
    assert report["provenance"] == "live_backend_evaluated"
    assert report["precision"] == 1.0
    assert report["recall"] == 1.0
    assert report["f1_score"] == 1.0
    assert report["false_clarification_rate"] == 0.0
    assert report["clarification_efficiency"] > 0.0
    assert "baseline_comparison" in report
    assert 0.0 <= report["baseline_comparison"]["f1_score"] <= 1.0
    # Naive regex misses lexical/semantic/structural cases that have no pronouns
    assert report["f1_score"] >= report["baseline_comparison"]["f1_score"]
    assert all("correct_detections" in row and "missed_ambiguities" in row for row in report["results_detail"])


def test_ps6_evaluation_flags_ai_fallback_honestly(tmp_path: Path) -> None:
    db_path = str(tmp_path / "adv_fallback.db")
    init_db(db_path)

    with patch(
        "app.services.gemini_service.call_gemini_structured",
        return_value=(None, "GEMINI_API_KEY missing"),
    ):
        report = run_ps6_evaluation(db_path, adversarial_only=True)

    assert report["provenance"] == "ai_fallback_mixed"
    assert report["fallback_cases_count"] == report["dataset_size"]
    assert any("fallback active" in (row["failure_explanation"] or "").lower() for row in report["results_detail"])


def test_evaluation_api_endpoint_supports_adversarial_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "adv_api.db"))
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as client:
            with patch(
                "app.services.gemini_service.call_gemini_structured",
                side_effect=_mock_smart_gemini,
            ):
                resp = client.get("/api/evaluation/ps6?run_now=true&adversarial_only=true")
        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] == "fresh_run"
        assert body["evaluation"]["adversarial_only"] is True
        assert body["evaluation"]["dataset_size"] >= 12
        assert "baseline_comparison" in body["evaluation"]
    finally:
        get_settings.cache_clear()
