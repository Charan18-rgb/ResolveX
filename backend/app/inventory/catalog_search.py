"""Deterministic catalog search across product names, SKUs, categories, aliases, and common typos."""

from __future__ import annotations

from difflib import SequenceMatcher
import re
from typing import Optional

from app.inventory.availability_calculator import get_inventory_overview
from app.models.inventory_schemas import MaterialOverview


_MISSPELLINGS = {
    "scru": "screw",
    "scrujack": "screw jack",
    "screwjack": "screw jack",
    "alumunium": "aluminium",
    "aluminum": "aluminium",
    "baring": "bearing",
    "barings": "bearing",
    "bearings": "bearing",
    "valv": "valve",
    "valvs": "valve",
    "valves": "valve",
    "motr": "motor",
    "motors": "motor",
    "pmp": "pump",
    "pumps": "pump",
    "wrech": "wrench",
    "helmt": "helmet",
    "helmets": "helmet",
    "gogle": "goggle",
    "gogles": "goggle",
    "goggles": "goggles",
    "bolts": "bolt",
    "nuts": "nut",
    "washers": "washer",
    "gears": "gear",
    "pipes": "pipe",
    "relays": "relay",
    "breakers": "breaker",
    "cables": "cable",
    "gloves": "glove",
    "kits": "kit",
}

_STOPWORDS = {
    "a", "an", "the", "to", "for", "of", "in", "on", "at", "and", "or", "with",
    "me", "my", "our", "us", "you", "your", "he", "she", "it", "its", "they", "them", "their",
    "this", "that", "these", "those", "there", "here", "all", "any", "some", "which", "who",
    "can", "could", "would", "should", "will", "just", "only", "still", "also", "then",
    "send", "ship", "transfer", "dispatch", "issue", "deliver", "give", "pass", "get", "tell", "list",
    "check", "show", "find", "where", "is", "are", "how", "much", "many", "what", "about",
    "do", "we", "have", "stock", "inventory", "material", "materials", "product",
    "products", "item", "items", "please", "need", "want", "from", "stored", "located",
    "availability", "available", "left", "count", "status", "level", "current",
    "shortage", "shortages", "low", "reorder", "order", "orders", "risk", "risks",
    "report", "summary", "overview", "purchase", "pending", "approve", "approval",
}


def _normalize_phrase(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9-]+", " ", text.lower()).strip()
    tokens: list[str] = []
    for tok in cleaned.split():
        mapped = _MISSPELLINGS.get(tok, tok)
        if len(mapped) > 3 and mapped.endswith("s") and not mapped.endswith("ss"):
            mapped = mapped[:-1]
        tokens.append(mapped)
    return " ".join(tokens)


def _content_tokens(text: str) -> list[str]:
    norm = _normalize_phrase(text)
    return [t for t in norm.split() if len(t) >= 2 and t not in _STOPWORDS]


def search_materials(
    db_path: str,
    query: str,
    category: Optional[str] = None,
    limit: int = 10,
) -> list[MaterialOverview]:
    """
    Search materials deterministically by exact ID/SKU, name, category, aliases,
    and fuzzy spelling similarity. Returns highest-scoring matches first.
    """
    overview = get_inventory_overview(db_path)
    items = overview.materials
    if category and category.strip() and category.strip().lower() != "all":
        cat_l = category.strip().lower()
        items = [m for m in items if m.category.lower() == cat_l]

    raw_q = query.strip()
    if not raw_q:
        return items[:limit]

    q_upper = raw_q.upper()
    q_norm = _normalize_phrase(raw_q)
    q_tokens = _content_tokens(raw_q)
    if not q_tokens and not any(x in q_upper for x in ("MAT-", "SKU-")):
        return []

    scored: list[tuple[float, MaterialOverview]] = []
    for m in items:
        score = 0.0
        # 1. Exact ID or SKU token match
        if m.id.upper() in q_upper or m.sku.upper() in q_upper:
            score += 100.0

        name_norm = _normalize_phrase(m.name)
        alias_norms = [_normalize_phrase(a) for a in m.aliases]
        cat_norm = _normalize_phrase(m.category)
        desc_norm = _normalize_phrase(m.description)

        # 2. Direct phrase match against name or aliases
        if q_norm and (q_norm == name_norm or q_norm in alias_norms):
            score += 80.0
        elif q_norm and (q_norm in name_norm or any(q_norm in a for a in alias_norms)):
            score += 55.0

        # Check if full alias appears inside query ("send screw jack to ravi")
        for a_norm in alias_norms:
            if a_norm and re.search(rf"\b{re.escape(a_norm)}\b", q_norm):
                score += 65.0
                break

        # 3. Token overlap & fuzzy typo tolerance against name, aliases, category
        core_tokens = set(_content_tokens(f"{m.name} {' '.join(m.aliases)} {m.category}"))
        desc_tokens = set(_content_tokens(m.description))
        matched_tokens = 0
        core_matched = 0
        max_matched_len = 0
        for qt in q_tokens:
            long_tok = len(qt) >= 4
            if qt in core_tokens or (long_tok and (qt in name_norm or any(qt in a for a in alias_norms))):
                matched_tokens += 1
                core_matched += 1
                max_matched_len = max(max_matched_len, len(qt))
                score += 18.0
            elif long_tok and (qt in desc_tokens or qt in desc_norm or qt in cat_norm):
                matched_tokens += 1
                score += 6.0
            else:
                # Strict fuzzy typo check (requires >=4 chars & high similarity so random words don't match)
                best_ratio = (
                    max((SequenceMatcher(None, qt, ht).ratio() for ht in core_tokens), default=0.0)
                    if long_tok
                    else 0.0
                )
                if best_ratio >= 0.84:
                    matched_tokens += 1
                    core_matched += 1
                    max_matched_len = max(max_matched_len, len(qt))
                    score += 12.0 * best_ratio

        has_phrase_or_id = score >= 40.0
        if has_phrase_or_id:
            scored.append((score, m))
        elif len(q_tokens) == 1 and core_matched == 1 and (max_matched_len >= 4 or qt in {"oil", "nut", "rod"}):
            scored.append((score, m))
        elif len(q_tokens) >= 2 and (core_matched >= 2 or (core_matched == 1 and len(q_tokens) <= 2 and max_matched_len >= 4)):
            scored.append((score, m))

    scored.sort(key=lambda pair: (-pair[0], pair[1].id))
    if not scored:
        return []
    top_score = scored[0][0]
    # When a strong phrase/SKU/alias match exists, drop incidental single-token overlaps
    # (e.g. "ball" in "ball valve" shouldn't pull in "Ball Bearing").
    if top_score >= 60.0:
        min_keep = max(45.0, top_score * 0.55)
        scored = [(sc, m) for sc, m in scored if sc >= min_keep]
    return [m for _, m in scored[:limit]]
