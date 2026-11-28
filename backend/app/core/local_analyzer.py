"""
Deterministic instruction resolver used when Gemini is unavailable
and for closed-world tasks (unit conversion and inventory lookups).

Inventory quantities are never invented here. Callers attach database
figures after this module classifies the request.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.ai_schemas import GeminiAnalysisOutput, InterpretationOutput, ResolvedIntentOutput

_MATERIAL_IDS = ("MAT-CHIP", "MAT-STEEL", "MAT-COPPER", "MAT-BOLT")

_UNIT_ALIASES = {
    "km": "kilometer",
    "kms": "kilometer",
    "kilometer": "kilometer",
    "kilometers": "kilometer",
    "kilometre": "kilometer",
    "kilometres": "kilometer",
    "mi": "mile",
    "mile": "mile",
    "miles": "mile",
    "m": "meter",
    "meter": "meter",
    "meters": "meter",
    "metre": "meter",
    "metres": "meter",
    "ft": "foot",
    "foot": "foot",
    "feet": "foot",
    "kg": "kilogram",
    "kgs": "kilogram",
    "kilogram": "kilogram",
    "kilograms": "kilogram",
    "lb": "pound",
    "lbs": "pound",
    "pound": "pound",
    "pounds": "pound",
    "c": "celsius",
    "celsius": "celsius",
    "f": "fahrenheit",
    "fahrenheit": "fahrenheit",
}

_TO_MILES = 0.621371
_TO_FEET = 3.28084
_TO_POUNDS = 2.20462


def _convert(quantity: float, source: str, target: str) -> float | None:
    if source == target:
        return quantity
    pair = (source, target)
    table = {
        ("kilometer", "mile"): lambda n: n * _TO_MILES,
        ("mile", "kilometer"): lambda n: n / _TO_MILES,
        ("meter", "foot"): lambda n: n * _TO_FEET,
        ("foot", "meter"): lambda n: n / _TO_FEET,
        ("kilogram", "pound"): lambda n: n * _TO_POUNDS,
        ("pound", "kilogram"): lambda n: n / _TO_POUNDS,
        ("celsius", "fahrenheit"): lambda n: (n * 9 / 5) + 32,
        ("fahrenheit", "celsius"): lambda n: (n - 32) * 5 / 9,
        ("kilometer", "meter"): lambda n: n * 1000,
        ("meter", "kilometer"): lambda n: n / 1000,
    }
    fn = table.get(pair)
    return None if fn is None else round(fn(quantity), 4)


def _clear(
    action: str,
    instruction: str,
    parameters: dict[str, str],
    direct_answer: str | None,
    reasoning: str,
) -> GeminiAnalysisOutput:
    return GeminiAnalysisOutput(
        classification="clear",
        ambiguity_types=[],
        needs_clarification=False,
        reasoning=reasoning,
        interpretations=[],
        missing_required_info=[],
        clarification_questions=[],
        resolved_intent=ResolvedIntentOutput(
            action=action,
            parameters=parameters,
            resolved_instruction=instruction.strip(),
            direct_answer=direct_answer,
        ),
    )


def _ask(
    classification: str,
    ambiguity_types: list[str],
    missing: list[str],
    questions: list[str],
    interpretations: list[tuple[str, str]],
    reasoning: str,
) -> GeminiAnalysisOutput:
    return GeminiAnalysisOutput(
        classification=classification,  # type: ignore[arg-type]
        ambiguity_types=ambiguity_types,
        needs_clarification=True,
        reasoning=reasoning,
        interpretations=[InterpretationOutput(label=a, description=b) for a, b in interpretations],
        missing_required_info=missing,
        clarification_questions=questions[:3],
        resolved_intent=None,
    )


@dataclass
class LocalMatch:
    analysis: GeminiAnalysisOutput
    authoritative: bool


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def _materials_in(text: str) -> list[str]:
    text_clean = re.sub(r"\[Turn\s+\d+\]\s+(?:User|Assistant):.*$", "", text, flags=re.IGNORECASE | re.MULTILINE).strip()
    upper = text_clean.upper()
    hits = [sku for sku in _MATERIAL_IDS if sku in upper]
    if hits:
        return hits
    # Also recognize any explicit MAT-* or SKU-* pattern in expanded catalog
    explicit = re.findall(r"\b(?:MAT|SKU)-[A-Z0-9-]+\b", upper)
    if explicit:
        return explicit
    try:
        from app.config import get_settings
        from app.inventory.catalog_search import search_materials

        matches = search_materials(get_settings().database_path, text_clean, limit=6)
        return [str(m.id) for m in matches if getattr(m, "id", None)]
    except Exception:
        return []


def _unit_conversion(text: str) -> LocalMatch | None:
    match = re.search(
        r"\b(?:convert|change|how many)\s+([0-9]+(?:\.[0-9]+)?)\s+([a-zA-Z]+)\s+(?:to|into|in)\s+([a-zA-Z]+)",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        match = re.search(
            r"\b([0-9]+(?:\.[0-9]+)?)\s+([a-zA-Z]+)\s+(?:to|into|in)\s+([a-zA-Z]+)",
            text,
            flags=re.IGNORECASE,
        )
    if not match:
        return None
    quantity = float(match.group(1))
    source = _UNIT_ALIASES.get(match.group(2).lower())
    target = _UNIT_ALIASES.get(match.group(3).lower())
    if not source or not target:
        return None
    converted = _convert(quantity, source, target)
    if converted is None:
        return LocalMatch(
            _ask(
                "incomplete",
                ["underspecification"],
                [f"A conversion between {source} and {target}"],
                [f"ResolveX can convert common units, but not {source} to {target}. Which units should be used?"],
                [("Unsupported unit pair", f"{source} to {target} is not in the built-in conversion table.")],
                "Unit pair is outside the deterministic converter.",
            ),
            True,
        )
    pretty = f"{converted:g}"
    answer = f"{quantity:g} {source} = {pretty} {target}."
    return LocalMatch(
        _clear(
            "unit_conversion",
            f"Convert {quantity:g} {source} to {target}.",
            {"quantity": f"{quantity:g}", "from_unit": source, "to_unit": target, "result": pretty},
            answer,
            "Closed-world unit conversion. No clarification required.",
        ),
        True,
    )


def _inventory_query(text: str) -> LocalMatch | None:
    norm = _normalize(text)
    if any(
        re.search(rf"\b{verb}\b", text, flags=re.IGNORECASE)
        for verb in ("send", "ship", "dispatch", "transfer", "issue")
    ) and not any(
        tok in norm for tok in ("shortag", "order_risk", "purchase order", "how much", "how many", "check", "show", "status", "overview")
    ):
        # Material dispatch / send instructions must stay in the clarification/dispatch flow,
        # never hijack into a generic "Show the current inventory position" report.
        return None

    materials = _materials_in(text)
    shortage = any(token in norm for token in ("shortag", "out of stock", "low stock", "reorder"))
    availability = any(
        token in norm
        for token in (
            "availab",
            "on hand",
            "stock level",
            "in stock",
            "how many",
            "how much",
            "left",
            "count",
            "where are",
            "where is",
            "bin",
            "location",
        )
    )
    order_risk = (
        ("risk" in norm and any(token in norm for token in ("order", "deliver", "shipment", "crd")))
        or "missing their delivery" in norm
        or "customer required date" in norm
        or "customer request date" in norm
    )
    purchase = any(token in norm for token in ("purchase order", "purchase-order", "pending po", "approval"))
    inventoryish = any(
        token in norm
        for token in ("invent", "stock", "material", "warehouse", "suppl", "procurement", "bom")
    ) or bool(materials)

    is_lookup_verb = any(
        tok in norm
        for tok in ("show", "check", "what", "which", "list", "tell", "status", "overview", "impact", "affect")
    ) or "?" in text
    is_bare_material = (
        bool(materials)
        and len(norm.split()) <= 5
        and not any(
            tok in norm
            for tok in ("schedule", "reallocate", "deploy", "approve", "reject", "cancel", "delete", "urgent", "convert", "%", "percent")
        )
    )
    if materials and (
        availability
        or shortage
        or is_bare_material
        or (("impact" in norm or "order" in norm) and is_lookup_verb)
    ):
        if len(materials) == 1:
            sku = materials[0]
            return LocalMatch(
                _clear(
                    "check_material_availability",
                    f"Check {sku} availability and its effect on open orders.",
                    {"material_id": sku},
                    None,
                    "Material lookup is answered from the inventory database, not from the language model.",
                ),
                True,
            )
        return LocalMatch(
            _clear(
                "check_inventory",
                text.strip(),
                {"query": text.strip()},
                None,
                "Catalog lookup is answered from the inventory database, not from the language model.",
            ),
            True,
        )
    if shortage or (inventoryish and "current" in norm and "invent" in norm):
        return LocalMatch(
            _clear(
                "check_shortages",
                "Show current inventory shortages.",
                {},
                None,
                "Shortage lookup is answered from the inventory database.",
            ),
            True,
        )
    if order_risk:
        return LocalMatch(
            _clear(
                "check_order_risks",
                "Show open orders at risk of missing their customer required dates.",
                {},
                None,
                "Order-risk lookup is answered from the inventory database.",
            ),
            True,
        )
    if purchase and inventoryish and any(
        token in norm
        for token in ("show", "list", "what", "which", "check", "pending", "status", "approval")
    ):
        return LocalMatch(
            _clear(
                "check_purchase_orders",
                "Show purchase-order proposals that are waiting for approval.",
                {},
                None,
                "Proposal status is answered from the inventory database.",
            ),
            True,
        )
    if inventoryish and any(
        token in norm
        for token in ("show", "list", "what", "which", "check", "tell", "how much", "how many")
    ):
        return LocalMatch(
            _clear(
                "check_inventory",
                "Show the current inventory position.",
                {},
                None,
                "Inventory lookup is answered from the inventory database.",
            ),
            True,
        )
    return None


def _specific_report(text: str) -> str | None:
    match = re.search(
        r"\b((?:q[1-4]|[a-z0-9]+(?: [a-z0-9]+){0,4}) report)\b",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    label = match.group(1).strip()
    if label.lower() in {"the report", "a report", "report"}:
        return None
    return label


def _specific_person(text: str) -> str | None:
    match = re.search(r"\b([A-Z][a-z]+ [A-Z][a-z]+)\b", text)
    if not match:
        return None
    name = match.group(1)
    blocked = {"Finance Report", "Send The", "The Report"}
    if name in blocked or name.endswith(" Report"):
        return None
    return name


def _communication(text: str) -> LocalMatch | None:
    from app.core.communication_parser import communication_analysis

    analysis = communication_analysis(text)
    if analysis is None:
        return None
    return LocalMatch(analysis, True)


def _send_request(text: str) -> LocalMatch | None:
    from app.core.communication_parser import looks_like_communication

    if looks_like_communication(text):
        return None
    if not re.search(r"\b(send|email|forward|share)\b", text, flags=re.IGNORECASE):
        return None
    if not re.search(r"\b(report|email|document|file|message)\b", text, flags=re.IGNORECASE):
        return None
    verb_m = re.search(r"\b(send|email|forward|share)\b", text, flags=re.IGNORECASE)
    verb = verb_m.group(1).lower() if verb_m else "send"
    report = _specific_report(text)
    person = _specific_person(text)
    obj_label = f"the {report}" if report else "the report"
    if re.search(r"\bdocument\b", text, flags=re.IGNORECASE) and not report:
        obj_label = "the document"
    elif re.search(r"\bfile\b", text, flags=re.IGNORECASE) and not report:
        obj_label = "the file"
    missing: list[str] = []
    questions: list[str] = []
    interpretations: list[tuple[str, str]] = []
    if not person:
        missing.append("Recipient")
        questions.append(f"Who should I {verb} {obj_label} to?")
        interpretations.append(("Unspecified recipient", "No uniquely identified recipient is known for this request."))
    if not report:
        missing.append("Document or report name")
        if person:
            questions.append(f"Which report or document should I {verb} to {person}?")
        interpretations.append(("Unspecified document", "The specific report or document name has not been identified."))
    if missing:
        return LocalMatch(
            _ask(
                "ambiguous",
                ["referential", "underspecification"],
                missing,
                questions[:1],
                interpretations or [("Incomplete send request", "The recipient or the document is not identified.")],
                "The send request is missing an identified recipient or document.",
            ),
            False,
        )
    return LocalMatch(
        _clear(
            "record_send_instruction",
            f"Send the {report} to {person}.",
            {"document": report or "", "recipient": person or ""},
            (
                f"Resolved instruction: send the {report} to {person}. "
                "ResolveX recorded the instruction. It did not send an email or file."
            ),
            "Document and recipient are both identified. No external message is sent.",
        ),
        False,
    )


_CONTRADICTION_PAIRS = [
    ("cancel", "ship"),
    ("cancel", "confirm"),
    ("approve", "reject"),
    ("delete", "keep"),
    ("increase", "decrease"),
    ("open", "close"),
    ("start", "stop"),
    ("hold", "release"),
    ("enable", "disable"),
]


def _contradiction(text: str) -> LocalMatch | None:
    """Detect conflicting action verbs. Uses exact-word matching so that
    'approved'/'rejected' filter queries are not mistaken for commands."""
    for left, right in _CONTRADICTION_PAIRS:
        has_left = re.search(rf"\b{left}\b", text, flags=re.IGNORECASE) is not None
        has_right = re.search(rf"\b{right}\b", text, flags=re.IGNORECASE) is not None
        if has_left and has_right:
            return LocalMatch(
                _ask(
                    "ambiguous",
                    ["semantic"],
                    ["Which of the conflicting actions should be kept"],
                    [f"The request says both to {left} and to {right}. Which one should ResolveX keep?"],
                    [
                        (f"Keep {left}", f"Treat the {right} part as withdrawn."),
                        (f"Keep {right}", f"Treat the {left} part as withdrawn."),
                    ],
                    "The instruction contains conflicting actions.",
                ),
                True,
            )
    return None


def _unsupported(text: str) -> LocalMatch | None:
    norm = _normalize(text)
    topics = (
        "book a flight",
        "book me a flight",
        "weather",
        "stock price",
        "write code",
        "hack",
        "password",
        "wire transfer",
        "pay the invoice",
        "capital of",
        "set an alarm",
        "alarm for",
        "open the file",
        "translate",
    )
    if not any(topic in norm for topic in topics):
        return None
    return LocalMatch(
        _clear(
            "unsupported_request",
            text.strip(),
            {},
            (
                "ResolveX cannot complete that request. It resolves unclear instructions and "
                "answers inventory, shortage, order-date, and purchase-approval questions from "
                "application data. No outside action was taken."
            ),
            "The request is outside ResolveX capabilities.",
        ),
        True,
    )


def _percent_of(text: str) -> LocalMatch | None:
    match = re.search(
        r"([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent|per\s*cent)\s+of\s+([0-9]+(?:\.[0-9]+)?)",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    pct, base = float(match.group(1)), float(match.group(2))
    result = round(pct / 100 * base, 4)
    answer = f"{pct:g}% of {base:g} = {result:g}."
    return LocalMatch(
        _clear(
            "calculate",
            f"Calculate {pct:g}% of {base:g}.",
            {"percent": f"{pct:g}", "base": f"{base:g}", "result": f"{result:g}"},
            answer,
            "Closed-world arithmetic. No clarification required.",
        ),
        True,
    )


_INTENT_FINDERS = (
    ("unit_conversion", _unit_conversion),
    ("percent_of", _percent_of),
    ("unsupported_request", _unsupported),
    ("communication", _communication),
    ("inventory_lookup", _inventory_query),
    ("send_request", _send_request),
)


def _intent_label(name: str, match: LocalMatch) -> str:
    intent = match.analysis.resolved_intent
    if intent is not None and intent.resolved_instruction:
        return intent.resolved_instruction.strip()
    if match.analysis.interpretations:
        return match.analysis.interpretations[0].label
    return name.replace("_", " ")


def _multi_intent_ask(hits: list[tuple[str, LocalMatch]], authoritative: bool = True) -> LocalMatch:
    labels = [_intent_label(name, match) for name, match in hits[:4]]
    joined = "; ".join(labels)
    questions = [
        f"I found more than one request in that instruction ({joined}). "
        "Which should ResolveX handle first?"
    ]
    # Surface any sub-questions from partially-specified hits (e.g. missing recipient).
    for _, match in hits:
        for q in match.analysis.clarification_questions:
            if q not in questions and len(questions) < 3:
                questions.append(q)
    return LocalMatch(
        _ask(
            "ambiguous",
            ["structural"],
            ["Which of the multiple detected requests should be handled first"],
            questions,
            [(label, "Detected as a separate request in the same instruction.") for label in labels],
            "The instruction contains multiple distinct requests; only one can be resolved per turn.",
        ),
        authoritative,
    )


def match_local(
    instruction: str,
    extra_context: str = "",
    multi_intent_authoritative: bool = True,
) -> LocalMatch | None:
    """Return a local reading of the instruction, or None if no pattern matches.

    Conflicting-action detection runs first on the raw instruction only, so
    keywords from earlier conversation turns cannot trigger false positives.
    When two or more distinct intents match the same instruction, the request
    is escalated to clarification instead of silently dropping intents.
    """
    text = f"{instruction}\n{extra_context}".strip()
    if not text:
        return None

    contradiction = _contradiction(instruction)
    if contradiction is not None:
        return contradiction

    primary: list[tuple[str, LocalMatch]] = []
    secondary: list[tuple[str, LocalMatch]] = []
    for name, finder in _INTENT_FINDERS:
        on_instruction = finder(instruction)
        if on_instruction is not None:
            primary.append((name, on_instruction))
            continue
        if extra_context:
            on_text = finder(text)
            if on_text is not None:
                secondary.append((name, on_text))

    hits = primary or secondary
    if len(hits) > 1:
        return _multi_intent_ask(hits, authoritative=multi_intent_authoritative)
    if hits:
        return hits[0][1]
    return None


_LEXICAL_TERMS: dict[str, tuple[str, list[tuple[str, str]]]] = {
    "charge": (
        "financial fee / invoice cost vs electrical battery charge vs assigned responsibility",
        [
            ("Financial fee or billing charge", "Treat 'charge' as invoice cost, fee, or payment billing."),
            ("Electrical or battery charge", "Treat 'charge' as power/electrical equipment charging."),
        ],
    ),
    "plant": (
        "industrial manufacturing facility vs botanical plant",
        [
            ("Manufacturing plant / facility", "Apply to a factory, industrial facility, or plant bay."),
            ("Power / utility plant unit", "Apply to power or utility equipment setup."),
        ],
    ),
    "bank": (
        "financial bank account vs capacitor/power bank vs storage bank",
        [
            ("Financial / payment bank", "Treat 'bank' as a banking or payment account."),
            ("Equipment / battery bank", "Treat 'bank' as a hardware capacitor or battery array."),
        ],
    ),
    "seal": (
        "hydraulic seal component vs finalize/lock approval",
        [
            ("Hydraulic seal part (MAT-SEAL-KIT)", "Refer to physical hydraulic O-ring / seal kit inventory."),
            ("Lock or seal a record", "Finalize and lock an order or audit record."),
        ],
    ),
    "issue": (
        "dispatch/issue stock items vs operational problem/ticket",
        [
            ("Issue / dispatch physical stock", "Release or allocate stock items from warehouse inventory."),
            ("Report or resolve a problem", "Investigate an operational exception or defect."),
        ],
    ),
    "lead": (
        "supplier delivery lead time vs electrical wire lead vs team lead",
        [
            ("Supplier lead time (days)", "Refer to procurement delivery lead time."),
            ("Project or team lead", "Refer to the responsible person leading the task."),
        ],
    ),
}

_KNOWN_ACTION_WORDS = {
    "check", "show", "list", "get", "find", "search", "view", "display", "compare",
    "send", "ship", "dispatch", "transfer", "issue", "deliver", "supply", "forward", "share",
    "email", "message", "remind", "notify", "text", "tell", "ask", "call",
    "approve", "reject", "cancel", "confirm", "create", "update", "change", "edit", "set", "delete",
    "remove", "add", "fix", "handle", "process", "schedule", "deploy", "allocate", "reallocate",
    "review", "analyze", "clarify", "resolve", "convert", "calculate", "compute", "export",
    "move", "order", "prepare", "flag", "inspect", "restart", "reset", "open", "close",
    "start", "stop", "hold", "release", "enable", "disable", "increase", "decrease", "keep",
}

_NON_RANDOM_DOMAIN_NOUNS = {
    "stock", "inventory", "material", "materials", "item", "items", "product", "products",
    "order", "orders", "warehouse", "storage", "bin", "bins", "rack", "shelf", "zone",
    "supplier", "suppliers", "vendor", "delivery", "deliveries", "shipment", "shipping", "proposal",
    "shortage", "shortages", "alert", "alerts", "report", "document", "file", "pdf",
    "email", "message", "reminder", "note", "notes", "invoice", "payment", "schedule",
    "staging", "production", "prod", "env", "environment", "plant", "charge", "bank",
    "team", "system", "account", "plan", "project", "budget", "meeting", "class",
    "friend", "classmate", "manager", "colleague", "person", "business", "contact", "professor",
    "ravi", "rahul", "charan", "deepak", "ananya", "suresh", "meera", "vikram", "priya",
    "kiran", "arjun", "sneha", "karthik", "rohan", "pooja", "nagesh", "ramesh",
    "steel", "copper", "titanium", "aluminium", "aluminum", "screw", "jack", "bolt", "bolts",
    "nut", "nuts", "bearing", "bearings", "valve", "valves", "pump", "pumps", "motor", "motors",
    "relay", "relays", "breaker", "helmet", "helmets", "goggles", "gloves", "lubricant",
    "grease", "coolant", "gasket", "flange", "pipe", "cable", "wrench", "washer", "sheet", "wire", "rod", "seal",
}


def _looks_like_random_or_nonsense(text: str) -> bool:
    """True for gibberish keystrokes, bare numbers, greetings, or random words with no actionable request."""
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    if not cleaned:
        return True
    words = re.findall(r"[a-zA-Z0-9]+", cleaned.lower())
    if not words:
        return True
    # Greetings alone
    if len(words) <= 2 and all(w in {"hi", "hello", "hey", "ok", "okay", "yo", "test", "testing"} for w in words):
        return True
    # Explicit placeholder / test gibberish phrases
    if re.search(r"\b(blabla+|blah+|foobar|lorem|ipsum|xyzzy)\b", cleaned, re.IGNORECASE) or re.fullmatch(
        r"(?:foo|bar|baz|qux|\s)+", cleaned, re.IGNORECASE
    ):
        return True
    # Pure numbers or single 1-2 char tokens
    if all(w.isdigit() for w in words) or (len(words) == 1 and len(words[0]) <= 2):
        return True

    alpha_words = [w for w in words if re.fullmatch(r"[a-z]+", w)]
    # Check keymash / vowel-starved tokens like "asdfghjkl", "zxcvbn", "xzqwp", "qqqqq"
    for w in alpha_words:
        if len(w) >= 5:
            vowels = sum(1 for ch in w if ch in "aeiouy")
            if vowels == 0 or (len(w) >= 7 and vowels / len(w) < 0.16):
                return True
            if re.search(r"(asdf|qwer|zxcv|hjkl|yuio|bnm)", w) or re.search(r"(.)\1{3,}", w):
                return True

    # Explicit domain IDs (ORD-1001, SKU-STL-01, MAT-CHIP, PO-2001) or unit conversion ("10 km to miles")
    if re.search(r"\b(?:ORD|PO|MAT|SKU|SUP|DEL|LOC|PER)-[A-Z0-9-]+\b", cleaned, re.IGNORECASE):
        return False
    if _unit_conversion(cleaned) is not None:
        return False

    has_action = any(w in _KNOWN_ACTION_WORDS for w in alpha_words)
    has_domain_or_pronoun = any(
        w in _NON_RANDOM_DOMAIN_NOUNS
        or w in {"it", "this", "that", "them", "they", "him", "her", "those", "these", "usual", "same"}
        or w in _LEXICAL_TERMS
        for w in alpha_words
    )
    has_question = "?" in cleaned and len(words) >= 3
    if not has_action and not has_domain_or_pronoun and not has_question:
        return True
    return False


def offline_fallback(instruction: str) -> GeminiAnalysisOutput:
    """PS6 structured fallback: rejects gibberish honestly without hallucinating cards,
    and detects lexical, structural, referential, contextual, semantic & underspecification ambiguity."""
    cleaned = instruction.strip() or "the request"
    norm = _normalize(cleaned)
    words = re.findall(r"[a-zA-Z0-9-]+", norm)

    # 1. Random / gibberish / non-request guard -> ask clearly what they want without generating fake outputs
    if _looks_like_random_or_nonsense(cleaned):
        preview = cleaned[:60] + ("…" if len(cleaned) > 60 else "")
        return GeminiAnalysisOutput(
            classification="incomplete",
            ambiguity_types=["underspecification"],
            needs_clarification=True,
            reasoning="Input does not express an actionable request or recognizable entity.",
            interpretations=[],
            missing_required_info=["Clear objective or action", "Specific item, order, or recipient"],
            clarification_questions=[
                f'I didn\'t recognize a clear request in "{preview}". What would you specifically like me to do — clarify an instruction, check inventory/orders/storage, or draft a message?'
            ],
            resolved_intent=None,
        )

    detected_types: list[str] = []
    interpretations: list[tuple[str, str]] = []
    missing: list[str] = []
    questions: list[str] = []

    # 2. Lexical ambiguity check
    for term, (sense_desc, opts) in _LEXICAL_TERMS.items():
        if re.search(rf"\b{term}\b", norm):
            detected_types.append("lexical")
            interpretations.extend(opts)
            missing.append(f"Intended meaning of '{term}'")
            questions.append(f"What do you mean by '{term}' here ({sense_desc})?")
            break

    # 3. Structural attachment / OR-grouping check
    or_m = re.search(r"\b([a-zA-Z0-9-]+)\s+or\s+([a-zA-Z0-9-]+)\b", cleaned, re.IGNORECASE)
    if or_m:
        left_opt, right_opt = or_m.group(1), or_m.group(2)
        if "structural" not in detected_types:
            detected_types.append("structural")
        interpretations.extend([
            (f"Focus on '{left_opt}'", f"Apply this action specifically to '{left_opt}'."),
            (f"Focus on '{right_opt}'", f"Apply this action specifically to '{right_opt}'."),
        ])
        missing.append(f"Selection or grouping between '{left_opt}' and '{right_opt}'")
        if not questions:
            questions.append(f"Should this apply to '{left_opt}', '{right_opt}', or both?")

    # 4. Referential ambiguity check (pronouns & vague references without context)
    ref_hits = [
        tok for tok in ("it", "this", "that", "they", "them", "those", "him", "her", "the one", "same", "usual")
        if re.search(rf"\b{tok}\b", norm)
    ]
    if ref_hits:
        detected_types.append("referential")
        ref_str = ", ".join(f"'{r}'" for r in ref_hits[:2])
        if not interpretations:
            interpretations.extend([
                ("Refer to an inventory material / SKU", f"Bind {ref_str} to a specific catalog material or stock item."),
                ("Refer to an order or person record", f"Bind {ref_str} to a specific customer order ID or contact."),
            ])
        missing.append(f"Specific target referred to by {ref_str}")
        if not questions:
            questions.append(f"What specific item, order, or person does {ref_str} refer to?")

    # 5. Semantic / vague priority or scope check
    if re.search(r"\b(every|all|urgent|critical|asap|soon|normal|usual|staging)\b", norm):
        if "contextual" not in detected_types:
            detected_types.append("contextual")
        if "semantic" not in detected_types and re.search(r"\b(every|all|urgent|critical)\b", norm):
            detected_types.append("semantic")
        if not interpretations:
            interpretations.extend([
                ("Narrow scope (specific records only)", "Apply only to explicitly selected items or orders after confirmation."),
                ("Broad operational scope", "Evaluate across all eligible active records before any action."),
            ])
        missing.append("Explicit scope, criteria, or deadline")
        if not questions:
            questions.append("Which specific scope, environment, or timeline should apply here?")

    # 6. General underspecification fallback for real English verbs missing full slots
    if "underspecification" not in detected_types:
        detected_types.append("underspecification")
    if not interpretations:
        interpretations = [
            ("Specify target & action", f"Identify the exact material, order, or recipient for: {cleaned}"),
            ("Lookup information first", "Fetch relevant stock, order, or contact details before deciding next steps."),
        ]
    if not missing:
        missing = ["Specific target entity (material, order ID, or recipient)", "Exact parameters or scope"]
    if not questions:
        questions = [
            "Could you clarify the specific target (item, order, or recipient) and exact action you would like to take?"
        ]

    return _ask(
        "incomplete" if detected_types == ["underspecification"] else "ambiguous",
        detected_types,
        missing,
        questions[:1],
        interpretations[:4],
        "Analyzed instruction ambiguity via local PS6 semantic & structural rules.",
    )


def clarify_locally(
    original_instruction: str,
    new_response: str,
    asked_questions: list[str],
) -> tuple[GeminiAnalysisOutput, str]:
    """Re-read a clarification turn without Gemini.

    Returns (analysis, source) where source is "local" when a deterministic
    pattern matched and "offline_fallback" otherwise.
    """
    combined = f"{original_instruction}\n{new_response}"
    # If user picked a lexical/structural/contradiction interpretation or supplied concrete parameters, resolve cleanly!
    picked_interp = re.match(r"^\s*(?:use\s+interpretation:\s*|choose\s+|select\s+)?(.+)$", new_response.strip(), re.IGNORECASE)
    if picked_interp and not _looks_like_random_or_nonsense(new_response) and len(new_response.strip().split()) >= 2:
        # First let contradiction / dispatch / lookup patterns try
        matched = match_local(combined, new_response, multi_intent_authoritative=False)
        if matched is not None and not matched.analysis.needs_clarification:
            return matched.analysis, "local"
        if re.search(r"\b(interpretation|meaning|option|use\s+|apply\s+to|only\s+|keep\s+|ord-|mat-|sku-|bay\s*\d+|facility|billing|financial|electrical|hydraul)", new_response, re.IGNORECASE):
            resolved_txt = f"{original_instruction.strip()} -> Clarified: {new_response.strip()}"
            return (
                _clear(
                    "execute_resolved_instruction",
                    resolved_txt,
                    {"original": original_instruction.strip(), "clarification": new_response.strip()},
                    f"Resolved instruction using your clarification ({new_response.strip()}). Recorded safely — no external action was executed automatically.",
                    "Clarification resolved the previously detected ambiguity.",
                ),
                "local",
            )

    matched = match_local(combined, new_response, multi_intent_authoritative=False)
    if matched is not None:
        analysis = matched.analysis
        if analysis.clarification_questions and asked_questions:
            asked_norm = {q.strip().lower() for q in asked_questions}
            fresh = [q for q in analysis.clarification_questions if q.strip().lower() not in asked_norm]
            if not fresh and analysis.needs_clarification:
                return (
                    _clear(
                        "record_partial_instruction",
                        combined.strip(),
                        {},
                        (
                            "Clarification limit for this pattern was reached with the details provided. "
                            "ResolveX recorded the conversation and did not perform an external action."
                        ),
                        "No new clarification question remains.",
                    ),
                    "local",
                )
            if fresh != analysis.clarification_questions:
                return analysis.model_copy(update={"clarification_questions": fresh}), "local"
        return analysis, "local"
    return offline_fallback(combined), "offline_fallback"
