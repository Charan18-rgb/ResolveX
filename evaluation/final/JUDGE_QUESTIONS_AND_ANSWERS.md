# ResolveX — Judge Questions & Answers (35)

## NLU / PS6

**1. Why Gemini?**
It gives structured JSON interpretation of messy language (pronouns,
relationships, spelling) far better than regex. Output is schema-validated
and reconciled with deterministic checks.

**2. Why not use only an LLM?**
Because business facts must be exact. Stock, prices, order status and supplier
stats are computed by SQL/Python. The LLM only structures language — it can
never hallucinate an inventory number because it never produces one.

**3. How is ambiguity detected?**
Gemini classifies each instruction (`clear` / `ambiguous` / `incomplete` /
`context_dependent`) with typed ambiguity tags (missing recipient, pronoun,
date, relationship…), reconciled against deterministic detectors in
`local_analyzer.py`.

**4. How is context preserved?**
`context_analyzer.py` builds session memory per `conversation_id` — prior
turns, resolved entities, reference conflicts — so "him"/"it"/"that date"
resolve against the conversation.

**5. What happens when Gemini fails?**
Tenacity retries with timeout; on exhaustion the deterministic fallback
produces a labelled result (`provenance=ai_unavailable_abstained`) counted in
`fallback_cases_count` — never disguised as live AI.

**6. How are hallucinations controlled?**
Structured output schemas, deterministic business layer, confidence
assessment with abstention, risk engine gating consequential actions, and
explicit "not sent"/"draft only" states.

**7. How does the system prevent incorrect actions?**
It asks clarification instead of guessing; caps clarification turns; requires
role authorization for consequential ops; drafts require explicit confirmation;
reopening conversations is read-only.

**8. What is deterministic?**
Routing, all business calculations (availability, shortages, allocation,
order risk, supplier stats), draft templating, persistence, validation.

**9. What is AI-powered?**
Language interpretation: intent, entities, ambiguity classification,
interpretation phrasing, clarification questions, pronoun resolution.

**10. How are conversations stored?**
SQLite — `conversations`, `messages` (with `card_json`),
`clarification_questions`, `interpretations`, `resolved_intents`,
`message_drafts`, `confidence_snapshots`. FK cascades on delete.

**11. What happens after refreshing?**
Everything server-persisted restores: messages, interactive cards, the active
draft, and pending-clarification state. Session-only UI state resets cleanly.

**12. What are the current limitations?**
Gmail not connected (drafts only); demo header auth; seeded demo data;
Gemini live variance on borderline labels; card history for drafts shows the
latest draft only; no official PS6 dataset — our own 72-case labelled set.

**13. What would production require?**
Real auth (JWT/OIDC), Gmail/SMTP credentials, real data connectors, rate
limiting, audit hardening, and a hosted DB.

**14. How is this different from a normal chatbot?**
A chatbot answers text. ResolveX resolves *intent*: detects ambiguity,
maintains typed conversation state, asks minimal clarifications, routes to
verified data engines, persists structured cards, and refuses unsafe guesses.

**15. How do you measure success?**
72-case labelled benchmark: P/R/F1 = 0.9412 on clarification detection vs
0.4348 naive baseline; classification accuracy 0.8056; FCR 0.0417. Metrics
recomputed from raw predictions; fallback cases counted honestly.

## PS2 / operations

**16. How is inventory calculated?**
`available = on_hand + incoming − allocated` per material, from
`inventory_balances`, `supplier_deliveries` and `material_allocations`.

**17. What are reserved vs incoming?**
Reserved = allocated to orders; incoming = undelivered purchase/supplier
shipments. Available nets both out.

**18. How are shortages detected?**
Materials at/below reorder point or at zero → `shortage_detector` +
`inventory_alerts`; feeds purchase-order proposals.

**19. How does warehouse capacity work?**
Configured bins have capacity/stored/reserved/incoming quantities;
`warehouse_service` aggregates per zone; 3D scene renders the same data.

**20. How are delayed orders identified?**
`order_risk_engine` compares required dates vs projected ship dates built
from allocation coverage + material shortages + delivery ETAs.

**21. How do suppliers get scored?**
On-time rate, late/failed/cancelled counts, average delay — computed from
`supplier_deliveries` history.

**22. How are purchase orders approved?**
`purchase_order_engine` proposes POs; `approval_service` requires
`PROCUREMENT_MANAGER`/`ADMIN` role — human-in-the-loop by design.

**23. Is the supplier data real?**
No — it's seeded demo data (`seed.py`, `seed_ops.py`), internally consistent
but not verified real-world data.

## Architecture / engineering

**24. Why FastAPI + SQLite?**
FastAPI gives typed async APIs + Pydantic validation + OpenAPI; SQLite gives
zero-dependency, file-based persistence ideal for a hackathon demo while
keeping real relational semantics and FK cascades.

**25. How does the frontend talk to the backend?**
Typed TS clients (`services/api.ts`, `opsApi.ts`) → JSON over HTTP;
`X-User-Role` header carries the demo role.

**26. How do cards persist and restore?**
Assistant messages store `card_json`; conversation detail returns it;
`OpsCardView` re-renders — read-only, no recomputation.

**27. How do drafts persist?**
`message_drafts` table keyed by conversation; upserted on every draft card,
cleared when superseded; injected server-side when the client lacks a copy.

**28. What stops state leaking between conversations?**
`convState` store keys pending-clarification and drafts by conversation id;
new chats use a clean `__new__` key; delete clears the key.

**29. How is auth handled?**
Demo-level `X-User-Role` header gates operator endpoints and writes audit
logs. **Not production authentication** — stated plainly.

**30. What happens on API errors?**
Structured error envelopes, ops persistence is best-effort (never breaks a
card), NLU falls back to deterministic analysis, UI shows professional
error/empty/loading states.

**31. How do you prevent duplicate sends/messages?**
`sendingRef` guard + disabled submit; server-side turn counting; idempotent
upserts for drafts.

**32. Why React Three Fiber?**
For the interactive 3D warehouse — clickable bins, product search, zone
capacity — with a 2D fallback.

**33. Difficult: isn't the LLM just a wrapper?**
No — it performs genuine NLU (ambiguity taxonomy, interpretations,
clarification phrasing, context resolution) that regex cannot; but it is
deliberately fenced off from facts and actions.

**34. Difficult: how do you know the benchmark is honest?**
Metrics are recomputed from raw `results_detail`; provenance flags label
fallback cases; dataset labels were corrected only where logically
impossible; no official PS6 doc exists so ours is documented as custom.

**35. Difficult: what breaks first in production?**
Auth (header is client-controlled), Gmail credentials, seeded data, Gemini
quota/latency, and multi-user concurrency on SQLite.
