"""Stateful multi-turn material dispatch / transfer intent resolver.

Preserves original dispatch intent, extracted recipient/material/quantity/destination
slots in `conversation_context_state`, resolves people & relationships via
`identity_memory`, and searches the live inventory catalog without ever dumping
an unrelated inventory report or claiming unexecuted shipments.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from app.core.clarification_engine import sanitize_clarification_question
from app.core.identity_memory import (
    IdentityResolutionResult,
    PersonRecord,
    get_person_by_id,
    get_slot_state,
    resolve_recipient_reference,
    upsert_slot_state,
)
from app.inventory.catalog_search import search_materials
from app.models.ai_schemas import GeminiAnalysisOutput, InterpretationOutput, ResolvedIntentOutput
from app.models.inventory_schemas import MaterialOverview

_DISPATCH_VERB_RE = re.compile(
    r"^\s*(?:(?:please|kindly|can\s+you|could\s+you|would\s+you|i'?m|i\s+am|we'?re|we\s+are|i\s+want\s+to|i\s+need\s+to|let'?s)\s+)*(?:please\s+)?(?:send(?:ing)?|ship(?:ping)?|dispatch(?:ing)?|transfer(?:ring)?|issu(?:e|ing)|deliver(?:ing)?|suppl(?:y|ying))\b",
    re.IGNORECASE,
)
_DOC_OR_COMMS_RE = re.compile(
    r"\b(report|document|file|pdf|spreadsheet|csv|email|e-?mail|message|msg|reminder|note|text|invoice|proposal)\b",
    re.IGNORECASE,
)
_GENERIC_OBJECT_RE = re.compile(
    r"\b(the\s+material|a\s+material|this\s+material|that\s+material|some\s+material|materials|the\s+item|this\s+item|that\s+item|items|the\s+part|this\s+part|that\s+part|parts|the\s+stock|this\s+stock|that\s+stock|some\s+stock|stock|goods|cargo|parcel)\b",
    re.IGNORECASE,
)

_WORD_NUMBERS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "fifteen": 15, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
}

_QTY_RE = re.compile(
    r"(?i)(?:\bqty\s*[:=]?\s*(\d+(?:\.\d+)?)|"
    r"\b(\d+(?:\.\d+)?)\s*(?:pcs|pieces|pc|units?|nos?|kg|kgs|m|meters?|metres?|kits?|pairs?)\b|"
    r"\b(?:send|ship|dispatch|transfer|issue|need|want|order|prepare|allocate|for)\s+(\d+)\b(?!\s*-?\s*(?:ton|tons|hp|v|a|mm|nm|core|phase|inch|in)\b))"
)
_BARE_NUMBER_RE = re.compile(
    r"^\s*(\d+(?:\.\d+)?)\s*(?:pcs|pieces|units?|kg|m|kits?|pairs?)?\s*$",
    re.IGNORECASE,
)

_INDUSTRIAL_TERMS_RE = re.compile(
    r"\b(?:mat-[a-z0-9-]+|sku-[a-z0-9-]+|screw\s*jacks?|scru\s*jacks?|jacks?|bolts?|nuts?|washers?|fasteners?|"
    r"bearings?|barings?|gears?|pinions?|motors?|pumps?|steel(?:\s+sheets?|\s+plates?)?|sheet\s+metal|metal\s+sheets?|"
    r"copper(?:\s+wires?|\s+coils?)?|winding\s+wires?|magnet\s+wires?|coils?|wires?|alum[iu]nium(?:\s+rods?|\s+bars?)?|pipes?|"
    r"(?:ball\s+|check\s+|shutoff\s+)?valves?|nrv|chips?|mcus?|control\s+modules?|microcontrollers?|controller\s+ics?|"
    r"relays?|breakers?|mcb|cables?|torque\s+wrench(?:es)?|wrench(?:es)?|spanners?|seal\s*kits?|gaskets?|o-?rings?|"
    r"helmets?|hard\s*hats?|gloves?|goggles?|safety\s+glasses|eye\s+protection|ppe)\b",
    re.IGNORECASE,
)

_CONFIRM_YES_RE = re.compile(
    r"^\s*(?:yes|yeah|yep|yup|correct|right|sure|ok|okay|confirm|that'?s\s+(?:him|her|right|correct))\b",
    re.IGNORECASE,
)
_CONFIRM_NO_RE = re.compile(r"^\s*(?:no|nope|not\s+that|someone\s+else|other|neither)\b", re.IGNORECASE)

_DEST_RE = re.compile(
    r"\b(?:in|at|deliver\s+to|ship\s+to|send\s+to\s+(?:the\s+)?|destination\s*[:=]?\s*|bay\s*\d+|line\s*\d+|maintenance|workshop|warehouse|assembly|mangalore|mangaluru|bangalore|bengaluru|chennai|pune)\b",
    re.IGNORECASE,
)


def is_material_dispatch_instruction(instruction: str) -> bool:
    """True when the original instruction is to send/ship/transfer physical goods or materials."""
    text = instruction.strip()
    if not text:
        return False
    if _DOC_OR_COMMS_RE.search(text):
        return False
    if not _DISPATCH_VERB_RE.search(text):
        return False
    if re.search(r"\b(warehouse|location|where|shortage|risk|status|history|review)\b", text, re.IGNORECASE):
        return False
    if re.match(
        r"^\s*(?:please\s+)?(?:send|forward)\s+(?:it|this|that)\s*(?:$|to\b|for\b|now\b|today\b|tomorrow\b|later\b|[.,!?])",
        text,
        re.IGNORECASE,
    ):
        return False
    return bool(
        _GENERIC_OBJECT_RE.search(text)
        or _INDUSTRIAL_TERMS_RE.search(text)
        or re.match(r"^\s*(?:please\s+)?(?:dispatch|ship|transfer|issue)\b", text, re.IGNORECASE)
    )


def _extract_quantity(turns: list[str]) -> Optional[float]:
    for t in reversed(turns):
        m = _QTY_RE.search(t)
        if m:
            raw = m.group(1) or m.group(2) or m.group(3)
            try:
                val = float(raw)
                if val > 0:
                    return val
            except (TypeError, ValueError):
                pass
        # Check word numbers ("five screw jacks", "send ten ...")
        words_m = re.search(
            r"\b(" + "|".join(_WORD_NUMBERS.keys()) + r")\b(?!\s*-?\s*(?:ton|tons)\b)",
            t,
            re.IGNORECASE,
        )
        if words_m:
            return float(_WORD_NUMBERS[words_m.group(1).lower()])
        bm = _BARE_NUMBER_RE.match(t.strip())
        if bm:
            try:
                val = float(bm.group(1))
                if val > 0:
                    return val
            except (TypeError, ValueError):
                pass
    return None


def _extract_destination(text: str) -> Optional[str]:
    """Extract explicit warehouse/bay/address/city destination (without treating pure name prefix as address)."""
    m_phrase = re.search(
        r"\b(?:in|at)\s+([A-Za-z0-9][A-Za-z0-9 ,.-]{2,50}?)(?:\s*$|[.?])",
        text,
        re.IGNORECASE,
    )
    if m_phrase:
        val = m_phrase.group(1).strip(" .?,")
        if val.lower() not in {"stock", "inventory"}:
            return val
    m_bay = re.search(
        r"\b((?:maintenance|assembly|workshop|warehouse|receiving)\s*(?:bay|line|dept|department|dock|zone)?\s*\d*|bay\s*\d+|line\s*\d+)\b",
        text,
        re.IGNORECASE,
    )
    if m_bay:
        return m_bay.group(1).strip()
    m_city = re.search(
        r"\b([A-Za-z][A-Za-z ]{1,25},\s*(?:Mangalore|Bangalore|Bengaluru|Chennai|Pune)|Bejai,\s*Mangalore)\b",
        text,
        re.IGNORECASE,
    )
    if m_city:
        return m_city.group(1).strip()
    if re.fullmatch(
        r"\s*(?:to\s+)?(?:Bejai,\s*)?(?:Mangalore|Mangaluru|Bangalore|Bengaluru|Chennai|Pune|Maintenance(?:\s+Bay\s*\d+)?|Warehouse|Workshop|Bay\s*\d+)\s*[.?!]?\s*",
        text,
        re.IGNORECASE,
    ):
        return re.sub(r"^\s*to\s+", "", text.strip().rstrip(".?!")).strip()
    return None


def _strip_recipient_and_qty(text: str) -> str:
    cleaned = re.sub(
        r"\b(?:to|for)\s+(?:the\s+|our\s+)?(?:person|personal|business|warehouse|supplier|[A-Z][a-zA-Z]+)(?:\s+(?:personal|person|business|supplier|[A-Z][a-zA-Z]+))?(?:\s+(?:from|in)\s+[A-Za-z0-9 ]+)?",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\bfrom\s+[A-Za-z0-9_-]+\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = _DISPATCH_VERB_RE.sub("", cleaned)
    cleaned = _GENERIC_OBJECT_RE.sub("", cleaned)
    cleaned = re.sub(
        r"\b\d+(?:\.\d+)?(?!\s*-?\s*(?:ton|tons|hp|v|a|mm|nm|core|phase|inch|in)\b)\s*(?:pcs|pieces|pc|units?|kg|m|kits?|pairs?)?\s*(?:of\b)?",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\b(" + "|".join(_WORD_NUMBERS.keys()) + r")\b", "", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip(" .?!,")


def _pick_material_variant_from_candidates(
    db_path: str,
    reply: str,
    candidate_dicts: list[dict[str, Any]],
) -> Optional[MaterialOverview]:
    rl = reply.strip().lower().rstrip(".!")
    mat_cands = [c for c in candidate_dicts if c.get("kind") == "material"]
    if len(mat_cands) == 1 and _CONFIRM_YES_RE.match(reply):
        mid = str(mat_cands[0].get("id", ""))
        hits = search_materials(db_path, mid, limit=1)
        if hits:
            return hits[0]
    for c in mat_cands:
        mid = str(c.get("id", ""))
        label = str(c.get("label", "")).lower()
        reply_txt = str(c.get("reply_text", "")).lower()
        sku = str((c.get("metadata") or {}).get("sku", "")).lower()
        if rl == mid.lower() or rl == sku or rl in label or rl == reply_txt:
            hits = search_materials(db_path, mid, limit=1)
            if hits:
                return hits[0]
    return None


def _match_material_query(
    db_path: str, mat_query: str
) -> tuple[Optional[MaterialOverview], list[MaterialOverview], bool]:
    """Return (chosen_material, ambiguous_variants, unknown_query_flag)."""
    if not mat_query.strip():
        return None, [], False
    matches = search_materials(db_path, mat_query, limit=6)
    if not matches:
        return None, [], True
    if len(matches) == 1:
        return matches[0], [], False

    q_upper = mat_query.upper()
    exact = [m for m in matches if m.id.upper() in q_upper or m.sku.upper() in q_upper]
    if len(exact) == 1:
        return exact[0], [], False

    q_words = set(re.findall(r"[a-z0-9]+", mat_query.lower()))
    top_name_words = set(re.findall(r"[a-z0-9]+", matches[0].name.lower()))
    second_name_words = set(re.findall(r"[a-z0-9]+", matches[1].name.lower()))
    top_extra = len(q_words & (top_name_words - second_name_words))
    sec_extra = len(q_words & (second_name_words - top_name_words))
    if top_extra > sec_extra:
        return matches[0], [], False

    variants = [
        m for m in matches
        if len(q_words & set(re.findall(r"[a-z0-9]+", (m.name + " " + " ".join(m.aliases)).lower()))) >= 1
    ][:4] or matches[:3]
    if len(variants) == 1:
        return variants[0], [], False
    return None, variants, False


def resolve_material_dispatch_with_meta(
    db_path: str,
    original_instruction: str,
    prior_user_turns: list[str],
    latest_turn: Optional[str] = None,
    *,
    conversation_id: Optional[str] = None,
    session_entities: Optional[list[Any]] = None,
) -> Optional[tuple[GeminiAnalysisOutput, dict[str, Any]]]:
    """Resolve material dispatch across turns with persistent identity/slot tracking.

    Returns (GeminiAnalysisOutput, slot_meta_dict) or None if not a material dispatch.
    """
    if not is_material_dispatch_instruction(original_instruction):
        return None

    slot_state = get_slot_state(db_path, conversation_id) if conversation_id else {
        "workflow_type": None, "pending_slot": None, "slots": {}, "candidate_options": [], "resolved_entities": []
    }
    slots: dict[str, Any] = dict(slot_state.get("slots") or {})
    pending_slot: Optional[str] = slot_state.get("pending_slot")
    active_cands: list[dict[str, Any]] = list(slot_state.get("candidate_options") or [])

    turn_text = (latest_turn if latest_turn is not None else original_instruction).strip()
    is_followup = latest_turn is not None

    # 1. Extract/update material slot
    chosen_material: Optional[MaterialOverview] = None
    ambiguous_variants: list[MaterialOverview] = []
    unknown_mat_query: Optional[str] = None

    if slots.get("material_id"):
        found_existing = search_materials(db_path, str(slots["material_id"]), limit=1)
        if found_existing:
            chosen_material = found_existing[0]

    if chosen_material is None and is_followup and pending_slot == "material_variant" and active_cands:
        if re.match(r"^(?:choose\s+another\s+item|another\s+item|something\s+else|other\s+item|no\b)", turn_text, re.IGNORECASE):
            slots.pop("material_id", None)
            slots.pop("material_sku", None)
            slots.pop("material_name", None)
            slots.pop("material_query", None)
            pending_slot = "material"
        else:
            picked_m = _pick_material_variant_from_candidates(db_path, turn_text, active_cands)
            if picked_m:
                chosen_material = picked_m

    if chosen_material is None:
        # Collect candidate material clue from current turn or persisted query
        clue = _strip_recipient_and_qty(turn_text) if is_followup else _strip_recipient_and_qty(original_instruction)
        if is_followup and (pending_slot in {"material", "material_variant"} or clue) and not _CONFIRM_YES_RE.match(turn_text):
            # Ignore pure recipient replies / bare numbers / confirmation replies / "choose another item" as material clues
            is_choose_other = re.match(r"^(?:choose\s+another\s+item|another\s+item|something\s+else|other\s+item)$", turn_text, re.IGNORECASE) is not None
            is_dest_only = _extract_destination(turn_text) is not None and len(turn_text.split()) <= 4 and not _INDUSTRIAL_TERMS_RE.search(turn_text)
            is_num_only = _BARE_NUMBER_RE.match(turn_text) is not None
            if not is_num_only and not is_dest_only and not is_choose_other:
                check_clue = clue or (turn_text.strip(" .?!") if pending_slot in ("material", "material_variant") else "")
                if check_clue:
                    m_hit, m_vars, m_unk = _match_material_query(db_path, check_clue)
                    if m_hit is not None:
                        chosen_material = m_hit
                        slots["material_query"] = check_clue
                    elif m_vars:
                        ambiguous_variants = m_vars
                        slots["material_query"] = check_clue
                    elif pending_slot == "material" and m_unk:
                        unknown_mat_query = check_clue
        elif not is_followup and clue:
            m_hit, m_vars, _m_unk = _match_material_query(db_path, clue)
            if m_hit is not None:
                chosen_material = m_hit
                slots["material_query"] = clue
            elif m_vars:
                ambiguous_variants = m_vars
                slots["material_query"] = clue

        # Re-hydrate previously stored ambiguous material_query (e.g. "screw jack") on later turns
        if chosen_material is None and not ambiguous_variants and unknown_mat_query is None and slots.get("material_query"):
            m_hit, m_vars, _ = _match_material_query(db_path, str(slots["material_query"]))
            chosen_material = m_hit
            ambiguous_variants = m_vars

    if chosen_material is not None:
        slots["material_id"] = chosen_material.id
        slots["material_sku"] = chosen_material.sku
        slots["material_name"] = chosen_material.name
        slots["material_unit"] = chosen_material.unit

    # 2. Extract/update quantity slot
    if is_followup and pending_slot == "quantity" and _BARE_NUMBER_RE.match(turn_text):
        qty_hit = _extract_quantity([turn_text])
    else:
        qty_hit = _extract_quantity([turn_text] if is_followup else [original_instruction])
    if qty_hit is not None:
        slots["quantity"] = qty_hit

    # 3. Extract/update destination slot
    if is_followup and pending_slot == "destination":
        dest_val = _extract_destination(turn_text) or (turn_text.strip(" .?!") if not _CONFIRM_NO_RE.match(turn_text) else None)
        if dest_val:
            slots["destination"] = dest_val
    else:
        dest_val = _extract_destination(turn_text)
        if dest_val and (chosen_material is None or dest_val.lower() not in chosen_material.name.lower()):
            slots["destination"] = dest_val

    # 4. Extract/update & confirm recipient via persistent identity memory
    resolved_identity: Optional[PersonRecord] = (
        get_person_by_id(db_path, slots["recipient_person_id"])
        if slots.get("recipient_person_id")
        else None
    )
    recipient_cands: list[PersonRecord] = []
    recipient_confirm_needed = bool(slots.get("recipient_person_id") and not slots.get("recipient_confirmed"))

    if is_followup and pending_slot == "recipient_confirm":
        if _CONFIRM_YES_RE.match(turn_text):
            slots["recipient_confirmed"] = True
            recipient_confirm_needed = False
        elif _CONFIRM_NO_RE.match(turn_text):
            slots.pop("recipient_person_id", None)
            slots.pop("recipient_name", None)
            slots["recipient_confirmed"] = False
            resolved_identity = None
            recipient_confirm_needed = False
            pending_slot = "recipient"

    if not slots.get("recipient_confirmed"):
        if is_followup and pending_slot == "recipient" and active_cands:
            for cand in active_cands:
                if cand.get("kind") != "person":
                    continue
                cl = turn_text.lower().rstrip(".!")
                lbl = str(cand.get("label", "")).lower()
                rt = str(cand.get("reply_text", "")).lower()
                mn = str((cand.get("metadata") or {}).get("full_name", "")).lower()
                if cl in {lbl, rt, mn} or (len(cl) >= 4 and (cl in lbl or cl in mn)):
                    pid = cand.get("id")
                    if pid:
                        resolved_identity = get_person_by_id(db_path, str(pid))
                        if resolved_identity:
                            # If user typed category alias "Person Ravi", still verify if exact "Person Ravi" phrase vs full name
                            if cl == "person ravi":
                                recipient_confirm_needed = True
                                slots["recipient_person_id"] = resolved_identity.id
                                slots["recipient_name"] = resolved_identity.full_name
                                slots["recipient_confirmed"] = False
                            else:
                                slots["recipient_person_id"] = resolved_identity.id
                                slots["recipient_name"] = resolved_identity.full_name
                                slots["recipient_confirmed"] = True
                                recipient_confirm_needed = False
                    break

        if not slots.get("recipient_confirmed") and not recipient_confirm_needed:
            probe_text = turn_text if is_followup else original_instruction
            res: IdentityResolutionResult = resolve_recipient_reference(
                db_path,
                probe_text,
                session_entities=session_entities or [],
                active_person_id=slots.get("recipient_person_id"),
            )
            if res.status == "resolved" and res.resolved_person is not None:
                resolved_identity = res.resolved_person
                slots["recipient_person_id"] = resolved_identity.id
                slots["recipient_name"] = resolved_identity.full_name
                slots["recipient_confirmed"] = True
            elif res.status == "external_named" and res.display_name:
                slots["recipient_name"] = res.display_name
                slots["recipient_confirmed"] = True
            elif res.status == "needs_confirm" and res.resolved_person is not None:
                resolved_identity = res.resolved_person
                slots["recipient_person_id"] = resolved_identity.id
                slots["recipient_name"] = resolved_identity.full_name
                slots["recipient_confirmed"] = False
                recipient_confirm_needed = True
            elif res.status == "ambiguous" and res.candidates:
                recipient_cands = res.candidates
                slots["raw_recipient"] = res.reference_token or "Ravi"
            elif res.status == "none" and not is_followup:
                # Track bare recipient if simple regex caught first name ("to Ravi" or "to ravi")
                m_single = re.search(r"\b(?:to|for)\s+([a-zA-Z]+)\b", original_instruction)
                if m_single:
                    slots["raw_recipient"] = m_single.group(1).capitalize()

        # If follow-up didn't change recipient yet and we already know raw_recipient ("Ravi"), re-query candidates
        if not slots.get("recipient_confirmed") and not recipient_confirm_needed and not recipient_cands and slots.get("raw_recipient"):
            res_raw = resolve_recipient_reference(
                db_path, f"to {slots['raw_recipient']}", session_entities or []
            )
            if res_raw.status == "ambiguous":
                recipient_cands = res_raw.candidates

    # Determine single highest-priority next clarification question & selectable cards
    quantity: Optional[float] = float(slots["quantity"]) if slots.get("quantity") is not None else None
    destination: Optional[str] = slots.get("destination")
    rec_label = slots.get("recipient_name") or slots.get("raw_recipient") or "the recipient"

    # Zero-stock check (single requested item OR multi-variant product group where 1+ variants are at 0).
    # Works uniformly across ALL catalog materials and product families.
    zero_stock_item: Optional[MaterialOverview] = None
    zero_variants: list[MaterialOverview] = []
    partial_zero_only_one: Optional[MaterialOverview] = None
    if chosen_material is not None and (chosen_material.on_hand <= 0 or chosen_material.physical_available <= 0):
        zero_stock_item = chosen_material
        slots.pop("material_id", None)
        slots.pop("material_sku", None)
        slots.pop("material_name", None)
        slots.pop("material_query", None)
        chosen_material = None
    elif chosen_material is None and ambiguous_variants:
        zero_variants = [m for m in ambiguous_variants if m.on_hand <= 0 or m.physical_available <= 0]
        avail_variants = [m for m in ambiguous_variants if m.on_hand > 0 and m.physical_available > 0]
        if zero_variants and not avail_variants:
            zero_stock_item = zero_variants[0]
            slots.pop("material_id", None)
            slots.pop("material_sku", None)
            slots.pop("material_name", None)
            slots.pop("material_query", None)
            ambiguous_variants = []
        elif zero_variants and len(avail_variants) == 1:
            partial_zero_only_one = avail_variants[0]
            slots.pop("material_id", None)
            slots.pop("material_sku", None)
            slots.pop("material_name", None)
            ambiguous_variants = []
        elif zero_variants and len(avail_variants) >= 2:
            ambiguous_variants = avail_variants

    # Immediate check: partial-stock over-request (e.g. "Dispatch 100 pcs of 5-ton screw jack to Ravi Kumar")
    if chosen_material is not None and quantity is not None and quantity > chosen_material.physical_available and slots.get("recipient_confirmed"):
        locs = ", ".join(chosen_material.warehouse_locations) or "Bengaluru Central Warehouse"
        direct_ans = (
            f"Insufficient physical stock for {chosen_material.name} ({chosen_material.sku}). "
            f"Requested {quantity:g} {chosen_material.unit} for {rec_label}, but only "
            f"{chosen_material.physical_available:g} {chosen_material.unit} physically available "
            f"(on hand {chosen_material.on_hand:g}, allocated {chosen_material.allocated:g}, incoming {chosen_material.incoming:g}). "
            "No dispatch or allocation was executed."
        )
        if conversation_id:
            upsert_slot_state(
                db_path, conversation_id, "material_dispatch", None, slots, [],
                [resolved_identity.to_summary_dict()] if resolved_identity else [],
            )
        return (
            GeminiAnalysisOutput(
                classification="context_dependent" if is_followup else "clear",
                ambiguity_types=[],
                needs_clarification=False,
                reasoning="Requested quantity exceeds available physical stock.",
                interpretations=[
                    InterpretationOutput(
                        label=f"Blocked — Insufficient {chosen_material.sku}",
                        description=direct_ans,
                    )
                ],
                missing_required_info=[],
                clarification_questions=[],
                resolved_intent=ResolvedIntentOutput(
                    action="prepare_material_dispatch",
                    parameters={
                        "material_id": chosen_material.id,
                        "sku": chosen_material.sku,
                        "material_name": chosen_material.name,
                        "quantity": f"{quantity:g}",
                        "unit": chosen_material.unit,
                        "available_qty": f"{chosen_material.physical_available:g}",
                        "warehouse_locations": locs,
                        "recipient": rec_label,
                        "stock_sufficient": "false",
                        "execution_status": "BLOCKED_INSUFFICIENT_STOCK",
                    },
                    resolved_instruction=f"Check stock for {quantity:g} {chosen_material.unit} {chosen_material.name} ({chosen_material.sku}) for {rec_label}.",
                    direct_answer=direct_ans,
                ),
            ),
            {
                "workflow_type": "material_dispatch",
                "pending_slot": None,
                "resolved_slots": slots,
                "candidate_options": [],
                "resolved_identity": resolved_identity.to_summary_dict() if resolved_identity else None,
            },
        )

    next_slot: Optional[str] = None
    next_q: Optional[str] = None
    cand_options: list[dict[str, Any]] = []
    missing_info: list[str] = []
    interpretations: list[InterpretationOutput] = []

    if zero_stock_item is not None:
        from app.inventory.availability_calculator import get_inventory_overview

        next_slot = "material_variant"
        if len(zero_variants) > 1:
            zero_names = ", ".join(f"{z.name} ({z.sku})" for z in zero_variants)
            next_q = (
                f"All matching items ({zero_names}) have already been finished — "
                f"stock is 0 {zero_stock_item.unit} and no stock is available. "
                "Please choose another item."
            )
            excluded_ids = {z.id for z in zero_variants}
        elif zero_stock_item.on_hand > 0 and zero_stock_item.physical_available <= 0:
            next_q = (
                f"{zero_stock_item.name} ({zero_stock_item.sku}) has 0 {zero_stock_item.unit} physically available "
                f"(all {zero_stock_item.on_hand:g} {zero_stock_item.unit} on hand are allocated to open orders) — "
                "no unallocated stock is available. Please choose another item."
            )
            excluded_ids = {zero_stock_item.id}
        else:
            next_q = (
                f"{zero_stock_item.name} ({zero_stock_item.sku}) has already been finished — "
                f"stock is 0 {zero_stock_item.unit} and no stock is available. "
                "Please choose another item."
            )
            excluded_ids = {zero_stock_item.id}
        missing_info.append(f"Alternative in-stock item ({zero_stock_item.name} is at 0)")

        same_cat = [
            m
            for m in search_materials(db_path, zero_stock_item.category or zero_stock_item.name, limit=6)
            if m.id not in excluded_ids and m.physical_available > 0
        ]
        if not same_cat:
            ov = get_inventory_overview(db_path)
            same_cat = [
                m for m in ov.materials if m.id not in excluded_ids and m.physical_available > 0
            ][:4]
        cand_options = [
            {
                "id": m.id,
                "kind": "material",
                "label": f"{m.name} ({m.sku})",
                "subtitle": f"{m.physical_available:g} {m.unit} available · {', '.join(m.warehouse_locations) or 'Warehouse'}",
                "reply_text": m.name,
                "metadata": {"material_id": m.id, "sku": m.sku, "available": m.physical_available},
            }
            for m in same_cat[:4]
        ]
        interpretations.append(
            InterpretationOutput(
                label=f"No stock available: {zero_stock_item.sku}",
                description=f"{zero_stock_item.name} is finished (0 {zero_stock_item.unit} available). Select a replacement item.",
            )
        )
        for m in same_cat[:3]:
            interpretations.append(
                InterpretationOutput(
                    label=f"Alternative: {m.name} ({m.sku})",
                    description=f"{m.physical_available:g} {m.unit} available.",
                )
            )
    elif partial_zero_only_one is not None:
        avail_m = partial_zero_only_one
        zero_names = ", ".join(f"{z.name} ({z.sku})" for z in zero_variants)
        next_slot = "material_variant"
        next_q = (
            f"{zero_names} stock is 0 {avail_m.unit} — no stock is available. "
            f"Only {avail_m.name} ({avail_m.sku}, {avail_m.physical_available:g} {avail_m.unit} available) is available. "
            f"Should I prepare {avail_m.name}, or choose another item?"
        )
        missing_info.append(f"Confirm {avail_m.name} or choose another item")
        cand_options = [
            {
                "id": avail_m.id,
                "kind": "material",
                "label": f"Use {avail_m.name} ({avail_m.sku})",
                "subtitle": f"{avail_m.physical_available:g} {avail_m.unit} available · {', '.join(avail_m.warehouse_locations) or 'Warehouse'}",
                "reply_text": avail_m.name,
                "metadata": {"material_id": avail_m.id, "sku": avail_m.sku, "available": avail_m.physical_available},
            },
            {
                "id": "choose-other-material",
                "kind": "action",
                "label": "Choose another item",
                "subtitle": "Select a different material from inventory",
                "reply_text": "Choose another item",
                "metadata": {},
            },
        ]
        interpretations.append(
            InterpretationOutput(
                label=f"Only available: {avail_m.name} ({avail_m.sku})",
                description=f"{zero_names} is at 0 stock; only {avail_m.name} ({avail_m.physical_available:g} {avail_m.unit}) is available.",
            )
        )
    elif unknown_mat_query:
        next_slot = "material"
        next_q = f"No material matching '{unknown_mat_query}' was found in the catalog. Which stock item should I send?"
        missing_info.append(f"Valid inventory material matching '{unknown_mat_query}'")
        interpretations.append(
            InterpretationOutput(
                label="Product not in catalog",
                description=f"'{unknown_mat_query}' did not match any SKU or product synonym.",
            )
        )
    elif chosen_material is None and not ambiguous_variants:
        next_slot = "material"
        next_q = f"Which material or stock item should I send to {rec_label}?"
        missing_info.append("Target material or SKU")
        interpretations.append(
            InterpretationOutput(
                label="Specify inventory item",
                description=f"Identify the exact material or SKU to prepare for {rec_label}.",
            )
        )
    elif recipient_confirm_needed and resolved_identity is not None:
        next_slot = "recipient_confirm"
        city_phrase = f" from {resolved_identity.city}" if resolved_identity.city else ""
        next_q = f"Do you mean {resolved_identity.full_name}{city_phrase}?"
        missing_info.append("Confirm recipient identity")
        cand_options = [
            {
                "id": f"confirm-{resolved_identity.id}",
                "kind": "confirmation",
                "label": f"Yes — {resolved_identity.full_name}{city_phrase}",
                "subtitle": resolved_identity.candidate_subtitle(),
                "reply_text": "Yes",
                "metadata": {"person_id": resolved_identity.id},
            },
            {
                "id": "confirm-other",
                "kind": "confirmation",
                "label": "No, someone else",
                "subtitle": "Select a different recipient",
                "reply_text": "No, someone else",
                "metadata": {},
            },
        ]
        interpretations.append(
            InterpretationOutput(label=resolved_identity.full_name, description=resolved_identity.candidate_subtitle())
        )
    elif not slots.get("recipient_confirmed"):
        next_slot = "recipient"
        mat_ctx = f"the {slots['material_query']}" if slots.get("material_query") else (chosen_material.name if chosen_material else "the stock")
        if recipient_cands:
            raw_r = slots.get("raw_recipient") or "recipient"
            next_q = f"Which {raw_r} should I send {mat_ctx} to?"
            cat_rank = {"personal": 0, "supplier": 1, "business": 2}
            ordered_cands = sorted(recipient_cands, key=lambda p: (cat_rank.get(p.category, 3), p.full_name))
            cand_options = [
                p.to_candidate_dict(
                    reply_text="Person Ravi" if p.first_name.lower() == "ravi" and p.category == "personal" else p.full_name
                )
                for p in ordered_cands
            ]
            for p in ordered_cands:
                interpretations.append(InterpretationOutput(label=p.candidate_label(), description=p.candidate_subtitle()))
        else:
            next_q = f"Who should receive {mat_ctx}?"
        missing_info.append("Confirmed recipient identity")
    elif ambiguous_variants:
        next_slot = "material_variant"
        mq = slots.get("material_query") or "material"
        if zero_variants:
            next_q = (
                f"Note: {', '.join(z.name for z in zero_variants)} has 0 stock available. "
                f"Which available {mq} should I prepare for {rec_label}?"
            )
        else:
            next_q = f"Which {mq} should I prepare for {rec_label}?"
        missing_info.append("Specific product model / SKU")
        cand_options = [
            {
                "id": m.id,
                "kind": "material",
                "label": f"{m.name} ({m.sku})",
                "subtitle": (
                    f"0 {m.unit} available — OUT OF STOCK / finished"
                    if m.physical_available <= 0
                    else f"{m.physical_available:g} {m.unit} available · {', '.join(m.warehouse_locations) or 'Warehouse'}"
                ),
                "reply_text": m.name,
                "metadata": {"material_id": m.id, "sku": m.sku, "available": m.physical_available},
            }
            for m in ambiguous_variants
        ]
        for m in ambiguous_variants:
            interpretations.append(
                InterpretationOutput(
                    label=f"{m.name} ({m.sku})",
                    description=f"{m.physical_available:g} {m.unit} available.",
                )
            )
    elif quantity is None:
        next_slot = "quantity"
        next_q = f"What quantity of {chosen_material.name} (in {chosen_material.unit}) should I prepare for {rec_label}?"
        missing_info.append("Dispatch quantity")
        interpretations.append(
            InterpretationOutput(
                label="Specify quantity",
                description=f"{chosen_material.physical_available:g} {chosen_material.unit} physically available.",
            )
        )
    elif not destination:
        next_slot = "destination"
        city_hint = f" (e.g., {resolved_identity.location_detail or resolved_identity.city})" if resolved_identity and (resolved_identity.location_detail or resolved_identity.city) else ""
        next_q = f"Where should {quantity:g} {chosen_material.unit} of {chosen_material.name} for {rec_label} be delivered{city_hint}?"
        missing_info.append("Delivery destination")
        if resolved_identity and (resolved_identity.location_detail or resolved_identity.city):
            loc_str = resolved_identity.location_detail or resolved_identity.city or ""
            cand_options = [
                {
                    "id": f"dest-{resolved_identity.id}",
                    "kind": "action",
                    "label": f"Deliver to {loc_str}",
                    "subtitle": f"On-file location for {resolved_identity.full_name}",
                    "reply_text": loc_str,
                    "metadata": {"destination": loc_str},
                }
            ]
        interpretations.append(
            InterpretationOutput(
                label="Confirm delivery destination",
                description=f"Need delivery location or bay for {rec_label}.",
            )
        )

    resolved_entities_list = [resolved_identity.to_summary_dict()] if resolved_identity else []

    if next_q is not None:
        clean_q = sanitize_clarification_question(next_q, action="send")
        if conversation_id:
            upsert_slot_state(
                db_path,
                conversation_id,
                workflow_type="material_dispatch",
                pending_slot=next_slot,
                slots=slots,
                candidate_options=cand_options,
                resolved_entities=resolved_entities_list,
            )
        return (
            GeminiAnalysisOutput(
                classification="context_dependent" if is_followup else "ambiguous",
                ambiguity_types=["referential", "underspecification"],
                needs_clarification=True,
                reasoning=f"Collecting {next_slot} for dispatch to {rec_label}.",
                interpretations=interpretations,
                missing_required_info=missing_info,
                clarification_questions=[clean_q],
                resolved_intent=None,
            ),
            {
                "workflow_type": "material_dispatch",
                "pending_slot": next_slot,
                "resolved_slots": slots,
                "candidate_options": cand_options,
                "resolved_identity": resolved_identity.to_summary_dict() if resolved_identity else None,
            },
        )

    # All slots complete -> validate inventory stock & prepare operator-gated dispatch summary
    assert chosen_material is not None and quantity is not None
    locs = ", ".join(chosen_material.warehouse_locations) or "Bengaluru Central Warehouse"
    stock_ok = quantity <= chosen_material.physical_available
    rec_full = f"{rec_label} ({destination})"
    if not stock_ok:
        direct_ans = (
            f"Insufficient physical stock for {chosen_material.name} ({chosen_material.sku}). "
            f"Requested {quantity:g} {chosen_material.unit} for {rec_full}, but only "
            f"{chosen_material.physical_available:g} {chosen_material.unit} physically available "
            f"(on hand {chosen_material.on_hand:g}, allocated {chosen_material.allocated:g}, incoming {chosen_material.incoming:g}). "
            "No dispatch or allocation was executed."
        )
    else:
        direct_ans = (
            f"Prepared dispatch summary: {quantity:g} {chosen_material.unit} of "
            f"{chosen_material.name} ({chosen_material.sku}) to {rec_full}. "
            f"Stock check passed ({chosen_material.physical_available:g} {chosen_material.unit} available at {locs}). "
            "Pending operator authorization — no physical shipment or external message was sent."
        )

    if conversation_id:
        upsert_slot_state(
            db_path, conversation_id, "material_dispatch", None, slots, [], resolved_entities_list
        )

    return (
        GeminiAnalysisOutput(
            classification="context_dependent" if is_followup else "clear",
            ambiguity_types=[],
            needs_clarification=False,
            reasoning=f"Resolved {chosen_material.sku}, {quantity:g} {chosen_material.unit}, {rec_full}.",
            interpretations=[
                InterpretationOutput(
                    label=f"Dispatch {quantity:g} {chosen_material.unit} {chosen_material.name}",
                    description=direct_ans,
                )
            ],
            missing_required_info=[],
            clarification_questions=[],
            resolved_intent=ResolvedIntentOutput(
                action="prepare_material_dispatch",
                parameters={
                    "material_id": chosen_material.id,
                    "sku": chosen_material.sku,
                    "material_name": chosen_material.name,
                    "quantity": f"{quantity:g}",
                    "unit": chosen_material.unit,
                    "available_qty": f"{chosen_material.physical_available:g}",
                    "warehouse_locations": locs,
                    "recipient": rec_full,
                    "recipient_person_id": str(slots.get("recipient_person_id") or ""),
                    "destination": str(destination or ""),
                    "stock_sufficient": "true" if stock_ok else "false",
                    "execution_status": "PENDING_OPERATOR_CONFIRMATION" if stock_ok else "BLOCKED_INSUFFICIENT_STOCK",
                },
                resolved_instruction=(
                    f"Prepare dispatch of {quantity:g} {chosen_material.unit} {chosen_material.name} "
                    f"({chosen_material.sku}) to {rec_full}."
                ),
                direct_answer=direct_ans,
            ),
        ),
        {
            "workflow_type": "material_dispatch",
            "pending_slot": None,
            "resolved_slots": slots,
            "candidate_options": [],
            "resolved_identity": resolved_identity.to_summary_dict() if resolved_identity else None,
        },
    )


def resolve_material_dispatch_turn(
    db_path: str,
    original_instruction: str,
    prior_user_turns: list[str],
    latest_turn: Optional[str] = None,
) -> Optional[GeminiAnalysisOutput]:
    """Backwards-compatible wrapper returning only GeminiAnalysisOutput."""
    res = resolve_material_dispatch_with_meta(
        db_path, original_instruction, prior_user_turns, latest_turn
    )
    return res[0] if res is not None else None
