# ResolveX — REST API Contract

**Base URL (Local Development):** `http://localhost:8000`  
**Interactive Docs (Swagger UI):** `http://localhost:8000/docs`  
**OpenAPI Spec:** `http://localhost:8000/openapi.json`  
**Content-Type:** `application/json`

---

## 1. Global Conventions & Error Format

### Standard Error Response
All `4xx` and `5xx` responses follow a single predictable structure:

```json
{
  "error": {
    "code": "CONVERSATION_NOT_FOUND",
    "message": "Conversation with ID 'abc-123' was not found.",
    "details": null
  }
}
```

| HTTP Status | `error.code` | When Returned |
| :--- | :--- | :--- |
| `400` | `INVALID_STATE` | Trying to clarify an already `RESOLVED` conversation, or resolve an incomplete one. |
| `404` | `CONVERSATION_NOT_FOUND` | Unknown `conversation_id`. |
| `422` | `VALIDATION_ERROR` | Missing required fields, empty string, or input exceeding `2000` characters. |
| `502` | `AI_SERVICE_ERROR` | Gemini API returned an invalid/unparseable response. |
| `503` | `AI_SERVICE_UNAVAILABLE` | Gemini API timeout, rate limit, or network failure. |
| `500` | `INTERNAL_SERVER_ERROR` | Unexpected unhandled error (stack trace never exposed). |

### CORS Requirements
Backend enables `CORSMiddleware` for local frontend ports (`http://localhost:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`) configured via `ALLOWED_ORIGINS` in `.env`.

---

## 2. Endpoints

### 1. `GET /health`
- **Purpose:** Verify the backend service and database are running.
- **Request:** None.
- **Response (`200 OK`):**
  ```json
  {
    "status": "ok",
    "service": "ResolveX Backend",
    "database": "connected",
    "ai_configured": true
  }
  ```

---

### 2. `POST /api/analyze`
- **Purpose:** Accepts a new natural-language instruction, creates a conversation, detects ambiguity, and either returns clarification questions or resolves immediately if clear.
- **Request Schema:**
  - `instruction` (`string`, **required**): `min_length=1`, `max_length=2000` (non-whitespace).
  - `context` (`string | null`, **optional**): Optional caller-supplied background context (`max_length=2000`).
- **Example Request (Ambiguous):**
  ```json
  {
    "instruction": "Send the report to Rahul."
  }
  ```
- **Example Response (`200 OK` — Needs Clarification):**
  ```json
  {
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "NEEDS_CLARIFICATION",
    "classification": "ambiguous",
    "ambiguity_types": ["referential"],
    "needs_clarification": true,
    "interpretations": [
      {
        "label": "Specific Recipient",
        "description": "There may be multiple contacts named Rahul; the specific recipient is unidentified."
      }
    ],
    "missing_required_info": ["recipient_full_name_or_email", "which_report"],
    "clarification_questions": [
      "Which Rahul should receive the report (e.g., full name or email)?",
      "Which report would you like to send?"
    ],
    "resolved_intent": null,
    "turn_count": 1
  }
  ```
- **Example Response (`200 OK` — Clear Instruction):**
  ```json
  {
    "conversation_id": "770e8400-e29b-41d4-a716-446655440001",
    "status": "RESOLVED",
    "classification": "clear",
    "ambiguity_types": [],
    "needs_clarification": false,
    "interpretations": [],
    "missing_required_info": [],
    "clarification_questions": [],
    "resolved_intent": {
      "action": "unit_conversion",
      "parameters": {
        "value": 100,
        "from_unit": "kilometres",
        "to_unit": "metres"
      },
      "resolved_instruction": "Convert 100 kilometres to metres.",
      "direct_answer": "100 kilometres is equal to 100,000 metres."
    },
    "turn_count": 1
  }
  ```

---

### 3. `POST /api/clarify`
- **Purpose:** Accepts the user's answer to clarification questions, updates conversation context, and either asks a follow-up question (if still incomplete) or resolves the intent.
- **Request Schema:**
  - `conversation_id` (`string`, **required**): Valid UUID of an existing conversation in `NEEDS_CLARIFICATION` state.
  - `response` (`string`, **required**): User's clarification answer (`min_length=1`, `max_length=2000`).
- **Example Request:**
  ```json
  {
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
    "response": "Send the Q3 Sales Report to Rahul Sharma (rahul.sharma@company.com)."
  }
  ```
- **Example Response (`200 OK` — Resolved):**
  ```json
  {
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "RESOLVED",
    "classification": "clear",
    "ambiguity_types": [],
    "needs_clarification": false,
    "interpretations": [],
    "missing_required_info": [],
    "clarification_questions": [],
    "resolved_intent": {
      "action": "send_document",
      "parameters": {
        "document": "Q3 Sales Report",
        "recipient_name": "Rahul Sharma",
        "recipient_email": "rahul.sharma@company.com"
      },
      "resolved_instruction": "Send the Q3 Sales Report to Rahul Sharma (rahul.sharma@company.com).",
      "direct_answer": null
    },
    "turn_count": 2
  }
  ```
- **Possible Errors:** `404 CONVERSATION_NOT_FOUND`, `400 INVALID_STATE` (if already resolved), `422 VALIDATION_ERROR`.

---

### 4. `POST /api/resolve`
- **Purpose:** Explicitly retrieves or finalizes the structured resolved intent for a conversation when sufficient information is available (useful for frontend step-confirmation or re-fetching final intent).
- **Request Schema:**
  - `conversation_id` (`string`, **required**): Valid UUID.
- **Example Request:**
  ```json
  {
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Example Response (`200 OK`):**
  ```json
  {
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "RESOLVED",
    "original_instruction": "Send the report to Rahul.",
    "resolved_intent": {
      "action": "send_document",
      "parameters": {
        "document": "Q3 Sales Report",
        "recipient_name": "Rahul Sharma",
        "recipient_email": "rahul.sharma@company.com"
      },
      "resolved_instruction": "Send the Q3 Sales Report to Rahul Sharma (rahul.sharma@company.com).",
      "direct_answer": null
    }
  }
  ```
- **Possible Errors:** `404 CONVERSATION_NOT_FOUND`, `400 INVALID_STATE` (if conversation still `NEEDS_CLARIFICATION`).

---

### 5. `GET /api/conversations`
- **Purpose:** Retrieves conversation summaries or a specific conversation's full message history.
- **Query Parameters (Optional):**
  - `conversation_id` (`string`, optional): If provided, returns full message history for that conversation.
  - `limit` (`integer`, optional, default `20`, `1..100`): Pagination limit when listing conversations.
  - `offset` (`integer`, optional, default `0`, `>=0`): Pagination offset.
- **Note for Frontend:** Using `?conversation_id=<uuid>` keeps the exact `/api/conversations` route from the spec while supporting both list view and thread detail view without extra routes.
- **Example Response (`200 OK` — List Mode):**
  ```json
  {
    "conversations": [
      {
        "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
        "original_instruction": "Send the report to Rahul.",
        "status": "RESOLVED",
        "classification": "ambiguous",
        "turn_count": 2,
        "created_at": "2026-11-27T11:00:00Z",
        "updated_at": "2026-11-27T11:01:15Z"
      }
    ],
    "total": 1
  }
  ```
- **Example Response (`200 OK` — Detail Mode with `?conversation_id=...`):**
  ```json
  {
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "RESOLVED",
    "messages": [
      {
        "role": "user",
        "content": "Send the report to Rahul.",
        "created_at": "2026-11-27T11:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Which Rahul should receive the report (e.g., full name or email)?",
        "created_at": "2026-11-27T11:00:02Z"
      },
      {
        "role": "user",
        "content": "Send the Q3 Sales Report to Rahul Sharma (rahul.sharma@company.com).",
        "created_at": "2026-11-27T11:01:14Z"
      }
    ],
    "resolved_intent": {
      "action": "send_document",
      "parameters": {
        "document": "Q3 Sales Report",
        "recipient_name": "Rahul Sharma",
        "recipient_email": "rahul.sharma@company.com"
      },
      "resolved_instruction": "Send the Q3 Sales Report to Rahul Sharma (rahul.sharma@company.com).",
      "direct_answer": null
    }
  }
  ```

---

### 6. `GET /api/evaluation`
- **Purpose:** Returns the latest stored system evaluation metrics from actual test/benchmark runs.
- **Query Parameters:** None.
- **Example Response (`200 OK`):**
  ```json
  {
    "available": true,
    "latest_run": {
      "run_id": "eval-20261127-01",
      "dataset_size": 48,
      "model_name": "gemini-3.8-flash",
      "precision": 0.0,
      "recall": 0.0,
      "f1_score": 0.0,
      "resolution_accuracy": 0.0,
      "false_clarification_rate": 0.0,
      "created_at": "2026-11-27T12:00:00Z"
    }
  }
  ```
  *(Note: When no evaluation run has been executed yet, `available` is `false` and `latest_run` is `null` — no synthetic numbers are ever returned.)*

---

## 3. Frontend Integration Flow

1. User enters instruction -> Frontend calls `POST /api/analyze`.
2. Store returned `conversation_id` in client state.
3. Check `status`:
   - If `"NEEDS_CLARIFICATION"`: Display `interpretations` (optional) and `clarification_questions`. Collect user reply and call `POST /api/clarify` with `conversation_id`. Repeat until `status === "RESOLVED"`.
   - If `"RESOLVED"`: Render `resolved_intent` (`action`, `parameters`, `resolved_instruction`, and `direct_answer` if non-null).
4. Load sidebar history via `GET /api/conversations` and thread details via `GET /api/conversations?conversation_id=<id>`.
