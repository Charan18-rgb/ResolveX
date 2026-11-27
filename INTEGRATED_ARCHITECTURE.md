# ResolveX — Integrated Architecture (PS6 + PS2)

**Tagline:** *Understand the Unclear. Resolve the Intent.*  
**Architecture Style:** Modular Monolith (FastAPI + SQLite + `google-genai`)

## 1. Architectural Principle
- **PS6 (Language Intelligence Engine)** understands natural-language instructions, detects ambiguity, asks minimal clarification, maintains context, and resolves structured intent.
- **PS2 (Inventory Intelligence Engine)** performs all inventory accounting, BOM expansion, allocation, CRD risk, projected ship date, and shortage/proposal calculations **deterministically in Python**.
- **Strict Separation of Authority:** Gemini never invents stock numbers, allocations, or ship dates. Gemini only handles NLU/disambiguation (PS6) and data-grounded explanations/briefings (PS2). If Gemini is unavailable, all deterministic PS2 endpoints continue operating normally.
- **Human-in-the-Loop Guardrail:** No purchase order is finalized (`APPROVED`) and no supplier email is sent without explicit human approval via `POST /api/purchase-orders/proposals/{proposal_id}/approve`.

## 2. Unified Request Flows

### Flow A: Natural Language Instruction / Operational Query (PS6 + PS2)
1. `POST /api/analyze` (or `POST /api/clarify`) validates input and loads conversation history (`ContextAnalyzer`).
2. `AmbiguityDetector` + `GeminiService` classifies input (`clear`, `ambiguous`, `incomplete`, `context_dependent`).
3. If ambiguous/incomplete: `InterpretationEngine` + `ClarificationEngine` returns interpretations and deduplicated questions.
4. If clear/resolved: `TaskRouter` checks if the intent is an **inventory/order operational query** (e.g., *"Show me at-risk orders and what we need to buy"*).
   - If operational: queries PS2 deterministic engines (`inventory_service`, `order_risk_engine`, `shortage_detector`), passes **verified SQLite numbers** to `GeminiService` for a grounded explanation, and optionally creates a `PENDING_APPROVAL` PO proposal.
   - If general/non-inventory: returns the resolved PS6 intent directly (`direct_answer` when applicable).

### Flow B: Direct Deterministic Inventory Operations (PS2 Standalone)
1. `POST /api/inventory/events` ingests events (`STOCK_RECEIVED`, `ORDER_CREATED`, etc.) idempotently by `event_id`; duplicates are flagged `DUPLICATE` without re-applying; malformed payloads are quarantined and raise a `FEED_FAILURE` alert.
2. `InventoryService` updates balances (`Net Availability = On-Hand + Incoming - Allocated`), triggers `AllocationEngine` (Earliest-CRD-First), `OrderRiskEngine`, `ShortageDetector`, and `AlertService`.
3. `Procurement` endpoints list `PENDING_APPROVAL` proposals and require `PROCUREMENT_MANAGER` or `ADMIN` role to approve/reject.
