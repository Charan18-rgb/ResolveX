# ResolveX Frontend

Interactive frontend for **ResolveX** — an AI-powered natural language ambiguity detection, interpretation mapping, clarification, and deterministic intent resolution platform.

> **Note:** This frontend currently runs in **client-side mock mode** using deterministic local state and clearly labelled **DEMO DATA** (no live AI, database, or backend requests are made). A centralized, FastAPI-ready API client is configured via `VITE_API_BASE_URL`.

## Tech Stack

- **React 19 + TypeScript + Vite**
- **Tailwind CSS v4** (`@tailwindcss/vite`)
- **React Router** (`react-router-dom`)
- **Framer Motion** (`framer-motion`)
- **Lucide React** (`lucide-react`)
- **Recharts** (`recharts`)

## Pages & Capabilities

- **Landing (`/`)**: Hero ("Not Everything You Say Is What You Mean."), interactive prompt workspace with validation and 3 clickable examples, 4 feature cards, and 4-step How It Works overview.
- **Workspace (`/workspace`)**: Domain/strictness configuration, prompt editor, and local session history.
- **Analysis (`/analysis`)**: KPI metrics, inline highlighted ambiguity spans, category breakdown, classifier confidence scores, and interactive Context Intelligence Graph.
- **Ambiguity Visualization (`/visualization`)**: Interactive Context Intelligence Graph (zoom, pan, node selection, entity/relation inspection, live updates from clarification & interpretation state), clickable token heatmap, semantic branch tree, and Recharts radar & severity/confidence charts.
- **Interpretations (`/interpretations`)**: Ranked candidate readings with probability bars, risk levels, implicit assumptions, and comparison table.
- **Clarification (`/clarification`)**: Smart Clarification Optimizer + live Resolution Verification Gate (ranks unresolved ambiguities by importance, explains why each question is selected and necessary, validates missing/ambiguous/contradictory fields, recalculates after every answer, tracks conversation history, and stops early when essential fields pass verification).
- **Final Resolution (`/resolution`)**: Final Verification Summary (completeness score, required vs. optional field checks, contradiction diagnostics), side-by-side before/after comparison, clarity gain, clarification optimization trace, applied decisions, and copy/export JSON intent specification.
- **Evaluation (`/evaluation`)**: Clearly labelled **DEMO DATA** benchmarks with Recharts precision/recall/F1, turn progression, and stage latency visualizations.
- **How It Works (`/how-it-works`)**: Interactive 4-stage pipeline walkthrough and FastAPI endpoint contract preview.
- **Settings (`/settings`)**: Configurable `VITE_API_BASE_URL`, integration mode toggle, detection thresholds, and local state management.

## Getting Started

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env` if you want to customize the future FastAPI base URL:

```bash
cp .env.example .env
```

```env
VITE_API_BASE_URL=http://localhost:8000
```

## Scripts

- `npm run dev` — Start Vite development server
- `npm run build` — Run TypeScript check (`tsc -b`) and build production bundle
- `npm run lint` — Run Oxlint checks
- `npm run preview` — Preview production build locally
