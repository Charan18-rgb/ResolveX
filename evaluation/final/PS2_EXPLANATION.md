# PS2 — Inventory & Business Operations Intelligence

PS2 is the operational half of ResolveX: verified, computed answers about
inventory, warehouses, suppliers, orders and procurement — rendered as
interactive cards inside the same conversation.

## Core calculations (all deterministic SQL/Python, never LLM-guessed)

### Availability
`app/inventory/availability_calculator.py`

```
available = on_hand + incoming − allocated
```

- `on_hand` — physical stock (`inventory_balances`)
- `incoming` — pending `supplier_deliveries`
- `allocated` — reserved against orders (`material_allocations`)

Inventory events (`inventory_events`) feed balances through
`event_processor.py` so every number is traceable.

### Shortages
`app/inventory/shortage_detector.py` — flags materials below reorder point
or fully out of stock; `sync_inventory_alerts` writes `inventory_alerts`.
Example output: "N material(s) are below their reorder threshold or fully
out of stock."

### Allocation
`app/inventory/allocation_engine.py` — deterministic earliest-required-date
first allocation of stock to orders; `recalculate_allocations` keeps
reservations consistent. This is why "available after reservations" differs
from raw stock.

### Order risk
`app/inventory/order_risk_engine.py` — per open order computes risk category,
projected ship date and explanation from allocation coverage, pending
material shortages and delivery ETAs. Example: "2 of 3 open orders have
delivery risk."

### Warehouse
`app/ops/warehouse_service.py` — zones/racks/shelves/bins with capacity,
stored, reserved and incoming quantities; `get_warehouse_overview` for
capacity cards; `get_material_location` resolves SKU → bins.
Frontend: `WarehouseScene3D.tsx` (React Three Fiber) with clickable bins,
product search, 2D fallback.

### Suppliers
`app/ops/supplier_service.py` — per-supplier on-time rate, late/failed/
cancelled counts, average delay from `supplier_deliveries`;
`compare_suppliers` for side-by-side cards.

### Purchase orders
`app/inventory/purchase_order_engine.py` — generates POs for shortages;
`app/services/approval_service.py` enforces role-gated approval
(`PROCUREMENT_MANAGER`/`ADMIN` via `X-User-Role` — demo-level header auth).

## How questions reach these engines

`/api/ops/query` (`app/api/ops_routes.py::_ops_query_impl`) routes keywords
deterministically — e.g. "how much stock" → `inventory_summary`,
"running low" → `shortages`, "where is MAT-…" → `material_location`,
"orders delayed" → `order_risks`, "supplier" → `suppliers`. Each returns a
typed card (`card_type` + `data`) that `OpsCardView.tsx` renders.

Every turn is persisted: the conversation stores the user question, the
assistant summary **and the full card JSON** (`messages.card_json`), so
reopening a conversation restores the interactive card — read-only, with no
recomputation or re-execution of business actions.

## Data provenance — honest note

All inventory, supplier, order and warehouse figures come from **seeded
demo data** (`app/inventory/seed.py`, `app/ops/seed_ops.py`) in SQLite. They
are internally consistent and exercise the real calculation paths, but they
are **not verified real-world business data**.
