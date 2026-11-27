# ResolveX — Frontend Integration Guide (For Aashwija & Full-Stack Team)

**Backend Base URL:** Configured via `VITE_API_BASE_URL` in `frontend/.env` (default `http://localhost:8000`)  
**Frontend Dev URL:** `http://localhost:8080` (TanStack Start / Vite)  
**Swagger / OpenAPI Docs:** `http://localhost:8000/docs`  
**CORS:** Configured in `backend/app/config.py` for `http://localhost:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:8080`, `http://127.0.0.1:8080`.

## 1. Centralized API Client
All frontend-to-backend communication is centralized in `frontend/src/services/api.ts` using TypeScript types in `frontend/src/types/resolvex.ts` and environment config in `frontend/src/config/env.ts`.

## 2. Demo Role Header (PS2 Authorization)
For PS2 role-gated endpoints (`/api/briefings`, `/api/purchase-orders/proposals/*/approve|reject`), pass:
- `X-User-Role`: `ADMIN` | `INVENTORY_PLANNER` | `PROCUREMENT_MANAGER` | `OPERATIONS_MANAGER`
  - Approval endpoints (`/approve` and `/reject`) default to `"VIEWER"` if omitted and strictly require `PROCUREMENT_MANAGER` or `ADMIN` (returning `403 FORBIDDEN` otherwise).
- `X-User-Name`: e.g., `"Demo (Procurement Manager)"` (recorded in `approval_records` and `system_audit_logs`).

## 3. Connected Frontend Routes -> Backend Endpoints

1. **PS6 NL Studio & Pipeline (`/`, `/workspace`, `/analysis`, `/clarification`, `/resolution`):**
   - `POST /api/analyze` → returns `conversation_id`, `status`, `classification`, `ambiguity_types`, `interpretations`, `clarification_questions`, `resolved_intent`, and optional `inventory_insight` (when routed to PS2).
   - `POST /api/clarify` → submit user reply preserving `conversation_id`.
   - `POST /api/resolve` → fetch/confirm persisted resolved intent.
   - `GET /api/conversations` & `GET /api/conversations?conversation_id=<id>` → sidebar session history & thread detail.
2. **PS2 Inventory & CRD Risk Hub (`/inventory`):**
   - `GET /api/inventory/overview` & `/api/inventory/materials` → Net availability (`on_hand + incoming - allocated`) per material.
   - `GET /api/orders/risks` → Open orders with `ON_TRACK` / `AT_RISK` / `DELAYED` / `BLOCKED`, missing materials, and `projected_ship_date` (`CALCULATED` / `ESTIMATED` / `UNAVAILABLE`).
   - `POST /api/inventory/events` → Ingest live/simulated inventory or order events (including duplicate/malformed demo buttons).
   - `POST /api/inventory/allocations/recalculate` → Re-run Earliest-CRD-First allocation.
   - `GET /api/inventory/shortages` → Active material shortages & unmet demand.
   - `GET /api/purchase-orders/proposals` & `POST /api/purchase-orders/proposals` → Generate/list `PENDING_APPROVAL`, `APPROVED`, `REJECTED` proposals.
   - `POST /api/purchase-orders/proposals/{id}/approve` & `/reject` → Mandatory HITL gate.
   - `GET /api/alerts` & `POST /api/alerts/{id}/acknowledge` → `STOCK_OUT`, `LOW_STOCK`, `FEED_FAILURE` alerts.
   - `GET /api/briefings?role=...` → Role-based, SQLite-grounded AI-enriched briefing.
3. **Unified Shared AI Assistant (`SharedAIAssistant.tsx`):**
   - Connects directly to `POST /api/analyze` & `POST /api/clarify`, rendering candidate interpretations and PS2 `inventory_insight` cards inline.
4. **Unified Evaluation (`/evaluation`) & Settings (`/settings`):**
   - `GET /api/evaluation/ps2?run_now=true` & `GET /api/evaluation/ps6` (`?run_now=true` triggers 48-case run).
   - `GET /health` → Verifies backend reachability, SQLite DB connection, and Gemini AI configuration.

## 4. Standard Unified Error Envelope
All FastAPI validation (`422`), HTTP (`400`/`403`/`404`/`409`), and internal (`500`) errors return:
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Role 'INVENTORY_PLANNER' is not authorized to approve or reject purchase orders.",
    "details": null
  }
}
```
