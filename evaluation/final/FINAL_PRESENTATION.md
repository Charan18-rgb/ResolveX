# ResolveX — Final Presentation Guide

**One-line pitch:** *ResolveX understands unclear business instructions —
it asks only what it must, resolves intent across turns, and answers with
verified operational data instead of guesses.*

## The 30-second version

People give messy instructions: "email my classmate about the deadline",
"tell him Friday doesn't work", "change tomorrow to Monday". Normal chatbots
either guess dangerously or interrogate endlessly. ResolveX sits between:
a Gemini-powered NLU layer detects what's actually ambiguous, asks targeted
questions, resolves pronouns and relationships across turns — then hands off
to a deterministic engine that computes real inventory, warehouse, supplier
and order answers as interactive cards.

## Why it matters

- **Trust:** the system refuses to act on guesses — drafts are never sent,
  consequential actions need authorized roles, low-confidence analyses
  abstain.
- **Continuity:** conversations, cards, drafts and clarification state all
  persist; refresh and reopen loses nothing.
- **Proof:** a 72-case labelled benchmark shows F1 0.9412 vs 0.4348 naive
  baseline — with honest fallback accounting.

## The 2-minute architecture story

Chat message → `/api/ops/query` tries deterministic business routing first
(fast, verified cards). If nothing matches, the PS6 pipeline runs:
Gemini interprets → ambiguity detector classifies → clarification engine
asks minimal questions → context memory carries pronouns forward → intent
resolver produces a structured action → risk engine gates execution →
everything persists to SQLite → the UI renders cards, drafts and states.

LLM interprets *language*; Python/SQL owns *facts*. That boundary is the
whole design.

## What to show (see LIVE_DEMO_SCRIPT.md)

1. Business card (`How much stock do I have?`)
2. Ambiguity → clarification (`Email my classmate about the deadline.`)
3. Multi-turn pronoun resolution (`Charan` → `Tell him…`)
4. Draft + edits (`Message Ravi…` → `Make it more formal` → `Change Friday to Monday`)
5. Order risk + warehouse cards
6. Refresh → reopen → cards and drafts restored
7. Safety footer + honest "not sent" states

## Anticipated hard questions — short answers

- **"Is the AI accurate?"** — 0.9412 F1 on our labelled 72-case set vs
  0.4348 baseline; 0.8056 classification accuracy; we report it honestly,
  including fallback cases.
- **"Does it send emails?"** — No. Gmail OAuth is implemented but not
  connected; everything is an explicit draft.
- **"Is auth real?"** — Demo-level role header; production would need
  JWT/OIDC. We say so.
- **"Is the data real?"** — Seeded demo data driving real calculations.
- **"Why not pure LLM?"** — Facts must be exact; the LLM only understands
  language. Hybrid is the point.

## Leave-behind documents

`evaluation/final/` — overview, architecture, PS6/PS2 explanations, demo
script, 35 judge Q&As, contributions, limitations, and this guide (PDF).
`audit/` — full technical audit trail and verified metrics.
