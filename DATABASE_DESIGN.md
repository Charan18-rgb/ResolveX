# ResolveX — SQLite Database Design

**Database Engine:** SQLite 3 (`3.50.4`)  
**Database File:** `BACKEND/resolvex.db` (gitignored)  
**Pragmas on Connection:**
- `PRAGMA foreign_keys = ON;` (enforces referential integrity)
- `PRAGMA journal_mode = WAL;` (allows concurrent reads while writing)

---

## 1. Entity Evaluation & Normalization

All 6 proposed entities are justified, with clear separation of concerns and **zero duplicate text storage**:
1. `conversations`: Tracks lifecycle state (`ANALYZING`, `NEEDS_CLARIFICATION`, `RESOLVED`, `FAILED`), classification, and turn count.
2. `messages`: Stores the chronological turn-by-turn transcript (`user` / `assistant`) — avoids duplicating `original_instruction` as both a message and a separate column if we query turn 1, though keeping `title_preview` or `original_instruction` on `conversations` (1:1) makes `GET /api/conversations` list queries fast without joining `messages`.
3. `clarification_questions`: Tracks individual questions asked per turn and whether each has been answered, enabling the Clarification Engine's **anti-repetition check**.
4. `interpretations`: Stores candidate interpretations identified during analysis for auditability and UI display.
5. `resolved_intents`: Stores the final structured JSON intent (1:1 with `conversations`).
6. `evaluation_records`: Stores actual benchmark run metrics for `GET /api/evaluation`.

---

## 2. Table Definitions

### 1. `conversations`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` | UUIDv4 string |
| `original_instruction` | `TEXT` | `NOT NULL` | Initial user instruction (for fast list display) |
| `initial_context` | `TEXT` | `NULL` | Optional caller-supplied `context` from `POST /api/analyze` |
| `status` | `TEXT` | `NOT NULL` | `ANALYZING`, `NEEDS_CLARIFICATION`, `RESOLVED`, `FAILED` |
| `classification` | `TEXT` | `NULL` | `clear`, `ambiguous`, `incomplete`, `context_dependent` |
| `turn_count` | `INTEGER` | `NOT NULL DEFAULT 1` | Number of user/system cycles |
| `created_at` | `TEXT` | `NOT NULL` | ISO-8601 UTC timestamp |
| `updated_at` | `TEXT` | `NOT NULL` | ISO-8601 UTC timestamp |

### 2. `messages`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Row ID |
| `conversation_id` | `TEXT` | `NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE` | Parent conversation |
| `role` | `TEXT` | `NOT NULL` | `user` or `assistant` |
| `content` | `TEXT` | `NOT NULL` | Message text |
| `turn_number` | `INTEGER` | `NOT NULL` | Turn index (`1, 2, ...`) |
| `created_at` | `TEXT` | `NOT NULL` | ISO-8601 UTC timestamp |

### 3. `clarification_questions`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Row ID |
| `conversation_id` | `TEXT` | `NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE` | Parent conversation |
| `question_text` | `TEXT` | `NOT NULL` | Exact question asked |
| `normalized_text` | `TEXT` | `NOT NULL` | Lowercased/stripped text for anti-repetition matching |
| `turn_number` | `INTEGER` | `NOT NULL` | Turn in which it was asked |
| `answered` | `INTEGER` | `NOT NULL DEFAULT 0` | Boolean (`0` = pending, `1` = answered) |
| `created_at` | `TEXT` | `NOT NULL` | ISO-8601 UTC timestamp |

### 4. `interpretations`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Row ID |
| `conversation_id` | `TEXT` | `NOT NULL, FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE` | Parent conversation |
| `turn_number` | `INTEGER` | `NOT NULL` | Turn in which generated |
| `label` | `TEXT` | `NOT NULL` | Short interpretation title |
| `description` | `TEXT` | `NOT NULL` | Plain-English explanation |
| `created_at` | `TEXT` | `NOT NULL` | ISO-8601 UTC timestamp |

### 5. `resolved_intents`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Row ID |
| `conversation_id` | `TEXT` | `NOT NULL UNIQUE, FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE` | 1:1 with conversation |
| `action` | `TEXT` | `NOT NULL` | Normalized action identifier |
| `parameters_json` | `TEXT` | `NOT NULL` | JSON-serialized key-value parameters |
| `resolved_instruction` | `TEXT` | `NOT NULL` | Final unambiguous instruction |
| `direct_answer` | `TEXT` | `NULL` | Direct answer for clear informational/conversion tasks |
| `created_at` | `TEXT` | `NOT NULL` | ISO-8601 UTC timestamp |

### 6. `evaluation_records`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Row ID |
| `run_id` | `TEXT` | `NOT NULL UNIQUE` | Benchmark run identifier |
| `model_name` | `TEXT` | `NOT NULL` | Gemini model used |
| `dataset_size` | `INTEGER` | `NOT NULL` | Number of evaluated examples |
| `precision` | `REAL` | `NOT NULL` | Ambiguity detection precision |
| `recall` | `REAL` | `NOT NULL` | Ambiguity detection recall |
| `f1_score` | `REAL` | `NOT NULL` | Ambiguity detection F1 |
| `resolution_accuracy` | `REAL` | `NOT NULL` | End-to-end resolution accuracy |
| `false_clarification_rate` | `REAL` | `NOT NULL` | Clear inputs wrongly clarified |
| `created_at` | `TEXT` | `NOT NULL` | ISO-8601 UTC timestamp |

---

## 3. Relationships & Indexes

### Relationships
- `conversations` **1 : N** `messages`
- `conversations` **1 : N** `clarification_questions`
- `conversations` **1 : N** `interpretations`
- `conversations` **1 : 1** `resolved_intents`
- `evaluation_records` (standalone benchmark log)

### Indexes
- `idx_conversations_updated_at ON conversations(updated_at DESC)` — fast pagination for `GET /api/conversations`.
- `idx_messages_conv_turn ON messages(conversation_id, turn_number, id)` — fast chronological history reconstruction.
- `idx_clarifications_conv_norm ON clarification_questions(conversation_id, normalized_text)` — fast duplicate-question lookup.
- `idx_interpretations_conv_turn ON interpretations(conversation_id, turn_number)` — fast lookup per turn.

---

## 4. Conversation History & State Strategy

1. **On `POST /api/analyze`:**
   - Generate `conversation_id` (UUIDv4).
   - Insert `conversations` row (`status='ANALYZING'`), insert initial `messages` row (`role='user'`, `turn_number=1`).
   - Run analysis; if clear, insert `resolved_intents` and update `conversations.status='RESOLVED'`. If ambiguous/incomplete, insert `interpretations`, `clarification_questions`, assistant `messages` row, and update `conversations.status='NEEDS_CLARIFICATION'`.
2. **On `POST /api/clarify`:**
   - Fetch `conversations` row; verify `status == 'NEEDS_CLARIFICATION'`.
   - Fetch ordered `messages` and prior `clarification_questions` for `conversation_id`.
   - Increment `turn_count`, save user reply in `messages`, mark prior questions `answered=1`, and pass full context to Gemini.
   - If resolved, persist `resolved_intents` and set `status='RESOLVED'`. If still incomplete and `turn_count >= MAX_CLARIFICATION_TURNS`, set `status='FAILED'` (never fabricate a resolved intent); otherwise persist new non-duplicate questions.
