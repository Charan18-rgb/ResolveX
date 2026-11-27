# ResolveX — Inventory Business Rules (PS2)

1. **Net Availability Formula:**
   $$\text{Net Availability} = \text{On-Hand} + \text{Incoming} - \text{Allocated}$$
   - Negative `on_hand`, `incoming`, or `allocated` quantities are rejected unless an explicit `STOCK_ADJUSTED` audit event documents a shrinkage/correction.
2. **Bill of Materials (BOM):**
   - Each product maps to explicit raw materials and `quantity_per_unit`.
   - Total order material requirement = `order_quantity * quantity_per_unit`.
3. **Allocation Rule (Earliest CRD First):**
   - Orders are sorted by: `(customer_request_date ASC, created_at ASC, order_id ASC)`.
   - Stock is allocated from `on_hand - already_allocated` (physical available) first, and incoming supply is tracked separately for projected ship date estimation.
   - Partial allocation is supported and recorded per `(order_id, material_id)` in `material_allocations`.
4. **CRD Risk Categories:**
   - `ON_TRACK`: Required materials 100% allocated or available before CRD.
   - `AT_RISK`: Physical stock short, but incoming supply + lead time can meet or narrowly miss CRD.
   - `DELAYED`: Projected ship date > CRD due to supplier lead time.
   - `BLOCKED`: Insufficient stock and no incoming supply / missing lead-time data (`projected_ship_date` marked `UNAVAILABLE` with explicit reason—never fabricated).
5. **Event Idempotency & Fault Tolerance:**
   - Every event carries a unique `event_id`. Re-submitting the same `event_id` returns status `DUPLICATE` with zero inventory mutation.
   - Malformed events are quarantined in `inventory_events` (`status='MALFORMED'`) and immediately generate a `FEED_FAILURE` alert.
6. **Human-in-the-Loop Procurement Guardrail:**
   - Shortage detection creates `PENDING_APPROVAL` records in `purchase_order_proposals`.
   - No `APPROVED` PO or supplier email draft is finalized until `POST /api/purchase-orders/proposals/{id}/approve` is called by `PROCUREMENT_MANAGER` or `ADMIN`.
