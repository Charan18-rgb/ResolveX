# ResolveX — Team Contributions

Contributions are described by subsystem, based on actual code ownership in
the repository and git history. Individual names are not attributed here —
the repo's commit history and `audit/AUTONOMOUS_COMPLETION_LOG.md` record the
work performed.

## Backend contributions

- **FastAPI architecture** — `backend/app/main.py` app factory, routers in
  `app/api/` (analysis, ops, inventory, purchase orders, alerts, email,
  evaluation), CORS, structured error envelopes.
- **Gemini integration** — `app/services/gemini_service.py` (google-genai
  client, tenacity retries, timeouts) + `app/services/prompts.py`
  (structured-output prompts and taxonomy).
- **NLU pipeline (PS6)** — `app/core/`: `ambiguity_detector`,
  `clarification_engine`, `communication_parser`, `confidence_engine`,
  `context_analyzer`, `intent_resolver`, `local_analyzer`, `risk_engine`,
  `task_router`; orchestration in `app/services/conversation_service.py`.
- **Persistence** — `app/database/`: `connection.py` (schema),
  `migrations.py` (versioned, idempotent — incl. `message_drafts` and
  `messages.card_json`), `operations.py` (all CRUD).
- **Business engines (PS2)** — `app/inventory/` (availability calculator,
  shortage detector, allocation engine, order risk engine, purchase-order
  engine, event processor, seed) and `app/ops/` (warehouse, supplier, order
  services).
- **Conversation history APIs** — `PATCH`/`DELETE /api/conversations/{id}`,
  `GET /api/conversations` with `card_json` + `draft` in detail
  (`analysis_routes.py`).
- **Ops query endpoint** — `app/api/ops_routes.py`: deterministic card
  routing, communication/draft handling, conversation + draft persistence.
- **Email architecture** — `app/services/email_service.py` +
  `app/api/email_routes.py`: Gmail OAuth2 flow, status, confirmed send —
  gated, currently unconfigured.
- **Validation & errors** — Pydantic schemas (`app/models/`), role-gated
  operator endpoints with audit logging, global exception handlers.
- **Evaluation** — `app/evaluation/ps6_evaluator.py` + `ps2_evaluator.py`,
  `GET /api/evaluation/ps6`, 72-case dataset, self-cleaning eval
  conversations.
- **Backend tests** — `backend/tests/` (unit + milestone suites, 72 tests).

## Frontend contributions

- **React + TypeScript + Vite/TanStack Start** — routing, app shell, build.
- **Chat interface** — `src/routes/index.tsx`: send pipeline (ops-first,
  NLU fallback), suggestions, history sidebar + mobile drawer, welcome
  states.
- **Conversation history UX** — `src/lib/convState.ts` (per-conversation
  state isolation), `HistoryItems`, rename/delete via
  `components/chat/ConversationDialogs.tsx` (accessible dialogs).
- **Interactive cards** — `components/chat/OpsCardView.tsx` renders every
  card type incl. restored `card_json` payloads and `message_draft` cards.
- **3D warehouse** — `components/warehouse/WarehouseScene3D.tsx`.
- **API clients** — `src/services/api.ts`, `src/services/opsApi.ts`.
- **State management** — `src/context/ResolveXContext.tsx` (settings, demo
  role, live-data views).
- **PS6 demo pages** — analysis / interpretations / clarification /
  resolution / visualization routes with explainability panels
  (`components/resolvex/`).
- **Frontend tests** — `src/test/` Vitest suites (32 tests) incl. new
  conversation-state isolation coverage.

## Verification evidence

Backend pytest **72/72**, Vitest **32/32**, `tsc --noEmit` clean, production
build green, live browser verification of chat, history, cards, drafts,
clarification and dialogs. See `audit/` for the full audit trail.
