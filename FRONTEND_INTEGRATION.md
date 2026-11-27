# ResolveX — Frontend Integration Guide (For Aashwija)

**Base URL:** `http://localhost:8000`  
**Swagger / OpenAPI Docs:** `http://localhost:8000/docs`  
**CORS:** Configured for `http://localhost:3000`, `http://localhost:5173`, `http://127.0.0.1:5173` (no wildcard with credentials).

## 1. Demo Role Header (PS2 Authorization)
For PS2 role-gated endpoints (`/api/briefings`, `/api/purchase-orders/proposals/*/approve|reject`), pass:
- `X-User-Role`: `ADMIN` | `INVENTORY_PLANNER` | `PROCUREMENT_MANAGER` | `OPERATIONS_MANAGER` (defaults to `ADMIN` only in explicit demo mode if omitted on read-only endpoints; approval endpoints require `PROCUREMENT_MANAGER` or `ADMIN`).
- `X-User-Name`: e.g. `"Charan"` or `"Aashwija"` (recorded in `approval_records` and `system_audit_logs`).

## 2. Primary Frontend Views -> Backend Endpoints

1. **PS6 NL Analyzer & Clarification Flow:**
   - `POST /api/analyze` -> returns `conversation_id`, `status`, `interpretations`, `clarification_questions`, `resolved_intent`, and optional `inventory_insight` (when routed to PS2).
   - `POST /api/clarify` -> submit user's reply with `conversation_id`.
   - `POST /api/resolve` -> fetch/confirm final resolved intent.
   - `GET /api/conversations` & `GET /api/conversations?conversation_id=<id>` -> sidebar history & thread detail.
2. **PS2 Inventory & CRD Risk Dashboard:**
   - `GET /api/inventory/overview` -> KPIs + net availability (`on_hand + incoming - allocated`) per material.
   - `GET /api/orders/risks` -> Orders with `ON_TRACK` / `AT_RISK` / `DELAYED` / `BLOCKED`, missing materials, and `projected_ship_date`.
   - `POST /api/inventory/events` -> Ingest live/simulated inventory or order events (including duplicate/malformed demo buttons).
   - `POST /api/inventory/allocations/recalculate` -> Re-run Earliest-CRD-First allocation.
3. **PS2 Procurement & Human-in-the-Loop Approval Queue:**
   - `GET /api/inventory/shortages` -> Current/upcoming shortages.
   - `GET /api/purchase-orders/proposals` -> List `PENDING_APPROVAL`, `APPROVED`, `REJECTED` proposals.
   - `POST /api/purchase-orders/proposals/{proposal_id}/approve` (requires `X-User-Role: PROCUREMENT_MANAGER` or `ADMIN`).
   - `POST /api/purchase-orders/proposals/{proposal_id}/reject`.
4. **Alerts, Briefings & Evaluation:**
   - `GET /api/alerts` -> Early stock-out, CRD risk, and feed-failure alerts.
   - `GET /api/briefings?role=INVENTORY_PLANNER` -> Role-based, data-grounded briefing.
   - `GET /api/evaluation/ps6` & `GET /api/evaluation/ps2` -> Measured evaluation metrics & baseline comparisons.

## 3. Standard Error Format
```json
{
  "error": {
    "code": "CONVERSATION_NOT_FOUND",
    "message": "Human-readable message",
    "details": null
  }
}
```
