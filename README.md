# ResolveX — Understand the Unclear. Resolve the Intent.

ResolveX is a conversational business operations platform. A chatbot-first
interface lets users ask questions in plain language about inventory, warehouse
storage, supplier reliability, order fulfilment and procurement — and gets back
verified answers with live data visualizations.

---

## What ResolveX does

### Conversational business assistant (homepage)
- The chatbot is the primary interface: sidebar with conversation history,
  suggested questions, and contextual response cards.
- Business questions are routed deterministically to the right dataset and
  rendered as inline cards (inventory summary, shortages, storage map, supplier
  comparison, order risk, purchase orders).
- Ambiguous instructions are detected, multiple interpretations are generated,
  and targeted clarification questions preserve conversation context across
  turns (`analyze → clarify → resolve`).

### Inventory intelligence
- Net availability (`on_hand + incoming − allocated`), safety-stock monitoring,
  low/out-of-stock detection, and shortage reporting — all computed from
  SQLite, never guessed.
- Deterministic material allocation (earliest customer-required-date first) and
  order delivery-risk assessment with projected ship dates.
- Human-in-the-loop purchase-order proposals with role-gated approval
  (`PROCUREMENT_MANAGER` / `ADMIN`).

### Warehouse management
- Configured warehouse layout: zones, racks, shelves, bins with capacity,
  stored, reserved and incoming quantities.
- Interactive 3D warehouse visualization (React Three Fiber) with rotate/zoom,
  clickable bins, product search and location highlighting; a 2D map is kept as
  a fallback view.

### Supplier intelligence
- Per-supplier delivery performance computed from recorded delivery history:
  on-time rate, late/failed/cancelled counts, average delay, pending deliveries,
  last delivery date — always shown with sample size.

### Order & delivery tracking
- Per-order fulfilment timelines built only from evidenced stages (created →
  requirements → stock reserved → awaiting stock / risk → ready → dispatched →
  delivered), with plain-language delay explanations.

### Operator analytics (restricted)
- Language benchmarks, adversarial tests and system diagnostics live behind a
  "System Operator" role. Backend endpoints return **403** for unauthorized
  roles, and every access attempt is written to `system_audit_logs`.

### Integrations (planned)
- `/integrations` documents the connector architecture for Google Sheets,
  Excel/CSV, ERP, supplier APIs, logistics and accounting systems. No external
  integration is claimed as connected until implemented and authenticated.

---

## Quick Start (Local Development — No Docker)

### Prerequisites
- Python **3.14+** (venv at `backend/.venv`)
- Node.js **20+** & npm

### 1. Backend (`http://localhost:8000`)
```bash
cd backend
cp .env.example .env
# Set GEMINI_API_KEY=<your_key> in backend/.env (optional: GEMINI_MODEL)
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
OpenAPI docs: `http://localhost:8000/docs`

### 2. Frontend (`http://localhost:8080`)
```bash
cd frontend
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev
```
Open `http://localhost:8080` — the chatbot homepage loads immediately.

---

## Verification & Testing

```bash
# Backend
backend/.venv/Scripts/pytest.exe backend/tests -q

# Frontend
cd frontend
npx tsc --noEmit
npm test
npm run build
```

---

## Security Notes

- `GEMINI_API_KEY` lives only in `backend/.env` — never in `VITE_*` vars or Git.
- Role headers (`X-User-Role`) provide **demo-level** role switching
  (`INVENTORY_PLANNER`, `PROCUREMENT_MANAGER`, `OPERATIONS_MANAGER`, `ADMIN` via
  the "System Operator" demo role). They are client-controlled and are **not**
  production authentication; a real deployment must validate identity
  server-side (JWT/OIDC). All operator-area access is audit-logged.
- Consequential actions (purchase-order approval) require an authorized role
  and are recorded in `approval_records` + `system_audit_logs`.

## Documentation

- `API_CONTRACT.md` — endpoint reference
- `DATABASE_DESIGN.md` — schema and migrations
- `INVENTORY_BUSINESS_RULES.md` — deterministic inventory rules
- `TESTING_AND_EVALUATION.md` — test methodology
- `EVALUATION_REPORT.md` — measured benchmark results
- `audit/` — internal evaluation evidence and metrics
- `backend/README.md`, `frontend/README.md` — component guides
