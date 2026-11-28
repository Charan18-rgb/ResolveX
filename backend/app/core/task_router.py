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
    "shortage",
    "allocation",
    "purchase",
    "procurement",
    "reorder",
    "replenish",
    "warehouse",
    "fulfil",
    "fulfill",
    "bom",
    "bill_of_material",
    "availability",
    "crd",
    "delivery_risk",
    "purchase_order",
    "proposal",
}

_EXCLUDED_NON_REPORT_ACTIONS = {
    "draft_message",
    "update_message_draft",
    "record_send_instruction",
    "unsupported_request",
    "unit_conversion",
    "calculate",
    "prepare_material_dispatch",
}


def classify_intent_domain(resolved_intent: ResolvedIntentOutput) -> str:
    """
    Return 'inventory' if the resolved intent relates to inventory/supply-chain reporting,
    otherwise return 'general'.
    """
    action_lower = resolved_intent.action.lower()
    if action_lower in _EXCLUDED_NON_REPORT_ACTIONS:
        return "general"
    resolved_lower = resolved_intent.resolved_instruction.lower()

    # Check action keywords (require explicit inventory/report keywords, not bare "material")
    for keyword in _INVENTORY_ACTION_KEYWORDS:
        if keyword in action_lower or keyword in resolved_lower:
            return "inventory"
    if action_lower.startswith("check_") and ("material" in action_lower or "mat-" in resolved_lower or "sku-" in resolved_lower):
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


def _focus_materials(db_path: str, resolved_intent: ResolvedIntentOutput) -> list[str]:
    from app.inventory.catalog_search import search_materials

    params = (
        resolved_intent.parameters_dict()
        if hasattr(resolved_intent, "parameters_dict")
        else {}
    )
    blob = " ".join(
        [
            resolved_intent.action,
            resolved_intent.resolved_instruction,
            " ".join(str(value) for value in params.values()),
        ]
    ).strip()
    if not blob:
        return []
    matches = search_materials(db_path, blob, limit=6)
    return [m.id for m in matches]


def _explain_inventory(
    db_path: str,
    resolved_intent: ResolvedIntentOutput,
    overview: Any,
    shortages: list[dict[str, Any]],
    risks: list[Any],
) -> str:
    """Plain-language summary that only restates engine outputs."""
    focus = _focus_materials(db_path, resolved_intent)
    action = resolved_intent.action.lower()
    lines: list[str] = []

    materials = list(overview.materials)
    if focus:
        materials = [item for item in materials if item.sku in focus or item.id in focus]
        focused_shortages = [row for row in shortages if row.get("material_id") in focus or row.get("sku") in focus]
    else:
        focused_shortages = shortages

    if "order_risk" in action or "deliver" in resolved_intent.resolved_instruction.lower():
        watched = [row for row in risks if row.risk_category != "ON_TRACK"]
        if not watched:
            lines.append("No open order is currently projected to miss its customer required date.")
        else:
            for row in watched:
                lines.append(
                    f"{row.order_id} ({row.customer_name}) is {row.risk_category}: "
                    f"customer required date {row.customer_request_date}, "
                    f"projected ship {row.projected_ship_date or 'unavailable'}."
                )
    if materials and ("shortage" in action or "material" in action or "inventory" in action or focus):
        for item in materials:
            lines.append(
                f"{item.sku} {item.name}: on hand {item.on_hand:g} {item.unit}, "
                f"incoming {item.incoming:g}, allocated {item.allocated:g}, "
                f"net available {item.net_availability:g} ({item.stock_status})."
            )
        for row in focused_shortages:
            affected = ", ".join(row.get("affected_orders") or []) or "none"
            lines.append(
                f"{row['material_id']} unmet order demand {row['unmet_order_demand']:g} {row['unit']}; "
                f"affected orders: {affected}; suggested purchase quantity {row['recommended_purchase_qty']:g}."
            )
        if focus:
            affected_ids = {
                order_id
                for row in focused_shortages
                for order_id in (row.get("affected_orders") or [])
            }
            for row in risks:
                if row.order_id in affected_ids:
                    lines.append(
                        f"{row.order_id} is {row.risk_category} against customer required date "
                        f"{row.customer_request_date} (projected ship {row.projected_ship_date or 'unavailable'})."
                    )
    if not lines:
        lines.append(
            f"{overview.total_materials} materials tracked, "
            f"{overview.low_stock_count} low and {overview.out_of_stock_count} out of stock. "
            f"{len(shortages)} shortage signals and {len(risks)} open orders were evaluated."
        )
    lines.append("Figures come from the ResolveX inventory database, not from the language model.")
    return " ".join(lines)


def route_to_inventory(db_path: str, resolved_intent: ResolvedIntentOutput) -> dict[str, Any]:
    """
    Dispatch to inventory engines and return a structured insight dict.
    Uses deterministic Python engines only — no Gemini.
    """
    from app.inventory.availability_calculator import get_inventory_overview
    from app.inventory.order_risk_engine import evaluate_order_risks
    from app.inventory.shortage_detector import detect_shortages

    overview = get_inventory_overview(db_path)
    shortages = detect_shortages(db_path)
    risks = evaluate_order_risks(db_path)
    focus = _focus_materials(db_path, resolved_intent)
    visible_shortages = shortages
    visible_risks = risks
    if focus:
        visible_shortages = [
            row for row in shortages if row.get("material_id") in focus or row.get("sku") in focus
        ]
        focus_orders = {
            order_id
            for row in visible_shortages
            for order_id in (row.get("affected_orders") or [])
        }
        if focus_orders:
            visible_risks = [row for row in risks if row.order_id in focus_orders]

    return {
        "domain": "inventory",
        "intent_action": resolved_intent.action,
        "focus_materials": focus,
        "inventory_overview": overview.model_dump(),
        "shortages": visible_shortages,
        "order_risks": [row.model_dump() for row in visible_risks],
        "explanation": _explain_inventory(db_path, resolved_intent, overview, shortages, risks),
        "note": "Data sourced deterministically from ResolveX inventory database.",
    }
