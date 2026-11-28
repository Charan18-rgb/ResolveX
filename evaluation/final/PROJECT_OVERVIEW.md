# ResolveX — Project Overview

**RESURRECT 2026 Hackathon Submission**

ResolveX is a conversational business-operations platform. A chatbot-first
interface lets users ask questions in plain language about inventory, warehouse
storage, supplier reliability, order fulfilment and procurement — and gets back
verified answers rendered as interactive data cards. Its differentiator is a
serious natural-language-understanding layer: ambiguous instructions are
detected, multiple interpretations are generated, targeted clarification
questions are asked, and only then is a structured action produced.

---

## 1. Problem statement

### PS6 — Understanding unclear instructions

People do not type perfectly specified commands. Real instructions are full of
pronouns ("tell **him**"), relationships ("my classmate Charan"), missing
recipients, missing dates, spelling mistakes and context that only exists
because of earlier turns. A keyword-matching chatbot either guesses (and can
act on the wrong person or the wrong date) or asks a question for every single
request, which is unusable.

PS6 asks: *can a system understand what the user probably means, recognise
when it is not sure, ask only the questions that actually matter, and resolve
the intent across multiple turns?*

### PS2 — Business operations on real data

Once an instruction is understood, it must connect to real operational data:
how much stock is actually available after reservations, where it is stored,
which suppliers deliver on time, which orders are at risk, and what should be
reordered. Answers must be computed, not hallucinated.

ResolveX combines both: an NLU/ambiguity-resolution pipeline (PS6) feeding a
deterministic business-operations backend (PS2).

## 2. Solution overview

**Who uses it:** operations managers, warehouse staff, procurement teams and
anyone who needs answers about stock, storage, suppliers and orders without
learning a dashboard.

**Main features:**

- Chat-first homepage with persistent conversation history (rename, delete,
  mobile drawer, reopen with full message context).
- Deterministic business-question routing to typed response cards: inventory
  summary, shortages, warehouse map/capacity, material location, supplier
  performance/comparison, order risk, order timeline, expected deliveries,
  purchase orders.
- NLU pipeline for instruction-style requests: ambiguity detection,
  interpretation generation, clarification questions, multi-turn resolution,
  pronoun/relationship handling, confidence assessment and honest fallback.
- Communication drafting: email/SMS-style message drafts with recipient
  extraction, tone edits ("make it more formal"), content edits ("change
  tomorrow to Monday") and pronoun follow-ups — persisted per conversation.
- Gmail OAuth2 architecture for real sending — **currently NOT CONNECTED**;
  drafts work fully without credentials.
- Inventory intelligence: net availability, safety stock, shortage detection,
  deterministic allocation, order risk scoring, role-gated purchase-order
  approval.
- Interactive 3D warehouse visualisation with clickable bins and product
  search, plus a 2D fallback.

## 3. How a user interacts

1. Open the app — a chat homepage with suggestions and history sidebar.
2. Ask a business question → an inline verified-data card appears.
3. Give an ambiguous instruction → ResolveX explains what is unclear and asks
   targeted questions; answers resolve the intent over multiple turns.
4. Ask for a message → a draft card is produced; follow-ups edit it. Nothing
   is ever sent automatically.
5. History persists across refreshes; conversations reopen with their cards,
   drafts and clarification state intact.

## 4. Honest status summary

| Area | Status |
|---|---|
| NLU / ambiguity / clarification | Implemented, benchmarked, live-tested |
| Business ops cards + history | Implemented, browser-verified |
| Message drafts | Implemented, persisted, **not sent** (no provider) |
| Gmail sending | Architecture complete, **NOT CONNECTED** (no OAuth credentials) |
| Inventory / warehouse / suppliers / orders | Implemented on seeded demo data |
| Authentication | Demo-level `X-User-Role` header — not production auth |
