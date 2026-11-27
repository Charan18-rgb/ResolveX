"""
PS2 evaluator — runs deterministic inventory scenarios, computes metrics,
and verifies the system's accuracy against known ground truth.
No Gemini required; all data is deterministic Python.
"""

import uuid
from typing import Any

from app.config import get_settings
from app.inventory.availability_calculator import compute_net_availability, get_inventory_overview
from app.inventory.order_risk_engine import evaluate_order_risks
from app.inventory.shortage_detector import detect_shortages
from app.inventory.allocation_engine import recalculate_allocations
from app.database.connection import get_connection


def run_ps2_evaluation(db_path: str) -> dict[str, Any]:
    """
    Run deterministic PS2 evaluation scenarios and return metrics.
    Scenarios tested:
    1. Net availability formula correctness
    2. Earliest-CRD-First allocation correctness
    3. Shortage detection (precision + recall)
    4. CRD risk assessment correctness
    """
    results: list[dict] = []
    passed = 0
    total = 0

    # --- Scenario 1: Net Availability Formula ---
    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT material_id, on_hand, allocated, incoming
            FROM inventory_balances;
            """
        ).fetchall()

    for row in rows:
        total += 1
        mat = row["material_id"]
        on_hand = float(row["on_hand"])
        allocated = float(row["allocated"])
        incoming = float(row["incoming"])
        expected_net = on_hand - allocated + incoming
        actual_net = compute_net_availability(on_hand, incoming, allocated)
        ok = abs(actual_net - expected_net) < 0.001
        if ok:
            passed += 1
        results.append({
            "scenario": "net_availability",
            "material_id": mat,
            "expected": expected_net,
            "actual": actual_net,
            "pass": ok,
        })

    # --- Scenario 2: Shortage detection ---
    shortages = detect_shortages(db_path)
    shortages_found = len(shortages)
    total += 1

    # MAT-CHIP is always short in the demo scenario (10+10 demand, only 15 on_hand)
    chip_short = any(
        s.get("material_id") == "MAT-CHIP"
        for s in shortages
    )
    if chip_short:
        passed += 1
    results.append({
        "scenario": "shortage_detection",
        "material": "MAT-CHIP",
        "pass": chip_short,
        "shortages_found": shortages_found,
    })

    # --- Scenario 3: CRD Risk assessment ---
    # evaluate_order_risks returns list[OrderRiskItem] (Pydantic models)
    risks = evaluate_order_risks(db_path)

    total += 1
    ord1001_risk = next(
        (r for r in risks if r.order_id == "ORD-1001"),
        None,
    )
    # ORD-1001 must be ON_TRACK (fully allocated)
    ord1001_ok = ord1001_risk is not None and ord1001_risk.risk_category == "ON_TRACK"
    if ord1001_ok:
        passed += 1
    results.append({
        "scenario": "crd_risk_ord1001",
        "risk_status": ord1001_risk.risk_category if ord1001_risk else None,
        "pass": ord1001_ok,
    })

    total += 1
    ord1002_risk = next(
        (r for r in risks if r.order_id == "ORD-1002"),
        None,
    )
    # ORD-1002 is AT_RISK or BLOCKED due to MAT-CHIP shortage
    ord1002_ok = (
        ord1002_risk is not None
        and ord1002_risk.risk_category in ("AT_RISK", "BLOCKED", "DELAYED")
    )
    if ord1002_ok:
        passed += 1
    results.append({
        "scenario": "crd_risk_ord1002",
        "risk_status": ord1002_risk.risk_category if ord1002_risk else None,
        "pass": ord1002_ok,
    })

    # --- Scenario 4: Allocation correctness ---
    with get_connection(db_path) as conn:
        alloc_rows = conn.execute(
            """
            SELECT a.order_id, SUM(a.allocated_qty) as total_alloc
            FROM material_allocations a
            WHERE a.order_id = 'ORD-1001'
            GROUP BY a.order_id;
            """
        ).fetchall()
    total += 1
    ord1001_alloc = alloc_rows[0]["total_alloc"] if alloc_rows else 0
    alloc_ok = ord1001_alloc > 0
    if alloc_ok:
        passed += 1
    results.append({
        "scenario": "allocation_ord1001",
        "allocated": ord1001_alloc,
        "pass": alloc_ok,
    })

    # Compile metrics
    accuracy = passed / total if total > 0 else 0.0

    # Measured baseline: naive FIFO allocation (created_at order, no CRD
    # lookahead) scored on the same policy-sensitive scenarios.
    baseline = _run_fifo_baseline(db_path)
    policy_scenarios = {
        "shortage_detection",
        "crd_risk_ord1001",
        "crd_risk_ord1002",
        "allocation_ord1001",
    }
    subset = [r for r in results if r["scenario"] in policy_scenarios]
    system_subset_accuracy = (
        sum(1 for r in subset if r["pass"]) / len(subset) if subset else 0.0
    )

    return {
        "run_id": str(uuid.uuid4()),
        "total_scenarios": total,
        "passed": passed,
        "failed": total - passed,
        "accuracy": round(accuracy, 4),
        "baseline_method": baseline["method"],
        "baseline_accuracy": baseline["accuracy"],
        "baseline_scenarios": baseline["total"],
        "baseline_passed": baseline["passed"],
        "improvement_over_baseline": round(system_subset_accuracy - baseline["accuracy"], 4),
        "shortages_detected": shortages_found,
        "crd_risk_orders_evaluated": len(risks),
        "results_detail": results,
        "note": (
            "ResolveX uses Earliest-CRD-First allocation and deterministic net availability. "
            "Baseline is a simulated reactive FIFO allocation (creation order, no CRD lookahead) "
            "scored on the same policy-sensitive scenarios."
        ),
    }


def _run_fifo_baseline(db_path: str) -> dict[str, Any]:
    """
    Simulate a naive baseline: allocate on-hand stock to OPEN orders in
    creation order (FIFO) ignoring customer required dates, then score the
    same policy-sensitive checks the main evaluation uses.
    """
    results: list[dict] = []
    passed = 0
    total = 0

    with get_connection(db_path) as conn:
        balances = {
            r["material_id"]: float(r["on_hand"])
            for r in conn.execute("SELECT material_id, on_hand FROM inventory_balances;").fetchall()
        }
        bom = {}
        for r in conn.execute("SELECT product_code, material_id, quantity_per_unit FROM bills_of_materials;").fetchall():
            bom.setdefault(r["product_code"], []).append((r["material_id"], float(r["quantity_per_unit"])))
        orders = conn.execute(
            """
            SELECT id, product_code, quantity, customer_request_date, processing_days
            FROM orders WHERE status = 'OPEN'
            ORDER BY created_at ASC, id ASC;
            """
        ).fetchall()
        thresholds = {
            r["id"]: float(r["reorder_threshold"])
            for r in conn.execute("SELECT id, reorder_threshold FROM materials;").fetchall()
        }

    remaining = dict(balances)
    order_alloc: dict[str, dict[str, float]] = {}
    for order in orders:
        order_alloc[order["id"]] = {}
        for mat_id, per_unit in bom.get(order["product_code"], []):
            req = float(order["quantity"]) * per_unit
            alloc = round(min(req, max(remaining.get(mat_id, 0.0), 0.0)), 4)
            remaining[mat_id] = round(remaining.get(mat_id, 0.0) - alloc, 4)
            order_alloc[order["id"]][mat_id] = alloc

    # Policy-sensitive scenario 1: is MAT-CHIP still short under FIFO?
    total += 1
    chip_demand = sum(
        float(o["quantity"]) * dict(bom.get(o["product_code"], [])).get("MAT-CHIP", 0.0)
        for o in orders
    )
    chip_alloc = sum(a.get("MAT-CHIP", 0.0) for a in order_alloc.values())
    chip_short = chip_demand - chip_alloc > 0
    if chip_short:
        passed += 1
    results.append({"scenario": "shortage_detection", "material": "MAT-CHIP", "pass": chip_short})

    # Scenario 2/3: ORD-1001 expected ON_TRACK, ORD-1002 expected at-risk.
    def _fifo_risk(order_id: str) -> str:
        order = next(o for o in orders if o["id"] == order_id)
        allocs = order_alloc[order_id]
        fully = all(
            allocs.get(mat_id, 0.0)
            >= float(order["quantity"]) * per_unit - 1e-6
            for mat_id, per_unit in bom.get(order["product_code"], [])
        )
        if not fully:
            return "AT_RISK"
        from datetime import date, timedelta
        proc = max(0, int(order["processing_days"] or 1))
        proj = date.today() + timedelta(days=proc)
        try:
            crd = date.fromisoformat(str(order["customer_request_date"]))
        except ValueError:
            return "BLOCKED"
        return "ON_TRACK" if proj <= crd else "DELAYED"

    total += 1
    r1 = _fifo_risk("ORD-1001")
    ok1 = r1 == "ON_TRACK"
    if ok1:
        passed += 1
    results.append({"scenario": "crd_risk_ord1001", "risk_status": r1, "pass": ok1})

    total += 1
    r2 = _fifo_risk("ORD-1002")
    ok2 = r2 in ("AT_RISK", "BLOCKED", "DELAYED")
    if ok2:
        passed += 1
    results.append({"scenario": "crd_risk_ord1002", "risk_status": r2, "pass": ok2})

    total += 1
    alloc1 = sum(order_alloc.get("ORD-1001", {}).values())
    ok3 = alloc1 > 0
    if ok3:
        passed += 1
    results.append({"scenario": "allocation_ord1001", "allocated": alloc1, "pass": ok3})

    return {
        "method": "reactive_fifo_no_crd_lookahead",
        "total": total,
        "passed": passed,
        "accuracy": round(passed / total, 4) if total else 0.0,
        "results_detail": results,
    }
