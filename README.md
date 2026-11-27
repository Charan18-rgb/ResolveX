# ResolveX — Understand the Unclear. Resolve the Intent.

**RESURRECT 2026 | Team: FULL STACK ATTACK** (Charan — Backend & Architecture, Aashwija — Frontend & UI/UX)

ResolveX is a unified full-stack AI platform that integrates **Problem Statement 6 (Natural Language Ambiguity Identification & Resolution)** and **Problem Statement 2 (Smart Inventory Intelligence)** into one coherent application.

---

## Core Capabilities

### PS6 — Natural Language Ambiguity Identification & Resolution
- Detects ambiguity (`referential`, `lexical`, `structural`, `semantic`, `contextual`, `underspecification`) and classifies instructions as `clear`, `ambiguous`, `incomplete`, or `context_dependent`.
- Generates multiple candidate interpretations and minimal targeted clarification questions.
- Preserves multi-turn conversation history (`POST /api/analyze` → `POST /api/clarify` → `POST /api/resolve`) in SQLite.
- Fast-paths clear instructions directly into structured JSON intents without unnecessary clarification.

### PS2 — Smart Inventory Intelligence (Unified Domain Routing)
- Natural-language inventory queries asked in the workspace or Shared AI Assistant automatically route from PS6 to deterministic PS2 inventory engines (`inventory_insight`).
- Deterministic Net Availability (`on_hand + incoming - allocated`), Earliest-CRD-First material allocation, CRD delay/block risk detection, and projected ship dates (`CALCULATED` / `ESTIMATED` / `UNAVAILABLE`).
- Idempotent event ingestion (`POST /api/inventory/events`) with duplicate suppression and malformed payload quarantine (`FEED_FAILURE` alerts).
- Human-in-the-Loop (HITL) Purchase Order proposal generation and role-gated approval/rejection (`PROCUREMENT_MANAGER` / `ADMIN`).
- Role-based, SQLite-grounded briefings enriched by Gemini (`GET /api/briefings`).

---

## Quick Start (Local Development — No Docker)

### Prerequisites
- Python **3.14+** (venv configured at `backend/.venv`)
- Node.js **20+** & npm

### 1. Backend Setup & Run (`http://localhost:8000`)
```bash
cd backend
cp .env.example .env
# Edit backend/.env and set GEMINI_API_KEY=<your_key> (optional: GEMINI_MODEL=gemini-3.8-flash)
.venv/Scripts/activate   # On macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
OpenAPI / Swagger documentation is available at `http://localhost:8000/docs`.

### 2. Frontend Setup & Run (`http://localhost:8080`)
```bash
cd frontend
cp .env.example .env
# Defaults to VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev
```
Open `http://localhost:8080` in your browser while the FastAPI backend is running on port `8000`.

---

## Verification & Testing

- **Backend tests (`pytest`):**
  ```bash
  .\backend\.venv\Scripts\pytest.exe backend\tests -v
  ```
- **Frontend checks (`tsc`, `vitest`, production build):**
  ```bash
  cd frontend
  npx tsc --noEmit
  npm test
  npm run build
  ```

---

## Security Notes
- `GEMINI_API_KEY` stays strictly in `backend/.env` (never exposed to `VITE_*` variables or committed to Git).
- `X-User-Role` and `X-User-Name` headers provide demo-level role switching (`INVENTORY_PLANNER`, `PROCUREMENT_MANAGER`, `OPERATIONS_MANAGER`), not production authentication.
