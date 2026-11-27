"""
Task router — classifies resolved intent domain and dispatches inventory lookups.
Inventory data is always retrieved deterministically from Python engines.
Gemini only explains; it never originates numbers.
"""

from typing import Any

from app.models.ai_schemas import ResolvedIntentOutput

_INVENTORY_ACTION_KEYWORDS = {
    "inventory",
    "stock",
    "material",
    "supply",
    "order",
    "shortage",
    "allocation",
    "purchase",
    "procurement",
    "reorder",
    "replenish",
    "deliver",
    "warehouse",
    "fulfil",
    "fulfill",
    "bom",
    "bill_of_material",
    "component",
    "availability",
    "crd",
    "mat-chip",
    "mat-steel",
    "mat-copper",
    "mat-bolt",
    "delivery_risk",
    "purchase_order",
    "proposal",
}


def classify_intent_domain(resolved_intent: ResolvedIntentOutput) -> str:
    """
    Return 'inventory' if the resolved intent relates to inventory/supply-chain,
    otherwise return 'general'.
    """
    action_lower = resolved_intent.action.lower()
    resolved_lower = resolved_intent.resolved_instruction.lower()

    # Check action keywords
    for keyword in _INVENTORY_ACTION_KEYWORDS:
        if keyword in action_lower or keyword in resolved_lower:
            return "inventory"

    # Check parameter keys
    params = (
        resolved_intent.parameters_dict()
        if hasattr(resolved_intent, "parameters_dict")
        else resolved_intent.parameters
    )
    for key in params:
        if any(kw in str(key).lower() for kw in _INVENTORY_ACTION_KEYWORDS):
            return "inventory"

    return "general"


def route_to_inventory(db_path: str, resolved_intent: ResolvedIntentOutput) -> dict[str, Any]:
    """
    Dispatch to inventory engines and return a structured insight dict.
    Uses deterministic Python engines only — no Gemini.
    """
    from app.inventory.availability_calculator import get_inventory_overview
    from app.inventory.shortage_detector import detect_shortages
    from app.inventory.order_risk_engine import evaluate_order_risks

    overview = get_inventory_overview(db_path)
    shortages = detect_shortages(db_path)
    risks = evaluate_order_risks(db_path)

    return {
        "domain": "inventory",
        "intent_action": resolved_intent.action,
        "inventory_overview": overview.model_dump(),
        "shortages": shortages,
        "order_risks": [r.model_dump() for r in risks],
        "note": "Data sourced deterministically from ResolveX inventory database.",
    }
