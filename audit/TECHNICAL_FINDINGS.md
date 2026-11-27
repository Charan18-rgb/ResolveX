# ResolveX — Technical Audit Findings & Defect Register (Final)

**Audit Date:** 2026-11-27  
**Scope:** Full-stack inspection of `backend/` (FastAPI + SQLite + Gemini) and `frontend/` (React + TanStack Router + Vite), live API verification, 8 mandatory demonstration scenarios, and Playwright visual audit across 17 desktop & mobile captures.

---

## Defect Register & Resolution Status

| ID | Severity | Component | Location | Problem | Status & Fix Applied |
|---|---|---|---|---|---|
| **AUD-01** | **High** | Explainability / UI | `frontend/src/components/resolvex/ExplainabilityLedger.tsx`, `analysis.tsx`, `resolution.tsx` | Missing Systematic Explainability & Evidence Ledger separating Verified Facts, AI Interpretations, Estimates/Assumptions, Recommendations, Completed vs. Pending Actions, and Data Sources. | **FIXED** — Created `ExplainabilityLedger.tsx` and mounted on `/analysis` and `/resolution`. |
| **AUD-02** | **High** | AI Attribution / UI | `frontend/src/routes/resolution.tsx` | Deterministic DB/unit answers labeled `"Direct Answer (Gemini Live)"`. | **FIXED** — Dynamic source attribution (`Inventory Database`, `Deterministic Unit Converter`, `System Guardrail`, `AI + Context`). |
| **AUD-03** | **High** | Backend Role Routing | `backend/app/api/alerts_routes.py` | Default `?role=INVENTORY_PLANNER` masked `X-User-Role` header. | **FIXED** — Made `role` optional (`Query(default=None)`); verified by `test_briefing_respects_x_user_role_header`. |
| **AUD-04** | **Medium** | Frontend UX / Mock Text | `frontend/src/components/resolvex/MultilingualContextBanner.tsx` | Stale `"Mock client-side language detection..."` note shown in Live mode. | **FIXED** — Displays live backend status when connected. |
| **AUD-05** | **Medium** | Inventory UX | `frontend/src/routes/inventory.tsx` | Raw `**` and `*` Markdown characters rendered in Role Briefing. | **FIXED** — Parsed into clean bullet items and bold-free text. |
| **AUD-06** | **Medium** | Frontend Jargon | `analysis.tsx`, `inventory.tsx` | Technical jargon (`Backend Status`, `Conv ID`, `X-USER-ROLE HEADER`, `deterministic_sqlite`). | **FIXED** — Replaced with plain user-facing labels. |
| **AUD-07** | **Medium** | Backend Validation | `backend/app/api/alerts_routes.py` | `acknowledge_alert` returned `200` on non-existent alert IDs. | **FIXED** — Raises HTTP `404` when `rowcount == 0`; verified by `test_acknowledge_missing_alert_returns_404`. |
| **AUD-08** | **Medium** | Resolution Runtime | `frontend/src/routes/resolution.tsx` | 1 SSR hydration `pageerror` from `Date.now()`/`toISOString()` in `jsonPayload`. | **FIXED** — Stabilized `checkedAt` until client mount; verified `pageErrors=0` in Playwright. |
| **AUD-09** | **Low** | Backend OpenAPI | `backend/app/api/*.py` | Internal OpenAPI tags/docstrings reference `PS2`/`PS6` (not shown in user UI). | **DEFERRED** — Internal API metadata only; zero user-facing exposure. |
