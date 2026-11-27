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
    upper = text.upper()
    return [sku for sku in _MATERIAL_IDS if sku in upper]


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
    materials = _materials_in(text)
    shortage = any(token in norm for token in ("shortag", "out of stock", "low stock", "reorder"))
    availability = any(token in norm for token in ("availab", "on hand", "stock level", "in stock"))
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

    if materials and (availability or shortage or "impact" in norm or "order" in norm):
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
    report = _specific_report(text)
    person = _specific_person(text)
    missing: list[str] = []
    questions: list[str] = []
    interpretations: list[tuple[str, str]] = []
    if not report:
        missing.append("Which report or document")
        questions.append("Which report should be sent? Please name the document.")
        interpretations.append(("Unspecified document", "The word \"report\" does not identify a document."))
    if not person:
        missing.append("Which person")
        questions.append("Who should receive it? Please give the person's full name and team.")
        interpretations.append(("Unspecified recipient", "A first name alone does not identify one person."))
    if missing:
        return LocalMatch(
            _ask(
                "ambiguous",
                ["referential", "underspecification"],
                missing,
                questions,
                interpretations or [("Incomplete send request", "The recipient or the document is not identified.")],
                "The send request is missing a document name, a recipient, or both.",
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


def offline_fallback(instruction: str) -> GeminiAnalysisOutput:
    """Used only when Gemini is down and no local pattern matches."""
    cleaned = instruction.strip() or "the request"
    return _ask(
        "incomplete",
        ["contextual"],
        ["A clearer action, object, and any names or quantities"],
        [
            "The language model is offline, and this request is not a built-in conversion or inventory lookup. "
            "What action should ResolveX take, and what object or record does it apply to?"
        ],
        [("Unrecognised request", f"ResolveX could not safely interpret: {cleaned}")],
        "Gemini is unavailable and the instruction did not match a deterministic resolver.",
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
