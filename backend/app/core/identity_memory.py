"""Persistent identity, relationship graph, pronoun, and conversation slot memory.

All fictional/seeded identities live in SQLite (`people`, `person_relationships`),
tagged by `data_origin` (`SEEDED_DEMO`, `USER_PROVIDED`, `VERIFIED_BUSINESS`).
Never merges distinct people solely because they share a first name, never exposes
the full reference story wholesale, and keeps per-conversation slots strictly isolated.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
import json
import re
from typing import Any, Optional
import uuid

from app.database.connection import get_connection
from app.database.identity_seed import ensure_identity_catalog


_CITY_ALIASES = {
    "bengaluru": "bangalore",
    "bangalore": "bangalore",
    "blr": "bangalore",
    "mangaluru": "mangalore",
    "mangalore": "mangalore",
    "chennai": "chennai",
    "pune": "pune",
}

_REL_ALIASES = {
    "friend": ("friend", "college_friend"),
    "college friend": ("college_friend", "friend"),
    "classmate": ("classmate",),
    "class mate": ("classmate",),
    "colleague": ("colleague",),
    "manager": ("manager",),
    "boss": ("manager",),
    "supervisor": ("manager",),
    "advisor": ("faculty_advisor",),
    "faculty advisor": ("faculty_advisor",),
    "supplier": ("supplier_contact",),
    "supplier contact": ("supplier_contact",),
    "business contact": ("business_contact",),
    "contact": ("business_contact", "supplier_contact", "customer_contact"),
}

_NON_PERSON_CAPITALIZED = {
    "screw jack", "mechanical screw", "scissors screw", "cold rolled", "steel sheet",
    "copper winding", "winding wire", "titanium bolts", "control module", "ball bearing",
    "spur gear", "induction motor", "transfer pump", "aluminium rod", "stainless pipe",
    "ball valve", "check valve", "control relay", "circuit breaker", "power cable",
    "torque wrench", "seal kit", "safety helmet", "work gloves", "safety goggles",
    "maintenance bay", "maintenance team", "finance report", "q3 report", "q4 report",
    "the report", "person ravi", "business ravi", "warehouse manager",
}


@dataclass
class PersonRecord:
    """Structured person identity retrieved from persistent storage."""

    id: str
    full_name: str
    first_name: str
    aliases: list[str]
    nicknames: list[str]
    usernames: list[str]
    alternative_spellings: list[str]
    gender: str
    city: Optional[str]
    location_detail: Optional[str]
    occupation: Optional[str]
    org_role: Optional[str]
    category: str
    organization: Optional[str]
    department: Optional[str]
    supplier_id: Optional[str]
    warehouse_id: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    comm_preference: Optional[str]
    data_origin: str
    notes: str = ""

    def candidate_label(self) -> str:
        """Concise human label for inline clarification options."""
        if self.category == "personal" and self.first_name.lower() == "ravi":
            return f"Person Ravi — {self.full_name}"
        if self.org_role and self.full_name.lower() != self.org_role.lower():
            return f"{self.full_name} — {self.org_role}"
        return self.full_name

    def candidate_subtitle(self) -> str:
        """Disambiguating details (city, role, organization) without leaking stories."""
        parts: list[str] = []
        if self.city:
            parts.append(self.city)
        if self.organization and self.organization != self.city:
            parts.append(self.organization)
        elif self.occupation:
            parts.append(self.occupation)
        return " · ".join(parts) or self.category.title()

    def to_candidate_dict(self, reply_text: Optional[str] = None) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": "person",
            "label": self.candidate_label(),
            "subtitle": self.candidate_subtitle(),
            "reply_text": reply_text or self.full_name,
            "metadata": {
                "person_id": self.id,
                "full_name": self.full_name,
                "city": self.city,
                "category": self.category,
                "org_role": self.org_role,
                "organization": self.organization,
                "data_origin": self.data_origin,
            },
        }

    def to_summary_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "full_name": self.full_name,
            "city": self.city,
            "location_detail": self.location_detail,
            "category": self.category,
            "org_role": self.org_role,
            "organization": self.organization,
            "department": self.department,
            "supplier_id": self.supplier_id,
            "warehouse_id": self.warehouse_id,
            "comm_preference": self.comm_preference,
            "data_origin": self.data_origin,
        }


@dataclass
class IdentityResolutionResult:
    """Outcome of resolving a recipient, pronoun, or relational reference."""

    status: str  # "resolved" | "needs_confirm" | "ambiguous" | "unclear" | "external_named" | "none"
    resolved_person: Optional[PersonRecord] = None
    display_name: Optional[str] = None
    candidates: list[PersonRecord] = field(default_factory=list)
    question: Optional[str] = None
    reason: Optional[str] = None
    reference_token: Optional[str] = None
    used_relationship: Optional[str] = None


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm_city(city: Optional[str]) -> str:
    if not city:
        return ""
    c = city.strip().lower()
    return _CITY_ALIASES.get(c, c)


def _row_to_person(row: Any) -> PersonRecord:
    def _loads(col: str) -> list[str]:
        try:
            data = json.loads(row[col] or "[]")
            return [str(x) for x in data] if isinstance(data, list) else []
        except Exception:
            return []

    return PersonRecord(
        id=str(row["id"]),
        full_name=str(row["full_name"]),
        first_name=str(row["first_name"]),
        aliases=_loads("aliases_json"),
        nicknames=_loads("nicknames_json"),
        usernames=_loads("usernames_json"),
        alternative_spellings=_loads("alternative_spellings_json"),
        gender=str(row["gender"] or "neutral"),
        city=row["city"],
        location_detail=row["location_detail"],
        occupation=row["occupation"],
        org_role=row["org_role"],
        category=str(row["category"] or "personal"),
        organization=row["organization"],
        department=row["department"],
        supplier_id=row["supplier_id"],
        warehouse_id=row["warehouse_id"],
        email=row["email"],
        phone=row["phone"],
        comm_preference=row["comm_preference"],
        data_origin=str(row["data_origin"] or "SEEDED_DEMO"),
        notes=str(row["notes"] or ""),
    )


def ensure_seeded(db_path: str) -> None:
    """Ensure fictional demo identities exist if the people table is empty."""
    with get_connection(db_path) as conn:
        cnt = conn.execute(
            "SELECT COUNT(*) AS cnt FROM people WHERE category != 'self';"
        ).fetchone()["cnt"]
    if cnt == 0:
        ensure_identity_catalog(db_path)


def list_people(db_path: str, include_self: bool = False) -> list[PersonRecord]:
    """List all structured identities (excluding hidden PER-USER-SELF unless asked)."""
    ensure_seeded(db_path)
    with get_connection(db_path) as conn:
        if include_self:
            rows = conn.execute("SELECT * FROM people ORDER BY id ASC;").fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM people WHERE category != 'self' ORDER BY full_name ASC;"
            ).fetchall()
    return [_row_to_person(r) for r in rows]


def get_person_by_id(db_path: str, person_id: str) -> Optional[PersonRecord]:
    ensure_seeded(db_path)
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT * FROM people WHERE id = ?;", (person_id,)).fetchone()
    return _row_to_person(row) if row else None


def get_related_people(
    db_path: str,
    person_id: str,
    relationship_hint: Optional[str] = None,
) -> list[tuple[PersonRecord, str]]:
    """Return related PersonRecord entries and the relationship type."""
    ensure_seeded(db_path)
    rel_filter: tuple[str, ...] | None = None
    if relationship_hint:
        rl = relationship_hint.strip().lower()
        rel_filter = _REL_ALIASES.get(rl, (rl,))

    with get_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT p.*, r.relationship_type
            FROM person_relationships r
            JOIN people p ON p.id = r.related_person_id
            WHERE r.person_id = ? AND p.category != 'self'
            ORDER BY p.full_name ASC;
            """,
            (person_id,),
        ).fetchall()

    results: list[tuple[PersonRecord, str]] = []
    for row in rows:
        rtype = str(row["relationship_type"]).lower()
        if rel_filter is None or rtype in rel_filter:
            results.append((_row_to_person(row), rtype))
    return results


def _all_search_strings(p: PersonRecord) -> list[str]:
    return [
        p.full_name,
        *p.aliases,
        *p.nicknames,
        *p.usernames,
        *p.alternative_spellings,
    ]


def search_people(
    db_path: str,
    query: str,
    city_hint: Optional[str] = None,
    category_hint: Optional[str] = None,
    gender_hint: Optional[str] = None,
) -> tuple[list[PersonRecord], bool]:
    """Match natural references against persistent identities without merging namesakes.

    Returns (matches, needs_alias_confirmation).
    When query explicitly has 2+ name tokens (e.g. 'Ravi Kumar') that do not exist as a
    known identity, does NOT falsely fall back to matching all 'Ravi' entries.
    """
    ensure_seeded(db_path)
    raw = re.sub(r"[?.!,]+$", "", (query or "").strip())
    if not raw:
        return [], False

    # Extract "Ravi from Mangalore" / "Ravi in Bangalore" city qualifier
    q_clean = raw
    extracted_city = _norm_city(city_hint)
    city_m = re.search(
        r"\b(?:from|in|at)\s+(mangalore|mangaluru|bangalore|bengaluru|chennai|pune)\b",
        raw,
        re.IGNORECASE,
    )
    if city_m:
        extracted_city = _norm_city(city_m.group(1))
        q_clean = re.sub(
            r"\b(?:from|in|at)\s+(?:mangalore|mangaluru|bangalore|bengaluru|chennai|pune)\b",
            "",
            q_clean,
            flags=re.IGNORECASE,
        ).strip()

    ql = re.sub(r"\s+", " ", q_clean.lower()).strip()
    people = list_people(db_path)
    if gender_hint in ("male", "female"):
        people = [p for p in people if p.gender in (gender_hint, "neutral")]
    if category_hint:
        people = [p for p in people if p.category == category_hint]

    # 1. Exact ID match
    for p in people:
        if p.id.lower() == ql:
            return [p], False

    # 2. Exact full_name match (authoritative — no alias confirmation needed)
    exact_full = [p for p in people if p.full_name.lower() == ql]
    if extracted_city:
        exact_full = [p for p in exact_full if _norm_city(p.city) == extracted_city]
    if exact_full:
        return exact_full, False

    # 3. Role / title / descriptor phrases
    if ql in {"warehouse manager", "the warehouse manager", "warehouse lead"}:
        wh = [p for p in people if p.category == "warehouse"]
        if wh:
            return wh, False
    if ql in {"our supplier", "the supplier", "supplier"}:
        sups = [p for p in people if p.category == "supplier"]
        if sups:
            return sups, False

    # 4. Exact alias / nickname / username / alt-spelling match
    alias_hits: list[PersonRecord] = []
    for p in people:
        if extracted_city and _norm_city(p.city) != extracted_city:
            continue
        forms = [f.lower() for f in [*p.aliases, *p.nicknames, *p.usernames, *p.alternative_spellings]]
        if ql in forms:
            alias_hits.append(p)
    if alias_hits:
        # "Person Ravi" / "Ravi personal" is an informal category alias -> ask confirmation ("Do you mean Ravi Shetty from Mangalore?")
        confirm_alias = ql in {"person ravi", "ravi personal", "personal ravi"}
        return alias_hits, confirm_alias

    # 5. Single-token / first-name / single-typo lookup
    tokens = ql.split()
    if len(tokens) == 1:
        tok = tokens[0]
        first_hits = [
            p for p in people
            if p.first_name.lower() == tok
            or tok in [n.lower() for n in [*p.nicknames, *p.usernames, *p.alternative_spellings]]
        ]
        if extracted_city:
            first_hits = [p for p in first_hits if _norm_city(p.city) == extracted_city]
        if first_hits:
            return first_hits, False

        # Typo tolerance on single first name / username (e.g. "Ravee", "Charran", "Raahul")
        fuzzy_first: list[PersonRecord] = []
        for p in people:
            if extracted_city and _norm_city(p.city) != extracted_city:
                continue
            cand_tokens = [p.first_name.lower(), *(s.lower() for s in p.alternative_spellings), *(s.lower() for s in p.usernames)]
            if any(SequenceMatcher(None, tok, ct).ratio() >= 0.80 for ct in cand_tokens):
                fuzzy_first.append(p)
        if fuzzy_first:
            return fuzzy_first, False

    # 6. Multi-token fuzzy full-name / alias match (strict threshold so "Ravi Kumar" does NOT hit "Ravi K")
    fuzzy_full: list[tuple[float, PersonRecord]] = []
    for p in people:
        if extracted_city and _norm_city(p.city) != extracted_city:
            continue
        for candidate_str in _all_search_strings(p):
            cs = candidate_str.lower()
            if len(cs.split()) < 2:
                continue
            ratio = SequenceMatcher(None, ql, cs).ratio()
            # Ensure surname/second token doesn't trivially clash (e.g. "Ravi Kumar" vs "Ravi Shetty")
            q_parts = ql.split()
            c_parts = cs.split()
            if len(q_parts) >= 2 and len(c_parts) >= 2 and len(q_parts[-1]) > 1 and len(c_parts[-1]) > 1:
                last_ratio = SequenceMatcher(None, q_parts[-1], c_parts[-1]).ratio()
                if last_ratio < 0.72:
                    continue
            elif len(q_parts) >= 2 and len(c_parts) >= 2 and len(q_parts[-1]) > 1 and len(c_parts[-1]) == 1:
                # "Ravi Kumar" must not collapse onto "Ravi K" unless spelled "Ravi K"
                continue
            if ratio >= 0.84:
                fuzzy_full.append((ratio, p))
                break
    if fuzzy_full:
        fuzzy_full.sort(key=lambda x: -x[0])
        return [p for _, p in fuzzy_full], False

    # If user gave "Ravi <City>" like "Ravi Mangalore" / "Ravi Bangalore"
    if len(tokens) == 2 and _norm_city(tokens[1]) in set(_CITY_ALIASES.values()):
        city_val = _norm_city(tokens[1])
        first_val = tokens[0]
        city_hits = [
            p for p in people
            if p.first_name.lower() == first_val and _norm_city(p.city) == city_val
        ]
        if city_hits:
            return city_hits, False

    return [], False


def _find_session_people(
    db_path: str,
    session_entities: list[Any],
    gender_hint: Optional[str] = None,
    plural_only: bool = False,
) -> list[tuple[Optional[PersonRecord], str, int]]:
    """Collect distinct people strictly from the current session's context entities."""
    seen_keys: set[str] = set()
    found: list[tuple[Optional[PersonRecord], str, int]] = []
    for ent in session_entities or []:
        if getattr(ent, "category", None) != "person":
            continue
        val = str(getattr(ent, "value", "")).strip()
        if not val or val.lower() in _NON_PERSON_CAPITALIZED:
            continue
        turn = int(getattr(ent, "source_turn", 1) or 1)
        matches, _ = search_people(db_path, val)
        if len(matches) == 1:
            p = matches[0]
            if gender_hint in ("male", "female") and p.gender not in (gender_hint, "neutral"):
                continue
            key = p.id
            if key not in seen_keys:
                seen_keys.add(key)
                found.append((p, p.full_name, turn))
        elif len(matches) > 1:
            # Ambiguous bare name in prior turn — only keep raw value if not already represented
            key = val.lower()
            if key not in seen_keys:
                seen_keys.add(key)
                found.append((None, val, turn))
        else:
            key = val.lower()
            if key not in seen_keys:
                seen_keys.add(key)
                found.append((None, val, turn))
    return found


def _person_for_owner_phrase(
    db_path: str,
    owner_phrase: str,
    session_entities: list[Any],
    active_person_id: Optional[str] = None,
) -> IdentityResolutionResult:
    """Resolve an anchor owner from '<Owner>'s <rel>' or '<pronoun> <rel>'."""
    ol = owner_phrase.strip().lower()
    if ol in {"his", "he"}:
        return resolve_pronoun_to_identity(db_path, "him", session_entities, active_person_id)
    if ol in {"her", "she"}:
        return resolve_pronoun_to_identity(db_path, "her", session_entities, active_person_id)
    if ol in {"their", "them", "they"}:
        return resolve_pronoun_to_identity(db_path, "their", session_entities, active_person_id)
    if ol == "my":
        with get_connection(db_path) as conn:
            row = conn.execute("SELECT * FROM people WHERE id = 'PER-USER-SELF';").fetchone()
        if row:
            return IdentityResolutionResult(status="resolved", resolved_person=_row_to_person(row), display_name="User")
        return IdentityResolutionResult(status="unclear")

    matches, _ = search_people(db_path, owner_phrase)
    if len(matches) == 1:
        return IdentityResolutionResult(status="resolved", resolved_person=matches[0], display_name=matches[0].full_name)
    if len(matches) > 1:
        return IdentityResolutionResult(status="ambiguous", candidates=matches, display_name=owner_phrase)
    return IdentityResolutionResult(status="unclear", display_name=owner_phrase)


def resolve_pronoun_to_identity(
    db_path: str,
    token: str,
    session_entities: list[Any],
    active_person_id: Optional[str] = None,
) -> IdentityResolutionResult:
    """Resolve 'him', 'her', 'them', 'their', 'the person we discussed earlier' using ONLY session memory."""
    tl = token.strip().lower()
    gender_hint = "male" if tl in {"him", "he", "his"} else ("female" if tl in {"her", "she"} else None)

    cands = _find_session_people(db_path, session_entities, gender_hint=gender_hint)
    if active_person_id:
        active_p = get_person_by_id(db_path, active_person_id)
        if active_p and (gender_hint is None or active_p.gender in (gender_hint, "neutral")):
            if not any(p and p.id == active_p.id for p, _, _ in cands):
                cands.insert(0, (active_p, active_p.full_name, 1))

    if tl in {"them", "their", "they"}:
        if len(cands) >= 2:
            names = [name for _, name, _ in cands]
            # Multiple people in session -> keep structured records for relationship/dispatch clarity
            people_recs = [p for p, _, _ in cands if p is not None]
            return IdentityResolutionResult(
                status="ambiguous" if tl == "them" and len(cands) > 2 else "resolved",
                resolved_person=people_recs[0] if len(people_recs) == 1 else None,
                display_name=" and ".join(names),
                candidates=people_recs,
                reference_token=tl,
                reason=f"Resolved '{tl}' from session context ({', '.join(names)}).",
            )
        if len(cands) == 1:
            p_rec, name, _ = cands[0]
            return IdentityResolutionResult(
                status="resolved",
                resolved_person=p_rec,
                display_name=name,
                reference_token=tl,
                reason=f"Resolved '{tl}' to '{name}' from current conversation context.",
            )
        return IdentityResolutionResult(
            status="unclear",
            reference_token=tl,
            question="Who should I send this to?",
            reason=f"No compatible person exists in this conversation for '{tl}'.",
        )

    if len(cands) == 1:
        p_rec, name, turn = cands[0]
        return IdentityResolutionResult(
            status="resolved",
            resolved_person=p_rec,
            display_name=name,
            reference_token=tl,
            reason=f"Resolved '{tl}' to '{name}' from Turn {turn}.",
        )
    if len(cands) > 1:
        people_recs = [p for p, _, _ in cands if p is not None]
        names = [name for _, name, _ in cands]
        return IdentityResolutionResult(
            status="ambiguous",
            candidates=people_recs,
            reference_token=tl,
            question=f"Multiple people were mentioned earlier ({', '.join(names)}). Who do you mean by '{tl}'?",
            reason=f"Multiple compatible people in session context: {', '.join(names)}.",
        )
    return IdentityResolutionResult(
        status="unclear",
        reference_token=tl,
        question="Who should I send this to?",
        reason=f"No compatible person exists in this conversation to bind '{tl}'.",
    )


def _format_candidate_question(lead: str, candidates: list[PersonRecord]) -> str:
    opts = ", ".join(c.candidate_label() + (f" ({c.city})" if c.city and c.city not in c.candidate_label() else "") for c in candidates[:4])
    return f"{lead} Options: {opts}."


def resolve_recipient_reference(
    db_path: str,
    text: str,
    session_entities: list[Any],
    active_person_id: Optional[str] = None,
    session_suppliers: Optional[list[str]] = None,
) -> IdentityResolutionResult:
    """Resolve direct names, aliases, roles, relationships, and pronouns deterministically."""
    ensure_seeded(db_path)
    q = (text or "").strip()
    if not q:
        return IdentityResolutionResult(status="none")

    # 1. Contextual supplier / person discussed earlier ("the supplier we discussed earlier", "the person we discussed earlier")
    earlier_sup = re.search(r"\b(?:the\s+)?supplier\s+(?:we\s+)?(?:discussed|mentioned|talked\s+about)\s+earlier\b", q, re.IGNORECASE)
    if earlier_sup:
        sup_cands = [p for p in list_people(db_path) if p.category == "supplier"]
        discussed: list[PersonRecord] = []
        session_names = {str(getattr(e, "value", "")).lower() for e in (session_entities or [])}
        for sp in sup_cands:
            if (
                sp.full_name.lower() in session_names
                or (sp.organization and sp.organization.lower() in " ".join(session_names))
                or (session_suppliers and sp.supplier_id in session_suppliers)
            ):
                discussed.append(sp)
        if len(discussed) == 1:
            return IdentityResolutionResult(
                status="resolved",
                resolved_person=discussed[0],
                display_name=discussed[0].full_name,
                reference_token="the supplier we discussed earlier",
                reason=f"Resolved to {discussed[0].full_name} ({discussed[0].organization}) from current conversation.",
            )
        return IdentityResolutionResult(
            status="ambiguous",
            candidates=sup_cands,
            reference_token="the supplier we discussed earlier",
            question="Which supplier contact do you mean?",
        )

    earlier_person = re.search(r"\b(?:the\s+)?person\s+(?:we\s+)?(?:discussed|mentioned|talked\s+about)\s+earlier\b", q, re.IGNORECASE)
    if earlier_person:
        return resolve_pronoun_to_identity(db_path, "him/them", session_entities, active_person_id)

    # 2. Relational phrases: "<Person>'s <rel>" or "his/her/their/my <rel>" (supports lowercase & capitalized names)
    rel_m = re.search(
        r"\b(?P<owner>(?:[a-zA-Z]+(?:\s+[a-zA-Z]+)?(?:'s|’s)|(?i:his|her|their|my)))\s+"
        r"(?P<rel>(?i:(?:college\s+)?friend|classmate|colleague|manager|faculty\s+advisor|advisor|supplier(?:\s+contact)?|business\s+contact))\b",
        q,
    )
    if rel_m:
        raw_owner = rel_m.group("owner")
        owner_clean = re.sub(r"(?:'s|’s)$", "", raw_owner).strip()
        # Strip leading imperative/preposition words captured greedily (e.g. "Email Rahul" -> "Rahul")
        _owner_leading = {
            "email", "e-mail", "emial", "send", "tell", "message", "msg",
            "remind", "notify", "text", "forward", "ask", "call", "reach",
            "contact", "to", "for", "with", "from", "please", "about",
        }
        owner_parts = owner_clean.split()
        while len(owner_parts) > 1 and owner_parts[0].lower() in _owner_leading:
            owner_parts = owner_parts[1:]
        owner_clean = " ".join(owner_parts)
        rel_type = rel_m.group("rel").strip().lower()
        # Verify capitalization for possessive name owners so lowercase common nouns aren't misread
        if raw_owner.lower() not in {"his", "her", "their", "my"} or owner_clean:
            owner_res = _person_for_owner_phrase(db_path, owner_clean, session_entities, active_person_id)
            if owner_res.status == "unclear":
                return IdentityResolutionResult(
                    status="unclear",
                    reference_token=rel_m.group(0),
                    used_relationship=rel_type,
                    question=f"Whose {rel_type} should I contact?" if owner_clean.lower() in {"his", "her", "their"} else f"Who is {owner_clean}'s {rel_type}?",
                )
            if owner_res.status == "ambiguous":
                # Narrow to owners who actually have that relationship type in the graph
                narrowed: list[PersonRecord] = []
                for cand in owner_res.candidates:
                    if get_related_people(db_path, cand.id, rel_type):
                        narrowed.append(cand)
                if len(narrowed) == 1:
                    owner_res = IdentityResolutionResult(status="resolved", resolved_person=narrowed[0], display_name=narrowed[0].full_name)
                else:
                    return IdentityResolutionResult(
                        status="ambiguous",
                        candidates=owner_res.candidates,
                        reference_token=rel_m.group(0),
                        used_relationship=rel_type,
                        question=f"Which {owner_clean} do you mean?",
                    )
            if owner_res.status == "resolved" and owner_res.resolved_person:
                rel_hits = [p for p, _ in get_related_people(db_path, owner_res.resolved_person.id, rel_type)]
                if len(rel_hits) == 1:
                    target = rel_hits[0]
                    return IdentityResolutionResult(
                        status="resolved",
                        resolved_person=target,
                        display_name=target.full_name,
                        reference_token=rel_m.group(0),
                        used_relationship=rel_type,
                        reason=f"Resolved '{rel_m.group(0)}' to {target.full_name} via {owner_res.resolved_person.full_name}.",
                    )
                if len(rel_hits) > 1:
                    return IdentityResolutionResult(
                        status="ambiguous",
                        candidates=rel_hits,
                        reference_token=rel_m.group(0),
                        used_relationship=rel_type,
                        question=f"Which {rel_type} of {owner_res.resolved_person.full_name} do you mean?",
                    )
                return IdentityResolutionResult(
                    status="unclear",
                    reference_token=rel_m.group(0),
                    used_relationship=rel_type,
                    question=f"Who is {owner_res.resolved_person.full_name}'s {rel_type}?",
                )

    # 3. Role descriptors ("the warehouse manager", "our supplier")
    role_m = re.search(r"\b(?:to|for|with|from)?\s*(?:the|our)?\s*(warehouse\s+manager|supplier)\b", q, re.IGNORECASE)
    if role_m:
        phrase = role_m.group(1).strip().lower()
        role_matches, _ = search_people(db_path, phrase)
        if len(role_matches) == 1:
            p = role_matches[0]
            return IdentityResolutionResult(
                status="resolved",
                resolved_person=p,
                display_name=p.full_name,
                reference_token=role_m.group(0).strip(),
                reason=f"Resolved '{phrase}' to {p.full_name} ({p.org_role}).",
            )
        if len(role_matches) > 1:
            return IdentityResolutionResult(
                status="ambiguous",
                candidates=role_matches,
                reference_token=role_m.group(0).strip(),
                question="Which supplier contact do you mean?",
            )

    # 4. City-qualified or category-qualified names ("Ravi from Mangalore", "ravi personal", "person ravi", "Business Ravi")
    qualified_m = re.search(
        r"\b(?P<cand>(?i:Person|Personal|Business|Industrial|Supplier)\s+(?i:ravi)|(?i:ravi)\s+(?i:personal|person|business|industrial|supplier)|(?i:ravi)\s+(?i:from|in)\s+[a-zA-Z]+|(?i:ravi)\s+[A-Z][a-zA-Z]*|[A-Z][a-zA-Z]+\s+(?i:from|in)\s+[A-Z][a-zA-Z]+)\b",
        q,
    )
    if qualified_m:
        phrase = qualified_m.group("cand").strip()
        if phrase.lower() not in _NON_PERSON_CAPITALIZED:
            matches, confirm_alias = search_people(db_path, phrase)
            if len(matches) == 1:
                p = matches[0]
                if confirm_alias:
                    city_part = f" from {p.city}" if p.city else ""
                    return IdentityResolutionResult(
                        status="needs_confirm",
                        resolved_person=p,
                        display_name=p.full_name,
                        candidates=[p],
                        reference_token=phrase,
                        question=f"Do you mean {p.full_name}{city_part}?",
                    )
                return IdentityResolutionResult(
                    status="resolved",
                    resolved_person=p,
                    display_name=p.full_name,
                    reference_token=phrase,
                    reason=f"Matched {p.full_name} ({p.candidate_subtitle()}).",
                )

    # 5. Standalone recipient names after prepositions/verbs, indirect dispatch verbs, or standalone reply
    name_candidates: list[tuple[str, bool]] = []
    for pat, allow_ext in (
        (r"\b(?i:to|for|with|recipient\s*[:=]?|email|message|remind|notify|tell|text|contact)\s+(?:(?i:to)\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]{0,20})?)\b", True),
        (r"\b(?i:send|dispatch|ship|transfer|issue|deliver|give)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]{0,20})?)\b", False),
        (r"\b(?i:to|for|with|send|dispatch|ship|transfer|issue|deliver|give|email|message|remind|notify|tell|text|contact)\s+(?:(?i:to)\s+)?([a-z]{2,20}(?:\s+[a-z]{2,20})?)\b", False),
        (r"^\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]{0,20})?)\s*[.?!]?\s*$", True),
        (r"^\s*([a-zA-Z]+(?:\s+[a-zA-Z]+){0,3})\s*[.?!]?\s*$", False),
    ):
        for m in re.finditer(pat, q):
            cand = m.group(1).strip()
            if cand.lower() not in _NON_PERSON_CAPITALIZED and cand.lower() not in {"today", "tomorrow", "yesterday", "yes", "no", "maintenance", "warehouse"}:
                name_candidates.append((cand, allow_ext))

    for cand, allow_ext in name_candidates:
        matches, confirm_alias = search_people(db_path, cand)
        if not matches and not allow_ext and len(cand.split()) > 1:
            # Handle indirect-object phrases like "Send Ravi ...": retry single first token against known people
            first_tok = cand.split()[0]
            if first_tok.lower() not in _NON_PERSON_CAPITALIZED:
                matches, confirm_alias = search_people(db_path, first_tok)
                if matches:
                    cand = first_tok
        if len(matches) == 1:
            p = matches[0]
            if confirm_alias:
                city_part = f" from {p.city}" if p.city else ""
                return IdentityResolutionResult(
                    status="needs_confirm",
                    resolved_person=p,
                    display_name=p.full_name,
                    candidates=[p],
                    reference_token=cand,
                    question=f"Do you mean {p.full_name}{city_part}?",
                )
            return IdentityResolutionResult(
                status="resolved",
                resolved_person=p,
                display_name=p.full_name,
                reference_token=cand,
                reason=f"Resolved recipient to {p.full_name}.",
            )
        if len(matches) > 1:
            return IdentityResolutionResult(
                status="ambiguous",
                candidates=matches,
                reference_token=cand,
                question=f"Which {cand} do you mean?",
            )
        if allow_ext and len(cand.split()) >= 2:
            # Explicit multi-word name not matching any conflicting identity -> external named recipient
            return IdentityResolutionResult(
                status="external_named",
                display_name=cand,
                reference_token=cand,
                reason=f"External named recipient '{cand}'.",
            )

    # 6. Pronoun fallback ("him", "her", "them") when no explicit person name matched
    pron_m = re.search(r"\b(?:to|for|with|tell|email|message|remind|notify)\s+(him|her|them)\b", q, re.IGNORECASE)
    if not pron_m:
        pron_m = re.search(r"\b(him|her|them)\b", q, re.IGNORECASE)
    if pron_m:
        return resolve_pronoun_to_identity(db_path, pron_m.group(1), session_entities, active_person_id)

    return IdentityResolutionResult(status="none")


def _ensure_self_person(conn: Any, now: str) -> None:
    conn.execute(
        """
        INSERT OR IGNORE INTO people (
            id, full_name, first_name, gender, category, data_origin, notes, created_at, updated_at
        ) VALUES ('PER-USER-SELF', 'User', 'User', 'neutral', 'self', 'USER_PROVIDED', 'Speaker node for user relationships', ?, ?);
        """,
        (now, now),
    )


def _upsert_user_person(db_path: str, name: str, city: Optional[str] = None, category: str = "personal") -> PersonRecord:
    matches, _ = search_people(db_path, name, city_hint=city)
    if len(matches) == 1:
        return matches[0]
    clean = " ".join(w.capitalize() for w in name.strip().split())
    first = clean.split()[0]
    slug = re.sub(r"[^a-z0-9]+", "-", clean.lower()).strip("-")[:24] or "contact"
    pid = f"PER-USR-{slug.upper()}-{uuid.uuid4().hex[:6].upper()}"
    now = _utc_now()
    with get_connection(db_path) as conn:
        existing = conn.execute(
            "SELECT * FROM people WHERE lower(full_name) = lower(?) AND coalesce(lower(city), '') = coalesce(lower(?), '') AND lower(category) = lower(?);",
            (clean, city or "", category),
        ).fetchone()
        if existing:
            return _row_to_person(existing)
        conn.execute(
            """
            INSERT INTO people (
                id, full_name, first_name, aliases_json, gender, city, category, data_origin, notes, created_at, updated_at
            ) VALUES (?, ?, ?, '[]', 'neutral', ?, ?, 'USER_PROVIDED', 'Added from user conversation statement.', ?, ?);
            """,
            (pid, clean, first, city, category, now, now),
        )
        row = conn.execute("SELECT * FROM people WHERE id = ?;", (pid,)).fetchone()
    return _row_to_person(row)


def learn_user_identity_facts(
    db_path: str,
    text: str,
) -> tuple[list[dict[str, Any]], Optional[PersonRecord]]:
    """Persist declarative relationship/identity assertions stated by the user.

    Example: 'Ravi Shetty is my friend. Rahul is his college friend.'
    Distinguishes user-provided records with data_origin='USER_PROVIDED'.
    Returns (facts_learned, last_anchor_person).
    """
    ensure_seeded(db_path)
    if not text or not text.strip():
        return [], None

    facts: list[dict[str, Any]] = []
    anchor: Optional[PersonRecord] = None
    now = _utc_now()
    clauses = [c.strip() for c in re.split(r"[.;\n]+", text) if c.strip()]

    for clause in clauses:
        # Pattern 1: "<Name> is my/our <rel>"
        m_my = re.match(
            r"^(?P<a>[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+is\s+(?:my|our)\s+(?P<rel>(?:college\s+)?friend|classmate|colleague|manager|contact)\s*$",
            clause,
            re.IGNORECASE,
        )
        if m_my:
            name_a = m_my.group("a").strip()
            rel = m_my.group("rel").strip().lower().replace(" ", "_")
            person_a = _upsert_user_person(db_path, name_a)
            with get_connection(db_path) as conn:
                _ensure_self_person(conn, now)
                conn.execute(
                    """
                    INSERT OR IGNORE INTO person_relationships (
                        person_id, related_person_id, relationship_type, shared_context, data_origin, created_at
                    ) VALUES ('PER-USER-SELF', ?, ?, 'Stated by user', 'USER_PROVIDED', ?);
                    """,
                    (person_a.id, rel, now),
                )
            anchor = person_a
            facts.append({"subject": person_a.full_name, "relationship": rel, "object": "User", "data_origin": "USER_PROVIDED"})
            continue

        # Pattern 2: "<NameB> is his/her/their/<Owner>'s <rel>"
        m_rel = re.match(
            r"^(?P<b>[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+is\s+(?P<owner>his|her|their|[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:'s|’s))\s+"
            r"(?P<rel>(?:college\s+)?friend|classmate|colleague|manager|business\s+contact|supplier(?:\s+contact)?)\s*$",
            clause,
            re.IGNORECASE,
        )
        if m_rel:
            name_b = m_rel.group("b").strip()
            raw_owner = m_rel.group("owner").strip()
            rel = m_rel.group("rel").strip().lower().replace(" ", "_")
            owner_person: Optional[PersonRecord] = None
            if raw_owner.lower() in {"his", "her", "their"}:
                owner_person = anchor
            else:
                owner_clean = re.sub(r"(?:'s|’s)$", "", raw_owner).strip()
                owner_matches, _ = search_people(db_path, owner_clean)
                if len(owner_matches) == 1:
                    owner_person = owner_matches[0]
            if owner_person is not None:
                # If owner already has a matching first name in their relationship graph, reuse it cleanly
                existing_rel = get_related_people(db_path, owner_person.id, rel.replace("_", " "))
                matched_existing = [
                    p for p, _ in existing_rel
                    if p.full_name.lower() == name_b.lower() or p.first_name.lower() == name_b.lower()
                ]
                person_b = matched_existing[0] if len(matched_existing) == 1 else _upsert_user_person(db_path, name_b)
                with get_connection(db_path) as conn:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO person_relationships (
                            person_id, related_person_id, relationship_type, shared_context, data_origin, created_at
                        ) VALUES (?, ?, ?, 'Stated by user', 'USER_PROVIDED', ?);
                        """,
                        (owner_person.id, person_b.id, rel, now),
                    )
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO person_relationships (
                            person_id, related_person_id, relationship_type, shared_context, data_origin, created_at
                        ) VALUES (?, ?, ?, 'Stated by user', 'USER_PROVIDED', ?);
                        """,
                        (person_b.id, owner_person.id, rel, now),
                    )
                facts.append(
                    {
                        "subject": person_b.full_name,
                        "relationship": rel,
                        "object": owner_person.full_name,
                        "data_origin": "USER_PROVIDED",
                    }
                )
    return facts, anchor


def looks_like_pure_fact_statement(text: str) -> bool:
    """True when user states identity/relationship context without an operational command."""
    if re.search(
        r"\b(send|ship|dispatch|transfer|issue|deliver|email|message|remind|notify|tell|forward|check|show|list|what|which|how|approve|reject|convert|calculate)\b",
        text,
        re.IGNORECASE,
    ):
        return False
    return bool(
        re.search(
            r"\bis\s+(?:my|our|his|her|their|[A-Z][a-zA-Z]+(?:'s|’s))\s+(?:(?:college\s+)?friend|classmate|colleague|manager|contact)\b",
            text,
            re.IGNORECASE,
        )
    )


def get_slot_state(db_path: str, conversation_id: str) -> dict[str, Any]:
    """Retrieve persisted workflow slots and candidate options for a single conversation."""
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM conversation_context_state WHERE conversation_id = ?;",
            (conversation_id,),
        ).fetchone()
    if not row:
        return {
            "conversation_id": conversation_id,
            "workflow_type": None,
            "pending_slot": None,
            "slots": {},
            "candidate_options": [],
            "resolved_entities": [],
        }
    return {
        "conversation_id": conversation_id,
        "workflow_type": row["workflow_type"],
        "pending_slot": row["pending_slot"],
        "slots": json.loads(row["slots_json"] or "{}"),
        "candidate_options": json.loads(row["candidate_options_json"] or "[]"),
        "resolved_entities": json.loads(row["resolved_entities_json"] or "[]"),
    }


def upsert_slot_state(
    db_path: str,
    conversation_id: str,
    workflow_type: Optional[str],
    pending_slot: Optional[str],
    slots: dict[str, Any],
    candidate_options: list[dict[str, Any]] | None = None,
    resolved_entities: list[dict[str, Any]] | None = None,
) -> None:
    """Persist structured slot state and candidate cards for browser refresh recovery."""
    now = _utc_now()
    with get_connection(db_path) as conn:
        exists = conn.execute(
            "SELECT 1 FROM conversations WHERE id = ?;", (conversation_id,)
        ).fetchone()
        if not exists:
            return
        conn.execute(
            """
            INSERT INTO conversation_context_state (
                conversation_id, workflow_type, pending_slot, slots_json,
                candidate_options_json, resolved_entities_json, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(conversation_id) DO UPDATE SET
                workflow_type = excluded.workflow_type,
                pending_slot = excluded.pending_slot,
                slots_json = excluded.slots_json,
                candidate_options_json = excluded.candidate_options_json,
                resolved_entities_json = excluded.resolved_entities_json,
                updated_at = excluded.updated_at;
            """,
            (
                conversation_id,
                workflow_type,
                pending_slot,
                json.dumps(slots),
                json.dumps(candidate_options or []),
                json.dumps(resolved_entities or []),
                now,
            ),
        )
