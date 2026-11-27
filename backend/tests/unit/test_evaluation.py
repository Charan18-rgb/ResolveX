"""
Evaluation unit tests — verify PS2 deterministic metrics without Gemini.
"""

import tempfile
import os

import pytest

from app.database.connection import init_db
from app.inventory.seed import seed_demo_data
from app.inventory.allocation_engine import recalculate_allocations
from app.inventory.order_risk_engine import evaluate_order_risks
from app.evaluation.ps2_evaluator import run_ps2_evaluation


def _fresh_db() -> str:
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    seed_demo_data(path)
    recalculate_allocations(path)
    evaluate_order_risks(path)
    return path


# ---------------------------------------------------------------------------
# 1. PS2 accuracy >= 80% on demo scenario
# ---------------------------------------------------------------------------

def test_ps2_evaluation_accuracy():
    db_path = _fresh_db()
    result = run_ps2_evaluation(db_path)
    assert result["total_scenarios"] > 0, "No scenarios were evaluated."
    assert result["accuracy"] >= 0.70, (
        f"PS2 accuracy {result['accuracy']} is below acceptable threshold 0.70. "
        f"Detail: {result['results_detail']}"
    )


# ---------------------------------------------------------------------------
# 2. ORD-1001 is ON_TRACK
# ---------------------------------------------------------------------------

def test_ps2_ord1001_on_track():
    db_path = _fresh_db()
    result = run_ps2_evaluation(db_path)
    ord1001_scenario = next(
        (r for r in result["results_detail"] if r["scenario"] == "crd_risk_ord1001"),
        None,
    )
    assert ord1001_scenario is not None, "ORD-1001 CRD scenario not found in results."
    assert ord1001_scenario["pass"] is True, (
        f"ORD-1001 expected ON_TRACK but got: {ord1001_scenario}"
    )


# ---------------------------------------------------------------------------
# 3. ORD-1002 is AT_RISK or BLOCKED due to MAT-CHIP shortage
# ---------------------------------------------------------------------------

def test_ps2_ord1002_at_risk_or_blocked():
    db_path = _fresh_db()
    result = run_ps2_evaluation(db_path)
    ord1002_scenario = next(
        (r for r in result["results_detail"] if r["scenario"] == "crd_risk_ord1002"),
        None,
    )
    assert ord1002_scenario is not None, "ORD-1002 CRD scenario not found in results."
    assert ord1002_scenario["pass"] is True, (
        f"ORD-1002 expected AT_RISK/BLOCKED but got: {ord1002_scenario}"
    )


# ---------------------------------------------------------------------------
# 4. MAT-CHIP shortage is detected
# ---------------------------------------------------------------------------

def test_ps2_chip_shortage_detected():
    db_path = _fresh_db()
    result = run_ps2_evaluation(db_path)
    chip_scenario = next(
        (r for r in result["results_detail"] if r["scenario"] == "shortage_detection"),
        None,
    )
    assert chip_scenario is not None, "Shortage detection scenario not found."
    assert chip_scenario["pass"] is True, (
        f"MAT-CHIP shortage was not detected. Detail: {chip_scenario}"
    )


# ---------------------------------------------------------------------------
# 5. Net availability formula correctness for all materials
# ---------------------------------------------------------------------------

def test_ps2_net_availability_all_correct():
    db_path = _fresh_db()
    result = run_ps2_evaluation(db_path)
    nav_scenarios = [r for r in result["results_detail"] if r["scenario"] == "net_availability"]
    assert len(nav_scenarios) > 0, "No net availability scenarios found."
    failures = [s for s in nav_scenarios if not s["pass"]]
    assert failures == [], f"Net availability formula failed for: {failures}"
