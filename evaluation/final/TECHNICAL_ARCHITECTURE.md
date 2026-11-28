# ResolveX — Technical Architecture

## 1. System overview

```
┌────────────────────────────┐         ┌──────────────────────────────────┐
│  React + Vite + TypeScript │  HTTPS  │  FastAPI (Python)                │
│  TanStack Router/Start     │ ──────► │  ├─ /api/analyze /clarify /resolve│
│  Chat UI + Ops cards + 3D  │  JSON   │  ├─ /api/ops/query                │
│  warehouse                  │ ◄────── │  ├─ /api/conversations (CRUD)     │
└────────────────────────────┘         │  ├─ /api/inventory|warehouse|     │
                                       │  │  suppliers|orders|procurement  │
                                       │  ├─ /api/evaluation/ps6           │
                                       │  └─ /api/email/* (Gmail OAuth)    │
                                       └───────────┬──────────────────────┘
                                                   │
                          ┌────────────────────────┼─────────────────────┐
                          ▼                        ▼                     ▼
                   Google Gemini API          SQLite (resolvex.db)   Deterministic
                   gemini-3.8-flash           conversations,        engines
                   structured JSON output     messages(+card_json),  availability,
                                              drafts, inventory,     shortages,
                                              orders, suppliers,     allocation,
                                              warehouses, audit      order risk
```

## 2. Request flow (two pipelines)

Every chat message hits `/api/ops/query` first
(`backend/app/api/ops_routes.py::ops_query`). The endpoint is split into a
pure router (`_ops_query_impl`) and a persistence wrapper:

1. **Draft injection** — if a `conversation_id` is supplied, the persisted
   draft (`message_drafts` table) is injected into context when the client
   has no session copy, so draft edits work after refresh.
2. **Deterministic routing** — keyword/regex routing sends business questions
   to verified datasets: inventory overview, shortages, warehouse capacity,
   material location, supplier performance/comparison, order risk/timeline,
   deliveries, purchase orders. Communication requests go to
   `_message_draft_card`, which uses `communication_parser` (Gemini +
   deterministic fallback) for recipient/body/tone extraction.
3. **Persistence** — non-`help` cards create or extend a conversation
   (`RESOLVED`, messages + `card_json`), upsert/clear `message_drafts`, and
   return `conversation_id`. `help` cards are *not* persisted so the client
   can fall through.
4. **NLU fallback** — `help` responses fall through in the frontend to
   `/api/analyze` (`backend/app/api/analysis_routes.py`), which runs the PS6
   pipeline.

## 3. PS6 NLU pipeline

`start_conversation` / `continue_conversation`
(`backend/app/services/conversation_service.py`):

1. Persist conversation + user message (`database/operations.py`).
2. Build session memory (`core/context_analyzer.py`) — prior turns, resolved
   references, conflicts.
3. `core/ambiguity_detector.py` → Gemini structured analysis via
   `services/gemini_service.py` + `services/prompts.py`, reconciled with
   deterministic checks (`core/local_analyzer.py`). Produces classification
   (`clear` / `ambiguous` / `incomplete` / `context_dependent`), ambiguity
   types, interpretations.
4. `core/clarification_engine.py` generates targeted questions;
   `core/confidence_engine.py` scores confidence and can abstain.
5. `core/intent_resolver.py` + `core/task_router.py` produce a
   `resolved_intent` with `direct_answer` for clear requests.
6. `core/risk_engine.py` assesses action risk; consequential actions require
   authorized roles.

**LLM vs deterministic boundary:** Gemini interprets *language* (intent,
entities, ambiguity, clarification phrasing). All *business facts* — stock
levels, prices, order status, supplier stats — are computed by deterministic
Python/SQL. The LLM never invents inventory numbers; it only structures the
request.

## 4. Persistence

SQLite via `app/database/connection.py` (`init_db`, `SCHEMA_SQL`) and
`migrations.py` (idempotent versioned migrations, currently v4). Key tables:
`conversations`, `messages` (incl. `card_json`), `clarification_questions`,
`interpretations`, `resolved_intents`, `message_drafts`, `confidence_snapshots`,
plus PS2 inventory/orders/procurement/warehouse tables. All conversation
children cascade on delete.

## 5. Frontend

- `frontend/src/routes/index.tsx` — chat homepage: send pipeline, history
  sidebar + mobile drawer, rename/delete dialogs.
- `frontend/src/lib/convState.ts` — per-conversation UI state (pending
  clarification, active draft) keyed by conversation id.
- `frontend/src/services/api.ts` + `opsApi.ts` — typed FastAPI clients.
- `frontend/src/components/chat/OpsCardView.tsx` — renders all card types.
- `frontend/src/components/chat/ConversationDialogs.tsx` — accessible
  rename/delete dialogs.
- `frontend/src/components/warehouse/WarehouseScene3D.tsx` — React Three
  Fiber 3D warehouse.
- State: `context/ResolveXContext.tsx` (settings, role, live-data views).

## 6. Validation, errors, fallback

- Pydantic models (`app/models/schemas.py`, `ai_schemas.py`) validate all
  request/response payloads; Gemini output is schema-constrained.
- `gemini_service` uses tenacity retries, timeouts, and records
  `provenance` (`live_backend` vs `ai_unavailable_abstained`) per result —
  fallback results are labelled, never passed off as live AI.
- Ops persistence is best-effort: DB failures never break a card response.
- Global exception handlers return structured `ErrorResponse` envelopes.

## 7. Security posture (demo scope)

- `X-User-Role` header gates operator analytics (`ADMIN`/`OPERATOR`) and is
  written to `system_audit_logs`. **This is demo-level, client-controlled
  auth — not production authentication.**
- No secrets in the repo (`.env` gitignored; `.env.example` documents vars).
- Parameterised SQL only; CORS restricted via `ALLOWED_ORIGINS`.
