"""Operations API routes — warehouse storage, supplier performance, order timelines, and the
conversational ops-query endpoint that powers contextual chat cards."""

from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.config import Settings, get_settings
from app.database.connection import get_connection
from app.inventory.purchase_order_engine import list_proposals
from app.inventory.shortage_detector import detect_shortages
from app.ops.order_service import get_order_timeline
from app.ops.supplier_service import (
    compare_suppliers,
    get_supplier_detail,
    get_supplier_performance,
)
from app.ops.warehouse_service import (
    get_material_location,
    get_storage_locations,
    get_warehouse_overview,
)

ops_router = APIRouter(prefix="/api", tags=["Operations"])

OPERATOR_ROLES = {"ADMIN", "OPERATOR"}


def _audit_operator_access(db_path: str, role: str, action: str, detail: str) -> None:
    """Record operator-area access attempts in system_audit_logs (best-effort)."""
    try:
        from datetime import datetime, timezone
        import json
        with get_connection(db_path) as conn:
            conn.execute(
                """
                INSERT INTO system_audit_logs (actor, actor_role, action, entity_type, entity_id, details_json, created_at)
                VALUES (?, ?, ?, 'operator_area', ?, ?, ?);
                """,
                ("anonymous-demo-user", role, action, "evaluation", json.dumps({"detail": detail}),
                 datetime.now(timezone.utc).isoformat()),
            )
    except Exception:
        pass  # audit must never break the request path


def require_operator(
    request: Request,
    x_user_role: str = Header(default="VIEWER"),
    settings: Settings = Depends(get_settings),
) -> str:
    """
    Gate for operator-only analytics endpoints.

    NOTE (demo scope): authorization uses the X-User-Role header, which is
    client-controlled and suitable only for the hackathon demo. Production
    deployments must replace this with verified authentication (e.g. JWT/OIDC
    validated server-side). All decisions are written to system_audit_logs.
    """
    role = (x_user_role or "VIEWER").upper()
    path = request.url.path
    if role not in OPERATOR_ROLES:
        _audit_operator_access(settings.database_path, role, "OPERATOR_ACCESS_DENIED", path)
        raise HTTPException(
            status_code=403,
            detail=f"Role '{role}' is not authorized to access operator analytics. Required: {sorted(OPERATOR_ROLES)}.",
        )
    _audit_operator_access(settings.database_path, role, "OPERATOR_ACCESS_GRANTED", path)
    return role


# --- Warehouse ---

@ops_router.get("/warehouse/overview")
def warehouse_overview(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Warehouse capacity summary by zone (deterministic from storage_locations)."""
    return get_warehouse_overview(settings.database_path)


@ops_router.get("/warehouse/locations")
def warehouse_locations(
    material_id: str | None = Query(default=None),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """All storage bins, optionally filtered to one material."""
    return {"locations": get_storage_locations(settings.database_path, material_id)}


@ops_router.get("/warehouse/materials/{material_ref}/location")
def material_location(material_ref: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Storage bins holding a material (by material id or SKU)."""
    result = get_material_location(settings.database_path, material_ref)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Material '{material_ref}' not found.")
    return result


# --- Suppliers ---

@ops_router.get("/suppliers")
def suppliers_list(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Supplier performance computed from recorded delivery history."""
    return {"suppliers": get_supplier_performance(settings.database_path)}


@ops_router.get("/suppliers/compare")
def suppliers_compare(
    a: str = Query(...),
    b: str = Query(...),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Side-by-side delivery performance for two suppliers."""
    result = compare_suppliers(settings.database_path, a, b)
    if result is None:
        raise HTTPException(status_code=404, detail="One or both suppliers not found.")
    return result


@ops_router.get("/suppliers/{supplier_ref}")
def supplier_detail(supplier_ref: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Supplier profile, performance stats, and recent delivery history."""
    result = get_supplier_detail(settings.database_path, supplier_ref)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Supplier '{supplier_ref}' not found.")
    return result


# --- Order timeline ---

@ops_router.get("/orders/{order_id}/timeline")
def order_timeline(order_id: str, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Evidence-based fulfilment timeline for a single order."""
    result = get_order_timeline(settings.database_path, order_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Order '{order_id}' not found.")
    return result


# --- Operator audit trail ---

@ops_router.get("/operator/audit-logs")
def operator_audit_logs(
    limit: int = Query(default=50, le=200),
    _role: str = Depends(require_operator),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Recent operator-area access and approval audit records (operator only)."""
    with get_connection(settings.database_path) as conn:
        rows = conn.execute(
            "SELECT * FROM system_audit_logs ORDER BY created_at DESC LIMIT ?;", (limit,)
        ).fetchall()
    return {"logs": [dict(r) for r in rows]}


# --- Conversational ops query (contextual chat cards) ---

class OpsQueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    context: Optional[dict[str, Any]] = None


_CARD_TYPES = Literal[
    "inventory_summary",
    "shortages",
    "material_detail",
    "warehouse",
    "material_location",
    "suppliers",
    "supplier_compare",
    "order_risks",
    "order_detail",
    "purchase_orders",
    "deliveries",
    "message_draft",
    "help",
]


def _first_match(text: str, patterns: list[str]) -> bool:
    return any(p in text for p in patterns)


# --- Communication / messaging intents (draft-only; no provider connected) ---

_COMMS_PATTERNS = [
    "message", "remind", "notify", "notification", "email",
    "text ", "payment reminder", "deadline reminder", "follow up", "follow-up",
]
_FOLLOWUP_PATTERNS = [
    "more polite", "politer", "formal", "shorter", "longer", "friendlier",
    "send it", "send now", "send tomorrow", "schedule", "make it",
]


def _extract_recipient(question: str) -> Optional[str]:
    """Best-effort recipient extraction from a communication request."""
    import re
    m = re.search(
        r"(?:[Mm]essage|[Mm]sg|[Rr]emind|[Nn]otify|[Ee]mail|[Tt]ext|[Pp]ing|[Cc]all)\s+(?:to\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)",
        question,
    )
    if m:
        return m.group(1).strip()
    m = re.search(r"\bto\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\b", question)
    if m:
        return m.group(1).strip()
    return None


def _extract_message_body(question: str) -> str:
    """Extract the message content after 'that' or the recipient phrase."""
    import re
    m = re.search(r"\bthat\b(.+)$", question, flags=re.IGNORECASE | re.DOTALL)
    if m:
        return m.group(1).strip().rstrip("?.!")
    m = re.search(
        r"(?:remind|message|notify|email|text)\s+(?:a\s+|an\s+|the\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)?\s*(?:to\s+)?(.+)$",
        question,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if m:
        return m.group(2).strip().rstrip("?.!")
    # "Send a payment reminder to Ravi." → body is the clause before "to Ravi"
    m = re.search(r"^(?:send|message|remind|notify|email|text)\s+(.+?)\s+to\s+[A-Z]", question, flags=re.IGNORECASE)
    if m:
        return re.sub(r"^(?:a|an|the)\s+", "", m.group(1).strip()).rstrip("?.!")
    return question.strip()


def _build_draft(recipient: str, body: str, tone: str = "standard") -> dict[str, Any]:
    """Deterministic message draft. Never claims delivery — draft only."""
    body_clean = body.strip().rstrip(".")
    if tone == "polite":
        greeting = f"Dear {recipient},"
        closing = "Thank you for your prompt attention.\n\nBest regards,\nResolveX Operations"
        middle = f"I hope this message finds you well. {body_clean[:1].upper() + body_clean[1:]}. Please let me know if you need anything else."
    elif tone == "formal":
        greeting = f"Dear {recipient},"
        closing = "Sincerely,\nResolveX Operations"
        middle = f"This is to inform you that {body_clean[0].lower() + body_clean[1:]}. We request your kind attention at the earliest convenience."
    elif tone == "short":
        greeting = f"Hi {recipient},"
        closing = "Thanks,\nResolveX"
        middle = f"{body_clean[0].upper() + body_clean[1:]}."
    else:
        greeting = f"Hi {recipient},"
        closing = "Regards,\nResolveX"
        middle = f"{body_clean[0].upper() + body_clean[1:]}."
    return {
        "recipient": recipient,
        "subject": "Payment reminder" if "pay" in body_clean.lower() else "Message from ResolveX",
        "body": f"{greeting}\n\n{middle}\n\n{closing}",
        "tone": tone,
        "delivery_status": "DRAFT_ONLY",
        "delivery_note": "No messaging provider is connected. This message has been drafted only and has NOT been sent.",
    }


def _message_draft_card(question: str, context: Optional[dict[str, Any]], settings: Settings) -> dict[str, Any]:
    """Handle communication requests and follow-up edits via structured NLU."""
    from app.core.communication_parser import parse_communication

    last = (context or {}).get("last_message_draft") if context else None
    ql = question.lower()

    # Follow-up edit of an existing draft (tone, send request, pronoun message, name change)
    if last and (_first_match(ql, _FOLLOWUP_PATTERNS) or _first_match(ql, ["tell ", "say ", "change his name", "change her name", "change the name", "his name", "her name"])):
        # "Change his/her name to X" — update recipient only
        name_change = __import__("re").search(r"change (?:his|her|the|recipient'?s?) name to ([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)", question)
        if name_change:
            new_name = name_change.group(1).strip()
            draft = dict(last)
            draft["recipient"] = new_name
            draft["recipient_confirmed"] = len(new_name.split()) > 1
            draft["delivery_status"] = "DRAFT_ONLY"
            return {
                "card_type": "message_draft",
                "title": f"Message Draft — {new_name}",
                "summary": f"Recipient updated to {new_name}. Still a draft — nothing has been sent.",
                "data": draft,
            }
        tone = "standard"
        if _first_match(ql, ["polite", "politer", "formal", "friendly"]):
            tone = "polite" if "formal" not in ql else "formal"
        elif _first_match(ql, ["shorter", "brief"]):
            tone = "short"
        elif _first_match(ql, ["longer", "detail"]):
            tone = "standard"
        # New message content via pronoun ("Tell him I will share the notes")
        new_body = None
        if _first_match(ql, ["tell ", "say "]) and not _first_match(ql, ["make", "change", "send"]):
            import re as _re
            m = _re.search(r"(?:tell|say)\s+(?:him|her|them|he|she|they|it|[A-Z][a-zA-Z]+)?\s*(?:that)?\s*(.+)$", question, flags=_re.IGNORECASE)
            if m:
                new_body = m.group(1).strip().rstrip("?.!")
        body = new_body or last.get("raw_body") or last.get("body", "")
        recipient = last.get("recipient", "there")
        draft = _build_draft(recipient, body, tone)
        draft["raw_body"] = body
        note = "Draft updated. Still not sent — no messaging provider is connected."
        if _first_match(ql, ["send it", "send now", "send tomorrow", "schedule"]):
            note += " Sending requires a connected messaging provider; the draft is ready when one is configured."
        return {
            "card_type": "message_draft",
            "title": f"Message Draft — {recipient}",
            "summary": note,
            "data": draft,
        }

    # New communication request — structured NLU (Gemini + deterministic fallback).
    # Genuinely ambiguous intents (no identifiable recipient, unnamed possessive
    # recipient) fall through to the main clarification pipeline via "help".
    intent = parse_communication(question, context, use_gemini=True)

    if intent.requires_clarification and not intent.recipient_name:
        return {
            "card_type": "message_draft",
            "title": "Clarification needed",
            "summary": intent.clarification_question or "Who should I send this to?",
            "data": {"requires_clarification": True, "delivery_status": "NONE"},
        }

    recipient = intent.recipient_name or "there"
    body = intent.message or question
    draft = _build_draft(recipient, body)
    if intent.subject:
        draft["subject"] = intent.subject
    draft["raw_body"] = body
    draft["recipient_confirmed"] = not intent.requires_recipient_confirmation
    draft["relationship"] = intent.relationship
    draft["action"] = intent.action

    if intent.requires_recipient_confirmation:
        summary = (
            f"I've drafted a message for {recipient}"
            + (f" ({intent.relationship})" if intent.relationship else "")
            + ". Please confirm the recipient details. The message has NOT been sent — "
            "no messaging provider is connected yet."
        )
    else:
        summary = (
            f"Message drafted for {recipient}"
            + (f" ({intent.relationship})" if intent.relationship else "")
            + ". It has NOT been sent — no messaging provider is connected. "
            "You can ask me to make it more polite or adjust it."
        )
    return {
        "card_type": "message_draft",
        "title": f"Message Draft — {recipient}",
        "summary": summary,
        "data": draft,
    }


@ops_router.post("/ops/query")
def ops_query(body: OpsQueryRequest, settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """
    Deterministically route a business question to the right verified dataset
    and return a typed card payload for the conversational UI.
    """
    q = body.question.lower()
    db = settings.database_path

    # Follow-up edits to a previous message draft take priority — e.g.
    # "make it more polite" or "send it tomorrow" contain no comms keywords.
    last_draft = (body.context or {}).get("last_message_draft") if body.context else None
    q_start = q.lstrip()
    if last_draft and (
        _first_match(q, _FOLLOWUP_PATTERNS)
        or _first_match(q_start, ["tell ", "say ", "him ", "her ", "them ", "message him", "message her", "email him", "email her"])
        or _first_match(q, ["change his name", "change her name", "change the name", "his name", "her name"])
    ):
        return _message_draft_card(body.question, body.context, settings)

    # Communication / messaging intents first — they may contain business words
    # like "stock" or "payment" that must not trigger inventory routing.
    if _first_match(q, _COMMS_PATTERNS) or (
        "send" in q and _first_match(q, ["reminder", "message", "note", "email", "text"])
    ):
        return _message_draft_card(body.question, body.context, settings)

    # Supplier comparison first ("compare X and Y", "which supplier")
    if _first_match(q, ["compare", " vs ", " versus "]) and ("supplier" in q or "deliver" in q):
        names = [w for w in q.replace("compare", " ").replace("supplier", " ").split() if len(w) > 2]
        suppliers = get_supplier_performance(db)
        if len(names) >= 2:
            # fuzzy match supplier names
            def _find(token: str) -> Optional[str]:
                for s in suppliers:
                    if token in s["supplier_name"].lower() or token in s["supplier_id"].lower():
                        return s["supplier_id"]
                return None
            a_id, b_id = _find(names[0]), _find(names[-1])
            if a_id and b_id and a_id != b_id:
                return {"card_type": "supplier_compare", "title": "Supplier Comparison", "data": compare_suppliers(db, a_id, b_id)}
        return {"card_type": "suppliers", "title": "Supplier Performance", "data": {"suppliers": suppliers}}

    if _first_match(q, ["supplier", "vendor", "delivery history", "on-time", "on time", "reliable", "late delivery"]):
        if _first_match(q, ["which", "best", "most reliable", "compare", "who"]):
            ranked = sorted(
                get_supplier_performance(db),
                key=lambda s: (s["on_time_rate"] if s["on_time_rate"] is not None else -1),
                reverse=True,
            )
            return {
                "card_type": "suppliers",
                "title": "Supplier Reliability Ranking",
                "summary": (
                    f"{ranked[0]['supplier_name']} has the best on-time rate "
                    f"({ranked[0]['on_time_rate']}%) across {ranked[0]['total_deliveries']} recorded deliveries."
                    if ranked and ranked[0]["on_time_rate"] is not None else "Insufficient delivery history to rank suppliers."
                ),
                "data": {"suppliers": ranked},
            }
        return {"card_type": "suppliers", "title": "Supplier Performance", "data": {"suppliers": get_supplier_performance(db)}}

    # Warehouse / storage questions
    if _first_match(q, ["warehouse", "storage", "space", "zone", "rack", "shelf", "bin", "where is", "where are", "located", "stored"]):
        # material-specific location?
        material_ref = None
        for tok in q.replace("?", " ").replace(".", " ").split():
            t = tok.strip(",")
            if t.upper().startswith("MAT-") or t.upper().startswith("SKU-"):
                material_ref = t.upper()
                break
        if material_ref:
            loc = get_material_location(db, material_ref)
            if loc:
                return {
                    "card_type": "material_location",
                    "title": f"Storage Location — {loc['material']['name']}",
                    "summary": (
                        f"{loc['material']['name']} is stored in {len(loc['locations'])} bin(s): "
                        + ", ".join(
                            f"{b['zone_code']} / {b['rack_code']} / {b['shelf_code']} ({b['stored_qty']:g} {loc['material']['unit']} stored)"
                            for b in loc["locations"]
                        )
                        + "."
                    ),
                    "data": loc,
                }
        if _first_match(q, ["where", "stored", "located", "find"]):
            return {"card_type": "warehouse", "title": "Warehouse Storage Map", "data": {"locations": get_storage_locations(db), "overview": get_warehouse_overview(db)}}
        return {"card_type": "warehouse", "title": "Warehouse Capacity", "data": get_warehouse_overview(db)}

    # Order-specific question ("explain why ORD-1002 is delayed")
    order_ref = None
    for tok in q.replace("?", " ").replace(".", " ").split():
        t = tok.strip(",")
        if t.upper().startswith("ORD-"):
            order_ref = t.upper()
            break
    if order_ref:
        tl = get_order_timeline(db, order_ref)
        if tl:
            return {"card_type": "order_detail", "title": f"Order {order_ref} — Fulfilment Timeline", "data": tl}

    # Purchase orders / procurement (checked before generic "order" keywords)
    if _first_match(q, ["purchase order", " po ", "procurement", "reorder", "order materials", "missing materials", "create", "generate"]):
        proposals = list_proposals(db)
        shortages = detect_shortages(db)
        return {
            "card_type": "purchase_orders",
            "title": "Procurement Status",
            "summary": f"{len(shortages)} material shortage(s); {sum(1 for p in proposals if p.status == 'PENDING_APPROVAL')} proposal(s) awaiting approval.",
            "data": {"shortages": shortages, "proposals": [p.model_dump() for p in proposals]},
        }

    # Expected / incoming deliveries
    if _first_match(q, ["expected", "incoming delivery", "deliveries", "arrival", "shipment arriving"]):
        with get_connection(db) as conn:
            rows = conn.execute(
                """
                SELECT d.delivery_ref, d.quantity, d.expected_date, d.status, d.delay_days,
                       m.name AS material_name, m.sku AS material_sku, s.name AS supplier_name
                FROM supplier_deliveries d
                JOIN materials m ON m.id = d.material_id
                JOIN suppliers s ON s.id = d.supplier_id
                WHERE d.status IN ('PENDING','IN_TRANSIT')
                ORDER BY d.expected_date ASC LIMIT 25;
                """
            ).fetchall()
        deliveries = [dict(r) for r in rows]
        return {
            "card_type": "deliveries",
            "title": "Expected Deliveries",
            "summary": (
                f"{len(deliveries)} inbound delivery(ies) recorded, next expected {deliveries[0]['expected_date']}"
                if deliveries else "No pending inbound deliveries are recorded."
            ),
            "data": {"deliveries": deliveries},
        }

    # Shortages / low stock
    if _first_match(q, ["shortage", "running low", "low stock", "out of stock", "which products", "reorder point"]):
        shortages = detect_shortages(db)
        return {
            "card_type": "shortages",
            "title": "Stock Shortages",
            "summary": f"{len(shortages)} material(s) are below their reorder threshold or fully out of stock.",
            "data": shortages,
        }

    if _first_match(q, ["order", "delay", "deliver", "dispatch", "shipment", "crd", "late", "pending order"]):
        risks = []
        from app.inventory.order_risk_engine import evaluate_order_risks
        risks = evaluate_order_risks(db)
        return {
            "card_type": "order_risks",
            "title": "Order Delivery Risk",
            "summary": (
                f"{sum(1 for r in risks if str(r.risk_category) != 'ON_TRACK')} of {len(risks)} open orders have delivery risk."
            ),
            "data": {"orders": [r.model_dump() for r in risks]},
        }

    # Stock / inventory
    if _first_match(q, ["stock", "inventory", "available", "quantity", "how much", "overview"]):
        from app.inventory.availability_calculator import get_inventory_overview
        ov = get_inventory_overview(db)
        return {
            "card_type": "inventory_summary",
            "title": "Inventory Summary",
            "summary": (
                f"{ov.total_materials} products tracked: {ov.low_stock_count} low-stock, "
                f"{ov.out_of_stock_count} out-of-stock."
            ),
            "data": ov.model_dump(),
        }

    return {
        "card_type": "help",
        "title": "How can I help?",
        "summary": "I can check stock levels, storage locations, supplier reliability, order risks, and purchase orders.",
        "data": {},
    }
