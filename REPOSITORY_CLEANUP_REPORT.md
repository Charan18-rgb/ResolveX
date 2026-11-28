# Repository Cleanup Report

Date: final hardening pass. Starting commit: `dbea9f5`.

## Files removed

| File | Reason |
|---|---|
| `frontend/src/components/hero/IntelligenceSphere3D.tsx` (+ empty `hero/` dir) | Dead code — zero imports anywhere in `src/`; not referenced by routes, tests, config or docs. Verified via repo-wide import scan. |
| `resolvex.db` (repo root, 0 bytes) | Stray empty file; the live DB is `backend/resolvex.db` (gitignored). |
| `backend_run.log`, `frontend_run.log` | Stale dev-server logs; already gitignored, deleted from disk. |
| `.pytest_cache/`, `backend/.pytest_cache/`, `frontend/.pytest_cache/` | Regenerable test caches. |

## Files changed

| File | Change |
|---|---|
| `backend/requirements.txt` | Was a UTF-16 `pip freeze` dump (47 transitive pins, wrong encoding for pip). Rewritten as clean **UTF-8** (verified `b'# Resolv'` — no BOM) **direct dependencies only**: fastapi, uvicorn, pydantic, pydantic-settings, google-genai, tenacity, pytest, httpx (for `fastapi.testclient`). All versions match the installed venv. |

## Post-cleanup verification results

- **Fresh-env install:** `python -m venv` + `pip install -r requirements.txt` → all 8 direct deps + transitives resolved cleanly on Python 3.14 (no version conflicts).
- **Fresh-env tests:** `DATABASE_PATH=<temp>` pytest in the new venv → **72/72 passed**; existing `.venv` untouched.
- **Working-env regression:** pytest **72/72**, Vitest **32/32**, `tsc --noEmit` clean, `npm run build` pass.
- **Live DB:** `backend/resolvex.db` intact — 78 conversations, 200 messages, 1 draft, 2 card_json payloads; `schema_migrations` shows v1–v4 applied; no data reset.
- **Deleted-file check:** zero remaining references to `IntelligenceSphere3D`/`components/hero` (grep across `src`, configs, routeTree).
- **Docs:** all 9 markdown files + PDF present and readable; secret scan of new files clean.
- **Git diff:** only `requirements.txt` (encoding+minimal rewrite), deleted dead component, new `evaluation/` + this report. `.env` files gitignored, never staged.
- **Package managers:** `package-lock.json` (npm v3, complete, react 19.3.1) is the authoritative lockfile for local dev — **recommended: `npm install` / `npm run dev|build`**. `bun.lock` (Lovable scaffold, JSONC) retained for Lovable sync; neither deleted.

## Dead code removed

- `IntelligenceSphere3D.tsx` component (unused 3D hero visual).

## Dependencies removed

None from `package.json`. Rationale: the ~30 `@radix-ui/*` packages map to the
`components/ui/` shadcn kit — several ui primitives are currently unused, but
they are a standard design-system registry and Lovable-managed; removing them
risks breaking future regeneration for negligible gain. `bun.lock` +
`package-lock.json` both retained (dual package-manager history).

## Files intentionally retained despite appearing unused

- **`frontend/src/components/ui/*` (46 shadcn primitives)** — standard
  component library; many unused today but part of the design system and
  Lovable-managed.
- **`src/data/mockData.ts`, `inventoryMockData.ts`, engine modules** — power
  the non-live fallback mode in `ResolveXContext`.
- **`backend/tests/`** — all suites active (72 tests).
- **`audit/` (reports, `eval_runs/`, `screenshots/`, PDFs)** — evaluation
  evidence required for judging.
- **`evaluation/`** — deliverable docs (this package).
- **`backend/.env.example`, `frontend/.env.example`** — templates, no secrets.
- **`AGENTS.md`, `README.md` files** — project documentation.
- **`backend/resolvex.db`** — live dev database (gitignored, contains seeded
  demo data + conversation history; not deleted — user data).

## Verification performed

- Import/reference scan of every frontend source file (only
  `IntelligenceSphere3D` unreferenced).
- Backend module usage check — every `app/` module is imported by routes,
  services or tests.
- `requirements.txt` rewritten from actual imports + installed versions.
- Post-cleanup regression: backend pytest, frontend Vitest, `tsc --noEmit`,
  production build, API startup, DB migration check — results below.

## Notes / uncertainties

- Deeper function-level dead-code analysis (unused exports inside used
  files) was not performed exhaustively — file-level audit only, per the
  "don't sacrifice working functionality" priority.
- `evaluation/final/` added as new deliverables (not cleanup).
