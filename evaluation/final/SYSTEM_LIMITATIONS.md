# ResolveX — System Limitations (honest register)

## External dependencies / blocked

1. **Gmail is NOT CONNECTED.** OAuth2 architecture, status endpoint and
   confirmed-send path exist, but `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GMAIL_SENDER` and `GMAIL_REFRESH_TOKEN` are unset. Verified
   `/api/email/status → configured:false`. **No email is ever claimed sent.**
   Drafts work fully without credentials.
2. **No other providers** (calls, WhatsApp, SMS) — drafts only; no fake
   connected states exist.
3. **Gemini dependency** — NLU quality/latency depends on `gemini-3.8-flash`
   quota; deterministic fallback covers outages but with lower nuance.

## Authentication & security

4. **Demo-level auth** — `X-User-Role` header is client-controlled. Operator
   gating and audit logs exist, but this is **not production authentication**.
   Production needs JWT/OIDC + server-side verification.
5. Single-tenant SQLite; no multi-user concurrency hardening, no rate
   limiting.

## Data

6. **Seeded demo data** — inventory, suppliers, orders, warehouses are
   synthetic (`seed.py`, `seed_ops.py`). Internally consistent, exercises
   real calculations, but **not verified real-world data**.

## NLU quality

7. Live Gemini variance on borderline labels (observed across eval runs);
   classification accuracy 0.8056 — good but not perfect. No official PS6 /
   LightLab dataset exists; our 72-case set is custom-labelled.
8. Clarification re-asks can occur within `MAX_CLARIFICATION_TURNS=3` on
   some ambiguous inputs before resolving.
9. Unsupported requests are refused/clarified rather than executed — by
   design, but means out-of-scope asks get "I can't do that" style answers.

## Persistence gaps (minor)

10. Draft history shows only the **latest** draft per conversation; earlier
    draft card turns render as text.
11. Ops `help` cards are intentionally not persisted (NLU owns those turns).
12. Brand-new chat session state (pre-first-message) is client-side only.

## Evaluation hygiene

13. ~76 dev/test conversations remain in the local DB (benchmark probes,
    adversarial inputs) — retained deliberately as uncertain; a fresh deploy
    starts clean.
14. `bun.lock` + `package-lock.json` both present (Lovable/npm duality) —
    retained intentionally.
