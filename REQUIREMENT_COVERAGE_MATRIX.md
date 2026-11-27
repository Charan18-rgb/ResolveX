# ResolveX — Requirement Coverage Matrix (PS6 + PS2)

| Official PS | Requirement | Backend Module | API Endpoint | Database Entity | Test Case | Status | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **PS6** | Ambiguity detection & classification | `core/ambiguity_detector.py` | `POST /api/analyze` | `conversations` | `test_ps6_engines.py` | Planned (M5) | Pending M5/M6 |
| **PS6** | Multiple interpretation generation | `core/interpretation_engine.py` | `POST /api/analyze` | `interpretations` | `test_ps6_engines.py` | Planned (M5) | Pending M5/M6 |
| **PS6** | Clarification & anti-repetition | `core/clarification_engine.py` | `POST /api/clarify` | `clarification_questions` | `test_ps6_engines.py` | Planned (M5) | Pending M5/M6 |
| **PS6** | Context preservation (multi-turn) | `core/context_analyzer.py` | `POST /api/clarify`, `GET /api/conversations` | `messages` | `test_ps6_integration.py` | Planned (M5) | Pending M5/M6 |
| **PS6** | Clear-instruction fast path | `core/ambiguity_detector.py` | `POST /api/analyze` | `resolved_intents` | `test_ps6_engines.py` | Planned (M5) | Pending M5/M6 |
| **PS6** | Structured intent resolution | `core/intent_resolver.py` | `POST /api/resolve` | `resolved_intents` | `test_ps6_engines.py` | Planned (M5) | Pending M5/M6 |
| **PS6** | 48-case evaluation & baseline | `evaluation/ps6_evaluator.py` | `GET /api/evaluation/ps6` | `evaluation_records` | `test_evaluation.py` | Planned (M6) | Pending M6 |
| **PS2** | Event ingestion & idempotency | `inventory/event_processor.py` | `POST /api/inventory/events` | `inventory_events` | `test_events.py` | Planned (M2) | Pending M2 |
| **PS2** | Malformed event quarantine & alert | `inventory/event_processor.py` | `POST /api/inventory/events`, `GET /api/alerts` | `inventory_events`, `inventory_alerts` | `test_events.py` | Planned (M2/M6) | Pending M2/M6 |
| **PS2** | Net availability (`on_hand + incoming - allocated`) | `inventory/availability_calculator.py` | `GET /api/inventory/overview` | `inventory_balances` | `test_inventory_engine.py` | Planned (M3) | Pending M3 |
| **PS2** | Documented allocation (Earliest CRD) | `inventory/allocation_engine.py` | `POST /api/inventory/allocations/recalculate` | `material_allocations` | `test_inventory_engine.py` | Planned (M3) | Pending M3 |
| **PS2** | CRD risk & projected ship dates | `inventory/order_risk_engine.py`, `ship_date_predictor.py` | `GET /api/orders/risks` | `orders` | `test_inventory_engine.py` | Planned (M3) | Pending M3 |
| **PS2** | Shortage detection & PO proposals | `inventory/shortage_detector.py`, `purchase_order_engine.py` | `GET /api/inventory/shortages`, `/api/purchase-orders/proposals` | `purchase_order_proposals` | `test_procurement.py` | Planned (M4) | Pending M4 |
| **PS2** | Human-in-the-loop PO approval gate | `services/approval_service.py` | `POST /api/purchase-orders/proposals/{id}/approve` | `approval_records`, `system_audit_logs` | `test_procurement.py` | Planned (M4) | Pending M4 |
| **PS2** | Role-based briefings & grounded AI | `services/briefing_service.py` | `GET /api/briefings` | `users`, `roles` | `test_briefings.py` | Planned (M5) | Pending M5 |
| **PS2** | PS2 scenario evaluation & baseline | `evaluation/ps2_evaluator.py` | `GET /api/evaluation/ps2` | `evaluation_records` | `test_evaluation.py` | Planned (M6) | Pending M6 |
| **PS6+PS2** | Shared NL task router | `core/task_router.py` | `POST /api/analyze` | `conversations`, `inventory_balances` | `test_task_router.py` | Planned (M5) | Pending M5 |
