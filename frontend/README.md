# ResolveX Unified Frontend (`frontend/`)

Unified React + TanStack Start + TypeScript + Tailwind CSS v4 frontend merging **PS6: Natural Language Ambiguity Resolution** and **PS2: Smart Inventory Intelligence** into one coherent application.

> **Important Scope Note**: This package runs **100% client-side with structured demo/mock engines** and clearly labeled `DEMO DATA`. No backend server, database, or live external AI API is executed here, while all service contracts remain ready for a future FastAPI backend via `VITE_API_BASE_URL`.

## Unified Capabilities

- **Unified Application Shell**: Collapsible navigation sidebar, top bar with global search, notification center, active PS2 demo persona switcher (`Inventory Planner`, `Procurement Manager`, `Operations Manager`), and a **Shared AI Assistant** answering both PS6 disambiguation and PS2 inventory/CRD risk queries.
- **3D Interactive Hero (`/`)**: Mouse-reactive neural disambiguation sphere (`IntelligenceSphere3D`), quick prompt examples, PS6/PS2 domain cards, and pipeline walkthrough.
- **Multilingual NLU Workspace (`/workspace`)**: Supports **Auto Detect**, **English**, **Kannada**, **Hindi**, **Hinglish**, and **Kanglish** while preserving the user's original script alongside normalized interpretations and an animated **4-Stage Analysis Sequence** (`Ambiguity Detection` → `Inventory & Risk Impact` → `Decision Simulation` → `Verification Check`).
- **Smart Inventory Intelligence (`/inventory`)**: Material inventory levels, net shortage projections, **Customer Requested Date (CRD)** at-risk orders, AI replenishment recommendations, one-click Draft POs, and role-aware approval workflows (`DEMO DATA`).
- **Context Intelligence Graph (`/visualization`)**: Interactive zoom/pan semantic graph connecting actions, actors, SKUs, dates, and ambiguous references with live inspector details synced to clarification and What-If scenarios.
- **What-If Interpretation Simulator (`/interpretations`)**: Side-by-side comparison of plausible execution interpretations, consequence previews, dimension diffs, and handoff to clarification.
- **Smart Clarification Optimizer (`/clarification`)**: Information-gain priority queue explaining _why_ each question was selected, custom & quick-select answers, early-stop detection, and live re-verification.
- **Verification Layer & Structured Output (`/resolution`)**: Field-level verification checks (required vs. optional), completeness score gating, before/after comparison, and `.json` contract export.
- **Unified Evaluation (`/evaluation`)**: Recharts visualizations for both PS6 NLU precision/recall/clarity progression and PS2 stock health / warehouse utilization (`DEMO DATA`).
- **Architecture & Settings (`/how-it-works`, `/settings`)**: Interactive methodology walkthrough, FastAPI endpoint contract preview (`/health`, `/api/v1/analyze`, `/api/v1/resolve`, `/api/v1/evaluation`), and configurable `VITE_API_BASE_URL`.

## Getting Started

```bash
cd frontend
npm install
npm run dev
```

### Verification Commands

```bash
npm run build   # Production TanStack Start + Vite bundle
npx tsc --noEmit # Strict TypeScript type-check
npm run lint    # ESLint + Prettier check
npm test        # Vitest route & smoke tests
```

## Environment Configuration

Copy `.env.example` to `.env` if you want to customize the future FastAPI base URL:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_NAME=ResolveX
```
