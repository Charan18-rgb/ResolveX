# ResolveX — Live Demonstration Script (≈6 minutes)

**Setup:** backend running (`uvicorn app.main:app` on :8000), frontend dev
server on :8080, Gemini configured. Gmail is NOT connected — do not demo
sending.

---

### 1. Opening (0:00–0:30)
- **Action:** Open `http://localhost:8080`. Show the chat homepage, history
  sidebar, suggestion chips.
- **Say:** "ResolveX is a conversational business-operations assistant. You
  ask in plain language; it answers with verified data — and when a request
  is genuinely unclear, it asks before acting."
- **Shows:** chatbot-first UX, live-data badge.

### 2. Normal business question (0:30–1:00)
- **Enter:** `How much stock do I have?`
- **Expect:** `inventory_summary` card — totals, low-stock and out-of-stock
  counts computed from SQLite.
- **Say:** "Every number here is computed by deterministic SQL — the AI never
  invents inventory figures."
- **Shows:** PS2 verified-data cards.

### 3. Ambiguous instruction → clarification (1:00–2:00)
- **Enter:** `Email my classmate about the deadline.`
- **Expect:** `NEEDS_CLARIFICATION` — asks *which classmate* and *what
  message*.
- **Say:** "It recognised a communication intent but refused to guess the
  recipient or the content. It asks only the questions that remove real
  uncertainty."
- **Shows:** ambiguity detection + targeted clarification.

### 4. Multi-turn resolution (2:00–2:45)
- **Enter:** `Charan`
- **Expect:** follow-up question(s); then enter `Tell him the deadline is
  Friday.`
- **Expect:** `RESOLVED` — recipient Charan, pronoun "him" resolved from
  context.
- **Say:** "Pronouns and relationships are resolved against conversation
  memory — this is the multi-turn context PS6 is about."
- **Shows:** context preservation, pronoun resolution.

### 5. Communication draft + edits (2:45–3:45)
- **Enter:** `Message Ravi that the shipment arrives Friday.`
- **Expect:** `message_draft` card — recipient Ravi, `DRAFT_ONLY` status,
  explicit "has NOT been sent" note.
- **Enter:** `Make it more formal.` → draft re-renders in formal tone.
- **Enter:** `Change Friday to Monday.` → body text updated.
- **Say:** "Drafts persist per conversation, survive refresh, and are never
  sent automatically. Gmail OAuth is implemented but not connected — sending
  requires explicit confirmation and a configured provider."
- **Shows:** comms NLU, draft persistence, honest provider status.

### 6. Inventory + warehouse card (3:45–4:30)
- **Enter:** `Which orders might be delayed?` → `order_risks` card.
- **Enter:** `How much warehouse space is remaining?` → capacity card.
- **Say:** "Order risk uses allocation coverage, shortages and delivery ETAs;
  warehouse capacity comes from configured bins."
- **Shows:** PS2 depth.

### 7. Refresh & history restore (4:30–5:15)
- **Action:** Refresh the browser (F5). Open History → reopen the
  conversation from step 5.
- **Expect:** messages reload **with the interactive draft card and the
  order-risk card** restored — no re-execution, no duplicates.
- **Say:** "Conversations, cards, drafts and clarification state are all
  persisted server-side. Reopening is read-only — nothing re-runs."
- **Shows:** persistence architecture.

### 8. Safety explanation (5:15–6:00)
- Point at the composer footer: consequential actions require an authorized
  role; drafts are never sent; low-confidence analyses abstain; fallback
  results are labelled, not passed off as live AI.
- **Close:** "ResolveX understands the unclear, resolves intent across turns,
  and only acts on verified data — with honesty about what it cannot do."

## Judge-friendly variants
- Swap step 3 for `Cancel and also ship order ORD-1001` (compound/unsupported).
- Swap step 6 for `Where did we keep the titanium bolts?` (material location).
- Mobile: resize to phone width → History drawer still works.
